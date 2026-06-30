---
description: "Task list for Repo Foundation (Spec 001)"
---

# Tasks: Repo Foundation

**Input**: Design documents from `/specs/001-repo-foundation/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: Minimal only. The spec does not request TDD; US3 requires a green test baseline, so we wire Vitest and ship a smoke test plus one health-route test. No exhaustive suites.

**Organization**: Tasks grouped by user story (US1, US2, US3) so each is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 (setup, foundational, polish have no story label)
- Paths are repo-root relative.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Workspace skeleton so pnpm can resolve and link everything.

- [X] T001 Create root workspace files: `package.json` (private, `"packageManager": "pnpm@9"`, `engines.node` ">=20 <21", placeholder scripts), `pnpm-workspace.yaml` (globs `apps/*`, `packages/*`), `.npmrc`, `.nvmrc` (20), `.gitignore` (ignore `node_modules`, `.next`, `.env*` except `!.env.example`)
- [X] T002 [P] Create shared config package in `packages/config/`: `package.json` (name `@ds/config`, private), `tsconfig.base.json` (strict, `moduleResolution: bundler`, `target`/`lib` ES2022)
- [X] T003 Create root `tsconfig.json` extending `@ds/config` base with project references to all packages + app (enables repo-wide typecheck)

**Checkpoint**: `pnpm-workspace.yaml` + root manifests exist; structure is recognizable to pnpm.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The placeholder packages and dependency graph every user story relies on (the app imports `@ds/shared`; lint/typecheck must see all packages). **⚠️ Must complete before US1–US3.**

- [X] T004 [P] Create `packages/shared/` (`@ds/shared`): `package.json`, `tsconfig.json` (extends base), `src/index.ts` (export a real constant/type, e.g. app constants) so the package builds and is importable
- [X] T005 [P] Create `packages/db/` (`@ds/db`) placeholder: `package.json`, `tsconfig.json`, `src/index.ts` (empty-but-valid export; Prisma schema deferred to Spec 002)
- [X] T006 [P] Create `packages/search/` (`@ds/search`) placeholder: `package.json`, `tsconfig.json`, `src/index.ts` (empty-but-valid export; Typesense client deferred to Spec 004)
- [X] T007 [P] Create `scripts/` directory with a `.gitkeep` (reserved for import/reindex/smoke scripts in later specs)
- [X] T008 Run `pnpm install` to link the workspace; confirm all packages resolve with no errors

**Checkpoint**: Workspace installs cleanly; `@ds/*` packages are linked and importable.

---

## Phase 3: User Story 1 - Clone and run the project locally (Priority: P1) 🎯 MVP

**Goal**: A fresh clone can install, start the app, and get a successful `/api/health` response.

**Independent Test**: `pnpm install` → `pnpm dev` → `curl localhost:3000/api/health` returns `{"ok":true,...}` and `localhost:3000` shows the placeholder page.

### Implementation for User Story 1

- [X] T009 [US1] Scaffold Next.js app in `apps/web/`: `package.json` (name `web`, deps `next`@15/`react`@19/`react-dom`@19, dep `@ds/shared` via `workspace:*`, scripts `dev`/`build`/`start`/`lint`/`typecheck`), `next.config.mjs`, `tsconfig.json` (extends base, Next plugin)
- [X] T010 [US1] Create `apps/web/src/app/layout.tsx` and `apps/web/src/app/page.tsx` — minimal placeholder page that reads `NEXT_PUBLIC_APP_NAME`; explicitly NO product search/grid/listing UI (FR-009)
- [X] T011 [US1] Implement `apps/web/src/app/api/health/route.ts` — `GET` returns static `{ ok: true, services: { database: "ok", search: "ok" } }` (200, `application/json`) per `contracts/health.contract.md`
- [X] T012 [US1] Wire root `package.json` scripts to delegate (`dev`/`build`/`start` → `pnpm --filter web ...`); verify `pnpm dev` serves the page and health endpoint

**Checkpoint**: US1 fully functional — app runs, placeholder renders, health responds. MVP reached.

---

## Phase 4: User Story 2 - Start local backing services (Priority: P1)

**Goal**: One command brings up local Postgres + Typesense; `.env.example` documents all config.

**Independent Test**: `cp .env.example .env` → `docker compose up -d` → Postgres reachable on 5432 and `curl localhost:8108/health` returns Typesense OK.

### Implementation for User Story 2

- [X] T013 [P] [US2] Create `.env.example` with every key in `data-model.md` (NODE_ENV, NEXT_PUBLIC_APP_NAME, DATABASE_URL, PRODUCTS_SOURCE_URL, TYPESENSE_* (host/port/protocol/api_key/search_only_key/collection), IMPORT_BATCH_SIZE, REINDEX_BATCH_SIZE) using safe placeholders only — no real secrets (FR-006, SC-004, SC-006)
- [X] T014 [P] [US2] Create `docker-compose.yml` with `postgres:16` (port 5432, named volume, healthcheck, POSTGRES_* from env) and `typesense/typesense:27.1` (port 8108, named volume, `--api-key=$TYPESENSE_API_KEY`, healthcheck on `/health`); admin key stays server-side only (Backend Rule §11.4)
- [X] T015 [US2] Verify alignment: ports/keys/db-name in `docker-compose.yml` match `.env.example`; run `docker compose up -d` and confirm both services healthy

**Checkpoint**: US2 functional — both services start from one command with example config.

---

## Phase 5: User Story 3 - Enforce baseline code quality (Priority: P2)

**Goal**: Repo-wide lint + typecheck + smoke tests pass on the skeleton and auto-cover future packages.

**Independent Test**: `pnpm lint`, `pnpm typecheck`, `pnpm test` all exit 0 across every workspace area.

### Implementation for User Story 3

- [X] T016 [P] [US3] Add ESLint 9 flat config: root `eslint.config.mjs` (shared rules, ignores) and `apps/web/eslint.config.mjs` (extends `eslint-config-next`); add a `lint` script to each package/app
- [X] T017 [P] [US3] Add `typecheck` script (`tsc --noEmit`) to each package and the app so `pnpm -r typecheck` covers all areas (FR-007; satisfies "new package auto-covered" edge case)
- [X] T018 [P] [US3] Wire Vitest: `vitest.config.ts` where needed, add `test` script to packages; add `packages/shared/src/index.test.ts` smoke test and `apps/web/.../health.route.test.ts` asserting the health JSON shape
- [X] T019 [US3] Add root scripts `lint`/`typecheck`/`test` (`pnpm -r ...`); run all three and confirm zero errors across the workspace (SC-003)

**Checkpoint**: US3 functional — clean quality baseline across all areas.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation and end-to-end validation.

- [X] T020 [P] Write `README.md`: prerequisites, `pnpm install`, `cp .env.example .env`, `docker compose up -d`, `pnpm dev`, quality commands, local URLs, and an explicit note that `/api/health` is **static** in this spec (real checks in Spec 005)
- [X] T021 Execute the full `quickstart.md` validation matrix end-to-end; confirm every row passes (SC-001…SC-006)
- [X] T022 Secrets/scope audit: confirm `.env` is git-ignored, only `.env.example` (placeholders) is present, and no product UI exists (SC-005, SC-006)

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (P1)** → no deps; start immediately.
- **Foundational (P2)** → depends on Setup; **blocks all user stories**.
- **US1 / US2 / US3 (P3–P5)** → all depend on Foundational. After that they are largely independent (US2 has no overlap with US1; US3 lints whatever exists, so it reads best **after** US1+US2 files exist, though it can start once Foundational is done).
- **Polish (P6)** → depends on the user stories you intend to ship.

### Within each story

- US1: app scaffold (T009) → page/health (T010, T011 [P]) → root scripts/verify (T012)
- US2: `.env.example` (T013) ∥ compose (T014) → verify (T015)
- US3: eslint (T016) ∥ typecheck scripts (T017) ∥ vitest (T018) → root scripts/verify (T019)

### Parallel opportunities

- T002 alongside T001 wrap-up; T004/T005/T006/T007 all [P] (separate dirs).
- Across stories once Foundational is done: a dev could take US2 while another takes US1.
- T013 ∥ T014; T016 ∥ T017 ∥ T018.

---

## Implementation Strategy

### MVP first

1. Phase 1 Setup → 2. Phase 2 Foundational → 3. Phase 3 US1 → **STOP & validate** (app + health). That alone is a demoable runnable skeleton.

### Incremental delivery

Foundation ready → US1 (run app) → US2 (local services) → US3 (quality gates) → Polish. Each adds value without breaking the prior.

---

## Notes

- This entire spec is the foundation; "MVP = US1" means a running app, but the spec's Definition of Done needs US1+US2+US3+Polish.
- [P] = different files, no incomplete-task dependency.
- Commit after each task or logical group.
- Do NOT add product UI, auth, cart, or any later-spec concern (Backend Rules §11).
- Keep all Typesense/DB credentials server-side; never `NEXT_PUBLIC_*`.
