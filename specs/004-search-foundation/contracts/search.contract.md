# Contract: Search Foundation (`@ds/search` + CLIs)

**Feature**: 004-search-foundation | **Date**: 2026-06-30

Defines the stable surface the search layer exposes. Implementation lives in `packages/search`; operational entrypoints are `scripts/reindex-products.ts` and `scripts/smoke-search.ts`.

## CLI contracts

| Command | Behavior |
|---|---|
| `pnpm reindex:products` | Ensure the collection exists, then rebuild it from Postgres in bounded batches. Prints products-read / documents-indexed and a status line. Exit `0` on success; non-zero on any engine/DB error. |
| `pnpm smoke:search [query]` | Run a representative search (default query if none given) and print the top results' id/title/score. Exit `0` if results returned; non-zero on error. |

**Config (env)**: `TYPESENSE_HOST`, `TYPESENSE_PORT`, `TYPESENSE_PROTOCOL`, `TYPESENSE_API_KEY` (admin, server-side only), `TYPESENSE_PRODUCTS_COLLECTION` (default `products`), `REINDEX_BATCH_SIZE` (default 500), `DATABASE_URL`. Precondition: `pnpm db:migrate` + `pnpm import:products` have populated Postgres.

## Pure functions (engine-independent, unit-tested)

```ts
/** Map one Postgres product row to its search document (see data-model.md). */
function toSearchDocument(row: ProductRow): ProductSearchDocument;

/** Build Typesense search parameters from engine-independent input (§6.4). */
function buildSearchParams(input: SearchInput): SearchParameters;
```

- `toSearchDocument`: total, never throws; derives `releasedAtTimestamp` (Unix seconds) from `released_at`; `reviews` always present (null → 0); omits absent optionals.
- `buildSearchParams`: total; `q` → `*` when blank; `per_page` default 24 clamped to `[1,60]`; `page` ≥ 1; `filter_by` composed from filters (omitted when none); fixed weighting/typo/ranking per §6.4.

## Collection schema + client

```ts
/** The §6.3 product collection schema (name from env). */
const productsCollectionSchema: CollectionCreateSchema;

/** Build a server-side Typesense admin client from env (never browser-exposed). */
function getSearchClient(): Client;

/** Idempotent: create the collection if missing; no-op (no data loss) if present. */
function ensureCollection(client: Client): Promise<void>;
```

## Reindex orchestration (injected seams)

```ts
function reindexProducts(deps: ReindexDeps): Promise<ReindexSummary>;

interface ProductReader {
  /** Stream products from Postgres in bounded batches. */
  streamBatches(batchSize: number): AsyncIterable<ProductRow[]>;
}

interface SearchIndex {
  ensure(): Promise<void>;                              // ensureCollection
  indexBatch(docs: ProductSearchDocument[]): Promise<number>;  // returns indexed count; throws on failures
}

interface ReindexDeps {
  reader: ProductReader;
  index: SearchIndex;
  batchSize: number;
  logger?: Pick<Console, "log" | "error">;
}

interface ReindexSummary {
  productsRead: number;
  documentsIndexed: number;
  batches: number;
}
```

`reindexProducts`: `index.ensure()` → for each batch from `reader.streamBatches(batchSize)`, map rows via `toSearchDocument`, `index.indexBatch(docs)`, accumulate counts → return summary. Fails loudly if a batch import reports failures; never reports success on a partial run.

## Real implementations (`stores.ts`)

- `createDbProductReader()`: `streamBatches` pages `products` with keyset pagination on `id` (`SELECT … FROM products WHERE id > $1 ORDER BY id LIMIT $2`, casting `price::double precision`), yielding arrays until exhausted.
- `createTypesenseIndex(client)`: `ensure()` → `ensureCollection(client)`; `indexBatch(docs)` → `client.collections(name).documents().import(docs, { action: "upsert" })`, parse the per-line results, throw on any failure, return the success count.
- `runReindex()` / `runSmoke(query)`: load `.env`, wire real reader/index/client, run, print summary, `closePool()` in `finally`.

## Behavioral guarantees (map to spec)

| Guarantee | Requirement |
|---|---|
| Collection schema covers all search/filter/sort fields | FR-001 / SC-001 |
| `ensureCollection` idempotent, no doc loss | FR-002 / SC-001 |
| Reindex reads all products from Postgres, one doc each | FR-003 / SC-002 |
| Reindex repeatable, upsert-by-id, rebuildable from PG alone | FR-004/006 / SC-003/004 |
| Bounded batches + reported counts | FR-005 / SC-005 |
| Release-date→timestamp; missing optionals omitted | FR-007 |
| Query builder: typo/prefix/ranking, page-size cap, filters | FR-008/009/010/011 / SC-006 |
| Admin key server-side only | FR-012 / SC-009 |
| Smoke search returns expected results | FR-013 / SC-007 |
| Pure logic unit-tested | FR-014 / SC-008 |
| No API route, no frontend | FR-015 / SC-009 |
