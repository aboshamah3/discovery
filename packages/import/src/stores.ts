import { query } from "@ds/db";
import type { NormalizedProduct } from "@ds/shared";

import type { FeedFetcher, ImportRunStore, ProductStore } from "./import";

/**
 * Real (production) implementations of the import's injected dependencies:
 * an HTTP feed fetcher and Postgres-backed product / import-run stores. These
 * are the only place the import touches the network or the database directly.
 */

/** Columns written by the upsert, in positional order (see data-model.md). */
const PRODUCT_COLUMNS = [
  "id",
  "title",
  "brand",
  "category",
  "tags",
  "price",
  "rating",
  "reviews",
  "in_stock",
  "released_at",
  "image",
  "image_width",
  "image_height",
  "description",
  "source_hash",
] as const;

/** Flatten one normalized product into the positional row matching PRODUCT_COLUMNS. */
function toRow(product: NormalizedProduct): unknown[] {
  return [
    product.id,
    product.title,
    product.brand,
    product.category,
    product.tags,
    product.price,
    product.rating,
    product.reviews,
    product.inStock,
    product.releasedAt,
    product.image,
    product.imageWidth,
    product.imageHeight,
    product.description,
    product.sourceHash,
  ];
}

/**
 * Fetch the feed over HTTP. Asserts a 2xx response and a JSON-array payload,
 * throwing a descriptive error otherwise so the run fails loudly (FR-009).
 */
export const httpFetchFeed: FeedFetcher = async (url: string): Promise<unknown[]> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`source returned HTTP ${response.status} ${response.statusText} for ${url}`);
  }
  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error(`source payload is not a JSON array (got ${typeof payload}) from ${url}`);
  }
  return payload;
};

/**
 * Postgres-backed product store. Each batch is one parameterized multi-row
 * `INSERT … ON CONFLICT (id) DO UPDATE … WHERE source_hash IS DISTINCT FROM`
 * statement; the affected-row count is the number actually written.
 */
export function createDbProductStore(): ProductStore {
  const columnList = PRODUCT_COLUMNS.join(", ");
  const updateAssignments = PRODUCT_COLUMNS.filter((column) => column !== "id")
    .map((column) => `${column} = EXCLUDED.${column}`)
    .join(", ");

  return {
    async upsertBatch(products: NormalizedProduct[]): Promise<number> {
      if (products.length === 0) return 0;

      const columnCount = PRODUCT_COLUMNS.length;
      const params: unknown[] = [];
      const tuples = products.map((product, rowIndex) => {
        const row = toRow(product);
        params.push(...row);
        const placeholders = row.map((_, colIndex) => `$${rowIndex * columnCount + colIndex + 1}`);
        return `(${placeholders.join(", ")})`;
      });

      const sql =
        `INSERT INTO products (${columnList}) VALUES ${tuples.join(", ")} ` +
        `ON CONFLICT (id) DO UPDATE SET ${updateAssignments} ` +
        `WHERE products.source_hash IS DISTINCT FROM EXCLUDED.source_hash`;

      const result = await query(sql, params);
      return result.rowCount ?? 0;
    },
  };
}

/** Postgres-backed import-run store: opens a "running" row, closes it terminally. */
export function createDbImportRunStore(): ImportRunStore {
  return {
    async start(sourceUrl: string): Promise<string> {
      const result = await query<{ id: string }>(
        `INSERT INTO import_runs (source_url, status) VALUES ($1, 'running') RETURNING id`,
        [sourceUrl],
      );
      const row = result.rows[0];
      if (!row) throw new Error("failed to create import_runs row");
      return row.id;
    },

    async finish(id, outcome): Promise<void> {
      await query(
        `UPDATE import_runs
            SET status = $2,
                fetched_count = $3,
                valid_count = $4,
                invalid_count = $5,
                upserted_count = $6,
                error_message = $7,
                finished_at = now()
          WHERE id = $1`,
        [
          id,
          outcome.status,
          outcome.fetched,
          outcome.valid,
          outcome.invalid,
          outcome.written,
          outcome.errorMessage ?? null,
        ],
      );
    },
  };
}
