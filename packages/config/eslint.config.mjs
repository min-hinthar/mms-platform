// Shared ESLint flat config for the monorepo. Apps extend this and add framework rules
// (e.g. apps/qr adds next/core-web-vitals). Prettier owns formatting; eslint-config-prettier
// turns off any stylistic rules that would fight it.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["**/.next/**", "**/dist/**", "**/node_modules/**", "**/.turbo/**", "**/*.gen.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  }
);
