import { parseProduct, type NormalizedProduct } from "@ds/shared";

/**
 * Import orchestration for DS Product Discovery (Spec 003).
 *
 * `importProducts` is a pure, dependency-injected pipeline: it fetches the
 * untrusted feed, validates/normalizes every record through the Spec 002
 * `parseProduct` boundary, dedups valid records by stable id, upserts them in
 * bounded batches, and records a start→finish run outcome. The feed fetcher and
 * the two stores are injected (see `stores.ts` for the real Postgres/HTTP
 * implementations) so the whole pipeline is testable with in-memory fakes and
 * no database (see `import.test.ts`).
 */

/** Fetches the raw feed; the real impl asserts a 2xx + JSON-array payload. */
export type FeedFetcher = (url: string) => Promise<unknown[]>;

/** Upsert sink for normalized products. Returns rows actually inserted/updated. */
export interface ProductStore {
  upsertBatch(products: NormalizedProduct[]): Promise<number>;
}

/** Terminal status distinguishing a successful run from a failed one. */
export type ImportStatus = "success" | "failed";

/** The outcome recorded against a run when it reaches a terminal state. */
export interface ImportOutcome {
  status: ImportStatus;
  fetched: number;
  valid: number;
  invalid: number;
  written: number;
  /** Set only when `status === "failed"`. */
  errorMessage?: string;
}

/** Sink for the import-run observability record. */
export interface ImportRunStore {
  /** Open a run (status "running"); returns its id. */
  start(sourceUrl: string): Promise<string>;
  /** Close a run with its terminal outcome. */
  finish(id: string, outcome: ImportOutcome): Promise<void>;
}

/** Minimal logger surface (defaults to `console`). */
export type ImportLogger = Pick<Console, "log" | "error">;

/** Everything `importProducts` needs, all injectable. */
export interface ImportDeps {
  sourceUrl: string;
  batchSize: number;
  fetchFeed: FeedFetcher;
  products: ProductStore;
  runs: ImportRunStore;
  logger?: ImportLogger;
}

/** The result of a completed (successful) import. */
export interface ImportSummary {
  runId: string;
  status: ImportStatus;
  fetched: number;
  valid: number;
  invalid: number;
  written: number;
  batches: number;
  errorMessage?: string;
}

/** Split `items` into consecutive slices of at most `size`. */
function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

/**
 * Run one import. Records a run outcome in all paths; on a fatal error it marks
 * the run "failed" (with a message) and re-throws so the caller can fail loudly
 * (non-zero exit). Never writes anything outside the injected stores.
 */
export async function importProducts(deps: ImportDeps): Promise<ImportSummary> {
  const { sourceUrl, batchSize, fetchFeed, products, runs } = deps;
  const logger: ImportLogger = deps.logger ?? console;

  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error(`batchSize must be a positive integer, got ${String(batchSize)}`);
  }

  const runId = await runs.start(sourceUrl);
  let fetched = 0;
  let valid = 0;
  let invalid = 0;
  let written = 0;
  let batches = 0;

  try {
    logger.log(`import starting — source=${sourceUrl} batchSize=${batchSize}`);

    const feed = await fetchFeed(sourceUrl);
    fetched = feed.length;

    // Validate/normalize every untrusted record; dedup valid ones by stable id
    // (last occurrence wins) so a single feed never upserts one id twice.
    const deduped = new Map<string, NormalizedProduct>();
    for (const element of feed) {
      const result = parseProduct(element);
      if (result.success) {
        valid++;
        deduped.set(result.data.id, result.data);
      } else {
        invalid++;
      }
    }

    const records = [...deduped.values()];
    for (const group of chunk(records, batchSize)) {
      written += await products.upsertBatch(group);
      batches++;
    }

    await runs.finish(runId, { status: "success", fetched, valid, invalid, written });
    logger.log(
      `import complete — status=success fetched=${fetched} valid=${valid} ` +
        `invalid=${invalid} written=${written} batches=${batches}`,
    );
    return { runId, status: "success", fetched, valid, invalid, written, batches };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await runs.finish(runId, { status: "failed", fetched, valid, invalid, written, errorMessage });
    logger.error(`import failed — ${errorMessage}`);
    throw error;
  }
}
