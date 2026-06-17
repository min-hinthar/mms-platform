// apps/qr ESLint — shared monorepo preset only. `next build` runs the Next.js
// production checks; eslint-config-next's flat-compat path currently crashes on
// ESLint 9.39 (eslint-plugin-react circular ref). Re-add core-web-vitals once
// eslint-config-next ships native flat config.
import base from "@mms/config/eslint";

export default base;
