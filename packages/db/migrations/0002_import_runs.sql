-- Spec 002 — US3: import-run observability store.
-- gen_random_uuid() is built into PostgreSQL 13+ (no extension required).

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
