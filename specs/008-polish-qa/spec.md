# Feature Specification: Polish, Performance, and QA

**Feature Branch**: `008-polish-qa`

**Created**: 2026-07-01

**Status**: Implemented

**Input**: User description: "Final hardening after the frontend exists. Keep Metronic as the
frontend base and only adapt existing Metronic components — no net-new frontend code. Prune the
adopted UI kit to the files actually used (don't carry the whole Metronic library). Improve
accessibility, confirm image fallback and no layout shift, verify empty/error states are clear,
document search/API performance expectations, and finish the README (local setup, import, reindex,
deploy, frontend usage) plus a final deployment/QA checklist."

## Clarifications

### Session 2026-07-01

- Q: Any new frontend code? → A: **No.** Only adapt the already-adopted Metronic components
  (accessibility attributes, state clarity). No new UI is designed.
- Q: How lean should the adopted UI kit be? → A: **Only the files actually imported.** Unused
  copied primitives are removed (e.g. `button.tsx`, which has no importer after Add-to-Cart was
  stripped). The app must still build and pass gates after pruning.
- Q: Can Lighthouse / real load tests run in this environment? → A: **Not automatically** (they need
  a live Postgres + Typesense + browser). This spec documents the performance expectations and the
  manual verification procedure; it does not gate CI on a Lighthouse score.
- Q: Does this spec change any API contract or backend behavior? → A: **No.** Frontend-only
  polish plus documentation. Backend contracts (Spec 005) are unchanged.
- Q: What "done" looks like for docs? → A: README explains local setup, import, reindex, deploy,
  and **frontend usage**, and carries an accurate final release/QA checklist.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Accessible discovery for keyboard and screen-reader users (Priority: P1)

A visitor using a keyboard and/or screen reader can search, change sort, switch grid/list, scroll
results, and open a product quick-view — with labelled controls, announced result counts, and a
busy state while loading.

**Why this priority**: Accessibility is the primary polish deliverable now that the UI exists; it
must not depend on future work.

**Independent Test**: Tab through the page and inspect the accessibility tree: the search box has a
name, the sort control has a name, the results region announces updates (`aria-live`) and marks
itself busy while fetching, and the quick-view modal has an accessible title and focus handling.

**Acceptance Scenarios**:

1. **Given** the page, **When** a screen reader focuses the search box, **Then** it announces a
   clear name (not just a placeholder).
2. **Given** a search completes, **When** results change, **Then** the result-count region is
   announced politely.
3. **Given** a fetch is in progress, **When** results are loading, **Then** the results region is
   marked busy.
4. **Given** the sort and grid/list controls, **When** focused, **Then** each exposes an accessible
   name.

### User Story 2 - A lean, buildable frontend base (Priority: P1)

The adopted Metronic slice contains only the files the app actually uses; removing the unused ones
leaves the app building and all gates green.

**Why this priority**: The instruction is explicit — carry necessary files only — and a lean base
is easier to maintain and reason about.

**Independent Test**: Grep the app for imports of each copied UI primitive; any primitive with zero
importers is removed; then `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `next build` all pass.

**Acceptance Scenarios**:

1. **Given** the adopted `components/ui/*`, **When** usage is audited, **Then** files with no
   importer are removed.
2. **Given** the pruned tree, **When** gates run, **Then** typecheck, lint, tests, and build pass.

### User Story 3 - Trustworthy states and no layout shift (Priority: P2)

Results show clear loading (skeleton), empty, and error states, and images never cause visible
layout shift or leave broken/empty boxes.

**Acceptance Scenarios**:

1. **Given** a query with no matches, **When** results return empty, **Then** a clear empty state
   shows.
2. **Given** a failed search, **When** the request errors, **Then** a clear error state shows and
   the page stays usable.
3. **Given** a missing or broken image, **When** a card renders, **Then** a placeholder fills the
   reserved space with no collapse or shift.

### User Story 4 - Complete operator/developer documentation (Priority: P2)

A newcomer can read the README and run the whole flow — local setup → import → reindex → dev →
frontend usage → deploy — and follow a final release/QA checklist.

**Acceptance Scenarios**:

1. **Given** the README, **When** a developer follows it, **Then** they can set up locally, load the
   catalog, run the app, and use the discovery page.
2. **Given** the README, **When** preparing a release, **Then** a final QA + deployment checklist is
   present and accurate.

### Edge Cases

- Pruning a file that is transitively required (e.g. `toggle` behind `toggle-group`) MUST NOT break
  the build — only genuinely unused files are removed.
- Documented performance expectations must be honest about what is and isn't automatically verified.

## Requirements *(mandatory)*

- **FR-001**: Adapt existing Metronic-based components to expose accessible names for the search
  input, sort control, and view toggle; no new components.
- **FR-002**: Announce result-count changes politely and mark the results region busy during fetches.
- **FR-003**: Remove adopted UI-kit files with zero importers; keep transitively required files.
- **FR-004**: Loading (skeleton), empty, and error states MUST remain present and clearly distinct.
- **FR-005**: Images MUST reserve fixed space and fall back to a placeholder (no layout shift, no
  broken/empty boxes).
- **FR-006**: The README MUST document local setup, import, reindex, deploy, and **frontend usage**,
  plus a final release/QA checklist.
- **FR-007**: Document search/API performance expectations and the manual verification procedure
  (Lighthouse / response-time), without gating CI on them.
- **FR-008**: No backend/API contract changes; `pnpm lint`, `pnpm typecheck`, `pnpm test` stay green
  and `next build` compiles.

## Out of Scope

New UI features or layouts, faceted filters, URL state sync, automated Lighthouse/perf CI, and any
backend/API change.
