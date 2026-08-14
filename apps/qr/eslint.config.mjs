// apps/qr ESLint — shared monorepo base + Next.js core-web-vitals (a11y / perf / react-hooks).
// eslint-config-next ships a native flat-config array as of Next 16, so no FlatCompat is needed.
// Pinned to ESLint 9: its bundled eslint-plugin-react (7.x) still uses a context API removed in
// ESLint 10 — revisit when the Next plugin chain ships ESLint 10 support.
import base from "@mms/config/eslint";
import next from "eslint-config-next/core-web-vitals";

// W2c type-scale sweep — ban NUMERIC inline `fontSize` so the tokens can't regress. The selector
// matches any numeric literal that is the (or part of the) value of a `fontSize` property, so
// `fontSize: 14` and `fontSize: strong ? 20 : undefined` both fail, while `fontSize: "var(--fs-sm)"`
// passes. The WHOLE app — diner AND staff surfaces — is now swept (staff chrome → `--fs-*`, KDS reads
// stay on the kitchen-scale `--kfs-*` tier), so the ban covers every `.tsx` with no exclusions.
// W9a — ban a BARE `/menu` destination. `/menu` with no `?mode=` is not neutral: `useTableSession`
// falls through to the scan-&-go default, so every such link silently converted a dine-in or pickup
// diner into a grocery shopper (orphaning their table). Six reachable links did this, including the
// only forward affordance on the post-pay screen. Use `menuHref(mode)` from `lib/menu-href.ts`, which
// carries the mode or routes to the door picker.
//
// Scoped to the positions where the string is a DESTINATION — a JSX `href` (bare or braced), a
// `router.push()` argument, and a `menuHref`-style default parameter (which is how one live bare
// `/menu` survived the first sweep, in TableTimeline). The literal stays legal as an object KEY
// (TransitionNav's journey-depth map) and in a pathname COMPARISON (AppHeader); none of these
// selectors match those positions.
//
// This is a guardrail, not a proof: a hoisted `const MENU = "/menu"` or a template literal that
// evaluates to the same string still passes. It catches the shape the six real regressions took.
const BARE_MENU_MSG =
  "Bare '/menu' defaults to scan-&-go and silently changes the diner's mode — use menuHref(mode) from lib/menu-href (W9a).";
const noBareMenuHref = {
  selector: "JSXAttribute[name.name='href'] Literal[value='/menu']",
  message: BARE_MENU_MSG,
};
const noBareMenuPush = {
  selector: "CallExpression[callee.property.name='push'] > Literal[value='/menu']",
  message: BARE_MENU_MSG,
};
const noBareMenuDefault = {
  selector: "AssignmentPattern > Literal[value='/menu']",
  message: BARE_MENU_MSG,
};

const noNumericFontSize = {
  files: ["components/**/*.tsx", "app/**/*.tsx"],
  rules: {
    "no-restricted-syntax": [
      "error",
      {
        selector: "Property[key.name='fontSize'] Literal[raw=/^-?[0-9.]+$/]",
        message:
          "Use a --fs-* token (e.g. fontSize: 'var(--fs-sm)'), not a numeric fontSize — the type scale is tokenized (W2c).",
      },
      noBareMenuHref,
      noBareMenuPush,
      noBareMenuDefault,
    ],
  },
};

// next/og (Satori) image routes — NOT app UI. Satori needs literal px fontSizes (it can't resolve the
// `var(--fs-*)` CSS-var tokens) and requires a raw <img> (next/image doesn't render under Satori). Exempt
// the brand-kit image generators from the token ban + the img rule so they lint clean. Must come AFTER
// noNumericFontSize to override it.
const ogImageRoutes = {
  files: [
    "app/**/opengraph-image.tsx",
    "app/**/twitter-image.tsx",
    "app/**/apple-icon.tsx",
    "app/**/icon.tsx",
  ],
  rules: {
    "no-restricted-syntax": "off",
    "@next/next/no-img-element": "off",
  },
};

// W7b — the built SW artifact is generated (minified iife); lint the SOURCE (sw/sw.ts), never the build.
const generatedArtifacts = { ignores: ["public/sw.js", "public/sw.js.map"] };

const config = [...base, ...next, noNumericFontSize, ogImageRoutes, generatedArtifacts];
export default config;
