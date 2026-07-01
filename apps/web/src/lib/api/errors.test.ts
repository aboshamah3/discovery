import { describe, it, expect } from "vitest";

import { jsonError, type ApiErrorCode } from "./errors";

describe("jsonError", () => {
  it("returns a JSON response with the status, code, and message", async () => {
    const res = jsonError(404, "not_found", "Product not found");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({
      error: { code: "not_found", message: "Product not found" },
    });
  });

  it("supports every error code", async () => {
    const codes: ApiErrorCode[] = [
      "bad_request",
      "not_found",
      "internal",
      "unavailable",
    ];
    for (const code of codes) {
      const res = jsonError(400, code, "x");
      const body = await res.json();
      expect(body.error.code).toBe(code);
    }
  });
});
