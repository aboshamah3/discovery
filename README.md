# DS Product Discovery

Fast, one-page product discovery powered by a real search engine (Typesense),
backed by PostgreSQL. This repository is built spec-by-spec; see
[`DS_PROJECT_SPEC_PLAN.md`](./DS_PROJECT_SPEC_PLAN.md) and [`specs/`](./specs).

> **Status:** Spec 006 — Railway Deployment Foundation. The backend now deploys to
> Railway from committed config ([`railway.json`](./railway.json)): a Next.js standalone
> build, gated pre-deploy migrations (`pnpm db:migrate`), and `/api/health` as the
> readiness check — see [Deployment](#deployment--railway-spec-006). Builds on Spec 005's
> three read endpoints (`GET /api/health`, `GET /api/search`, `GET /api/products/[id]`,
> Zod-validated with one consistent error envelope). PostgreSQL stays the source of truth;
> the Typesense admin key stays server-side. No product UI yet (Spec 007) — the home route
> is a placeholder.

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
scripts/              # CLIs: import-products, reindex-products, smoke-search; prepare-standalone (Spec 006)
railway.json          # Railway deploy config-as-code (Spec 006)
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

## Frontend — Product Discovery (Spec 007)

The one-page discovery UI is served at `/` and **adopts the Metronic v9.4.0 storefront
`search-results` component** (only the look is Metronic; behaviour and data are ours). It calls the
Spec 005 API — so it needs PostgreSQL + Typesense running and the catalog imported + indexed
(sections above). Start it with `pnpm dev` and open http://localhost:3000.

```bash
docker compose up -d && pnpm db:migrate && pnpm import:products && pnpm reindex:products
pnpm dev            # http://localhost:3000
```

What you get:

- **As-you-type search** — debounced (~250 ms), results replace in place with no page reload.
- **Grid / list** — a toggle switches layouts (ported Metronic `Card2` / `Card3`).
- **Sort** — dropdown mapped to the API `sort` param (relevance, price, rating, reviews, newest).
- **Infinite scroll** — the next page appends automatically while `hasMore` is true.
- **Quick-view** — clicking a product opens a modal populated from `GET /api/products/[id]`.
- **States** — skeleton while loading, a clear empty state, and an error state that keeps the page
  usable; missing/broken images fall back to a placeholder.

The shell is a centered wordmark header only — no sidebar, no topbar, and no cart/checkout/wishlist
(YAGNI). The adopted Metronic slice is intentionally lean: `apps/web/src/components/ui/*` carries
only the primitives the page imports, and the design tokens live in `apps/web/src/app/globals.css`.
Contract: unchanged Spec 005 endpoints. See
[`specs/007-frontend-discovery/`](./specs/007-frontend-discovery) and
[`FRONTEND_PLAN.md`](./FRONTEND_PLAN.md).

## Deployment — Railway (Spec 006)

The backend foundation deploys to [Railway](https://railway.com) from committed
config-as-code ([`railway.json`](./railway.json)) — no console-only settings. The app
builds to a **Next.js standalone** server (`output: "standalone"` +
`outputFileTracingRoot`), migrations run as a gated pre-deploy step, and `/api/health`
is the platform readiness check. Contract:
[`specs/006-railway-deployment/contracts/deployment.contract.md`](./specs/006-railway-deployment/contracts/deployment.contract.md).

### What `railway.json` wires

| Phase | Command / value | Why |
|---|---|---|
| Build | `pnpm build` | `next build` (standalone) → `prepare-standalone.ts` copies `.next/static` into the bundle |
| Pre-deploy | `pnpm db:migrate` | apply pending SQL migrations **before** the new version serves (idempotent) |
| Start | `node apps/web/.next/standalone/apps/web/server.js` | run the self-contained server; binds Railway's `PORT` on `0.0.0.0` |
| Health check | `/api/health` | promote only when **both** PostgreSQL and Typesense are up (503 otherwise) |

> **Typesense must be reachable for a green deploy.** Because `/api/health` returns 503
> when search is down, provision the Typesense service before (or with) the app service.

### Railway services

1. **App** — this GitHub repo (Railway reads `railway.json`).
2. **PostgreSQL** — Railway plugin; provides `DATABASE_URL`.
3. **Typesense** — Docker image `typesense/typesense:27.1` with a persistent volume and an admin `--api-key`.

### Environment-variable checklist

Set these on the **app** service. This list matches exactly what the code reads
(`grep -rhoE "process\.env\.[A-Z_][A-Z0-9_]*" apps packages scripts`). The admin
`TYPESENSE_API_KEY` is **server-side only — never** set it as a `NEXT_PUBLIC_*` var.

| Variable | Required? | Default | Purpose | Example |
|---|---|---|---|---|
| `DATABASE_URL` | **Yes** | — | PostgreSQL connection (source of truth) | reference the Postgres plugin |
| `TYPESENSE_HOST` | **Yes** | — | Typesense host | `typesense.railway.internal` |
| `TYPESENSE_API_KEY` | **Yes** | — | Admin search key (server-side only) | `<admin-key>` |
| `TYPESENSE_PORT` | No | `8108` | Typesense port | `8108` |
| `TYPESENSE_PROTOCOL` | No | `http` | `http` / `https` | `http` |
| `TYPESENSE_PRODUCTS_COLLECTION` | No | `products` | Product collection name | `products` |
| `PRODUCTS_SOURCE_URL` | For import | — | Source catalog JSON URL | `https://media.downshift.app/hiring/founding-engineer/items.json` |
| `IMPORT_BATCH_SIZE` | No | `500` | Import batch size | `500` |
| `REINDEX_BATCH_SIZE` | No | `500` | Reindex batch size | `500` |
| `NEXT_PUBLIC_APP_NAME` | No | app default | Display name (browser-exposed by design) | `"DS Product Discovery"` |
| `PORT` | Provided | `3000` | Bound by the server | injected by Railway |
| `HOSTNAME` | No | `0.0.0.0` | Bind interface | `0.0.0.0` |

Not set on Railway: `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` (local
`docker-compose` only — the managed Postgres provides `DATABASE_URL`), and
`TYPESENSE_SEARCH_ONLY_API_KEY` (reserved for a future browser search-only key; no code reads it yet).

### Populate the catalog (manual, one-off — not in the deploy)

After the first successful deploy, load and index the catalog against production using
a Railway one-off command / service shell (deliberately **not** part of the pipeline):

```bash
pnpm import:products     # fetch PRODUCTS_SOURCE_URL → validate → upsert into PostgreSQL
pnpm reindex:products    # rebuild the Typesense index from PostgreSQL
```

Both are idempotent, so they are safe to re-run when the catalog changes.

### Verify locally without a Railway account

```bash
pnpm build                                   # standalone build + static copy
PORT=3999 pnpm start:standalone &            # run the produced server
curl -i http://localhost:3999/api/health     # 200 (deps up) / 503 (any dep down)
```

See [`specs/006-railway-deployment/quickstart.md`](./specs/006-railway-deployment/quickstart.md)
for the full verification + deploy runbook.

## Quality gates

```bash
pnpm lint         # ESLint across the workspace
pnpm typecheck    # tsc --noEmit in every package/app
pnpm test         # Vitest (pure lib logic + route handlers with mocked adapters)
pnpm build        # production build (Next standalone); DS_NO_STANDALONE=1 to skip the
                  # privileged symlink step when building locally on Windows
```

## Performance & accessibility (Spec 008)

Design expectations for the ~4,000-product catalog:

- **Instant-feel search** — Typesense ranks server-side; the client only debounces input (~250 ms)
  and never re-sorts. Results update without a full page reload.
- **No layout shift** — image containers reserve fixed dimensions and fall back to a placeholder, so
  a missing/slow image never reflows the grid.
- **Accessible controls** — the search box, sort control, and grid/list toggle expose accessible
  names; the results region announces its count politely (`aria-live`) and marks itself busy while
  fetching.

Not automatically gated in CI (they need a live stack + browser); verify manually before a release:

```bash
# with Postgres + Typesense up and the catalog indexed:
pnpm smoke:search shirt                       # confirms the engine returns ranked results
# then, against a running app (pnpm dev / start), run Lighthouse on http://localhost:3000
npx lighthouse http://localhost:3000 --view   # check Performance + Accessibility scores
curl -s -o /dev/null -w '%{time_total}s\n' 'http://localhost:3000/api/search?q=shirt'
```

## Release checklist

- [ ] `pnpm lint && pnpm typecheck && pnpm test` green.
- [ ] `pnpm build` compiles (standalone on Linux/CI).
- [ ] Migrations apply cleanly (`pnpm db:migrate`) against the target database.
- [ ] Catalog imported and indexed (`pnpm import:products && pnpm reindex:products`).
- [ ] `/api/health` returns 200 with both `database` and `search` up.
- [ ] Discovery page (`/`) searches, sorts, toggles grid/list, scrolls, and opens quick-view.
- [ ] Required env vars set on the app service (see the checklist above); no `NEXT_PUBLIC_*` admin key.
- [ ] Lighthouse Performance + Accessibility spot-checked on `/`.

## Notes

- Never commit real secrets. Only `.env.example` (placeholders) is tracked; `.env` is git-ignored.
- The Typesense **admin** key is server-side only — never exposed to the browser.
- Tear down services: `docker compose down` (add `-v` to drop volumes).
