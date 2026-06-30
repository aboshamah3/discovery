# DS Product Discovery — Claude Code + Spec Kit Project Plan

## 0. Project Summary

**Project name:** DS Product Discovery  
**Primary goal:** Build a fast, reliable, one-page product discovery/search experience powered by a real search engine, not a hand-rolled search function.  
**Frontend timing:** Frontend comes last. The first implementation work should create the repo, data layer, product ingestion, search foundation, API contracts, and deployment structure.  
**Repo strategy:** One GitHub repo for everything.  
**Deployment preference:** Railway for app, database, and search service.  
**Database preference:** Railway PostgreSQL. Neon can remain a fallback, but Railway is preferred for a simpler single-project deployment.

DS will import a JSON product catalog, persist it in PostgreSQL, index it into a proper search engine, expose clean API endpoints, and only then build the frontend page once the foundation is stable.

---

## 1. Original Requirements Converted Into Clear Product Requirements

### 1.1 Core User Experience

The final page should let a visitor:

1. Open a fast one-page product discovery experience.
2. Search from a top search form.
3. See results update without a full page reload.
4. Search as they type with debounce.
5. Get typo-tolerant, prefix, case-insensitive, relevance-ranked results.
6. Browse many results through load-more or infinite scroll.
7. View products in:
   - a nice product grid, and
   - one additional layout to be decided later.
8. Use a frontend design/layout resource that will be provided later.

### 1.2 Data Source

Product JSON URL:

```txt
https://media.downshift.app/hiring/founding-engineer/items.json
```

Confirmed catalog details:

- Around 4,000 products.
- Fields:
  - `id`
  - `title`
  - `brand`
  - `category`
  - `tags`
  - `price`
  - `rating`
  - `reviews`
  - `inStock`
  - `releasedAt`
  - `image`
  - `imageWidth`
  - `imageHeight`
  - `description`

The JSON should not be treated as the runtime database. It should be imported later into PostgreSQL, then indexed into the search engine.

---

## 2. Recommended Technical Direction

### 2.1 Stack

Use the following stack unless a strong issue appears during implementation:

- **Runtime / App:** Next.js App Router with TypeScript.
- **Package manager:** pnpm.
- **Repo layout:** pnpm workspace monorepo inside one GitHub repo.
- **Database:** PostgreSQL on Railway.
- **ORM:** Prisma.
- **Validation:** Zod.
- **Search engine:** Typesense.
- **Search client:** `typesense` server-side package.
- **Frontend search adapter later:** `typesense-instantsearch-adapter` or a custom API client, depending on the final UI resource.
- **Testing:** Vitest for unit/service tests. Playwright only when frontend starts.
- **Deployment:** Railway GitHub deployment.

### 2.2 Why Typesense

Use Typesense as the search foundation because this project needs instant product search with typo tolerance, prefix matching, ranking, faceting, sorting, and simple operations. It is a better foundation than building fuzzy search manually or doing all matching inside the frontend.

Typesense is also a good fit because:

- catalog size is small enough to run comfortably;
- the expected UX is search-as-you-type;
- product search will likely need filters later;
- it can power both grid and alternate layouts from the same API;
- it keeps the backend foundation independent from the final frontend design.

### 2.3 Alternatives Considered

| Option | Decision | Reason |
|---|---:|---|
| Typesense | Use | Strong fit for typo-tolerant instant product search. Simple to self-host. Good API. Good ranking/filtering/sorting support. |
| Meilisearch | Good alternative | Also strong, but Typesense is selected as the primary recommendation here. |
| PostgreSQL full-text + `pg_trgm` | Backup only | Can work, but more tuning is needed to reach a polished instant-search experience. |
| Fuse.js / MiniSearch in frontend | Avoid as foundation | Fine for prototypes, but not a solid backend search foundation. Also pushes catalog/search logic to the client. |
| Elasticsearch / OpenSearch | Avoid for MVP | Powerful but too heavy for a 4,000-product discovery page. |
| Algolia | Avoid for now | Excellent hosted product search, but the requirement asks for an authentic module/repo foundation and Railway-friendly deployment. |

---

## 3. Target Architecture

```txt
One GitHub repo
│
├── apps/
│   └── web/                  # Next.js app, route handlers, final frontend later
│
├── packages/
│   ├── db/                   # Prisma schema, migrations, db client
│   ├── search/               # Typesense schema, client, indexing, query builders
│   ├── shared/               # Zod schemas, shared types, constants
│   └── config/               # eslint/tsconfig/prettier shared config if needed
│
├── scripts/
│   ├── import-products.ts    # Fetch JSON, validate, upsert into DB
│   ├── reindex-products.ts   # Rebuild Typesense index from DB
│   └── smoke-search.ts       # Quick search smoke test
│
├── specs/                    # Spec Kit specs
│
├── docker-compose.yml        # Local Postgres + Typesense
├── railway.json              # Railway deployment hints if needed
├── package.json
├── pnpm-workspace.yaml
├── README.md
└── .env.example
```

### 3.1 Runtime Flow

```txt
JSON file
  ↓
Import script validates products with Zod
  ↓
PostgreSQL products table is upserted
  ↓
Reindex script creates/updates Typesense collection
  ↓
Next.js API route queries Typesense
  ↓
Frontend consumes API and renders layouts
```

### 3.2 Railway Services

Recommended Railway project services:

1. **Next.js service** from the GitHub repo.
2. **PostgreSQL service** from Railway.
3. **Typesense service** using Docker image or Railway template.

Optional later:

4. **Cron service or scheduled job** for refreshing the catalog, only if the JSON file becomes a changing source.

---

## 4. Environment Variables

Create `.env.example` early.

```bash
# App
NODE_ENV=development
NEXT_PUBLIC_APP_NAME="DS Product Discovery"

# Database
DATABASE_URL="postgresql://user:password@localhost:5432/ds"

# Product source
PRODUCTS_SOURCE_URL="https://media.downshift.app/hiring/founding-engineer/items.json"

# Typesense
TYPESENSE_HOST="localhost"
TYPESENSE_PORT="8108"
TYPESENSE_PROTOCOL="http"
TYPESENSE_API_KEY="dev_typesense_key"
TYPESENSE_SEARCH_ONLY_API_KEY="dev_search_only_key_optional"
TYPESENSE_PRODUCTS_COLLECTION="products"

# Import behavior
IMPORT_BATCH_SIZE="500"
REINDEX_BATCH_SIZE="500"
```

Do not expose admin Typesense keys to the browser. Frontend should call the app API unless a search-only key strategy is explicitly implemented later.

---

## 5. Database Model

### 5.1 Main Product Table

Use PostgreSQL as the source of truth.

```prisma
model Product {
  id          String   @id
  title       String
  brand       String?
  category    String?
  tags        String[]
  price       Decimal? @db.Decimal(10, 2)
  rating      Float?
  reviews     Int?
  inStock     Boolean  @default(false)
  releasedAt  DateTime?
  image       String?
  imageWidth  Int?
  imageHeight Int?
  description String?

  sourceHash  String?
  importedAt  DateTime @default(now())
  updatedAt   DateTime @updatedAt
  createdAt   DateTime @default(now())

  @@index([brand])
  @@index([category])
  @@index([inStock])
  @@index([releasedAt])
  @@index([rating])
  @@index([price])
}
```

### 5.2 Optional Import Run Table

This is useful for debugging and keeping imports safe.

```prisma
model ImportRun {
  id             String   @id @default(cuid())
  sourceUrl      String
  status         String
  fetchedCount   Int      @default(0)
  validCount     Int      @default(0)
  invalidCount   Int      @default(0)
  upsertedCount  Int      @default(0)
  errorMessage   String?
  startedAt      DateTime @default(now())
  finishedAt     DateTime?
}
```

### 5.3 Why Keep DB Separate From Search

PostgreSQL is the canonical product store. Typesense is the search index. This separation makes imports, reindexing, debugging, and future changes safer.

---

## 6. Typesense Search Design

### 6.1 Collection Name

Use:

```txt
products
```

For safer future reindexing, the implementation can later use versioned collections like:

```txt
products_v1
products_v2
```

Then point an alias named `products` to the active collection. For MVP, direct `products` is acceptable, but versioned reindexing is preferred if easy.

### 6.2 Search Document Shape

Typesense document:

```ts
type ProductSearchDocument = {
  id: string;
  title: string;
  brand?: string;
  category?: string;
  tags: string[];
  price?: number;
  rating?: number;
  reviews?: number;
  inStock: boolean;
  releasedAtTimestamp?: number;
  image?: string;
  imageWidth?: number;
  imageHeight?: number;
  description?: string;
};
```

### 6.3 Typesense Schema

Suggested fields:

```ts
{
  name: 'products',
  fields: [
    { name: 'id', type: 'string' },
    { name: 'title', type: 'string', sort: true },
    { name: 'brand', type: 'string', facet: true, optional: true },
    { name: 'category', type: 'string', facet: true, optional: true },
    { name: 'tags', type: 'string[]', facet: true },
    { name: 'price', type: 'float', facet: true, sort: true, optional: true },
    { name: 'rating', type: 'float', facet: true, sort: true, optional: true },
    { name: 'reviews', type: 'int32', sort: true, optional: true },
    { name: 'inStock', type: 'bool', facet: true },
    { name: 'releasedAtTimestamp', type: 'int64', sort: true, optional: true },
    { name: 'image', type: 'string', optional: true },
    { name: 'imageWidth', type: 'int32', optional: true },
    { name: 'imageHeight', type: 'int32', optional: true },
    { name: 'description', type: 'string', optional: true }
  ],
  default_sorting_field: 'reviews'
}
```

### 6.4 Search Query Behavior

Default search API behavior:

```ts
{
  q: query || '*',
  query_by: 'title,brand,category,tags,description',
  query_by_weights: '5,4,3,3,1',
  prefix: true,
  num_typos: '2,2,1,1,1',
  typo_tokens_threshold: 1,
  drop_tokens_threshold: 0,
  page,
  per_page: 24,
  facet_by: 'brand,category,tags,inStock',
  sort_by: '_text_match:desc,rating:desc,reviews:desc'
}
```

Notes:

- `drop_tokens_threshold: 0` keeps multi-word searches stricter and avoids surprising broad matches.
- The UI can later expose filters for brand, category, tags, price range, rating, and stock.
- Default `per_page` should be 24. Maximum should be capped, for example 60.
- For empty query, either show curated/default products or latest/high-rated products. Do not return unstable random results.

---

## 7. API Contract First

Build API routes before frontend.

### 7.1 Health Endpoint

```txt
GET /api/health
```

Response:

```json
{
  "ok": true,
  "services": {
    "database": "ok",
    "search": "ok"
  }
}
```

### 7.2 Search Endpoint

```txt
GET /api/search?q=&page=1&perPage=24&brand=&category=&tag=&inStock=&sort=
```

Response:

```ts
type SearchResponse = {
  query: string;
  page: number;
  perPage: number;
  found: number;
  totalPages: number;
  hasMore: boolean;
  results: ProductCardDTO[];
  facets?: {
    brands?: FacetValue[];
    categories?: FacetValue[];
    tags?: FacetValue[];
    inStock?: FacetValue[];
  };
};

type ProductCardDTO = {
  id: string;
  title: string;
  brand?: string;
  category?: string;
  tags: string[];
  price?: number;
  rating?: number;
  reviews?: number;
  inStock: boolean;
  releasedAt?: string;
  image?: string;
  imageWidth?: number;
  imageHeight?: number;
  description?: string;
};

type FacetValue = {
  value: string;
  count: number;
};
```

### 7.3 Product Detail Endpoint

```txt
GET /api/products/:id
```

Response:

```ts
type ProductDetailResponse = {
  product: ProductCardDTO & {
    description?: string;
  };
};
```

### 7.4 Internal Import Endpoint — Optional

Prefer scripts first. Do not expose import publicly.

If needed later:

```txt
POST /api/internal/import-products
```

Rules:

- Requires an internal secret.
- Only used manually or by cron.
- Not needed for first implementation if scripts are enough.

---

## 8. Spec Kit Plan

The specs below are designed to be implemented in order. Do not start the frontend until Spec 006.

### Spec 001 — Repo Foundation

**Goal:** Create the one-repo foundation with TypeScript, pnpm workspaces, linting, environment handling, local Docker services, and basic app skeleton.

**Deliverables:**

- `apps/web` Next.js app.
- `packages/shared` for Zod schemas and shared types.
- `packages/db` placeholder with Prisma setup.
- `packages/search` placeholder with Typesense client setup.
- `docker-compose.yml` with Postgres and Typesense.
- `.env.example`.
- Basic `README.md`.
- Basic CI script commands in root `package.json`.
- `GET /api/health` returning static status first, then real checks in later specs.

**Acceptance criteria:**

- `pnpm install` works.
- `pnpm dev` starts the app.
- `docker compose up` starts Postgres and Typesense locally.
- `pnpm lint` works.
- `pnpm typecheck` works.
- No product UI is built yet.

**Spec Kit prompt:**

```txt
Create Spec 001 for DS Product Discovery repo foundation. Use one pnpm workspace repo with apps/web, packages/db, packages/search, and packages/shared. Add Next.js App Router with TypeScript, basic lint/typecheck scripts, Docker Compose for Postgres and Typesense, .env.example, README, and a simple /api/health route. Do not build the product frontend yet.
```

---

### Spec 002 — Data Model + Validation

**Goal:** Define the product schema, DB model, migrations, and product validation layer.

**Deliverables:**

- Prisma schema for `Product` and `ImportRun`.
- Initial migration.
- Zod schema for raw product JSON.
- Normalized product type.
- Utility for converting raw JSON product into DB-safe normalized product.
- Unit tests for validation and normalization.

**Acceptance criteria:**

- `pnpm db:migrate` creates tables locally.
- Invalid product records are rejected with useful errors.
- Missing optional fields are handled safely.
- Product IDs are stable.
- No search indexing yet.
- No product frontend yet.

**Spec Kit prompt:**

```txt
Create Spec 002 for DS Product Discovery data model and validation. Add Prisma Product and ImportRun models, migrations, Zod validation for the source JSON fields, normalization utilities, and unit tests. Keep PostgreSQL as the source of truth. Do not implement search indexing or frontend yet.
```

---

### Spec 003 — Product Import Pipeline

**Goal:** Fetch the JSON catalog, validate it, and upsert products into PostgreSQL idempotently.

**Deliverables:**

- `scripts/import-products.ts`.
- Import run logging in `ImportRun`.
- Batch upsert behavior.
- Source hash or record hash support to detect changed records.
- Clear CLI output.
- Import tests with fixture JSON.

**Acceptance criteria:**

- Running import twice does not duplicate products.
- Import handles all ~4,000 products.
- Import records valid/invalid/upserted counts.
- Failures are visible and do not silently pass.
- DB becomes the canonical local source after import.
- No frontend yet.

**Spec Kit prompt:**

```txt
Create Spec 003 for DS Product Discovery import pipeline. Build a script that fetches PRODUCTS_SOURCE_URL, validates with the shared Zod schema, upserts products into PostgreSQL, records ImportRun status, supports batching, and is idempotent. Add fixture-based tests. Do not index into Typesense yet and do not build frontend.
```

---

### Spec 004 — Typesense Search Foundation

**Goal:** Build the search engine foundation and reindex products from PostgreSQL into Typesense.

**Deliverables:**

- Typesense client factory.
- Product collection schema.
- Collection create/update helper.
- `scripts/reindex-products.ts`.
- Search query builder.
- Smoke test script.
- Integration tests if practical.

**Acceptance criteria:**

- Typesense collection can be created locally.
- Products can be indexed from DB.
- Reindex is repeatable.
- Search supports typo tolerance, prefix matching, case-insensitive matching, ranking, pagination, and filters.
- A smoke search returns expected results after import + reindex.
- No frontend yet.

**Spec Kit prompt:**

```txt
Create Spec 004 for DS Product Discovery Typesense foundation. Add Typesense collection schema, server-side client, product indexing from PostgreSQL, reindex script, search query builder, smoke search script, and tests where practical. Search must support typo tolerance, prefix matching, ranking, pagination, and filters. Do not build frontend yet.
```

---

### Spec 005 — Backend API Contracts

**Goal:** Expose stable API endpoints for search and product details before building UI.

**Deliverables:**

- `GET /api/health` with real DB/search checks.
- `GET /api/search`.
- `GET /api/products/[id]`.
- DTO mappers.
- Query validation.
- API error format.
- API tests.

**Acceptance criteria:**

- `/api/search` supports q, page, perPage, filters, and sort.
- Search responds quickly against local Typesense.
- API never exposes internal search admin keys.
- API response is stable enough for frontend work.
- Product detail endpoint reads from PostgreSQL.
- No final frontend yet, only a minimal placeholder page if needed.

**Spec Kit prompt:**

```txt
Create Spec 005 for DS Product Discovery backend API contracts. Implement /api/health with database and Typesense checks, /api/search backed by Typesense, /api/products/[id] backed by PostgreSQL, query validation, DTO mapping, consistent errors, and tests. Keep frontend as a placeholder only.
```

---

### Spec 006 — Railway Deployment Foundation

**Goal:** Make the project deployable on Railway before building the final frontend.

**Deliverables:**

- Railway deployment notes in README.
- `next.config` standalone output.
- Build/start scripts compatible with Railway.
- Migration command documentation.
- Import/reindex command documentation.
- Environment variable checklist.
- Optional `railway.json` if helpful.

**Acceptance criteria:**

- Railway can deploy the Next.js service from GitHub.
- Railway PostgreSQL connection works through `DATABASE_URL`.
- Typesense connection variables are documented.
- Migrations can run before deploy.
- Manual import and reindex commands are documented.
- `/api/health` works in production.
- No final frontend yet.

**Spec Kit prompt:**

```txt
Create Spec 006 for DS Product Discovery Railway deployment foundation. Configure Next.js standalone output, Railway-compatible build/start scripts, migration instructions, env var checklist, product import and reindex commands, and production health checks. Do not build the final frontend yet.
```

---

### Spec 007 — Frontend Product Discovery Page

**Goal:** Build the final one-page frontend after the backend foundation is stable.

**Frontend should only start after Specs 001–006 are complete.**

**Deliverables:**

- Top search form.
- Debounced as-you-type search.
- Result grid layout.
- One additional layout, based on the provided resource or design reference.
- Layout switcher if useful.
- Load-more or infinite scroll.
- Loading, empty, and error states.
- Product cards using image dimensions safely.
- Mobile responsive page.
- Optional URL query sync.

**Acceptance criteria:**

- Search updates without full page reload.
- Debounce prevents excessive API calls.
- Results are relevance-ranked.
- Load-more/infinite scroll works.
- Grid layout is polished.
- Second layout follows provided reference.
- Images do not cause layout shift where possible.
- Page works well on desktop and mobile.

**Spec Kit prompt:**

```txt
Create Spec 007 for DS Product Discovery frontend page. Use the existing /api/search and /api/products/[id] contracts. Build the one-page search UI with a top search form, debounced as-you-type search, no page reload, product grid, one additional layout based on the provided design resource, load-more or infinite scroll, and polished loading/empty/error states. Do not change backend contracts unless absolutely necessary.
```

---

### Spec 008 — Polish, Performance, and QA

**Goal:** Final hardening after the frontend exists.

**Deliverables:**

- Lighthouse pass.
- Search performance checks.
- API response time checks.
- Basic accessibility improvements.
- Image fallback handling.
- Final README usage guide.
- Final deployment checklist.

**Acceptance criteria:**

- Search feels instant for the 4,000-product catalog.
- No visible page reload on search.
- No obvious layout shift from images.
- Empty/error states are clear.
- Final deployment checklist is accurate.
- README explains local setup, import, reindex, deploy, and frontend usage.

**Spec Kit prompt:**

```txt
Create Spec 008 for DS Product Discovery polish and QA. Improve performance, accessibility, loading/empty/error states, image fallback behavior, README docs, and deployment checklist. Verify the full import → DB → Typesense → API → frontend flow.
```

---

## 9. Suggested Root Scripts

Add scripts gradually as specs need them.

```json
{
  "scripts": {
    "dev": "pnpm --filter web dev",
    "build": "pnpm --filter web build",
    "start": "pnpm --filter web start",
    "lint": "pnpm -r lint",
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "db:generate": "pnpm --filter @ds/db prisma generate",
    "db:migrate": "pnpm --filter @ds/db prisma migrate dev",
    "db:deploy": "pnpm --filter @ds/db prisma migrate deploy",
    "import:products": "tsx scripts/import-products.ts",
    "search:reindex": "tsx scripts/reindex-products.ts",
    "search:smoke": "tsx scripts/smoke-search.ts"
  }
}
```

---

## 10. Local Development Flow

```bash
pnpm install
cp .env.example .env
docker compose up -d
pnpm db:generate
pnpm db:migrate
pnpm import:products
pnpm search:reindex
pnpm search:smoke
pnpm dev
```

Expected local checks:

```txt
http://localhost:3000/api/health
http://localhost:3000/api/search?q=phone
```

---

## 11. Backend Rules for Claude Code

Use these rules while implementing:

1. Do not build the frontend before Spec 007.
2. Keep PostgreSQL as the source of truth.
3. Keep Typesense as a rebuildable search index.
4. Do not expose Typesense admin keys to the browser.
5. Validate all imported JSON with Zod before writing to DB.
6. Make import idempotent.
7. Add scripts before adding manual one-off code.
8. Keep API responses stable and documented.
9. Use small, reviewable PRs/spec changes.
10. Do not add auth, checkout, cart, wishlist, or admin panels unless a later spec explicitly requests it.
11. Do not overbuild multi-tenant or SaaS functionality.
12. Avoid frontend design decisions until the layout resource is provided.

---

## 12. Search Quality Rules

Search should prioritize:

1. Exact title matches.
2. Prefix title matches.
3. Brand matches.
4. Category matches.
5. Tag matches.
6. Description matches.
7. Higher rating and reviews as secondary ranking signals.
8. In-stock products can be boosted later if needed.

Default filters to support in the API:

- brand
- category
- tag
- inStock
- minPrice
- maxPrice
- minRating

Default sorts to support:

- relevance
- priceAsc
- priceDesc
- ratingDesc
- reviewsDesc
- newest

---

## 13. Frontend Notes for Later

Do not decide the final design now. The page should eventually support:

- Search input at the top.
- Search results below.
- Grid layout.
- Second layout from the provided resource.
- Layout toggle if it makes sense.
- Load-more or infinite scroll.
- Optional filters sidebar/drawer.
- Optional sort dropdown.
- Mobile-first responsive behavior.

Frontend technical approach later:

- Use API-driven state first.
- Use debounce around 200–300ms.
- Use URL query params only if useful.
- Use skeleton states for search/loading.
- Use `next/image` only if remote image domains are configured safely. Otherwise use standard `img` first and optimize later.

---

## 14. Open Questions — Not Blocking Foundation

These questions do not block Specs 001–006, but should be answered before or during Spec 007:

1. Should the JSON source be imported once, or refreshed on a schedule?
2. Should the final page have filters visible by default, or hidden in a drawer?
3. Should in-stock products be ranked above out-of-stock products?
4. Should product cards show description snippets, or keep cards clean?
5. Should clicking a product open a modal, detail panel, or separate product page?
6. Should the second layout be a list view, masonry view, editorial/featured layout, or based fully on the provided resource?
7. Should search state be saved in the URL for sharing/bookmarking?
8. Should images remain remote, or should they be cached/proxied later?

Recommended defaults for now:

- One-time import first.
- Manual reimport/reindex script first.
- No scheduled refresh until needed.
- Remote images first.
- Detail endpoint exists, but frontend can stay one-page.
- Search state can stay client-side first unless sharing search URLs becomes important.

---

## 15. Implementation Order Summary

Use this exact order:

1. Repo foundation.
2. DB schema and validation.
3. Product import pipeline.
4. Typesense search foundation.
5. Backend API contracts.
6. Railway deployment foundation.
7. Frontend product discovery page.
8. Polish and QA.

The key idea: build the search/data/API foundation first, then connect the frontend later once the UI direction is clear.

---

## 16. Definition of Done for Foundation

The foundation is considered done when:

- The repo runs locally.
- PostgreSQL runs locally and on Railway.
- Typesense runs locally and has documented Railway deployment.
- Products can be imported from the JSON URL into PostgreSQL.
- Products can be reindexed from PostgreSQL into Typesense.
- `/api/search` returns typo-tolerant, prefix, relevance-ranked product results.
- `/api/products/:id` returns a product from PostgreSQL.
- `/api/health` checks DB and search availability.
- Railway deployment instructions are tested or ready to test.
- Frontend remains placeholder/minimal until the design resource is ready.

