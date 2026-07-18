import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Vitest config for the Enterprise API framework tests.
 *
 * - `@/*` mirrors the tsconfig path alias to `./src/*`.
 * - `server-only` is a build-time guard that throws when imported outside a
 *   React Server Component; in unit tests we alias it to an empty module so the
 *   pure framework code (pagination, responses, HMAC, guard) can be imported.
 */
export default defineConfig({
  resolve: {
    alias: {
      "server-only": fileURLToPath(new URL("./test/stubs/server-only.ts", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
