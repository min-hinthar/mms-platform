<!-- Title: M<milestone>·P<phase> short summary -->

## What & why
<!-- One or two lines. Link the roadmap phase. -->
Closes #
Roadmap: `ROADMAP.md` → M_._ P_._

## Changes
-

## QA checklist (tick what this PR touches)
- [ ] Server-authoritative pricing (no client-trusted amounts reach Stripe)
- [ ] Supabase RLS correct (membership / host gating)
- [ ] Stripe webhook idempotent + signature-verified; no PAN in our code
- [ ] Accessibility (focus, aria, labels, contrast)
- [ ] No secrets committed; env only in Vercel/Actions
- [ ] `pnpm turbo lint typecheck build` green locally

## Screenshots / preview
<!-- Vercel preview URL appears automatically. Add screenshots for UI changes. -->

## Reviewer notes
<!-- Anything for the Claude review / human reviewer to focus on. -->
