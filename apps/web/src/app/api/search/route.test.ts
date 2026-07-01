import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/server/search", () => ({ searchProducts: vi.fn() }));

import { GET } from "./route";
import { searchProducts } from "@/lib/server/search";

const mockSearchProducts = vi.mocked(searchProducts);

function request(qs: string): Request {
  return new Request(`http://test.local/api/search${qs}`);
}

describe("GET /api/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with the SearchResponse for a valid query", async () => {
    mockSearchProducts.mockResolvedValue({
      page: 1,
      perPage: 24,
      raw: {
        found: 1,
        hits: [
          {
            document: {
              id: "1",
              title: "Blue Shirt",
              tags: ["tops"],
              reviews: 3,
              inStock: true,
            },
          },
        ],
      },
    });

    const res = await GET(request("?q=shirt"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.query).toBe("shirt");
    expect(body.found).toBe(1);
    expect(body.results[0].id).toBe("1");
    expect(mockSearchProducts).toHaveBeenCalledWith({ q: "shirt" });
  });

  it("returns 400 and never calls the engine for invalid params", async () => {
    const res = await GET(request("?page=abc"));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("bad_request");
    expect(mockSearchProducts).not.toHaveBeenCalled();
  });

  it("returns 500 when the search backend throws", async () => {
    mockSearchProducts.mockRejectedValue(new Error("engine down"));
    const res = await GET(request("?q=x"));
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe("internal");
  });
});
