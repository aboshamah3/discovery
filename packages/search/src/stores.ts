import { query } from "@ds/db";
import type { Client } from "typesense";

import { ensureCollection } from "./collection";
import type { ProductRow, ProductSearchDocument } from "./document";
import type { ProductReader, SearchIndex } from "./reindex";
import { collectionName } from "./schema";

/**
 * Real (production) implementations of the reindex dependencies: a PostgreSQL
 * product reader and a Typesense-backed search index. These are the only place
 * the reindex touches the database or the search engine directly.
 */

const SELECT_PRODUCTS =
  `SELECT id, title, brand, category, tags, price::double precision AS price,
          rating, reviews, in_stock, released_at, image, image_width, image_height, description
     FROM products
    WHERE id > $1
    ORDER BY id
    LIMIT $2`;

/**
 * Stream products from PostgreSQL in bounded batches using keyset pagination on
 * the (text) `id`. Reading in `id` order with a cursor avoids large OFFSETs and
 * covers every row exactly once.
 */
export function createDbProductReader(): ProductReader {
  return {
    async *streamBatches(batchSize: number): AsyncIterable<ProductRow[]> {
      let cursor = "";
      for (;;) {
        const result = await query<ProductRow>(SELECT_PRODUCTS, [cursor, batchSize]);
        const rows = result.rows;
        if (rows.length === 0) break;
        yield rows;
        const last = rows[rows.length - 1];
        if (!last || rows.length < batchSize) break;
        cursor = last.id;
      }
    },
  };
}

/**
 * Typesense-backed index: `ensure` creates the collection if missing; each
 * batch is one bulk `import` with `action: "upsert"` keyed on the document id,
 * so reindexing is repeatable with no duplicates. Per-document failures are
 * surfaced loudly rather than silently dropped.
 */
export function createTypesenseIndex(client: Client): SearchIndex {
  const name = collectionName();
  return {
    ensure: () => ensureCollection(client),

    async indexBatch(docs: ProductSearchDocument[]): Promise<number> {
      if (docs.length === 0) return 0;
      const results = await client
        .collections<ProductSearchDocument>(name)
        .documents()
        .import(docs, { action: "upsert" });

      let indexed = 0;
      const errors: string[] = [];
      for (const result of results) {
        if (result.success) indexed += 1;
        else errors.push(result.error);
      }
      if (errors.length > 0) {
        throw new Error(
          `indexing failed for ${errors.length} document(s): ${errors[0] ?? "unknown error"}`,
        );
      }
      return indexed;
    },
  };
}
