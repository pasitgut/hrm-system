import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup/env.ts"],
    exclude: ["**/node_modules/**", "**/.next/**", "**/drizzle/**"],
    // Multiple test files call resetDb()/seedReferenceData() against the
    // same shared TEST_DATABASE_URL; running files in parallel races
    // TRUNCATE/INSERT across workers (duplicate-key and missing-row
    // failures). Serializing file execution keeps db-touching tests
    // reliable at the cost of some wall-clock time.
    fileParallelism: false,
  },
});
