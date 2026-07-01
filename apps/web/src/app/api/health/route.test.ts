import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/server/products", () => ({ pingDatabase: vi.fn() }));
vi.mock("@/lib/server/search", () => ({ pingSearch: vi.fn() }));

import { GET } from "./route";
import { pingDatabase } from "@/lib/server/products";
import { pingSearch } from "@/lib/server/search";

const mockPingDatabase = vi.mocked(pingDatabase);
const mockPingSearch = vi.mocked(pingSearch);

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with ok:true when both dependencies are up", async () => {
    mockPingDatabase.mockResolvedValue(true);
    mockPingSearch.mockResolvedValue(true);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      services: { database: "ok", search: "ok" },
    });
  });

  it("returns 503 with search:'down' when search is unreachable", async () => {
    mockPingDatabase.mockResolvedValue(true);
    mockPingSearch.mockResolvedValue(false);

    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.services.search).toBe("down");
    expect(body.services.database).toBe("ok");
  });
});
