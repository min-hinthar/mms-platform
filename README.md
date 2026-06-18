<div align="center">

# ☕ MMS Platform

### Mandalay Morning Star — delivery, dine-in QR ordering & grocery scan-and-go, in one monorepo

[![CI](https://github.com/min-hinthar/mms-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/min-hinthar/mms-platform/actions/workflows/ci.yml)
[![Claude PR Review](https://github.com/min-hinthar/mms-platform/actions/workflows/claude-review.yml/badge.svg)](https://github.com/min-hinthar/mms-platform/actions/workflows/claude-review.yml)
[![Next.js](https://img.shields.io/badge/Next.js-16.2.9-black?logo=next.js)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19.2.7-61DAFB?logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript)](https://www.typescriptlang.org)
[![Tailwind](https://img.shields.io/badge/Tailwind-v4-06B6D4?logo=tailwindcss)](https://tailwindcss.com)
[![Turborepo](https://img.shields.io/badge/Turborepo-2.x-EF4444?logo=turborepo)](https://turbo.build)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20RLS-3FCF8E?logo=supabase)](https://supabase.com)
[![Stripe](https://img.shields.io/badge/Stripe-Payment%20Element-635BFF?logo=stripe)](https://stripe.com)
[![License](https://img.shields.io/badge/license-private-lightgrey)](#-license)

**Build:** M0 scaffold ✅ · **Grade:** design ≈4.3/5 (world-class rubric) · **Stack:** $0/mo software (Stripe per-txn only)

</div>

---

## 📑 Table of contents

- [Overview](#-overview)
- [Architecture](#-architecture)
- [Apps & packages](#-apps--packages)
- [Features](#-features)
- [Status & roadmap](#-status--roadmap)
- [Tech stack](#-tech-stack)
- [Quick start](#-quick-start)
- [Environments (Supabase & Stripe)](#-environments-supabase--stripe)
- [Deploy on Vercel](#-deploy-on-vercel)
- [CI, reviews & workflow](#-ci-reviews--workflow)
- [Security & compliance](#-security--compliance)
- [Docs index](#-docs-index)
- [License](#-license)

---

## 🌅 Overview

One Turborepo monorepo for the whole Mandalay Morning Star ordering surface, all on **one Supabase project, one Stripe account, one design system, and one menu/loyalty ledger**:

- **`apps/delivery`** — the existing multi-day delivery PWA (Next 16 · React 19 · Tailwind 4 · Supabase · Stripe · Burmese-gem loyalty · v1.9 launch-ready). Migrated in; reused, not rebuilt.
- **`apps/qr`** — the new in-store app: **Dine-in / Pickup** restaurant ordering **and** **Grocery Scan & Go** (barcode self-checkout). Server-authoritative cart, category-aware CA tax, multi-device group cart, Stripe Payment Element.

The QR app is the productionization of the **v7.2 prototype** (graded ≈4.3/5 against a 10-dimension world-class rubric, hardened across four parallel red-teams). Design language: **editorial-forward light + “v4 Night” dark**, bilingual EN/Burmese, focus-managed accessibility, SB-1524 transparency.

## 🏗 Architecture

```mermaid
graph TD
  subgraph apps
    D[apps/delivery<br/>delivery PWA]
    Q[apps/qr<br/>dine-in · pickup · grocery]
  end
  subgraph packages
    UI[@mms/ui<br/>tokens · Radix Sheet · NumberFlow]
    DB[@mms/db<br/>Supabase client · types · migrations]
  end
  Q --> UI
  Q --> DB
  D --> UI
  D --> DB
  DB --> SUPA[(Supabase<br/>Postgres + RLS + Realtime)]
  Q --> STRIPE[[Stripe<br/>PaymentIntent + webhook]]
  Q --> PH[[PostHog<br/>funnel · flags]]
```

**Order → pay (server-authoritative):**

```mermaid
sequenceDiagram
  participant C as Client (apps/qr)
  participant S as Server Action / Route
  participant DB as Supabase (RLS)
  participant ST as Stripe
  C->>S: addItem(cartId, itemId, mods)  %% never a price
  S->>DB: re-derive price + category-aware tax, write cart_item
  C->>S: POST /api/stripe/create-intent (cartId, tip)
  S->>DB: getCartTotals() → server amount
  S->>ST: PaymentIntent(amount) → clientSecret
  C->>ST: Payment Element (Apple/Google Pay, card)  %% PAN stays in Stripe
  ST-->>S: webhook payment_intent.succeeded (signed, idempotent)
  S->>DB: mms_fulfill_order() → order snapshot, gems
```

The client **never computes a price**; the server re-derives every amount from the menu row + validated modifiers. Group ordering rides **private Supabase Realtime channels authorized by RLS** off a short-lived table-session JWT. Full spec in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## 📦 Apps & packages

| Workspace       | What                                                                              | Status                                                                                     |
| --------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `apps/qr`       | QR dine-in/pickup + grocery scan-and-go                                           | 🟡 M0 scaffold (working menu RSC, server cart, Stripe routes, Realtime hook, grocery scan) |
| `apps/delivery` | existing delivery PWA                                                             | ⬜ to migrate in (`git clone` → `apps/delivery`)                                           |
| `@mms/ui`       | design tokens (editorial-forward + Night) · Radix Sheet · NumberFlow              | ✅ scaffolded                                                                              |
| `@mms/db`       | Supabase clients (browser/service/session) · types · SQL migrations (RLS, tax fn) | ✅ scaffolded                                                                              |

## ✨ Features

**Restaurant (Dine-in / Pickup)** — mode picker · skeleton-loaded menu (RSC) · item modifiers + AI upsell · optimistic add → stepper · number-roll totals · per-person split · group cart + host lock · promo codes · live tracker · rewards (shared gem ledger) · order history + reorder · emoji feedback + ungated review triage · bilingual EN/MY · light/Night themes.

**Grocery Scan & Go** — phone-camera **barcode scanning** (native `BarcodeDetector` + `@zxing` fallback) · UPC catalog · category-aware tax (food exempt / retail taxable) · **EBT-eligibility tags** (SNAP checkout = 2027 / Forage) · kiosk + handheld-scanner ready. See [`docs/GROCERY_SCANGO.md`](docs/GROCERY_SCANGO.md).

**Platform** — server-authoritative cart + pricing · category-aware CA tax engine (replaces the flat 10.5%) · Stripe Payment Element (SAQ-A) · multi-device group cart (Realtime + RLS) · PostHog funnel · CSP/security headers · WCAG-grade accessibility.

## 📊 Status & roadmap

Tracked in [`ROADMAP.md`](ROADMAP.md) (milestones → phases → tasks) and the [GitHub Project board](https://github.com/min-hinthar/mms-platform/projects). Changelog: [`CHANGELOG.md`](CHANGELOG.md).

| Milestone                            | Scope                                                                                                         | State   |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ------- |
| **M0** Scaffold                      | monorepo, RLS migration, tax fn, server cart, Stripe routes, Realtime hook, grocery scan, CI/reviews          | ✅ done |
| **M1** Walking pay path              | sign table-session JWT · Payment Element + cart-create · authz Server Actions · webhook reconcile · nonce CSP | 🟡 next |
| **M2** Tax + promos + scheduling     | server promos · honest pickup slots · grocery sessions                                                        | ⬜      |
| **M3** Group cart                    | table session + RLS + Realtime presence + host lock (multi-device)                                            | ⬜      |
| **M4** Rewards & account             | reuse delivery gem ledger · history/reorder                                                                   | ⬜      |
| **M5** Migrate delivery app          | bring `apps/delivery` into the monorepo                                                                       | ⬜      |
| **M6** Kiosk + Terminal + EBT (2027) | Stripe Terminal · Forage EBT · handheld scanner                                                               | ⬜      |

> **M1 gate before any real card:** see [`docs/REVIEW.md`](docs/REVIEW.md). Every milestone exits against [`MMS_QR_RealBuild_QA_Checklist`](../POS%20%26%20Self-Serve%202026/02-design/MMS_QR_RealBuild_QA_Checklist.md).

## 🧰 Tech stack

Next.js 16 (App Router, RSC, Server Actions) · React 19 · TypeScript strict · Tailwind v4 · Turborepo + pnpm · Supabase (Postgres · RLS · Realtime · Auth) · Stripe (Payment Element + webhooks) · PostHog (free tier) · Radix UI · NumberFlow · `@zxing/library`. The **$0/month free stack** is documented in [`MMS_QR_Free_Kit_Map`](../POS%20%26%20Self-Serve%202026/02-design/MMS_QR_Free_Kit_Map.md).

## 🚀 Quick start

```bash
corepack enable && corepack prepare pnpm@11.7.0 --activate
pnpm install
cp .env.example apps/qr/.env.local           # fill in Supabase / Stripe / PostHog (see below)
supabase db push                              # or paste packages/db/migrations/*.sql in the SQL editor
pnpm dev                                       # apps/qr on http://localhost:3000
```

One-shot repo + CI bootstrap (creates a **public** repo → unlimited Actions, links Turbo cache):

```bash
bash setup.sh
```

## 🔐 Environments (Supabase & Stripe)

**Use the same Supabase project and the same Stripe account** as the delivery app — that's the point of the monorepo (shared menu, loyalty, customers). The new tables are _additive_ migrations. Manage the differences **per environment**, not per project:

|                                | Supabase                                                          | Stripe                                                                                    |
| ------------------------------ | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Production** (Vercel `main`) | live project · service-role + `SUPABASE_JWT_SECRET` (server-only) | **live** keys `sk_live_…` · the QR app's **own** webhook endpoint → its **own** `whsec_…` |
| **Preview / Dev** (PRs, local) | a **Supabase branch** or dev project — never migrate prod blindly | **test** keys `sk_test_…` · test webhook secret                                           |

Two rules that keep the live delivery app safe:

1. **Apply migrations on a Supabase branch first**, review the RLS, then promote — don't run `0001/0002` straight at production.
2. **Reuse the delivery app's existing menu & loyalty tables.** The scaffold's `menu_items`/`grocery_items` are placeholders so the QR app runs standalone; on the shared project, point `apps/qr/lib/cart.ts` + the menu page at the delivery app's real menu table and add only the new tables (`table_sessions`, `carts`, `grocery_items`, …).

Set values in **Vercel → Project → Settings → Environment Variables** (scoped Production/Preview/Development) and never commit them (`.gitignore` excludes `.env*`). Full list in [`.env.example`](.env.example).

## ▲ Deploy on Vercel

One Vercel **Project per app**. Import `mms-platform`, set **Root Directory = `apps/qr`** (repeat later for `apps/delivery`). Vercel auto-detects Turborepo; [`apps/qr/vercel.json`](apps/qr/vercel.json)'s `turbo-ignore` skips a build when the app didn't change. Push to `main` = production; every PR = a preview URL. Details: [Vercel monorepos](https://vercel.com/docs/monorepos/turborepo).

## 🤖 CI, reviews & workflow

| Workflow                                                     | Trigger         | Does                                                                                                                         |
| ------------------------------------------------------------ | --------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| [`ci.yml`](.github/workflows/ci.yml)                         | PR / push       | `turbo lint typecheck build` (cached)                                                                                        |
| [`claude-review.yml`](.github/workflows/claude-review.yml)   | PR              | **Claude PR review** grounded in the live Vercel preview (ultrathink/Opus) + **security review** — inline comments + summary |
| [`ensure-preview.yml`](.github/workflows/ensure-preview.yml) | PR              | safety net — force a Vercel preview if the GitHub→Vercel webhook drops the commit                                            |
| [`adversarial.yml`](.github/workflows/adversarial.yml)       | weekly + manual | deep **adversarial pass** vs the QA checklist → opens an issue                                                               |

Reviews use a **Claude Code OAuth token** (Max-plan quota): `claude setup-token` → `gh secret set CLAUDE_CODE_OAUTH_TOKEN`; the review spec is [`.github/claude-review-prompt.md`](.github/claude-review-prompt.md). **Quality:** ESLint + Prettier + knip via a shared `@mms/config` preset (`pnpm lint` / `pnpm format` / `pnpm knip`). **Claude Code** in this repo is configured by [`CLAUDE.md`](CLAUDE.md) + [`.claude/`](.claude) (settings, a post-edit auto-format hook, session-memory hooks, `LEARNINGS`/`ERROR_HISTORY`) and [`.mcp.json`](.mcp.json) (Supabase / GitHub / Sentry MCP). Day-to-day loop: [`docs/WORKFLOW.md`](docs/WORKFLOW.md). Contributing + templates: [`.github/`](.github).

## 🛡 Security & compliance

Server-authoritative pricing (no client-trusted amounts) · Supabase **RLS** on every table + private Realtime · Stripe **PCI SAQ-A** (PAN only in Stripe's iframe) · server-validated promos · CSP/security headers · **SB-1524** service-charge disclosure · **never** surcharge debit · **EBT/SNAP deferred to 2027** (Forage + FNS, 50%-rule). Pre-launch gate: [`docs/REVIEW.md`](docs/REVIEW.md) + the QA checklist.

## 📚 Docs index

[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · [`docs/GROCERY_SCANGO.md`](docs/GROCERY_SCANGO.md) · [`docs/REVIEW.md`](docs/REVIEW.md) · [`docs/WORKFLOW.md`](docs/WORKFLOW.md) · [`ROADMAP.md`](ROADMAP.md) · [`CHANGELOG.md`](CHANGELOG.md)

## 📄 License

Private © Mandalay Morning Star LLC. The repo is public for free CI/Actions and transparency; the code is not licensed for reuse.
