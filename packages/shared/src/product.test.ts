import { describe, it, expect } from "vitest";
import {
  rawProductSchema,
  normalizeProduct,
  parseProduct,
} from "./product";

// A well-formed source record (mirrors the live feed shape).
const validRaw = {
  id: 42,
  title: "Brushed Rattan Crate",
  brand: "Orla & Vine",
  category: "Storage",
  tags: ["brushed", "crate", "rattan"],
  price: 1111.05,
  rating: 3.4,
  reviews: 176,
  inStock: true,
  releasedAt: "2022-02-18",
  image: "https://example.test/img.jpg",
  imageWidth: 500,
  imageHeight: 320,
  description: "Small-batch Rattan crate.",
};

describe("rawProductSchema (validation)", () => {
  it("accepts a well-formed record", () => {
    expect(rawProductSchema.safeParse(validRaw).success).toBe(true);
  });

  it("rejects a record missing the required title, naming the field", () => {
    const result = rawProductSchema.safeParse({ ...validRaw, title: undefined });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "title")).toBe(true);
    }
  });

  it("rejects a record whose id is missing", () => {
    const noId: Record<string, unknown> = { ...validRaw };
    delete noId.id;
    const result = rawProductSchema.safeParse(noId);
    expect(result.success).toBe(false);
  });

  it("rejects a negative price, naming the field", () => {
    const result = rawProductSchema.safeParse({ ...validRaw, price: -3 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "price")).toBe(true);
    }
  });

  it("rejects a non-integer reviews count, naming the field", () => {
    const result = rawProductSchema.safeParse({ ...validRaw, reviews: 1.5 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "reviews")).toBe(true);
    }
  });

  it("rejects a non-numeric price string", () => {
    const result = rawProductSchema.safeParse({ ...validRaw, price: "abc" });
    expect(result.success).toBe(false);
  });
});

describe("normalizeProduct (normalization)", () => {
  const norm = (input: unknown) => {
    const parsed = rawProductSchema.parse(input);
    return normalizeProduct(parsed);
  };

  it("produces a stable STRING id from a numeric source id", () => {
    expect(norm(validRaw).id).toBe("42");
  });

  it("coerces a thousands-separator price string to a number", () => {
    expect(norm({ ...validRaw, price: "1,081.43" }).price).toBe(1081.43);
  });

  it("keeps a numeric price as-is and maps null price to null", () => {
    expect(norm({ ...validRaw, price: 9.5 }).price).toBe(9.5);
    expect(norm({ ...validRaw, price: null }).price).toBeNull();
  });

  it("parses a date-only releasedAt to a UTC Date at midnight", () => {
    const d = norm(validRaw).releasedAt;
    expect(d).toBeInstanceOf(Date);
    expect(d?.toISOString()).toBe("2022-02-18T00:00:00.000Z");
  });

  it("maps an absent or unparseable releasedAt to null", () => {
    expect(norm({ ...validRaw, releasedAt: undefined }).releasedAt).toBeNull();
    expect(norm({ ...validRaw, releasedAt: "not-a-date" }).releasedAt).toBeNull();
  });

  it("handles missing optional fields safely (-> null), with inStock default false and tags default []", () => {
    const minimal = norm({ id: 7, title: "Bare", releasedAt: "2020-01-01" });
    expect(minimal.brand).toBeNull();
    expect(minimal.category).toBeNull();
    expect(minimal.price).toBeNull();
    expect(minimal.rating).toBeNull();
    expect(minimal.reviews).toBeNull();
    expect(minimal.image).toBeNull();
    expect(minimal.imageWidth).toBeNull();
    expect(minimal.imageHeight).toBeNull();
    expect(minimal.description).toBeNull();
    expect(minimal.inStock).toBe(false);
    expect(minimal.tags).toEqual([]);
  });

  it("treats whitespace-only optional text as null", () => {
    expect(norm({ ...validRaw, brand: "   " }).brand).toBeNull();
  });

  it("preserves an empty tag list as []", () => {
    expect(norm({ ...validRaw, tags: [] }).tags).toEqual([]);
  });

  it("is deterministic: same input -> deeply-equal output incl. id and sourceHash", () => {
    expect(norm(validRaw)).toEqual(norm(validRaw));
  });

  it("computes a non-empty sourceHash that changes when content changes", () => {
    const a = norm(validRaw);
    const b = norm({ ...validRaw, title: "A different title" });
    expect(a.sourceHash).toBeTruthy();
    expect(a.sourceHash).not.toBe(b.sourceHash);
  });
});

describe("parseProduct (validate + normalize)", () => {
  it("returns success with the normalized record for valid input", () => {
    const result = parseProduct(validRaw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe("42");
      expect(result.data.price).toBe(1111.05);
    }
  });

  it("returns failure (without throwing) for invalid input, naming the field", () => {
    const result = parseProduct({ id: 7, price: -3 });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain("title");
      expect(paths).toContain("price");
    }
  });

  it("is deterministic across calls", () => {
    const a = parseProduct(validRaw);
    const b = parseProduct(validRaw);
    expect(a).toEqual(b);
  });
});
