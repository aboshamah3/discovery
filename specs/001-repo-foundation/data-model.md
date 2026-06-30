# Phase 1 Data Model: Repo Foundation

**Feature**: 001-repo-foundation | **Date**: 2026-06-30

This foundation introduces **no persisted domain data**. The product `Product` and `ImportRun` models are explicitly deferred to **Spec 002 — Data Model + Validation**. The entities below are the configuration/operational shapes this spec actually defines.

---

## Entity: Environment Configuration

The named set of values required to run the app and local services. Expressed in `.env.example` with safe placeholder defaults; real values live in a git-ignored `.env`. All values are server-side; only keys prefixed `NEXT_PUBLIC_` are exposed to the browser.

| Key | Example (placeholder) | Browser-exposed? | Purpose | Consumed by |
|---|---|---|---|---|
| `NODE_ENV` | `development` | no | Runtime mode | app |
| `NEXT_PUBLIC_APP_NAME` | `"DS Product Discovery"` | yes | Display name | app (placeholder page) |
| `DATABASE_URL` | `postgresql://user:password@localhost:5432/ds` | no | Postgres connection | `@ds/db` (Spec 002+) |
| `PRODUCTS_SOURCE_URL` | `https://media.downshift.app/hiring/founding-engineer/items.json` | no | Catalog source | import script (Spec 003) |
| `TYPESENSE_HOST` | `localhost` | no | Search host | `@ds/search` (Spec 004+) |
| `TYPESENSE_PORT` | `8108` | no | Search port | `@ds/search` |
| `TYPESENSE_PROTOCOL` | `http` | no | Search protocol | `@ds/search` |
| `TYPESENSE_API_KEY` | `dev_typesense_key` | **no (admin)** | Admin/bootstrap key | search server + compose |
| `TYPESENSE_SEARCH_ONLY_API_KEY` | `dev_search_only_key_optional` | no | Reserved browser-safe key | future frontend |
| `TYPESENSE_PRODUCTS_COLLECTION` | `products` | no | Collection name | `@ds/search` (Spec 004) |
| `IMPORT_BATCH_SIZE` | `500` | no | Import batching | import script (Spec 003) |
| `REINDEX_BATCH_SIZE` | `500` | no | Reindex batching | reindex script (Spec 004) |

**Validation rules (foundation scope)**:
- `.env.example` MUST contain every key above (SC-004). Keys with no safe default still appear with a placeholder.
- No key value in `.env.example` may be a real credential (SC-006).
- The app MUST start using only values present in `.env.example` copied to `.env` (US2 scenario 3).
- Admin search key (`TYPESENSE_API_KEY`) MUST NOT be referenced under a `NEXT_PUBLIC_` name (Backend Rule §11.4).

> Note: per-value runtime validation (e.g., a Zod env schema) is a reasonable later hardening but is **not required** by this spec; the foundation only guarantees the keys exist and the app boots from them.

---

## Entity: Health Status

The machine-readable readiness response returned by `GET /api/health`. Full request/response details in [contracts/health.contract.md](./contracts/health.contract.md).

| Field | Type | Foundation value | Later behavior |
|---|---|---|---|
| `ok` | boolean | `true` (static) | Reflects aggregate readiness (Spec 005) |
| `services.database` | string enum (`"ok"` \| `"down"`) | `"ok"` (static) | Real Postgres ping (Spec 005) |
| `services.search` | string enum (`"ok"` \| `"down"`) | `"ok"` (static) | Real Typesense ping (Spec 005) |

**Rules**:
- Shape is stable now so monitoring/frontend can depend on it; only the *source* of the values changes in Spec 005.
- Endpoint is read-only, unauthenticated, side-effect free, and returns no secret material.

---

## Entity: Workspace (structural, non-persisted)

The repository as a composition unit. Not data, but the organizing entity this spec creates.

- **Members**: `apps/web`, `packages/db` (`@ds/db`), `packages/search` (`@ds/search`), `packages/shared` (`@ds/shared`), `packages/config` (`@ds/config`).
- **Relationships**: `apps/web` may depend on `@ds/shared` (and later `@ds/db`, `@ds/search`) via `workspace:*`. All members extend `@ds/config`'s TS/ESLint base.
- **Invariant**: adding a new member under `apps/*` or `packages/*` is automatically covered by `pnpm -r` lint/typecheck/test (no central reconfiguration).

---

## Deferred (NOT in this spec)

- `Product` model and `ImportRun` model → **Spec 002**.
- Typesense collection schema / search document shape → **Spec 004**.
- Search/product DTOs → **Spec 005**.

These appear here only to confirm their reserved homes (`packages/db`, `packages/search`) exist after this spec.
