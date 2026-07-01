import { describe, expect, it } from "vitest";

import { importProducts, type ImportDeps } from "./import";
import {
  changedFeed,
  duplicateFeed,
  FakeImportRunStore,
  FakeProductStore,
  mixedFeed,
  staticFetcher,
  throwingFetcher,
  validFeed,
} from "./fixtures";

/** Build deps with sane defaults; override per test. A silent logger by default. */
function makeDeps(overrides: Partial<ImportDeps> = {}): ImportDeps {
  const products = new FakeProductStore();
  const runs = new FakeImportRunStore();
  return {
    sourceUrl: "https://example.test/items.json",
    batchSize: 500,
    fetchFeed: staticFetcher(validFeed),
    products,
    runs,
    logger: { log: () => {}, error: () => {} },
    ...overrides,
  };
}

describe("importProducts — US1: populate the store", () => {
  it("writes one row per valid record and reports a successful summary", async () => {
    const deps = makeDeps({ fetchFeed: staticFetcher(validFeed) });
    const summary = await importProducts(deps);

    expect(summary.status).toBe("success");
    expect(summary.fetched).toBe(3);
    expect(summary.valid).toBe(3);
    expect(summary.invalid).toBe(0);
    expect(summary.written).toBe(3);
    expect((deps.products as FakeProductStore).rows.size).toBe(3);
    expect([...(deps.products as FakeProductStore).rows.keys()].sort()).toEqual(["1", "2", "3"]);
  });

  it("skips malformed records, counts them invalid, and still succeeds", async () => {
    const deps = makeDeps({ fetchFeed: staticFetcher(mixedFeed) });
    const summary = await importProducts(deps);

    expect(summary.status).toBe("success");
    expect(summary.fetched).toBe(6);
    expect(summary.valid).toBe(3);
    expect(summary.invalid).toBe(3);
    expect(summary.written).toBe(3);
    // Count invariants (SC-004).
    expect(summary.fetched).toBe(summary.valid + summary.invalid);
    expect(summary.written).toBeLessThanOrEqual(summary.valid);
    expect((deps.products as FakeProductStore).rows.size).toBe(3);
  });

  it("normalizes before writing (string id, numeric price, Date releasedAt)", async () => {
    const deps = makeDeps({ fetchFeed: staticFetcher(validFeed) });
    await importProducts(deps);

    const row = (deps.products as FakeProductStore).rows.get("1");
    expect(row).toBeDefined();
    expect(typeof row?.id).toBe("string");
    expect(row?.price).toBe(101);
    expect(row?.releasedAt).toBeInstanceOf(Date);
  });
});

describe("importProducts — US2: idempotent re-run", () => {
  it("re-running the same feed adds no duplicates and writes nothing the second time", async () => {
    const products = new FakeProductStore();
    const runs = new FakeImportRunStore();
    const base = { products, runs, fetchFeed: staticFetcher(validFeed) };

    const first = await importProducts(makeDeps(base));
    const second = await importProducts(makeDeps(base));

    expect(first.written).toBe(3);
    expect(second.written).toBe(0); // hash guard: nothing changed
    expect(products.rows.size).toBe(3); // no duplication
  });

  it("updates exactly the changed record in place", async () => {
    const products = new FakeProductStore();
    const runs = new FakeImportRunStore();

    await importProducts(makeDeps({ products, runs, fetchFeed: staticFetcher(validFeed) }));
    const before = products.rows.get("2")?.sourceHash;

    const changed = await importProducts(
      makeDeps({ products, runs, fetchFeed: staticFetcher(changedFeed) }),
    );

    expect(changed.written).toBe(1); // only product 2 changed
    expect(products.rows.size).toBe(3); // still 3 rows
    expect(products.rows.get("2")?.price).toBe(999.99);
    expect(products.rows.get("2")?.sourceHash).not.toBe(before);
    expect(products.rows.get("1")?.price).toBe(101); // others untouched
  });

  it("collapses duplicate ids within one feed (last-write-wins)", async () => {
    const deps = makeDeps({ fetchFeed: staticFetcher(duplicateFeed) });
    const summary = await importProducts(deps);

    const store = deps.products as FakeProductStore;
    expect(store.rows.size).toBe(1);
    expect(store.rows.get("1")?.title).toBe("Second");
    expect(summary.written).toBe(1);
  });
});

describe("importProducts — US3: run-record outcome", () => {
  it("records start then a successful finish with the counts", async () => {
    const runs = new FakeImportRunStore();
    const deps = makeDeps({ runs, fetchFeed: staticFetcher(mixedFeed) });
    const summary = await importProducts(deps);

    expect(runs.startCalls).toEqual([deps.sourceUrl]);
    expect(runs.finished).toHaveLength(1);
    expect(runs.lastOutcome()).toMatchObject({
      status: "success",
      fetched: 6,
      valid: 3,
      invalid: 3,
      written: summary.written,
    });
    expect(runs.lastOutcome()?.errorMessage).toBeUndefined();
  });

  it("records a failed run with an error message and re-throws when fetching fails", async () => {
    const runs = new FakeImportRunStore();
    const deps = makeDeps({ runs, fetchFeed: throwingFetcher("source unreachable") });

    await expect(importProducts(deps)).rejects.toThrow("source unreachable");
    expect(runs.lastOutcome()).toMatchObject({ status: "failed" });
    expect(runs.lastOutcome()?.errorMessage).toContain("source unreachable");
    expect(runs.finished).toHaveLength(1);
  });

  it("treats an empty feed as a successful zero-count run", async () => {
    const deps = makeDeps({ fetchFeed: staticFetcher([]) });
    const summary = await importProducts(deps);

    expect(summary).toMatchObject({ status: "success", fetched: 0, valid: 0, invalid: 0, written: 0, batches: 0 });
    expect((deps.products as FakeProductStore).rows.size).toBe(0);
  });
});

describe("importProducts — US4: bounded batches", () => {
  it("writes in chunks of batchSize and matches an unbatched run", async () => {
    const batched = makeDeps({ batchSize: 2, fetchFeed: staticFetcher(validFeed) });
    const batchedSummary = await importProducts(batched);

    expect(batchedSummary.batches).toBe(2); // ceil(3 / 2)
    expect((batched.products as FakeProductStore).upsertCalls).toBe(2);
    expect(batchedSummary.written).toBe(3);

    const single = makeDeps({ batchSize: 500, fetchFeed: staticFetcher(validFeed) });
    const singleSummary = await importProducts(single);

    expect(singleSummary.batches).toBe(1);
    expect((single.products as FakeProductStore).upsertCalls).toBe(1);
    // Same final store state regardless of batch size.
    expect((batched.products as FakeProductStore).rows.size).toBe(
      (single.products as FakeProductStore).rows.size,
    );
  });

  it("rejects a non-positive batch size", async () => {
    const deps = makeDeps({ batchSize: 0 });
    await expect(importProducts(deps)).rejects.toThrow(/batchSize/);
  });
});
