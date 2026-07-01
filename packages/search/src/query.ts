/**
 * Pure search-request builder (Spec 004, DS_PROJECT_SPEC_PLAN §6.4). Turns
 * engine-independent input (query, page, page size, sort, filters) into the
 * concrete Typesense search parameters. Total and side-effect-free, so it is
 * fully unit-tested without a running engine.
 */

/** Default and hard-cap page sizes (§6.4). */
export const DEFAULT_PER_PAGE = 24;
export const MAX_PER_PAGE = 60;

/** Default ranking: relevance, then rating, then reviews. */
export const DEFAULT_SORT = "_text_match:desc,rating:desc,reviews:desc";

/** Optional narrowing filters. */
export interface SearchFilters {
  brand?: string;
  category?: string;
  tag?: string;
  inStock?: boolean;
}

/** Engine-independent search request. */
export interface SearchInput {
  q?: string;
  page?: number;
  perPage?: number;
  sort?: string;
  filters?: SearchFilters;
}

/** The concrete Typesense search parameters this layer emits. */
export interface SearchRequestParams {
  q: string;
  query_by: string;
  query_by_weights: string;
  prefix: boolean;
  num_typos: string;
  typo_tokens_threshold: number;
  drop_tokens_threshold: number;
  page: number;
  per_page: number;
  facet_by: string;
  sort_by: string;
  filter_by?: string;
}

function clampPerPage(perPage: number | undefined): number {
  if (perPage === undefined || Number.isNaN(perPage)) return DEFAULT_PER_PAGE;
  return Math.min(MAX_PER_PAGE, Math.max(1, Math.floor(perPage)));
}

function clampPage(page: number | undefined): number {
  if (page === undefined || Number.isNaN(page)) return 1;
  return Math.max(1, Math.floor(page));
}

/** Compose `filter_by` from supplied filters; undefined when none. */
function buildFilterBy(filters: SearchFilters | undefined): string | undefined {
  if (!filters) return undefined;
  const clauses: string[] = [];
  // Backtick-quote string values so spaces/punctuation match literally.
  if (filters.brand) clauses.push(`brand:=\`${filters.brand}\``);
  if (filters.category) clauses.push(`category:=\`${filters.category}\``);
  if (filters.tag) clauses.push(`tags:=\`${filters.tag}\``);
  if (filters.inStock !== undefined) clauses.push(`inStock:=${String(filters.inStock)}`);
  return clauses.length > 0 ? clauses.join(" && ") : undefined;
}

/** Build the search parameters for a request (empty query → `*`, stable sort). */
export function buildSearchParams(input: SearchInput = {}): SearchRequestParams {
  const trimmed = input.q?.trim();
  const params: SearchRequestParams = {
    q: trimmed ? trimmed : "*",
    query_by: "title,brand,category,tags,description",
    query_by_weights: "5,4,3,3,1",
    prefix: true,
    num_typos: "2,2,1,1,1",
    typo_tokens_threshold: 1,
    drop_tokens_threshold: 0,
    page: clampPage(input.page),
    per_page: clampPerPage(input.perPage),
    facet_by: "brand,category,tags,inStock",
    sort_by: input.sort ?? DEFAULT_SORT,
  };

  const filterBy = buildFilterBy(input.filters);
  if (filterBy !== undefined) params.filter_by = filterBy;

  return params;
}
