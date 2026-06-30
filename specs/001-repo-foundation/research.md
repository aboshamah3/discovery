# Phase 0 Research: Repo Foundation

**Feature**: 001-repo-foundation | **Date**: 2026-06-30

The product plan (`DS_PROJECT_SPEC_PLAN.md` §2) already ratified the high-level stack. This file resolves the remaining "which version / which configuration" unknowns for the foundation only. Choices that belong to later specs (Prisma schema, Typesense collection, API DTOs) are intentionally left open.

---

### Decision: Node.js 20 LTS

- **Rationale**: Current Active LTS; supported by Next.js 15 and Railway's Nixpacks/Node builder. Pin via `engines` and `.nvmrc` for parity.
- **Alternatives considered**: Node 22 (newer, fine, but 20 LTS is the safer default for a foundation others build on); Node 18 (entering maintenance — avoid).

### Decision: pnpm 9 workspaces (monorepo)

- **Rationale**: Mandated by §2.1. pnpm 9 has stable workspace support and a content-addressed store. Use `pnpm-workspace.yaml` listing `apps/*` and `packages/*`. Internal deps referenced with `workspace:*`.
- **Alternatives considered**: npm/yarn workspaces (weaker disk efficiency, slower for monorepos); Turborepo/Nx task runners (valuable later for caching, but adds tooling overhead not needed for a 4-package skeleton — can be layered in without restructuring).

### Decision: Next.js 15 App Router + React 19, TypeScript 5

- **Rationale**: §2.1 mandates Next.js App Router + TypeScript. Route Handlers (`app/api/*/route.ts`) give us `/api/health` with no extra framework. `output: 'standalone'` will be needed in the Railway spec; harmless to leave default here.
- **Alternatives considered**: Pages Router (legacy direction); separate Express/Fastify API (adds a second runtime — unnecessary since Route Handlers cover the API need).

### Decision: TypeScript project setup via shared base in `packages/config`

- **Rationale**: A single `tsconfig.base.json` (strict mode on) extended by each package keeps settings consistent and makes adding a package zero-config (satisfies the "new package" edge case + FR-007). Root `tsconfig.json` uses project references for repo-wide `typecheck`.
- **Alternatives considered**: Per-package fully independent tsconfigs (drift risk); a single root tsconfig covering everything (breaks package isolation Next.js expects).

### Decision: ESLint 9 flat config, shared base; lint/typecheck via `pnpm -r`

- **Rationale**: Flat config (`eslint.config.mjs`) is the current standard for ESLint 9 and integrates with `eslint-config-next` for the app. Running `pnpm -r lint` / `pnpm -r typecheck` auto-includes any future package (FR-007, SC-003, and the "new package" edge case).
- **Alternatives considered**: Legacy `.eslintrc` (deprecated in ESLint 9); Biome (fast, but diverges from the Next.js-recommended ESLint path and the plan's stated tooling).

### Decision: Docker Compose for local Postgres 16 + Typesense 27

- **Rationale**: §3 mandates `docker-compose.yml` with Postgres + Typesense for one-command local startup (FR-005, SC-002). Pin images `postgres:16` and `typesense/typesense:27.1`. Expose Postgres `5432` and Typesense `8108`, matching `.env.example`. Use named volumes for persistence and a healthcheck on each service.
- **Alternatives considered**: Local native installs (poor parity, multi-step setup — fails SC-001); Postgres-only with Typesense added later (would force a structural change — rejected since both are core).

### Decision: Typesense bootstrap key handling

- **Rationale**: Typesense requires `TYPESENSE_API_KEY` (admin) at container start, passed only as a server-side env var and the compose service env. A separate optional `TYPESENSE_SEARCH_ONLY_API_KEY` is reserved for a future browser-safe path. No Typesense key is ever `NEXT_PUBLIC_*` (Backend Rule §11.4, SC-006).
- **Alternatives considered**: Exposing a search-only key to the client now (deferred — not needed until frontend; keeping it server-side keeps the foundation simple and safe).

### Decision: Vitest 2 wired but minimal

- **Rationale**: §2.1 mandates Vitest for unit/service tests. Wire a root `test` script (`pnpm -r test`) and a config so packages can add tests immediately. This spec ships only a trivial smoke test (e.g., shared package exports) so `pnpm test` is green from day one without over-building.
- **Alternatives considered**: Jest (heavier, slower TS story); deferring test wiring entirely (would violate "establish quality baseline" — US3).

### Decision: Placeholder packages export real-but-empty modules

- **Rationale**: `@ds/db`, `@ds/search`, `@ds/shared`, `@ds/config` each ship a minimal `src/index.ts` and `package.json` so they install, typecheck, and lint cleanly now, and later specs add substance without touching wiring (FR-010).
- **Alternatives considered**: Empty directories (pnpm won't link them; later specs would need to add boilerplate — rejected).

### Decision: `.env.example` is the single source of config truth; `.env` git-ignored

- **Rationale**: One example file lists every key the app/services need with safe placeholders (FR-006, SC-004). `.gitignore` excludes `.env*` except `.env.example` so no real secret is ever committed (FR-011, SC-006). App reads config via `process.env` (server-side).
- **Alternatives considered**: Committing a working `.env` (leaks secrets — rejected); a config service/secret manager (overkill for local foundation).

### Decision: Health endpoint returns static success now

- **Rationale**: FR-004 + spec edge case: real DB/search readiness checks belong to Spec 005. Returning `{ ok: true, services: { database: "ok", search: "ok" } }` statically keeps the shape stable for the frontend/monitoring while honoring scope. Documented as static in README + contract.
- **Alternatives considered**: Implementing live checks now (out of scope; would pull DB/search clients into this spec prematurely).

---

**All foundation unknowns resolved. No `NEEDS CLARIFICATION` markers remain.**
