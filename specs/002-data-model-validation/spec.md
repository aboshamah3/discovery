# Feature Specification: Data Model + Validation

**Feature Branch**: `002-data-model-validation`

**Created**: 2026-06-30

**Status**: Draft

**Input**: User description: "Spec 002: data model and validation. Define Product and ImportRun as PostgreSQL tables (no ORM), SQL migrations, Zod validation for the source product JSON, normalization utilities into DB-safe records, and unit tests. PostgreSQL is the source of truth. No search indexing or frontend."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Establish the canonical product store (Priority: P1)

A developer initializes the project's database and obtains a product store whose columns hold every field of the product catalog, so later specs (import, search indexing, API) have one authoritative place to read and write products from.

**Why this priority**: Nothing downstream — import, reindex, or API — can persist or read product data until a canonical store with the right shape exists. It is the irreducible data foundation of the whole backend.

**Independent Test**: Run the documented schema-creation command against a fresh local database and confirm a product store exists with the full set of catalog fields plus bookkeeping fields, with the correct identity and uniqueness rules. Delivers value as a ready-to-fill store even before any product is imported.

**Acceptance Scenarios**:

1. **Given** a fresh, empty database, **When** the developer runs the documented schema-creation command, **Then** a product store is created containing every catalog field and the supporting bookkeeping fields.
2. **Given** the schema has already been created, **When** the developer runs the schema-creation command again, **Then** it completes without error and without losing or duplicating existing data.
3. **Given** the product store exists, **When** two records are written with the same product identifier, **Then** the store rejects the duplicate identity (identifiers are unique).

---

### User Story 2 - Validate and normalize raw catalog records (Priority: P1)

A developer passes raw records from the product source through a validation-and-normalization step that accepts well-formed records, converts their messy values into clean store-ready records, and rejects malformed records with clear, field-level errors — so only consistent, trustworthy data ever reaches the canonical store.

**Why this priority**: The source feed is untrusted and inconsistent (numeric identifiers, prices written as numbers, formatted strings, or absent values, and several optional fields frequently missing). Without a validating, normalizing boundary, bad or inconsistent data would corrupt the store and every system built on it. This is the core deliverable of the spec.

**Independent Test**: Feed a representative set of source records — valid ones, records missing optional fields, and deliberately malformed ones — through the validation-and-normalization step and confirm valid records produce correct store-ready records, optional gaps are preserved safely, and malformed records are rejected with messages naming the offending field.

**Acceptance Scenarios**:

1. **Given** a well-formed raw record, **When** it is validated and normalized, **Then** it produces a store-ready record with a stable string identifier, a numeric price, a date value, a list of tags, and all other fields in their canonical form.
2. **Given** a raw record whose price is written as a formatted string with a thousands separator (e.g., `"1,081.43"`), **When** it is normalized, **Then** the price becomes the equivalent numeric value (`1081.43`).
3. **Given** a raw record that is missing optional fields (such as brand, rating, image, or description), **When** it is normalized, **Then** normalization succeeds and the missing fields are preserved as empty/absent rather than causing a failure.
4. **Given** a raw record that violates the contract (e.g., missing a required field or a required field of the wrong type), **When** it is validated, **Then** it is rejected and the resulting error identifies which field failed and why, and no store-ready record is produced.
5. **Given** the same raw record is normalized twice, **When** the two results are compared, **Then** they are identical, including the product identifier (deterministic, stable normalization).

---

### User Story 3 - Record import-run outcomes for observability (Priority: P2)

A developer has a place to record the outcome of each catalog import — its source, status, how many records were fetched, valid, invalid, and written, plus timing and any error — so future imports are debuggable, auditable, and safe to re-run.

**Why this priority**: Import safety and idempotency (delivered in a later spec) depend on being able to see what each run did. The store for these run records belongs to the data model, but it is supporting observability rather than the core product data, so it ranks below the product store and the validation boundary.

**Independent Test**: After schema creation, confirm an import-run store exists that can hold a source reference, a status, counts for fetched/valid/invalid/written records, start and finish timing, and an optional error message.

**Acceptance Scenarios**:

1. **Given** the schema-creation command has run, **When** the developer inspects the database, **Then** an import-run store exists with fields for source, status, the four record counts, start/finish timing, and an optional error message.
2. **Given** an import-run record is created, **When** it is first written, **Then** it has a unique identifier and a start time, with counts defaulting to zero and finish time unset until the run completes.

---

### Edge Cases

- **Numeric source identifier**: the source provides identifiers as numbers; the store and store-ready records MUST use a stable string identifier so identity is consistent and never re-typed.
- **Price expressed three ways**: source price may be a number, a formatted string with separators (`"1,081.43"`), or absent (null). Each MUST resolve deterministically to a numeric value or to "absent".
- **Frequently-missing optional fields**: brand, rating, image dimensions, and description are absent in a meaningful fraction of records; these MUST normalize to empty/absent without error.
- **Date-only timestamps**: release dates arrive as date-only strings (`YYYY-MM-DD`); these MUST be interpreted deterministically (UTC) into a date value, and an unparseable/absent date MUST resolve to "absent" rather than crash.
- **Empty or whitespace-only optional text**: optional text fields that are empty or whitespace MUST be treated as absent rather than stored as blank noise.
- **Out-of-contract values**: a present value that violates the contract (e.g., a negative price or a required field of the wrong type) MUST cause the record to be rejected with a descriptive error, not silently coerced.
- **Re-running schema creation**: applying the schema to an already-initialized database MUST be safe (no error, no data loss).
- **Empty tag list**: a record with no tags MUST normalize to an empty list, not a failure.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a canonical product store that holds every catalog field — identifier, title, brand, category, tags, price, rating, reviews, in-stock flag, release date, image reference, image width, image height, and description — plus bookkeeping fields (a content/source hash and import/created/updated timestamps).
- **FR-002**: Each product MUST be identified by a stable, unique string identifier derived deterministically from the source identifier, unchanged across repeated imports of the same record.
- **FR-003**: The product store and the import-run store MUST be creatable via a single documented command, and that command MUST be safe to re-run against an already-initialized database (idempotent, no data loss).
- **FR-004**: The system MUST validate every raw source record against an explicit contract before it is accepted, and MUST reject any record that violates the contract with a clear, field-level error stating which field failed and why.
- **FR-005**: The system MUST handle missing or absent optional fields safely, normalizing them to empty/absent without error.
- **FR-006**: The system MUST deterministically normalize messy source values into canonical store-ready values — at minimum: numeric identifier → stable string identifier; price given as a number, a separator-formatted string, or absent → numeric value or absent; date-only release string → date value (UTC); empty/whitespace optional text → absent.
- **FR-007**: The system MUST represent tags as a list of text values, allowing an empty list.
- **FR-008**: The system MUST default the in-stock flag to "false" when it is absent from a source record.
- **FR-009**: The system MUST provide an import-run record capturing the source reference, a status, counts for fetched / valid / invalid / written records, start and finish timing, and an optional error message.
- **FR-010**: Validation and normalization MUST be covered by automated unit tests exercising well-formed records, records missing optional fields, malformed records (field-level rejection), and the documented value-coercion edge cases.
- **FR-011**: The system MUST NOT build any search index in this spec, and MUST NOT add any product-facing frontend.
- **FR-012**: Numeric fields that are present (price, rating, reviews, image dimensions) MUST be required to fall within sane bounds (non-negative); a present value outside those bounds MUST cause the record to be rejected with a descriptive error rather than be silently stored.

### Key Entities *(include if feature involves data)*

- **Product (canonical record)**: the authoritative representation of a catalog item, stored as the source of truth. Holds all catalog fields plus bookkeeping (content/source hash, import/created/updated timestamps). Identified by a stable, unique string identifier.
- **Raw product record (source shape)**: the untrusted, inconsistent shape of an item as delivered by the product source feed — numeric identifier, price as number/formatted-string/absent, several frequently-absent optional fields, and date-only release strings. Exists only at the validation boundary; never stored as-is.
- **Normalized product (store-ready record)**: the clean, canonical in-memory shape produced from a valid raw record — stable string identifier, numeric price or absent, date value or absent, list of tags, and safely-absent optional fields. This is what later specs write to the product store and index into search.
- **Import run**: an observability record describing one execution of the catalog import — source reference, status, counts (fetched/valid/invalid/written), start/finish timing, and an optional error message.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Running the documented schema-creation command against a fresh database produces both the product store and the import-run store, containing 100% of the fields enumerated in the requirements (verified by inspection of the resulting schema).
- **SC-002**: Across a representative sample drawn from the ~4,000-record source feed, 100% of records that meet the contract normalize without error, and 100% of deliberately malformed records are rejected with an error that names the offending field.
- **SC-003**: Re-running the schema-creation command on an already-initialized database completes successfully with no error and no loss or duplication of existing data.
- **SC-004**: Normalizing the same source record twice yields an identical store-ready record — including an identical identifier — 100% of the time.
- **SC-005**: Records containing any combination of missing optional fields normalize successfully (0 failures attributable to absent optional fields) and preserve absence rather than storing blank values.
- **SC-006**: Automated tests cover validation success, field-level validation failure, and each documented normalization edge case (numeric→string identifier; number / formatted-string / absent price; date-only release date; empty tag list; whitespace optional text), and the full workspace test run passes with zero failures.
- **SC-007**: No search index and no product-facing UI are introduced by this spec (verified by inspection).

## Assumptions

- The technology direction is fixed upstream by `DS_PROJECT_SPEC_PLAN.md` and the project constitution, and is treated as a dependency rather than re-decided here: a PostgreSQL store as the source of truth, validation with Zod at the boundary, and Vitest for unit tests. Per the constitution (v1.1.0), the database is accessed **directly via a lightweight client/driver with no ORM**; concrete tools belong to the implementation plan, so the requirements above stay technology-agnostic.
- The source feed's shape matches `DS_PROJECT_SPEC_PLAN.md` §1.2 and was confirmed by inspecting the live feed: identifiers are numeric and unique; price appears as a number, a thousands-separator string (e.g., `"1,081.43"`), or null; rating, image, image width, image height, and description are frequently null; release dates are date-only (`YYYY-MM-DD`); tags are non-empty string arrays in the sample but an empty list is treated as valid.
- Currency precision for price is two decimal places.
- Dates are stored and compared in UTC; date-only inputs are interpreted at UTC midnight.
- Actually fetching the catalog over the network and upserting it in batches is **out of scope** and handled by Spec 003 (Import Pipeline); this spec delivers the schema and the validation/normalization unit that the import will consume.
- Search indexing (Spec 004), API contracts (Spec 005), deployment (Spec 006), and the frontend (Spec 007) are explicitly out of scope.
- "Developer" refers to an engineer with the project's standard tooling (a container runtime and the chosen package manager) already installed.
