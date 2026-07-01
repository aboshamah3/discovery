# DS Product Discovery

Fast, one-page product discovery powered by a real search engine (Typesense),
backed by PostgreSQL. This repository is built spec-by-spec; see
[`DS_PROJECT_SPEC_PLAN.md`](./DS_PROJECT_SPEC_PLAN.md) and [`specs/`](./specs).

> **Status:** Spec 005 — Backend API Contracts. `apps/web` now exposes three
> read endpoints: `GET /api/health` (real PostgreSQL + Typesense probes),
> `GET /api/search` (Typesense-backed, validated query/filters/pagination/facets),
> and `GET /api/products/[id]` (PostgreSQL-backed detail). All input is Zod-validated
> at the boundary and every failure uses one consistent error envelope. Builds on the
> Spec 004 search foundation. PostgreSQL stays the source of truth; the Typesense admin
> key stays server-side. No product UI yet (Spec 007) — the home route is a placeholder.

## Stack

- **App:** Next.js 15 (App Router) + TypeScript, React 19
- **Monorepo:** pnpm 9 workspaces (`apps/*`, `packages/*`)
- **Database:** PostgreSQL 16 (source of truth) — direct access via `pg`, **no ORM**; SQL migrations
- **Search:** Typesense 27 (rebuildable index) — client in Spec 004
- **Tests:** Vitest · **Lint:** ESLint 9 (flat config)

## Layout

```
apps/web              # Next.js app (placeholder page + /api/health)
packages/shared       # Shared constants & types (@ds/shared)
packages/db           # PostgreSQL access (@ds/db) — pg client + SQL migrations (no ORM)
packages/search       # Typesense client home (@ds/search) — placeholder until Spec 004
packages/import       # Catalog import pipeline (@ds/import) — fetch → validate → upsert
packages/config       # Shared TS base config (@ds/config)
scripts/              # import-products.ts (Spec 003); reindex/smoke added in later specs
docker-compose.yml    # Local Postgres + Typesense
```

## Prerequisites

- Node.js 20+ (`.nvmrc` pins 20) — `corepack enable` to get pnpm
- pnpm 9
- Docker + Docker Compose

## Quick start

```bash
pnpm install            # install all workspace deps
cp .env.example .env    # local config (safe placeholder defaults)
docker compose up -d    # start Postgres (5432) + Typesense (8108)
pnpm dev                # start the app on http://localhost:3000
```

Verify:

```bash
curl http://localhost:3000/api/health      # {"ok":true,"services":{"database":"ok","search":"ok"}}
curl http://localhost:8108/health          # Typesense {"ok":true}
open http://localhost:3000                 # placeholder page
```

## Database (Spec 002)

PostgreSQL is the source of truth, accessed directly via `pg` — **no ORM**. The schema
lives as plain SQL files in [`packages/db/migrations/`](./packages/db/migrations) and is
applied by an idempotent runner:

```bash
pnpm db:migrate    # apply pending migrations (safe to re-run)
```

This creates `products` (the canonical catalog store) and `import_runs` (import
observability). Reads `DATABASE_URL` from `.env`. Validation/normalization of the source
feed lives in `@ds/shared` (`rawProductSchema`, `normalizeProduct`, `parseProduct`).

> If port `5432` is already in use by a host PostgreSQL, either stop it or point
> `DATABASE_URL` at another port before `docker compose up -d` / `pnpm db:migrate`.

## Import the catalog (Spec 003)

With the database migrated, load the catalog from the source feed into PostgreSQL:

```bash
pnpm import:products      # fetch PRODUCTS_SOURCE_URL → validate → upsert into products
```

- **Idempotent**: re-running never duplicates — products are upserted by stable `id`,
  and unchanged records (matched on a content hash) are skipped (`written=0`).
- **Bounded batches**: writes in chunks of `IMPORT_BATCH_SIZE` (default `500`).
- **Observable**: every run appends a row to `import_runs` with status, the
  fetched/valid/invalid/written counts, timing, and any error.
- **Fails loudly**: an unreachable source, non-2xx response, or malformed payload
  records a `failed` run and exits non-zero (nothing partial is written as success).

Config (from `.env`): `PRODUCTS_SOURCE_URL` (required), `IMPORT_BATCH_SIZE` (optional).
The pipeline logic lives in `@ds/import`; `scripts/import-products.ts` is the thin CLI.

## Search index (Spec 004)

With PostgreSQL populated, build the Typesense index and try a search:

```bash
pnpm reindex:products      # ensure the collection, then rebuild it from PostgreSQL
pnpm smoke:search "rattan" # run a sample search and print the top hits
```

- **Rebuildable index**: every document is derived solely from a PostgreSQL row —
  drop the collection and `reindex:products` reconstructs it from scratch. PostgreSQL
  stays the source of truth; Typesense is never authoritative.
- **Idempotent**: documents are upserted by `id`, so re-running never duplicates.
- **Bounded batches**: indexes in chunks of `REINDEX_BATCH_SIZE` (default `500`) and
  reports products-read / documents-indexed.
- **Search**: `buildSearchParams` gives typo tolerance, prefix matching, relevance
  ranking (then rating, then reviews), filters (brand/category/tag/inStock), and a
  page size that defaults to 24 and is capped at 60.

Config (from `.env`): `TYPESENSE_HOST/PORT/PROTOCOL/API_KEY`, `TYPESENSE_PRODUCTS_COLLECTION`,
`REINDEX_BATCH_SIZE`. The **admin** `TYPESENSE_API_KEY` is server-side only — never exposed
to the browser. Logic lives in `@ds/search`; `scripts/reindex-products.ts` and
`scripts/smoke-search.ts` are the thin CLIs. The product-facing search API is Spec 005.

## API (Spec 005)

With PostgreSQL populated and the index built (above), the app serves three read
endpoints. Start it with `pnpm dev` (http://localhost:3000).

```bash
curl -i http://localhost:3000/api/health                 # 200 both up, 503 if any dep down
curl -s 'http://localhost:3000/api/search?q=shirt&brand=Acme&inStock=true&page=1&perPage=24'
curl -s http://localhost:3000/api/products/17            # 200, or 404 if unknown
```

- **`GET /api/health`** — real reachability probes; preserves the
  `{ ok, services: { database, search } }` shape (200 all-up, 503 any-down).
- **`GET /api/search`** — `q, page, perPage, sort, brand, category, tag, inStock`;
  returns `{ query, page, perPage, found, totalPages, hasMore, results, facets? }`.
  Page size defaults to 24, capped at 60 (reused from `@ds/search`). Invalid params
  → `400` without touching the engine.
- **`GET /api/products/[id]`** — `{ product }` detail from PostgreSQL, or `404`.
- **Errors** — every failure returns `{ error: { code, message } }` with a stable
  code (`bad_request` 400 · `not_found` 404 · `internal` 500 · `unavailable` 503).
  Responses expose only documented DTO fields — never the admin key or internal
  columns (`source_hash`, import bookkeeping).

Pure logic lives in `apps/web/src/lib/api/*` (validation, DTO mapping, pagination,
errors, health aggregation); engine/DB access is isolated in `apps/web/src/lib/server/*`.
Contract: [`specs/005-backend-api-contracts/contracts/api.contract.md`](./specs/005-backend-api-contracts/contracts/api.contract.md).

## Quality gates

```bash
pnpm lint         # ESLint across the workspace
pnpm typecheck    # tsc --noEmit in every package/app
pnpm test         # Vitest (pure lib logic + route handlers with mocked adapters)
```

## Notes

- Never commit real secrets. Only `.env.example` (placeholders) is tracked; `.env` is git-ignored.
- The Typesense **admin** key is server-side only — never exposed to the browser.
- Tear down services: `docker compose down` (add `-v` to drop volumes).
