import type { HealthStatus } from "@ds/shared";

/**
 * Pure health aggregation (Spec 005, FR-001/FR-002). Turns the two dependency
 * probe results into the stable `HealthStatus` body (unchanged since Spec 001)
 * plus the HTTP status: 200 when all dependencies are up, 503 when any is down.
 */

export interface HealthProbeResults {
  database: boolean;
  search: boolean;
}

export interface HealthCheckResult {
  body: HealthStatus;
  status: 200 | 503;
}

export function checkHealth(probes: HealthProbeResults): HealthCheckResult {
  const body: HealthStatus = {
    ok: probes.database && probes.search,
    services: {
      database: probes.database ? "ok" : "down",
      search: probes.search ? "ok" : "down",
    },
  };
  return { body, status: body.ok ? 200 : 503 };
}
