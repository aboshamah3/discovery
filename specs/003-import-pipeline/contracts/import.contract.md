# Contract: Import Pipeline (`@ds/import` + CLI)

**Feature**: 003-import-pipeline | **Date**: 2026-06-30

Defines the stable surface the import exposes. Implementation lives in `packages/import`; the operational entrypoint is `scripts/import-products.ts`.

## CLI contract

| Aspect | Contract |
|---|---|
| Command | `pnpm import:products` (root script → `tsx scripts/import-products.ts`) |
| Config in | `PRODUCTS_SOURCE_URL` (required), `IMPORT_BATCH_SIZE` (optional, default `500`), `DATABASE_URL` (required, from Spec 001) — all via env |
| Precondition | `pnpm db:migrate` has run (tables exist) |
| Output | Human-readable progress + a final summary line with status and the four counts |
| Exit code | `0` on `success`; non-zero on `failed` (missing config, unreachable/non-2xx source, malformed payload, write error) |
| Side effects | Upserts rows in `products`; appends one row to `import_runs`. No other writes. No search index, no UI. |

## Core function

```ts
function importProducts(deps: ImportDeps): Promise<ImportSummary>;
```

Orchestrates: `start` run record → fetch feed → validate/normalize each element (tally valid/invalid) → dedup valid by id (last-wins) → batch-upsert → `finish` run record (success). On any thrown error it records the run as `failed` (with `error_message`) and rethrows so the CLI can set a non-zero exit. `run.ts` catches, logs, and maps to the exit code.

## Injected dependencies

```ts
interface ImportDeps {
  sourceUrl: string;                 // resolved PRODUCTS_SOURCE_URL
  batchSize: number;                 // resolved IMPORT_BATCH_SIZE (>=1)
  fetchFeed: FeedFetcher;            // url -> raw element list
  products: ProductStore;            // upsert sink
  runs: ImportRunStore;              // run-record sink
  logger?: Pick<Console, "log" | "error">;  // defaults to console
}

type FeedFetcher = (url: string) => Promise<unknown[]>;
// Real impl asserts 2xx + Array payload; throws on network/HTTP/shape failure.

interface ProductStore {
  // Upserts a batch keyed by id with the hash guard; returns rows actually written.
  upsertBatch(products: NormalizedProduct[]): Promise<number>;
}

interface ImportRunStore {
  start(sourceUrl: string): Promise<string>;          // returns run id; status 'running'
  finish(id: string, outcome: ImportOutcome): Promise<void>;
}

interface ImportOutcome {
  status: "success" | "failed";
  fetched: number;
  valid: number;
  invalid: number;
  written: number;
  errorMessage?: string;             // set only when status === 'failed'
}
```

## Result type

```ts
interface ImportSummary {
  runId: string;
  status: "success" | "failed";
  fetched: number;
  valid: number;
  invalid: number;
  written: number;                   // == sum of upsertBatch return values
  batches: number;
  errorMessage?: string;
}
```

## Behavioral guarantees (map to spec)

| Guarantee | Requirement |
|---|---|
| Every untrusted element passes through `parseProduct` before any write | FR-003 |
| Invalid elements are counted and skipped; the run continues | FR-007 / SC-004 |
| Valid records upserted by stable `id`; re-run never duplicates | FR-004 / SC-002 |
| Unchanged records (same `source_hash`) are not rewritten; `written` reflects only real changes | FR-005 / SC-003 |
| Records written in chunks of `batchSize`; never one unbounded write | FR-006 / SC-006 |
| One `import_runs` row per run, start→finish, with counts + timing | FR-008 / SC-005 |
| Fatal conditions → `failed` run + `error_message` + non-zero exit; never silent | FR-009 / SC-005 |
| Final summary printed to console | FR-010 |
| No search index, no UI written | FR-012 / SC-008 |

## Real-dependency implementations (`stores.ts`)

- `httpFetchFeed(url)`: `fetch(url)` → assert `res.ok` (else throw with status) → `res.json()` → assert `Array.isArray` (else throw) → return the array.
- `createDbProductStore()`: builds the multi-row `INSERT … ON CONFLICT (id) DO UPDATE … WHERE source_hash IS DISTINCT FROM EXCLUDED.source_hash` from a batch and returns `result.rowCount ?? 0` via `@ds/db` `query`.
- `createDbImportRunStore()`: `start` → `INSERT INTO import_runs (source_url, status) VALUES ($1,'running') RETURNING id`; `finish` → `UPDATE import_runs SET status,…counts…, finished_at = now(), error_message WHERE id = $…`.
- `runImport()`: resolves env (validating presence/format), wires the three real deps, calls `importProducts`, prints the summary, and always `closePool()`s in a `finally`.
