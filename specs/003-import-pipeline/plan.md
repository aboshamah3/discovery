# Implementation Plan: Product Import Pipeline

**Branch**: `003-import-pipeline` | **Date**: 2026-06-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-import-pipeline/spec.md`

## Summary

Build the idempotent catalog import that turns the empty Spec 002 stores into a populated source of truth. A committed CLI (`scripts/import-products.ts`, run via `pnpm import:products`) fetches the ~4,000-record JSON feed from `PRODUCTS_SOURCE_URL`, validates/normalizes each record through the existing `@ds/shared` `parseProduct` boundary, and **upserts** valid records into `products` keyed by the stable `id` using `INSERT … ON CONFLICT (id) DO UPDATE … WHERE products.source_hash IS DISTINCT FROM EXCLUDED.source_hash` — so re-runs never duplicate, unchanged rows are skipped, and changed rows are updated (the Spec 002 `updated_at` trigger bumps the timestamp). Records are written in bounded batches (`IMPORT_BATCH_SIZE`, default 500) as multi-row statements. Every run writes an `import_runs` row (start → finish) with `status`, the four counts, timing, and an `error_message` on failure; fatal conditions (unreachable source, non-2xx, malformed payload) fail loudly with a `failed` run and non-zero exit.

The testable orchestration lives in a new **`@ds/import`** package (`importProducts(deps)`), with the feed fetcher and the two stores injected behind interfaces so fixture-based Vitest tests run the full pipeline against in-memory fakes — no Docker required for `pnpm test`. `scripts/import-products.ts` is a thin launcher that wires the real env-backed dependencies. No Typesense, no product UI.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20 LTS (global `fetch`, no extra HTTP dep).

**Primary Dependencies**: `@ds/shared` (`parseProduct`, `NormalizedProduct`) and `@ds/db` (`query`, `closePool`) from Spec 002; `tsx` to run the CLI; `dotenv` to load env. No ORM (constitution v1.1.0). No new third-party runtime dependency.

**Storage**: PostgreSQL 16 — `products` (upsert target) and `import_runs` (run log), both created by Spec 002's `pnpm db:migrate`. This spec only reads/writes rows; it adds no schema.

**Testing**: Vitest 2.x — fixture-based unit/behavior tests of `importProducts` against fake `FeedFetcher` / `ProductStore` / `ImportRunStore`. The live HTTP + Postgres path is exercised manually via the quickstart.

**Target Platform**: Linux/macOS dev workstation with Docker (local Postgres) + pnpm. Scheduled/Railway execution is later (Spec 006).

**Project Type**: Web-application monorepo — work lands in a new `packages/import`, the root `scripts/`, and root `package.json`; `apps/web` and `packages/search` untouched.

**Performance Goals**: Not a latency feature. Import the full ~4,000 records in seconds; bound memory/round-trips via batched multi-row upserts (default 500/batch → ≤ ~8 write round-trips).

**Constraints**: Idempotent, re-runnable, bounded batches, fail-loud (constitution III; FR-004/006/007/009). Postgres is source of truth (II; FR-013). Zod boundary reuse (IV; FR-003). Env-only config, no committed secrets (V; FR-002). No search index, no frontend (I; FR-012).

**Scale/Scope**: 1 new package (`@ds/import`, ~4 source files + tests + fixtures), 1 thin CLI script, 1–2 root `package.json` script/devDep edits, optional `.env.example` `IMPORT_BATCH_SIZE`. No migrations.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluated against `.specify/memory/constitution.md` **v1.1.0**:

| Principle | Compliance in this plan |
|---|---|
| I. Spec-driven, frontend-last | ✅ Backend/data pipeline only; no product UI. Independently testable increment (load + re-run + observability). |
| II. PostgreSQL is source of truth; search is rebuildable | ✅ Import targets `products` (canonical) only; no search code. After import the store alone holds the catalog (FR-013). |
| III. Idempotent, script-first pipelines | ✅ Committed script under `scripts/`; upsert-by-stable-key idempotency; bounded batches; fails loudly with a `failed` run + non-zero exit, never partially/silently. |
| IV. Contract-first, validated boundaries | ✅ Reuses the Spec 002 Zod boundary (`parseProduct`) for every untrusted record; store/fetch contracts documented in `contracts/`; strict TS end-to-end. |
| V. Secrets & scope discipline | ✅ `PRODUCTS_SOURCE_URL` / `IMPORT_BATCH_SIZE` / `DATABASE_URL` from env only; no secrets committed; no auth/cart/admin/multi-tenant. |
| VI. Non-negotiable quality gates | ✅ New `@ds/import` package ships its own `typecheck`/`test` scripts, so `pnpm -r` and vitest's `packages/**` glob pick it up automatically; the import critical path is covered by fixture tests. |
| Tech Constraints (v1.1.0: **no ORM**) | ✅ Direct `pg` via `@ds/db`; raw parameterized `INSERT … ON CONFLICT` upsert; no ORM, no new runtime dep. |

**Result**: PASS. No violations; Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/003-import-pipeline/
├── plan.md              # This file (/speckit.plan output)
├── spec.md              # Feature specification (/speckit.specify output)
├── research.md          # Phase 0 — decisions & rationale
├── data-model.md        # Phase 1 — rows touched, upsert semantics, run lifecycle
├── quickstart.md        # Phase 1 — runnable import + verification guide
├── contracts/
│   └── import.contract.md   # CLI + importProducts(deps) + store/fetch interfaces
├── checklists/
│   └── requirements.md  # Spec quality checklist (/speckit.specify output)
└── tasks.md             # Phase 2 (/speckit.tasks output)
```

### Source Code (repository root)

```text
packages/
└── import/                         # @ds/import — testable import orchestration (NEW)
    ├── src/
    │   ├── import.ts               # importProducts(deps): fetch→validate→dedup→batch-upsert→log
    │   ├── stores.ts               # httpFetchFeed + db-backed ProductStore / ImportRunStore
    │   ├── run.ts                  # runImport(): wire env + real deps, print summary
    │   ├── index.ts                # public exports
    │   ├── fixtures.ts             # in-repo sample feeds (valid / mixed / changed)
    │   └── import.test.ts          # Vitest fixture-based behavior tests (fakes, no DB)
    ├── package.json                # @ds/import; deps @ds/shared, @ds/db; typecheck + test scripts
    └── tsconfig.json

scripts/
└── import-products.ts              # thin CLI launcher → runImport(); sets exit code (NEW)

# Root
package.json                        # + "import:products": tsx scripts/import-products.ts
.env / .env.example                 # PRODUCTS_SOURCE_URL present; ensure IMPORT_BATCH_SIZE documented
```

**Structure Decision**: The import's *logic* lives in a reserved-style package (`packages/import`) so it is typechecked by `pnpm -r typecheck` and discovered by vitest's `packages/**` glob — keeping the critical path tested without Docker. The *operational entrypoint* is a committed `scripts/import-products.ts` (constitution III). `apps/web`, `packages/search`, and the Spec 002 packages are untouched except for reuse.

## Complexity Tracking

No constitution violations; no entries required. Introducing `@ds/import` (rather than putting logic directly in `scripts/`) is the *simpler* path overall: it is the only way to keep the import path under the existing `packages/**` test+typecheck gates, and dependency injection is what makes the pipeline testable without a live database.

## Phase Outputs

- **Phase 0 — Research**: [research.md](./research.md) — upsert-with-hash-guard idempotency; dependency-injection seam for DB-free tests; batched multi-row upsert; run-record lifecycle; fail-loud + exit codes; `fetch` over a dependency.
- **Phase 1 — Design & Contracts**:
  - [data-model.md](./data-model.md) — rows touched in `products`/`import_runs`, upsert SQL semantics, count definitions, run lifecycle states.
  - [contracts/import.contract.md](./contracts/import.contract.md) — CLI contract, `importProducts(deps)` signature, `ProductStore`/`ImportRunStore`/`FeedFetcher` interfaces, `ImportSummary`.
  - [quickstart.md](./quickstart.md) — migrate → import → verify (counts, idempotent re-run, run record) mapping to SC-001…SC-008.

## Post-Design Constitution Re-Check

Re-evaluated after Phase 1: still **PASS**. The design keeps Postgres as the sole source of truth, reuses the Zod boundary for every untrusted record, upserts idempotently by stable key with a hash guard, bounds work in batches, fails loudly with a recorded failure + non-zero exit, sources all config from env, and adds no ORM, no search, and no UI. No new complexity to justify.
