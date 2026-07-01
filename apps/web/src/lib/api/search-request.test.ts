import { describe, it, expect } from "vitest";

import { parseSearchParams } from "./search-request";

function parse(qs: string) {
  return parseSearchParams(new URLSearchParams(qs));
}

describe("parseSearchParams", () => {
  it("maps a full valid query into SearchInput with filters", () => {
    const result = parse(
      "q=%20shirt%20&page=2&perPage=30&sort=price%3Aasc&brand=Acme&category=Tops&tag=sale&inStock=true",
    );
    expect(result).toEqual({
      success: true,
      data: {
        q: "shirt",
        page: 2,
        perPage: 30,
        sort: "price:asc",
        filters: { brand: "Acme", category: "Tops", tag: "sale", inStock: true },
      },
    });
  });

  it("treats absent/empty params as not supplied (no filters key)", () => {
    const result = parse("q=&brand=&category=&inStock=");
    expect(result).toEqual({ success: true, data: {} });
  });

  it("parses inStock=false to a boolean false filter", () => {
    const result = parse("inStock=false");
    expect(result.success && result.data.filters?.inStock).toBe(false);
  });

  it("rejects a non-numeric page", () => {
    expect(parse("page=abc").success).toBe(false);
  });

  it("rejects a non-numeric perPage", () => {
    expect(parse("perPage=x").success).toBe(false);
  });

  it("rejects an unparseable inStock flag", () => {
    expect(parse("inStock=maybe").success).toBe(false);
  });
});
