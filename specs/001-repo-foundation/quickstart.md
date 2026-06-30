# Quickstart & Validation: Repo Foundation

**Feature**: 001-repo-foundation | **Date**: 2026-06-30

Runnable steps that prove the foundation works end-to-end. Each step maps to spec success criteria. This is a validation guide — implementation lives in `tasks.md` / the implement phase.

## Prerequisites

- Node.js 20 LTS
- pnpm 9 (`corepack enable` recommended)
- Docker + Docker Compose (for local Postgres + Typesense)

## Steps

```bash
# 1. Install all workspace dependencies (FR-002)
pnpm install

# 2. Create local env from the example (FR-006 / US2 scenario 3)
cp .env.example .env

# 3. Start local backing services: Postgres + Typesense (FR-005)
docker compose up -d

# 4. Start the app (FR-003)
pnpm dev
```

## Expected outcomes (validation matrix)

| Check | Command / action | Expected | Proves |
|---|---|---|---|
| Install succeeds | `pnpm install` | Completes with no errors; all 4 packages + app linked | FR-002 |
| Services up | `docker compose ps` | `postgres` and `typesense` both `running`/healthy | FR-005, SC-002 |
| Postgres reachable | connect to `localhost:5432` | Accepts connection | SC-002 |
| Typesense reachable | `curl http://localhost:8108/health` | `{"ok":true}` from Typesense | SC-002 |
| App runs | open `http://localhost:3000` | Placeholder page renders (no product UI) | FR-003, FR-009 |
| Health endpoint | `curl http://localhost:3000/api/health` | `{"ok":true,"services":{"database":"ok","search":"ok"}}` | FR-004 |
| Lint clean | `pnpm lint` | Exits 0, no errors across all workspace areas | FR-007, SC-003 |
| Typecheck clean | `pnpm typecheck` | Exits 0, no type errors across all workspace areas | FR-007, SC-003 |
| Tests green | `pnpm test` | Smoke test(s) pass | US3 baseline |
| No secrets committed | inspect repo | Only `.env.example` (placeholders); `.env` git-ignored | FR-011, SC-006 |
| Time-to-running | full run of steps 1–4 from fresh clone | < 15 minutes | SC-001 |

## Notes

- `/api/health` returns **static** success in this spec; real DB/search checks arrive in Spec 005 (see [contracts/health.contract.md](./contracts/health.contract.md)).
- Tearing down: `docker compose down` (add `-v` to drop volumes).
- See [data-model.md](./data-model.md) for the full `.env` key list.
