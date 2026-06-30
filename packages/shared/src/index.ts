/**
 * Shared constants and types for DS Product Discovery.
 * Populated further by later specs (e.g. Zod schemas in Spec 002).
 */
export const APP_NAME = "DS Product Discovery";

export type HealthStatus = {
  ok: boolean;
  services: {
    database: "ok" | "down";
    search: "ok" | "down";
  };
};
