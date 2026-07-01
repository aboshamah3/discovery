# Feature Specification: Product Import Pipeline

**Feature Branch**: `003-import-pipeline`

**Created**: 2026-06-30

**Status**: Draft

**Input**: User description: "Spec 003: import pipeline. Build a script that fetches the product source feed, validates with the shared validation/normalization unit, upserts products into PostgreSQL, records an import-run outcome, supports batching, and is idempotent. Add fixture-based tests. No search indexing yet and no frontend."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Populate the canonical store from the source feed (Priority: P1)

A developer runs a single documented command that fetches the entire product catalog from the configured source, validates and normalizes every record, and writes the good records into the canonical product store — so that after one command the local database holds the full catalog and becomes the authoritative source for every downstream spec (search indexing, API, frontend).

**Why this priority**: Until the catalog is actually loaded, the store created in Spec 002 is empty and nothing downstream has data to read. Loading the feed into the source of truth is the irreducible purpose of this spec and the first thing that delivers value.

**Independent Test**: Point the command at a representative feed (the live source or a fixture), run it once against a freshly-migrated database, and confirm the product store afterwards contains one record per valid source item with all fields in canonical form.

**Acceptance Scenarios**:

1. **Given** a freshly-migrated, empty product store and a reachable source feed, **When** the developer runs the import command, **Then** every valid source record is written to the store and the store's product count equals the number of valid records in the feed.
2. **Given** a source feed containing a mix of valid and malformed records, **When** the import runs, **Then** valid records are written, malformed records are skipped (not written), and the run still completes successfully rather than aborting on the first bad record.
3. **Given** the import has completed, **When** the developer inspects any imported product, **Then** its stored fields match the normalized form of the corresponding source record (stable string identifier, numeric price or absent, date value or absent, tag list, and safely-absent optional fields).

---

### User Story 2 - Re-run safely without duplication (Priority: P1)

A developer re-runs the import command — on a schedule, after a failure, or to pick up source changes — and trusts that running it again never duplicates products and never corrupts the store: unchanged records are left as-is (or harmlessly rewritten), and changed records are updated in place, keyed by their stable identifier.

**Why this priority**: An import that cannot be safely re-run is operationally dangerous — every refresh would risk duplicate or conflicting rows. Idempotency is what makes the pipeline routine, recoverable, and safe to automate, and the constitution requires it (Principle III). It ranks equal-first with the initial load because a load you cannot repeat is not trustworthy.

**Independent Test**: Run the import twice against the same feed and confirm the product count is identical after both runs and no product identifier appears more than once.

**Acceptance Scenarios**:

1. **Given** the import has already populated the store, **When** the developer runs the exact same import again, **Then** the total product count is unchanged and no product is duplicated (identity is keyed by the stable identifier).
2. **Given** a product already in the store, **When** a later import carries a changed version of that same record (e.g., a new price), **Then** the existing row is updated in place and its "last updated" bookkeeping reflects the change.
3. **Given** a product already in the store, **When** a later import carries the byte-identical record, **Then** the system can recognize it as unchanged (via the stored content/source hash) and the record's identity and data remain correct with no duplication.

---

### User Story 3 - Record each run's outcome for observability (Priority: P2)

A developer (or future automated job) can see exactly what each import did — which source it read, whether it succeeded or failed, how many records were fetched, valid, invalid, and written, when it started and finished, and any error — by reading a persisted run record, so imports are auditable, debuggable, and safe to operate without watching the console.

**Why this priority**: The store for run outcomes was created in Spec 002; this spec is what actually writes to it. Observability is essential for trustworthy operation but is supporting evidence about the load rather than the load itself, so it ranks below populating and re-running.

**Independent Test**: Run an import, then read the most recent run record and confirm it reports the correct source, a terminal status, the four counts consistent with the feed, a start and finish time, and an error message only when the run failed.

**Acceptance Scenarios**:

1. **Given** an import is started, **When** it begins, **Then** a run record is created with the source reference, a start time, and a non-terminal/initial status before any records are written.
2. **Given** an import completes successfully, **When** the developer reads its run record, **Then** it shows a success status, a finish time, and counts where fetched ≥ valid + invalid and written ≤ valid, all consistent with the processed feed.
3. **Given** an import fails partway (e.g., the source is unreachable or a fatal error occurs), **When** the developer reads its run record, **Then** it shows a failure status, a finish time, and an error message describing what went wrong — the failure is visible and never silently swallowed.

---

### User Story 4 - Process the full catalog in bounded batches (Priority: P3)

A developer can import the entire ~4,000-record catalog in one run without exhausting memory or issuing one database round-trip per record, because the pipeline processes records in bounded batches of a configurable size, giving predictable resource use and clear progress.

**Why this priority**: Batching is a robustness and scalability concern. The catalog is small enough that a naive approach would likely work today, so this is the lowest-priority story — but the constitution mandates bounded batches (Principle III) and it protects the pipeline as the catalog grows.

**Independent Test**: Run the import with a small configured batch size against a feed larger than one batch and confirm all records are still imported correctly and the run completes, demonstrating multiple batches were processed.

**Acceptance Scenarios**:

1. **Given** a configured batch size smaller than the feed, **When** the import runs, **Then** all valid records are imported correctly across multiple batches and the final counts match a single-batch run of the same feed.
2. **Given** a batch size is not explicitly configured, **When** the import runs, **Then** it uses a sane documented default rather than processing everything in one unbounded operation.

---

### Edge Cases

- **Source unreachable or non-success response**: the feed host is down, times out, or returns an error/empty body — the run MUST fail loudly with an actionable error and a failure run record, not write a partial or empty catalog as if successful.
- **Source returns malformed payload**: the feed is not the expected list shape (e.g., truncated or wrong content) — the run MUST fail with a clear error rather than importing garbage.
- **Individual malformed record**: a single record violates the contract — it MUST be counted as invalid and skipped, without aborting the whole run.
- **Duplicate identifiers within one feed**: the same source identifier appears twice in a single feed — the import MUST converge to one row for that identifier (last-write-wins within the run) rather than erroring or duplicating.
- **Re-run after partial failure**: a previous run died partway — re-running MUST safely converge the store to the feed without duplicating the records the failed run already wrote.
- **Changed record**: a record's content changes between imports — the stored row MUST be updated and its content/source hash refreshed so the change is detected and reflected.
- **Empty feed**: the source legitimately returns zero records — the run MUST complete successfully with zero counts rather than treating it as an error (while an unreachable source remains an error per above).
- **Interrupted mid-batch**: the process is killed mid-run — already-written batches MUST remain valid and a subsequent re-run MUST reconcile the store without duplication.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a single committed, documented command that performs the full import: fetch the catalog from the configured source, validate/normalize each record, and write valid records to the canonical product store.
- **FR-002**: The system MUST obtain the source location from configuration (environment), not a hard-coded value, and MUST fail with an actionable error when that configuration is missing.
- **FR-003**: The system MUST validate and normalize every fetched record through the shared validation/normalization unit (from Spec 002) before any write, and MUST NOT write a record that fails validation.
- **FR-004**: The system MUST be idempotent: re-running the import MUST NOT create duplicate products. Records MUST be written keyed by the stable product identifier so a repeat run updates existing rows in place rather than inserting duplicates.
- **FR-005**: The system MUST detect changed versus unchanged records using a stored content/source hash, so that re-imports correctly update changed records and can recognize unchanged ones.
- **FR-006**: The system MUST process records in bounded batches of a configurable size with a sane documented default, never loading or writing the entire catalog in a single unbounded operation.
- **FR-007**: The system MUST tolerate individual invalid records by counting and skipping them while continuing the run, and MUST NOT let one malformed record abort the import of the remaining valid records.
- **FR-008**: The system MUST record an import-run outcome for every run, capturing the source reference, a status that distinguishes success from failure, counts for fetched / valid / invalid / written records, a start time, a finish time, and an error message when the run fails.
- **FR-009**: The system MUST fail loudly and visibly on fatal conditions (source unreachable, non-success response, malformed payload, or unexpected write error), surfacing a non-zero/failed outcome and a descriptive error rather than completing silently or partially as if successful.
- **FR-010**: The system MUST emit clear human-readable progress and summary output (at minimum the final counts and status) so an operator can see what the run did from the console.
- **FR-011**: The import logic MUST be covered by automated tests using fixture data that exercise: a successful import of valid records, a feed mixing valid and invalid records (counts and skipping), idempotent re-run (no duplication), update of a changed record, and the run-record outcome for both success and failure.
- **FR-012**: The system MUST NOT build or populate any search index in this spec, and MUST NOT add any product-facing frontend. Its output is confined to the canonical store and the run-outcome record.
- **FR-013**: The system MUST treat the canonical store as the source of truth: after a successful import the store alone MUST hold the complete, authoritative catalog with no dependency on the search index or any other derived store.

### Key Entities *(include if data involved)*

- **Source feed**: the untrusted external catalog the import fetches — a list of raw records in the source shape defined in Spec 002. Read-only input; never stored as-is.
- **Product (canonical record)**: the authoritative stored item written/updated by the import, keyed by its stable string identifier and carrying a content/source hash plus import/created/updated bookkeeping (defined in Spec 002).
- **Import run**: the observability record the pipeline writes describing one execution — source reference, status, counts (fetched/valid/invalid/written), start/finish timing, and an optional error message (store defined in Spec 002; this spec populates it).
- **Batch**: a bounded group of records processed together; an internal unit of work that bounds memory and database round-trips, sized by configuration.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Running the import command once against the full ~4,000-record feed loads 100% of the valid records into the product store (store count equals the feed's valid-record count), with the run reported as successful.
- **SC-002**: Running the import twice in a row against the same feed leaves the product count identical after both runs and produces zero duplicate identifiers (idempotency verified by count and uniqueness).
- **SC-003**: When a record's content changes between two imports, the second import updates exactly that product in place (its data and "last updated" bookkeeping change) while leaving all other products and the total count unaffected.
- **SC-004**: For a feed mixing valid and malformed records, 100% of valid records are written, 100% of malformed records are skipped and counted as invalid, and the run still completes successfully; the recorded counts satisfy fetched ≥ valid + invalid and written ≤ valid.
- **SC-005**: Every run produces a persisted run record with a terminal status; failed runs (e.g., unreachable source) record a failure status and a non-empty error message 100% of the time, and never report success.
- **SC-006**: The full catalog imports in bounded batches — verified by running with a batch size smaller than the feed and confirming the same final result as an unbatched run — with no single operation processing the entire catalog at once.
- **SC-007**: Automated fixture-based tests cover successful import, mixed valid/invalid counting and skipping, idempotent re-run, changed-record update, and run-record outcome for success and failure; the full workspace test run (lint, typecheck, test) passes with zero failures.
- **SC-008**: No search index is created or populated and no product-facing UI is introduced by this spec (verified by inspection).

## Assumptions

- The technology direction is fixed upstream by `DS_PROJECT_SPEC_PLAN.md` and the constitution (v1.1.0) and is treated as a dependency, not re-decided here: PostgreSQL is the source of truth accessed directly via a lightweight client with **no ORM**; validation/normalization is the Zod-based unit delivered in Spec 002; tests use Vitest. Concrete tools belong to the implementation plan, so the requirements above stay technology-agnostic.
- Spec 002 is complete and provides: the `products` and `import_runs` stores (created idempotently by the documented migration command), and a shared validation/normalization unit that turns a raw source record into a store-ready record or a field-level rejection. This spec consumes those and does not redefine them.
- The source feed shape and the `PRODUCTS_SOURCE_URL` location match `DS_PROJECT_SPEC_PLAN.md` (§1.2, §4); the feed is the ~4,000-record hiring catalog and is fetched over HTTP at run time.
- Idempotency is keyed on the stable product identifier (the primary identity from Spec 002); change detection uses the stored content/source hash.
- The batch size is configurable via environment (`IMPORT_BATCH_SIZE` per `DS_PROJECT_SPEC_PLAN.md` §4) with a sane default when unset.
- "Last-write-wins" is the chosen resolution for duplicate identifiers within a single feed.
- Search indexing (Spec 004), API contracts (Spec 005), deployment (Spec 006), and the frontend (Spec 007) are explicitly out of scope.
- "Developer" refers to an engineer with the project's standard tooling (a container runtime for local PostgreSQL and the chosen package manager) already installed, with the database migrated before importing.
