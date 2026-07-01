# Phase 0 Research: Product Import Pipeline

**Feature**: 003-import-pipeline | **Date**: 2026-06-30

Decisions that shape the plan. Each records the choice, why, and the alternatives rejected. Everything builds on Spec 002 (`products`, `import_runs`, `@ds/shared` `parseProduct`/`NormalizedProduct`, `@ds/db` `query`/`closePool`).

## D1 — Idempotency: upsert by stable key with a hash guard

**Decision**: Write each valid record with
`INSERT INTO products (…) VALUES (…) ON CONFLICT (id) DO UPDATE SET … WHERE products.source_hash IS DISTINCT FROM EXCLUDED.source_hash`.
Identity is the Spec 002 primary key `id` (the stable string id). The `WHERE … IS DISTINCT FROM` guard means an unchanged record (same `source_hash`) is a no-op on UPDATE, while a changed record is updated and the Spec 002 `BEFORE UPDATE` trigger refreshes `updated_at`. `created_at`/`imported_at` are left untouched on update (only set on insert).

**Why**: Satisfies FR-004/FR-005 and SC-002/SC-003 directly — re-runs converge to one row per id, changed rows update, unchanged rows neither duplicate nor needlessly churn `updated_at`. It is a single round-trip per batch and needs no read-modify-write.

**Rejected**: (a) `DELETE` + `INSERT` per run — loses `created_at`, briefly empties the store, not safe under interruption. (b) `SELECT` then decide in app code — extra round-trips, race-prone. (c) Plain `DO UPDATE` without the hash guard — correct but rewrites every row every run and bumps `updated_at` for unchanged records, muddying SC-003's "changed in place" signal and the `written` count.

## D2 — `written` count = rows actually inserted or updated

**Decision**: `upserted_count` (the spec's "written") is the number of rows the upsert actually inserted or updated, summed from each batch statement's affected-row count (`rowCount`). With the D1 hash guard, a re-run over an unchanged feed reports `written = 0`.

**Why**: Makes SC-002/SC-003 observable — a no-op re-run writes 0, a one-record change writes 1. Keeps `written ≤ valid` (SC-004) true by construction.

**Rejected**: Counting `written = valid` always (can't distinguish a real change from a no-op re-run); using `RETURNING` row collection (unnecessary data transfer for a count).

## D3 — Dependency-injection seam so tests need no database

**Decision**: The orchestration `importProducts(deps)` depends only on injected interfaces — `FeedFetcher` (url → unknown[]), `ProductStore` (`upsertBatch(NormalizedProduct[]) → written count`), `ImportRunStore` (`start(source) → id`, `finish(id, outcome)`), plus `batchSize`, `sourceUrl`, and a `logger`. Real implementations (HTTP `fetch`, `@ds/db`-backed stores) live in `stores.ts`; `run.ts` wires them from env. Tests pass in-memory fakes.

**Why**: The import logic is a constitution "critical path" (VI) and must be tested, but binding it to live Postgres would make `pnpm test` require Docker and a populated DB — flaky and CI-hostile. Injection lets fixture tests exercise the *entire* pipeline (validation tally, dedup, batching, idempotent re-run via a fake store keyed by id, changed-record update, run-record success/failure) deterministically and fast. It mirrors how Spec 002 kept its tests pure.

**Rejected**: (a) Integration tests against real Postgres as the primary gate — Docker dependency, slow, non-deterministic. (b) Mocking the `pg` module — couples tests to SQL strings, brittle. (c) An in-memory SQLite shim — a second engine with different semantics, more risk than value.

## D4 — Bounded, batched multi-row upserts

**Decision**: Chunk the normalized records into slices of `IMPORT_BATCH_SIZE` (env, default **500**) and issue one multi-row `INSERT … ON CONFLICT …` per chunk with positional params (`$1…$n`). `fetched`/`valid`/`invalid` are tallied during validation; `written` accumulates per batch.

**Why**: FR-006 mandates bounded batches; 500/batch keeps each statement's parameter count well under Postgres's 65,535 bound (14 columns × 500 ≈ 7,000 params) and imports 4,000 records in ≤ 8 write round-trips. A configurable size lets the quickstart prove multi-batch behavior (SC-006) with a small value.

**Rejected**: One unbounded statement (violates FR-006; risks the param limit as the catalog grows); row-by-row inserts (4,000 round-trips, slow).

## D5 — Run-record lifecycle: start → finish, fail-loud

**Decision**: At the very start, insert an `import_runs` row with `status='running'`, `source_url`, `started_at=now()` and zero counts; capture its `id`. On success, update to `status='success'`, the four counts, `finished_at=now()`. On any fatal error (missing config, unreachable source, non-2xx, non-array/malformed payload, write failure), update to `status='failed'`, whatever counts are known, `finished_at`, and `error_message`, then surface a non-zero process exit.

**Why**: Satisfies FR-008/FR-009 and SC-005 — every run is observable with a terminal status, failures carry an explanatory message and never masquerade as success. Writing the row first means even an early crash leaves an auditable `running`/`failed` trace.

**Rejected**: Writing the run record only at the end (an early crash leaves no trace); throwing without recording a `failed` run (silent failure, violates III/FR-009).

## D6 — Fetch with global `fetch`, injected as a dependency

**Decision**: The real fetcher uses Node 20's global `fetch`, asserts a 2xx response, parses JSON, and asserts the payload is an array before returning it; it is injected as `FeedFetcher` so tests substitute a fake (including one that throws, to drive the failure path).

**Why**: No new runtime dependency (constitution scope discipline); Node 20 LTS is already the project's runtime (`.nvmrc`). Injecting it keeps the network out of tests.

**Rejected**: `axios`/`node-fetch` (unnecessary dependency); calling `fetch` directly inside the orchestration (un-testable without network).

## D7 — Duplicate ids within one feed: last-write-wins

**Decision**: If the same `id` appears twice in a single feed, dedupe valid normalized records into a map keyed by `id` before batching, keeping the last occurrence.

**Why**: Avoids two rows for one id within a batch (which would make the affected-row count ambiguous) and matches the spec's stated resolution. Deterministic and cheap.

**Rejected**: Letting both reach the upsert (the second `ON CONFLICT` against the same just-inserted id within one statement errors in Postgres: "ON CONFLICT DO UPDATE command cannot affect row a second time").

## Resolved unknowns

- Source location & shape — confirmed: `PRODUCTS_SOURCE_URL` (in `.env`/`.env.example`) returns a JSON **array of 4,000** objects whose keys exactly match `rawProductSchema` (`id,title,brand,category,tags,price,rating,reviews,inStock,releasedAt,image,imageWidth,imageHeight,description`).
- Hashing for change detection — reuse Spec 002's deterministic `sourceHash` already on `NormalizedProduct`; no new hashing here.
- Schema changes — none; Spec 002's tables and trigger are sufficient.
