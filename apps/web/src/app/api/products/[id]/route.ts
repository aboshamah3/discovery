import { toProductDetail, type ProductDetailResponse } from "@/lib/api/dto";
import { jsonError } from "@/lib/api/errors";
import { findProductById } from "@/lib/server/products";

/**
 * GET /api/products/[id]
 * Read one product from PostgreSQL (source of truth) → detail DTO, or 404 when
 * absent. Blank id → 400 (before any DB call); a DB failure → 500.
 * Contract: specs/005-backend-api-contracts/contracts/api.contract.md
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const trimmed = id?.trim();
  if (!trimmed) {
    return jsonError(400, "bad_request", "Product id is required");
  }

  try {
    const row = await findProductById(trimmed);
    if (!row) {
      return jsonError(404, "not_found", "Product not found");
    }
    const body: ProductDetailResponse = { product: toProductDetail(row) };
    return Response.json(body);
  } catch (error) {
    console.error("product detail request failed", error);
    return jsonError(500, "internal", "Failed to load product");
  }
}
