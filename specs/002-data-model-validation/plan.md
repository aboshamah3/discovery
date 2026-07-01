# Implementation Plan: Data Model + Validation

**Branch**: `002-data-model-validation` | **Date**: 2026-06-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-data-model-validation/spec.md`

## Summary

Define the canonical data store and the validation/normalization boundary for DS Product Discovery. Create two PostgreSQL tables — `products` (source of truth) and `import_runs` (import observability) — via **plain SQL migrations applied by a tiny in-repo runner** (no ORM; `pg` driver), exposed as an idempotent `pnpm db:migrate`. In `@ds/shared`, add a Zod `rawProductSchema` that validates/coerces one untrusted source record (rejecting structural/bound violations with field-level errors), a `NormalizedProduct` type, a total `normalizeProduct` function (stable string id, UTC date parsing, blank→null, deterministic `sourceHash`), and a `parseProduct` convenience. Cover validation + normalization with Vitest unit tests. No network fetch, no Typesense, no product UI.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20 LTS

**Primary Dependencies**: `pg` (node-postgres) for DB access; `zod` for validation (in `@ds/shared`); `tsx` to run the TS migrate script; `dotenv` to load `DATABASE_URL` from root `.env`. **No ORM** (Prisma removed — constitution v1.1.0).

**Storage**: PostgreSQL 16 (local via Docker, Spec 001). Two tables + an internal `schema_migrations` bookkeeping table.

**Testing**: Vitest 2.x — unit tests for validation/normalization (pure, no DB). Migration verified manually via the quickstart against local Postgres.

**Target Platform**: Linux/macOS dev workstation with Docker + pnpm. Railway deploy is Spec 006.

**Project Type**: Web-application monorepo — work lands in `packages/db` and `packages/shared` only.

**Performance Goals**: Not a performance feature. Normalization is O(1) per record; the ~4,000-record bulk path is Spec 003.

**Constraints**: No ORM (constitution v1.1.0). Postgres is source of truth (II). Zod at the boundary (IV). `db:migrate` MUST be idempotent (FR-003/SC-003). Deterministic, stable ids (FR-002/SC-004). No search indexing, no product frontend (FR-011).

**Scale/Scope**: 2 domain tables + 1 bookkeeping table; ~5 new public exports in `@ds/shared`; 1 migrate runner; 1 minimal DB client. Catalog volume handled in Spec 003.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluated against `.specify/memory/constitution.md` **v1.1.0**:

| Principle | Compliance in this plan |
|---|---|
| I. Spec-driven, frontend-last | ✅ Backend/data only; no product UI. Independently testable increment (schema + validation). |
| II. PostgreSQL is source of truth; search is rebuildable | ✅ `products` is the canonical store; no search code introduced. |
| III. Idempotent, script-first pipelines | ✅ Schema created via a committed `db:migrate` script; runner is idempotent and fails loudly on a bad migration. (Bulk import idempotency itself is Spec 003.) |
| IV. Contract-first, validated boundaries | ✅ Zod `rawProductSchema` validates the untrusted feed with field-level errors; module contracts documented in `contracts/`; strict TypeScript end-to-end. |
| V. Secrets & scope discipline | ✅ `DATABASE_URL` from env only; no secrets committed; no auth/cart/admin/multi-tenant added. |
| VI. Non-negotiable quality gates | ✅ Vitest covers validation/normalization; `pnpm -r` lint/typecheck/test stay green; new package code is covered automatically. |
| Tech Constraints (v1.1.0: **no ORM**) | ✅ Direct `pg` + raw SQL; Prisma not used. This plan is the realization of the amendment. |

**Result**: PASS. The constitution was amended to v1.1.0 *before* this plan (Prisma → direct driver) precisely so there is no violation; Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/002-data-model-validation/
├── plan.md              # This file (/speckit.plan output)
├── spec.md              # Feature specification (/speckit.specify output)
├── research.md          # Phase 0 — decisions & rationale (no-ORM data layer)
├── data-model.md        # Phase 1 — tables, raw/normalized types, field mapping
├── quickstart.md        # Phase 1 — runnable validation guide
├── contracts/
│   ├── db-schema.contract.md   # Schema + db:migrate command contract
│   └── validation.contract.md  # @ds/shared validation/normalization API
├── checklists/
│   └── requirements.md  # Spec quality checklist (/speckit.specify output)
└── tasks.md             # Phase 2 (/speckit.tasks — NOT created here)
```

### Source Code (repository root)

```text
packages/
├── db/                          # @ds/db — direct PostgreSQL access (no ORM)
│   ├── migrations/
│   │   └── 0001_init.sql        # products + import_runs + trigger (+ schema_migrations via runner)
│   ├── src/
│   │   ├── index.ts             # getPool() / query() / closePool()
│   │   └── migrate.ts           # idempotent migration runner (tsx entrypoint)
│   ├── package.json             # + pg, dotenv; devDeps @types/pg, @types/node
│   └── tsconfig.json
└── shared/                      # @ds/shared — validation + types
    ├── src/
    │   ├── index.ts             # re-export product API (keeps existing exports)
    │   ├── product.ts           # rawProductSchema, RawProduct, NormalizedProduct,
    │   │                        #   normalizeProduct, parseProduct, sourceHash
    │   └── product.test.ts      # Vitest unit tests (validation + normalization)
    └── package.json             # + zod

# Root
package.json                     # + scripts: db:migrate (tsx packages/db/src/migrate.ts); devDep tsx
.env / .env.example              # DATABASE_URL already present (Spec 001)
```

**Structure Decision**: Work is confined to the two reserved package homes from Spec 001 (`packages/db`, `packages/shared`) plus root scripts — no restructuring. `apps/web`, `packages/search`, and `scripts/` are untouched (their populating specs are 005, 004, 003 respectively).

## Complexity Tracking

No constitution violations after the v1.1.0 amendment; no entries required. (Dropping the ORM *reduces* complexity relative to the original plan.)

## Phase Outputs

- **Phase 0 — Research**: [research.md](./research.md) — `pg` over ORM; SQL-file migrations + runner; Zod two-layer boundary (reject vs normalize); pure-TS `sourceHash`; schema shape.
- **Phase 1 — Design & Contracts**:
  - [data-model.md](./data-model.md) — `products`, `import_runs`, `schema_migrations`; `RawProduct`/`NormalizedProduct`; field mapping; validation & normalization rules.
  - [contracts/db-schema.contract.md](./contracts/db-schema.contract.md) — schema + `db:migrate` contract.
  - [contracts/validation.contract.md](./contracts/validation.contract.md) — `@ds/shared` validation/normalization API.
  - [quickstart.md](./quickstart.md) — runnable validation guide mapping to SC-001…SC-007.
  - Agent context updated (plan reference recorded).

## Post-Design Constitution Re-Check

Re-evaluated after Phase 1: still **PASS**. The design keeps Postgres as the source of truth, validates the untrusted feed with Zod (field-level errors), uses no ORM, exposes only env-sourced config, and adds no UI or out-of-scope capability. No new complexity to justify.
