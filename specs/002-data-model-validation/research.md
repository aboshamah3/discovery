# Phase 0 Research: Data Model + Validation

**Feature**: 002-data-model-validation | **Date**: 2026-06-30

The stack is ratified upstream (`DS_PROJECT_SPEC_PLAN.md` §2) and the constitution was amended to **v1.1.0** for this spec: the database is accessed **directly via a lightweight client/driver with no ORM**. This file resolves the remaining "which library / which approach" unknowns for the data model and validation layer only. Concerns owned by later specs (network fetch + batch upsert → Spec 003; Typesense documents → Spec 004; HTTP DTOs → Spec 005) are intentionally left open.

---

### Decision: Direct PostgreSQL access via `pg` (node-postgres), no ORM

- **Rationale**: The amended constitution forbids an ORM. `pg` is the de-facto standard PostgreSQL driver for Node — tiny, dependency-light, battle-tested, with parameterized queries (`$1, $2`) that prevent injection and a simple `Pool` for connection reuse. It maps cleanly to "just a DB": we write SQL, it runs SQL.
- **Alternatives considered**:
  - `postgres` (porsager) — excellent tagged-template API, but `pg` is more ubiquitous, has broader ecosystem familiarity, and its explicit `query(text, params)` form reads better in migrations.
  - Prisma / Drizzle / Kysely — all are ORMs or query-builders; rejected by the constitution amendment (and the user's "just a DB, no Prisma" direction).

### Decision: Plain SQL migrations applied by a tiny in-repo runner

- **Rationale**: Schema lives as ordered, append-only SQL files in `packages/db/migrations/` (`0001_init.sql`, …). A small `migrate.ts` runner (using `pg`) creates a `schema_migrations` bookkeeping table, then applies every not-yet-applied file inside a transaction, recording each filename. This makes `pnpm db:migrate` **idempotent and safe to re-run** (FR-003, SC-003): already-applied files are skipped; a fresh DB gets the full schema. SQL stays readable and reviewable, with no ORM migration DSL.
- **Alternatives considered**:
  - `node-pg-migrate` / `dbmate` / Flyway — capable, but add a tool + its own DSL/binary; heavier than "just a DB" needs for two tables.
  - Prisma Migrate — rejected (no ORM).
  - A raw `psql -f` shell script — works, but a TS runner is cross-platform, testable, tracks applied migrations, and keeps everything inside the workspace toolchain.

### Decision: `tsx` to execute TypeScript scripts; `dotenv` to load `.env`

- **Rationale**: `DS_PROJECT_SPEC_PLAN.md` §9 already specifies `tsx` for `scripts/*.ts`. The migrate runner is a `.ts` file, so `tsx` runs it without a build step. The runner loads `DATABASE_URL` from the repo-root `.env` via `dotenv` so `pnpm db:migrate` works with the local Docker Postgres out of the box (matches the §10 local flow).
- **Alternatives considered**: Node's `--env-file` flag (newer, but `dotenv` is unambiguous across Node 20.x patch levels); `ts-node` (slower, ESM friction vs `tsx`).

### Decision: Validation + normalization live in `@ds/shared`, using Zod

- **Rationale**: The constitution (Principle IV) mandates Zod at untrusted boundaries, and `@ds/shared` is the reserved home for shared schemas/types (created in Spec 001). Putting the raw-product schema, the normalized type, and the normalization utility here lets both the import script (Spec 003) and any future consumer reuse one source of truth. Keeping it framework-free means it can also be imported by the eventual frontend.
- **Alternatives considered**: Co-locating validation in `packages/db` (couples validation to the driver — the import pipeline and API both need it independent of DB access); hand-rolled validators (Principle IV requires Zod and it gives free, field-level error messages — FR-004).

### Decision: Two-layer boundary — a validating/coercing Zod schema, then a total normalization function

- **Rationale**: The source feed is messy (numeric `id`; `price` as number, `"1,081.43"`, or `null`; frequently-null optionals; date-only `releasedAt`). We split responsibilities:
  1. **`rawProductSchema` (Zod)** — validates structure and enforces bounds. It rejects out-of-contract records with field-level errors (missing/typed-wrong required fields; negative price/rating/reviews/dimensions — FR-004, FR-012). It performs the one coercion that validation requires: parsing `price` (number | separator-string | null) into a number or null so bounds can be checked. Its output keeps the record close to source (`id` stays numeric, `releasedAt` stays a string).
  2. **`normalizeProduct(raw)` — a total (non-throwing) function** — maps a *validated* raw record to the canonical `NormalizedProduct`: stringifies `id` (FR-002), parses the date-only `releasedAt` to a UTC `Date` (or `null` if unparseable/absent), trims optional text and converts empty/whitespace to `null`, defaults `inStock` to `false`, defaults `tags` to `[]`, and computes a deterministic `sourceHash`.
- **Why this split**: bound/structure failures are *rejections* (the record is bad → reported, counted invalid by Spec 003); messy-but-recoverable values (formatted price, date format, blank optionals) are *normalized*. A total normalize keeps the happy path simple and makes determinism (SC-004) trivial to test.
- **Alternatives considered**: One mega-schema with all transforms (harder to read, blurs reject-vs-normalize); a throwing normalizer (forces try/catch in the import loop and conflates the two failure modes).

### Decision: Deterministic `sourceHash` computed in normalization via a pure-TS hash

- **Rationale**: The `Product` store carries a `source_hash` bookkeeping column (FR-001) that Spec 003 will use to detect changed records and skip no-op upserts. Computing it during normalization keeps the normalized record a complete description of the row and reinforces determinism (same input → same hash, SC-004). A small pure-TS stable hash (FNV-1a over canonical JSON of the content fields) is used instead of `node:crypto` so `@ds/shared` stays free of `@types/node`/runtime assumptions and remains importable anywhere.
- **Alternatives considered**: `node:crypto` SHA-256 (pulls Node types into the shared package — unnecessary for a non-security change-detection hash); deferring the hash entirely to Spec 003 (the column belongs to this spec's data model, and computing it here makes the normalized record self-contained).

### Decision: PostgreSQL schema shape (snake_case columns, no ORM mapping)

- **Rationale**: Columns use Postgres-idiomatic `snake_case` (`in_stock`, `released_at`, `image_width`); the camelCase ↔ snake_case mapping is done explicitly in SQL by the writer (import, Spec 003). `tags` uses native `text[]`. `price` uses `numeric(10,2)` for exact currency (2-dp, per spec Assumptions). Timestamps are `timestamptz` (UTC). `updated_at` is kept correct by a trigger so it is reliable regardless of which writer touches a row. Secondary indexes (`brand`, `category`, `in_stock`, `released_at`, `rating`, `price`) mirror `DS_PROJECT_SPEC_PLAN.md` §5.1 to support later filtering/sorting without a schema change.
- **Alternatives considered**: camelCase quoted identifiers (awkward in raw SQL — every identifier needs quoting); `double precision` for price (float rounding errors on currency — rejected); a separate `tags` join table (overkill; Postgres arrays + GIN later are sufficient for this catalog size).

### Decision: `import_runs` identity via built-in `gen_random_uuid()`

- **Rationale**: Run records need a unique id with no app coordination. Postgres 16 provides `gen_random_uuid()` built-in (no extension), so `id uuid primary key default gen_random_uuid()` gives free, collision-safe ids. Counts default to `0`, `started_at` defaults to `now()`, `finished_at` stays null until completion (matches the run lifecycle in spec US3).
- **Alternatives considered**: app-generated cuid/uuid (adds a dependency for no benefit here); serial integer (fine, but uuid avoids guessable/sequential run ids and needs no sequence management).

### Decision: Scope guardrails — schema + validation only

- **Rationale**: Per FR-011 and the constitution (frontend-last; Postgres is source of truth, search is a rebuildable index), this spec ships **no** network fetch, **no** Typesense code, and **no** product UI. The `migrate` runner and a minimal `getPool()`/`query()` helper are the only runtime code; the actual catalog import that uses them is Spec 003.
- **Alternatives considered**: Bundling a first import into this spec (violates spec ordering and the small-reviewable-change principle).

---

## Resolved unknowns

| Unknown | Resolution |
|---|---|
| DB access mechanism (no ORM) | `pg` driver + raw parameterized SQL |
| Migration mechanism | Numbered `.sql` files + `migrate.ts` runner with `schema_migrations` tracking |
| Script execution / env | `tsx` to run TS; `dotenv` to load root `.env` |
| Validation tool & location | Zod in `@ds/shared` |
| Reject vs. normalize boundary | Schema rejects (structure/bounds); `normalizeProduct` coerces (price/date/blank/defaults) |
| Stable id | `String(numericId)` in normalization (FR-002) |
| Price coercion | number \| separator-string \| null → number \| null (strip `,`, `parseFloat`, non-negative) |
| Date handling | date-only `YYYY-MM-DD` → UTC `Date`; unparseable/absent → `null` |
| Change-detection hash | deterministic pure-TS FNV-1a `sourceHash` computed in normalization |
| Run-record identity | `uuid` default `gen_random_uuid()` |
