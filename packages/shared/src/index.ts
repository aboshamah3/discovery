/**
 * Shared constants and types for DS Product Discovery.
 * Spec 002 adds the product validation/normalization API (see ./product).
 */
export * from "./product";

export const APP_NAME = "DS Product Discovery";

export type HealthStatus = {
  ok: boolean;
  services: {
    database: "ok" | "down";
    search: "ok" | "down";
  };
};
