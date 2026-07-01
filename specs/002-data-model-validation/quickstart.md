# Quickstart & Validation: Data Model + Validation

**Feature**: 002-data-model-validation | **Date**: 2026-06-30

A runnable guide proving Spec 002 works end-to-end. It validates the success criteria without building the import (Spec 003) or any UI.

## Prerequisites

- Repo installed: `pnpm install`
- Local services up: `docker compose up -d` (PostgreSQL on `5432`)
- `.env` present: `cp .env.example .env` (provides `DATABASE_URL`)

## 1. Create the schema (US1 · SC-001 · SC-003)

```bash
pnpm db:migrate
```

**Expected**: runner reports the applied migration(s) and exits `0`. Verify the tables:

```bash
docker compose exec -T postgres psql -U user -d ds -c '\d products'
docker compose exec -T postgres psql -U user -d ds -c '\d import_runs'
```

**Expected**: `products` shows all catalog + bookkeeping columns; `import_runs` shows source/status/counts/timing columns.

**Idempotency (SC-003)** — run it again:

```bash
pnpm db:migrate
```

**Expected**: "no pending migrations" / nothing re-applied, exit `0`, existing data untouched.

## 2. Validate & normalize records (US2 · SC-002 · SC-004 · SC-005 · SC-006)

```bash
pnpm test
```

**Expected**: the `@ds/shared` product validation/normalization suite passes, covering:

- a well-formed record → correct `NormalizedProduct` (string `id`, numeric `price`, `Date` `releasedAt`, `tags` list);
- formatted-string price `"1,081.43"` → `1081.43`;
- record missing optional fields → normalizes, optionals become `null`;
- malformed record (missing `title`, negative `price`) → rejected with field-level `ZodError`;
- determinism: normalizing the same record twice is deep-equal (including `id` and `sourceHash`);
- edge cases: empty tag list, whitespace optional text → `null`, date-only → UTC `Date`.

## 3. Quality gates (constitution VI)

```bash
pnpm lint
pnpm typecheck
pnpm test
```

**Expected**: all green across the workspace.

## Success criteria → evidence

| Criterion | Evidence |
|---|---|
| SC-001 schema created with all fields | Step 1 `\d products` / `\d import_runs` |
| SC-002 valid normalize / invalid rejected | Step 2 suite (valid + malformed cases) |
| SC-003 idempotent re-migrate | Step 1 second run |
| SC-004 deterministic, stable id | Step 2 determinism test |
| SC-005 missing optionals safe | Step 2 missing-optionals test |
| SC-006 tests cover edge cases | Step 2 full suite passes |
| SC-007 no search/UI added | Inspection: no Typesense code, no product page |

## Out of scope (later specs)

- Fetching `PRODUCTS_SOURCE_URL` and upserting ~4,000 rows → **Spec 003**.
- Indexing into Typesense → **Spec 004**. HTTP API → **Spec 005**.
