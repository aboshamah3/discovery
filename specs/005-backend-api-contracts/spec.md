# Feature Specification: Backend API Contracts

**Feature Branch**: `005-backend-api-contracts`

**Created**: 2026-07-01

**Status**: Draft

**Input**: User description: "Spec 005: backend API contracts. Expose stable HTTP endpoints before any UI — a health endpoint with real database and search readiness checks, a search endpoint backed by the Typesense foundation (query, pagination, sort, filters, facets), and a product-detail endpoint backed by PostgreSQL. Validate all query/path input at the boundary, map internal shapes to documented browser-safe DTOs, return a consistent error format, and cover the pure logic (validation, DTO mapping, error format, health aggregation) plus the route handlers with tests. No product frontend beyond the existing placeholder."

## Clarifications

### Session 2026-07-01

- Q: What HTTP status should each failure mode use? → A: `400` for boundary validation failures, `404` for an unknown product id, `500` for a caught backend (DB/search) failure, and `503` for health when any dependency is down — all in the single consistent error envelope.
- Q: Should the search response include facet counts? → A: Yes. When the search engine returns facet counts, map them into the optional `facets` object (`brands`, `categories`, `tags`, `inStock` as `{ value, count }` lists) per `DS_PROJECT_SPEC_PLAN.md` §7.2; omit `facets` when none are returned.
- Q: Where does product detail read from — the search index or the canonical store? → A: The canonical PostgreSQL store (constitution II); the search index is never the source of truth for detail reads.
- Q: How is the internal release representation presented in the DTO? → A: As an ISO-8601 string (`releasedAt`), converted from the stored timestamp; omitted when the product has no release date.
- Q: Is the optional import endpoint (`POST /api/internal/import-products`, §7.4) in scope? → A: No. Scripts (Spec 003) already cover import; no public/internal import surface is added this spec (YAGNI, constitution V).
- Q: Are the search page-size default and cap re-decided here? → A: No. They are reused from the Spec 004 builder (default 24, cap 60, §6.4); this spec only computes pagination metadata (`totalPages`, `hasMore`) from the effective values.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Report real dependency readiness (Priority: P1)

An operator (or an uptime monitor) requests the health endpoint and learns whether the service and each of its backing dependencies — the canonical database and the search engine — are actually reachable right now, in a response whose shape has been stable since the foundation, so alerting and later the frontend can depend on it.

**Why this priority**: Every other endpoint depends on the database and the search engine being up. A truthful readiness signal is the smallest independently valuable slice — it turns the foundation's static placeholder into a real probe without needing search or detail endpoints to exist yet.

**Independent Test**: With both dependencies reachable, request the endpoint and confirm a success response reporting each dependency as up; with a dependency unreachable, confirm the response reports that dependency down and signals overall not-ready — verifiable by injecting up/down probe results, and end-to-end against the local stack.

**Acceptance Scenarios**:

1. **Given** the database and search engine are both reachable, **When** the health endpoint is requested, **Then** it responds with overall-ready and each dependency marked up, in the established `{ ok, services: { database, search } }` shape.
2. **Given** at least one dependency is unreachable, **When** the health endpoint is requested, **Then** it responds with an unavailable status code, overall not-ready, and the specific dependency marked down.
3. **Given** any state, **When** the health endpoint responds, **Then** the body contains no secret material (no connection strings, no keys).

---

### User Story 2 - Search the catalog over HTTP (Priority: P1)

A client sends a search request — a query plus optional page, page size, sort, and brand/category/tag/in-stock filters — and receives a stable, documented, browser-safe result: the matched product cards, the total found, pagination metadata, and optional facet counts, ranked with typo tolerance and prefix matching by the search foundation.

**Why this priority**: Search is the product's core capability and the endpoint the future UI is built around. It is independently valuable and testable once the search foundation (Spec 004) exists, which it does.

**Independent Test**: Issue representative requests (with/without query, with each filter, out-of-range page sizes, invalid parameter types) and confirm valid inputs yield the documented result shape with correct pagination math and DTO mapping, while invalid inputs yield a consistent validation error — verifiable by injecting a fake search backend, and end-to-end against a populated local index.

**Acceptance Scenarios**:

1. **Given** a valid query with no filters, **When** the search endpoint is called, **Then** it returns the documented search response (query echo, page, page size, found, total pages, has-more, results, optional facets) with each result mapped to the browser-safe product-card shape.
2. **Given** any combination of brand, category, tag, and in-stock filters, **When** the search endpoint is called, **Then** exactly those filters are applied to the underlying search and reflected in the results.
3. **Given** a page size that is absent, below the minimum, or above the cap, **When** the search endpoint is called, **Then** the effective page size is the documented default or clamped value, and pagination metadata is computed from it.
4. **Given** a parameter of the wrong type (e.g. a non-numeric page, an unparseable in-stock flag), **When** the search endpoint is called, **Then** it returns a consistent validation error with a bad-request status and does not call the search engine.
5. **Given** any successful response, **When** it is inspected, **Then** it contains no privileged search credential or internal engine field not part of the documented DTO.

---

### User Story 3 - Fetch one product's details (Priority: P2)

A client requests a single product by its stable identifier and receives that product's full detail as a browser-safe DTO read from the canonical database, or a consistent not-found error when no such product exists.

**Why this priority**: Product detail completes the read surface the UI needs, but it is only reached after a user has found a product via search, so it ranks below health and search. It is independently valuable and testable on its own.

**Independent Test**: Request an existing id and a missing id and confirm the first returns the documented detail DTO and the second returns a consistent not-found error — verifiable by injecting a fake product reader, and end-to-end against the imported catalog.

**Acceptance Scenarios**:

1. **Given** a product exists for the requested id, **When** the detail endpoint is called, **Then** it returns that product mapped to the documented detail DTO (the product-card fields plus description), read from the canonical database.
2. **Given** no product exists for the requested id, **When** the detail endpoint is called, **Then** it returns a consistent not-found error with a not-found status and no product body.
3. **Given** any successful response, **When** it is inspected, **Then** it exposes only documented DTO fields (no internal-only columns such as the source hash or import bookkeeping).

---

### Edge Cases

- **Dependency down**: any unreachable dependency MUST flip health to not-ready with the correct status code, never a false green.
- **Empty query**: a missing/blank query MUST be a valid search that returns a stable ordering (delegated to the search foundation), not an error.
- **Out-of-range / absent page size**: MUST be clamped/defaulted, never passed through unbounded and never an error.
- **Invalid parameter type**: a non-numeric page/page-size or an unparseable boolean filter MUST yield a consistent validation error and MUST NOT reach the search engine or database.
- **Missing optional fields**: products lacking brand, price, rating, image, release date, or description MUST serialize with those fields simply absent, not null-filled or errored.
- **Release value formatting**: the internal numeric/timestamp release representation MUST be presented in the DTO as a stable string form (or omitted when absent).
- **Not-found vs. error**: an unknown product id MUST be a clean not-found, distinct from a server error.
- **Credential exposure**: no endpoint response may contain the privileged search credential, database connection string, or any secret (constitution V, FR-012 of Spec 004).
- **Backend failure**: if a dependency call throws while serving search or detail, the endpoint MUST return a consistent server-error shape rather than leaking a stack trace or raw driver error.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST expose a health endpoint that performs a real reachability check of the canonical database and the search engine and reports each dependency as up or down.
- **FR-002**: The health endpoint MUST preserve the established response shape (`ok` plus a `services` map with `database` and `search`), returning overall-ready with a success status when all dependencies are up, and overall not-ready with a service-unavailable status when any dependency is down.
- **FR-003**: The system MUST expose a search endpoint that accepts a query and optional page, page size, sort, and brand/category/tag/in-stock filters, and returns results produced by the Spec 004 search foundation.
- **FR-004**: The search endpoint MUST return a documented, stable response containing the echoed query, the effective page and page size, the total found, total pages, a has-more indicator, the result list, and optional facet counts for brand, category, tags, and in-stock.
- **FR-005**: The search endpoint MUST map each engine result to a browser-safe product-card DTO exposing only documented fields, presenting the internal release representation as a stable string (or omitting it) and omitting absent optional fields.
- **FR-006**: The search endpoint MUST apply the documented default page size and clamp any requested page size to the allowed range (reusing the search foundation's behavior), and MUST compute total pages and has-more from the effective page size and total found.
- **FR-007**: The system MUST expose a product-detail endpoint that reads one product by its stable identifier from the canonical database and returns a documented detail DTO (the product-card fields plus description).
- **FR-008**: The product-detail endpoint MUST return a consistent not-found error with a not-found status when no product matches the identifier, distinct from a server error.
- **FR-009**: All untrusted input (search query parameters and the product path identifier) MUST be validated with Zod at the boundary before use; invalid types MUST yield a consistent validation error with a bad-request status and MUST NOT reach the database or search engine.
- **FR-010**: All endpoints MUST use a single consistent error format (a stable machine-readable code plus a human-readable message) for validation, not-found, and server-error cases.
- **FR-011**: No endpoint response may expose any secret (the privileged search credential, database connection string, or any internal-only field such as the source hash or import bookkeeping); DTOs MUST include only documented fields.
- **FR-012**: A dependency failure while serving search or detail MUST be caught and returned as the consistent server-error shape, never as a leaked stack trace or raw driver/engine error.
- **FR-013**: The pure, engine-independent logic — query-parameter validation, DTO mapping, pagination math, error-format construction, and health aggregation — MUST be covered by automated unit tests; the route handlers MUST be covered with the backing dependencies faked/mocked, so the full test gate passes with no running database or search engine.
- **FR-014**: This spec MUST NOT add a product-facing frontend beyond the existing minimal placeholder page; its surface is the three read endpoints plus their validation, DTO, and error modules.

### Key Entities *(include if data involved)*

- **Health report**: the readiness result — an aggregate flag plus a per-dependency up/down map for the database and the search engine.
- **Search request (HTTP)**: the validated, engine-independent description of a query parsed from query parameters — text, page, page size, sort, and filters — handed to the search foundation.
- **Search response**: the documented result envelope — echoed query, effective page and page size, total found, total pages, has-more, the product-card results, and optional facet counts.
- **Product-card DTO**: the browser-safe representation of one product shared by search results and product detail — identifier, title, optional brand/category/price/rating/reviews/image/release/description, tags, and in-stock flag.
- **Product-detail response**: a single product-card DTO (with description) wrapped for the detail endpoint.
- **API error**: the consistent failure envelope — a stable code and a human-readable message — used for validation, not-found, and server errors.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With both dependencies reachable, the health endpoint returns a success status with overall-ready and both dependencies up; with a dependency unreachable, it returns a service-unavailable status with overall not-ready and that dependency down (verified by injected probe results and against the local stack).
- **SC-002**: For a representative set of search requests, 100% of valid requests return the documented response shape with correct pagination math (total pages and has-more consistent with found and effective page size) and every result conforming to the product-card DTO.
- **SC-003**: Every supplied combination of brand, category, tag, and in-stock filters is applied to the underlying search exactly as requested, and no filter is applied when none is supplied.
- **SC-004**: 100% of invalid search parameters (non-numeric page/page-size, unparseable in-stock flag) and 100% of malformed detail identifiers yield the consistent validation error with a bad-request status, and the backend (database/search engine) is not invoked for them.
- **SC-005**: The product-detail endpoint returns the documented detail DTO for an existing id and the consistent not-found error for a missing id, distinguishable by status code.
- **SC-006**: No endpoint response contains any secret or undocumented internal field (verified by inspecting responses and DTO definitions); the privileged search credential never appears in any client-facing output.
- **SC-007**: Automated tests cover validation (valid + each invalid case), DTO mapping (including release formatting and missing optional fields), pagination math, error-format construction, health aggregation (all-up and any-down), and each route handler with faked dependencies; the full workspace gate (lint, typecheck, test) passes with zero failures and no running database or search engine required.
- **SC-008**: No product-facing frontend beyond the existing placeholder is introduced (verified by inspection).

## Assumptions

- The technology direction is fixed upstream by `DS_PROJECT_SPEC_PLAN.md` and the constitution (v1.1.0) and is treated as a dependency, not re-decided here: **Next.js App Router** route handlers expose the endpoints, **Zod** validates untrusted boundaries, PostgreSQL is read via the existing direct `@ds/db` client (no ORM), search is served by the existing `@ds/search` foundation, and tests use **Vitest**.
- Specs 002–004 are complete: PostgreSQL holds the canonical `products` catalog, the shared normalized product shape exists, and the search package provides the query builder, client factory, collection name, and document shape this spec composes.
- The documented DTO and response shapes follow `DS_PROJECT_SPEC_PLAN.md` §7 (health §7.1, search §7.2 `SearchResponse`/`ProductCardDTO`/`FacetValue`, product detail §7.3 `ProductDetailResponse`); the default (24) and maximum (60) page sizes and query behavior follow §6.4 via the Spec 004 builder.
- Health uses a service-unavailable (503) status when any dependency is down and 200 when all are up; validation failures use 400; unknown product ids use 404; caught backend failures use 500 — each in the single consistent error format.
- The optional internal import endpoint (`POST /api/internal/import-products`, §7.4) is explicitly out of scope: scripts (Spec 003) already cover import, and no public import surface is added (YAGNI, constitution V).
- Deployment (Spec 006) and the product frontend (Spec 007) are out of scope; this spec stops at the three read endpoints and keeps the app's placeholder page.
- "Client" refers to a future frontend or a monitor/tool calling the JSON endpoints; no authentication is introduced (scope discipline, constitution V).
