import { config } from "dotenv";

import { closePool } from "@ds/db";

import { getSearchClient } from "./client";
import { recreateCollection } from "./collection";
import type { ProductSearchDocument } from "./document";
import { buildSearchParams } from "./query";
import { reindexProducts, type ReindexSummary } from "./reindex";
import { collectionName } from "./schema";
import { createDbProductReader, createTypesenseIndex } from "./stores";

/** Load `.env` before any env var is read. */
config();

const DEFAULT_BATCH_SIZE = 500;

/** Resolve REINDEX_BATCH_SIZE; defaults to 500 when unset/blank. */
function resolveBatchSize(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_BATCH_SIZE;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`REINDEX_BATCH_SIZE must be a positive integer, got "${raw}"`);
  }
  return value;
}

/** Ensure the collection and rebuild the index from PostgreSQL. */
export async function runReindex(): Promise<ReindexSummary> {
  const client = getSearchClient();
  const batchSize = resolveBatchSize(process.env.REINDEX_BATCH_SIZE);
  try {
    // Rebuild from scratch so schema changes (e.g. the title infix index) apply;
    // reindexProducts' internal ensure() is then a no-op.
    await recreateCollection(client);
    return await reindexProducts({
      reader: createDbProductReader(),
      index: createTypesenseIndex(client),
      batchSize,
    });
  } finally {
    await closePool();
  }
}

/** Run a representative search and print the top hits (manual smoke check). */
export async function runSmoke(queryText?: string): Promise<number> {
  const client = getSearchClient();
  const name = collectionName();

  await createTypesenseIndex(client).ensure();
  const params = buildSearchParams({ q: queryText });
  const response = await client
    .collections<ProductSearchDocument>(name)
    .documents()
    .search(params, {});

  const hits = response.hits ?? [];
  console.log(`smoke search q="${params.q}" — found=${response.found}, showing ${hits.length}`);
  for (const hit of hits.slice(0, 10)) {
    console.log(`  ${hit.document.id}  ${hit.document.title}  (match ${String(hit.text_match ?? 0)})`);
  }
  return hits.length;
}
