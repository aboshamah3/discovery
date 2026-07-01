import { query } from "@ds/db";

import type { ProductDetailRow } from "@/lib/api/dto";

/**
 * Server-only PostgreSQL adapter for product detail + the DB health probe
 * (Spec 005). PostgreSQL is the source of truth for detail (constitution II).
 * Engine-coupled: verified via the quickstart — route tests mock this module.
 */

const SELECT_PRODUCT = `SELECT id, title, brand, category, tags,
       price::double precision AS price, rating, reviews, in_stock,
       released_at, image, image_width, image_height, description
  FROM products
 WHERE id = $1`;

/** Read one product by its stable id; returns null when absent. */
export async function findProductById(id: string): Promise<ProductDetailRow | null> {
  const result = await query<ProductDetailRow>(SELECT_PRODUCT, [id]);
  return result.rows[0] ?? null;
}

/** Liveness probe for the health endpoint; swallows errors into a boolean. */
export async function pingDatabase(): Promise<boolean> {
  try {
    await query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
