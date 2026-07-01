# Implementation Plan: Frontend Product Discovery Page

**Spec**: [`spec.md`](./spec.md) · **Working plan**: [`../../FRONTEND_PLAN.md`](../../FRONTEND_PLAN.md)
**Status**: Implemented

## Approach

Adopt the Metronic v9.4.0 storefront `search-results` component (TS/Next.js) rather than building
UI from scratch. Port the minimal design-system slice into `apps/web`, strip out-of-scope features,
and wire the component to the live Spec 005 API with debounced search, API sort, grid/list toggle,
infinite scroll, and a quick-view modal.

## Source adopted

`metronic-tailwind-react-demos/typescript/nextjs/app/(protected)/store-client/`
— `SearchResults` (`mode="card"|"list"`, built-in toggle), `Card2` (grid), `Card3` (list), and the
ReUI Tailwind v4 UI kit (`components/ui/*`, `lib/utils.ts`).

## Design-system port (into `apps/web`)

- `src/lib/utils.ts` — `cn` (clsx + tailwind-merge), copied verbatim.
- `src/app/globals.css` — Tailwind v4 (`@import "tailwindcss"`, `tw-animate-css`) + the ReUI zinc
  theme tokens trimmed to what the components use, plus Metronic's `--mono` pair. Warning/success/
  info badges fall back to Tailwind's built-in palette (no extra tokens needed).
- `postcss.config.mjs` — `@tailwindcss/postcss`.
- `src/components/ui/*` — copied verbatim (alias-compatible `@/`): `button, input, badge, card,
  select, toggle, toggle-group, dialog, skeleton`. Each depends only on `cn`.
- `package.json` — add `tailwindcss@4`, `@tailwindcss/postcss`, `class-variance-authority`, `clsx`,
  `tailwind-merge`, `lucide-react`, `radix-ui`, `tw-animate-css`.

## Feature code (into `apps/web/src`)

- `lib/search-client.ts` — typed browser fetchers (`fetchSearch`, `fetchProduct`), `SORT_OPTIONS`
  (label → Typesense `sort_by`), `PAGE_SIZE`. Types re-used from `lib/api/dto` via `import type`.
- `components/store/product-image.tsx` — remote `<img>` with placeholder fallback (Spec plan §13).
- `components/store/product-card-grid.tsx` — ported `Card2`, cart removed, DTO-wired, click → quick-view.
- `components/store/product-card-list.tsx` — ported `Card3`, cart removed, DTO-wired.
- `components/store/quick-view-dialog.tsx` — modal fetching `GET /api/products/[id]` with states.
- `components/store/search-results.tsx` — orchestrator: debounced query, API sort, grid/list toggle,
  IntersectionObserver infinite scroll, generation-guarded fetches, loading/empty/error states.
- `app/layout.tsx` — imports `globals.css`; centered wordmark header (no sidebar/topbar).
- `app/page.tsx` — renders `SearchResults` in a max-width container.

## Contract mapping

`ProductCardDto` → card props: `image→img`, `title`, `price→"$"+price`, `rating→star badge`,
`brand`/`category` as meta, `inStock` badge. Sort dropdown values map to `price:asc|desc`,
`rating:desc`, `reviews:desc`, `releasedAtTimestamp:desc`; relevance omits `sort`.

## Correctness details

- **Debounce** ~250 ms input → fetch trigger.
- **Stale-response guard**: monotonic `genRef`; responses from superseded query/sort are dropped
  (belt-and-suspenders with `AbortController`).
- **Infinite scroll**: `IntersectionObserver` (400 px rootMargin) on a sentinel rendered only while
  `hasMore`; `loadMore` guards on `status==="ready" && hasMore`.

## Verification

`pnpm typecheck` ✓ · `pnpm lint` ✓ · `pnpm test` ✓ (85) · `next build` compiles, `/` prerenders,
Tailwind v4 CSS emits. Standalone tracing (Spec 006) is Linux/Railway-only; `DS_NO_STANDALONE=1`
allows the Windows local build to skip the privileged symlink step (default behavior unchanged).

## Risks / notes

- Metronic targets Next 16; we stay on Next 15. The adopted subset is version-compatible.
- Images are remote `<img>` (no `next/image` domains configured), per Spec plan §13.
