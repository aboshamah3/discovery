---
description: "Task list for Product Import Pipeline (Spec 003)"
---

# Tasks: Product Import Pipeline

**Input**: Design documents from `/specs/003-import-pipeline/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: REQUIRED for the import orchestration. The spec asks for fixture-based tests (FR-011, SC-007), so the core (`importProducts`) is written test-first (RED → GREEN) against injected fakes — no DB needed. The live HTTP + Postgres path is verified via the quickstart.

**Organization**: Tasks grouped by user story (US1–US4) so each is independently implementable and testable. US1/US2 are the P1 heart (load + idempotent re-run); US3 (observability) and US4 (batching) are folded into the same `importProducts` core and proven by dedicated tests.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 / US4 (setup, foundational, polish have no story label)
- Paths are repo-root relative.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Stand up the new `@ds/import` package and wire the command this spec introduces.

- [x] T001 Create `packages/import/package.json` (`@ds/import`, private, `main`/`types` → `./src/index.ts`, `exports`): dependencies `@ds/shared` + `@ds/db` (workspace `*`); `scripts` `typecheck` (`tsc --noEmit`) and `test` (`vitest run`); devDeps `@types/node`. Mirror `packages/db/package.json`.
- [x] T002 Create `packages/import/tsconfig.json` extending the shared base (mirror `packages/db/tsconfig.json`), including `src`.
- [x] T003 Add the root CLI script `"import:products": "tsx scripts/import-products.ts"` to root `package.json`; ensure root `typecheck` covers `scripts/` (root `tsconfig.json` `include: ["scripts"]`, run via the existing recursive/root typecheck) so the launcher is typechecked.
- [x] T004 Ensure `.env.example` documents `IMPORT_BATCH_SIZE` (default 500) alongside the existing `PRODUCTS_SOURCE_URL`; mirror into `.env` if missing.
- [x] T005 Run `pnpm install` to link `@ds/import` and its workspace deps; confirm the workspace resolves with no errors.

**Checkpoint**: `@ds/import` exists and is part of the workspace; `pnpm import:products` resolves to the (not-yet-written) launcher.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared types/interfaces every story's code and tests import. **⚠️ Must complete before US1–US4 implementation.**

- [x] T006 Define the contract types in `packages/import/src/import.ts` (signatures only first): `FeedFetcher`, `ProductStore`, `ImportRunStore`, `ImportDeps`, `ImportOutcome`, `ImportSummary` (per contracts/import.contract.md). These are the seams the tests inject against.

**Checkpoint**: types compile; tests and implementation can import the contract.

---

## Phase 3: User Story 1 - Populate the canonical store (Priority: P1) 🎯 MVP

**Goal**: `importProducts` fetches the feed, validates/normalizes each record via `parseProduct`, and upserts valid records into the product store; invalid records are skipped and counted.

**Independent Test**: `pnpm test` — feeding a valid fixture writes one record per valid item; a mixed fixture writes only the valid ones and the run still succeeds.

### Tests for User Story 1 (write FIRST — must FAIL before implementation) ⚠️

- [x] T007 [US1] Add fixtures in `packages/import/src/fixtures.ts`: `validFeed` (small all-valid list shaped like the source), `mixedFeed` (valid + malformed records — missing `title`, negative `price`, wrong-typed `reviews`), and a `changedFeed` variant (one record's price changed). Add a `FakeProductStore` (Map keyed by id, hash-guard semantics, returns written count) and `FakeImportRunStore` (records start/finish calls) — either in `fixtures.ts` or the test file.
- [x] T008 [US1] Write `packages/import/src/import.test.ts` US1 cases (per contracts + SC-001/SC-004): valid fixture → store holds one row per valid item, summary `valid=N invalid=0 written=N status=success`; mixed fixture → only valid rows written, `invalid` counted, run still `success`, `fetched = valid + invalid`. Run `pnpm test` → these FAIL (core not implemented).

### Implementation for User Story 1

- [x] T009 [US1] Implement the core `importProducts(deps)` in `packages/import/src/import.ts`: start run record; fetch feed; for each element call `parseProduct` (tally valid/invalid); dedup valid by `id` (last-wins); chunk into `batchSize` and call `products.upsertBatch` (sum written); finish run `success`; return `ImportSummary`. Run `pnpm test` → US1 cases PASS (GREEN).

**Checkpoint**: the load path works against fakes — MVP behavior proven.

---

## Phase 4: User Story 2 - Re-run safely without duplication (Priority: P1)

**Goal**: Re-running over the same feed never duplicates; changed records update in place; unchanged records are skipped (written reflects only real changes).

**Independent Test**: `pnpm test` — second import over an unchanged fixture leaves the fake store size identical and `written=0`; a changed fixture updates exactly one row with `written=1`.

- [x] T010 [US2] Add `import.test.ts` US2 cases (SC-002/SC-003): run import twice over `validFeed` → store size unchanged, no duplicate ids, second-run `written=0`; run over `changedFeed` after `validFeed` → exactly the changed id updated, `written=1`, others untouched; duplicate-id-within-one-feed fixture → converges to one row (last-wins). Confirm PASS against the T009 core (the `FakeProductStore` already encodes hash-guard semantics).

**Checkpoint**: idempotency + change detection proven deterministically.

---

## Phase 5: User Story 3 - Record each run's outcome (Priority: P2)

**Goal**: Every run writes a start→finish run record with status, the four counts, timing, and an error message on failure; fatal conditions fail loudly.

**Independent Test**: `pnpm test` — success path records `status=success` + counts; a throwing fetcher records `status=failed` + `errorMessage` and `importProducts` rethrows.

- [x] T011 [US3] Add `import.test.ts` US3 cases (FR-008/FR-009/SC-005): on success the `FakeImportRunStore` saw `start` then `finish({status:'success', counts…})`; with a `fetchFeed` that throws, the store saw `finish({status:'failed', errorMessage})` and `importProducts` rejected (asserting the loud-failure contract); empty feed → `success` with zero counts. Extend the T009 core with the try/catch-and-record-failure path so these PASS.

**Checkpoint**: observability + fail-loud proven.

---

## Phase 6: User Story 4 - Bounded batches (Priority: P3)

**Goal**: Records are written in chunks of `batchSize`, never one unbounded write; the final result matches an unbatched run.

**Independent Test**: `pnpm test` — with `batchSize` smaller than the feed, `upsertBatch` is called multiple times, `summary.batches > 1`, and the final store state equals a single-batch run.

- [x] T012 [US4] Add `import.test.ts` US4 cases (FR-006/SC-006): a spying `FakeProductStore` counting `upsertBatch` calls; import `validFeed` with `batchSize=2` → call count = ceil(N/2), `summary.batches` matches, store contents identical to a `batchSize=N` run. Confirm the T009 chunking satisfies these (adjust chunking if needed).

**Checkpoint**: bounded batching proven.

---

## Phase 7: Real dependencies + CLI (wire to live HTTP + Postgres)

**Purpose**: The production implementations behind the interfaces, and the operational entrypoint.

- [x] T013 Implement `packages/import/src/stores.ts`: `httpFetchFeed(url)` (global `fetch` → assert `res.ok` else throw with status → `res.json()` → assert `Array.isArray` else throw); `createDbProductStore()` (build the parameterized multi-row `INSERT … ON CONFLICT (id) DO UPDATE … WHERE products.source_hash IS DISTINCT FROM EXCLUDED.source_hash` per data-model.md; return `result.rowCount ?? 0` via `@ds/db` `query`); `createDbImportRunStore()` (`start` → `INSERT … RETURNING id`; `finish` → `UPDATE … SET status, counts, finished_at=now(), error_message WHERE id=$1`).
- [x] T014 Implement `packages/import/src/run.ts` `runImport()`: load `.env` (dotenv); resolve `PRODUCTS_SOURCE_URL` (required → throw if missing) and `IMPORT_BATCH_SIZE` (parse, default 500, must be ≥1); wire `httpFetchFeed` + the two db stores; call `importProducts`; print the summary line; `closePool()` in a `finally`. Export the public API from `packages/import/src/index.ts`.
- [x] T015 Create the thin launcher `scripts/import-products.ts`: `import { runImport } from "@ds/import"; runImport().then(s => process.exit(s.status === "success" ? 0 : 1)).catch(err => { console.error(err); process.exit(1); });`

**Checkpoint**: `pnpm import:products` runs end-to-end against local Postgres (verified in Polish).

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Documentation and the full green gate (constitution VI).

- [x] T016 [P] Update root `README.md` with the import command (`pnpm import:products`), its env (`PRODUCTS_SOURCE_URL`, `IMPORT_BATCH_SIZE`), and the precondition (`pnpm db:migrate` first).
- [x] T017 Run the full quality gate: `pnpm lint`, `pnpm typecheck`, `pnpm test` — all green across the workspace (incl. `@ds/import`). Optionally run `pnpm import:products` against local Postgres per quickstart §1–§5 (live verification of SC-001/SC-002/SC-005/SC-006).

---

## Dependencies & Execution Order

- **Setup (T001–T005)** → everything.
- **Foundational (T006)** → all story implementation + tests.
- **US1 (T007–T009)** → **US2 (T010)**, **US3 (T011)**, **US4 (T012)** all extend/lean on the same `importProducts` core, so US1's core lands first; US2/US3/US4 tests then drive incremental additions (hash-guard already in the fake; failure path in T011; chunking in T009/T012).
- **Real deps + CLI (T013–T015)** depend on the Foundational types (T006); independent of the fixture tests, but land after the core is proven.
- **Polish (T016–T017)** last.

### Story independence

- **US1** is the MVP load. **US2/US3/US4** are additive behaviors of the same core, each with its own tests and independently demonstrable (no duplication / observability / batching).

### Parallel opportunities

- T001/T002 (new package manifests) are quick sequential setup; T016 (README) is parallelizable with T017 prep.
- The real-dependency work (T013–T015) can proceed in parallel with writing the US2/US3/US4 fixture tests, since they touch different files (`stores.ts`/`run.ts` vs `import.test.ts`).

## Implementation Strategy

- **MVP** = Setup + Foundational + **US1** (load valid records, skip invalid) + **US2** (idempotent re-run). These two P1 stories are the heart of the spec.
- **Increment**: **US3** (run-record + fail-loud) and **US4** (bounded batches) — both small additions to the same core, each test-proven.
- **Wire**: real HTTP + Postgres stores and the CLI launcher (T013–T015).
- **Finish**: Polish (docs + green gate, optional live import).
