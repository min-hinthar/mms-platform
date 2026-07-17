// apps/qr ESLint — shared monorepo base + Next.js core-web-vitals (a11y / perf / react-hooks).
// eslint-config-next ships a native flat-config array as of Next 16, so no FlatCompat is needed.
// Pinned to ESLint 9: its bundled eslint-plugin-react (7.x) still uses a context API removed in
// ESLint 10 — revisit when the Next plugin chain ships ESLint 10 support.
import base from "@mms/config/eslint";
import next from "eslint-config-next/core-web-vitals";

// W2c type-scale sweep — ban NUMERIC inline `fontSize` on swept files so the tokens can't regress. The
// selector matches any numeric literal that is the (or part of the) value of a `fontSize` property, so
// `fontSize: 14` and `fontSize: strong ? 20 : undefined` both fail, while `fontSize: "var(--fs-sm)"`
// passes. Directory-/file-scoped and WIDENED as each screen is swept (a repo-wide ban would fail lint on
// the not-yet-swept staff surfaces). Add a file here only once it's fully on `--fs-*` tokens.
const noNumericFontSize = {
  files: [
    "components/Checkout.tsx",
    "components/PaymentSection.tsx",
    "components/OrderTracker.tsx",
    "components/RewardsHub.tsx",
    // menu + account sweep
    "components/menu/MenuBrowser.tsx",
    "components/TablePicker.tsx",
    "components/PickupSlotSheet.tsx",
    "components/PickupSlotChip.tsx",
    "app/account/page.tsx",
    "components/AccountStatus.tsx",
    "components/AccountUpgrade.tsx",
    "components/OrderHistory.tsx",
    "components/RewardField.tsx",
  ],
  rules: {
    "no-restricted-syntax": [
      "error",
      {
        selector: "Property[key.name='fontSize'] Literal[raw=/^-?[0-9.]+$/]",
        message:
          "Use a --fs-* token (e.g. fontSize: 'var(--fs-sm)'), not a numeric fontSize — the type scale is tokenized (W2c).",
      },
    ],
  },
};

const config = [...base, ...next, noNumericFontSize];
export default config;
