# Phase 0 Research: Typesense Search Foundation

**Feature**: 004-search-foundation | **Date**: 2026-06-30

Decisions that shape the plan. Each records the choice, why, and the alternatives rejected. Everything builds on Spec 002 (`products` schema, `NormalizedProduct`) and Spec 003 (catalog imported into Postgres) and follows `DS_PROJECT_SPEC_PLAN.md` §6.

## D1 — Official `typesense` Node client, server-side only

**Decision**: Use the official `typesense` npm package (v3). `getSearchClient()` builds a `Client` from env (`TYPESENSE_HOST/PORT/PROTOCOL/API_KEY`) using the **admin** `apiKey`. It is constructed only in server-side code paths (`@ds/search`, scripts) — never imported by browser code.

**Why**: First-party client with typed collection/search APIs; the admin key grants write/schema access and must stay server-side (constitution V, FR-012). A separate search-only key (`TYPESENSE_SEARCH_ONLY_API_KEY`) exists for later browser use but is not needed in this spec.

**Rejected**: Raw HTTP calls (reinventing the client, error-prone); embedding the admin key anywhere client-reachable (security violation).

## D2 — Idempotent `ensureCollection`: retrieve-or-create

**Decision**: `ensureCollection(client)` tries `client.collections(name).retrieve()`; if it 404s (`ObjectNotFound`), it creates the collection from `productsCollectionSchema`; any other error rethrows. It does **not** drop an existing collection.

**Why**: Satisfies FR-002/SC-001 — safe whether or not the collection exists, with no document loss on a no-op. Creating only when missing avoids destroying an already-populated index.

**Rejected**: Always `delete`+`create` (loses indexed docs on every ensure; conflates ensure with a full rebuild); blind `create` (throws when it already exists).

## D3 — Reindex via batched `import` with `action: "upsert"`, keyed on `id`

**Decision**: `reindexProducts` streams products from Postgres in batches, maps each to a `ProductSearchDocument`, and calls `collection.documents().import(docs, { action: "upsert" })` per batch. Document `id` is the product's stable `id`, so upsert replaces in place.

**Why**: Satisfies FR-004/SC-004 — re-running converges to one document per `id` with no duplicates; a partial run is recovered by simply re-running. `import` is Typesense's bulk path (one HTTP call per batch), far faster than per-document writes. The collection can be dropped and fully rebuilt from Postgres (FR-006/SC-003).

**Rejected**: `action: "create"` (errors on existing ids, not re-runnable); delete-all-then-create per run (a visible empty window, slower); per-document `upsert` (thousands of round-trips).

## D4 — Release date → epoch timestamp; `reviews` always present

**Decision**: `toSearchDocument` sets `releasedAtTimestamp` to the `released_at` value as **Unix seconds** (`Math.floor(date.getTime() / 1000)`), omitted when null. `reviews` is always written (absent → `0`). Other optionals (`brand`, `category`, `price`, `rating`, `image`, dimensions, `description`) are **omitted** when null.

**Why**: Typesense sorts on numbers, so the date must become an `int64`; deriving it deterministically from Postgres keeps the index rebuildable (FR-007). `default_sorting_field: "reviews"` (§6.3) requires every document to carry `reviews`, so it is defaulted to 0 rather than left optional — otherwise documents with null reviews would be rejected. Optional fields are omitted (not null) because the schema marks them `optional: true` and Typesense expects absence, not null.

**Rejected**: Milliseconds for the timestamp (works, but seconds is the conventional `int64` epoch and smaller); marking `reviews` optional while keeping it as `default_sorting_field` (Typesense rejects documents missing the default sort field); writing `null` for absent optionals (type errors against an `optional` string/float field).

## D5 — Pure `buildSearchParams` with a hard page-size cap

**Decision**: `buildSearchParams({ q, page, perPage, sort, filters })` returns a plain Typesense search-params object per §6.4: `q` defaults to `*` when blank; `query_by: "title,brand,category,tags,description"` with weights `5,4,3,3,1`; `prefix: true`; `num_typos: "2,2,1,1,1"`; `typo_tokens_threshold: 1`; `drop_tokens_threshold: 0`; `facet_by: "brand,category,tags,inStock"`; `sort_by: "_text_match:desc,rating:desc,reviews:desc"`. `per_page` defaults to 24 and is clamped to `[1, 60]`; `page` defaults to 1 (min 1); `filter_by` is composed from supplied filters.

**Why**: A pure function makes all of FR-008/009/010/011 + SC-006 unit-testable with no engine. The 24/60 default+cap and the weighting/typo/ranking come straight from §6.4. Clamping prevents an unbounded `per_page` reaching the engine.

**Rejected**: Building params inside the search call (un-testable without Typesense); passing `per_page` through unbounded (DoS-ish, violates FR-009); randomized empty-query results (violates FR-011/§6.4 "do not return unstable random results" — the static `sort_by` gives stable ordering instead).

## D6 — `filter_by` composition with backtick-quoted values

**Decision**: Each supplied filter becomes a clause joined by ` && `: `brand:=\`<value>\``, `category:=\`<value>\``, `tags:=\`<value>\``, `inStock:=true|false`. String values are wrapped in backticks (Typesense's literal delimiter) so punctuation/spaces match literally. No filter supplied → no `filter_by` key.

**Why**: Satisfies FR-010/SC-006 and the special-characters edge case — backtick-quoting lets a brand like `Orla & Vine` match exactly instead of breaking the filter grammar. Omitting the key entirely when empty avoids an invalid empty `filter_by`.

**Rejected**: Unquoted values (break on spaces/`&`); always emitting `filter_by` (empty string is invalid); SQL-style quoting (wrong grammar for Typesense).

## D7 — Dependency-injection seam so reindex tests need no engine or DB

**Decision**: `reindexProducts(deps)` depends on injected `ProductReader` (`streamBatches(size): AsyncIterable<ProductRow[]>`) and `SearchIndex` (`ensure(): Promise<void>`, `indexBatch(docs): Promise<number>`), plus `batchSize` and a logger. Real implementations (`stores.ts`) wrap `@ds/db` and the Typesense client; tests inject in-memory fakes.

**Why**: The reindex loop is a constitution critical path (VI) but binding it to live Postgres + Typesense would make `pnpm test` require both running. Injection lets fixture tests verify batching, counts, mapping integration, and idempotent re-run deterministically — mirroring Spec 003's `@ds/import` seam.

**Rejected**: Integration-only tests against live engines (Docker dependency, slow, flaky); mocking the `typesense`/`pg` modules (brittle, couples to call shapes).

## Resolved unknowns

- Collection name & schema fields — fixed by §6.3 (`products`, `default_sorting_field: "reviews"`); name overridable via `TYPESENSE_PRODUCTS_COLLECTION`.
- Query weighting/typo/ranking + page sizes — fixed by §6.4 (default 24, cap 60).
- Connection + credentials — from env (`TYPESENSE_*`), already in `.env.example` (Spec 001); admin key server-side only.
- Reindex batch size — `REINDEX_BATCH_SIZE` (env, default 500), already in `.env.example`.
- Source of product data — Postgres `products` (Spec 002 schema, populated by Spec 003); read via `@ds/db` `query`.
