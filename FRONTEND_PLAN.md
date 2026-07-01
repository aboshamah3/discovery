# Spec 007 — Frontend Product Discovery Page (Metronic-adopted)

**Status:** Plan locked, ready for Spec Kit (`specify → clarify → plan → tasks → implement`).
**Supersedes:** the outline "Spec 007" section of [`DS_PROJECT_SPEC_PLAN.md`](./DS_PROJECT_SPEC_PLAN.md) §8.
**Constraint alignment:** frontend-last (constitution I), contract-first (IV), YAGNI — no
cart/checkout/wishlist/auth (V), quality gates green (VI).

## 1. Decision

Do **not** hand-build the frontend. **Adopt the Metronic v9.4.0 storefront `search-results`
component** (the TS + Next.js variant) as our product-discovery UI, wired to the *existing*
backend contracts from Spec 005. Keep every frontend requirement (quick search, debounced
instant results, infinite results, grid **and** list layouts) — only the *look* comes from
Metronic; the *behavior and data* come from our API.

## 2. Source of the adopted components

```
I:\HC System\Main Project\metronic-v9.4.0\metronic-tailwind-react-demos\typescript\nextjs\
  app/(protected)/store-client/
    search-results-grid/                  # page + content → <SearchResults mode="card" />
    search-results-list/                  # page + content → <SearchResults mode="list" />
    search-results-grid/components/search-results.tsx   # THE component (grid+list, built-in toggle)
    components/common/card2.tsx           # grid card
    components/common/card3.tsx           # list card
  components/ui/*                         # shadcn-style kit (Tailwind v4)
  lib/utils.ts (cn), lib/helpers.ts (toAbsoluteUrl)
```

Key insight: `search-results-grid` and `search-results-list` are the **same** `SearchResults`
component with a `mode` prop and an **already-built grid/list toggle**. We adopt one component.

## 3. What we keep, change, and strip

**Keep (from Metronic):** the `SearchResults` layout, `Card2` (grid) / `Card3` (list), the
grid↔list toggle, the search input, and the Metronic visual system (Tailwind v4 theme + the
UI primitives the cards use).

**Change (wire to real data + our requirements):**
- Replace the static `items` array with live data from `GET /api/search`.
- **Debounced as-you-type search** (~250ms) — search box drives `q`.
- **Infinite scroll** — IntersectionObserver sentinel; when `hasMore`, fetch `page+1` and append.
- **Sort dropdown wired to the API** (`sort=relevance|priceAsc|priceDesc|ratingDesc|reviewsDesc|newest`).
- Loading (skeletons), empty, and error states.
- Map our `ProductCardDto` → card props:
  `image→logo`, `title→title`, `price→total`, `rating→star`, `brand→category1`, `category→category2`,
  `id` for the quick-view. Use real `image` URLs (not `toAbsoluteUrl('/media/...')`); guard missing images.

**Strip (YAGNI / constitution V):**
- The `useStoreClient` cart context, "Add to Cart" buttons, and cart/checkout/wishlist sheets.
- The **filter sheet** and the **Today/Week/Month/All period toggle** (not in scope this spec).
- The entire `(protected)` **sidebar + topbar** shell.

## 4. Product click → Quick-view modal

Clicking a card opens a **lightweight quick-view modal** backed by `GET /api/products/[id]`.
One-page model preserved; no routing added. Uses the existing detail endpoint unchanged.

## 5. App shell (no sidebar, no topbar)

Root layout becomes a **minimal centered-logo shell**:
- Header: a single centered **text wordmark** (app name, `NEXT_PUBLIC_APP_NAME`) — placeholder,
  swappable for an image later. No nav, no sidebar, no user menu.
- Body: the search box + results (grid/list) + infinite scroll. That's the whole page.

## 6. Design-system port (into `apps/web`)

`apps/web` currently has **no Tailwind / CSS / UI kit**. Bring in the *minimal* slice:
- Tailwind v4 + PostCSS config + Metronic theme CSS variables (globals.css).
- `cn` (from `lib/utils`), `lucide-react`.
- Only the UI primitives the cards + toolbar need: `button, input, badge, card, select,
  toggle-group` (+ `dialog` for the quick-view). Skip the other ~70 kit files.
- Add matching deps to `apps/web/package.json`: `tailwindcss@4`, `@tailwindcss/postcss`,
  `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `radix-ui`,
  `tw-animate-css`. (Metronic targets Next 16; we stay on Next 15 — components are
  version-compatible for this subset.)

## 7. Contracts — unchanged (contract-first)

Consume as-is; do **not** modify backend:
- `GET /api/search?q=&page=&perPage=&sort=` → `SearchResponse { results[], found, hasMore, totalPages, ... }`
- `GET /api/products/[id]` → `ProductDetailResponse { product }`

## 8. Acceptance criteria

- Search updates results with no full page reload; typing is debounced.
- Results are relevance-ranked (server-side); sort dropdown changes order via the API.
- Grid and list layouts both render; the toggle switches them.
- Infinite scroll loads more until `hasMore` is false; loading/empty/error states are clear.
- Clicking a product opens the quick-view modal from `/api/products/[id]`.
- No sidebar/topbar; header is a centered wordmark only.
- No cart/checkout/wishlist anywhere.
- Images don't cause layout shift where dimensions are known; missing images degrade gracefully.
- `pnpm lint && pnpm typecheck && pnpm test` green; tests pass with no DB/search running.

## 9. Spec Kit input (paste into `specify` for Spec 007)

```txt
Create Spec 007 for the DS Product Discovery frontend. Adopt the Metronic v9.4.0 storefront
"search-results" component (TypeScript/Next.js variant) as the product-discovery UI instead of
building from scratch: reuse its SearchResults layout, the grid card (Card2) and list card
(Card3), the built-in grid/list toggle, and the Metronic Tailwind v4 visual system. Wire it to
the existing Spec 005 contracts unchanged — GET /api/search (q, page, perPage, sort) and
GET /api/products/[id]. Implement debounced as-you-type search, infinite scroll (append pages
while hasMore), a sort dropdown mapped to the API sort options, and clear loading/empty/error
states. Clicking a product opens a lightweight quick-view modal backed by /api/products/[id].
Strip everything out of scope: the cart/checkout/wishlist context and Add-to-Cart, the filter
sheet, the period toggle, and the entire (protected) sidebar + topbar. The app shell is a
minimal centered text wordmark header (no sidebar, no topbar) above the search + results. Port
only the minimal UI-kit subset the component needs (button, input, badge, card, select,
toggle-group, dialog) plus Tailwind v4 + theme CSS and the cn helper into apps/web. Do not
change any backend contract. Keep pnpm lint, typecheck, and test green with no database or
search engine running.
```
