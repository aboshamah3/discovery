# Tasks: Frontend Product Discovery Page

**Spec**: [`spec.md`](./spec.md) · **Plan**: [`plan.md`](./plan.md) · **Status**: Complete

## Phase 1 — Design-system port

- [x] T001 Add `cn` helper (`apps/web/src/lib/utils.ts`).
- [x] T002 Add Tailwind v4 + ReUI theme tokens (`apps/web/src/app/globals.css`) incl. `--mono`.
- [x] T003 Add `apps/web/postcss.config.mjs` (`@tailwindcss/postcss`).
- [x] T004 Copy UI primitives to `apps/web/src/components/ui/`: button, input, badge, card, select,
      toggle, toggle-group, dialog, skeleton.
- [x] T005 Add frontend dependencies to `apps/web/package.json`; `pnpm install`.

## Phase 2 — API client

- [x] T006 `apps/web/src/lib/search-client.ts`: `fetchSearch`, `fetchProduct`, `SORT_OPTIONS`,
      `PAGE_SIZE`, sort mapping. (US1, US3) [P]

## Phase 3 — Components (adopted, cart stripped)

- [x] T007 `components/store/product-image.tsx` — placeholder fallback. (US1) [P]
- [x] T008 `components/store/product-card-grid.tsx` — ported `Card2`. (US2) [P]
- [x] T009 `components/store/product-card-list.tsx` — ported `Card3`. (US2) [P]
- [x] T010 `components/store/quick-view-dialog.tsx` — modal via `/api/products/[id]`. (US3)
- [x] T011 `components/store/search-results.tsx` — debounced search, sort, grid/list toggle,
      infinite scroll, states, quick-view wiring. (US1, US2, US3)

## Phase 4 — Shell

- [x] T012 `app/layout.tsx` — import `globals.css`; centered wordmark header (no sidebar/topbar). (US)
- [x] T013 `app/page.tsx` — render `SearchResults`. (US1)

## Phase 5 — Deployment compatibility

- [x] T014 `next.config.mjs` — `DS_NO_STANDALONE` escape hatch for Windows local builds; Railway
      (Linux) unchanged.

## Phase 6 — Verification (quality gates)

- [x] T015 `pnpm typecheck` green.
- [x] T016 `pnpm lint` green.
- [x] T017 `pnpm test` green (85 tests; pass with no DB/search running).
- [x] T018 `next build` compiles; `/` prerenders; Tailwind v4 CSS emits.

## Not done (out of scope, tracked)

- [ ] Faceted filter sheet, period toggle, URL query-state sync, dedicated product route — deferred
      (see spec "Out of Scope"). No backend/API changes were made.
