# Feature Specification: Typesense Search Foundation

**Feature Branch**: `004-search-foundation`

**Created**: 2026-06-30

**Status**: Draft

**Input**: User description: "Spec 004: search foundation. Build a server-side search client, a product collection schema, an idempotent collection-ensure helper, a reindex script that rebuilds the search index from PostgreSQL in batches, a search query builder supporting typo tolerance, prefix matching, ranking, pagination and filters, and a smoke search script, with unit tests where practical. Search is a rebuildable index derived from PostgreSQL. No API route and no frontend yet."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Establish the search collection (Priority: P1)

A developer runs a documented step that ensures the search index has a product collection whose shape can hold every searchable, filterable, and sortable product field — so the catalog has a well-defined place to be indexed into. Running it again when the collection already exists is safe.

**Why this priority**: Nothing can be indexed or searched until a collection with the right field definitions exists. It is the irreducible foundation of the search layer.

**Independent Test**: Against a fresh local search engine, run the ensure step and confirm a product collection exists with fields for full-text search (title, brand, category, tags, description), filtering/faceting (brand, category, tags, in-stock), and sorting (price, rating, reviews, release time); run it again and confirm no error and no data loss.

**Acceptance Scenarios**:

1. **Given** a search engine with no product collection, **When** the ensure step runs, **Then** a product collection is created with the documented searchable/filterable/sortable fields.
2. **Given** the product collection already exists, **When** the ensure step runs again, **Then** it completes without error and without dropping existing indexed documents.

---

### User Story 2 - Rebuild the index from the canonical store (Priority: P1)

A developer runs a single documented command that reads every product from PostgreSQL (the source of truth), converts each into a search document, and loads them into the search collection in bounded batches — so the index reflects the canonical catalog and can be recreated from scratch at any time.

**Why this priority**: The collection is empty until populated, and the whole point of the search layer is to make the canonical catalog searchable. Because the index is derived and rebuildable, this reindex is the operation that gives search its data and must be repeatable.

**Independent Test**: After importing the catalog (Spec 003), run the reindex command and confirm the search collection's document count equals the product count in PostgreSQL; drop the collection and re-run, confirming the index is fully reconstructed with no loss in PostgreSQL.

**Acceptance Scenarios**:

1. **Given** PostgreSQL holds the imported catalog and the collection exists, **When** the reindex command runs, **Then** the collection ends up with one search document per product, every field derived solely from PostgreSQL.
2. **Given** the index has been reindexed once, **When** the reindex command is run again, **Then** the collection converges to one document per product with no duplicates and no change to PostgreSQL.
3. **Given** the catalog has ~4,000 products, **When** the reindex runs, **Then** documents are loaded in bounded batches rather than one unbounded operation, and the command reports how many were indexed.
4. **Given** the search index is dropped entirely, **When** the reindex command runs, **Then** the index is fully rebuilt from PostgreSQL alone (search holds no data that PostgreSQL cannot reproduce).

---

### User Story 3 - Search products with relevance and filters (Priority: P1)

A developer can turn a user's query plus optional filters, sort, and page request into a well-formed search request that returns relevant products — tolerant of typos, matching on prefixes as the user types, case-insensitive, ranked by relevance and then quality signals, paginated with a sane default and a hard cap, and narrowable by brand, category, tag, and stock — so later specs (the API, then the UI) have one correct way to query the index.

**Why this priority**: A populated collection is only useful if it can be queried well. The query-building behavior is the search capability the product is named for, and it is the contract every later layer depends on.

**Independent Test**: Build search requests for representative inputs and confirm the resulting request expresses typo tolerance, prefix matching, the documented field weighting and ranking, the default and capped page size, and the correct filter expression for each supplied filter — verifiable without a running engine by inspecting the built request, and end-to-end via the smoke search.

**Acceptance Scenarios**:

1. **Given** a non-empty query, **When** a search request is built, **Then** it searches the human-readable fields with the documented relative weights, enables typo tolerance and prefix matching, and ranks by relevance then rating then reviews.
2. **Given** an empty or missing query, **When** a search request is built, **Then** it returns a stable, non-random result ordering (e.g. highest-rated/most-reviewed) rather than arbitrary results.
3. **Given** a requested page size below the minimum, above the cap, or absent, **When** a search request is built, **Then** the effective page size is clamped to the allowed range with the documented default applied when absent.
4. **Given** any combination of brand, category, tag, and in-stock filters, **When** a search request is built, **Then** the request includes exactly the corresponding filter constraints (and none when no filter is supplied).
5. **Given** a requested page number, **When** a search request is built, **Then** pagination reflects that page with the effective page size.

---

### Edge Cases

- **Re-running ensure**: applying the collection-ensure step to an already-initialized index MUST be safe (no error, no loss of indexed documents).
- **Re-running reindex**: a second reindex MUST converge to one document per product without duplicates; a partial/failed reindex MUST be recoverable by simply re-running.
- **Dropped index**: with the collection deleted, reindex MUST rebuild it entirely from PostgreSQL (the index is never the source of truth).
- **Missing optional fields**: products with absent brand, rating, image, description, or release date MUST index without error, with those fields simply absent from the document.
- **Release date to sortable value**: products carry a release timestamp; it MUST be converted deterministically into a numeric sortable value, and an absent date MUST not break indexing.
- **Empty query**: MUST yield a stable ordering, never arbitrary/random results.
- **Out-of-range page size**: requested sizes below 1 or above the cap MUST be clamped, never passed through unbounded.
- **Special characters in filter values**: filter values (e.g. a brand containing punctuation) MUST be expressed so they match the intended value rather than breaking the request.
- **Admin credential exposure**: the privileged search credential MUST stay server-side and MUST NOT be embedded in any browser-exposed output.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST define a product search collection whose fields cover full-text search (title, brand, category, tags, description), filtering/faceting (brand, category, tags, in-stock), and sorting (price, rating, reviews, release timestamp), with a stable identifier per document.
- **FR-002**: The system MUST provide an idempotent step that ensures the collection exists, safe to run whether or not the collection is already present, without losing indexed documents on a no-op run.
- **FR-003**: The system MUST provide a single documented command that rebuilds the index by reading all products from PostgreSQL, converting each into a search document, and loading them into the collection.
- **FR-004**: The reindex MUST be repeatable and idempotent — re-running converges to exactly one document per product with no duplicates — and MUST be able to fully reconstruct the index from PostgreSQL alone after the collection is dropped.
- **FR-005**: The reindex MUST process documents in bounded batches of a configurable size (with a sane default) and MUST report the number of products read and documents indexed.
- **FR-006**: Every search document MUST be derived solely from PostgreSQL data; the search index MUST hold no field that cannot be reconstructed from the canonical store (search is a rebuildable index, never the source of truth).
- **FR-007**: The system MUST deterministically convert each product's release date into a numeric sortable value, and MUST index products with missing optional fields without error (absent fields simply omitted).
- **FR-008**: The system MUST provide a search-request builder that, given a query and optional page, page-size, sort, and filters, produces a well-formed search request supporting typo tolerance, prefix matching, case-insensitive matching, and relevance ranking augmented by rating and reviews.
- **FR-009**: The search-request builder MUST apply a documented default page size and clamp any requested page size to an allowed range (minimum and a hard maximum cap), and MUST paginate by the requested page.
- **FR-010**: The search-request builder MUST translate supplied brand, category, tag, and in-stock filters into the corresponding filter constraints, and MUST add no filter constraint when none is supplied.
- **FR-011**: For an empty or missing query, the system MUST return a stable, non-random ordering (e.g. by rating/reviews) rather than arbitrary results.
- **FR-012**: The privileged (admin) search credential MUST be read from server-side configuration only and MUST NEVER be exposed to the browser or embedded in any client-facing output.
- **FR-013**: The system MUST provide a smoke step that performs a representative search after ensure + reindex and surfaces whether expected results are returned, for manual end-to-end verification.
- **FR-014**: The pure, engine-independent logic — the document conversion and the search-request building — MUST be covered by automated unit tests; engine-dependent steps (ensure, reindex, smoke) are verified via the documented runnable guide.
- **FR-015**: The system MUST NOT add any product-facing API route or frontend in this spec; its surface is the search package plus the reindex and smoke commands.

### Key Entities *(include if data involved)*

- **Search collection**: the index definition holding the product documents, with fields typed for search, faceting/filtering, and sorting.
- **Search document**: the derived, index-ready representation of one product — identifier, searchable text fields, filterable/facetable fields, and numeric sortable values (including a release timestamp). Reconstructable entirely from a PostgreSQL product row.
- **Search request**: the engine-independent description of a query — text, page, page size, sort, and filters — translated into the concrete search call.
- **Reindex run**: one execution that reads products from PostgreSQL and loads documents into the collection in batches, reporting counts.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Running the ensure step against a fresh local engine produces a product collection containing 100% of the documented searchable/filterable/sortable fields (verified by inspecting the collection definition); a second run completes with no error and no document loss.
- **SC-002**: After importing the catalog and reindexing, the collection's document count equals the PostgreSQL product count (100% of products indexed).
- **SC-003**: Dropping the collection and re-running ensure + reindex reconstructs the full index from PostgreSQL alone, with the same final document count and no change to PostgreSQL.
- **SC-004**: Re-running reindex leaves exactly one document per product (zero duplicates) and the count unchanged.
- **SC-005**: The reindex loads documents in bounded batches — verified by running with a batch size smaller than the catalog and observing the same final document count — and reports products-read and documents-indexed counts.
- **SC-006**: For a representative set of inputs, 100% of built search requests express typo tolerance, prefix matching, the documented field weighting and ranking, an effective page size within the allowed range (default applied when absent, clamped when out of range), and exactly the filter constraints implied by the supplied filters.
- **SC-007**: A smoke search for a known product term returns that product among the top results after ensure + reindex.
- **SC-008**: Automated tests cover document conversion (including release-date-to-timestamp and missing optional fields) and search-request building (query/empty-query, weighting/ranking, page-size clamping, each filter); the full workspace gate (lint, typecheck, test) passes with zero failures.
- **SC-009**: No product-facing API route and no frontend are introduced by this spec, and the admin search credential never appears in any client-facing output (verified by inspection).

## Assumptions

- The technology direction is fixed upstream by `DS_PROJECT_SPEC_PLAN.md` and the constitution (v1.1.0) and is treated as a dependency, not re-decided here: **Typesense** is the rebuildable search engine, PostgreSQL remains the source of truth, and tests use Vitest. Concrete tools belong to the implementation plan, so the requirements above stay technology-agnostic.
- Specs 002 and 003 are complete: PostgreSQL holds the canonical `products` catalog (imported and idempotent), and the shared normalized product shape is available. This spec reads from that store and indexes into search.
- The collection name, field set, query weighting/typo/ranking defaults, and the default (24) and maximum (60) page sizes follow `DS_PROJECT_SPEC_PLAN.md` §6; the search engine connection and the privileged/admin credential come from environment configuration (§4).
- The reindex batch size is configurable via environment (`REINDEX_BATCH_SIZE`) with a sane default when unset.
- For correctness with the chosen default sort signal, the reviews count is always present on a document (absent → 0) so ordering is stable; other optional fields may be absent.
- The API contracts (Spec 005), deployment (Spec 006), and the frontend (Spec 007) are explicitly out of scope; this spec stops at the search package plus reindex and smoke commands.
- "Developer" refers to an engineer with the project's standard tooling (a container runtime for local PostgreSQL + search engine, and the chosen package manager) already installed.
