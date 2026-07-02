import type { CollectionCreateSchema } from "typesense";

/**
 * The Typesense product collection schema (DS_PROJECT_SPEC_PLAN §6.3). Fields
 * cover full-text search, faceting/filtering, and sorting. `reviews` is the
 * `default_sorting_field`, so it is non-optional (always present on documents).
 */

/** Collection name from env, defaulting to `products`. */
export function collectionName(): string {
  return process.env.TYPESENSE_PRODUCTS_COLLECTION ?? "products";
}

/** Build the create-schema for the product collection (name resolved from env). */
export function productsCollectionSchema(): CollectionCreateSchema {
  return {
    name: collectionName(),
    fields: [
      { name: "id", type: "string" },
      // `infix: true` builds a suffix index so a query can match *inside* a
      // title token (e.g. "woven" → "handwoven"); enabled on title only, as
      // infix indexing is memory-heavy and titles are the primary match field.
      { name: "title", type: "string", sort: true, infix: true },
      { name: "brand", type: "string", facet: true, optional: true },
      { name: "category", type: "string", facet: true, optional: true },
      { name: "tags", type: "string[]", facet: true },
      { name: "price", type: "float", facet: true, sort: true, optional: true },
      { name: "rating", type: "float", facet: true, sort: true, optional: true },
      { name: "reviews", type: "int32", sort: true },
      { name: "inStock", type: "bool", facet: true },
      { name: "releasedAtTimestamp", type: "int64", sort: true, optional: true },
      { name: "image", type: "string", optional: true },
      { name: "imageWidth", type: "int32", optional: true },
      { name: "imageHeight", type: "int32", optional: true },
      { name: "description", type: "string", optional: true },
    ],
    default_sorting_field: "reviews",
  };
}
