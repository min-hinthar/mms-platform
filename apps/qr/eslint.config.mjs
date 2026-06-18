// apps/qr ESLint — shared monorepo base + Next.js core-web-vitals (a11y / perf / react-hooks).
// eslint-config-next ships a native flat-config array as of Next 16, so no FlatCompat is needed.
// Pinned to ESLint 9: its bundled eslint-plugin-react (7.x) still uses a context API removed in
// ESLint 10 — revisit when the Next plugin chain ships ESLint 10 support.
import base from "@mms/config/eslint";
import next from "eslint-config-next/core-web-vitals";

const config = [...base, ...next];
export default config;
