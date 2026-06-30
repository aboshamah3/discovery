import { describe, it, expect } from "vitest";
import { GET } from "./route";

describe("GET /api/health", () => {
  it("returns 200 with ok status and service map", async () => {
    const res = GET();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      services: { database: "ok", search: "ok" },
    });
  });
});
