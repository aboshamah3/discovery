import { runReindex } from "@ds/search";

/**
 * CLI entrypoint for the search reindex (Spec 004). Run via `pnpm reindex:products`.
 * Ensures the collection and rebuilds it from PostgreSQL; exit code reflects success.
 */
runReindex()
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
