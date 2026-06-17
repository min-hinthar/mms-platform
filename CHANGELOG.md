# Changelog

All notable changes to **MMS Platform**. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this repo tracks milestones (see [`ROADMAP.md`](ROADMAP.md)), not semver releases yet.

## [Unreleased]

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
