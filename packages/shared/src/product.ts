import { z } from "zod";

/**
 * Validation + normalization for the untrusted product source feed.
 *
 * Two layers (see specs/002-data-model-validation/contracts/validation.contract.md):
 *  1. `rawProductSchema` validates one source record and rejects structural/bound
 *     violations with field-level errors (the only value it coerces is `price`,
 *     so its non-negative bound can be enforced).
 *  2. `normalizeProduct` is a TOTAL function that maps a validated record to the
 *     canonical, store-ready `NormalizedProduct` (stable string id, UTC date,
 *     blank -> null, defaults, deterministic `sourceHash`).
 */

/** Optional free text: string | null | undefined at the boundary. */
const optionalText = z.string().nullish();

/** Optional non-negative integer (e.g. review counts, image dimensions). */
const optionalNonNegInt = z.number().int().nonnegative().nullish();

/**
 * Price arrives as a number, a thousands-separator string (e.g. "1,081.43"),
 * null, or absent. Coerce to `number | null` and enforce non-negative; reject a
 * present-but-unparseable string.
 */
const priceField = z
  .union([z.number(), z.string()])
  .nullish()
  .transform((value, ctx): number | null => {
    if (value === null || value === undefined) return null;
    if (typeof value === "string" && value.trim() === "") return null;
    const parsed =
      typeof value === "number" ? value : Number(value.replace(/,/g, "").trim());
    if (Number.isNaN(parsed)) {
      ctx.addIssue({ code: "custom", message: "price must be a number" });
      return z.NEVER;
    }
    if (parsed < 0) {
      ctx.addIssue({ code: "custom", message: "price must be non-negative" });
      return z.NEVER;
    }
    return parsed;
  });

/** Validates one raw source product record. */
export const rawProductSchema = z.object({
  id: z.number().int().nonnegative(),
  title: z.string().trim().min(1),
  brand: optionalText,
  category: optionalText,
  tags: z.array(z.string()).default([]),
  price: priceField,
  rating: z.number().nonnegative().nullish(),
  reviews: optionalNonNegInt,
  inStock: z.boolean().default(false),
  releasedAt: optionalText,
  image: optionalText,
  imageWidth: optionalNonNegInt,
  imageHeight: optionalNonNegInt,
  description: optionalText,
});

/** A validated raw record (output of `rawProductSchema`). */
export type RawProduct = z.infer<typeof rawProductSchema>;

/** The canonical, store-ready record written to `products` by Spec 003. */
export type NormalizedProduct = {
  id: string;
  title: string;
  brand: string | null;
  category: string | null;
  tags: string[];
  price: number | null;
  rating: number | null;
  reviews: number | null;
  inStock: boolean;
  releasedAt: Date | null;
  image: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  description: string | null;
  sourceHash: string;
};

/** Trim text; empty/whitespace becomes null. */
function cleanText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** Parse a date-only `YYYY-MM-DD` string to a UTC Date; absent/unparseable -> null. */
function parseReleaseDate(value: string | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const s = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const date = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Deterministic, non-cryptographic FNV-1a (32-bit) hash, hex-encoded. */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Maps a validated raw record to its canonical store-ready form (never throws). */
export function normalizeProduct(raw: RawProduct): NormalizedProduct {
  const releasedAt = parseReleaseDate(raw.releasedAt);
  const normalized: Omit<NormalizedProduct, "sourceHash"> = {
    id: String(raw.id),
    title: raw.title,
    brand: cleanText(raw.brand),
    category: cleanText(raw.category),
    tags: raw.tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0),
    price: raw.price ?? null,
    rating: raw.rating ?? null,
    reviews: raw.reviews ?? null,
    inStock: raw.inStock,
    releasedAt,
    image: cleanText(raw.image),
    imageWidth: raw.imageWidth ?? null,
    imageHeight: raw.imageHeight ?? null,
    description: cleanText(raw.description),
  };

  const canonical = JSON.stringify([
    normalized.id,
    normalized.title,
    normalized.brand,
    normalized.category,
    normalized.tags,
    normalized.price,
    normalized.rating,
    normalized.reviews,
    normalized.inStock,
    normalized.releasedAt ? normalized.releasedAt.toISOString() : null,
    normalized.image,
    normalized.imageWidth,
    normalized.imageHeight,
    normalized.description,
  ]);

  return { ...normalized, sourceHash: fnv1a(canonical) };
}

/** Result of validating + normalizing one untrusted record. */
export type ParseProductResult =
  | { success: true; data: NormalizedProduct }
  | { success: false; error: z.ZodError };

/**
 * Validate then normalize one untrusted record. Never throws — returns a result
 * the import pipeline (Spec 003) uses to tally valid/invalid counts.
 */
export function parseProduct(input: unknown): ParseProductResult {
  const result = rawProductSchema.safeParse(input);
  if (!result.success) return { success: false, error: result.error };
  return { success: true, data: normalizeProduct(result.data) };
}
