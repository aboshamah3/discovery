import { runSmoke } from "@ds/search";

/**
 * CLI entrypoint for a smoke search (Spec 004). Run via `pnpm smoke:search [query]`.
 * Exits non-zero if no results are returned or the search errors.
 */
runSmoke(process.argv[2])
  .then((count) => {
    process.exit(count > 0 ? 0 : 1);
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
