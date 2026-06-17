# Changelog

All notable changes to **MMS Platform**. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this repo tracks milestones (see [`ROADMAP.md`](ROADMAP.md)), not semver releases yet.

## [Unreleased]

### Changed — Toolchain refresh to latest stable + M1 unblocking (2026-06-17)

- **Monorepo on latest stable:** pnpm 9.12→**11.7**, turbo 2.3→**2.9**, TypeScript 5.6→**6.0**, Next 16.1.2→**16.2.9**, React **19.2.7**, Stripe SDK 17→**22** (apiVersion pinned to the SDK's `2026-05-27.dahlia`, derived from the constructor type so future bumps can't drift it), `@supabase/supabase-js` **2.108**/`ssr` **0.12**, plus `@number-flow/react`, `@zxing/library`, `zustand`, Radix, Tailwind, prettier, knip. The supply-chain `minimumReleaseAge` guard auto-pinned PostHog to the latest release older than the cutoff.
- **pnpm 11 migration:** moved `overrides` from `package.json` to `pnpm-workspace.yaml`; added `allowBuilds` approval for `sharp`/`unrs-resolver` (and skipped `core-js`'s funding postinstall); bumped `pnpm/action-setup` + `setup.sh`.
- **Build fix:** `next/font/google` fetched via Turbopack's Rust fetcher failed behind a TLS-intercepting proxy; `next.config.ts` now opts Turbopack into the system trust store (no-op on Vercel) so the build is green in CI/remote sandboxes.
- **Lint upgrade:** re-enabled Next `core-web-vitals` (a11y/perf/react-hooks) — it ships a native flat config now — and fixed the warnings it surfaced (`react-hooks/exhaustive-deps` in `useGroupCart`, anonymous default exports). ESLint pinned to latest **9.x**: its bundled `eslint-plugin-react` still uses a context API removed in ESLint 10.
- **Types:** declared `@types/node` + `server-only` on `@mms/db` and set `types: ["node"]` (pnpm's symlinked store isn't picked up by TS auto-inclusion); dropped deprecated `baseUrl` (removed in TS 7); knip config modernized for v6.
- **⚠️ Data-migration blocker surfaced:** the live shared Supabase project already has `carts`/`orders`/`order_items`/`menu_items` with different shapes, so QR `0001`'s `create table if not exists` would silently no-op. Guarded the migration + documented the reconciliation plan in [`docs/DATA_RECONCILIATION.md`](docs/DATA_RECONCILIATION.md); added **M1·P1.0** to the roadmap. Nothing applied to prod.

### Added — Theme-color viewport (2026-06-17)

- `apps/qr/app/layout.tsx`: split `themeColor` out of `metadata` into a separate `viewport` export (Next 16 contract). Light/dark schemes set so the mobile address-bar matches Day and Night surfaces.

### Added — Claude config + CI (2026-06-16, learned from the delivery app)

- **Claude Code config:** root `CLAUDE.md` (monorepo guide + developer profile), `.claude/settings.json` with hooks — SessionStart **learning-context**, SessionEnd **retro**, and a PostToolUse **auto-format** (Prettier + ESLint --fix on edited files, an improvement over the delivery app) — plus `.claude/LEARNINGS.md` + `.claude/ERROR_HISTORY.md` memory, and `.mcp.json` (Supabase / GitHub / Sentry MCP).
- **Quality:** `@mms/config` shared preset (ESLint flat + Prettier) + root `eslint.config.mjs` / `prettier.config.mjs` / `.prettierignore` / `knip.json`; root scripts `lint`/`format`/`knip`.
- **Reviews/CI:** ported the delivery app's richer `claude-review.yml` (Vercel-preview-grounded, ultrathink/Opus, fork-safe, OAuth token) + `.github/claude-review-prompt.md` spec, and `ensure-preview.yml` (webhook-drop safety net).

### Planned (M1 — walking pay path)

- Sign the table-session JWT (`/api/session`); authz on every Server Action; Payment Element; webhook amount-reconcile; nonce CSP. See `ROADMAP.md`.

## [M0] — 2026-06-16 — Scaffold

### Added

- Turborepo + pnpm monorepo (`apps/qr`, `packages/{ui,db}`); `@mms/*` aliases; root config.
- `@mms/db`: Supabase browser/service/session clients, shared types, migrations.
  - `0001_qr_ordering.sql` — `table_sessions`, `session_members`, `carts`, `cart_items`, `orders`, `order_items`, `promo_codes`; RLS keyed to active-session membership (`is_member`/`is_host`); **private Realtime authorization**; **category-aware tax** (`mms_taxable`/`mms_line_tax`) replacing the flat 10.5%; menu seed; idempotent `mms_fulfill_order`.
  - `0002_grocery.sql` — UPC-keyed `grocery_items` (tax category + `ebt_eligible`) + seed.
- `@mms/ui`: editorial-forward + Night tokens, Radix-based accessible `Sheet`, NumberFlow.
- `apps/qr`: App Router shell, entry mode-picker, **menu RSC**, broad screen stubs (track/rewards/account/cart); **server-authoritative cart** actions; Stripe **create-intent** + **webhook** routes; **Realtime group-cart** hook; **grocery Scan & Go** (`BarcodeScanner` + `scanAdd` + `/grocery`); PostHog client; CSP/security headers; `next/image` policy.
- CI/reviews: `ci.yml` (turbo lint/typecheck/build), `claude-review.yml` (Claude PR + security review), `adversarial.yml` (weekly), `setup.sh` (public repo + Turbo link), `.github` templates + CODEOWNERS.
- Docs: `ARCHITECTURE.md`, `GROCERY_SCANGO.md`, `REVIEW.md`, `WORKFLOW.md`, `ROADMAP.md`.

### Fixed (post-scaffold red-team)

- Tax computed on the **discounted taxable base** (not a pro-rata of the rounded aggregate).
- Removed an over-broad host RLS `UPDATE` policy; all writes go through service-role Server Actions.
- `is_host()` reads a custom `app_role` claim (Supabase reserves top-level `role`).
- Realtime presence uses a **stable** seat from the JWT (no per-subscribe churn).
- Stripe `create-intent` passes an idempotency key.

### Lineage

Productionizes the **v7.2 prototype** (design ≈4.3/5 on a 10-dimension world-class rubric; hardened across four parallel red-teams). Prototype history lives in `../POS & Self-Serve 2026/02-design/` (`MMS_Design_Hub.html`).
