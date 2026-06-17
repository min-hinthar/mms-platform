<!-- Title: M<milestone>·P<phase> short summary -->

## What & why

<!-- One or two lines. Link the roadmap phase. -->

Closes #
Roadmap: `ROADMAP.md` → M*.* P*.*

## Changes

-

## QA checklist (tick what this PR touches)

- [ ] Server-authoritative pricing (no client-trusted amounts reach Stripe)
- [ ] Supabase RLS correct (membership / host gating)
- [ ] Stripe webhook idempotent + signature-verified; no PAN in our code
- [ ] Accessibility (focus, aria, labels, contrast)
- [ ] No secrets committed; env only in Vercel/Actions
- [ ] `pnpm turbo lint typecheck build` green locally

## Docs / progress updated

- [ ] `ROADMAP.md` — phase box ticked or new phase added
- [ ] `CHANGELOG.md` — entry under the active version
- [ ] `docs/**` — spec / architecture / workflow updated if behavior changed
- [ ] `README.md` — only if setup, env, or surface-level capabilities changed
<!-- If none apply, add the `skip-docs` label so the gate doesn't block. -->

## Pre-merge gates (informational — Actions enforces these)

- CI · Claude PR review · Claude security review · Adversarial PR pass · Docs/progress · Vercel preview live

## Screenshots / preview

<!-- Vercel preview URL appears automatically. Add screenshots for UI changes. -->

## Reviewer notes

<!-- Anything for the Claude review / human reviewer to focus on. -->
