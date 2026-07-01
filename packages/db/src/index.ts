import pg from "pg";
import type { Pool, QueryResult, QueryResultRow } from "pg";

/**
 * Direct PostgreSQL access for DS Product Discovery — no ORM (constitution v1.1.0).
 * A lazily-created connection pool plus thin query/close helpers. PostgreSQL is
 * the source of truth; the import (Spec 003) and API (Spec 005) build on this.
 */

let pool: Pool | null = null;

/** Lazily create (and reuse) the connection pool from `DATABASE_URL`. */
export function getPool(): Pool {
  if (pool === null) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        "DATABASE_URL is not set. Copy .env.example to .env (see README) before connecting.",
      );
    }
    pool = new pg.Pool({ connectionString });
  }
  return pool;
}

/** Run a parameterized query (`$1, $2, …`) against the pool. */
export function query<R extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<QueryResult<R>> {
  return getPool().query<R>(text, params);
}

/** Close the pool (tests / script teardown). Safe to call when not open. */
export async function closePool(): Promise<void> {
  if (pool !== null) {
    await pool.end();
    pool = null;
  }
}
