# 🔄 Workflow

How this repo is built and reviewed — tuned for a solo maintainer working from **Cowork** (planning, docs, specs, adversarial reviews) and **Claude Code remote** (implementation), with **GitHub Actions** doing automated review + CI and **Vercel** doing deploys. Same rhythm as the delivery app.

## The loop

```mermaid
flowchart LR
  A[Cowork: plan a phase<br/>spec · roadmap] --> B[Claude Code remote:<br/>branch + implement]
  B --> C[Open PR]
  C --> D{Pre-merge gates}
  D -->|CI: lint·types·build| E
  D -->|Claude PR review| E
  D -->|Claude security review| E
  D -->|Adversarial PR pass| E
  D -->|Docs/progress updated| E
  D -->|Vercel preview live| E[All green?]
  E -->|comments posted| F[Claude auto-fixes<br/>review comments]
  F --> D
  E -->|all PASS| G[Merge to main]
  G --> H[Vercel: preview → prod]
  H --> I[ROADMAP + CHANGELOG ticked at merge]
  I -->|milestone end| J[Cowork: deep adversarial pass]
  J --> A
```

## Roles

- **Cowork** — break a milestone into phases, write/refresh specs (`docs/`), update `ROADMAP.md`, and run **deep adversarial reviews** at each milestone exit.
- **Claude Code (remote)** — do the implementation on a branch, open the PR, fix review comments via the auto-fix workflow.
- **GitHub Actions** — automated **Claude PR review** + **security review** + **adversarial PR pass** + **docs gate** + **preview check** on every PR, plus a **weekly scheduled adversarial pass** over the whole repo.
- **Vercel** — preview per PR, production on `main`.

## Branches & PRs

- `main` is protected: every pre-merge gate (see below) must be PASS before merge. Force-push blocked; conversation resolution required.
- Work on phase branches: `m<milestone>/p<phase>-<slug>` — e.g. `m1/p1-session-mint`.
- **One phase = one PR** (small, reviewable). PR title: `M1·P1 session mint` + a body that links the ROADMAP phase and ticks the QA-checklist items it touches (the PR template prompts this).
- Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`); CHANGELOG entry on merge.

## Pre-merge gates (all required; all run on every PR)

1. **CI** — `ci.yml`: `pnpm turbo run lint typecheck build` across all workspaces. Node 24, frozen lockfile.
2. **Claude PR review** — `claude-review.yml` → `review` job. Inline comments on the diff against `docs/REVIEW.md`'s QA checklist (server-authoritative pricing, RLS, Stripe idempotency/PCI, a11y).
3. **Claude security review** — `claude-review.yml` → `security` job. `anthropics/claude-code-security-review` posts findings inline.
4. **Adversarial PR pass** — `adversarial-pr.yml`. Diff-scoped red-team across a11y / perf / security / product/UX. Posts a severity-ranked findings table and ends with `ADVERSARIAL_VERDICT: PASS` or `BLOCK`. The gate step parses that line — any Critical finding fails the job.
5. **Docs / progress updated** — `require-docs-update.yml`. If a PR changes `apps/**` or `packages/**`, it must also touch `docs/**`, `CHANGELOG.md`, `ROADMAP.md`, or `README.md`. Opt-out by labeling the PR `skip-docs` (use sparingly — only for truly doc-irrelevant changes like dependency bumps).
6. **Vercel preview** — `ensure-preview.yml`. Forces a preview build via the Vercel API if the GitHub→Vercel webhook drops. Smoke-test the preview before approving.

## Auto-fix review comments

When the per-PR review (Claude or human) posts comments, `claude-fix-pr-comments.yml` runs automatically:

- Triggers on `pull_request_review.submitted`, `pull_request_review_comment.created`, or a `/claude-fix` comment in the PR.
- Fetches every unresolved comment via `gh api`, edits the cited file:line, runs `pnpm turbo run lint typecheck build`, commits one conventional commit per logical group, and pushes to the PR branch.
- Re-runs gates (#1–#6) on the new commit. Loop until green.
- Posts a summary comment listing what it addressed and what it intentionally skipped (with a reason).
- Never force-pushes. Never modifies workflow secrets or branch protection.

To manually retrigger: comment `/claude-fix` on the PR.

## Weekly + per-milestone adversarial

- **Weekly** (`adversarial.yml`) — Mondays 16:00 UTC. Deep whole-repo pass that opens an issue with a severity-ranked findings table and the top 5 fixes. Labeled `adversarial`, `type:security`.
- **Per-milestone** — run from Cowork at each milestone exit (a11y / perf / security / product specialists in parallel), graded against the world-class rubric. No milestone is "done" until it clears its QA-checklist gate.

## Tracking

`ROADMAP.md` is the source of truth (milestones → phases → tasks). It mirrors to the **GitHub Project** board via labels: `milestone:M0…M6`, `phase`, `type:feat|fix|chore|docs|security`, `prio:P0…P3`. Closing a phase = check the box in `ROADMAP.md` + move the card + a CHANGELOG line (enforced by gate #5).

## Secrets & tokens

- **All Claude workflows** use a Claude Code OAuth token on the Max-plan quota (no per-token API billing): run `claude setup-token`, then `gh secret set CLAUDE_CODE_OAUTH_TOKEN`.
- **Vercel preview safety net** — `VERCEL_TOKEN` secret + `VERCEL_PROJECT_ID` / `VERCEL_TEAM_ID` / `VERCEL_REPO_ID` / `VERCEL_PROJECT_NAME` repo vars (optional; `ensure-preview.yml` no-ops without them).
- **App env** lives only in Vercel (scoped Production/Preview/Development) — never in git. See the README → Environments.

## Definition of done (per phase)

All 6 pre-merge gates green · Claude auto-fix has addressed all review comments (or noted why not) · QA-checklist items for the phase ticked · `ROADMAP.md` box checked · `CHANGELOG.md` updated · preview deploy smoke-tested · merged to `main` · production deploy verified.
