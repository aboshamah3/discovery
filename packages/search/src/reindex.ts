import { toSearchDocument, type ProductRow, type ProductSearchDocument } from "./document";

/**
 * Reindex orchestration (Spec 004). Reads products from PostgreSQL in bounded
 * batches, maps each to a search document, and loads them into the collection.
 * The reader and index are injected (see `stores.ts` for the real Postgres /
 * Typesense implementations) so the loop is testable with in-memory fakes and
 * no engine (see `reindex.test.ts`).
 */

/** Streams products from the source of truth in bounded batches. */
export interface ProductReader {
  streamBatches(batchSize: number): AsyncIterable<ProductRow[]>;
}

/** The search index sink: ensure the collection, then upsert document batches. */
export interface SearchIndex {
  ensure(): Promise<void>;
  /** Upsert a batch; returns the number of documents successfully indexed. */
  indexBatch(docs: ProductSearchDocument[]): Promise<number>;
}

/** Minimal logger surface (defaults to `console`). */
export type ReindexLogger = Pick<Console, "log" | "error">;

export interface ReindexDeps {
  reader: ProductReader;
  index: SearchIndex;
  batchSize: number;
  logger?: ReindexLogger;
}

export interface ReindexSummary {
  productsRead: number;
  documentsIndexed: number;
  batches: number;
}

/**
 * Rebuild the index from PostgreSQL. Ensures the collection exists, then maps
 * and upserts each batch. Fails loudly if a batch indexes fewer documents than
 * it was given (never reports success on a partial run).
 */
export async function reindexProducts(deps: ReindexDeps): Promise<ReindexSummary> {
  const { reader, index, batchSize } = deps;
  const logger: ReindexLogger = deps.logger ?? console;

  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error(`batchSize must be a positive integer, got ${String(batchSize)}`);
  }

  await index.ensure();
  logger.log(`reindex starting — batchSize=${batchSize}`);

  let productsRead = 0;
  let documentsIndexed = 0;
  let batches = 0;

  for await (const rows of reader.streamBatches(batchSize)) {
    if (rows.length === 0) continue;
    productsRead += rows.length;
    const docs = rows.map(toSearchDocument);
    const indexed = await index.indexBatch(docs);
    if (indexed !== docs.length) {
      throw new Error(
        `batch ${batches + 1} indexed ${indexed}/${docs.length} documents — failing loudly`,
      );
    }
    documentsIndexed += indexed;
    batches += 1;
  }

  logger.log(
    `reindex complete — productsRead=${productsRead} documentsIndexed=${documentsIndexed} batches=${batches}`,
  );
  return { productsRead, documentsIndexed, batches };
}
