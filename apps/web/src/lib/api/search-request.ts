import { z } from "zod";

import type { SearchInput } from "@ds/search";

/**
 * Boundary validation for GET /api/search (Spec 005, FR-009). Parses the raw
 * query string into the engine-independent `SearchInput` consumed by the Spec 004
 * builder. Only *types* are validated here (page/perPage numeric, inStock boolean);
 * defaults and clamping belong to `buildSearchParams`. Invalid types fail closed —
 * the route returns 400 and never touches the search engine.
 *
 * Empty-valued params (e.g. the documented `?q=&brand=&inStock=`) are treated as
 * absent, so the all-empty URL is valid.
 */

const PARAM_KEYS = [
  "q",
  "page",
  "perPage",
  "sort",
  "brand",
  "category",
  "tag",
  "inStock",
] as const;

/** A non-negative integer supplied as a string param. */
const intParam = z
  .string()
  .regex(/^\d+$/, "must be a non-negative integer")
  .transform((value) => Number(value));

const searchQuerySchema = z.object({
  q: z.string().optional(),
  page: intParam.optional(),
  perPage: intParam.optional(),
  sort: z.string().optional(),
  brand: z.string().optional(),
  category: z.string().optional(),
  tag: z.string().optional(),
  inStock: z.enum(["true", "false"]).optional(),
});

export type ParseSearchResult =
  | { success: true; data: SearchInput }
  | { success: false; error: z.ZodError };

export function parseSearchParams(params: URLSearchParams): ParseSearchResult {
  // Treat missing and empty-string values alike as "not supplied".
  const raw: Record<string, string> = {};
  for (const key of PARAM_KEYS) {
    const value = params.get(key);
    if (value !== null && value !== "") raw[key] = value;
  }

  const result = searchQuerySchema.safeParse(raw);
  if (!result.success) return { success: false, error: result.error };

  const parsed = result.data;

  const filters: NonNullable<SearchInput["filters"]> = {};
  if (parsed.brand !== undefined) filters.brand = parsed.brand;
  if (parsed.category !== undefined) filters.category = parsed.category;
  if (parsed.tag !== undefined) filters.tag = parsed.tag;
  if (parsed.inStock !== undefined) filters.inStock = parsed.inStock === "true";

  const input: SearchInput = {};
  if (parsed.q !== undefined) input.q = parsed.q.trim();
  if (parsed.page !== undefined) input.page = parsed.page;
  if (parsed.perPage !== undefined) input.perPage = parsed.perPage;
  if (parsed.sort !== undefined) input.sort = parsed.sort;
  if (Object.keys(filters).length > 0) input.filters = filters;

  return { success: true, data: input };
}
