import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Mirrors tsconfig's "@/*" paths entry.
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    // Globals give @testing-library/react its afterEach hook for auto-cleanup
    // between tests; test files still import from "vitest" explicitly.
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    // Raises Testing Library's async budget; the reasoning is in the setup file.
    setupFiles: ["./vitest.setup.ts"],
    // Kept above that budget so a slow-but-passing waitFor is never killed by
    // the test timeout instead.
    testTimeout: 15_000,
  },
});
