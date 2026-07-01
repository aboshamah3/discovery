import { runImport } from "@ds/import";

/**
 * CLI entrypoint for the product import (Spec 003). Run via `pnpm import:products`.
 * All logic lives in `@ds/import`; this launcher only maps the outcome to a
 * process exit code so failures are visible to the shell / CI (FR-009).
 */
runImport()
  .then((summary) => {
    process.exit(summary.status === "success" ? 0 : 1);
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
