# Phase 1 Data Model: Typesense Search Foundation

**Feature**: 004-search-foundation | **Date**: 2026-06-30

This spec adds **no PostgreSQL schema**. It reads the Spec 002 `products` table and defines a derived Typesense collection. Below: the collection schema, the Postgres-row → document mapping, and the search-params shape.

## Collection schema (`products`)

Per `DS_PROJECT_SPEC_PLAN.md` §6.3. Name from `TYPESENSE_PRODUCTS_COLLECTION` (default `products`).

| Field | Type | Flags | Purpose |
|---|---|---|---|
| `id` | `string` | (implicit doc id) | stable identity (= product id) |
| `title` | `string` | `sort` | full-text search + title sort |
| `brand` | `string` | `facet`, `optional` | search + filter/facet |
| `category` | `string` | `facet`, `optional` | search + filter/facet |
| `tags` | `string[]` | `facet` | search + filter/facet |
| `price` | `float` | `facet`, `sort`, `optional` | filter/sort |
| `rating` | `float` | `facet`, `sort`, `optional` | ranking/sort |
| `reviews` | `int32` | `sort` | **default_sorting_field**; ranking/sort |
| `inStock` | `bool` | `facet` | filter/facet |
| `releasedAtTimestamp` | `int64` | `sort`, `optional` | recency sort |
| `image` | `string` | `optional` | display passthrough |
| `imageWidth` | `int32` | `optional` | display passthrough |
| `imageHeight` | `int32` | `optional` | display passthrough |
| `description` | `string` | `optional` | full-text search |

`default_sorting_field: "reviews"` — so `reviews` is **non-optional** and always present on every document (see mapping).

## Document shape (`ProductSearchDocument`)

```ts
type ProductSearchDocument = {
  id: string;
  title: string;
  brand?: string;
  category?: string;
  tags: string[];
  price?: number;
  rating?: number;
  reviews: number;          // always present (default 0) — required by default_sorting_field
  inStock: boolean;
  releasedAtTimestamp?: number;  // Unix seconds
  image?: string;
  imageWidth?: number;
  imageHeight?: number;
  description?: string;
};
```

## Postgres row → document mapping (`toSearchDocument`)

Input is a `products` row (Spec 002). Numeric columns are read already typed (`price::double precision`), `released_at` as a `Date`, `tags` as a string array.

| `products` column | Document field | Rule |
|---|---|---|
| `id` (`text`) | `id` | passthrough (already a stable string) |
| `title` (`text`) | `title` | passthrough |
| `brand` (`text`) | `brand` | omit if null |
| `category` (`text`) | `category` | omit if null |
| `tags` (`text[]`) | `tags` | passthrough (default `[]`) |
| `price` (`numeric`) | `price` | number; omit if null |
| `rating` (`real`) | `rating` | number; omit if null |
| `reviews` (`integer`) | `reviews` | number; **null → 0** (always present) |
| `in_stock` (`boolean`) | `inStock` | passthrough |
| `released_at` (`timestamptz`) | `releasedAtTimestamp` | `Math.floor(date.getTime() / 1000)`; omit if null |
| `image` (`text`) | `image` | omit if null |
| `image_width` (`integer`) | `imageWidth` | omit if null |
| `image_height` (`integer`) | `imageHeight` | omit if null |
| `description` (`text`) | `description` | omit if null |

`source_hash` and the bookkeeping timestamps (`imported_at`/`created_at`/`updated_at`) are **not** indexed — they are not searchable/filterable/sortable product data. Every indexed field is reconstructable from the row, so the index is fully rebuildable (FR-006).

**Optional handling**: absent optionals are **omitted** from the object (not set to `null`), matching the schema's `optional: true` fields.

## Search params shape (`buildSearchParams`)

Input (engine-independent):

```ts
interface SearchInput {
  q?: string;
  page?: number;            // default 1, min 1
  perPage?: number;         // default 24, clamped to [1, 60]
  sort?: string;            // optional override of sort_by
  filters?: {
    brand?: string;
    category?: string;
    tag?: string;
    inStock?: boolean;
  };
}
```

Output (Typesense `searchParameters`), per §6.4:

```ts
{
  q: q?.trim() ? q.trim() : "*",
  query_by: "title,brand,category,tags,description",
  query_by_weights: "5,4,3,3,1",
  prefix: true,
  num_typos: "2,2,1,1,1",
  typo_tokens_threshold: 1,
  drop_tokens_threshold: 0,
  page,                       // max(1, page ?? 1)
  per_page,                   // min(60, max(1, perPage ?? 24))
  facet_by: "brand,category,tags,inStock",
  sort_by,                    // sort ?? "_text_match:desc,rating:desc,reviews:desc"
  // filter_by present ONLY when at least one filter supplied:
  filter_by?: "brand:=`<v>` && category:=`<v>` && tags:=`<v>` && inStock:=true",
}
```

**Filter clause grammar**: `brand:=\`value\``, `category:=\`value\``, `tags:=\`value\``, `inStock:=true|false`, joined by ` && `. String values are backtick-quoted so spaces/punctuation match literally; the key is omitted entirely when no filter is supplied.

## Count semantics (reindex)

- `productsRead` — total rows streamed from Postgres.
- `documentsIndexed` — sum of successfully-imported documents across batches (Typesense `import` reports per-document success; failures are surfaced, not silently dropped).
- Success when `documentsIndexed === productsRead`; a non-zero failure count fails the run loudly.
