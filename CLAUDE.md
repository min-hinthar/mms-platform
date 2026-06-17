# CLAUDE.md — MMS Platform (monorepo)

Project guide for Claude Code working in this repo. Read this first. Memory of mistakes lives in `.claude/LEARNINGS.md` + `.claude/ERROR_HISTORY.md` (loaded at session start by a hook).

## Developer profile (how to work with Min)
- **Terse, action-first.** Skip preamble; lead with the implementation. One- to two-sentence rationale max.
- **Recommend, don't enumerate.** Lead with a pick; offer options only when they materially differ.
- **Verify before "done."** Run the full check (`pnpm turbo lint typecheck build`) and confirm nothing else broke. **Never trade correctness for speed; flag regressions proactively** — regressions are the #1 frustration.
- **UI/UX polish is a core requirement**, not a follow-up: animation timing, spacing, contrast, interaction.
- **Vendor choices:** when proposing a lib, give the trade-off + evidence (bundle size, activity).

## What this is
Turborepo monorepo: `apps/delivery` (existing PWA, to migrate) + `apps/qr` (dine-in/pickup + grocery scan-and-go), sharing `packages/ui`, `packages/db`, `packages/config`, one Supabase project, one Stripe account. Full spec: `docs/ARCHITECTURE.md`. Plan: `ROADMAP.md`. Loop: `docs/WORKFLOW.md`.

## Commands
```bash
pnpm dev                 # apps/qr on :3000
pnpm turbo lint typecheck build   # the gate — run before any PR
pnpm format              # prettier --write
pnpm knip                # dead-code / unused deps
supabase db push         # apply packages/db/migrations
```

## Conventions
- **One-way deps:** apps → packages, never reverse. Import from package roots (`@mms/ui`, `@mms/db`), never deep paths.
- **TypeScript strict**, `noUncheckedIndexedAccess`. No `any` on money/DB rows without a guard.
- **Server Components by default;** `"use client"` only when needed. Server Actions for mutations.
- Conventional commits (`feat:`/`fix:`/`chore:`/`docs:`). One phase = one PR (see `ROADMAP.md`).
- Tokens come from `@mms/ui/tokens.css`; don't hardcode colors. Light = editorial-forward, dark = Night.

## ⚠️ Critical / money + auth paths (extra care, CODEOWNERS-flagged)
- **Pricing is server-authoritative.** The client never sends a price — it sends an item id + modifier ids; the server (`apps/qr/lib/cart.ts`, service-role client) re-derives every amount. Never compute or trust a total client-side. The Stripe intent amount comes from `getCartTotals`, never the request body.
- **Tax** = the category-aware engine (`apps/qr/lib/tax.ts` ↔ `packages/db/migrations/0001` `mms_line_tax`). Keep the TS and SQL in sync. Tax is on the **discounted taxable base**, not a pro-rata of the aggregate.
- **RLS everywhere.** Diners are anonymous; a short-lived table-session JWT (`session_id`/`seat`/`app_role`) authorizes via `is_member`/`is_host`. Realtime group cart uses **private** channels gated by RLS on `realtime.messages`. Never expose `SUPABASE_SERVICE_ROLE_KEY` to the client.
- **Stripe = SAQ-A.** Card data lives only in the Payment Element iframe. Fulfillment is webhook-driven, signature-verified, idempotent on the PaymentIntent id (`mms_fulfill_order`).
- **Secrets** only in Vercel + GitHub Actions secrets — never in git (`.gitignore` covers `.env*`). Per-environment: test keys in preview, live in prod; migrate on a Supabase **branch**, not prod.
- Compliance: **SB-1524** service-charge disclosed; never surcharge debit; reviews ungated; **EBT/SNAP = 2027** (Forage/FNS).

## Gate before "done"
CI green (`turbo lint typecheck build`) · Claude PR review + security review addressed · the QA-checklist items the change touches ticked (`docs/REVIEW.md`) · `ROADMAP.md` box checked · `CHANGELOG.md` line added · preview smoke-tested. If you learned something non-obvious or hit a sharp edge, append it to `.claude/LEARNINGS.md`.
