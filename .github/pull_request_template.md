<!-- Title: a conventional-commit summary with milestone context, e.g. feat(qr): M1·P1 session mint -->

## What & why

<!-- One or two lines. Link the roadmap phase and the OPEN-ITEMS rows this closes. -->

Closes #
Roadmap: `ROADMAP.md` → M*.* P*.*

## Changes

-

## QA checklist (tick what this PR touches)

<!-- QA ticks live here, against docs/context/QA-CHECKLIST.md (docs/REVIEW.md is the historical M0→W22 log). -->

- [ ] Server-authoritative pricing (no client-trusted amounts reach Stripe)
- [ ] Supabase RLS correct (membership / host gating)
- [ ] Stripe webhook idempotent + signature-verified; no PAN in our code
- [ ] Accessibility (focus, aria, labels, contrast)
- [ ] No secrets committed; env only in Vercel/Actions

## Before the push

- [ ] Pre-PR self-review sweep (`CLAUDE.md`) run on the diff
- [ ] `pnpm turbo lint typecheck build test`, `pnpm format:check`, `node scripts/check-test-env.mjs` and `pnpm check:docs` green locally (the rest of CI's fast lane: `grep -nE '^\s+(- )?run: (pnpm (check:|format:)|node scripts/)' .github/workflows/ci.yml`)
- [ ] `pnpm verify:slice --no-gate --only=<substring>` for each money/authority module touched

## Docs / progress updated

- [ ] `ROADMAP.md` — phase box ticked or new phase added
- [ ] `CHANGELOG.md` — entry under the active version
- [ ] `docs/OPEN-ITEMS.md` — swept (closed, retired or added the rows this change touches)
- [ ] `docs/**` — spec / architecture / workflow updated if behavior changed
- [ ] `README.md` — only if setup, env, or surface-level capabilities changed
<!-- If none apply, add the `skip-docs` label so the require-docs check doesn't block. -->

## Merge gates (`docs/WORKFLOW.md` §Review step 5)

<!-- Advisory until branch protection requires them (OPEN-ITEMS C28); the merge ritual is the enforcement. -->

- [ ] `@codex review` asked on the draft; every Codex round fixed-or-justified
- [ ] Blind-pass verdict posted as a PR comment, naming the head SHA it reviewed
- [ ] Green on the merge head: `codex-review` · `verify-slice` · `build` · `migrations-check + types-fresh` · `docs` · `require-docs` (a lane that did not run reads green)
- [ ] Vercel preview live and smoke-tested

Codex out of quota: the blind-pass verdict on the exact head stands in, and only the **owner** merges that head, by admin bypass, by hand (step 5(g)) — never an agent, and never past a red `verify-slice`, `build`, `docs`, `migrations-check + types-fresh` or `require-docs`.

## Screenshots / preview

<!-- Vercel preview URL appears automatically. Add screenshots for UI changes. -->

## Reviewer notes

<!-- Anything for Codex or the owner to focus on. The blind pass never reads this: it gets .review-bundle/ only. -->
