import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/server/products", () => ({ findProductById: vi.fn() }));

import { GET } from "./route";
import { findProductById } from "@/lib/server/products";
import type { ProductDetailRow } from "@/lib/api/dto";

const mockFindProductById = vi.mocked(findProductById);

const req = new Request("http://test.local/api/products/x");
function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

const row: ProductDetailRow = {
  id: "17",
  title: "Trail Runner",
  brand: "Acme",
  category: "Footwear",
  tags: ["shoes"],
  price: 89.99,
  rating: 4.5,
  reviews: 210,
  in_stock: true,
  released_at: new Date("2025-03-01T00:00:00.000Z"),
  image: null,
  image_width: null,
  image_height: null,
  description: "Lightweight trail shoe.",
};

describe("GET /api/products/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with the product DTO for an existing id", async () => {
    mockFindProductById.mockResolvedValue(row);

    const res = await GET(req, ctx("17"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.product.id).toBe("17");
    expect(body.product.releasedAt).toBe("2025-03-01T00:00:00.000Z");
    expect("source_hash" in body.product).toBe(false);
    expect(mockFindProductById).toHaveBeenCalledWith("17");
  });

  it("returns 404 for a missing id", async () => {
    mockFindProductById.mockResolvedValue(null);

    const res = await GET(req, ctx("does-not-exist"));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("not_found");
  });

  it("returns 400 for a blank id without hitting the database", async () => {
    const res = await GET(req, ctx("   "));
    expect(res.status).toBe(400);
    expect(mockFindProductById).not.toHaveBeenCalled();
  });

  it("returns 500 when the database read throws", async () => {
    mockFindProductById.mockRejectedValue(new Error("db down"));

    const res = await GET(req, ctx("17"));
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe("internal");
  });
});
