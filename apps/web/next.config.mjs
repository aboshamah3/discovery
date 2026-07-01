import path from "node:path";
import { fileURLToPath } from "node:url";

// Monorepo root (apps/web -> repo root), used to trace workspace deps for the
// standalone build so the pnpm-hoisted store resolves correctly (Spec 006).
const monorepoRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Self-contained production server for Railway (Spec 006). Emits
  // apps/web/.next/standalone/apps/web/server.js with workspace packages traced in.
  output: "standalone",
  outputFileTracingRoot: monorepoRoot,
  // Consume the workspace package directly from TypeScript source.
  transpilePackages: ["@ds/shared"],
};

export default nextConfig;
