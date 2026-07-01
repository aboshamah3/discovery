---
description: "Task list for Spec 006 — Railway Deployment Foundation"
---

# Tasks: Railway Deployment Foundation

**Input**: Design documents from `/specs/006-railway-deployment/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/deployment.contract.md, quickstart.md

**Tests**: One unit test is included (the pure static-copy-plan helper) because it carries real logic
and the constitution requires the gate stay meaningful (FR-010/SC-008). The rest of the spec is config +
docs verified via `quickstart.md`, not automated tests.

**Organization**: Tasks are grouped by user story. MVP = Phase 1 + Phase 2 (Foundational) + Phase 3 (US1).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US4 for user-story phases; Setup/Foundational/Polish carry no story label

## Path Conventions

Monorepo: app config in `apps/web/`, build helper in `scripts/`, deploy config + docs at repo root.

---

## Phase 1: Setup

**Purpose**: Confirm the baseline before touching deploy config.

- [ ] T001 Confirm the baseline gate is green (`pnpm lint && pnpm typecheck && pnpm test`) on branch `006-railway-deployment` so later failures are attributable to this spec.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Produce a self-contained, runnable production build and the shared deploy config. **Blocks all user stories** — nothing can be deployed, migrated-on-release, or health-gated without it.

**⚠️ CRITICAL**: Complete this phase before any user-story verification.

- [ ] T002 Enable standalone output in `apps/web/next.config.mjs`: add `output: "standalone"` and `outputFileTracingRoot` set to the monorepo root (via `path` + `import.meta.url`), keeping `reactStrictMode` and `transpilePackages: ["@ds/shared"]`.
- [ ] T003 [P] Create the pure copy-plan helper `scripts/standalone-copy-plan.mjs` exporting `computeStandaloneCopyPlan(repoRoot)` → `{ from, to }[]` mapping `apps/web/.next/static` → `apps/web/.next/standalone/apps/web/.next/static` and, only when it exists, `apps/web/public` → `.../standalone/apps/web/public`. Pure: takes an optional `exists` predicate for testability; no `fs` side effects.
- [ ] T004 [P] Unit-test the helper in `scripts/standalone-copy-plan.test.mjs` (or the app test path per vitest globs): asserts the static mapping is always present and the `public` mapping appears only when the predicate reports it exists. Runs with no filesystem access.
- [ ] T005 Create `scripts/prepare-standalone.mjs`: import `computeStandaloneCopyPlan`, resolve the repo root, and `fs.cp(from, to, { recursive: true })` for each entry; log each copy; exit non-zero with an actionable message if `.next/standalone` is missing (build not run).
- [ ] T006 Wire root `package.json` scripts: change `build` to `pnpm --filter web build && node scripts/prepare-standalone.mjs`, and add `start:standalone` = `node apps/web/.next/standalone/apps/web/server.js`. Leave `start` (`next start`) unchanged.
- [ ] T007 Create `railway.json` at repo root per [contracts/deployment.contract.md](./contracts/deployment.contract.md): `build.builder=NIXPACKS`, `build.buildCommand="pnpm build"`, `deploy.preDeployCommand="pnpm db:migrate"`, `deploy.startCommand="node apps/web/.next/standalone/apps/web/server.js"`, `deploy.healthcheckPath="/api/health"`, generous `healthcheckTimeout`, `restartPolicyType="ON_FAILURE"`.

**Checkpoint**: `pnpm build` produces `apps/web/.next/standalone/apps/web/server.js` with `.next/static` copied in; `railway.json` present and valid JSON; `pnpm test` still green.

---

## Phase 3: User Story 1 - Deploy the service from the repository (Priority: P1) 🎯 MVP

**Goal**: A reproducible build-and-run path Railway can execute from committed config.

**Independent Test**: Build locally, run the standalone server, confirm it serves `/api/health` — no Railway account needed.

- [ ] T008 [US1] Verify the standalone build + run locally (quickstart A1–A2): `pnpm build`; assert `apps/web/.next/standalone/apps/web/server.js` and `.next/standalone/apps/web/.next/static` exist; run `PORT=3999 node apps/web/.next/standalone/apps/web/server.js` and confirm `GET /api/health` responds (200 with the local stack up + migrated/imported/reindexed, 503 with a dep down) — proving `pg`/`typesense` resolve at runtime and the port binds.

**Checkpoint**: The committed `build`/`start`/`railway.json` reproduce a running server locally (SC-001, SC-002).

---

## Phase 4: User Story 2 - Apply schema migrations before serving traffic (Priority: P1)

**Goal**: Pending migrations apply as a gated pre-deploy step; re-runs are safe no-ops.

**Independent Test**: Run the pre-deploy migration command twice against a database and confirm apply-then-noop.

- [ ] T009 [US2] Verify the pre-deploy migration contract (quickstart A3): against a fresh local DB run `pnpm db:migrate` (applies all pending, exits 0), then run it again (`No pending migrations.`, exits 0). Confirm `railway.json` `deploy.preDeployCommand` is `pnpm db:migrate` and note in the contract that a failing migration rolls back and blocks promotion (SC-003).

**Checkpoint**: Migrations are gated before serving and idempotent (US2 independently verified).

---

## Phase 5: User Story 3 - Gate and observe production readiness (Priority: P2)

**Goal**: `/api/health` is the platform readiness gate; promotion only when deps are truly up.

**Independent Test**: Confirm health returns 200 only when both deps up and 503 when either is down, and that the healthcheck path is wired.

- [ ] T010 [US3] Verify the readiness gate (quickstart A2): with the local stack up, `GET /api/health` → 200; with a dependency stopped, → 503 with that dependency `down` and no secret in the body. Confirm `railway.json` `deploy.healthcheckPath="/api/health"` and that the README documents the "Typesense must be reachable for a green deploy" consequence (SC-004, FR-005).

**Checkpoint**: Readiness gating is truthful and wired (US3 independently verified).

---

## Phase 6: User Story 4 - Operate the catalog in production (Priority: P2)

**Goal**: Complete env-var checklist and the manual import/reindex runbook in the README.

**Independent Test**: The documented checklist matches exactly what the code reads; import/reindex commands are present with prerequisites and are absent from the deploy pipeline.

- [ ] T011 [US4] Add a **Deployment (Railway)** section to `README.md`: the env-var checklist from [data-model.md](./data-model.md) (each var: purpose, required/optional, safe example; admin key server-side only; the `.env.example`-only / local-only vars flagged), the Railway service setup (app + Postgres + Typesense), and the manual `pnpm import:products` / `pnpm reindex:products` runbook — explicitly not part of the automated deploy (FR-006, FR-007).
- [ ] T012 [US4] Verify checklist accuracy (quickstart A5): confirm every `process.env.*` the code reads (`grep -rhoE "process\.env\.[A-Z_][A-Z0-9_]*" apps packages scripts`) appears in the README checklist, and that no committed file contains a real secret (SC-005).

**Checkpoint**: An operator can provision and populate production from the docs alone (US4 independently verified).

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T013 Run the full quality gate (`pnpm lint && pnpm typecheck && pnpm test`) and the quickstart local verification end-to-end; confirm all green with no DB/Typesense required for the gate (SC-008).
- [ ] T014 [P] Confirm scope: no API contract changed, no product UI beyond the placeholder added, `.env.example` still only placeholders (SC-007, FR-008/FR-009); note in `DS_PROJECT_SPEC_PLAN.md` §15/§16 progress if that is the project convention.

---

## Dependencies & Execution Order

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: after Setup — **blocks all user stories**. Within it: T002, T003, T004 are `[P]` (distinct files); T005 depends on T003; T006 depends on T002/T005; T007 is independent config.
- **US1 (Phase 3)**: after Foundational. This is the MVP.
- **US2 (Phase 4)** and **US3 (Phase 5)**: after Foundational; independent of US1 and each other (both only need the running server + railway.json fields).
- **US4 (Phase 6)**: after Foundational (docs reference the data-model); independent of US1–US3.
- **Polish (Phase 7)**: after all targeted stories.

## Parallel Opportunities

- Foundational: `T003`, `T004` (helper + its test are separate files from `next.config`/`railway.json`) can proceed alongside `T002`/`T007`.
- After Foundational, the four verification/doc stories (US1–US4) can be done in parallel — they touch different files (local run vs. README) and are independently testable.

## Parallel Example: Foundational

```bash
# In parallel after T001:
Task: "T002 next.config.mjs standalone output"
Task: "T003 pure copy-plan helper"
Task: "T007 railway.json config-as-code"
# Then T004 (test) alongside, T005 after T003, T006 after T002+T005.
```

## Implementation Strategy

1. **MVP** = Phase 1 → Phase 2 (Foundational) → Phase 3 (US1). At the US1 checkpoint the app is
   reproducibly buildable and runnable from committed config — the core deliverable.
2. **Incremental**: add US2 (gated migrations), US3 (health gate), US4 (ops docs) — each an independent,
   verifiable increment that adds value without changing the others.
3. **Done** when Phase 7 passes: full gate green, quickstart reproduces a running server, docs complete,
   scope intact.

## Notes

- `[P]` = different files, no incomplete dependency. `[Story]` maps a task to its user story.
- Much of the substance lands in Foundational (config is shared); the story phases are the independent
  **verifications** + docs that make each slice demoable — honest for a deployment spec.
- Commit after each task or logical group; keep the workspace green (constitution VI).
- Live Railway deploy is out of automated scope (no account in the build env); local standalone
  build+run reproduces the production path (SC-001).
