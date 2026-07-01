# Quickstart — Backend API Contracts (Spec 005)

**Feature**: 005-backend-api-contracts | **Date**: 2026-07-01

End-to-end verification of the three endpoints against the local stack. Pure logic and route handlers are already covered by `pnpm test` (no engines needed); this guide verifies the live wiring (SC-001…SC-005) and the no-leak / no-UI guarantees (SC-006/SC-008).

## Prerequisites

```bash
cp .env.example .env         # if not already done (Spec 001)
docker compose up -d         # Postgres + Typesense
pnpm install
pnpm db:migrate              # Spec 002 schema
pnpm import:products         # Spec 003 — populate Postgres
pnpm reindex:products        # Spec 004 — build the search index
```

## Run the automated gate (no engines required)

```bash
pnpm lint
pnpm typecheck
pnpm test
```

Expected: all green — pure `lib/api` tests (validation, DTO, pagination, errors, health aggregation) and the three route-handler tests (adapters mocked) pass with no Postgres/Typesense running. (SC-007)

## Start the app

```bash
pnpm dev                     # Next.js on http://localhost:3000
```

## 1. Health — real probes (US1 / SC-001)

```bash
curl -i http://localhost:3000/api/health
```

- **Both up** → `200` with `{"ok":true,"services":{"database":"ok","search":"ok"}}`.
- **Search down** → stop Typesense (`docker compose stop typesense`), re-curl → `503` with `{"ok":false,"services":{...,"search":"down"}}`. Restart with `docker compose start typesense`.
- Confirm the body contains no connection string or key. (SC-006)

## 2. Search (US2 / SC-002, SC-003)

```bash
# basic query
curl -s 'http://localhost:3000/api/search?q=shirt' | jq '{query,page,perPage,found,totalPages,hasMore,n:(.results|length)}'

# filters
curl -s 'http://localhost:3000/api/search?q=&brand=Acme&inStock=true' | jq '.results[0]'

# page-size clamp (perPage above cap → 60)
curl -s 'http://localhost:3000/api/search?q=&perPage=999' | jq '.perPage'   # → 60

# facets present when the engine returns them
curl -s 'http://localhost:3000/api/search?q=' | jq '.facets | keys'
```

- Confirm `results[]` carry only DTO fields (no `sourceHash`), `totalPages`/`hasMore` are consistent with `found` and `perPage`, and each supplied filter narrows the set. (SC-002/SC-003/SC-006)

Invalid params → `400`, backend not called:

```bash
curl -s -o /dev/null -w '%{http_code}\n' 'http://localhost:3000/api/search?page=abc'      # → 400
curl -s -o /dev/null -w '%{http_code}\n' 'http://localhost:3000/api/search?inStock=maybe'  # → 400
```

## 3. Product detail (US3 / SC-005)

```bash
# pick a real id from search, then:
curl -s http://localhost:3000/api/products/17 | jq '.product | {id,title,inStock,releasedAt,description}'

# missing id → 404
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/products/does-not-exist   # → 404
```

- Confirm the detail body exposes only DTO fields (no `source_hash`, `imported_at`, `created_at`, `updated_at`). (SC-006)

## 4. No product UI beyond placeholder (SC-008)

```bash
curl -s http://localhost:3000/ | grep -i "placeholder\|DS Product Discovery" | head
```

- The home route is still the Spec 001 placeholder — no search box, grid, or filters were added.

## Success-criteria map

| Step | Criteria |
|---|---|
| Automated gate green, no engines | SC-007 |
| Health 200 both-up / 503 any-down, secret-free | SC-001 / SC-006 |
| Search envelope + pagination + filters | SC-002 / SC-003 |
| Invalid params → 400, backend untouched | SC-004 |
| Detail 200 for real id, 404 for missing | SC-005 |
| DTO-only bodies, admin key never exposed | SC-006 |
| Placeholder home unchanged | SC-008 |
