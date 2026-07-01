# Implementation Plan: Typesense Search Foundation

**Branch**: `004-search-foundation` | **Date**: 2026-06-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-search-foundation/spec.md`

## Summary

Build the `@ds/search` package and the reindex/smoke commands that make the canonical PostgreSQL catalog searchable in Typesense. The package provides: a server-side Typesense client factory (`getSearchClient()` from env, admin key server-side only); the `products` collection schema (§6.3) and an idempotent `ensureCollection()` (create-if-missing, no document loss on a no-op); a pure `toSearchDocument(row)` mapper (Postgres row → `ProductSearchDocument`, deriving `releasedAtTimestamp` from `released_at`, omitting absent optionals, defaulting `reviews` to 0 for a stable default sort); a pure `buildSearchParams(input)` query builder (§6.4 — `query_by` weighting, `prefix`, `num_typos`, `_text_match`→`rating`→`reviews` ranking, default page size 24 capped at 60, `filter_by` from brand/category/tag/inStock); and a `reindexProducts(deps)` orchestration that streams products from PostgreSQL in bounded batches (`REINDEX_BATCH_SIZE`, default 500) and imports them with `action: "upsert"` keyed on `id` (repeatable, no duplicates). `scripts/reindex-products.ts` and `scripts/smoke-search.ts` are thin CLIs over the package.

Mirroring Spec 003: the two pure functions and the reindex orchestration are dependency-injected (a `ProductReader` over Postgres and a `SearchIndex` over Typesense), so fixture tests exercise mapping, query building, and the reindex loop with in-memory fakes — `pnpm test` stays green with no Typesense or Postgres running. Engine-dependent steps (ensure, live reindex, smoke) are verified via the quickstart. No API route (Spec 005), no frontend (Spec 007).

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20 LTS.

**Primary Dependencies**: `typesense` (v3, official Node client) for the search engine; `@ds/db` (`query`) to read products; `@ds/shared` for shared types; `tsx` to run the CLIs; `dotenv` for env. No ORM (constitution v1.1.0).

**Storage**: Typesense 27 (local via Docker, Spec 001) holds the derived `products` collection; PostgreSQL 16 remains the source of truth (read-only here).

**Testing**: Vitest 2.x — pure unit tests for `toSearchDocument` and `buildSearchParams`; fixture-based tests for `reindexProducts` against a fake reader + fake index. Live ensure/reindex/smoke verified via the quickstart.

**Target Platform**: Linux/macOS dev workstation with Docker + pnpm. Railway deploy is Spec 006.

**Project Type**: Web-application monorepo — work lands in `packages/search` (currently a placeholder) and root `scripts/`; `apps/web` and the Spec 002/003 packages are untouched except for reuse.

**Performance Goals**: Not a latency feature here. Reindex the full ~4,000 products in seconds via batched `import` calls (default 500/batch). Query performance is exercised in Spec 005's API.

**Constraints**: Search is a rebuildable index, never source of truth (II; FR-006). Repeatable/idempotent reindex in bounded batches (III; FR-004/005). Admin key server-side only (V; FR-012). Env-only config. No API route, no frontend (I; FR-015).

**Scale/Scope**: 1 package (`@ds/search`, ~6 source files + tests), 2 thin CLI scripts, 1 root `package.json` (deps + 2 scripts). No new env vars (all present from Spec 001).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluated against `.specify/memory/constitution.md` **v1.1.0**:

| Principle | Compliance in this plan |
|---|---|
| I. Spec-driven, frontend-last | ✅ Search package + scripts only; no API route, no product UI. Independently testable increment. |
| II. PostgreSQL is source of truth; search is rebuildable | ✅ Every document derived solely from a Postgres row; `reindexProducts` rebuilds from scratch; Typesense holds nothing non-reconstructable (FR-006). |
| III. Idempotent, script-first pipelines | ✅ Committed `scripts/reindex-products.ts`; `ensureCollection` idempotent; reindex upserts by `id` in bounded batches; reports counts; fails loudly on engine errors. |
| IV. Contract-first, validated boundaries | ✅ Collection schema + query/document contracts documented in `contracts/`; strict TS end-to-end; the reindex input is the trusted internal Postgres row (already validated at the Spec 003 boundary). |
| V. Secrets & scope discipline | ✅ Typesense host/key from env; admin key server-side only, never browser-exposed (FR-012); no auth/cart/admin scope. |
| VI. Non-negotiable quality gates | ✅ New `@ds/search` package ships `typecheck`/`test`; vitest `packages/**` glob + `pnpm -r` pick it up; pure logic fully covered. |
| Tech Constraints (v1.1.0) | ✅ Typesense is the ratified search engine; Postgres read via `@ds/db` (no ORM). |

**Result**: PASS. No violations; Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/004-search-foundation/
├── plan.md              # This file (/speckit.plan output)
├── spec.md              # Feature specification (/speckit.specify output)
├── research.md          # Phase 0 — decisions & rationale
├── data-model.md        # Phase 1 — collection schema, document mapping, query params
├── quickstart.md        # Phase 1 — ensure → reindex → smoke verification guide
├── contracts/
│   └── search.contract.md   # @ds/search API: client, schema, mapper, query builder, reindex
├── checklists/
│   └── requirements.md  # Spec quality checklist (/speckit.specify output)
└── tasks.md             # Phase 2 (/speckit.tasks output)
```

### Source Code (repository root)

```text
packages/
└── search/                         # @ds/search — Typesense foundation (was a placeholder)
    ├── src/
    │   ├── client.ts               # getSearchClient() factory from env (admin key, server-side)
    │   ├── schema.ts               # productsCollectionSchema (§6.3) + collection name from env
    │   ├── collection.ts           # ensureCollection(client) — idempotent create-if-missing
    │   ├── document.ts             # ProductSearchDocument + toSearchDocument(row) pure mapper
    │   ├── query.ts                # buildSearchParams(input) pure builder (§6.4) + page-size cap
    │   ├── reindex.ts              # reindexProducts(deps) orchestration (ProductReader/SearchIndex)
    │   ├── stores.ts               # real ProductReader (@ds/db) + SearchIndex (Typesense client)
    │   ├── index.ts                # public exports
    │   ├── document.test.ts        # pure mapper tests
    │   ├── query.test.ts           # pure query-builder tests
    │   └── reindex.test.ts         # fixture-based reindex tests (fakes, no engine)
    ├── package.json                # @ds/search; + typesense, @ds/db, @ds/shared, dotenv; typecheck + test
    └── tsconfig.json

scripts/
├── reindex-products.ts             # thin CLI: ensure + reindex from Postgres (NEW)
└── smoke-search.ts                 # thin CLI: run a sample search and print results (NEW)

# Root
package.json                        # + "reindex:products", "smoke:search" scripts
.env / .env.example                 # TYPESENSE_* + REINDEX_BATCH_SIZE already present (Spec 001)
```

**Structure Decision**: The search *logic* fills the reserved `packages/search` package (typechecked by `pnpm -r typecheck`, discovered by vitest's `packages/**` glob), keeping the pure functions + reindex loop tested without a live engine. The *operational entrypoints* are committed `scripts/reindex-products.ts` and `scripts/smoke-search.ts` (constitution III), already typecheck-covered by the root `tsconfig.json` `include: ["scripts"]` added in Spec 003.

## Complexity Tracking

No constitution violations; no entries required. As in Spec 003, putting orchestration behind injected `ProductReader`/`SearchIndex` interfaces is the simpler path: it is the only way to keep the reindex loop under the existing test+typecheck gates without standing up Postgres + Typesense for `pnpm test`.

## Phase Outputs

- **Phase 0 — Research**: [research.md](./research.md) — official `typesense` client; idempotent `ensureCollection` (retrieve-or-create); upsert-by-id reindex for repeatability; release-date→epoch + `reviews` default for a valid `default_sorting_field`; pure query builder with page-size cap; dependency-injection seam for engine-free tests.
- **Phase 1 — Design & Contracts**:
  - [data-model.md](./data-model.md) — collection schema, Postgres-row→document field mapping, search-params shape.
  - [contracts/search.contract.md](./contracts/search.contract.md) — `@ds/search` public API + CLI contracts.
  - [quickstart.md](./quickstart.md) — ensure → reindex → smoke, mapped to SC-001…SC-009.

## Post-Design Constitution Re-Check

Re-evaluated after Phase 1: still **PASS**. The design keeps Postgres the sole source of truth, derives every document from it, rebuilds idempotently in bounded batches, keeps the admin key server-side, and adds no ORM, no API route, and no UI. No new complexity to justify.
