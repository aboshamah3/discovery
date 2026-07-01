# Contract: Backend API (`apps/web` route handlers)

**Feature**: 005-backend-api-contracts | **Date**: 2026-07-01

The three read endpoints the frontend (Spec 007) and monitoring depend on. Handlers live in `apps/web/src/app/api/**`; pure logic in `apps/web/src/lib/api/**`; engine/DB adapters in `apps/web/src/lib/server/**`. Shapes follow `DS_PROJECT_SPEC_PLAN.md` §7. No auth. All responses `application/json`.

## Error envelope (all endpoints)

```json
{ "error": { "code": "bad_request", "message": "..." } }
```

`code ∈ { bad_request (400), not_found (404), internal (500), unavailable (503) }`. Messages are human-readable and secret-free; raw driver/engine errors are logged server-side, never returned.

---

## `GET /api/health`

Real reachability of both dependencies. Preserves the Spec 001 shape.

**Request**: no params.

**200 OK** — both dependencies reachable:

```json
{ "ok": true, "services": { "database": "ok", "search": "ok" } }
```

**503 Service Unavailable** — any dependency unreachable (example: search down):

```json
{ "ok": false, "services": { "database": "ok", "search": "down" } }
```

| Field | Type | Values |
|---|---|---|
| `ok` | boolean | `true` only when all services `"ok"` |
| `services.database` | string | `"ok"` \| `"down"` (`SELECT 1`) |
| `services.search` | string | `"ok"` \| `"down"` (`health.retrieve()`) |

- Body contains no secret material. Idempotent, safe to poll.
- Status is `200` iff `ok` is `true`, else `503`. (This is the `HealthStatus` monitoring body, not the `ApiError` envelope.)

---

## `GET /api/search`

Query the Typesense index via the Spec 004 builder.

**Request** (all optional):

```txt
GET /api/search?q=&page=1&perPage=24&brand=&category=&tag=&inStock=&sort=
```

| Param | Type | Notes |
|---|---|---|
| `q` | string | blank/absent → stable ordering (builder `*`) |
| `page` | int ≥ 1 | default 1 |
| `perPage` | int | default 24, clamped to `[1,60]` |
| `sort` | string | default `_text_match:desc,rating:desc,reviews:desc` |
| `brand`,`category`,`tag` | string | exact filter |
| `inStock` | `true`\|`false` | boolean filter |

**200 OK**:

```json
{
  "query": "runner",
  "page": 1,
  "perPage": 24,
  "found": 2,
  "totalPages": 1,
  "hasMore": false,
  "results": [
    { "id": "17", "title": "Trail Runner", "brand": "Acme", "tags": ["shoes"],
      "price": 89.99, "rating": 4.5, "reviews": 210, "inStock": true,
      "releasedAt": "2025-03-01T00:00:00.000Z" }
  ],
  "facets": {
    "brands": [ { "value": "Acme", "count": 2 } ],
    "categories": [ { "value": "Footwear", "count": 2 } ]
  }
}
```

- `results[]` are `ProductCardDTO` (data-model §2); absent optionals omitted.
- `totalPages = ceil(found / perPage)`; `hasMore = page < totalPages`.
- `facets` omitted when the engine returns none.

**400 Bad Request** — non-numeric `page`/`perPage`, or `inStock` not `true`/`false`. The search engine is **not** called.

```json
{ "error": { "code": "bad_request", "message": "Invalid search parameters" } }
```

**500 Internal Server Error** — the search engine call throws (e.g. engine down mid-request).

```json
{ "error": { "code": "internal", "message": "Search is temporarily unavailable" } }
```

- No response ever contains the admin Typesense key or any engine-internal field outside the DTO.

---

## `GET /api/products/[id]`

Read one product from PostgreSQL (source of truth).

**Request**: path segment `id` (the product's stable string id). Validated non-empty.

**200 OK**:

```json
{
  "product": {
    "id": "17", "title": "Trail Runner", "brand": "Acme", "category": "Footwear",
    "tags": ["shoes"], "price": 89.99, "rating": 4.5, "reviews": 210, "inStock": true,
    "releasedAt": "2025-03-01T00:00:00.000Z", "image": "https://…/17.jpg",
    "imageWidth": 800, "imageHeight": 800, "description": "Lightweight trail shoe."
  }
}
```

- `product` is `ProductCardDTO & { description? }` (data-model §4); internal columns (`source_hash`, `imported_at`, `created_at`, `updated_at`) are never included.

**400 Bad Request** — empty/blank id segment (validation fails before any DB call).

**404 Not Found** — no product with that id:

```json
{ "error": { "code": "not_found", "message": "Product not found" } }
```

**500 Internal Server Error** — the DB read throws.

---

## Behavioral guarantees (map to spec)

| Guarantee | Requirement |
|---|---|
| Health does real DB + search probes; 200/503 | FR-001 / FR-002 / SC-001 |
| Search returns documented envelope + pagination | FR-003 / FR-004 / FR-006 / SC-002 |
| Filters applied exactly as supplied | FR-003 / SC-003 |
| Results/detail are browser-safe DTOs only | FR-005 / FR-011 / SC-006 |
| Product detail from Postgres; 404 on miss | FR-007 / FR-008 / SC-005 |
| All input Zod-validated; 400 without hitting backend | FR-009 / SC-004 |
| Single error envelope for every failure | FR-010 |
| Backend failure → 500, no leak | FR-012 |
| Admin key/secret never in any response | FR-011 / SC-006 |
| Pure logic + mocked handlers unit-tested | FR-013 / SC-007 |
| No product UI beyond placeholder | FR-014 / SC-008 |
