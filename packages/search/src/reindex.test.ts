import { describe, expect, it } from "vitest";

import type { ProductRow, ProductSearchDocument } from "./document";
import { reindexProducts, type ProductReader, type SearchIndex } from "./reindex";

/** Build a valid product row with overrides. */
function row(id: number, overrides: Partial<ProductRow> = {}): ProductRow {
  return {
    id: String(id),
    title: `Product ${id}`,
    brand: "Acme",
    category: "Storage",
    tags: ["alpha"],
    price: 100 + id,
    rating: 4,
    reviews: 10 + id,
    in_stock: true,
    released_at: new Date("2024-01-15T00:00:00.000Z"),
    image: null,
    image_width: null,
    image_height: null,
    description: null,
    ...overrides,
  };
}

/** A reader that yields the given rows in batches of `batchSize`. */
function fakeReader(rows: ProductRow[]): ProductReader {
  return {
    async *streamBatches(batchSize: number): AsyncIterable<ProductRow[]> {
      for (let i = 0; i < rows.length; i += batchSize) {
        await Promise.resolve();
        yield rows.slice(i, i + batchSize);
      }
    },
  };
}

/** An in-memory index that upserts documents by id (mirrors Typesense upsert). */
class FakeSearchIndex implements SearchIndex {
  readonly docs = new Map<string, ProductSearchDocument>();
  ensureCalls = 0;
  indexCalls = 0;

  ensure(): Promise<void> {
    this.ensureCalls++;
    return Promise.resolve();
  }

  indexBatch(docs: ProductSearchDocument[]): Promise<number> {
    this.indexCalls++;
    for (const doc of docs) this.docs.set(doc.id, doc);
    return Promise.resolve(docs.length);
  }
}

describe("reindexProducts", () => {
  it("ensures the collection once and indexes one document per product", async () => {
    const rows = [row(1), row(2), row(3)];
    const index = new FakeSearchIndex();

    const summary = await reindexProducts({
      reader: fakeReader(rows),
      index,
      batchSize: 500,
      logger: { log: () => {}, error: () => {} },
    });

    expect(index.ensureCalls).toBe(1);
    expect(summary.productsRead).toBe(3);
    expect(summary.documentsIndexed).toBe(3);
    expect(index.docs.size).toBe(3);
    expect([...index.docs.keys()].sort()).toEqual(["1", "2", "3"]);
  });

  it("processes bounded batches (batches = ceil(N / batchSize))", async () => {
    const rows = [row(1), row(2), row(3), row(4), row(5)];
    const index = new FakeSearchIndex();

    const summary = await reindexProducts({
      reader: fakeReader(rows),
      index,
      batchSize: 2,
      logger: { log: () => {}, error: () => {} },
    });

    expect(summary.batches).toBe(3); // ceil(5 / 2)
    expect(index.indexCalls).toBe(3);
    expect(summary.documentsIndexed).toBe(5);
  });

  it("is idempotent — re-running upserts by id with no duplicates", async () => {
    const rows = [row(1), row(2), row(3)];
    const index = new FakeSearchIndex();
    const deps = { index, batchSize: 500, logger: { log: () => {}, error: () => {} } };

    await reindexProducts({ ...deps, reader: fakeReader(rows) });
    await reindexProducts({ ...deps, reader: fakeReader(rows) });

    expect(index.docs.size).toBe(3); // no duplication
  });

  it("rejects a non-positive batch size", async () => {
    await expect(
      reindexProducts({
        reader: fakeReader([row(1)]),
        index: new FakeSearchIndex(),
        batchSize: 0,
      }),
    ).rejects.toThrow(/batchSize/);
  });

  it("fails loudly when a batch indexes fewer documents than given", async () => {
    const shortIndex: SearchIndex = {
      ensure: () => Promise.resolve(),
      indexBatch: (docs) => Promise.resolve(docs.length - 1), // simulate a partial failure
    };
    await expect(
      reindexProducts({
        reader: fakeReader([row(1), row(2)]),
        index: shortIndex,
        batchSize: 500,
        logger: { log: () => {}, error: () => {} },
      }),
    ).rejects.toThrow(/indexed/);
  });
});
