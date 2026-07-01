# Feature Specification: Frontend Product Discovery Page (Metronic-adopted)

**Feature Branch**: `007-frontend-discovery`

**Created**: 2026-07-01

**Status**: Implemented

**Input**: User description: "Adopt the Metronic v9.4.0 storefront `search-results` component
(TypeScript/Next.js variant) as the product-discovery UI instead of building from scratch: reuse
its SearchResults layout, the grid card (Card2) and list card (Card3), the built-in grid/list
toggle, and the Metronic Tailwind v4 visual system. Wire it to the existing Spec 005 contracts
unchanged — GET /api/search (q, page, perPage, sort) and GET /api/products/[id]. Implement
debounced as-you-type search, infinite scroll (append pages while hasMore), a sort dropdown
mapped to the API sort options, and clear loading/empty/error states. Clicking a product opens a
lightweight quick-view modal backed by /api/products/[id]. Strip everything out of scope: the
cart/checkout/wishlist context and Add-to-Cart, the filter sheet, the period toggle, and the
entire (protected) sidebar + topbar. The app shell is a minimal centered text wordmark header
(no sidebar, no topbar) above the search + results. Port only the minimal UI-kit subset the
component needs plus Tailwind v4 + theme CSS and the cn helper into apps/web. Do not change any
backend contract."

Full working plan: [`FRONTEND_PLAN.md`](../../FRONTEND_PLAN.md).

## Clarifications

### Session 2026-07-01

- Q: Build the frontend from scratch or adopt a template? → A: **Adopt** the Metronic v9.4.0
  storefront `search-results` component (TS/Next.js variant). Only the look comes from Metronic;
  behavior and data come from our Spec 005 API. `search-results-grid` and `search-results-list`
  are the same component (`mode="card" | "list"`) with a built-in grid/list toggle.
- Q: How much of the Metronic toolbar do we keep? → A: Search box + grid/list toggle + a **sort
  dropdown wired to the API**. The filter sheet and the Today/Week/Month/All period toggle are
  stripped (out of scope this spec).
- Q: What happens on product click? → A: A **quick-view modal** backed by `GET /api/products/[id]`.
  One-page model preserved; no routing added.
- Q: What is the app shell? → A: A **centered text wordmark header only** — no sidebar, no
  topbar. The Metronic `(protected)` shell is not adopted.
- Q: Cart / checkout / wishlist? → A: **Stripped** (YAGNI, constitution V). The Metronic
  `useStoreClient` context and Add-to-Cart are removed from the ported cards.
- Q: Do we change any backend contract? → A: **No.** The frontend consumes the Spec 005 read
  endpoints unchanged.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Search products as you type (Priority: P1)

A visitor lands on the one-page discovery experience and types into a single centered search box.
Results update beneath the box without a full page reload, a short debounce after they stop typing,
ranked by relevance from the search engine.

**Why this priority**: As-you-type search is the core of the product. Without it, nothing else on
the page matters.

**Independent Test**: Type a query; observe results replace in place after the debounce window with
no navigation, and that rapid typing does not fire a request per keystroke.

**Acceptance Scenarios**:

1. **Given** the page has loaded, **When** the visitor types a query, **Then** results update in
   place after a ~250 ms debounce without a full page reload.
2. **Given** a query in progress, **When** the visitor keeps typing, **Then** superseded in-flight
   requests are ignored and only the latest query's results render.
3. **Given** an empty search box, **When** the page loads, **Then** a default result set is shown
   (empty-query browse).

### User Story 2 - Browse many results (grid/list + infinite scroll) (Priority: P1)

The visitor browses results in a polished grid, can switch to a list layout, and keeps scrolling to
load more results automatically until the catalog is exhausted.

**Why this priority**: Discovery requires browsing the full result set fluidly across both layouts.

**Independent Test**: Scroll to the bottom of the results; confirm the next page appends
automatically and that toggling grid/list re-renders the same items in the other layout.

**Acceptance Scenarios**:

1. **Given** more results exist (`hasMore`), **When** the visitor scrolls near the end, **Then**
   the next page is fetched and appended without a reload.
2. **Given** the last page has loaded (`hasMore` false), **When** the visitor scrolls further,
   **Then** no further requests are made.
3. **Given** a set of results, **When** the visitor toggles grid ↔ list, **Then** the same items
   render in the chosen layout.

### User Story 3 - Sort and inspect a product (Priority: P2)

The visitor reorders results with a sort dropdown (relevance, price, rating, reviews, newest) and
clicks a product to open a quick-view modal with its details, without leaving the page.

**Why this priority**: Sorting and detail inspection round out discovery but depend on search and
browsing existing first.

**Acceptance Scenarios**:

1. **Given** a result set, **When** the visitor picks a sort option, **Then** results reorder via
   the API from page 1.
2. **Given** a result card, **When** the visitor clicks it, **Then** a modal opens and loads that
   product from `GET /api/products/[id]`, showing loading, then detail (or an error state on
   failure).

### Edge Cases

- **No matches** → a clear empty state ("No products found"), not a blank page.
- **Search request fails** → an error state with recovery guidance; the page stays usable.
- **Missing/broken product image** → a neutral placeholder; the card never collapses.
- **Product detail fails to load** → the modal shows an error, not a spinner forever.

## Requirements *(mandatory)*

- **FR-001**: The page MUST search as the visitor types, debounced (~250 ms), with no full reload.
- **FR-002**: Results MUST be relevance-ranked by the search engine (server-side), never re-sorted
  client-side.
- **FR-003**: The page MUST offer grid and list layouts with a toggle; both render the same items.
- **FR-004**: The page MUST load more results via infinite scroll while `hasMore` is true and stop
  when it is false.
- **FR-005**: A sort dropdown MUST reorder results through the API (`sort` param), resetting to
  page 1.
- **FR-006**: Clicking a product MUST open a quick-view modal populated from `GET /api/products/[id]`,
  with loading/error/detail states; no route navigation.
- **FR-007**: The app shell MUST be a centered text wordmark header only — no sidebar, no topbar.
- **FR-008**: The UI MUST NOT include cart, checkout, wishlist, or Add-to-Cart affordances.
- **FR-009**: The frontend MUST consume the Spec 005 contracts unchanged; no backend contract change.
- **FR-010**: Loading (skeleton), empty, and error states MUST be present and distinct.
- **FR-011**: Missing or failed images MUST degrade to a placeholder without layout collapse.
- **FR-012**: `pnpm lint`, `pnpm typecheck`, and `pnpm test` MUST stay green, with tests passing
  with no database or search engine running; the production build MUST compile.

## Out of Scope

Cart/checkout/wishlist, faceted filter sheet, period toggle, URL query-state sync, authentication,
a dedicated product detail route, and any backend/API change.
