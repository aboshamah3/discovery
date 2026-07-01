import { Client } from "typesense";

/**
 * Server-side Typesense admin client factory (Spec 004). Reads connection +
 * admin key from env. The admin key grants write/schema access and MUST stay
 * server-side — this module is only imported by `@ds/search` and the scripts,
 * never by browser code (constitution V, FR-012).
 */
export function getSearchClient(): Client {
  const host = process.env.TYPESENSE_HOST;
  const apiKey = process.env.TYPESENSE_API_KEY;
  if (!host || !apiKey) {
    throw new Error(
      "TYPESENSE_HOST and TYPESENSE_API_KEY must be set. Copy .env.example to .env (see README).",
    );
  }
  const port = Number(process.env.TYPESENSE_PORT ?? "8108");
  const protocol = process.env.TYPESENSE_PROTOCOL ?? "http";

  return new Client({
    nodes: [{ host, port, protocol }],
    apiKey,
    connectionTimeoutSeconds: 10,
  });
}
