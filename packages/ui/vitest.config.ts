import { defineConfig } from "vitest/config";

// Node env — the contrast audit is pure hex math that reads tokens.css off disk (no DOM/React).
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
