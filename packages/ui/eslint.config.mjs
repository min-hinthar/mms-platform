// @mms/ui ESLint — the shared monorepo base + react-hooks rules for the package's hooks
// (motion.ts) and components. Mirrors how apps/qr is linted (which gets react-hooks via
// eslint-config-next); this package is a library, so it adds the plugin directly.
import base from "@mms/config/eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  ...base,
  {
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
];
