import { checkHealth } from "@/lib/api/health";
import { pingDatabase } from "@/lib/server/products";
import { pingSearch } from "@/lib/server/search";

/**
 * GET /api/health
 * Real dependency readiness (Spec 005): pings PostgreSQL and Typesense in
 * parallel. Preserves the Spec 001 shape; 200 when both are up, 503 when any is
 * down. Contract: specs/005-backend-api-contracts/contracts/api.contract.md
 */
export async function GET(): Promise<Response> {
  const [database, search] = await Promise.all([pingDatabase(), pingSearch()]);
  const { body, status } = checkHealth({ database, search });
  return Response.json(body, { status });
}
