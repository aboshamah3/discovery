---
description: "Task list for Typesense Search Foundation (Spec 004)"
---

# Tasks: Typesense Search Foundation

**Input**: Design documents from `/specs/004-search-foundation/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: REQUIRED for the pure logic (FR-014, SC-008). The document mapper and query builder are written test-first (RED → GREEN); the reindex loop is covered by fixture tests against fakes. Engine-dependent steps (ensure, live reindex, smoke) are verified via the quickstart.

**Organization**: Tasks grouped by user story (US1 collection, US2 reindex, US3 query). The pure functions underpin US1–US3; the reindex orchestration delivers US2.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- Paths are repo-root relative.

---

## Phase 1: Setup

- [x] T001 Add dependencies to `packages/search/package.json` (`@ds/search`): `typesense` (^3), `@ds/db` (workspace:*), `@ds/shared` (workspace:*), `dotenv`; devDep `@types/node`; add a `test` script (`vitest run`) alongside the existing `typecheck`. Keep `tsconfig.json` (extends base, includes `src`).
- [x] T002 Add root scripts to `package.json`: `"reindex:products": "tsx scripts/reindex-products.ts"` and `"smoke:search": "tsx scripts/smoke-search.ts"`. (`scripts/` is already typecheck-covered by root `tsconfig.json`.)
- [x] T003 Run `pnpm install`; confirm `typesense` resolves and the workspace links with no errors.

**Checkpoint**: deps installed; commands resolve to (not-yet-written) launchers.

---

## Phase 2: Foundational (pure types + functions)

**Purpose**: The engine-independent core every story uses. **⚠️ Before US1–US3 wiring.**

- [x] T004 Define `ProductRow` + `ProductSearchDocument` types and the pure `toSearchDocument(row)` in `packages/search/src/document.ts` (per data-model.md: id/title passthrough; omit absent optionals; `reviews` null→0; `releasedAtTimestamp = Math.floor(released_at.getTime()/1000)` or omit).
- [x] T005 Define `SearchInput` + the pure `buildSearchParams(input)` in `packages/search/src/query.ts` (per data-model.md §6.4: q→`*` when blank; fixed query_by/weights/typos/ranking; `per_page` default 24 clamp [1,60]; `page` ≥1; `filter_by` composed from filters with backtick-quoted values, omitted when none).

**Checkpoint**: pure functions compile and are ready to test.

---

## Phase 3: User Story 3 - Search query builder (Priority: P1)

**Goal**: Correct, well-formed search requests for any query/filter/page input.

### Tests FIRST (must FAIL before T005 is complete) ⚠️

- [x] T006 [US3] Write `packages/search/src/query.test.ts` (SC-006): non-empty query → expected `query_by`/weights/`prefix`/`num_typos`/`sort_by`; blank/missing q → `q==="*"`; `perPage` absent→24, `0`→1, `999`→60; `page` `0`→1, `3`→3; each filter (brand/category/tag/inStock) → exact `filter_by` clause; brand with `&`/space → backtick-quoted; no filters → no `filter_by` key. Run `pnpm test` → FAIL, then GREEN once T005 lands.

**Checkpoint**: query building proven.

---

## Phase 4: User Story 1 - Collection schema + ensure (Priority: P1)

**Goal**: A product collection with the documented fields, created idempotently.

- [x] T007 [US1] Create `packages/search/src/schema.ts`: `collectionName()` from `TYPESENSE_PRODUCTS_COLLECTION` (default `products`) and `productsCollectionSchema` (§6.3 fields + `default_sorting_field: "reviews"`).
- [x] T008 [US1] Create `packages/search/src/client.ts`: `getSearchClient()` building a `typesense` `Client` from `TYPESENSE_HOST/PORT/PROTOCOL/API_KEY` (admin key; throw with an actionable message if host/key missing).
- [x] T009 [US1] Create `packages/search/src/collection.ts`: `ensureCollection(client)` — `retrieve()` the collection; on `ObjectNotFound` create from `productsCollectionSchema`; rethrow other errors. Idempotent, no drop.

**Checkpoint**: collection can be ensured against a live engine (verified in quickstart §1).

---

## Phase 5: User Story 2 - Reindex from Postgres (Priority: P1)

**Goal**: Rebuild the index from Postgres in bounded batches, repeatable and rebuildable.

### Tests FIRST ⚠️

- [x] T010 [US2] Write `packages/search/src/document.test.ts` (SC-008): a full row → expected document (string id, number price, `releasedAtTimestamp` seconds, tags); row with null brand/rating/image/description/released_at → those keys absent; null reviews → `reviews:0`; determinism.
- [x] T011 [US2] Write `packages/search/src/reindex.test.ts` (SC-002/004/005): a `FakeProductReader` (yields fixture rows in batches) + `FakeSearchIndex` (collects docs in a Map by id, counts `ensure`/`indexBatch` calls); `reindexProducts` → `productsRead`/`documentsIndexed` equal fixture size, `batches` = ceil(N/size), index holds one doc per id; re-run upserts (no duplicates); `ensure()` called once. Run `pnpm test` → FAIL.

### Implementation

- [x] T012 [US2] Implement `reindexProducts(deps)` + the `ProductReader`/`SearchIndex`/`ReindexDeps`/`ReindexSummary` interfaces in `packages/search/src/reindex.ts`: `index.ensure()`; for each batch from `reader.streamBatches(batchSize)` map via `toSearchDocument`, `index.indexBatch(docs)`, accumulate; return summary; fail loudly on a failed batch. Run `pnpm test` → T010/T011 GREEN.

**Checkpoint**: reindex orchestration proven against fakes.

---

## Phase 6: Real dependencies + CLIs

- [x] T013 Implement `packages/search/src/stores.ts`: `createDbProductReader()` (keyset-paginate `products` by `id`, `price::double precision`, yield batches via `@ds/db` `query`) and `createTypesenseIndex(client)` (`ensure` → `ensureCollection`; `indexBatch` → `documents().import(docs,{action:"upsert"})`, parse newline results, throw on any failure, return success count).
- [x] T014 Implement `packages/search/src/run.ts`: `runReindex()` (load `.env`, resolve `REINDEX_BATCH_SIZE` default 500, wire real reader/index, run, print `reindex complete — …`, `closePool()` in `finally`) and `runSmoke(query)` (ensure, run a `buildSearchParams` search via the client, print top hits). Export the public API from `packages/search/src/index.ts` (replace the placeholder).
- [x] T015 Create thin launchers `scripts/reindex-products.ts` (`runReindex()` → exit 0/1) and `scripts/smoke-search.ts` (`runSmoke(process.argv[2])` → exit 0/1).

**Checkpoint**: `pnpm reindex:products` and `pnpm smoke:search` run end-to-end (verified in Polish).

---

## Phase 7: Polish & Cross-Cutting

- [x] T016 [P] Update root `README.md`: add the search section (`pnpm reindex:products`, `pnpm smoke:search`), env (`TYPESENSE_*`, `REINDEX_BATCH_SIZE`), the precondition (migrate + import first), and the note that search is a rebuildable index and the admin key stays server-side.
- [x] T017 Run the full quality gate: `pnpm lint`, `pnpm typecheck`, `pnpm test` — all green. Optionally run the quickstart §1–§4 live against local Postgres + Typesense (SC-001…SC-007).

---

## Dependencies & Execution Order

- **Setup (T001–T003)** → everything.
- **Foundational pure fns (T004–T005)** → US3 test (T006), US2 doc/reindex tests (T010–T012).
- **US1 (T007–T009)** schema/client/ensure are independent of the pure fns; needed by the real index (T013).
- **US2 (T010–T012)** depends on `toSearchDocument` (T004); **real deps/CLIs (T013–T015)** depend on US1 + US2.
- **Polish (T016–T017)** last.

### Story independence

- **US3** (query builder) is pure and standalone. **US1** (collection) is the index definition. **US2** (reindex) ties Postgres → index. Each is independently testable.

## Implementation Strategy

- **MVP** = Setup + pure fns + **US1** (collection ensure) + **US2** (reindex) → a populated, rebuildable index. **US3** (query builder) makes it queryable for Spec 005.
- **Wire**: real Typesense/Postgres deps + the two CLIs (T013–T015).
- **Finish**: Polish (docs + green gate, optional live reindex/smoke).
