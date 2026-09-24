import { defineConfig } from "vitest/config";

// Node env — the contrast audit is pure hex math that reads tokens.css off disk (no DOM/React).
// Phase 1c — the AUTOMATIC JSX runtime, for the one suite that renders a primitive to static markup
// (`toast.test.ts`, still node env: `react-dom/server` needs no DOM). `tsconfig` says
// `"jsx": "preserve"` (Next owns the transform), so without this esbuild falls back to the classic
// runtime and any `.tsx` reached from a test throws `React is not defined` — the same fix, for the
// same reason, as `apps/qr/vitest.config.ts` (M83).
export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
