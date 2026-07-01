# Phase 1 Data Model: Data Model + Validation

**Feature**: 002-data-model-validation | **Date**: 2026-06-30

This spec defines the canonical PostgreSQL store (no ORM) and the validation/normalization boundary that turns the messy source feed into store-ready records. Concrete column types are PostgreSQL 16; the validation library is Zod; both are fixed by the constitution (v1.1.0) and `DS_PROJECT_SPEC_PLAN.md`.

---

## Entity: `products` (canonical product store — source of truth)

One row per catalog item. Written by the import (Spec 003), read by reindex (Spec 004) and the API (Spec 005). Identified by a stable **string** id derived from the source's numeric id.

| Column | PostgreSQL type | Null? | Default | Notes |
|---|---|---|---|---|
| `id` | `text` | no | — | **Primary key.** `String(sourceId)` — stable across re-imports (FR-002). |
| `title` | `text` | no | — | Required. |
| `brand` | `text` | yes | — | Optional; blank → `null`. |
| `category` | `text` | yes | — | Optional; blank → `null`. |
| `tags` | `text[]` | no | `'{}'` | Possibly empty list (FR-007). |
| `price` | `numeric(10,2)` | yes | — | Exact currency, 2 dp. Coerced from number/string/null. |
| `rating` | `real` | yes | — | Non-negative when present. |
| `reviews` | `integer` | yes | — | Non-negative when present. |
| `in_stock` | `boolean` | no | `false` | Defaults to `false` when absent (FR-008). |
| `released_at` | `timestamptz` | yes | — | Parsed from date-only `YYYY-MM-DD` at UTC midnight; unparseable/absent → `null`. |
| `image` | `text` | yes | — | Optional. |
| `image_width` | `integer` | yes | — | Non-negative when present. |
| `image_height` | `integer` | yes | — | Non-negative when present. |
| `description` | `text` | yes | — | Optional; blank → `null`. |
| `source_hash` | `text` | yes | — | Deterministic content hash (change detection, Spec 003). |
| `imported_at` | `timestamptz` | no | `now()` | Set/refreshed by import. |
| `created_at` | `timestamptz` | no | `now()` | Set on first insert. |
| `updated_at` | `timestamptz` | no | `now()` | Maintained by a `BEFORE UPDATE` trigger. |

**Constraints & indexes**:
- `PRIMARY KEY (id)` → uniqueness (US1 scenario 3).
- Secondary indexes on `brand`, `category`, `in_stock`, `released_at`, `rating`, `price` (mirror `DS_PROJECT_SPEC_PLAN.md` §5.1; support later filter/sort without migration).
- Trigger `products_set_updated_at` calls `set_updated_at()` to set `updated_at = now()` on every `UPDATE`.

---

## Entity: `import_runs` (import observability)

One row per import execution (US3). Written by the import (Spec 003); this spec only creates the table.

| Column | PostgreSQL type | Null? | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | no | `gen_random_uuid()` | Primary key. |
| `source_url` | `text` | no | — | Where the catalog was fetched from. |
| `status` | `text` | no | — | e.g. `running` / `success` / `failed` (free-text; lifecycle owned by Spec 003). |
| `fetched_count` | `integer` | no | `0` | Records received from source. |
| `valid_count` | `integer` | no | `0` | Records that passed validation. |
| `invalid_count` | `integer` | no | `0` | Records rejected by validation. |
| `upserted_count` | `integer` | no | `0` | Records written to `products`. |
| `error_message` | `text` | yes | — | Set on failure. |
| `started_at` | `timestamptz` | no | `now()` | Run start. |
| `finished_at` | `timestamptz` | yes | — | Null until the run completes. |

---

## Entity: `schema_migrations` (migration bookkeeping)

Internal table created by the migrate runner so `db:migrate` is idempotent (FR-003, SC-003).

| Column | PostgreSQL type | Null? | Default | Notes |
|---|---|---|---|---|
| `filename` | `text` | no | — | Primary key — name of the applied `.sql` file. |
| `applied_at` | `timestamptz` | no | `now()` | When it was applied. |

The runner applies, in filename order, every migration not already present in this table, each inside a transaction.

---

## Boundary type: `RawProduct` (validated source shape)

The output of `rawProductSchema.parse()`. Validates an untrusted source record; rejects structural/bound violations with field-level errors (FR-004, FR-012). Keeps the record close to source — only `price` is coerced (so its bound can be checked).

| Field | Accepted input | Validated output | Rule |
|---|---|---|---|
| `id` | number | `number` | required, integer, ≥ 0 |
| `title` | string | `string` | required, trimmed, length ≥ 1 |
| `brand` | string / null / absent | `string \| null \| undefined` | optional |
| `category` | string / null / absent | `string \| null \| undefined` | optional |
| `tags` | string[] / absent | `string[]` | defaults to `[]`; each element a string |
| `price` | number / string / null / absent | `number \| null` | strip `,`, trim, `parseFloat`; unparseable → reject; negative → reject |
| `rating` | number / null / absent | `number \| null \| undefined` | when present: ≥ 0 |
| `reviews` | number / null / absent | `number \| null \| undefined` | when present: integer ≥ 0 |
| `inStock` | boolean / absent | `boolean` | defaults to `false` |
| `releasedAt` | string / null / absent | `string \| null \| undefined` | not parsed here (normalization does) |
| `image` | string / null / absent | `string \| null \| undefined` | optional |
| `imageWidth` | number / null / absent | `number \| null \| undefined` | when present: integer ≥ 0 |
| `imageHeight` | number / null / absent | `number \| null \| undefined` | when present: integer ≥ 0 |
| `description` | string / null / absent | `string \| null \| undefined` | optional |

Unknown keys are stripped. A failed parse yields a `ZodError` whose issues name the offending field path (FR-004).

---

## Boundary type: `NormalizedProduct` (store-ready record)

The output of `normalizeProduct(raw)` — a total function (never throws). This is exactly what Spec 003 writes to `products`.

```ts
type NormalizedProduct = {
  id: string;                 // String(raw.id)
  title: string;
  brand: string | null;       // trimmed; '' / whitespace → null
  category: string | null;
  tags: string[];             // [] if absent
  price: number | null;       // from validated raw.price
  rating: number | null;
  reviews: number | null;
  inStock: boolean;           // false if absent
  releasedAt: Date | null;    // UTC midnight from 'YYYY-MM-DD'; unparseable/absent → null
  image: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  description: string | null;
  sourceHash: string;         // deterministic FNV-1a over canonical content
};
```

### Field mapping: source → raw → normalized → column

| Source field (JSON) | Raw (validated) | Normalized | `products` column |
|---|---|---|---|
| `id` (number) | `number` | `String(id)` | `id` (text) |
| `title` | `string` | `string` | `title` |
| `brand` | `string?` | `string \| null` | `brand` |
| `category` | `string?` | `string \| null` | `category` |
| `tags` | `string[]` | `string[]` | `tags` (text[]) |
| `price` (num/str/null) | `number \| null` | `number \| null` | `price` (numeric) |
| `rating` | `number?` | `number \| null` | `rating` (real) |
| `reviews` | `number?` | `number \| null` | `reviews` (int) |
| `inStock` | `boolean` | `boolean` | `in_stock` |
| `releasedAt` (`YYYY-MM-DD`) | `string?` | `Date \| null` (UTC) | `released_at` (timestamptz) |
| `image` | `string?` | `string \| null` | `image` |
| `imageWidth` | `number?` | `number \| null` | `image_width` (int) |
| `imageHeight` | `number?` | `number \| null` | `image_height` (int) |
| `description` | `string?` | `string \| null` | `description` |
| — (derived) | — | `sourceHash` | `source_hash` |

---

## Validation rules (FR-004, FR-005, FR-012)

- **Required**: `id` (integer ≥ 0), `title` (non-empty after trim). Missing or wrong-typed → reject with the field path.
- **Bounds (when present)**: `price ≥ 0`, `rating ≥ 0`, `reviews` integer `≥ 0`, `imageWidth`/`imageHeight` integer `≥ 0`. Violations → reject (FR-012).
- **Price parse**: number → itself; string → strip thousands separators (`,`) and trim, then `parseFloat`; `null`/absent/empty → `null`; non-numeric string → reject.
- **Optional fields absent** → `undefined`/`null` accepted, never an error (FR-005).

## Normalization rules (FR-002, FR-006, FR-007, FR-008)

- **Id**: `String(raw.id)` — deterministic & stable (FR-002, SC-004).
- **Optional text** (`brand`, `category`, `image`, `description`): trim; empty/whitespace → `null`.
- **Tags**: pass through (already `[]` when absent); trim elements, drop empties.
- **Price/rating/reviews/dimensions**: `null` when absent, else the validated number.
- **`inStock`**: `false` when absent.
- **`releasedAt`**: parse `YYYY-MM-DD` as UTC midnight → `Date`; absent/unparseable → `null` (no throw).
- **`sourceHash`**: FNV-1a hex over a canonical JSON serialization of the content fields (excludes timestamps), so identical content → identical hash (SC-004).

---

## Utility surface (public API of `@ds/shared`, added by this spec)

| Export | Signature | Purpose |
|---|---|---|
| `rawProductSchema` | `z.ZodType` | Validate/coerce one raw source record. |
| `RawProduct` | `type` (`z.infer`) | Validated raw shape. |
| `NormalizedProduct` | `type` | Store-ready shape (above). |
| `normalizeProduct` | `(raw: RawProduct) => NormalizedProduct` | Total mapping raw → normalized. |
| `parseProduct` | `(input: unknown) => { success: true; data: NormalizedProduct } \| { success: false; error: z.ZodError }` | Validate **and** normalize in one call (used by Spec 003 to count valid/invalid). |

Full behavioral contract: [contracts/validation.contract.md](./contracts/validation.contract.md). Schema/migration contract: [contracts/db-schema.contract.md](./contracts/db-schema.contract.md).

---

## Deferred (NOT in this spec)

- Fetching the catalog over the network and batch-upserting it → **Spec 003** (uses `parseProduct` + the `products` upsert).
- Typesense search document & collection → **Spec 004**.
- HTTP DTOs / API response shapes → **Spec 005**.
