import { describe, it, expect } from "vitest";

import { checkHealth } from "./health";

describe("checkHealth", () => {
  it("both dependencies up → 200 and ok:true", () => {
    expect(checkHealth({ database: true, search: true })).toEqual({
      body: { ok: true, services: { database: "ok", search: "ok" } },
      status: 200,
    });
  });

  it("search down → 503, ok:false, search:'down'", () => {
    const result = checkHealth({ database: true, search: false });
    expect(result.status).toBe(503);
    expect(result.body).toEqual({
      ok: false,
      services: { database: "ok", search: "down" },
    });
  });

  it("database down → 503, database:'down'", () => {
    const result = checkHealth({ database: false, search: true });
    expect(result.status).toBe(503);
    expect(result.body.ok).toBe(false);
    expect(result.body.services.database).toBe("down");
  });

  it("both down → 503", () => {
    expect(checkHealth({ database: false, search: false }).status).toBe(503);
  });
});
