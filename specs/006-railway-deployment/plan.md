# Implementation Plan: Railway Deployment Foundation

**Branch**: `006-railway-deployment` | **Date**: 2026-07-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-railway-deployment/spec.md`

## Summary

Make the Spec 001–005 backend deployable on Railway from committed configuration, verified locally
without a Railway account. Four moves, all grounded in a real standalone build + run of the app:

- **Self-contained build (US1/FR-001)** — turn on Next.js `output: "standalone"` with
  `outputFileTracingRoot` = monorepo root, and add a committed `scripts/prepare-standalone.mjs` that
  copies `.next/static` (Next does not do this automatically) into the standalone tree. `pnpm build`
  then yields a runnable `apps/web/.next/standalone/apps/web/server.js` with the workspace packages and
  `pg`/`typesense` bundled in (empirically confirmed).
- **Start command (US1/FR-002)** — run `node apps/web/.next/standalone/apps/web/server.js`; the emitted
  server already binds `PORT`/`0.0.0.0`, so no app code is needed.
- **Config-as-code + gated migrations + health gate (US1–US3/FR-003/004/005)** — commit `railway.json`
  with `build.buildCommand=pnpm build`, `deploy.preDeployCommand=pnpm db:migrate` (idempotent Spec 002
  runner, runs before serving), `deploy.startCommand`, and `deploy.healthcheckPath=/api/health` (200
  only when Postgres **and** Typesense are up).
- **Docs (US4/FR-006/007)** — a README deployment section: the exact env-var checklist (matching what
  the code reads, `grep`-verified) and the manual `import`/`reindex` runbook, kept out of the pipeline.

No API contract changes, no product frontend (Spec 007 stays untouched). The only source changes are
`apps/web/next.config.mjs`, a new `scripts/prepare-standalone.mjs`, root `package.json` scripts, a new
`railway.json`, and README docs — plus a small unit-tested helper for the static-copy path so the gate
stays meaningful (constitution VI).

## Technical Context

**Language/Version**: TypeScript 5.x (strict) / Node.js 20 LTS; Next.js 15 App Router; ESM build script (`.mjs`).

**Primary Dependencies**: `next` (standalone output + generated server); existing `@ds/db` migration
runner (`pnpm db:migrate` → `tsx`); existing `@ds/import` / `@ds/search` scripts (`import:products`,
`reindex:products`). New config only — **no new runtime dependency added**.

**Storage**: Unchanged — PostgreSQL 16 (source of truth) + Typesense 27 (index). This spec neither reads
nor writes data at build time; it wires how they are reached in production.

**Testing**: Vitest 2.x. New pure helper for the prepare-standalone copy plan is unit-tested (which
sources map to which destinations, guarding the `public/`-absent case) with no filesystem side effects
in the test. Deploy config is verified via `quickstart.md` (local standalone build + run + double
migrate). No DB/Typesense needed for the gate.

**Target Platform**: Railway (Nixpacks builder) running the Next.js standalone server; the same build
runs locally for verification.

**Project Type**: Web-application monorepo — changes land in `apps/web` (config), `scripts/` (build
helper), repo root (`railway.json`, `package.json`, `README.md`). Packages `@ds/db`/`@ds/search`/
`@ds/import` are consumed unchanged.

**Performance Goals**: N/A (deployment config). Standalone reduces runtime footprint; health probes stay
cheap (`SELECT 1`, `health.retrieve`).

**Constraints**: No secret committed; admin Typesense key server-side only (V/FR-008). No API/contract
change; no product UI (I/FR-009). Migrations idempotent + gated (III/FR-004). Gate green (VI/FR-010).

**Scale/Scope**: ~1 config edit (`next.config.mjs`), 1 new build script (+ its unit-tested helper), ~3
root `package.json` script edits, 1 new `railway.json`, README deploy section + env checklist. No new
env vars introduced (all already exist from Spec 001).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluated against `.specify/memory/constitution.md` **v1.1.0**:

| Principle | Compliance in this plan |
|---|---|
| I. Spec-driven, frontend-last | ✅ Deployment/backend only; the placeholder page and all endpoints are untouched. No search UI / grid / filters. Independently testable increment. |
| II. PostgreSQL is source of truth; search is rebuildable | ✅ Migrations target Postgres (source of truth); reindex rebuilds the derived index from Postgres. No search-only authoritative data. |
| III. Idempotent, script-first pipelines | ✅ Reuses the idempotent migrate/import/reindex scripts; the new prepare-standalone step is a committed script, not ad-hoc; nothing runs partially/silently. |
| IV. Contract-first, validated boundaries | ✅ No API contract changes; deployment contract documented in `contracts/`. Existing Zod boundaries unchanged; env accessors already fail loudly on missing config. |
| V. Secrets & scope discipline | ✅ All config via env; only `.env.example` placeholders tracked; admin key stays server-side (never `NEXT_PUBLIC_*`). No auth/cart/admin/scheduled-refresh scope added (YAGNI). |
| VI. Non-negotiable quality gates | ✅ New helper unit-tested; `pnpm lint`/`typecheck`/`test` stay green with no DB/Typesense; config verified via quickstart. |
| Tech Constraints (v1.1.0) | ✅ Next.js App Router, pnpm monorepo, `@ds/db` direct client (no ORM), Typesense via `@ds/search`, Vitest, Railway deploy target — all as ratified. |

**Result**: PASS. No violations; Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/006-railway-deployment/
├── plan.md              # This file (/speckit.plan output)
├── spec.md              # Feature specification (/speckit.specify output)
├── research.md          # Phase 0 — 8 decisions (standalone, static copy, migrate gate, health gate, env, ...)
├── data-model.md        # Phase 1 — env-var matrix, railway.json fields, build-output shape, ops commands
├── quickstart.md        # Phase 1 — local verification (A) + Railway runbook (B), mapped to SCs
├── contracts/
│   └── deployment.contract.md  # railway.json + build/start/migrate/import/reindex + health readiness
├── checklists/
│   └── requirements.md  # Spec quality checklist (/speckit.specify output)
└── tasks.md             # Phase 2 (/speckit.tasks output)
```

### Source Code (repository root)

```text
apps/web/
└── next.config.mjs                 # + output:"standalone", outputFileTracingRoot=monorepo root (EDIT)

scripts/
├── prepare-standalone.mjs          # copy .next/static (+ public/) into the standalone tree (NEW)
└── prepare-standalone.plan.ts      # pure copy-plan helper (source→dest list) — unit tested (NEW)
                                    #   (or colocated in packages/; see Structure Decision)

apps/web/src/lib/deploy/            # (if a home inside the app is preferred for the helper)
└── standalone-copy-plan.ts + .test.ts

railway.json                        # config-as-code: build/preDeploy/start/healthcheck (NEW)
package.json                        # + start:standalone; build runs prepare-standalone (EDIT)
README.md                           # + Deployment (Railway) section: env checklist + import/reindex runbook (EDIT)
```

**Structure Decision**: Keep the deployment surface tiny and reproducible. The standalone build is
enabled purely by config (`next.config.mjs`) so there is no bespoke bundler code. The one piece of real
logic — deciding which files the static-copy step must move — is extracted into a **pure, unit-tested
helper** (`computeStandaloneCopyPlan(root)` returning `{from,to}[]`, guarding the absent-`public/`
case), while the thin `scripts/prepare-standalone.mjs` wrapper just performs the `fs.cp` calls. This
mirrors the Specs 003–005 pattern (pure logic separated from I/O so the gate runs without side effects).
`railway.json` is the single source of deploy truth; README carries the human runbook. The helper's exact
home (a `scripts/`-adjacent module vs. `apps/web/src/lib/deploy/`) is finalized in tasks to fit the
existing vitest include globs.

## Complexity Tracking

No constitution violations; no entries required. The only added indirection — a pure copy-plan helper
behind the `prepare-standalone` script — is the simpler path, not extra complexity: it is what lets the
static-copy behavior be tested under the existing `pnpm test` gate without shelling out or touching the
real build output, exactly as earlier specs isolated pure logic from I/O.

## Phase Outputs

- **Phase 0 — Research**: [research.md](./research.md) — standalone + `outputFileTracingRoot`;
  static-copy step (not automatic); start command + port binding; migrations as pre-deploy (tsx
  availability, dotenv-optional); `/api/health` as the health gate + Typesense caveat; manual
  import/reindex; env checklist = exactly what the code reads; local verification strategy.
- **Phase 1 — Design & Contracts**:
  - [data-model.md](./data-model.md) — env-var matrix (required/optional/defaults, verified), `railway.json`
    field table, standalone output shape, operational-command table.
  - [contracts/deployment.contract.md](./contracts/deployment.contract.md) — `railway.json` + build/start/
    migrate/import/reindex command contracts + the (unchanged) health readiness contract.
  - [quickstart.md](./quickstart.md) — local verification (build → run → curl → double-migrate → gate)
    and the Railway runbook, each mapped to success criteria.

## Post-Design Constitution Re-Check

Re-evaluated after Phase 1: still **PASS**. The design changes only configuration and documentation plus
one pure, tested helper; it keeps Postgres the source of truth, reuses idempotent scripts, adds no
secret and no browser-exposed admin key, changes no API contract, and adds no product UI. No new
complexity to justify.
