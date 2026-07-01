# Contract: Product Validation & Normalization API

**Feature**: 002-data-model-validation | **Module**: `@ds/shared`

This is the public, stable contract for converting an untrusted source product record into a store-ready record. The import pipeline (Spec 003) depends on it; it MUST remain backward compatible within this milestone (constitution IV).

---

## `rawProductSchema`

A Zod schema that validates and lightly coerces **one** raw source record.

- **Input**: `unknown`.
- **Success**: a `RawProduct` (validated). Unknown keys are stripped.
- **Failure**: a `ZodError` whose `issues[].path` names the offending field and `issues[].message` explains why (FR-004).

### Accepted contract (per field)

| Field | Required | Accepted | Rejected (→ ZodError) |
|---|---|---|---|
| `id` | yes | integer ≥ 0 | missing, non-number, negative, non-integer |
| `title` | yes | non-empty string (after trim) | missing, non-string, empty/whitespace |
| `brand`,`category`,`image`,`description` | no | string, `null`, or absent | non-string (when present and not null) |
| `tags` | no | `string[]` (defaults `[]`) | non-array, non-string element |
| `price` | no | number, numeric string (commas allowed), `null`, absent | non-numeric string, negative |
| `rating` | no | number ≥ 0, `null`, absent | negative, non-number |
| `reviews` | no | integer ≥ 0, `null`, absent | negative, non-integer |
| `inStock` | no | boolean (defaults `false`) | non-boolean |
| `releasedAt` | no | string, `null`, absent | non-string (when present and not null) |
| `imageWidth`,`imageHeight` | no | integer ≥ 0, `null`, absent | negative, non-integer |

> `price` is the only value coerced inside the schema (so its non-negative bound can be enforced). All other normalization happens in `normalizeProduct`.

---

## `normalizeProduct(raw: RawProduct): NormalizedProduct`

A **total** function (never throws) that maps a validated record to the canonical store-ready shape.

- **Guarantees**:
  - `id === String(raw.id)` — stable and deterministic (FR-002, SC-004).
  - Optional text trimmed; empty/whitespace → `null` (FR-006).
  - `releasedAt`: `YYYY-MM-DD` → `Date` at UTC midnight; absent/unparseable → `null` (no throw).
  - `tags`: never `null` — `[]` when absent; elements trimmed, empties dropped.
  - `inStock`: `false` when absent.
  - `sourceHash`: identical normalized content → identical hash; differing content → (practically always) different hash.
  - **Determinism**: `normalizeProduct(x)` deep-equals `normalizeProduct(x)` for the same input (SC-004).

---

## `parseProduct(input: unknown)`

Convenience that composes validation + normalization for the import loop.

```ts
type ParseProductResult =
  | { success: true;  data: NormalizedProduct }
  | { success: false; error: z.ZodError };
```

- Valid input → `{ success: true, data }` where `data` is the normalized record.
- Invalid input → `{ success: false, error }` (never throws), enabling Spec 003 to tally valid/invalid counts and log field-level reasons.

---

## Examples

**Valid (formatted-string price, missing optionals)**

```jsonc
// input
{ "id": 42, "title": "  Wide Linen Tray  ", "tags": ["linen"], "price": "1,081.43", "releasedAt": "2024-06-24", "inStock": true }
// parseProduct → success, data:
{
  "id": "42", "title": "Wide Linen Tray", "brand": null, "category": null,
  "tags": ["linen"], "price": 1081.43, "rating": null, "reviews": null,
  "inStock": true, "releasedAt": "2024-06-24T00:00:00.000Z" /* Date */,
  "image": null, "imageWidth": null, "imageHeight": null, "description": null,
  "sourceHash": "<stable hex>"
}
```

**Invalid (missing required title, negative price)**

```jsonc
// input
{ "id": 7, "price": -3 }
// parseProduct → { success: false, error } with issues at paths: ["title"], ["price"]
```
