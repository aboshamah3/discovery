# Phase 1 — Data Model: Backend API Contracts

**Feature**: 005-backend-api-contracts | **Date**: 2026-07-01

This spec adds no persistent schema. It defines the **HTTP-boundary shapes** — the validated request, the browser-safe DTOs, the response envelopes, and the error format — and the mappings from the internal `ProductSearchDocument` (search) and `products` row (detail) into them. Shapes follow `DS_PROJECT_SPEC_PLAN.md` §7.

## 1. Search request (validated) → `SearchInput`

Parsed from `URLSearchParams` by `parseSearchParams` (Zod). Types are validated; values (defaults, clamping) are the Spec 004 builder's job.

| Query param | Type at boundary | Rule | Maps to `SearchInput` |
|---|---|---|---|
| `q` | string | optional; trimmed; blank allowed | `q` |
| `page` | coerced int | optional; must parse to a number; `>= 1` after coercion | `page` |
| `perPage` | coerced int | optional; must parse to a number | `perPage` (builder clamps to `[1,60]`, default 24) |
| `sort` | string | optional | `sort` |
| `brand` | string | optional | `filters.brand` |
| `category` | string | optional | `filters.category` |
| `tag` | string | optional | `filters.tag` |
| `inStock` | `"true"`/`"false"` | optional; only those two literals accepted | `filters.inStock` (boolean) |

- **Invalid** (e.g. `page=abc`, `perPage=x`, `inStock=maybe`) → Zod fails → `400` `bad_request`; the search engine is never called.
- Absent filter keys produce no `filters` entry (builder adds no `filter_by` clause).

```ts
// re-exported from @ds/search (Spec 004) — not redefined here
interface SearchFilters { brand?: string; category?: string; tag?: string; inStock?: boolean; }
interface SearchInput { q?: string; page?: number; perPage?: number; sort?: string; filters?: SearchFilters; }
```

## 2. `ProductCardDTO` (browser-safe; §7.2)

Shared by search results and product detail. **Only** these fields are ever serialized — no `sourceHash`, no `imported_at`/`created_at`/`updated_at`, no engine internals.

```ts
type ProductCardDTO = {
  id: string;
  title: string;
  brand?: string;
  category?: string;
  tags: string[];
  price?: number;
  rating?: number;
  reviews?: number;
  inStock: boolean;
  releasedAt?: string;   // ISO-8601
  image?: string;
  imageWidth?: number;
  imageHeight?: number;
  description?: string;
};
```

### 2a. Mapping `ProductSearchDocument` → `ProductCardDTO` (search results)

| DTO field | Source (`ProductSearchDocument`) | Note |
|---|---|---|
| `id` | `id` | |
| `title` | `title` | |
| `brand?` | `brand` | omit if absent |
| `category?` | `category` | omit if absent |
| `tags` | `tags` | always an array (default `[]`) |
| `price?` | `price` | omit if absent |
| `rating?` | `rating` | omit if absent |
| `reviews?` | `reviews` | present in doc (default 0); emitted as-is |
| `inStock` | `inStock` | |
| `releasedAt?` | `releasedAtTimestamp` | `new Date(ts * 1000).toISOString()`; omit if absent |
| `image?` | `image` | omit if absent |
| `imageWidth?` | `imageWidth` | omit if absent |
| `imageHeight?` | `imageHeight` | omit if absent |
| `description?` | `description` | omit if absent |

### 2b. Mapping `products` row → `ProductCardDTO` + description (product detail)

`ProductDetailRow` selected from Postgres (snake_case columns → camelCase DTO):

| DTO field | Column | Note |
|---|---|---|
| `id` | `id` (text) | |
| `title` | `title` | |
| `brand?` | `brand` | omit if `null` |
| `category?` | `category` | omit if `null` |
| `tags` | `tags` (text[]) | default `[]` |
| `price?` | `price::double precision` | omit if `null` |
| `rating?` | `rating` | omit if `null` |
| `reviews?` | `reviews` | omit if `null` |
| `inStock` | `in_stock` | |
| `releasedAt?` | `released_at` (timestamptz) | `.toISOString()`; omit if `null` |
| `image?` | `image` | omit if `null` |
| `imageWidth?` | `image_width` | omit if `null` |
| `imageHeight?` | `image_height` | omit if `null` |
| `description?` | `description` | omit if `null` |

Columns **never** selected/serialized: `source_hash`, `imported_at`, `created_at`, `updated_at` (FR-011).

## 3. `SearchResponse` (§7.2)

```ts
type FacetValue = { value: string; count: number };

type SearchResponse = {
  query: string;        // echoed effective query ("" when blank)
  page: number;         // effective page (from builder)
  perPage: number;      // effective per_page (from builder, clamped)
  found: number;        // engine total
  totalPages: number;   // ceil(found / perPage), min 0
  hasMore: boolean;     // page < totalPages
  results: ProductCardDTO[];
  facets?: {
    brands?: FacetValue[];
    categories?: FacetValue[];
    tags?: FacetValue[];
    inStock?: FacetValue[];
  };
};
```

**Pagination math** (pure, unit-tested): `totalPages = perPage > 0 ? Math.ceil(found / perPage) : 0`; `hasMore = page < totalPages`. `query` echoes the trimmed input query (empty string when blank — the builder's `*` is an engine detail, not echoed).

**Facet mapping**: from the engine's `facet_counts` (`[{ field_name, counts: [{ value, count }] }]`) into the per-field arrays; `facets` omitted when there are none.

## 4. `ProductDetailResponse` (§7.3)

```ts
type ProductDetailResponse = {
  product: ProductCardDTO & { description?: string };
};
```

`description` is already part of `ProductCardDTO`; the `& { description? }` intersection restates §7.3 verbatim. The detail endpoint wraps a single card DTO under `product`.

## 5. `ApiError` (consistent error envelope)

```ts
type ApiErrorCode = "bad_request" | "not_found" | "internal" | "unavailable";

type ApiError = {
  error: {
    code: ApiErrorCode;
    message: string;   // human-readable, secret-free
  };
};
```

| Case | Status | `code` |
|---|---|---|
| Query/path validation failure | `400` | `bad_request` |
| Unknown product id | `404` | `not_found` |
| Caught DB/search failure | `500` | `internal` |
| Health: a dependency down | `503` | `unavailable` |

## 6. Health report (unchanged shape; real values)

```ts
// from @ds/shared (Spec 001) — shape preserved
type HealthStatus = {
  ok: boolean;
  services: { database: "ok" | "down"; search: "ok" | "down" };
};
```

`checkHealth({ database: boolean, search: boolean })` → `{ body: HealthStatus, status: 200 | 503 }` where `ok = database && search`, each service `"ok"`/`"down"`, and status `200` when `ok` else `503`. On a down path, `ok:false` is not an `ApiError` envelope — it is the `HealthStatus` body with a `503` status (the monitoring contract, distinct from `ApiError`).

## Validation → requirement map

| Shape / rule | Requirement |
|---|---|
| `parseSearchParams` type validation, `400` on bad input | FR-009 / SC-004 |
| `SearchResponse` fields + pagination math | FR-004 / FR-006 / SC-002 |
| `ProductCardDTO` field set (no internals) | FR-005 / FR-011 / SC-006 |
| Filter params → `SearchInput.filters` | FR-003 / SC-003 |
| `releasedAt` ISO string / omit absent | FR-005 |
| `ProductDetailResponse` + `404` | FR-007 / FR-008 / SC-005 |
| `ApiError` single envelope | FR-010 |
| `HealthStatus` shape + 200/503 | FR-001 / FR-002 / SC-001 |
