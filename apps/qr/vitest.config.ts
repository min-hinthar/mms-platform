import path from "node:path";
import { defineConfig } from "vitest/config";

// Node env — current unit tests target pure modules (no `server-only`, no DOM). The `@/*` alias
// mirrors tsconfig so tests can import app code by its path alias. Add jsdom + @vitejs/plugin-react
// here when the first React component test lands.
export default defineConfig({
  // M83 — the AUTOMATIC JSX runtime, which is what Next compiles with. `tsconfig` says
  // `"jsx": "preserve"` (Next owns the transform), so esbuild fell back to the classic runtime and
  // any .tsx reached from a test threw `React is not defined` at render. Node env is unchanged;
  // this only picks the runtime for files that contain JSX at all — today, the email templates that
  // `emails/palette.test.ts` renders.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/.next/**"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
