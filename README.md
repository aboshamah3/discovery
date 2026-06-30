# DS Product Discovery

Fast, one-page product discovery powered by a real search engine (Typesense),
backed by PostgreSQL. This repository is built spec-by-spec; see
[`DS_PROJECT_SPEC_PLAN.md`](./DS_PROJECT_SPEC_PLAN.md) and [`specs/`](./specs).

> **Status:** Spec 001 — Repo Foundation. A runnable skeleton only. No product UI yet
> (that arrives in Spec 007). `GET /api/health` returns a **static** success;
> real database/search checks arrive in Spec 005.

## Stack

- **App:** Next.js 15 (App Router) + TypeScript, React 19
- **Monorepo:** pnpm 9 workspaces (`apps/*`, `packages/*`)
- **Database:** PostgreSQL 16 (source of truth) — schema in Spec 002
- **Search:** Typesense 27 (rebuildable index) — client in Spec 004
- **Tests:** Vitest · **Lint:** ESLint 9 (flat config)

## Layout

```
apps/web              # Next.js app (placeholder page + /api/health)
packages/shared       # Shared constants & types (@ds/shared)
packages/db           # Prisma/DB home (@ds/db) — placeholder until Spec 002
packages/search       # Typesense client home (@ds/search) — placeholder until Spec 004
packages/config       # Shared TS base config (@ds/config)
scripts/              # Import/reindex/smoke scripts — added in later specs
docker-compose.yml    # Local Postgres + Typesense
```

## Prerequisites

- Node.js 20+ (`.nvmrc` pins 20) — `corepack enable` to get pnpm
- pnpm 9
- Docker + Docker Compose

## Quick start

```bash
pnpm install            # install all workspace deps
cp .env.example .env    # local config (safe placeholder defaults)
docker compose up -d    # start Postgres (5432) + Typesense (8108)
pnpm dev                # start the app on http://localhost:3000
```

Verify:

```bash
curl http://localhost:3000/api/health      # {"ok":true,"services":{"database":"ok","search":"ok"}}
curl http://localhost:8108/health          # Typesense {"ok":true}
open http://localhost:3000                 # placeholder page
```

## Quality gates

```bash
pnpm lint         # ESLint across the workspace
pnpm typecheck    # tsc --noEmit in every package/app
pnpm test         # Vitest (smoke + health-route tests)
```

## Notes

- Never commit real secrets. Only `.env.example` (placeholders) is tracked; `.env` is git-ignored.
- The Typesense **admin** key is server-side only — never exposed to the browser.
- Tear down services: `docker compose down` (add `-v` to drop volumes).
