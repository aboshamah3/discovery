import { buildSearchResponse } from "@/lib/api/dto";
import { jsonError } from "@/lib/api/errors";
import { parseSearchParams } from "@/lib/api/search-request";
import { searchProducts } from "@/lib/server/search";

/**
 * GET /api/search
 * Validate query params → run the Spec 004 builder against Typesense → map to the
 * documented SearchResponse. Invalid params → 400 without touching the engine;
 * an engine failure → 500. Contract: specs/005-backend-api-contracts/contracts/api.contract.md
 */
export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const parsed = parseSearchParams(searchParams);
  if (!parsed.success) {
    return jsonError(400, "bad_request", "Invalid search parameters");
  }

  try {
    const input = parsed.data;
    const { page, perPage, raw } = await searchProducts(input);
    return Response.json(buildSearchResponse(input.q ?? "", page, perPage, raw));
  } catch (error) {
    console.error("search request failed", error);
    return jsonError(500, "internal", "Search is temporarily unavailable");
  }
}
