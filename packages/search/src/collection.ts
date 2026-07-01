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
