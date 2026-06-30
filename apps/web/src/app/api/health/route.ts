import type { HealthStatus } from "@ds/shared";

/**
 * GET /api/health
 * Foundation: returns a STATIC success. Real database/search readiness
 * checks are added in Spec 005 (Backend API Contracts).
 * Contract: specs/001-repo-foundation/contracts/health.contract.md
 */
export function GET(): Response {
  const body: HealthStatus = {
    ok: true,
    services: {
      database: "ok",
      search: "ok",
    },
  };

  return Response.json(body);
}
