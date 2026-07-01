/**
 * @ds/import — the DS Product Discovery catalog import pipeline (Spec 003).
 *
 * `importProducts` is the dependency-injected core; `stores.ts` provides the
 * real HTTP + Postgres implementations; `runImport` wires them from env for the
 * `pnpm import:products` CLI.
 */
export {
  importProducts,
  type FeedFetcher,
  type ImportDeps,
  type ImportLogger,
  type ImportOutcome,
  type ImportRunStore,
  type ImportStatus,
  type ImportSummary,
  type ProductStore,
} from "./import";
export { createDbImportRunStore, createDbProductStore, httpFetchFeed } from "./stores";
export { runImport } from "./run";
