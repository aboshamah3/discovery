# Implementation Plan: Repo Foundation

**Branch**: `001-repo-foundation` | **Date**: 2026-06-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-repo-foundation/spec.md`

## Summary

Stand up the single-repo foundation for DS Product Discovery: a pnpm workspace monorepo containing a Next.js (App Router, TypeScript) application in `apps/web` and placeholder packages `db`, `search`, and `shared`. Provide one-command local startup of PostgreSQL and Typesense via Docker Compose, an `.env.example` enumerating all config, repo-wide lint/typecheck scripts, a README, and a static `GET /api/health` endpoint. No product-facing frontend is built — only a minimal placeholder page. This delivers a runnable, quality-gated skeleton that every later spec (data model, import, search, API, deploy, frontend) builds on without restructuring.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20 LTS

**Primary Dependencies**: Next.js 15 (App Router) + React 19; pnpm 9 workspaces; Prisma 6 (placeholder client in `packages/db`); `typesense` Node client (placeholder factory in `packages/search`); Zod 4 (shared schemas in `packages/shared`)

**Storage**: PostgreSQL 16 (Docker, local). Source of truth for products in later specs; not yet used at runtime in this spec.

**Search**: Typesense 27.x (Docker, local). Search index in later specs; not yet used at runtime in this spec.

**Testing**: Vitest 2.x for unit/service tests (wired in `packages/*`; minimal smoke test only in this spec). Playwright deferred to the frontend spec.

**Target Platform**: Linux/macOS dev workstation with a container runtime (Docker) + pnpm. Production target (Railway) is out of scope here.

**Project Type**: Web application (monorepo) — Next.js app + supporting packages.

**Performance Goals**: Not a performance feature. Non-functional target inherited from spec: fresh clone → running + healthy in under 15 minutes (SC-001).

**Constraints**: No product frontend (FR-009). No real secrets committed (FR-011/SC-006). `/api/health` returns static success only; real dependency checks deferred to Spec 005. Adding a new workspace package must not require reconfiguring lint/typecheck (covered by `pnpm -r`).

**Scale/Scope**: Foundation skeleton: 1 app + 3 packages, ~1 endpoint, 2 local services. Catalog (~4,000 products) is relevant only to later specs.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is still the unpopulated template — no project constitution has been ratified, so there are no formal constitution gates to evaluate. In its place, this plan is checked against the **Backend Rules** (§11) and **Implementation Order** (§15) of `DS_PROJECT_SPEC_PLAN.md`, which act as the de-facto governing principles:

| Principle (from project plan) | Compliance in this plan |
|---|---|
| Do not build the frontend before Spec 007 | ✅ Only a placeholder page + `/api/health`; no product UI. |
| Keep PostgreSQL as source of truth | ✅ Postgres provisioned locally; `packages/db` reserved for the schema (Spec 002). |
| Keep Typesense as a rebuildable index | ✅ Typesense provisioned locally; `packages/search` reserved for client/indexing (Spec 004). |
| Do not expose Typesense admin keys to browser | ✅ All Typesense vars are server-side env only; none are `NEXT_PUBLIC_*`. |
| Add scripts before one-off code | ✅ Root scripts defined; service startup via compose. |
| Small, reviewable changes | ✅ Scope limited to skeleton; later concerns deferred to their specs. |
| No auth/cart/checkout/admin; no multi-tenant | ✅ None introduced. |

**Result**: PASS (no violations; Complexity Tracking not required). Recommend ratifying a real constitution via `/speckit.constitution` before later specs, but it is not blocking for the foundation.

## Project Structure

### Documentation (this feature)

```text
specs/001-repo-foundation/
├── plan.md              # This file (/speckit.plan output)
├── spec.md              # Feature specification (/speckit.specify output)
├── research.md          # Phase 0 output (decisions & rationale)
├── data-model.md        # Phase 1 output (env config + health entities)
├── quickstart.md        # Phase 1 output (runnable validation guide)
├── contracts/
│   └── health.contract.md   # Phase 1 output (/api/health contract)
├── checklists/
│   └── requirements.md  # Spec quality checklist (/speckit.specify output)
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created here)
```

### Source Code (repository root)

```text
.
├── apps/
│   └── web/                     # Next.js App Router app (TypeScript)
│       ├── src/
│       │   └── app/
│       │       ├── page.tsx     # Minimal placeholder page (no product UI)
│       │       ├── layout.tsx
│       │       └── api/
│       │           └── health/
│       │               └── route.ts   # GET /api/health -> static OK
│       ├── next.config.mjs
│       ├── tsconfig.json
│       ├── eslint.config.mjs
│       ├── vitest.config.ts
│       └── package.json         # name: web
├── packages/
│   ├── db/                      # Placeholder: Prisma client + schema home (Spec 002)
│   │   ├── src/index.ts
│   │   ├── tsconfig.json
│   │   └── package.json         # name: @ds/db
│   ├── search/                  # Placeholder: Typesense client factory home (Spec 004)
│   │   ├── src/index.ts
│   │   ├── tsconfig.json
│   │   └── package.json         # name: @ds/search
│   ├── shared/                  # Zod schemas, shared types, constants
│   │   ├── src/index.ts
│   │   ├── tsconfig.json
│   │   └── package.json         # name: @ds/shared
│   └── config/                  # Shared tsconfig/eslint base (optional but wired)
│       ├── tsconfig.base.json
│       └── package.json         # name: @ds/config
├── scripts/                     # (created empty/placeholder; populated in later specs)
├── docker-compose.yml           # Local Postgres + Typesense
├── .env.example                 # All config keys with safe placeholder defaults
├── .gitignore
├── .npmrc                       # pnpm settings
├── package.json                 # Root workspace + scripts
├── pnpm-workspace.yaml
├── tsconfig.json                # Root TS project references
└── README.md
```

**Structure Decision**: Web-application monorepo. The directories above mirror §3 of `DS_PROJECT_SPEC_PLAN.md` exactly, so each later spec drops into its reserved home (`packages/db` → Spec 002, `packages/db`+`scripts` → Spec 003, `packages/search`+`scripts` → Spec 004, `apps/web/src/app/api` → Spec 005, `apps/web/src/app` → Spec 007) without moving files. `packages/config` is added to centralize the TS/ESLint base so "add a new package" stays zero-config (Edge Case + FR-007).

## Complexity Tracking

No constitution violations; no entries required. (The monorepo's 4 packages are mandated by the project plan's architecture, not introduced speculatively here.)

## Phase Outputs

- **Phase 0 — Research**: [research.md](./research.md) — resolves version/tooling choices (Node, pnpm, Next, Prisma, Typesense image, Vitest, ESLint flat config) with rationale and alternatives.
- **Phase 1 — Design & Contracts**:
  - [data-model.md](./data-model.md) — environment-configuration keys and the health-status shape (Product model explicitly deferred to Spec 002).
  - [contracts/health.contract.md](./contracts/health.contract.md) — request/response contract for `GET /api/health`.
  - [quickstart.md](./quickstart.md) — runnable validation guide proving SC-001…SC-004.
  - Agent context updated (plan reference recorded; see Completion Report).

## Post-Design Constitution Re-Check

Re-evaluated after Phase 1: still PASS. The health contract returns only static service labels (no secret material), env design keeps all Typesense/DB credentials server-side, and no product UI or out-of-scope capability was introduced. No new complexity to justify.
