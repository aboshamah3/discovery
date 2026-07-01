# Quickstart — Verify the Railway Deployment Foundation

**Feature**: `006-railway-deployment` | **Date**: 2026-07-01

Two parts: **(A)** local verification that proves the config is correct with no Railway account
(covers SC-001…SC-005, SC-008), and **(B)** the actual Railway deploy runbook (US1–US4).

## Prerequisites

- Node ≥ 20, `pnpm` 9, Docker (for the local stack).
- `cp .env.example .env` (local defaults already point at the Docker services).

---

## A. Local verification (no Railway account) — SC-001, SC-003, SC-004

### A1. Build the self-contained production server (SC-001, FR-001)

```bash
pnpm build
# Produces apps/web/.next/standalone/apps/web/server.js AND copies .next/static in.
test -f apps/web/.next/standalone/apps/web/server.js && echo "standalone server present"
test -d apps/web/.next/standalone/apps/web/.next/static && echo "static assets copied"
```

### A2. Run the standalone server and probe health (SC-001, SC-004)

```bash
# With the local stack up + migrated + imported + reindexed, health is 200.
docker compose up -d && pnpm db:migrate      # (import + reindex too for a fully green run)
PORT=3999 node apps/web/.next/standalone/apps/web/server.js &
curl -s -w "\n%{http_code}\n" http://localhost:3999/api/health
# Expected: {"ok":true,"services":{"database":"ok","search":"ok"}} 200
# With a dependency down: {"ok":false,...} 503  (proves the readiness gate, SC-004)
```

### A3. Migration idempotency (SC-003)

```bash
pnpm db:migrate     # applies pending migrations (or "No pending migrations.")
pnpm db:migrate     # second run: "No pending migrations." and exit 0  → idempotent
```

### A4. Quality gate (SC-008)

```bash
pnpm lint && pnpm typecheck && pnpm test   # all green, no DB/Typesense required
```

### A5. Env checklist matches the code (SC-005)

```bash
# Every process.env.* the code reads must appear in README's checklist:
grep -rhoE "process\.env\.[A-Z_][A-Z0-9_]*" --include='*.ts' --include='*.tsx' --include='*.mjs' \
  apps packages scripts | sort -u
```

---

## B. Railway deploy runbook — US1–US4

1. **Create the Railway project** and add three services:
   - the app (this GitHub repo — Railway reads `railway.json`),
   - a **PostgreSQL** plugin (provides `DATABASE_URL`),
   - a **Typesense** service (Docker image `typesense/typesense:27.1`, with a persistent volume and an
     admin `--api-key`).
2. **Set env vars** on the app service per the README checklist (§ Deployment): `DATABASE_URL` (reference
   the Postgres plugin), `TYPESENSE_HOST`/`TYPESENSE_PORT`/`TYPESENSE_PROTOCOL`/`TYPESENSE_API_KEY`,
   `TYPESENSE_PRODUCTS_COLLECTION`, `PRODUCTS_SOURCE_URL`, and optionally `NEXT_PUBLIC_APP_NAME`. Do
   **not** set `NEXT_PUBLIC_*` to the admin key.
3. **Deploy.** Railway runs `pnpm build`, then `pnpm db:migrate` (pre-deploy), then the start command.
   The deploy is promoted only when `/api/health` returns `200` — so Typesense must be reachable.
4. **Populate the catalog** (one-off, after the first successful deploy):
   ```bash
   pnpm import:products     # fetch → validate → upsert into Postgres
   pnpm reindex:products    # rebuild the Typesense index from Postgres
   ```
   Run these from a Railway one-off command / service shell so they use the production env.
5. **Verify production**: `GET https://<app>.up.railway.app/api/health` → `200`; a sample
   `GET /api/search?q=phone` returns results.

## Success criteria mapping

| Step | Verifies |
|---|---|
| A1 | SC-001 (self-contained build), FR-001 |
| A2 | SC-001, SC-004 (health readiness gate), FR-002/FR-005 |
| A3 | SC-003 (migration idempotency), FR-004 |
| A4 | SC-008 (gate green) |
| A5 | SC-005 (env checklist accuracy), FR-006 |
| B1–B3 | SC-002 (config-as-code), US1/US2/US3 |
| B4 | SC-006 (manual import/reindex), US4/FR-007 |
| B5 | US3 production readiness |
