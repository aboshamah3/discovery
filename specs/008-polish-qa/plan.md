# Implementation Plan: Polish, Performance, and QA

**Spec**: [`spec.md`](./spec.md) · **Status**: Draft → Implementing

## Approach

Frontend-only polish plus documentation. Keep Metronic as the base and adapt only the components
already adopted in Spec 007 — no new UI. Prune the copied UI kit to files with real importers.
Finish the README and add a final release/QA checklist. No backend/API change.

## Work items

1. **Prune the adopted UI kit (US2, FR-003).**
   - Audit `apps/web/src/components/ui/*` importers. `button.tsx` has zero importers (Add-to-Cart
     was stripped) → remove it. Keep `toggle.tsx` (required by `toggle-group`). All others are used.

2. **Accessibility (US1, FR-001/FR-002)** — edit existing components only:
   - `search-results.tsx`: visually-hidden `<label>` for the search input; `aria-label` on the sort
     `SelectTrigger`; wrap results in a `role="region"` labelled container with `aria-busy` during
     fetches; keep the existing `aria-live="polite"` count.
   - `layout.tsx`: mark the wordmark header with an accessible label (banner landmark already via
     `<header>`).

3. **States & layout shift (US3, FR-004/FR-005)** — verify (no code change expected):
   - Skeleton/empty/error states already present and distinct.
   - Image containers already reserve fixed dimensions (`h-[180px]`, `h-[70px] w-[90px]`), so the
     placeholder fallback fills reserved space — no CLS. Confirm and document.

4. **Documentation (US4, FR-006/FR-007)** — `README.md`:
   - Add a **Frontend — Product Discovery (Spec 007)** section: what it is, dev command, that it
     needs the search API (hence Postgres + Typesense + import + reindex), and the UX (as-you-type,
     grid/list, sort, infinite scroll, quick-view).
   - Add a **Performance & accessibility** note: expectations (instant-feel search on ~4k catalog,
     debounce, server-side ranking, no reload, no CLS) and the manual verification procedure
     (Lighthouse + response-time), explicitly not CI-gated.
   - Add a **Release checklist** consolidating QA + deployment steps.

## Verification

`pnpm typecheck`, `pnpm lint`, `pnpm test` green; `next build` compiles (with `DS_NO_STANDALONE=1`
locally on Windows). Accessibility spot-checked via the built markup / a11y attributes.

## Non-goals

No new UI, no backend change, no automated Lighthouse gate.
