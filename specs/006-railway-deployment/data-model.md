# Phase 1 — Data Model: Railway Deployment Foundation

**Feature**: `006-railway-deployment` | **Date**: 2026-07-01 | **Spec**: [spec.md](./spec.md)

This spec adds no application data model (no tables, no DTOs). Its "entities" are the deployment
configuration artifacts. This document defines them precisely so `tasks.md` and the implementation are
unambiguous. Field-level HTTP/command contracts live in [contracts/deployment.contract.md](./contracts/deployment.contract.md).

## Entity: Environment-variable checklist

The authoritative set of variables the deployed app and the scripts read, verified by `grep` of
`process.env.*` across `apps/`, `packages/`, `scripts/`. "Required" means the code throws (fails loudly)
when it is missing; "default" means the code supplies a fallback.

| Variable | Consumer(s) | Required? | Default (if optional) | Purpose | Safe example |
|---|---|---|---|---|---|
| `DATABASE_URL` | `@ds/db` (app detail/health, migrate, import, reindex) | **Required** | — (throws) | PostgreSQL connection string (source of truth) | `postgresql://user:pass@host:5432/ds` |
| `TYPESENSE_HOST` | `@ds/search` (app search/health, reindex) | **Required** | — (throws) | Typesense host | `typesense.internal` |
| `TYPESENSE_API_KEY` | `@ds/search` | **Required** | — (throws) | **Admin** search key — server-side only, never `NEXT_PUBLIC_*` | `<admin-key>` |
| `TYPESENSE_PORT` | `@ds/search` | Optional | `8108` | Typesense port | `8108` |
| `TYPESENSE_PROTOCOL` | `@ds/search` | Optional | `http` | `http` or `https` | `http` |
| `TYPESENSE_PRODUCTS_COLLECTION` | `@ds/search` (`schema.ts`) | Optional | `products` | Collection name for the product index | `products` |
| `PRODUCTS_SOURCE_URL` | import script (`@ds/import`) | **Required for import** | — (throws) | Source JSON catalog URL | `https://media.downshift.app/hiring/founding-engineer/items.json` |
| `IMPORT_BATCH_SIZE` | import script | Optional | `500` (must be positive int) | Import upsert batch size | `500` |
| `REINDEX_BATCH_SIZE` | reindex script | Optional | `500` (must be positive int) | Reindex batch size | `500` |
| `NEXT_PUBLIC_APP_NAME` | `apps/web` (`page.tsx`) | Optional | app `APP_NAME` constant | Display name (browser-exposed by design) | `"DS Product Discovery"` |
| `PORT` | standalone `server.js` (Next) | Platform-provided | `3000` | Port the server binds | injected by Railway |
| `HOSTNAME` | standalone `server.js` (Next) | Optional | `0.0.0.0` | Bind interface | `0.0.0.0` |

**Explicitly NOT in the runtime checklist** (kept in `.env.example`, but not read by any app/script code):

- `TYPESENSE_SEARCH_ONLY_API_KEY` — reserved for a future browser search-only key strategy; no code reads it today.
- `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` — **local `docker-compose` only**. On Railway the managed PostgreSQL provides `DATABASE_URL` directly, so these three are not set on the deployed service.

**Validation rules** (existing, from earlier specs — this spec only documents/relies on them):

- Missing `DATABASE_URL` → `@ds/db.getPool()` throws with a copy-`.env` hint.
- Missing `TYPESENSE_HOST` or `TYPESENSE_API_KEY` → `@ds/search.getSearchClient()` throws.
- Missing `PRODUCTS_SOURCE_URL` → import throws.
- Non-positive-integer `IMPORT_BATCH_SIZE` / `REINDEX_BATCH_SIZE` → throws.

## Entity: Deployment configuration (`railway.json`)

Config-as-code committed at repo root. Fields (see contract for exact values):

| Field | Value | Maps to |
|---|---|---|
| `build.builder` | `NIXPACKS` | Railway native builder for the pnpm monorepo |
| `build.buildCommand` | `pnpm build` | Install → `next build` → prepare-standalone (FR-001) |
| `deploy.preDeployCommand` | `pnpm db:migrate` | Idempotent migrations before serving (FR-004, US2) |
| `deploy.startCommand` | `node apps/web/.next/standalone/apps/web/server.js` | Run the self-contained server (FR-002, US1) |
| `deploy.healthcheckPath` | `/api/health` | Readiness gate (FR-005, US3) |
| `deploy.healthcheckTimeout` | generous (e.g. `300`) | First-boot grace |
| `deploy.restartPolicyType` | `ON_FAILURE` | Resilience |

## Entity: Production build output (standalone bundle)

Produced by `pnpm build`; runtime-relevant shape (verified by a real build):

```text
apps/web/.next/standalone/
├── apps/web/server.js            # entry — binds PORT / 0.0.0.0
├── apps/web/.next/               # server chunks (pg + typesense bundled in)
│   └── static/                   # ← copied in by prepare-standalone (NOT automatic)
├── packages/{db,search,shared}/  # workspace deps, traced in
└── node_modules/.pnpm/...        # traced external deps (next, react, sharp, ...)
```

## Entity: Operational commands

| Command | When | Automated? | Idempotent? |
|---|---|---|---|
| `pnpm db:migrate` | Before each deploy serves traffic | Yes — `preDeployCommand` | Yes (applies only pending) |
| `pnpm import:products` | On demand, after first deploy / on catalog change | No — manual operator command | Yes (upsert by id) |
| `pnpm reindex:products` | On demand, after an import | No — manual operator command | Yes (rebuildable index) |
