// apps/qr ESLint — shared preset + Next.js core-web-vitals. Replaces `next lint`
// (which is being deprecated) with the ESLint CLI: `eslint .`
import base from "@mms/config/eslint";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

export default [...base, ...compat.extends("next/core-web-vitals")];
