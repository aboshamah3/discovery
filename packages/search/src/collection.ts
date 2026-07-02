import { Client, Errors } from "typesense";

import { collectionName, productsCollectionSchema } from "./schema";

/**
 * Idempotent collection bootstrap (Spec 004, FR-002). Creates the product
 * collection only when it is missing; an existing collection is left intact
 * (no document loss on a no-op run). Engine-dependent — verified via the
 * quickstart, not unit tests.
 */
export async function ensureCollection(client: Client): Promise<void> {
  const name = collectionName();
  try {
    await client.collections(name).retrieve();
    // Already exists — nothing to do (do not drop / recreate).
  } catch (error) {
    if (error instanceof Errors.ObjectNotFound) {
      await client.collections().create(productsCollectionSchema());
      return;
    }
    throw error;
  }
}

/**
 * Drop the collection (if present) and recreate it from the current schema.
 * Used by the reindex entry point so a rebuild picks up schema changes (e.g. a
 * new `infix`/facet/sort field) — Typesense is a rebuildable projection of
 * Postgres (constitution II), so a from-scratch rebuild is the intended path.
 */
export async function recreateCollection(client: Client): Promise<void> {
  const name = collectionName();
  try {
    await client.collections(name).delete();
  } catch (error) {
    if (!(error instanceof Errors.ObjectNotFound)) throw error;
  }
  await client.collections().create(productsCollectionSchema());
}
