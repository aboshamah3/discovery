import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.{ts,tsx}"],
    environment: "node",
  },
  resolve: {
    // Mirror apps/web tsconfig `@/*` -> ./src/* so route/lib tests resolve it.
    alias: [
      {
        find: /^@\//,
        replacement: `${fileURLToPath(new URL("./apps/web/src", import.meta.url))}/`,
      },
    ],
  },
});
