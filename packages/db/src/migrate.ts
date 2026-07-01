import { config as loadEnv } from "dotenv";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getPool, closePool } from "./index";

/**
 * Idempotent SQL migration runner (no ORM). Applies every `*.sql` file under
 * `packages/db/migrations/` that is not yet recorded in `schema_migrations`,
 * in filename order, each inside a transaction. Safe to re-run (FR-003/SC-003);
 * fails loudly and rolls back on a bad migration (constitution III).
 */

const SRC_DIR = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(SRC_DIR, "..", "migrations");
const REPO_ROOT = join(SRC_DIR, "..", "..", "..");

// Load DATABASE_URL from the repo-root .env regardless of the current working
// directory (pnpm runs package scripts with cwd = the package dir).
loadEnv({ path: join(REPO_ROOT, ".env") });

async function migrate(): Promise<void> {
  const pool = getPool();

  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       filename   text PRIMARY KEY,
       applied_at timestamptz NOT NULL DEFAULT now()
     )`,
  );

  const { rows } = await pool.query<{ filename: string }>(
    "SELECT filename FROM schema_migrations",
  );
  const applied = new Set(rows.map((row) => row.filename));

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const pending = files.filter((name) => !applied.has(name));

  if (pending.length === 0) {
    console.log("No pending migrations.");
    return;
  }

  for (const file of pending) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [
        file,
      ]);
      await client.query("COMMIT");
      console.log(`Applied ${file}`);
    } catch (error) {
      await client.query("ROLLBACK");
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Migration ${file} failed: ${message}`, { cause: error });
    } finally {
      client.release();
    }
  }

  console.log(`Done — applied ${pending.length} migration(s).`);
}

migrate()
  .then(closePool)
  .catch(async (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    await closePool();
    process.exitCode = 1;
  });
