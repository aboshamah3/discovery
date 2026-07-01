import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { computeStandaloneCopyPlan } from "./standalone-copy-plan";

describe("computeStandaloneCopyPlan", () => {
  it("always copies .next/static into the standalone tree", () => {
    const plan = computeStandaloneCopyPlan("/repo", () => false);
    expect(plan).toHaveLength(1);
    expect(plan[0]?.from).toContain(join("apps", "web", ".next", "static"));
    expect(plan[0]?.to).toContain(
      join("apps", "web", ".next", "standalone", "apps", "web", ".next", "static"),
    );
  });

  it("includes public/ only when it exists", () => {
    const withPublic = computeStandaloneCopyPlan("/repo", (p) => p.endsWith("public"));
    expect(withPublic).toHaveLength(2);
    expect(withPublic[1]?.from).toContain(join("apps", "web", "public"));
    expect(withPublic[1]?.to).toContain(
      join("apps", "web", ".next", "standalone", "apps", "web", "public"),
    );
  });

  it("omits public/ when it is absent", () => {
    const plan = computeStandaloneCopyPlan("/repo", () => false);
    expect(plan.some((entry) => entry.from.endsWith("public"))).toBe(false);
  });
});
