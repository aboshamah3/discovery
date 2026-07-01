---
description: "Task list for Backend API Contracts (Spec 005)"
---

# Tasks: Backend API Contracts

**Input**: Design documents from `/specs/005-backend-api-contracts/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: REQUIRED (FR-013, SC-007). Pure `lib/api` logic (error envelope, param validation, DTO mapping, pagination, health aggregation) is written test-first (RED → GREEN). Each route handler is covered by a test that mocks its `lib/server` adapter, so the whole gate runs with no Postgres/Typesense. Live wiring is verified via the quickstart.

**Organization**: Grouped by user story (US1 health, US2 search, US3 detail) after a shared foundational error-envelope phase. Each story is an independently testable increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- Paths are repo-root relative.

---

## Phase 1: Setup

- [ ] T001 Add dependencies to `apps/web/package.json`: `@ds/db` (`workspace:*`), `@ds/search` (`workspace:*`), `zod` (^3, matching `packages/shared`). Keep the existing `typecheck` script; the root vitest `apps/**` glob already discovers these tests.
- [ ] T002 Run `pnpm install`; confirm `@ds/db`/`@ds/search`/`zod` resolve and the workspace links with no errors.

**Checkpoint**: deps installed; `apps/web` can import the packages.

---

## Phase 2: Foundational — consistent error envelope (pure)

**Purpose**: The single error shape every endpoint returns. **⚠️ Before US1–US3.**

### Tests FIRST ⚠️

- [ ] T003 Write `apps/web/src/lib/api/errors.test.ts` (FR-010): `jsonError(status, code, message)` returns a `Response` with the given status, `application/json`, and body `{ error: { code, message } }`; the `ApiErrorCode` union covers `bad_request`/`not_found`/`internal`/`unavailable`. Run `pnpm test` → FAIL.

### Implementation

- [ ] T004 Implement `apps/web/src/lib/api/errors.ts`: the `ApiErrorCode`/`ApiError` types and `jsonError(status, code, message)` (per data-model.md §5). Run `pnpm test` → GREEN.

**Checkpoint**: every later handler has one error helper.

---

## Phase 3: User Story 1 - Real health probes (Priority: P1)

**Goal**: `GET /api/health` reports true DB + search reachability (200 all-up, 503 any-down).

### Tests FIRST ⚠️

- [ ] T005 [US1] Write `apps/web/src/lib/api/health.test.ts` (SC-001): `checkHealth({database,search})` → both true ⇒ `{ body:{ok:true,services:{database:"ok",search:"ok"}}, status:200 }`; search false ⇒ `ok:false, services.search:"down", status:503`; database false ⇒ symmetric; both false ⇒ 503. Run `pnpm test` → FAIL.

### Implementation

- [ ] T006 [US1] Implement `apps/web/src/lib/api/health.ts`: pure `checkHealth(probes)` returning `{ body: HealthStatus, status }` (`ok = database && search`, `200`/`503`). Run `pnpm test` → GREEN.
- [ ] T007 [US1] Add probes to the server adapters: `pingDatabase()` in `apps/web/src/lib/server/products.ts` (`await query("SELECT 1")` → `true`; catch → `false`) and `pingSearch()` in `apps/web/src/lib/server/search.ts` (`await getSearchClient().health.retrieve()` → `true`; catch → `false`). Engine-coupled; no unit test (quickstart §1).
- [ ] T008 [US1] Rewrite `apps/web/src/app/api/health/route.ts`: `GET` runs both probes in parallel, calls `checkHealth`, returns `Response.json(body, { status })`.
- [ ] T009 [US1] Rewrite `apps/web/src/app/api/health/route.test.ts`: `vi.mock('@/lib/server/products')` + `vi.mock('@/lib/server/search')`; both-up ⇒ 200 & `ok:true`; search down ⇒ 503 & `services.search:"down"`. Replaces the Spec 001 static test. Run `pnpm test` → GREEN.

**Checkpoint**: health endpoint truthful and covered without engines.

---

## Phase 4: User Story 2 - Search over HTTP (Priority: P1)

**Goal**: `GET /api/search` validates params, queries via the Spec 004 builder, returns the documented `SearchResponse`.

### Tests FIRST ⚠️

- [ ] T010 [P] [US2] Write `apps/web/src/lib/api/search-request.test.ts` (SC-004): `parseSearchParams(URLSearchParams)` → valid `q/page/perPage/sort/brand/category/tag/inStock` map to `SearchInput` (+ `filters`); absent filters ⇒ no `filters` keys; `page=abc`/`perPage=x`/`inStock=maybe` ⇒ failure result. Run `pnpm test` → FAIL.
- [ ] T011 [P] [US2] Write `apps/web/src/lib/api/dto.test.ts` (SC-002/006) — search parts: `toProductCardDto(doc)` maps a full `ProductSearchDocument` (incl. `releasedAtTimestamp` → ISO `releasedAt`), omits absent optionals, keeps `tags`/`reviews`/`inStock`; `buildSearchResponse(input, rawResult)` computes `totalPages = ceil(found/perPage)`, `hasMore = page<totalPages`, echoes `query` (empty when blank), maps `facet_counts` → `facets` (omitted when none), and every result is DTO-shaped (no `sourceHash`). Run `pnpm test` → FAIL.

### Implementation

- [ ] T012 [US2] Implement `apps/web/src/lib/api/search-request.ts`: Zod schema + `parseSearchParams` (coerce `page`/`perPage` to int, `inStock` enum `true|false`→boolean, trim `q`, collect filters) returning a discriminated success/error result. Run T010 → GREEN.
- [ ] T013 [US2] Implement the search DTO logic in `apps/web/src/lib/api/dto.ts`: `toProductCardDto` + `buildSearchResponse` + `FacetValue`/`SearchResponse` types (per data-model.md §2a/§3). Run T011 → GREEN.
- [ ] T014 [US2] Implement `searchProducts(input)` in `apps/web/src/lib/server/search.ts`: `buildSearchParams(input)` → `getSearchClient().collections<ProductSearchDocument>(collectionName()).documents().search(params)`; return the raw result (found, hits, facet_counts). Engine-coupled (quickstart §2).
- [ ] T015 [US2] Implement `apps/web/src/app/api/search/route.ts`: parse params → on failure `jsonError(400,"bad_request",…)` (backend untouched); else `searchProducts` in a try/catch → `buildSearchResponse` → `Response.json`; catch ⇒ `jsonError(500,"internal",…)`.
- [ ] T016 [US2] Write `apps/web/src/app/api/search/route.test.ts`: `vi.mock('@/lib/server/search')`; valid request ⇒ 200 with `SearchResponse` + `searchProducts` called with parsed input; `page=abc` ⇒ 400 and `searchProducts` NOT called; adapter throws ⇒ 500 `internal`. Run `pnpm test` → GREEN.

**Checkpoint**: search endpoint validated, mapped, and covered without a live engine.

---

## Phase 5: User Story 3 - Product detail (Priority: P2)

**Goal**: `GET /api/products/[id]` returns the detail DTO from Postgres or a 404.

### Tests FIRST ⚠️

- [ ] T017 [US3] Extend `apps/web/src/lib/api/dto.test.ts` (SC-005/006): `toProductDetail(row)` maps a `products` row (snake_case → camelCase, `released_at` Date → ISO, null → omitted) into `ProductCardDTO & { description? }`; internal columns (`source_hash`/`imported_at`/`created_at`/`updated_at`) never appear. Run `pnpm test` → FAIL.

### Implementation

- [ ] T018 [US3] Implement `toProductDetail` + `ProductDetailRow`/`ProductDetailResponse` types in `apps/web/src/lib/api/dto.ts` (per data-model.md §2b/§4). Run T017 → GREEN.
- [ ] T019 [US3] Implement `findProductById(id)` in `apps/web/src/lib/server/products.ts`: parameterized `SELECT` of the DTO columns (`price::double precision`) from `products WHERE id=$1`; return the typed row or `null`. Engine-coupled (quickstart §3).
- [ ] T020 [US3] Implement `apps/web/src/app/api/products/[id]/route.ts`: Next 15 async `params`; validate non-empty id (else 400); `findProductById` in try/catch → `null` ⇒ `jsonError(404,"not_found",…)`, else `{ product: toProductDetail(row) }`; catch ⇒ `jsonError(500,"internal",…)`.
- [ ] T021 [US3] Write `apps/web/src/app/api/products/[id]/route.test.ts`: `vi.mock('@/lib/server/products')`; existing id ⇒ 200 with `{ product }` DTO; missing id ⇒ 404 `not_found`; blank id ⇒ 400; adapter throws ⇒ 500. Run `pnpm test` → GREEN.

**Checkpoint**: detail endpoint reads Postgres, 404s cleanly, covered without a DB.

---

## Phase 6: Polish & Cross-Cutting

- [ ] T022 [P] Update root `README.md`: document the three endpoints (`/api/health` now real, `/api/search`, `/api/products/:id`), the error envelope, and that the admin search key stays server-side. Note the prerequisite (migrate + import + reindex) for live search/detail.
- [ ] T023 Run the full quality gate: `pnpm lint`, `pnpm typecheck`, `pnpm test` — all green. Optionally run quickstart §1–§4 live against local Postgres + Typesense (SC-001…SC-006, SC-008).

---

## Dependencies & Execution Order

- **Setup (T001–T002)** → everything.
- **Error envelope (T003–T004)** → every route handler (T008/T015/T020).
- **US1 (T005–T009)**, **US2 (T010–T016)**, **US3 (T017–T021)** are independent stories; within each, tests precede implementation. `dto.ts` is shared by US2 (search parts) and US3 (detail parts) — extend, don't rewrite.
- **Polish (T022–T023)** last.

### Story independence

- **US1** (health) needs only the probes + `checkHealth`. **US2** (search) needs param validation + search DTO + the search adapter. **US3** (detail) needs the detail DTO + the DB adapter. Each is independently testable with its adapter mocked.

## Implementation Strategy

- **MVP** = Setup + error envelope + **US1** (real health) + **US2** (search) → the endpoints the UI is built around, truthfully reporting readiness and serving search.
- **Then**: **US3** (product detail) completes the read surface.
- **Finish**: Polish (README + green gate; optional live quickstart).
