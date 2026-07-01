import { join } from "node:path";

/**
 * Deployment helper (Spec 006). Next.js `output: "standalone"` does NOT copy
 * `apps/web/.next/static` or `apps/web/public` into the standalone tree, so the
 * running server would 404 on `/_next/static/*` without a copy step. This pure
 * function computes which source→destination pairs the copy step must move, so
 * the decision is unit-testable without touching the filesystem. The thin
 * `prepare-standalone.ts` launcher performs the actual copies.
 */

export interface CopyEntry {
  from: string;
  to: string;
}

const WEB = join("apps", "web");
const STANDALONE_WEB = join(WEB, ".next", "standalone", "apps", "web");

/**
 * @param repoRoot Absolute monorepo root.
 * @param exists   Predicate reporting whether an (optional) source path exists;
 *                 callers pass `fs.existsSync`, tests pass a fake.
 */
export function computeStandaloneCopyPlan(
  repoRoot: string,
  exists: (path: string) => boolean,
): CopyEntry[] {
  const abs = (...parts: string[]): string => join(repoRoot, ...parts);

  // `.next/static` always exists after a production build → always copied.
  const plan: CopyEntry[] = [
    {
      from: abs(WEB, ".next", "static"),
      to: abs(STANDALONE_WEB, ".next", "static"),
    },
  ];

  // `public/` is optional (none today) → copied only when present.
  const publicDir = abs(WEB, "public");
  if (exists(publicDir)) {
    plan.push({ from: publicDir, to: abs(STANDALONE_WEB, "public") });
  }

  return plan;
}
