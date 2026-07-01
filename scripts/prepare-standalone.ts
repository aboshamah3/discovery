import { cpSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { computeStandaloneCopyPlan } from "./standalone-copy-plan";

/**
 * Post-build step for the Next.js standalone output (Spec 006). Copies the
 * static assets Next does not place in the standalone tree so the produced
 * server serves `/_next/static/*`. Run by `pnpm build` after `next build`.
 * Fails loudly if the build has not been run (constitution III).
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const standaloneDir = join(repoRoot, "apps", "web", ".next", "standalone");

if (!existsSync(standaloneDir)) {
  console.error(
    "prepare-standalone: apps/web/.next/standalone not found. " +
      "Run the web build first (needs next.config output:'standalone').",
  );
  process.exit(1);
}

const plan = computeStandaloneCopyPlan(repoRoot, existsSync);
for (const { from, to } of plan) {
  if (!existsSync(from)) {
    console.warn(`prepare-standalone: skipping missing source ${from}`);
    continue;
  }
  cpSync(from, to, { recursive: true });
  console.log(`prepare-standalone: copied ${from} -> ${to}`);
}
console.log(
  `prepare-standalone: done (${plan.length} entr${plan.length === 1 ? "y" : "ies"}).`,
);
