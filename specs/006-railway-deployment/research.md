# Phase 0 — Research: Railway Deployment Foundation

**Feature**: `006-railway-deployment` | **Date**: 2026-07-01 | **Spec**: [spec.md](./spec.md)

All decisions below were validated against the real codebase (Next.js 15.5.19, pnpm
workspace, `@ds/db`/`@ds/search` TypeScript source packages, SQL migration runner) — several
by an actual standalone production build + local run of the produced server. No
`[NEEDS CLARIFICATION]` markers remain.

## D1 — Production bundle: Next.js `standalone` output + monorepo trace root

- **Decision**: Set `output: "standalone"` and `outputFileTracingRoot` = the monorepo root in
  `apps/web/next.config.mjs`. The build then emits a self-contained server at
  `apps/web/.next/standalone/apps/web/server.js` that includes the internal workspace packages.
- **Rationale**: Verified empirically — a standalone build traced `packages/db`, `packages/search`,
  and `packages/shared` into `.next/standalone/packages/*`, and the runtime deps `pg` and
  `typesense` were **bundled into the route server chunks** (running the produced server, `/api/health`
  returned a clean `503` with dependencies down — no `MODULE_NOT_FOUND`). Setting
  `outputFileTracingRoot` is required in a pnpm monorepo so tracing resolves the hoisted
  `node_modules/.pnpm` store from the repo root rather than only `apps/web`. Satisfies FR-001.
- **Alternatives considered**:
  - *`next start` against the full `.next` + `node_modules`*: works but ships the entire monorepo
    install to the runtime — larger image, slower cold start, and it depends on dev tooling at run
    time. Standalone is the Railway-recommended path.
  - *Dockerfile with multi-stage prune*: more control but adds a bespoke build surface to maintain;
    the Nixpacks + standalone path already produces a self-contained server (clarified: no Dockerfile).

## D2 — Static assets are NOT auto-copied → a committed prepare step

- **Decision**: Add a committed Node script (`scripts/prepare-standalone.mjs`) run after `next build`
  that copies `apps/web/.next/static` (and `apps/web/public` if present) into the standalone tree at
  `apps/web/.next/standalone/apps/web/.next/static` (and `.../public`). Wire it into the root `build`
  script so `pnpm build` produces a runnable bundle in one step.
- **Rationale**: Confirmed by inspection — `next build` with standalone does **not** copy `.next/static`
  or `public` into the standalone folder (a documented Next.js behavior). Without the copy, the running
  server 404s on `/_next/static/*`. A committed script (constitution III — script-first, no ad-hoc
  one-off steps) keeps the build reproducible from `pnpm build` alone. No `public/` exists today; the
  script guards for it so it stays correct when one is added.
- **Alternatives considered**: putting the `cp` inline in Railway's build command (not reproducible
  locally, and shell-`cp` is not cross-platform for contributors on other OSes).

## D3 — Start command & port binding

- **Decision**: Start with `node apps/web/.next/standalone/apps/web/server.js` (referenced directly in
  `railway.json`; also exposed as a root `start:standalone` script for local parity). No app code is
  needed to bind the port.
- **Rationale**: The generated standalone `server.js` already reads `process.env.PORT` (falls back to
  3000) and `process.env.HOSTNAME || '0.0.0.0'` (verified in the emitted file), so it binds Railway's
  injected `PORT` on all interfaces out of the box. Satisfies FR-002 and the port-binding edge case.
  The existing `start` script (`next start`) is left unchanged for local non-standalone use.

## D4 — Migrations as a Railway pre-deploy (release) step

- **Decision**: Run `pnpm db:migrate` as `railway.json` → `deploy.preDeployCommand`, so pending SQL
  migrations apply before the new version serves traffic.
- **Rationale**: The Spec 002 runner (`packages/db/src/migrate.ts`) is already idempotent (tracks
  applied files in `schema_migrations`, applies only pending ones, each in a transaction, rolls back +
  throws on failure). `preDeployCommand` runs in the built image (which retains the build's
  `node_modules`, so `tsx` — a root devDependency — is present). `migrate.ts` loads the repo-root `.env`
  via dotenv but dotenv is a no-op when the file is absent and never overrides real `process.env`, so
  Railway's injected `DATABASE_URL` is used in production. Satisfies FR-004, SC-003, and the
  re-run-safe / fail-loud edge cases.
- **Operational note**: Railway must install dev dependencies at build (Nixpacks default) so `tsx` is
  available for the pre-deploy step; documented in the deploy guide.
- **Alternatives considered**: running migrations from the app on boot (rejected — couples schema
  changes to every instance start, races across replicas, and hides failures); a separate manual step
  (rejected — easy to forget; a gated release step is safer).

## D5 — `/api/health` as the platform health check (with the Typesense caveat)

- **Decision**: Set `railway.json` → `deploy.healthcheckPath` = `/api/health`. Keep the Spec 005
  behavior unchanged: `200` only when both PostgreSQL and Typesense are reachable, `503` otherwise.
- **Rationale**: This makes promotion truthful — a version that cannot reach its data or search engine
  is not marked ready (FR-005, SC-004). Because health is `503` when Typesense is down, **a green deploy
  requires the Typesense service to be provisioned and reachable** — an intentional, documented
  consequence (spec edge case "search dependency not yet provisioned"), not a bug. Use a generous
  `healthcheckTimeout` so the first deploy has time to come up. The health body already contains no
  secrets (Spec 005 FR-011).
- **Alternatives considered**: a shallow "process is up" health path that ignores dependencies
  (rejected — it would report a false green while search/DB are down, defeating the readiness gate).

## D6 — Import & reindex stay manual (not in the deploy pipeline)

- **Decision**: Document `pnpm import:products` and `pnpm reindex:products` as one-off operator
  commands run against production (Railway one-off command / service shell); do **not** add them to
  `railway.json`.
- **Rationale**: The source feed is a one-time/occasional load; coupling a multi-minute, ~4k-row import
  + full reindex to every code deploy is fragile and slow, and there is no scheduled-refresh requirement
  (constitution III/V — script-first, YAGNI; `DS_PROJECT_SPEC_PLAN.md` §14 defers scheduled refresh).
  Both scripts are already idempotent, so operators can re-run safely. Satisfies FR-007, SC-006.

## D7 — Environment-variable checklist = exactly what the code reads

- **Decision**: The deploy docs enumerate precisely the variables the code reads (`grep`-verified):
  `DATABASE_URL`, `PRODUCTS_SOURCE_URL`, `TYPESENSE_HOST`, `TYPESENSE_PORT`, `TYPESENSE_PROTOCOL`,
  `TYPESENSE_API_KEY`, `TYPESENSE_PRODUCTS_COLLECTION`, `IMPORT_BATCH_SIZE`, `REINDEX_BATCH_SIZE`,
  `NEXT_PUBLIC_APP_NAME`; plus platform/runtime `PORT` (Railway-provided) and optional `HOSTNAME`.
- **Rationale**: Keeps the checklist honest against SC-005 ("matches the set the code actually reads").
  Two entries in `.env.example` are **not** read by any code and are flagged as such:
  `TYPESENSE_SEARCH_ONLY_API_KEY` (reserved for a future browser search-only key strategy) and
  `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` (local `docker-compose` only — on Railway the
  managed Postgres supplies `DATABASE_URL` directly). The admin `TYPESENSE_API_KEY` is server-side only
  and MUST NOT be exposed as a `NEXT_PUBLIC_*` var (constitution V, FR-008).
- **Alternatives considered**: copying `.env.example` verbatim (rejected — it lists non-read and
  local-only keys without distinction, which would fail the "matches what the code reads" criterion).

## D8 — Local verification strategy (no Railway account needed)

- **Decision**: Prove the deploy config locally: `pnpm build` → run the standalone server → `curl
  /api/health`; and run the migration runner twice against a throwaway DB to prove idempotency. Capture
  this in `quickstart.md`.
- **Rationale**: The build sandbox has no Railway credentials, so end-to-end cloud deploy is out of
  scope for automated verification (spec Assumptions). The standalone build + local run reproduces the
  production runtime path faithfully (SC-001), and the migration double-run proves SC-003, so the
  configuration is validated without a live account.
