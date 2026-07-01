import type { NormalizedProduct } from "@ds/shared";
import type { ImportOutcome, ImportRunStore, ProductStore } from "./import";

/**
 * Test fixtures + in-memory fakes for the import pipeline. Kept out of the test
 * file so the same fakes can be reused. All data is synthetic.
 */

/** A raw source record (the untrusted shape the feed delivers). */
type RawRecord = Record<string, unknown>;

/** Build a valid raw record shaped like the live feed, with overrides. */
function raw(id: number, overrides: RawRecord = {}): RawRecord {
  return {
    id,
    title: `Product ${id}`,
    brand: "Acme",
    category: "Storage",
    tags: ["alpha", "beta"],
    price: 100 + id,
    rating: 4.2,
    reviews: 10 + id,
    inStock: true,
    releasedAt: "2024-01-15",
    image: `https://example.test/img/${id}.png`,
    imageWidth: 500,
    imageHeight: 320,
    description: `Description for product ${id}.`,
    ...overrides,
  };
}

/** Three well-formed records. */
export const validFeed: unknown[] = [raw(1), raw(2), raw(3)];

/**
 * Valid + malformed records: missing `title`, negative `price`, and a
 * wrong-typed `reviews`. The three valid ones must survive; the three bad ones
 * must be counted invalid and skipped.
 */
export const mixedFeed: unknown[] = [
  raw(1),
  raw(2),
  raw(3),
  raw(4, { title: "" }), // empty title → invalid
  raw(5, { price: -1 }), // negative price → invalid
  raw(6, { reviews: "lots" }), // non-numeric reviews → invalid
];

/** Same ids as `validFeed`, but product 2's price changed (everything else equal). */
export const changedFeed: unknown[] = [raw(1), raw(2, { price: 999.99 }), raw(3)];

/** Same id twice in one feed; last occurrence should win. */
export const duplicateFeed: unknown[] = [
  raw(1, { title: "First" }),
  raw(1, { title: "Second" }),
];

/** In-memory `ProductStore` with the same hash-guard semantics as the DB upsert. */
export class FakeProductStore implements ProductStore {
  readonly rows = new Map<string, NormalizedProduct>();
  /** Number of times `upsertBatch` was invoked (to assert batching). */
  upsertCalls = 0;

  upsertBatch(products: NormalizedProduct[]): Promise<number> {
    this.upsertCalls++;
    let written = 0;
    for (const product of products) {
      const existing = this.rows.get(product.id);
      if (!existing || existing.sourceHash !== product.sourceHash) {
        this.rows.set(product.id, product);
        written++;
      }
    }
    return Promise.resolve(written);
  }
}

/** In-memory `ImportRunStore` that records the start/finish calls it received. */
export class FakeImportRunStore implements ImportRunStore {
  readonly startCalls: string[] = [];
  readonly finished: { id: string; outcome: ImportOutcome }[] = [];
  private seq = 0;

  start(sourceUrl: string): Promise<string> {
    this.startCalls.push(sourceUrl);
    this.seq += 1;
    return Promise.resolve(`run-${this.seq}`);
  }

  finish(id: string, outcome: ImportOutcome): Promise<void> {
    this.finished.push({ id, outcome });
    return Promise.resolve();
  }

  /** The most recent finished outcome (convenience for assertions). */
  lastOutcome(): ImportOutcome | undefined {
    return this.finished.at(-1)?.outcome;
  }
}

/** A `FeedFetcher` that always returns the given list. */
export function staticFetcher(feed: unknown[]): (url: string) => Promise<unknown[]> {
  return () => Promise.resolve(feed);
}

/** A `FeedFetcher` that always throws — drives the fail-loud path. */
export function throwingFetcher(message: string): (url: string) => Promise<unknown[]> {
  return () => Promise.reject(new Error(message));
}
