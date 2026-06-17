# MMS Platform

Turborepo monorepo for **Mandalay Morning Star** — the existing delivery PWA and the new QR dine-in / Scan & Go / Pickup ordering app, sharing one Supabase project, design system, and menu.

```
apps/
  delivery/   # move the existing mandalay-morning-star-delivery-app here (see below)
  qr/         # NEW QR ordering app (scaffolded)
packages/
  ui/         # design tokens (editorial-forward + Night) + Radix Sheet, Button, NumberFlow
  db/         # Supabase client + types + migrations (RLS, category-aware tax)
```

The QR app covers restaurant ordering (Dine-in / Pickup) **and grocery Scan & Go** (barcode self-checkout). See **`docs/ARCHITECTURE.md`** (full spec), **`docs/GROCERY_SCANGO.md`** (barcode flow), and **`docs/REVIEW.md`** (red-team + M1 gate).

## Quick start

```bash
corepack enable && corepack prepare pnpm@9.12.0 --activate
pnpm install
cp .env.example apps/qr/.env.local      # fill in Supabase / Stripe / PostHog
# apply the DB migration (Supabase CLI linked to your project):
supabase db push   # or paste packages/db/migrations/0001_qr_ordering.sql in the SQL editor
pnpm dev                                 # runs apps/qr on http://localhost:3000
```

## Create the GitHub repo + CI (public)

One command does it all (creates a **public** repo → unlimited Actions minutes, pushes, links Turbo cache):

```bash
bash setup.sh
# (equivalent: gh repo create mms-platform --public --source=. --remote=origin --push)
```

Secrets never live in git (`.gitignore` excludes `.env*`). They go in **Vercel** (app env) and **GitHub Actions secrets** (`gh secret set ANTHROPIC_API_KEY`). `setup.sh` prints the full list.

**Actions** (in `.github/workflows/`): `ci.yml` runs `turbo lint typecheck build` on every PR/push; `claude-review.yml` runs an automated Claude PR review + a Claude security review (install the Claude GitHub App + add `ANTHROPIC_API_KEY`).

## Deploy on Vercel

Add New → Project → import `mms-platform`, set **Root Directory = `apps/qr`** (repeat later for `apps/delivery`). Vercel auto-detects Turborepo; `apps/qr/vercel.json`'s `turbo-ignore` skips a build when the app didn't change. Push to `main` = production; every PR gets a preview URL.

## Migrate the existing delivery app

```bash
git clone https://github.com/min-hinthar/mandalay-morning-star-delivery-app apps/delivery
rm -rf apps/delivery/.git
# then: point its Supabase/Stripe imports at @mms/db, dedupe shared deps to the root,
# add a "delivery" entry to pnpm-workspace (already globbed via apps/*), run pnpm install.
```

## Scripts

`pnpm dev` · `pnpm build` · `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm db:types`

> Status: **M0 scaffold.** The QR app has working menu (RSC), a server-authoritative cart action, Stripe intent + webhook routes, a Realtime group-cart hook, the tax engine, and broad screen stubs. Build it out per the milestones in `docs/ARCHITECTURE.md`, gated by `MMS_QR_RealBuild_QA_Checklist`.
