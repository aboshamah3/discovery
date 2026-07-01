# Implementation Plan: Backend API Contracts

**Branch**: `005-backend-api-contracts` | **Date**: 2026-07-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-backend-api-contracts/spec.md`

## Summary

Expose the three read endpoints the future UI (Spec 007) depends on, wiring the existing `@ds/db` and `@ds/search` packages behind Next.js App Router route handlers with contract-first, Zod-validated boundaries and a single consistent error envelope:

- **`GET /api/health`** — replace the foundation's static body with real reachability probes: a `SELECT 1` against Postgres and a Typesense `health.retrieve()`. Same stable shape (`{ ok, services: { database, search } }`); `200` when both are up, `503` when any is down.
- **`GET /api/search`** — parse/validate query params (`q, page, perPage, sort, brand, category, tag, inStock`) with Zod, hand a `SearchInput` to the Spec 004 `buildSearchParams`, run it against Typesense, and map the engine result to the documented `SearchResponse` (`query, page, perPage, found, totalPages, hasMore, results: ProductCardDTO[], facets?`).
- **`GET /api/products/[id]`** — validate the id, read one row from Postgres, and return `{ product: ProductDetailResponse }` or a `404` not-found error.

Mirroring Specs 003/004, all engine/DB coupling is isolated behind thin `lib/server/*` adapters, and the value-producing logic — param validation, DTO mapping, pagination math, error construction, health aggregation — is **pure and dependency-injected** in `lib/api/*`, so it is fully unit-tested and each route handler is tested with its adapter mocked. `pnpm test` stays green with no Postgres or Typesense running. No product frontend beyond the existing placeholder (Spec 007).

## Technical Context

**Language/Version**: TypeScript 5.x (strict) on Node.js 20 LTS; Next.js 15 App Router route handlers.

**Primary Dependencies**: `next` (route handlers + `Response.json`); `zod` (boundary validation); `@ds/search` (`buildSearchParams`, `getSearchClient`, `collectionName`, `ProductSearchDocument`, `SearchInput`); `@ds/db` (`query`) for product detail + DB ping; `@ds/shared` (`HealthStatus`). No ORM (constitution v1.1.0).

**Storage**: Read-only over both stores — PostgreSQL 16 (source of truth, product detail + DB ping) and Typesense 27 (derived index, search + search ping). This spec writes to neither.

**Testing**: Vitest 2.x — pure unit tests for `lib/api/*` (validation, DTO, pagination, errors, health aggregation); route-handler tests with `vi.mock` stubbing the `lib/server/*` adapters (no live engines). Live end-to-end verified via the quickstart.

**Target Platform**: Linux/macOS dev workstation with Docker + pnpm; the same handlers run on Railway (Spec 006).

**Project Type**: Web-application monorepo — work lands in `apps/web` (route handlers + `src/lib`); the `@ds/db`/`@ds/search`/`@ds/shared` packages are consumed unchanged.

**Performance Goals**: Not a latency-tuning spec, but search must respond quickly against local Typesense (the builder already caps `per_page` at 60). Health probes are cheap (`SELECT 1`, `health.retrieve`).

**Constraints**: Contract-first, Zod at every untrusted boundary (IV; FR-009). Admin search key stays server-side; no secret in any response (V; FR-011). Postgres is the source of truth for detail (II; FR-007). No auth, no write endpoints, no import endpoint, no product UI (I/V; FR-014).

**Scale/Scope**: 3 route handlers, ~4 pure `lib/api` modules + ~2 `lib/server` adapters, ~7 test files. `apps/web/package.json` gains `@ds/db`, `@ds/search`, `zod`. No new env vars (all present from Spec 001).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluated against `.specify/memory/constitution.md` **v1.1.0**:

| Principle | Compliance in this plan |
|---|---|
| I. Spec-driven, frontend-last | ✅ Backend read endpoints only; the placeholder page is untouched. No search UI / grid / filters. Independently testable increment. |
| II. PostgreSQL is source of truth; search is rebuildable | ✅ Product detail reads from Postgres; search reads the derived index; neither is written. No search-only authoritative data introduced. |
| III. Idempotent, script-first pipelines | ✅ N/A for read endpoints (no data pipeline added); import stays script-only (§7.4 endpoint explicitly out of scope). |
| IV. Contract-first, validated boundaries | ✅ Every endpoint has a documented contract (`contracts/api.contract.md`); all query/path input validated with Zod before use; DTOs typed end-to-end; response shapes follow §7. |
| V. Secrets & scope discipline | ✅ Admin Typesense key read server-side via `getSearchClient`, never in a response; no secret/connection string leaked (error envelope hides internals); no auth/cart/admin/import scope added (YAGNI). |
| VI. Non-negotiable quality gates | ✅ Pure `lib/api` logic + mocked route handlers fully covered by vitest (`apps/**` glob already configured); `pnpm -r typecheck` covers `apps/web`; lint/typecheck/test green before done. |
| Tech Constraints (v1.1.0) | ✅ Next.js App Router, Zod validation, `@ds/db` direct client (no ORM), Typesense via `@ds/search`, Vitest. |

**Result**: PASS. No violations; Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/005-backend-api-contracts/
├── plan.md              # This file (/speckit.plan output)
├── spec.md              # Feature specification (/speckit.specify output)
├── research.md          # Phase 0 — decisions & rationale
├── data-model.md        # Phase 1 — API entities: DTO shapes, param → SearchInput, field mappings
├── quickstart.md        # Phase 1 — run migrate → import → reindex → curl each endpoint
├── contracts/
│   └── api.contract.md  # HTTP contracts: /api/health, /api/search, /api/products/[id], error format
├── checklists/
│   └── requirements.md  # Spec quality checklist (/speckit.specify output)
└── tasks.md             # Phase 2 (/speckit.tasks output)
```

### Source Code (repository root)

```text
apps/web/
└── src/
    ├── app/
    │   ├── page.tsx                        # existing placeholder (UNCHANGED)
    │   └── api/
    │       ├── health/
    │       │   ├── route.ts                # GET — real DB + search probes (REWRITE)
    │       │   └── route.test.ts           # route test, probes mocked (REWRITE)
    │       ├── search/
    │       │   ├── route.ts                # GET — validate → search → DTO (NEW)
    │       │   └── route.test.ts           # route test, searchProducts mocked (NEW)
    │       └── products/
    │           └── [id]/
    │               ├── route.ts            # GET — validate → find → DTO / 404 (NEW)
    │               └── route.test.ts       # route test, findProductById mocked (NEW)
    └── lib/
        ├── api/                            # PURE, engine-independent, unit-tested
        │   ├── errors.ts                   # ApiError code/shape + jsonError() helper
        │   ├── errors.test.ts
        │   ├── search-request.ts           # Zod schema; parseSearchParams(URLSearchParams) → SearchInput
        │   ├── search-request.test.ts
        │   ├── dto.ts                       # toProductCardDto, buildSearchResponse (pagination+facets), toProductDetail
        │   ├── dto.test.ts
        │   ├── health.ts                    # checkHealth(probes) → { body: HealthStatus, status: 200|503 }
        │   └── health.test.ts
        └── server/                          # THIN engine/DB adapters (verified via quickstart)
            ├── search.ts                    # searchProducts(input) via Typesense; pingSearch()
            └── products.ts                  # findProductById(id) via @ds/db; pingDatabase()

apps/web/package.json                        # + @ds/db, @ds/search, zod deps
```

**Structure Decision**: The route handlers stay thin — parse/validate, call an adapter, map to a DTO, return. All decision-making logic lives in pure `lib/api/*` modules that take plain inputs (a `URLSearchParams`, a raw engine result, a pair of probe results) and return plain outputs, so they are unit-tested with zero I/O. The `lib/server/*` adapters are the *only* code that touches Typesense or Postgres; route tests mock them with `vi.mock`, keeping the whole gate runnable without Docker (constitution VI). This mirrors the injected-seam approach proven in Specs 003/004.

## Complexity Tracking

No constitution violations; no entries required. Splitting pure `lib/api` logic from `lib/server` adapters is the simpler path, not added complexity: it is what lets the API contracts be exhaustively tested under the existing `pnpm test`/`typecheck` gates without standing up Postgres + Typesense, exactly as the reindex seam did in Spec 004.

## Phase Outputs

- **Phase 0 — Research**: [research.md](./research.md) — status-code policy (200/400/404/500/503); reuse of the Spec 004 builder vs. re-parsing; pure-logic + mocked-handler test seam; facet mapping; release-timestamp → ISO string; Next.js 15 async `params`; error-envelope shape.
- **Phase 1 — Design & Contracts**:
  - [data-model.md](./data-model.md) — param → `SearchInput`, `ProductCardDTO`/`SearchResponse`/`ProductDetailResponse`/`ApiError` shapes, and field-by-field mappings from `ProductSearchDocument` and the `products` row.
  - [contracts/api.contract.md](./contracts/api.contract.md) — request/response/status for all three endpoints + the error format.
  - [quickstart.md](./quickstart.md) — migrate → import → reindex → run → curl each endpoint, mapped to SC-001…SC-008.

## Post-Design Constitution Re-Check

Re-evaluated after Phase 1: still **PASS**. The design keeps Postgres the source of truth for detail, reads the derived index for search, validates every boundary with Zod, hides internals behind a consistent error envelope, keeps the admin key server-side, and adds no write path, no import endpoint, and no product UI. No new complexity to justify.
