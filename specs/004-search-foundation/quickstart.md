# Quickstart: Typesense Search Foundation

**Feature**: 004-search-foundation | **Date**: 2026-06-30

Runnable guide to exercise and verify the search foundation. Maps each step to the spec's success criteria. Assumes the repo is installed and Postgres is migrated + imported (Specs 002–003).

## 0. Prerequisites

```bash
docker compose up -d            # Postgres (5432) + Typesense (8108)
pnpm db:migrate                 # tables (Spec 002)
pnpm import:products            # populate Postgres (Spec 003)
curl http://localhost:8108/health   # {"ok":true}
```

`.env` must contain `DATABASE_URL`, `TYPESENSE_*` (host/port/protocol/admin key/collection), and may set `REINDEX_BATCH_SIZE` (default 500).

## 1. Ensure + reindex — populate the index (SC-001, SC-002)

```bash
pnpm reindex:products
```

Expected: a summary like
`reindex complete — productsRead=4000 documentsIndexed=4000 batches=8`, exit `0`.
Verify the collection document count equals the Postgres product count:

```bash
# documents in the collection
curl -s -H "X-TYPESENSE-API-KEY: $TYPESENSE_API_KEY" \
  "http://localhost:8108/collections/products" | python3 -c "import sys,json;print('docs',json.load(sys.stdin)['num_documents'])"
# products in Postgres
PGPASSWORD=password psql -h localhost -U user -d ds -tAc "SELECT count(*) FROM products;"
# => both 4000
```

Inspect the schema covers all fields (SC-001):

```bash
curl -s -H "X-TYPESENSE-API-KEY: $TYPESENSE_API_KEY" \
  "http://localhost:8108/collections/products" | python3 -c "import sys,json;print([f['name'] for f in json.load(sys.stdin)['fields']])"
```

## 2. Idempotent re-run + rebuild from scratch (SC-003, SC-004)

```bash
pnpm reindex:products                 # second run
# => documentsIndexed=4000, collection still 4000 docs (upsert by id, no duplicates)

# Drop the collection and rebuild from Postgres alone:
curl -s -X DELETE -H "X-TYPESENSE-API-KEY: $TYPESENSE_API_KEY" "http://localhost:8108/collections/products" >/dev/null
pnpm reindex:products
# => collection rebuilt to 4000 docs; Postgres unchanged
```

## 3. Bounded batches (SC-005)

```bash
REINDEX_BATCH_SIZE=250 pnpm reindex:products
# Same final 4000 docs; summary shows batches=16 (4000/250).
```

## 4. Smoke search (SC-007)

```bash
pnpm smoke:search "rattan"
# Prints top results (id / title / score); a known "Rattan" product appears near the top.
pnpm smoke:search            # empty query → stable highest-rated/most-reviewed ordering, not random
```

## 5. Automated tests (SC-006, SC-008)

```bash
pnpm test          # vitest — includes packages/search pure + reindex tests (no engine needed)
pnpm typecheck     # tsc across all packages (incl. @ds/search) + scripts
pnpm lint          # eslint .
```

All three green. The `@ds/search` tests cover: document mapping (release-date→timestamp, missing optionals omitted, reviews default), and query building (empty/non-empty query, weighting/ranking, page-size default + clamp to [1,60], each filter clause).

## 6. Scope + security check (SC-009)

- No API route added under `apps/web/src/app/api` beyond the existing health route; no product UI.
- The admin key (`TYPESENSE_API_KEY`) is read only in server-side `@ds/search`/scripts — `grep -rn TYPESENSE_API_KEY apps/web/src` returns nothing client-facing.

## Success-criteria coverage

| Step | Criteria |
|---|---|
| 1 | SC-001, SC-002 |
| 2 | SC-003, SC-004 |
| 3 | SC-005 |
| 4 | SC-007 |
| 5 | SC-006, SC-008 |
| 6 | SC-009 |
