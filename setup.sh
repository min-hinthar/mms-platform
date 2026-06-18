#!/usr/bin/env bash
# One-shot setup for mms-platform. Creates a PUBLIC GitHub repo (unlimited Actions minutes),
# pushes, and links the Turborepo remote cache. Run from the repo root: bash setup.sh
set -euo pipefail

echo "==> pnpm + install"
corepack enable && corepack prepare pnpm@11.7.0 --activate
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

echo "==> Tracking: labels + milestones + Project board (safe to re-run)"
for l in "milestone:M0" "milestone:M1" "milestone:M2" "milestone:M3" "milestone:M4" "milestone:M5" "milestone:M6" \
         "phase" "adversarial" "adversarial-signed-off" "type:feat" "type:fix" "type:chore" "type:docs" "type:security" \
         "prio:P0" "prio:P1" "prio:P2" "prio:P3"; do
  gh label create "$l" --force >/dev/null 2>&1 || true
done
for m in "M1 Walking pay path" "M2 Tax/promos/scheduling" "M3 Group cart" "M4 Rewards" "M5 Migrate delivery" "M6 Kiosk/EBT"; do
  gh api repos/:owner/:repo/milestones -f title="$m" >/dev/null 2>&1 || true
done
gh project create --owner @me --title "MMS Platform" >/dev/null 2>&1 || echo "  (create the Project board in the GitHub UI if this org needs it)"

cat <<'NEXT'

==> Done. Two manual steps left:

1) Secrets — Actions use a Claude Code OAuth token (Max-plan quota, no API billing):
     claude setup-token                          # prints sk-ant-oat01-...
     gh secret set CLAUDE_CODE_OAUTH_TOKEN        # paste it (for PR review + security + adversarial)
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
