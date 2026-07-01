# Contract: Database Schema & Migration Command

**Feature**: 002-data-model-validation | **Module**: `@ds/db`

The PostgreSQL schema and the `db:migrate` command contract. Tables are the source of truth (constitution II); the migration command is idempotent (FR-003).

---

## Command: `pnpm db:migrate`

- **Effect**: Applies every migration in `packages/db/migrations/*.sql` that has not yet been recorded in `schema_migrations`, in filename order, each within a transaction; records each applied filename.
- **Preconditions**: `DATABASE_URL` is set (loaded from repo-root `.env`); PostgreSQL is reachable.
- **Postconditions (fresh DB)**: tables `products`, `import_runs`, `schema_migrations` exist with the columns below; the `set_updated_at()` function and `products_set_updated_at` trigger exist.
- **Idempotency (SC-003)**: re-running applies nothing new, exits `0`, and never drops/duplicates data.
- **Failure**: a failing migration rolls back its transaction and exits non-zero with the error (Constitution III: fail loudly).

---

## Table: `products`

```sql
CREATE TABLE IF NOT EXISTS products (
  id           text PRIMARY KEY,
  title        text NOT NULL,
  brand        text,
  category     text,
  tags         text[] NOT NULL DEFAULT '{}',
  price        numeric(10,2),
  rating       real,
  reviews      integer,
  in_stock     boolean NOT NULL DEFAULT false,
  released_at  timestamptz,
  image        text,
  image_width  integer,
  image_height integer,
  description  text,
  source_hash  text,
  imported_at  timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
```

Indexes: `brand`, `category`, `in_stock`, `released_at`, `rating`, `price`.
Trigger: `products_set_updated_at BEFORE UPDATE` → sets `updated_at = now()`.

---

## Table: `import_runs`

```sql
CREATE TABLE IF NOT EXISTS import_runs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_url     text NOT NULL,
  status         text NOT NULL,
  fetched_count  integer NOT NULL DEFAULT 0,
  valid_count    integer NOT NULL DEFAULT 0,
  invalid_count  integer NOT NULL DEFAULT 0,
  upserted_count integer NOT NULL DEFAULT 0,
  error_message  text,
  started_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz
);
```

---

## Table: `schema_migrations` (internal)

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename   text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
```

---

## Module surface (`@ds/db`)

| Export | Signature | Purpose |
|---|---|---|
| `getPool()` | `() => pg.Pool` | Lazily create/reuse a connection pool from `DATABASE_URL`. |
| `query(text, params?)` | `(text: string, params?: unknown[]) => Promise<pg.QueryResult>` | Parameterized query helper. |
| `closePool()` | `() => Promise<void>` | Close the pool (tests / script teardown). |

The migrate runner (`packages/db/src/migrate.ts`, invoked by `db:migrate`) uses these to apply migrations. Network fetch + product upsert that consume this module are **Spec 003**.
