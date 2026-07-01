import type { ProductSearchDocument } from "@ds/search";

/**
 * Browser-safe DTOs and response envelopes (Spec 005, DS_PROJECT_SPEC_PLAN §7).
 * Only documented fields are ever serialized — no `sourceHash`, no import
 * bookkeeping, no engine internals (FR-005/FR-011). All mapping is pure and
 * unit-tested.
 */

export interface ProductCardDto {
  id: string;
  title: string;
  brand?: string;
  category?: string;
  tags: string[];
  price?: number;
  rating?: number;
  reviews?: number;
  inStock: boolean;
  releasedAt?: string; // ISO-8601
  image?: string;
  imageWidth?: number;
  imageHeight?: number;
  description?: string;
}

export interface FacetValue {
  value: string;
  count: number;
}

export interface SearchResponse {
  query: string;
  page: number;
  perPage: number;
  found: number;
  totalPages: number;
  hasMore: boolean;
  results: ProductCardDto[];
  facets?: {
    brands?: FacetValue[];
    categories?: FacetValue[];
    tags?: FacetValue[];
    inStock?: FacetValue[];
  };
}

/** The raw Typesense search result shape this layer consumes (subset). */
export interface RawSearchResult {
  found: number;
  hits?: Array<{ document: ProductSearchDocument }>;
  facet_counts?: Array<{
    field_name: string;
    counts: Array<{ value: string; count: number }>;
  }>;
}

/** A `products` row as read for the detail endpoint (snake_case columns). */
export interface ProductDetailRow {
  id: string;
  title: string;
  brand: string | null;
  category: string | null;
  tags: string[] | null;
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

export interface ProductDetailResponse {
  product: ProductCardDto;
}

/** Map one search document to a product-card DTO; absent optionals omitted. */
export function toProductCardDto(doc: ProductSearchDocument): ProductCardDto {
  const dto: ProductCardDto = {
    id: doc.id,
    title: doc.title,
    tags: doc.tags ?? [],
    inStock: doc.inStock,
  };
  if (doc.brand !== undefined) dto.brand = doc.brand;
  if (doc.category !== undefined) dto.category = doc.category;
  if (doc.price !== undefined) dto.price = doc.price;
  if (doc.rating !== undefined) dto.rating = doc.rating;
  if (doc.reviews !== undefined) dto.reviews = doc.reviews;
  if (doc.releasedAtTimestamp !== undefined) {
    dto.releasedAt = new Date(doc.releasedAtTimestamp * 1000).toISOString();
  }
  if (doc.image !== undefined) dto.image = doc.image;
  if (doc.imageWidth !== undefined) dto.imageWidth = doc.imageWidth;
  if (doc.imageHeight !== undefined) dto.imageHeight = doc.imageHeight;
  if (doc.description !== undefined) dto.description = doc.description;
  return dto;
}

const FACET_FIELD_TO_KEY: Record<
  string,
  keyof NonNullable<SearchResponse["facets"]>
> = {
  brand: "brands",
  category: "categories",
  tags: "tags",
  inStock: "inStock",
};

function mapFacets(
  facetCounts: RawSearchResult["facet_counts"],
): SearchResponse["facets"] | undefined {
  if (!facetCounts || facetCounts.length === 0) return undefined;
  const facets: NonNullable<SearchResponse["facets"]> = {};
  let any = false;
  for (const facet of facetCounts) {
    const key = FACET_FIELD_TO_KEY[facet.field_name];
    if (!key) continue;
    const values = facet.counts.map((c) => ({ value: c.value, count: c.count }));
    if (values.length > 0) {
      facets[key] = values;
      any = true;
    }
  }
  return any ? facets : undefined;
}

/** Assemble the documented search response, computing pagination metadata. */
export function buildSearchResponse(
  query: string,
  page: number,
  perPage: number,
  raw: RawSearchResult,
): SearchResponse {
  const found = raw.found ?? 0;
  const totalPages = perPage > 0 ? Math.ceil(found / perPage) : 0;
  const response: SearchResponse = {
    query,
    page,
    perPage,
    found,
    totalPages,
    hasMore: page < totalPages,
    results: (raw.hits ?? []).map((hit) => toProductCardDto(hit.document)),
  };
  const facets = mapFacets(raw.facet_counts);
  if (facets) response.facets = facets;
  return response;
}

/** Map a `products` row to the detail DTO; internal columns never included. */
export function toProductDetail(row: ProductDetailRow): ProductCardDto {
  const dto: ProductCardDto = {
    id: row.id,
    title: row.title,
    tags: row.tags ?? [],
    inStock: row.in_stock,
  };
  if (row.brand !== null) dto.brand = row.brand;
  if (row.category !== null) dto.category = row.category;
  if (row.price !== null) dto.price = row.price;
  if (row.rating !== null) dto.rating = row.rating;
  if (row.reviews !== null) dto.reviews = row.reviews;
  if (row.released_at !== null) dto.releasedAt = row.released_at.toISOString();
  if (row.image !== null) dto.image = row.image;
  if (row.image_width !== null) dto.imageWidth = row.image_width;
  if (row.image_height !== null) dto.imageHeight = row.image_height;
  if (row.description !== null) dto.description = row.description;
  return dto;
}
