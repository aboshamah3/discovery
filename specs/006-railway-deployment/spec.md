# Feature Specification: Railway Deployment Foundation

**Feature Branch**: `006-railway-deployment`

**Created**: 2026-07-01

**Status**: Draft

**Input**: User description: "Spec 006: Railway deployment foundation. Make the backend foundation deployable on Railway before the frontend exists — configure the Next.js app for a production standalone build, provide Railway-compatible build/start commands, run database migrations before the new version serves traffic, wire the health endpoint as the platform readiness check, and document the full environment-variable checklist plus the manual import and reindex commands operators run against production. Do not build the final frontend yet."

## Clarifications

### Session 2026-07-01

- Q: What deployment mechanism should the repo commit to? → A: Railway config-as-code (`railway.json`) driving Railway's native builder with explicit build, start, and pre-deploy commands. No Dockerfile is added this spec — keep the path Railway-native and reproducible from the committed config.
- Q: When and how do database migrations run in production? → A: As a Railway **pre-deploy** (release) command that runs the existing idempotent migration runner (`pnpm db:migrate`, Spec 002) before the new version begins serving traffic; it is safe to re-run and applies only pending migrations.
- Q: Is `/api/health` used as the platform health check? → A: Yes. `/api/health` is configured as Railway's health-check path. A deploy is considered healthy only when both dependencies (PostgreSQL and Typesense) are up (200); if either is down the endpoint returns 503 and the deploy is not promoted. This implies the Typesense service must be provisioned and reachable for a green deploy — documented explicitly.
- Q: Are catalog import and reindex part of the automated deploy pipeline? → A: No. Import and reindex remain manual, on-demand operator commands run against the production services and are documented, not wired into the deploy (script-first, no scheduled refresh — YAGNI, constitution III/V). Reason: the source feed is a one-time/occasional import, and coupling a multi-minute data load to every code deploy is fragile.
- Q: What happens when a required environment variable is missing or malformed at deploy time? → A: The deploy MUST fail loudly with an actionable message rather than start a half-configured service. The existing accessors already throw on a missing `DATABASE_URL` (`@ds/db`) or `TYPESENSE_HOST`/`TYPESENSE_API_KEY` (`@ds/search`); this spec documents the complete required set as a checklist so misconfiguration surfaces before or at first request, never silently.
- Q: Does this spec change any API contract or introduce frontend? → A: No. The three read endpoints (Spec 005) and the minimal placeholder page are unchanged; no product UI is added (frontend-last, Spec 007).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Deploy the service from the repository (Priority: P1)

An engineer connects the GitHub repository to Railway, sets the required configuration, and triggers a deploy. The platform builds the application into a self-contained production bundle and starts it with a documented command, producing a running, reachable service — with no manual, machine-specific build steps and no reliance on developer-only tooling to serve requests.

**Why this priority**: A reproducible build-and-run path is the whole point of the spec and the prerequisite for every other deployment concern. Until the platform can build and start the app from committed configuration, nothing else (migrations, health gating, operations) can be exercised in production.

**Independent Test**: Produce the production standalone build locally, start the produced server with the documented start command, and confirm it serves a route (e.g. the health endpoint) — verifiable end-to-end without any Railway account, proving the build output and start command are correct and self-contained.

**Acceptance Scenarios**:

1. **Given** a clean checkout with the required configuration present, **When** the documented build command runs, **Then** it produces a self-contained production server bundle (including the workspace packages it depends on) without error.
2. **Given** that build output, **When** the documented start command runs, **Then** the service starts and serves HTTP requests on the platform-provided port.
3. **Given** the committed platform configuration, **When** a deploy is triggered from the repository, **Then** the platform uses the committed build and start commands rather than ad-hoc, environment-specific ones.

---

### User Story 2 - Apply schema migrations before serving traffic (Priority: P1)

Before a newly built version begins handling requests, the pending database migrations are applied to the production database as a release step, so the running code never serves against a schema older than it expects. Re-running the step when there is nothing to apply is a safe no-op.

**Why this priority**: The application reads from PostgreSQL; deploying code that expects a table or column the production database does not yet have would fail at runtime. Applying migrations as a gated pre-serve step is essential for a correct first deploy and every subsequent one, and ranks alongside the deploy itself.

**Independent Test**: Point the migration runner at a fresh database and run the pre-deploy command; confirm it applies every pending migration and reports success, then run it again and confirm it applies nothing and still succeeds — verifiable locally against a throwaway database, proving idempotency and pre-serve ordering.

**Acceptance Scenarios**:

1. **Given** a production database missing some or all of the schema, **When** the pre-deploy migration step runs, **Then** all pending migrations are applied in order and the step reports success before the new version serves traffic.
2. **Given** a database already at the latest schema, **When** the pre-deploy migration step runs again, **Then** it applies nothing, reports a no-op, and exits successfully (idempotent).
3. **Given** a migration that fails, **When** the pre-deploy step runs, **Then** it fails loudly with an actionable error and the failed migration is rolled back, so a broken schema change does not silently promote.

---

### User Story 3 - Gate and observe production readiness (Priority: P2)

The platform uses the health endpoint to decide whether a freshly deployed version is ready to receive traffic, and operators/monitors use the same endpoint to observe live readiness. A version is promoted only when the service and its backing dependencies are actually reachable; a dependency outage is reflected truthfully.

**Why this priority**: Truthful readiness gating prevents promoting a version that cannot reach its database or search engine, and gives operators a live signal. It depends on the service being deployable (US1) and correctly migrated (US2), so it ranks just below them.

**Independent Test**: Configure the health path as the platform readiness check and confirm, against the local stack, that it reports ready (success) only when both dependencies are up and not-ready (unavailable) when either is down — reusing the Spec 005 health behavior, verifiable without deploying.

**Acceptance Scenarios**:

1. **Given** the deployed service with both dependencies reachable, **When** the platform probes the configured health path, **Then** it receives a success status and promotes/keeps the version serving.
2. **Given** the deployed service with a dependency unreachable, **When** the platform probes the health path, **Then** it receives an unavailable status and does not treat the version as ready.
3. **Given** any readiness probe, **When** the health endpoint responds, **Then** the body contains no secret material (no connection strings, no keys).

---

### User Story 4 - Operate the catalog in production (Priority: P2)

An operator following the repository documentation has a complete, unambiguous checklist of every environment variable the deployed services require, and the exact commands to import the product catalog into the production database and (re)build the production search index on demand — as deliberate manual operations, separate from code deploys.

**Why this priority**: A deployed-but-empty service has no products to search; operators need a reliable, discoverable way to populate and rebuild data. It is essential for a usable production environment but follows the deploy/migrate/health basics, so it ranks P2.

**Independent Test**: Review the documentation and confirm it lists every variable the app and scripts read (with purpose and a safe example) and the precise import and reindex commands with their prerequisites and expected outcomes — verifiable by cross-checking the documented set against the variables the code actually reads.

**Acceptance Scenarios**:

1. **Given** the deployment documentation, **When** an operator provisions the services, **Then** every environment variable required by the app and the scripts is listed with its purpose, and no required variable read by the code is missing from the checklist.
2. **Given** a deployed service with an empty or stale catalog, **When** the operator runs the documented import and reindex commands against production, **Then** the catalog is populated/refreshed in PostgreSQL and the search index is rebuilt from it, using the same idempotent scripts as local development.
3. **Given** a missing or malformed required variable, **When** the service builds/starts or a script runs, **Then** it fails loudly with an actionable message rather than starting or running half-configured.

---

### Edge Cases

- **Missing required configuration**: any absent required variable (database URL, search host/key) MUST cause a loud, actionable failure at build/start or first use — never a silent, half-working service.
- **Search dependency not yet provisioned**: if Typesense is unreachable, the health check MUST report not-ready and the deploy MUST NOT be promoted as healthy — a false green is unacceptable.
- **Empty catalog after first deploy**: a successful deploy with no data imported MUST still start and report health per its dependencies; search simply returns no results until the documented import + reindex are run (not an error).
- **Re-running the pre-deploy migration**: repeated runs with no pending migrations MUST be safe no-ops, never duplicating or corrupting schema.
- **Workspace-package resolution in the production bundle**: the production build MUST include the internal workspace packages the app depends on, so the started server does not fail to resolve them at runtime.
- **Secret exposure**: no committed file may contain a real secret; only placeholder examples are tracked, and the admin search key MUST remain server-side (never a browser-exposed variable).
- **Port binding**: the started server MUST bind the port the platform provides rather than a hard-coded development port.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The application MUST be buildable into a self-contained production bundle that includes the internal workspace packages it depends on, runnable without the full monorepo dev toolchain present at runtime.
- **FR-002**: The repository MUST provide a documented, platform-agnostic production **start** command that runs the built server and binds the platform-provided port.
- **FR-003**: The repository MUST commit Railway configuration-as-code that specifies the build command, the start command, the pre-deploy (migration) command, and the health-check path, so deploys are reproducible from committed config rather than console-only settings.
- **FR-004**: Database migrations MUST run as a pre-deploy (release) step using the existing idempotent migration runner, completing before the newly built version serves traffic; the step MUST be safe to re-run and MUST fail loudly (rolling back a bad migration) rather than promote a broken schema.
- **FR-005**: The deployed `/api/health` endpoint MUST be configured as the platform readiness check, and MUST report ready only when both PostgreSQL and Typesense are reachable, and not-ready (with an unavailable status) when either is down, preserving the established response shape and leaking no secrets.
- **FR-006**: The repository documentation MUST include a complete environment-variable checklist covering every variable the app and the scripts read (database, product source, search connection, admin key, batch sizes, app config), each with its purpose and a safe placeholder example; no required variable read by the code may be omitted.
- **FR-007**: The documentation MUST provide the exact commands to run the catalog **import** and search **reindex** against the production services as manual, on-demand operations, including prerequisites and expected outcomes, and MUST NOT wire them into the automated deploy pipeline.
- **FR-008**: Configuration MUST come entirely from environment variables; the repository MUST NOT commit any real secret (only placeholder examples are tracked), and the privileged search admin key MUST remain server-side only (never a browser-exposed variable).
- **FR-009**: This spec MUST NOT modify the published API contracts (health, search, product detail) and MUST NOT add any product-facing frontend beyond the existing minimal placeholder page.
- **FR-010**: The workspace quality gate (lint, type check, test) MUST remain green after the deployment configuration is added, and any new committed helper logic MUST fit the existing gate without requiring a running database or search engine.

### Key Entities *(include if data involved)*

- **Deployment configuration**: the committed description of how the platform builds, starts, migrates, and health-checks the service (build command, start command, pre-deploy command, health-check path).
- **Production build output**: the self-contained server bundle produced by the build, including the workspace packages required at runtime.
- **Environment-variable checklist**: the authoritative list of configuration keys the deployed app and scripts require, each with purpose and a safe example, kept in sync with what the code actually reads.
- **Operational commands**: the documented manual procedures — migrate (automated pre-deploy), import, and reindex (manual/on-demand) — an operator uses to prepare and maintain the production catalog.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From a clean checkout with required configuration set, the documented build command produces a self-contained production server that the documented start command runs successfully, serving the health route locally — reproducible with no Railway account required.
- **SC-002**: The committed platform configuration specifies all four of build command, start command, pre-deploy migration command, and health-check path, so a deploy is driven entirely by committed config.
- **SC-003**: The pre-deploy migration command applies all pending migrations against a fresh database and, run a second time, applies nothing and still succeeds (idempotent), with a failed migration rolling back rather than promoting.
- **SC-004**: The configured health check returns a success status only when both dependencies are reachable and an unavailable status when either is down (verified against the local stack), and no health response contains a secret.
- **SC-005**: The environment-variable checklist in the documentation matches the set of variables the code actually reads — every required variable is present with purpose and a safe example, and no real secret appears in any committed file.
- **SC-006**: An operator can follow the documented import and reindex commands to populate PostgreSQL and rebuild the Typesense index against production, using the same idempotent scripts as local development, with import and reindex absent from the automated deploy pipeline.
- **SC-007**: No published API contract changes and no product-facing frontend beyond the existing placeholder is introduced (verified by inspection).
- **SC-008**: The full workspace gate (lint, typecheck, test) passes with zero failures after the deployment configuration and any helper logic are added, with no running database or search engine required.

## Assumptions

- The technology direction is fixed upstream by `DS_PROJECT_SPEC_PLAN.md` (§2 stack, §7 API, §006 deliverables) and the constitution (v1.1.0) and is treated as a dependency, not re-decided here: **Next.js App Router** app, **pnpm** workspace monorepo, **PostgreSQL** via the direct `@ds/db` client (no ORM), **Typesense** via `@ds/search`, migrations via the committed SQL runner (`pnpm db:migrate`), and **Railway** as the deploy target.
- Specs 001–005 are complete: the app, the three read endpoints, the SQL migration runner, and the idempotent import (`import:products`) and reindex (`reindex:products`) scripts all exist and pass the gate.
- The production build uses Next.js **standalone** output so the started server is self-contained; because the app consumes internal workspace packages, the build must trace/transpile them into that output (resolved during planning/implementation).
- Railway provides `PORT` at runtime and injects service connection variables (e.g. a managed PostgreSQL `DATABASE_URL`); the started server binds `PORT`, and Typesense is provisioned as a separate Railway service whose connection variables are supplied via the checklist.
- Migrations run as a Railway pre-deploy/release command; import and reindex are deliberate manual operations run via the platform's one-off command/shell against the production services, not part of the deploy.
- "Operator" and "engineer" refer to the person deploying/maintaining the service; no authentication, scheduled refresh, or additional runtime services are introduced (scope discipline, constitution V; open questions in `DS_PROJECT_SPEC_PLAN.md` §14 deferred to later specs).
- Actually deploying to a live Railway account is out of scope for automated verification here (no account/credentials in the build environment); this spec delivers and locally verifies the reproducible configuration, build output, migration ordering, and documentation that make a Railway deploy correct.
