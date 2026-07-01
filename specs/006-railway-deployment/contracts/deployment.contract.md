# Deployment Contract: Railway Deployment Foundation

**Feature**: `006-railway-deployment` | **Date**: 2026-07-01

The "interface" this spec exposes is the deployment contract: the committed platform configuration and
the operational commands. The HTTP API contracts (health, search, product detail) are **unchanged** —
see [../../005-backend-api-contracts/contracts/api.contract.md](../../005-backend-api-contracts/contracts/api.contract.md).
This spec only wires `/api/health` as the platform readiness probe; its request/response is identical to
Spec 005.

## 1. `railway.json` (repo root)

```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "pnpm build"
  },
  "deploy": {
    "preDeployCommand": "pnpm db:migrate",
    "startCommand": "node apps/web/.next/standalone/apps/web/server.js",
    "healthcheckPath": "/api/health",
    "healthcheckTimeout": 300,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

**Guarantees**:

- **Build** produces a self-contained server (`next build` with `output: "standalone"` +
  `outputFileTracingRoot`, then static assets copied in). Exit non-zero ⇒ deploy aborts.
- **Pre-deploy** runs migrations before the new version serves traffic; non-zero exit ⇒ new version is
  not promoted (broken schema never serves).
- **Start** runs the standalone server, binding `PORT` (Railway-injected) on `0.0.0.0`.
- **Health check** promotes the version only when `/api/health` returns `200`.

## 2. Build command contract — `pnpm build`

- **Input**: a clean install (`pnpm install --frozen-lockfile`, dev deps included).
- **Effect**: `next build` (standalone) → `node scripts/prepare-standalone.mjs` copies
  `apps/web/.next/static` (+ `apps/web/public` if present) into the standalone tree.
- **Output**: runnable `apps/web/.next/standalone/apps/web/server.js` with static assets in place.
- **Failure**: non-zero exit on compile/type error or a missing expected build artifact.

## 3. Start command contract

- **Command**: `node apps/web/.next/standalone/apps/web/server.js` (also `pnpm start:standalone`).
- **Reads**: `PORT` (default `3000`), `HOSTNAME` (default `0.0.0.0`), plus all app runtime env
  (`DATABASE_URL`, `TYPESENSE_*`).
- **Serves**: the Spec 005 endpoints and the placeholder page; `/_next/static/*` from the copied assets.

## 4. Pre-deploy (migration) command contract — `pnpm db:migrate`

- **Reads**: `DATABASE_URL` (from platform env; the repo-root `.env` is optional and never overrides it).
- **Effect**: applies each pending `packages/db/migrations/*.sql` in filename order, one transaction
  each, recording it in `schema_migrations`.
- **Idempotent**: re-running with nothing pending prints `No pending migrations.` and exits `0`.
- **Failure**: a failing migration is rolled back; the command exits non-zero with
  `Migration <file> failed: <message>` — the deploy is not promoted.

## 5. Operational commands (manual, NOT in the pipeline)

| Command | Reads | Effect | Re-run safe |
|---|---|---|---|
| `pnpm import:products` | `PRODUCTS_SOURCE_URL`, `DATABASE_URL`, `IMPORT_BATCH_SIZE` | Fetch + validate + upsert catalog into PostgreSQL; log an `ImportRun` | Yes (upsert by id) |
| `pnpm reindex:products` | `DATABASE_URL`, `TYPESENSE_*`, `REINDEX_BATCH_SIZE` | Rebuild the Typesense product collection from PostgreSQL | Yes (rebuildable) |

Run on Railway via a one-off command / service shell against the deployed service's environment.

## 6. Health readiness contract (unchanged from Spec 005)

- `GET /api/health` → `200 {"ok":true,"services":{"database":"ok","search":"ok"}}` when both up.
- `GET /api/health` → `503 {"ok":false,"services":{"database":"...","search":"..."}}` when either down.
- Body contains no secrets. **Consequence**: Typesense must be reachable for a green deploy.
