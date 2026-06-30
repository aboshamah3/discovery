<!--
SYNC IMPACT REPORT
Version change: (template / unratified) → 1.0.0
Rationale: Initial ratification (MAJOR baseline). First concrete constitution
derived from DS_PROJECT_SPEC_PLAN.md (§2 stack, §11 Backend Rules, §15 build order).

Principles defined:
  I.   Spec-Driven, Frontend-Last Delivery
  II.  PostgreSQL Is the Source of Truth; Search Is a Rebuildable Index
  III. Idempotent, Script-First Data Pipelines
  IV.  Contract-First, Validated Boundaries
  V.   Secrets & Scope Discipline
  VI.  Non-Negotiable Quality Gates
Added sections: Technology Constraints; Development Workflow & Quality Gates; Governance.
Removed sections: none (template placeholders fully replaced).

Templates / artifacts checked for alignment:
  ✅ .specify/templates/plan-template.md   — generic "Constitution Check" gate; compatible, no edit needed.
  ✅ .specify/templates/spec-template.md   — scope/requirements format compatible; no edit needed.
  ✅ .specify/templates/tasks-template.md  — task categories compatible; no edit needed.
  ✅ specs/001-repo-foundation/plan.md     — Constitution Check already maps to these rules.
Follow-up TODOs: none.
-->

# DS Product Discovery Constitution

## Core Principles

### I. Spec-Driven, Frontend-Last Delivery

Work MUST proceed as discrete, ordered specs (Spec Kit) and in the build order defined by
`DS_PROJECT_SPEC_PLAN.md`. No product-facing frontend (search UI, product grid, listing,
filters) may be built before the dedicated frontend spec (Spec 007); earlier specs ship only
backend, data, search, and a minimal placeholder app. Each spec MUST be an independently
testable increment, and changes MUST be small and reviewable.

**Rationale**: The product depends on a correct data + search foundation; building UI first
produces churn and hides foundational defects. Ordered, vertical increments keep every step
demoable and reviewable.

### II. PostgreSQL Is the Source of Truth; Search Is a Rebuildable Index

PostgreSQL is the single canonical store for product data. Typesense is a derived, fully
rebuildable index and MUST NOT be treated as authoritative. Any search document MUST be
reconstructable from Postgres alone, and a reindex MUST be able to recreate the index from
scratch without data loss in the source of truth.

**Rationale**: Separating system-of-record from search engine lets the index be dropped,
re-tuned, or rebuilt at will, and prevents search-only data that cannot be recovered.

### III. Idempotent, Script-First Data Pipelines

Importing the catalog and (re)building the search index MUST be done via committed scripts
(under `scripts/`), not ad-hoc one-off code. Imports MUST be idempotent (upsert by stable key)
and safe to re-run, MUST process data in bounded batches, and MUST fail loudly with actionable
errors rather than partially and silently.

**Rationale**: Repeatable, idempotent pipelines make data refreshes routine and recoverable,
and keep operational steps discoverable in the repo.

### IV. Contract-First, Validated Boundaries

Every API endpoint MUST have an explicit, documented contract, and all external/untrusted data
(the product source feed, HTTP query/body params) MUST be validated with Zod at the boundary
before use. Internal modules MUST be typed end-to-end (TypeScript strict). Response shapes,
once published, MUST remain backward compatible within a milestone unless a spec explicitly
versions them.

**Rationale**: Validated, contract-first boundaries catch bad data early, keep the frontend and
monitoring stable, and make backend changes safe.

### V. Secrets & Scope Discipline

All configuration MUST come from environment variables; no real secret or credential may be
committed (only `.env.example` with placeholders is tracked). The Typesense admin key MUST
remain server-side only and MUST NEVER be exposed to the browser (no `NEXT_PUBLIC_*` secret).
Scope is bounded: no authentication, cart, checkout, admin, payments, or multi-tenancy is
added unless a spec explicitly requires it (YAGNI).

**Rationale**: Leaked admin keys or committed secrets are catastrophic and hard to undo;
unrequested scope creep dilutes the product and the review surface.

### VI. Non-Negotiable Quality Gates

Lint, type checking, and tests MUST pass across the whole workspace before work is considered
done. Quality commands MUST cover every workspace area and automatically extend to new
packages. Critical paths (data validation, import/reindex, API contracts) MUST have tests;
exhaustive tests are not required where they add no signal, but a green baseline is mandatory.

**Rationale**: A consistently green baseline is what makes incremental, spec-by-spec delivery
trustworthy as the codebase grows.

## Technology Constraints

The ratified stack (per `DS_PROJECT_SPEC_PLAN.md` §2) is binding for this milestone and MUST
NOT be swapped without a constitution amendment:

- **Monorepo**: one pnpm workspace (`apps/*`, `packages/*`).
- **App**: Next.js (App Router) + TypeScript (strict).
- **Database**: PostgreSQL via Prisma (source of truth).
- **Search**: Typesense (rebuildable index).
- **Validation**: Zod at all untrusted boundaries.
- **Tests**: Vitest (unit/service); Playwright reserved for the frontend spec.
- **Deploy target**: Railway.

Structure MUST keep each concern in its reserved home (`apps/web`, `packages/db`,
`packages/search`, `packages/shared`, `scripts/`) so specs slot in without restructuring.

## Development Workflow & Quality Gates

- Each spec runs the full Spec Kit cycle: specify → (clarify) → plan → tasks → (analyze) →
  implement, with review gates between phases.
- Every `plan.md` MUST include a Constitution Check that evaluates the plan against these
  principles; violations MUST be resolved or explicitly justified in Complexity Tracking.
- Configuration changes MUST be reflected in `.env.example`.
- Commits SHOULD be small and scoped to a task or logical group; the workspace MUST be green
  (`lint`, `typecheck`, `test`) before a spec is marked complete.

## Governance

This constitution supersedes ad-hoc practice for this project. Amendments MUST be made by
editing `.specify/memory/constitution.md` with an updated Sync Impact Report and a semantic
version bump:

- **MAJOR**: backward-incompatible governance/principle removal or redefinition.
- **MINOR**: a new principle/section or materially expanded guidance.
- **PATCH**: clarifications, wording, or non-semantic refinements.

All plans and reviews MUST verify compliance with these principles. Added complexity or any
deviation MUST be justified in writing (in the relevant `plan.md`). Where a principle and a
later instruction conflict, the conflict MUST be resolved by amending the constitution
explicitly, not by silently ignoring the principle.

**Version**: 1.0.0 | **Ratified**: 2026-06-30 | **Last Amended**: 2026-06-30
