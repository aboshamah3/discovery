-- Spec 002 — US1: canonical product store (source of truth).
-- Idempotent DDL (safe under the runner's transaction + schema_migrations tracking).

CREATE TABLE IF NOT EXISTS products (
  id           text PRIMARY KEY,
  title        text NOT NULL,
  brand        text,
  category     text,
  tags         text[] NOT NULL DEFAULT '{}',
  price        numeric(10, 2),
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

-- Secondary indexes mirror DS_PROJECT_SPEC_PLAN.md §5.1 (later filter/sort).
CREATE INDEX IF NOT EXISTS products_brand_idx       ON products (brand);
CREATE INDEX IF NOT EXISTS products_category_idx    ON products (category);
CREATE INDEX IF NOT EXISTS products_in_stock_idx    ON products (in_stock);
CREATE INDEX IF NOT EXISTS products_released_at_idx ON products (released_at);
CREATE INDEX IF NOT EXISTS products_rating_idx      ON products (rating);
CREATE INDEX IF NOT EXISTS products_price_idx       ON products (price);

-- Keep updated_at correct regardless of which writer touches a row.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS products_set_updated_at ON products;
CREATE TRIGGER products_set_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
