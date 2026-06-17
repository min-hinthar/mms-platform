#!/usr/bin/env bash
# One-shot setup for mms-platform. Creates a PUBLIC GitHub repo (unlimited Actions minutes),
# pushes, and links the Turborepo remote cache. Run from the repo root: bash setup.sh
set -euo pipefail

echo "==> pnpm + install"
corepack enable && corepack prepare pnpm@9.12.0 --activate
pnpm install

echo "==> git init + commit"
git init -b main 2>/dev/null || true
git add -A
git commit -m "chore: scaffold mms-platform monorepo" 2>/dev/null || echo "  (nothing to commit)"

echo "==> create PUBLIC GitHub repo + push  (requires: gh auth login)"
gh repo create mms-platform --public --source=. --remote=origin --push

echo "==> Turborepo remote cache (free on Vercel)"
npx turbo login || true
npx turbo link || true

cat <<'NEXT'

==> Done. Two manual steps left:

1) Secrets — Actions need the Anthropic key; Vercel needs the app env:
     gh secret set ANTHROPIC_API_KEY        # for the Claude PR-review + security workflows
   In Vercel → Project → Settings → Environment Variables, add:
     NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
     STRIPE_SECRET_KEY, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET,
     SUPABASE_JWT_SECRET, NEXT_PUBLIC_POSTHOG_KEY, NEXT_PUBLIC_POSTHOG_HOST
   (Never commit these — .gitignore already excludes .env*.)

2) Vercel import — Add New → Project → import mms-platform, set Root Directory = apps/qr.
   Repeat later for apps/delivery. Vercel auto-detects Turborepo; vercel.json's turbo-ignore
   skips builds when the app didn't change. Push to main = prod; every PR = a preview URL.

3) Install the Claude GitHub App on the repo so the review workflow can comment.
NEXT
