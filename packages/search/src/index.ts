/**
 * @ds/search — the DS Product Discovery Typesense search foundation (Spec 004).
 *
 * Pure logic (`toSearchDocument`, `buildSearchParams`) plus the engine-coupled
 * client/collection/reindex helpers and the `runReindex`/`runSmoke` CLIs.
 * Typesense is a rebuildable index derived from PostgreSQL; the admin key stays
 * server-side only.
 */
export {
  toSearchDocument,
  type ProductRow,
  type ProductSearchDocument,
} from "./document";
export {
  buildSearchParams,
  DEFAULT_PER_PAGE,
  DEFAULT_SORT,
  MAX_PER_PAGE,
  type SearchFilters,
  type SearchInput,
  type SearchRequestParams,
} from "./query";
export { collectionName, productsCollectionSchema } from "./schema";
export { getSearchClient } from "./client";
export { ensureCollection } from "./collection";
export {
  reindexProducts,
  type ProductReader,
  type ReindexDeps,
  type ReindexLogger,
  type ReindexSummary,
  type SearchIndex,
} from "./reindex";
export { createDbProductReader, createTypesenseIndex } from "./stores";
export { runReindex, runSmoke } from "./run";
