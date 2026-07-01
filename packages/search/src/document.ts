/**
 * Pure mapping from a PostgreSQL `products` row to a Typesense search document
 * (Spec 004). Engine-independent and total — unit-tested without any running
 * search engine. Every field is derived solely from the row, so the index is
 * fully rebuildable from PostgreSQL (constitution II, FR-006).
 */

/** A `products` row as read by the reindex reader (numeric columns already typed). */
export interface ProductRow {
  id: string;
  title: string;
  brand: string | null;
  category: string | null;
  tags: string[];
  price: number | null;
  rating: number | null;
  reviews: number | null;
  in_stock: boolean;
  released_at: Date | null;
  image: string | null;
  image_width: number | null;
  image_height: number | null;
  description: string | null;
}

/** The index-ready document shape (see data-model.md / DS_PROJECT_SPEC_PLAN §6.2). */
export interface ProductSearchDocument {
  id: string;
  title: string;
  brand?: string;
  category?: string;
  tags: string[];
  price?: number;
  rating?: number;
  /** Always present (default 0) — required by `default_sorting_field: "reviews"`. */
  reviews: number;
  inStock: boolean;
  /** Unix seconds; absent when the product has no release date. */
  releasedAtTimestamp?: number;
  image?: string;
  imageWidth?: number;
  imageHeight?: number;
  description?: string;
}

/** Map one product row to its search document. Absent optionals are omitted. */
export function toSearchDocument(row: ProductRow): ProductSearchDocument {
  const doc: ProductSearchDocument = {
    id: row.id,
    title: row.title,
    tags: row.tags ?? [],
    reviews: row.reviews ?? 0,
    inStock: row.in_stock,
  };

  if (row.brand !== null) doc.brand = row.brand;
  if (row.category !== null) doc.category = row.category;
  if (row.price !== null) doc.price = row.price;
  if (row.rating !== null) doc.rating = row.rating;
  if (row.released_at !== null) {
    doc.releasedAtTimestamp = Math.floor(row.released_at.getTime() / 1000);
  }
  if (row.image !== null) doc.image = row.image;
  if (row.image_width !== null) doc.imageWidth = row.image_width;
  if (row.image_height !== null) doc.imageHeight = row.image_height;
  if (row.description !== null) doc.description = row.description;

  return doc;
}
