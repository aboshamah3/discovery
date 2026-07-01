import { config } from "dotenv";

import { closePool } from "@ds/db";

import { importProducts, type ImportSummary } from "./import";
import { createDbImportRunStore, createDbProductStore, httpFetchFeed } from "./stores";

/** Load `.env` (root) before any env var is read. */
config();

const DEFAULT_BATCH_SIZE = 500;

/** Resolve and validate IMPORT_BATCH_SIZE; defaults to 500 when unset/blank. */
function resolveBatchSize(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_BATCH_SIZE;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`IMPORT_BATCH_SIZE must be a positive integer, got "${raw}"`);
  }
  return value;
}

/**
 * Wire the real env-backed dependencies and run one import. Resolves env
 * (failing loudly on missing config), executes the pipeline, and always closes
 * the connection pool. The summary is returned for the CLI to set its exit code.
 */
export async function runImport(): Promise<ImportSummary> {
  const sourceUrl = process.env.PRODUCTS_SOURCE_URL;
  if (!sourceUrl || sourceUrl.trim() === "") {
    throw new Error(
      "PRODUCTS_SOURCE_URL is not set. Copy .env.example to .env (see README) before importing.",
    );
  }
  const batchSize = resolveBatchSize(process.env.IMPORT_BATCH_SIZE);

  try {
    return await importProducts({
      sourceUrl,
      batchSize,
      fetchFeed: httpFetchFeed,
      products: createDbProductStore(),
      runs: createDbImportRunStore(),
    });
  } finally {
    await closePool();
  }
}
