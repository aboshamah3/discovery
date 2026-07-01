---
description: "Task list for Data Model + Validation (Spec 002)"
---

# Tasks: Data Model + Validation

**Input**: Design documents from `/specs/002-data-model-validation/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: REQUIRED for the validation/normalization layer. The spec explicitly asks for unit tests (FR-010, SC-006), so the US2 phase is written test-first (RED → GREEN). The schema/migration stories (US1, US3) are verified via the quickstart against local Postgres rather than automated DB tests (no DB test harness is in scope this spec).

**Organization**: Tasks grouped by user story (US1, US2, US3) so each is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 (setup, foundational, polish have no story label)
- Paths are repo-root relative.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install the dependencies and wire the command this spec introduces.

- [ ] T001 [P] Add `zod` as a dependency of `@ds/shared` (`packages/shared/package.json`); add a `test` script (`vitest run`) so the package's tests run under `pnpm -r`.
- [ ] T002 [P] Add `pg` + `dotenv` dependencies and `@types/pg` + `@types/node` devDependencies to `@ds/db` (`packages/db/package.json`); add `db:migrate` (`tsx src/migrate.ts`) and `test` scripts.
- [ ] T003 Add `tsx` as a root devDependency and a root `db:migrate` script delegating to `@ds/db` (`package.json`).
- [ ] T004 Run `pnpm install` to link the new dependencies; confirm the workspace resolves with no errors.

**Checkpoint**: deps installed; `pnpm db:migrate` resolves to the (not-yet-written) runner.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The DB access + migration mechanism both schema stories (US1, US3) depend on. **⚠️ Must complete before US1/US3.** (US2 is pure and does not depend on this phase.)

- [ ] T005 Create the PostgreSQL client in `packages/db/src/index.ts`: lazy `getPool()` from `DATABASE_URL`, `query(text, params?)`, and `closePool()` (per contracts/db-schema.contract.md). Replace the Spec 001 placeholder export.
- [ ] T006 Create the idempotent migration runner `packages/db/src/migrate.ts`: load `.env` via `dotenv`; bootstrap `schema_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`; apply every `packages/db/migrations/*.sql` not yet recorded, in filename order, each in a transaction; record applied filenames; log applied/skipped; exit non-zero (rolled back) on failure.

**Checkpoint**: runner exists and can apply migrations idempotently; migration files are added per story below.

---

## Phase 3: User Story 1 - Establish the canonical product store (Priority: P1) 🎯 MVP

**Goal**: A `products` store holding every catalog + bookkeeping field, created by `pnpm db:migrate`, idempotent, with a unique id.

**Independent Test**: On a fresh DB, `pnpm db:migrate` then `\d products` shows all columns; re-running migrate is a no-op; inserting a duplicate `id` is rejected.

- [ ] T007 [US1] Create `packages/db/migrations/0001_init.sql`: `products` table (all columns per data-model.md — `id text PK`, catalog fields, `tags text[] NOT NULL DEFAULT '{}'`, `price numeric(10,2)`, `in_stock boolean NOT NULL DEFAULT false`, timestamps, `source_hash`), the secondary indexes (`brand`, `category`, `in_stock`, `released_at`, `rating`, `price`), the `set_updated_at()` function, and the `products_set_updated_at BEFORE UPDATE` trigger. Use `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` / idempotent function+trigger.
- [ ] T008 [US1] Verify against local Postgres (quickstart §1): `docker compose up -d` → `pnpm db:migrate` creates `products`; second `pnpm db:migrate` is a no-op (SC-003); a duplicate-id insert fails (US1 scenario 3).

**Checkpoint**: `products` exists and is the MVP deliverable.

---

## Phase 4: User Story 2 - Validate and normalize raw catalog records (Priority: P1)

**Goal**: `@ds/shared` validates one raw source record (field-level rejection) and normalizes valid records into `NormalizedProduct` deterministically.

**Independent Test**: `pnpm test` — the product suite passes (valid → correct normalized record; `"1,081.43"` → `1081.43`; missing optionals safe; malformed → ZodError naming the field; determinism).

### Tests for User Story 2 (write FIRST — must FAIL before implementation) ⚠️

- [ ] T009 [US2] Write `packages/shared/src/product.test.ts` covering (per contracts/validation.contract.md & SC-006): valid record → expected `NormalizedProduct` (string id, numeric price, `Date` releasedAt, tags); formatted-string price `"1,081.43"` → `1081.43`; missing optionals → `null`; whitespace optional text → `null`; empty tag list → `[]`; date-only → UTC `Date`; unparseable/absent date → `null`; malformed (missing `title`, negative `price`, non-integer `reviews`) → `parseProduct` returns `{ success:false }` with issue paths; determinism: `normalizeProduct(x)` deep-equals itself incl. `id` and `sourceHash`. Run `pnpm test` and confirm these FAIL (module not yet implemented).

### Implementation for User Story 2

- [ ] T010 [US2] Implement `packages/shared/src/product.ts`: `rawProductSchema` (Zod — required `id` int≥0, `title` non-empty trimmed; optional nullable fields; `tags` default `[]`; `price` union number/string/null coerced to number|null with comma-strip + non-negative bound; `rating`/`reviews`/`imageWidth`/`imageHeight` non-negative bounds); `RawProduct` type; `NormalizedProduct` type; a pure-TS `sourceHash` (FNV-1a hex over canonical content); `normalizeProduct(raw)` (total: `String(id)`, UTC date parse, trim/blank→null, defaults, hash); `parseProduct(input)` (safeParse → normalize result union).
- [ ] T011 [US2] Re-export the product API from `packages/shared/src/index.ts` (keep existing `APP_NAME`/`HealthStatus` exports). Run `pnpm test` → the US2 suite now PASSES (GREEN).

**Checkpoint**: validation/normalization is complete, tested, and exported for Spec 003.

---

## Phase 5: User Story 3 - Record import-run outcomes for observability (Priority: P2)

**Goal**: An `import_runs` store capturing source/status/counts/timing/error for future imports.

**Independent Test**: After migrate, `\d import_runs` shows id (uuid default), source_url, status, the four counts (default 0), started_at (default now), finished_at (nullable), error_message.

- [ ] T012 [US3] Create `packages/db/migrations/0002_import_runs.sql`: `import_runs` table per data-model.md (`id uuid PK DEFAULT gen_random_uuid()`, `source_url text NOT NULL`, `status text NOT NULL`, four `*_count integer NOT NULL DEFAULT 0`, `error_message text`, `started_at timestamptz NOT NULL DEFAULT now()`, `finished_at timestamptz`). Use `CREATE TABLE IF NOT EXISTS`.
- [ ] T013 [US3] Verify (quickstart §1): `pnpm db:migrate` applies `0002` and creates `import_runs` with the columns/defaults above; re-run is a no-op.

**Checkpoint**: import-run observability store exists.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation and the full green gate (constitution VI).

- [ ] T014 [P] Update root `README.md` with the data-layer commands (`pnpm db:migrate`) and the local flow note (no ORM; SQL migrations under `packages/db/migrations`).
- [ ] T015 Run the full quality gate: `pnpm lint`, `pnpm typecheck`, `pnpm test` — all green across the workspace; and run `pnpm db:migrate` (incl. a second idempotent run) against local Postgres.

---

## Dependencies & Execution Order

- **Setup (T001–T004)** → everything.
- **Foundational (T005–T006)** → US1 (T007–T008) and US3 (T012–T013).
- **US2 (T009–T011)** depends only on Setup (T001, T004) — pure, no DB; can run in parallel with Foundational/US1/US3.
- **Polish (T014–T015)** last.

### Story independence

- **US1** (products) and **US3** (import_runs) are separate migration files → independently applicable/testable.
- **US2** (validation) shares nothing with the DB stories.

### Parallel opportunities

- T001 / T002 are different package manifests → parallel. (T003 edits root after, then T004 installs once.)
- After Setup: the **US2 chain** (T009→T010→T011) runs in parallel with the **DB chain** (T005→T006→T007→T008, then T012→T013).
- T014 (README) is parallelizable with T015 prep.

## Implementation Strategy

- **MVP** = Setup + Foundational + **US1** (a real `products` store) + **US2** (the validation boundary). These two P1 stories are the heart of the spec.
- **Increment**: add **US3** (import_runs) — small, additive migration.
- **Finish**: Polish (docs + green gate + live migrate check).
