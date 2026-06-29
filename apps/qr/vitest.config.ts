import path from "node:path";
import { defineConfig } from "vitest/config";

// Node env — current unit tests target pure modules (no `server-only`, no DOM). The `@/*` alias
// mirrors tsconfig so tests can import app code by its path alias. Add jsdom + @vitejs/plugin-react
// here when the first React component test lands.
export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/.next/**"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
