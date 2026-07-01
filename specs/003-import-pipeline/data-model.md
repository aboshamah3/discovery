# Phase 1 Data Model: Product Import Pipeline

**Feature**: 003-import-pipeline | **Date**: 2026-06-30

This spec introduces **no new schema**. It reads/writes the two tables created by Spec 002 (`specs/002-data-model-validation/`). This document defines exactly which columns the import touches and the semantics of each write.

## Entities (recap from Spec 002)

### `products` — upsert target (source of truth)

| Column | Type | Set on INSERT | Set on UPDATE | Source |
|---|---|---|---|---|
| `id` | `text` PK | `NormalizedProduct.id` (stable string) | conflict key (unchanged) | normalize |
| `title` | `text NOT NULL` | ✅ | ✅ | normalize |
| `brand` | `text` | ✅ | ✅ | normalize (blank→null) |
| `category` | `text` | ✅ | ✅ | normalize (blank→null) |
| `tags` | `text[] NOT NULL` | ✅ | ✅ | normalize (default `{}`) |
| `price` | `numeric(10,2)` | ✅ | ✅ | normalize (number\|null) |
| `rating` | `real` | ✅ | ✅ | normalize |
| `reviews` | `integer` | ✅ | ✅ | normalize |
| `in_stock` | `boolean NOT NULL` | ✅ | ✅ | normalize (default false) |
| `released_at` | `timestamptz` | ✅ | ✅ | normalize (UTC date\|null) |
| `image` | `text` | ✅ | ✅ | normalize |
| `image_width` | `integer` | ✅ | ✅ | normalize |
| `image_height` | `integer` | ✅ | ✅ | normalize |
| `description` | `text` | ✅ | ✅ | normalize (blank→null) |
| `source_hash` | `text` | ✅ | ✅ | `NormalizedProduct.sourceHash` (FNV-1a) |
| `imported_at` | `timestamptz NOT NULL` | DB default `now()` | **untouched** | DB |
| `created_at` | `timestamptz NOT NULL` | DB default `now()` | **untouched** | DB |
| `updated_at` | `timestamptz NOT NULL` | DB default `now()` | **trigger** `set_updated_at()` | DB |

The 15 normalized fields (`id`…`source_hash`) are supplied by the import; the three bookkeeping timestamps are owned by the database. On a no-op update (hash unchanged) the `WHERE` guard means *no* row is written, so `updated_at` does not move.

### `import_runs` — run log (observability)

| Column | Type | Written by import |
|---|---|---|
| `id` | `uuid` PK | DB default `gen_random_uuid()` (returned to the app on start) |
| `source_url` | `text NOT NULL` | the resolved `PRODUCTS_SOURCE_URL` |
| `status` | `text NOT NULL` | `'running'` → `'success'` \| `'failed'` |
| `fetched_count` | `integer` | total records in the fetched feed |
| `valid_count` | `integer` | records that passed `parseProduct` |
| `invalid_count` | `integer` | records that failed `parseProduct` |
| `upserted_count` | `integer` | rows actually inserted/updated (the "written" count) |
| `error_message` | `text` | populated only on `failed` |
| `started_at` | `timestamptz NOT NULL` | DB default `now()` at start |
| `finished_at` | `timestamptz` | `now()` at terminal status; null while `running` |

## Upsert semantics (the one statement that matters)

Per batch, one parameterized multi-row statement:

```sql
INSERT INTO products (
  id, title, brand, category, tags, price, rating, reviews,
  in_stock, released_at, image, image_width, image_height, description, source_hash
) VALUES
  ($1,  $2,  …, $15),
  ($16, $17, …, $30),
  …                                   -- up to IMPORT_BATCH_SIZE rows
ON CONFLICT (id) DO UPDATE SET
  title        = EXCLUDED.title,
  brand        = EXCLUDED.brand,
  category     = EXCLUDED.category,
  tags         = EXCLUDED.tags,
  price        = EXCLUDED.price,
  rating       = EXCLUDED.rating,
  reviews      = EXCLUDED.reviews,
  in_stock     = EXCLUDED.in_stock,
  released_at  = EXCLUDED.released_at,
  image        = EXCLUDED.image,
  image_width  = EXCLUDED.image_width,
  image_height = EXCLUDED.image_height,
  description  = EXCLUDED.description,
  source_hash  = EXCLUDED.source_hash
WHERE products.source_hash IS DISTINCT FROM EXCLUDED.source_hash;
```

- **New id** → INSERT (counts as 1 written; `created_at`/`imported_at` set by DB).
- **Existing id, changed hash** → UPDATE (counts as 1 written; `updated_at` bumped by trigger).
- **Existing id, same hash** → guarded no-op (0 written; row untouched).
- `rowCount` from each statement is summed into `upserted_count`.

## Count invariants (for SC-004/SC-005)

- `fetched_count = valid_count + invalid_count` (every fetched record is either valid or invalid).
- `valid_count ≥ unique_valid_ids ≥ upserted_count` (dedup may collapse same-id records; the hash guard may skip unchanged ones), so `upserted_count ≤ valid_count`.
- On a clean second run of an unchanged feed: `fetched`/`valid` unchanged, `upserted_count = 0`.

## Run lifecycle (state machine)

```text
            start()                       success
   (none) ─────────────▶ running ───────────────────▶ success   (finished_at set)
                            │
                            │ fatal error (fetch / parse-shape / write)
                            └───────────────────────▶ failed     (finished_at set, error_message set)
```

`running` is transient within a single process; a row left in `running` indicates a hard crash before the terminal update (still an auditable trace).

## Validation reuse

No new validation is defined here. Each untrusted feed element passes through `@ds/shared` `parseProduct(input)`:
- `{ success: true, data: NormalizedProduct }` → counts as valid, enters the dedup map.
- `{ success: false, error: ZodError }` → counts as invalid, skipped (its field-level message is available for logging).

Release dates arrive date-only (`YYYY-MM-DD`) and are normalized to UTC-midnight `Date` by Spec 002's `normalizeProduct`; the import passes the resulting `Date | null` straight to `released_at`.
