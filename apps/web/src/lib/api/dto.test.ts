import { describe, it, expect } from "vitest";

import type { ProductSearchDocument } from "@ds/search";

import {
  buildSearchResponse,
  toProductCardDto,
  toProductDetail,
  type ProductDetailRow,
  type RawSearchResult,
} from "./dto";

const fullDoc: ProductSearchDocument = {
  id: "17",
  title: "Trail Runner",
  brand: "Acme",
  category: "Footwear",
  tags: ["shoes"],
  price: 89.99,
  rating: 4.5,
  reviews: 210,
  inStock: true,
  releasedAtTimestamp: Math.floor(Date.UTC(2025, 2, 1) / 1000),
  image: "https://example.test/17.jpg",
  imageWidth: 800,
  imageHeight: 800,
  description: "Lightweight trail shoe.",
};

describe("toProductCardDto", () => {
  it("maps a full document and formats releasedAt as ISO", () => {
    expect(toProductCardDto(fullDoc)).toEqual({
      id: "17",
      title: "Trail Runner",
      brand: "Acme",
      category: "Footwear",
      tags: ["shoes"],
      price: 89.99,
      rating: 4.5,
      reviews: 210,
      inStock: true,
      releasedAt: "2025-03-01T00:00:00.000Z",
      image: "https://example.test/17.jpg",
      imageWidth: 800,
      imageHeight: 800,
      description: "Lightweight trail shoe.",
    });
  });

  it("omits absent optional fields", () => {
    const doc: ProductSearchDocument = {
      id: "1",
      title: "Basic",
      tags: [],
      reviews: 0,
      inStock: false,
    };
    const dto = toProductCardDto(doc);
    expect(dto).toEqual({ id: "1", title: "Basic", tags: [], reviews: 0, inStock: false });
    expect("brand" in dto).toBe(false);
    expect("releasedAt" in dto).toBe(false);
  });
});

describe("buildSearchResponse", () => {
  const raw: RawSearchResult = {
    found: 2,
    hits: [{ document: fullDoc }, { document: { ...fullDoc, id: "18" } }],
  };

  it("assembles the envelope and computes pagination", () => {
    const res = buildSearchResponse("runner", 1, 24, raw);
    expect(res.query).toBe("runner");
    expect(res.page).toBe(1);
    expect(res.perPage).toBe(24);
    expect(res.found).toBe(2);
    expect(res.totalPages).toBe(1);
    expect(res.hasMore).toBe(false);
    expect(res.results.map((r) => r.id)).toEqual(["17", "18"]);
  });

  it("computes hasMore across pages", () => {
    const res = buildSearchResponse("", 1, 1, { found: 5 });
    expect(res.totalPages).toBe(5);
    expect(res.hasMore).toBe(true);
    expect(res.results).toEqual([]);
  });

  it("echoes an empty query as empty string", () => {
    expect(buildSearchResponse("", 1, 24, { found: 0 }).query).toBe("");
  });

  it("maps facet_counts into per-field facets", () => {
    const res = buildSearchResponse("", 1, 24, {
      found: 2,
      facet_counts: [
        { field_name: "brand", counts: [{ value: "Acme", count: 2 }] },
        { field_name: "category", counts: [{ value: "Footwear", count: 2 }] },
      ],
    });
    expect(res.facets).toEqual({
      brands: [{ value: "Acme", count: 2 }],
      categories: [{ value: "Footwear", count: 2 }],
    });
  });

  it("omits facets when the engine returns none", () => {
    expect("facets" in buildSearchResponse("", 1, 24, { found: 0 })).toBe(false);
  });

  it("never leaks non-DTO fields into results", () => {
    const res = buildSearchResponse("x", 1, 24, raw);
    expect("sourceHash" in res.results[0]!).toBe(false);
  });
});

describe("toProductDetail", () => {
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
    image: "https://example.test/17.jpg",
    image_width: 800,
    image_height: 800,
    description: "Lightweight trail shoe.",
  };

  it("maps snake_case columns to the camelCase DTO with ISO releasedAt", () => {
    expect(toProductDetail(row)).toEqual({
      id: "17",
      title: "Trail Runner",
      brand: "Acme",
      category: "Footwear",
      tags: ["shoes"],
      price: 89.99,
      rating: 4.5,
      reviews: 210,
      inStock: true,
      releasedAt: "2025-03-01T00:00:00.000Z",
      image: "https://example.test/17.jpg",
      imageWidth: 800,
      imageHeight: 800,
      description: "Lightweight trail shoe.",
    });
  });

  it("omits null columns", () => {
    const dto = toProductDetail({
      id: "2",
      title: "Bare",
      brand: null,
      category: null,
      tags: null,
      price: null,
      rating: null,
      reviews: null,
      in_stock: false,
      released_at: null,
      image: null,
      image_width: null,
      image_height: null,
      description: null,
    });
    expect(dto).toEqual({ id: "2", title: "Bare", tags: [], inStock: false });
  });
});
