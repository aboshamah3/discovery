# Contract: `GET /api/health`

**Feature**: 001-repo-foundation | **Date**: 2026-06-30 | **Status**: Foundation (static)

The single external interface this foundation exposes. Defines a stable shape that monitoring and the future frontend can depend on; only the *source* of the values changes in Spec 005 (real DB/search checks).

## Request

```http
GET /api/health HTTP/1.1
Host: localhost:3000
```

- **Method**: `GET`
- **Auth**: none (public, read-only, side-effect free)
- **Query/body**: none

## Response — 200 OK

**Content-Type**: `application/json`

```json
{
  "ok": true,
  "services": {
    "database": "ok",
    "search": "ok"
  }
}
```

### Schema

| Field | Type | Allowed values | Notes |
|---|---|---|---|
| `ok` | boolean | `true` \| `false` | Aggregate readiness. Static `true` in this spec. |
| `services` | object | — | Per-dependency readiness map. |
| `services.database` | string | `"ok"` \| `"down"` | Static `"ok"` in this spec; real Postgres ping in Spec 005. |
| `services.search` | string | `"ok"` \| `"down"` | Static `"ok"` in this spec; real Typesense ping in Spec 005. |

### Status codes

| Code | When (this spec) | When (Spec 005+) |
|---|---|---|
| `200` | Always (static success) | All dependencies reachable |
| `503` | Not emitted in this spec | Reserved: any dependency down (`ok:false`) |

## Guarantees

- Response contains **no secret material** (no connection strings, no API keys).
- Response shape is **stable**: later specs may flip values or add `503`, but MUST NOT remove `ok` or `services.{database,search}`.
- Endpoint is idempotent and safe to poll.

## Validation (maps to spec)

- Satisfies **FR-004** (health endpoint returns success).
- Backs **US1 acceptance scenario 3** (running app → successful health response).
- Honors the spec edge case: static success is explicitly acceptable for the foundation; the static nature is documented in the README.
