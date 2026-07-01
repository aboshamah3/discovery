# Phase 0 — Research: Backend API Contracts

**Feature**: 005-backend-api-contracts | **Date**: 2026-07-01

The stack is ratified upstream (`DS_PROJECT_SPEC_PLAN.md` §2, constitution v1.1.0) and the endpoint/DTO shapes are fixed by §7. This file resolves the remaining "how" decisions for the HTTP layer only; concerns owned by later specs (deployment → Spec 006, product UI → Spec 007) are left open.

## Decisions

### D1 — HTTP status-code policy

- **Decision**: `200` success; `400` boundary-validation failure; `404` unknown product id; `500` caught backend (DB/search) failure; `503` health when any dependency is down.
- **Rationale**: Maps each failure mode to the standard semantic code so monitors and the frontend can branch on status alone. `503` for health-down matches the reserved code documented in the Spec 001 health contract; `400` (not `422`) for validation keeps the surface conventional and small.
- **Alternatives considered**: `422` for validation (rejected — no need to distinguish syntactic vs. semantic here; `400` is the documented spec choice); returning `200` with `ok:false` for health-down (rejected — a monitor must be able to alert on status code).

### D2 — Reuse the Spec 004 query builder; don't re-implement clamping

- **Decision**: The search route validates *types* with Zod, then hands an engine-independent `SearchInput` to `buildSearchParams` from `@ds/search`; page-size default (24) and clamp (`[1,60]`), empty-query `*`, weighting, typo, and ranking all come from the builder (§6.4).
- **Rationale**: Single source of truth for query behavior (constitution IV); the API layer owns only *validation + presentation*, not search semantics. Pagination metadata (`totalPages`, `hasMore`) is the one piece the API adds, computed from the builder's effective `per_page` and the engine's `found`.
- **Alternatives considered**: Re-clamping in the route (rejected — duplicates Spec 004 logic and risks drift); passing raw params straight to Typesense (rejected — bypasses the validated, documented contract).

### D3 — Pure logic in `lib/api`, thin adapters in `lib/server`, mocked route tests

- **Decision**: Put all decision logic (Zod parse, DTO mapping, pagination math, error construction, health aggregation) in pure `lib/api/*` functions that take plain inputs and return plain outputs. Isolate every Typesense/Postgres call in `lib/server/*`. Test pure logic directly; test route handlers with `vi.mock('@/lib/server/...')`.
- **Rationale**: Keeps `pnpm test` runnable with no Docker (constitution VI) while still exercising the real handler wiring (param parse → adapter call → DTO → status). Mirrors the injected-seam pattern from Specs 003/004.
- **Alternatives considered**: Integration-only tests against live engines (rejected — not runnable in the standard gate; flaky); passing dependency objects into every handler (rejected — Next.js fixes the handler signature; module mocking is the idiomatic seam).

### D4 — Facet mapping

- **Decision**: The builder already sets `facet_by: brand,category,tags,inStock`. Map Typesense `facet_counts` into the optional `facets` object (`brands`/`categories`/`tags`/`inStock` as `{ value, count }[]`); omit `facets` entirely when the engine returns none.
- **Rationale**: Matches §7.2 exactly and gives the future UI ready-made filter chips without a second request.
- **Alternatives considered**: Always emitting empty facet arrays (rejected — noisier contract; §7.2 marks `facets` optional).

### D5 — Release value presentation

- **Decision**: `ProductSearchDocument.releasedAtTimestamp` (Unix seconds) → DTO `releasedAt` as an ISO-8601 string; product-detail's `released_at` (a `Date`/timestamptz) → the same ISO string. Absent → field omitted.
- **Rationale**: §7.2 types `releasedAt?: string`; ISO-8601 is unambiguous and locale-independent for the frontend to parse/format.
- **Alternatives considered**: Passing the raw epoch to the client (rejected — DTO contract is a string); date-only `YYYY-MM-DD` (rejected — loses the round-trip and the stored value is a full timestamp).

### D6 — Next.js 15 route-handler conventions

- **Decision**: Read query params via `new URL(request.url).searchParams`; for the dynamic detail route use the Next 15 async signature `({ params }: { params: Promise<{ id: string }> })` and `await params`. All handlers return `Response.json(body, { status })`.
- **Rationale**: Next.js 15 makes `params` a promise; using the documented signature keeps `next build` and the type checker happy.
- **Alternatives considered**: The pre-15 sync `params` object (rejected — type error under Next 15).

### D7 — Consistent error envelope

- **Decision**: `{ error: { code, message } }` where `code` is a stable enum (`bad_request` | `not_found` | `internal` | `unavailable`) and `message` is human-readable and safe. A single `jsonError(status, code, message)` helper builds every failure response; caught backend errors are logged server-side but never serialized to the client.
- **Rationale**: One shape for every failure (FR-010) lets clients handle errors uniformly; hiding raw driver/engine errors prevents leaking internals/secrets (FR-011/FR-012).
- **Alternatives considered**: Per-endpoint ad-hoc error bodies (rejected — violates the single-format requirement); including `details`/stack (rejected — leakage risk; can be added later behind a dev flag if ever needed).

### D8 — Health probe mechanics

- **Decision**: `pingDatabase()` runs `SELECT 1` via `@ds/db.query`; `pingSearch()` calls `getSearchClient().health.retrieve()`. Each returns a boolean, catching and swallowing the underlying error (turned into `down`). `checkHealth` aggregates: `ok = database && search`, status `200`/`503`.
- **Rationale**: Cheapest truthful liveness signal for each dependency; swallowing the error at the probe keeps the health body secret-free while the boolean carries the signal.
- **Alternatives considered**: Retrieving the products collection for search health (rejected — heavier and couples health to schema; `health.retrieve` is the purpose-built call).

## Resolved unknowns

| Unknown | Resolution |
|---|---|
| Validation status code | `400` (D1) |
| Where clamping/query semantics live | `@ds/search` builder, reused (D2) |
| Engine-free testing of handlers | pure `lib/api` + `vi.mock` adapters (D3) |
| Facet shape | `{ value, count }[]` per field, optional (D4) |
| `releasedAt` format | ISO-8601 string (D5) |
| Dynamic route params under Next 15 | async `params` promise (D6) |
| Error body shape | `{ error: { code, message } }` (D7) |
| Health probes | `SELECT 1` + `health.retrieve()` (D8) |

## Non-goals (owned by later specs)

- Deployment config / Railway (Spec 006).
- Product frontend — search UI, grid, filters, detail page (Spec 007).
- Any write/import endpoint (`POST /api/internal/import-products`, §7.4) — scripts already cover import.
- Authentication, rate limiting, caching headers (not requested; YAGNI).
