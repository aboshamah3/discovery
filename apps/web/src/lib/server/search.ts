import {
  buildSearchParams,
  collectionName,
  getSearchClient,
  type ProductSearchDocument,
  type SearchInput,
} from "@ds/search";

import type { RawSearchResult } from "@/lib/api/dto";

/**
 * Server-only Typesense adapter for the search endpoint (Spec 005). The admin
 * client (server-side key) never crosses to the browser (constitution V). Engine-
 * coupled: verified via the quickstart, not unit tests — route tests mock this.
 */

export interface SearchExecution {
  page: number;
  perPage: number;
  raw: RawSearchResult;
}

/** Run a validated search input through the Spec 004 builder against Typesense. */
export async function searchProducts(input: SearchInput): Promise<SearchExecution> {
  const client = getSearchClient();
  const params = buildSearchParams(input);
  const raw = (await client
    .collections<ProductSearchDocument>(collectionName())
    .documents()
    .search(params)) as unknown as RawSearchResult;
  return { page: params.page, perPage: params.per_page, raw };
}

/** Liveness probe for the health endpoint; swallows errors into a boolean. */
export async function pingSearch(): Promise<boolean> {
  try {
    await getSearchClient().health.retrieve();
    return true;
  } catch {
    return false;
  }
}
