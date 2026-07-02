import { describe, expect, it } from "vitest";

import { buildSearchParams, DEFAULT_PER_PAGE, MAX_PER_PAGE } from "./query";

describe("buildSearchParams — query + ranking", () => {
  it("applies the documented fields, weights, typo tolerance and ranking", () => {
    const p = buildSearchParams({ q: "rattan" });
    expect(p.q).toBe("rattan");
    expect(p.query_by).toBe("title,brand,category,tags,description");
    expect(p.query_by_weights).toBe("5,4,3,3,1");
    expect(p.prefix).toBe(true);
    expect(p.infix).toEqual(["always", "off", "off", "off", "off"]);
    expect(p.num_typos).toBe("2,2,1,1,1");
    expect(p.drop_tokens_threshold).toBe(0);
    expect(p.sort_by).toBe("_text_match:desc,rating:desc,reviews:desc");
    expect(p.facet_by).toBe("brand,category,tags,inStock");
  });

  it("uses '*' for an empty or missing query (stable, non-random)", () => {
    expect(buildSearchParams({}).q).toBe("*");
    expect(buildSearchParams({ q: "" }).q).toBe("*");
    expect(buildSearchParams({ q: "   " }).q).toBe("*");
  });

  it("allows overriding sort_by", () => {
    expect(buildSearchParams({ sort: "price:asc" }).sort_by).toBe("price:asc");
  });
});

describe("buildSearchParams — pagination", () => {
  it("defaults per_page to 24 when absent", () => {
    expect(buildSearchParams({}).per_page).toBe(DEFAULT_PER_PAGE);
  });

  it("clamps per_page to [1, 60]", () => {
    expect(buildSearchParams({ perPage: 0 }).per_page).toBe(1);
    expect(buildSearchParams({ perPage: -5 }).per_page).toBe(1);
    expect(buildSearchParams({ perPage: 999 }).per_page).toBe(MAX_PER_PAGE);
    expect(buildSearchParams({ perPage: 30 }).per_page).toBe(30);
  });

  it("defaults page to 1 and never below 1", () => {
    expect(buildSearchParams({}).page).toBe(1);
    expect(buildSearchParams({ page: 0 }).page).toBe(1);
    expect(buildSearchParams({ page: 3 }).page).toBe(3);
  });
});

describe("buildSearchParams — filters", () => {
  it("omits filter_by when no filter is supplied", () => {
    expect(buildSearchParams({ q: "x" }).filter_by).toBeUndefined();
    expect(buildSearchParams({ filters: {} }).filter_by).toBeUndefined();
  });

  it("builds a clause per supplied filter, joined by &&", () => {
    const p = buildSearchParams({
      filters: { brand: "Acme", category: "Storage", tag: "rattan", inStock: true },
    });
    expect(p.filter_by).toBe(
      "brand:=`Acme` && category:=`Storage` && tags:=`rattan` && inStock:=true",
    );
  });

  it("backtick-quotes values with spaces/punctuation", () => {
    const p = buildSearchParams({ filters: { brand: "Orla & Vine" } });
    expect(p.filter_by).toBe("brand:=`Orla & Vine`");
  });

  it("supports inStock=false", () => {
    expect(buildSearchParams({ filters: { inStock: false } }).filter_by).toBe("inStock:=false");
  });
});
