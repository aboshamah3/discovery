# Quickstart: Product Import Pipeline

**Feature**: 003-import-pipeline | **Date**: 2026-06-30

Runnable guide to exercise and verify the import. Maps each step to the spec's success criteria. Assumes the repo is installed (`pnpm install`) and Docker is available.

## 0. Prerequisites

```bash
cp .env.example .env            # if not already done (Spec 001)
docker compose up -d            # local Postgres (Spec 001)
pnpm db:migrate                 # create products + import_runs (Spec 002) — idempotent
```

`.env` must contain `DATABASE_URL`, `PRODUCTS_SOURCE_URL`, and may set `IMPORT_BATCH_SIZE` (default 500).

## 1. First import — populate the store (SC-001)

```bash
pnpm import:products
```

Expected: a progress + summary line like
`import complete — status=success fetched=4000 valid=4000 invalid=0 written=4000 batches=8`,
and exit code `0`. Verify the store:

```bash
docker compose exec -T postgres psql "$DATABASE_URL" -c "SELECT count(*) FROM products;"
# => 4000  (one row per valid record)
```

## 2. Idempotent re-run — no duplicates (SC-002)

```bash
pnpm import:products            # run a second time, unchanged feed
docker compose exec -T postgres psql "$DATABASE_URL" -c "SELECT count(*) FROM products;"
# => 4000  (unchanged)
docker compose exec -T postgres psql "$DATABASE_URL" \
  -c "SELECT count(*) FROM (SELECT id FROM products GROUP BY id HAVING count(*) > 1) d;"
# => 0  (no duplicate ids)
```

The second run's summary shows `written=0` (hash guard skipped every unchanged row).

## 3. Run-record observability (SC-005)

```bash
docker compose exec -T postgres psql "$DATABASE_URL" -c \
"SELECT status, fetched_count, valid_count, invalid_count, upserted_count,
        finished_at IS NOT NULL AS finished, error_message
 FROM import_runs ORDER BY started_at DESC LIMIT 3;"
```

Expected: terminal `status=success`, `finished=t`, null `error_message`; counts satisfy
`fetched_count = valid_count + invalid_count` and `upserted_count <= valid_count`.

## 4. Bounded batches (SC-006)

```bash
IMPORT_BATCH_SIZE=250 pnpm import:products
# Same final store state as a default run; summary shows batches=16 (4000/250).
```

## 5. Failure is loud (SC-005)

```bash
PRODUCTS_SOURCE_URL="https://media.downshift.app/hiring/founding-engineer/does-not-exist.json" \
  pnpm import:products ; echo "exit=$?"
# Non-zero exit; summary/error names the failure.
```

The latest `import_runs` row shows `status=failed`, a non-empty `error_message`, and a `finished_at`.

## 6. Automated tests (SC-007)

```bash
pnpm test          # vitest — includes packages/import fixture tests (no DB needed)
pnpm typecheck     # tsc across all packages (incl. @ds/import)
pnpm lint          # eslint .
```

All three green. The `@ds/import` fixture tests cover: successful import, mixed valid/invalid counting + skipping, idempotent re-run (no duplication), changed-record update (written reflects the change), and run-record outcome for success and failure.

## 7. Scope check (SC-008)

- No Typesense/search code added; `packages/search` untouched.
- No product UI added; `apps/web` untouched.

## Success-criteria coverage

| Step | Criteria |
|---|---|
| 1 | SC-001 |
| 2 | SC-002 |
| 2 (written=0), 8 below | SC-003 (full change check in tests) |
| 3 | SC-004 (count invariants), SC-005 |
| 4 | SC-006 |
| 5 | SC-005 (failure) |
| 6 | SC-007 |
| 7 | SC-008 |

> SC-003's "changed record updates in place" is proven deterministically by the `@ds/import` changed-record test (step 6); to see it live, edit one product's price in a local fixture feed and re-run — only that row's `updated_at` advances and `written=1`.
