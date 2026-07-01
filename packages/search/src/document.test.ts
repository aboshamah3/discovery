import { describe, expect, it } from "vitest";

import { toSearchDocument, type ProductRow } from "./document";

function row(overrides: Partial<ProductRow> = {}): ProductRow {
  return {
    id: "1",
    title: "Brushed Rattan Crate",
    brand: "Orla & Vine",
    category: "Storage",
    tags: ["brushed", "rattan"],
    price: 1111.05,
    rating: 3.4,
    reviews: 176,
    in_stock: true,
    released_at: new Date("2022-02-18T00:00:00.000Z"),
    image: "https://example.test/img/1.png",
    image_width: 500,
    image_height: 320,
    description: "Small-batch crate.",
    ...overrides,
  };
}

describe("toSearchDocument", () => {
  it("maps a full row to a complete document", () => {
    const doc = toSearchDocument(row());
    expect(doc).toEqual({
      id: "1",
      title: "Brushed Rattan Crate",
      brand: "Orla & Vine",
      category: "Storage",
      tags: ["brushed", "rattan"],
      price: 1111.05,
      rating: 3.4,
      reviews: 176,
      inStock: true,
      releasedAtTimestamp: Math.floor(Date.UTC(2022, 1, 18) / 1000),
      image: "https://example.test/img/1.png",
      imageWidth: 500,
      imageHeight: 320,
      description: "Small-batch crate.",
    });
  });

  it("omits absent optional fields entirely", () => {
    const doc = toSearchDocument(
      row({
        brand: null,
        category: null,
        price: null,
        rating: null,
        released_at: null,
        image: null,
        image_width: null,
        image_height: null,
        description: null,
      }),
    );
    expect("brand" in doc).toBe(false);
    expect("category" in doc).toBe(false);
    expect("price" in doc).toBe(false);
    expect("rating" in doc).toBe(false);
    expect("releasedAtTimestamp" in doc).toBe(false);
    expect("image" in doc).toBe(false);
    expect("imageWidth" in doc).toBe(false);
    expect("imageHeight" in doc).toBe(false);
    expect("description" in doc).toBe(false);
    // Always-present fields remain.
    expect(doc.id).toBe("1");
    expect(doc.tags).toEqual(["brushed", "rattan"]);
    expect(doc.inStock).toBe(true);
  });

  it("defaults missing reviews to 0 (required by default_sorting_field)", () => {
    const doc = toSearchDocument(row({ reviews: null }));
    expect(doc.reviews).toBe(0);
  });

  it("converts release date to Unix seconds", () => {
    const doc = toSearchDocument(row({ released_at: new Date("2025-11-07T00:00:00.000Z") }));
    expect(doc.releasedAtTimestamp).toBe(Math.floor(Date.UTC(2025, 10, 7) / 1000));
  });

  it("is deterministic", () => {
    expect(toSearchDocument(row())).toEqual(toSearchDocument(row()));
  });
});
