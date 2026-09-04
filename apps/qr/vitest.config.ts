import path from "node:path";
import { defineConfig } from "vitest/config";

// ⚠️ THE ENVIRONMENT IS PER FILE, NOT PER PROJECT (M46, 2026-09-04). `environment: "node"` below is
// the DEFAULT, not the rule: vitest reads a `/** @vitest-environment jsdom */` docblock out of the
// raw file text and PREFERS it over this config — measured in the installed runner at
// `vitest/dist/chunks/cli-api.*.js`, which checks the control comment first and only then falls back
// to `project.config.environment`. So a `.test.tsx` opts into a DOM one file at a time and the 104
// node suites are untouched by construction.
//
// That is why there is no `test.projects` array here. The projects route was measured and rejected:
// with `extends: true` a child's `include` CONCATENATES with the parent's, so a jsdom project
// silently re-runs every node suite under jsdom (measured: node 1274, dom 1275), and without
// `extends` the alias and the JSX runtime below have to be duplicated into each child. One line of
// `include` plus a per-file docblock is the whole mechanism.
//
// ⚠️ Vitest's own matcher for that docblock is UNANCHORED — it scans the entire file, with no
// docblock-position constraint — so a `.test.ts` that merely MENTIONS the phrase in a comment
// switches environment with no count change and no other symptom. `scripts/verify-slice.mjs` and
// its mirror in `ci.yml` therefore refuse the pragma in `.test.ts` and REQUIRE exactly
// `@vitest-environment jsdom` in `.test.tsx`, matching with a verbatim copy of vitest's regex.
//
// `@vitejs/plugin-react` is NOT needed and the old note here was wrong about it: `esbuild.jsx`
// below already supplies the automatic runtime, and the plugin's job is Fast Refresh, which no test
// run uses. The `@/*` alias mirrors tsconfig so tests can import app code by its path alias.
export default defineConfig({
  // M83 — the AUTOMATIC JSX runtime, which is what Next compiles with. `tsconfig` says
  // `"jsx": "preserve"` (Next owns the transform), so esbuild fell back to the classic runtime and
  // any .tsx reached from a test threw `React is not defined` at render. This picks the runtime for
  // files that contain JSX at all — the email templates `emails/palette.test.ts` renders, and now
  // the component suites.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    // ⚠️ WRITTEN OUT, NEVER DELETED TO "WIDEN". Vitest's built-in default `include` also matches
    // `.spec.ts` / `.spec.tsx`, a suffix both orphan guards ban outright (T5) — dropping this line
    // would silently start running a suffix the repo has decided must never land.
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/.next/**"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
