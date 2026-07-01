import type {
  ProductCardDto,
  SearchResponse,
  ProductDetailResponse,
} from "@/lib/api/dto";

/**
 * Browser-side client for the Spec 005 read endpoints. Consumes the documented
 * contracts unchanged (GET /api/search, GET /api/products/[id]); no backend
 * changes. Types are re-used from the server DTO module via `import type`, so
 * nothing from that module reaches the client bundle.
 */

export type { ProductCardDto, SearchResponse };

export const PAGE_SIZE = 24;

/** Sort dropdown options → Typesense `sort_by` strings (Spec plan §12). */
export const SORT_OPTIONS = [
  { value: "relevance", label: "Relevance", sort: "" },
  { value: "price-asc", label: "Price: Low to High", sort: "price:asc" },
  { value: "price-desc", label: "Price: High to Low", sort: "price:desc" },
  { value: "rating-desc", label: "Top Rated", sort: "rating:desc" },
  { value: "reviews-desc", label: "Most Reviewed", sort: "reviews:desc" },
  { value: "newest", label: "Newest", sort: "releasedAtTimestamp:desc" },
] as const;

export type SortValue = (typeof SORT_OPTIONS)[number]["value"];

export const DEFAULT_SORT: SortValue = "relevance";

function sortStringFor(value: SortValue): string {
  return SORT_OPTIONS.find((o) => o.value === value)?.sort ?? "";
}

export interface SearchArgs {
  q: string;
  page: number;
  sort: SortValue;
  signal?: AbortSignal;
}

/** Fetch one page of search results. Throws on non-2xx so callers show an error state. */
export async function fetchSearch({
  q,
  page,
  sort,
  signal,
}: SearchArgs): Promise<SearchResponse> {
  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  params.set("page", String(page));
  params.set("perPage", String(PAGE_SIZE));
  const sortString = sortStringFor(sort);
  if (sortString) params.set("sort", sortString);

  const res = await fetch(`/api/search?${params.toString()}`, { signal });
  if (!res.ok) {
    throw new Error(`Search failed (${res.status})`);
  }
  return (await res.json()) as SearchResponse;
}

/** Fetch a single product for the quick-view modal. Throws on non-2xx. */
export async function fetchProduct(
  id: string,
  signal?: AbortSignal,
): Promise<ProductCardDto> {
  const res = await fetch(`/api/products/${encodeURIComponent(id)}`, { signal });
  if (!res.ok) {
    throw new Error(`Product load failed (${res.status})`);
  }
  const body = (await res.json()) as ProductDetailResponse;
  return body.product;
}
