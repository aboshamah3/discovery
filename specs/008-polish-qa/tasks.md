# Tasks: Polish, Performance, and QA

**Spec**: [`spec.md`](./spec.md) · **Plan**: [`plan.md`](./plan.md)

## Phase 1 — Lean the adopted base

- [x] T001 Audit `components/ui/*` importers; remove `button.tsx` (zero importers). (US2)

## Phase 2 — Accessibility (adapt existing components only)

- [x] T002 `search-results.tsx`: visually-hidden label for the search input; `aria-label` on the
      sort trigger; results `role="region"` + `aria-busy` during fetches. (US1)
- [x] T003 `layout.tsx`: accessible label on the wordmark banner. (US1)

## Phase 3 — Verify states & layout shift

- [x] T004 Confirm skeleton/empty/error states are present and distinct; confirm image containers
      reserve fixed space (no CLS). (US3)

## Phase 4 — Documentation

- [x] T005 README: add **Frontend — Product Discovery (Spec 007)** usage section. (US4)
- [x] T006 README: add **Performance & accessibility** expectations + manual verification. (US4)
- [x] T007 README: add a final **Release checklist** (QA + deployment). (US4)

## Phase 5 — Gates

- [x] T008 `pnpm typecheck` green.
- [x] T009 `pnpm lint` green.
- [x] T010 `pnpm test` green.
- [x] T011 `next build` compiles.
