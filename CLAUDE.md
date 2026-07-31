# CLAUDE.md — MMS Platform (monorepo)

Project guide for Claude Code working in this repo. Read this first. Memory of mistakes lives in `.claude/LEARNINGS.md` + `.claude/ERROR_HISTORY.md` (loaded at session start by a hook). **Resuming work? Read `docs/HANDOFF.md` first** — current state + the next tasks.

## Developer profile (how to work with Min)

- **Terse, action-first.** Skip preamble; lead with the implementation. One- to two-sentence rationale max.
- **Recommend, don't enumerate.** Lead with a pick; offer options only when they materially differ.
- **Verify before "done."** Run the full check (`pnpm turbo lint typecheck build`) and confirm nothing else broke. **Never trade correctness for speed; flag regressions proactively** — regressions are the #1 frustration.
- **UI/UX polish is a core requirement**, not a follow-up — build every screen to `docs/prototype/v7.2.html` + `docs/context/DESIGN-RESEARCH.md` and the `docs/context/RUBRIC.md` ≥4.3 bar in the **first commit** (tokens not hardcoded colors, animation timing, spacing, contrast, real semantics/44px/a11y per QA-CHECKLIST §A, brand-voice microcopy); run the **Pre-PR self-review sweep** (below) on your diff before the PR — don't let the review surface craft gaps (the review/adversarial gates now cross-check fidelity).
- **Vendor choices:** when proposing a lib, give the trade-off + evidence (bundle size, activity).

## What this is

Turborepo monorepo for the **QR** app: `apps/qr` (dine-in/pickup + grocery scan-and-go) + `packages/ui`, `packages/db`, `packages/config`. The **delivery** PWA is a **separate repo** (`min-hinthar/mandalay-morning-star-delivery-app`) — **not** in this monorepo. The two apps share **one Stripe account** and each run on their **own** Supabase project (QR `fasnpdhtvqtzjlvruqcu`, delivery `ukuzkhuppqwtrdkjqrkv` — see `docs/BACKEND_ARCHITECTURE.md`; `docs/DATA_RECONCILIATION.md` is the superseded shared-project history). **M5 (reshaped 2026-06-24): repos stay separate; QR _learns from_ delivery** — adopts its hardened mobile/a11y/motion patterns + reusable primitives (`docs/M5_DESIGN.md`, `docs/QR_FROM_DELIVERY.md`); full co-location reconsidered at M6. Full spec: `docs/ARCHITECTURE.md`. Plan: `ROADMAP.md`. Loop: `docs/WORKFLOW.md`. **Research context** (the _why_ — decisions, QA gate, rubric, red-team standards, the v7.2 prototype): `docs/context/INDEX.md`.

## Commands

```bash
pnpm dev                 # apps/qr on :3000
pnpm turbo lint typecheck build test   # the gate — run before any PR
pnpm verify:slice        # the MECHANICAL pre-PR gate: gate + 18 mutations + orphan check (~1 min)
                         # ⚠️ REWRITES apps/qr/lib/{totals-math,split-math,tax,permissions}.ts IN PLACE
                         # and restores them (originals spooled to node_modules/.cache/verify-slice,
                         # auto-recovered next run if killed). Never run two against one checkout.
pnpm verify:slice --no-gate --only=totals   # iterate on one module
pnpm format              # prettier --write
pnpm knip                # dead-code / unused deps
supabase db push         # apply packages/db/migrations
```

## Conventions

- **One-way deps:** apps → packages, never reverse. Import from package roots (`@mms/ui`, `@mms/db`), never deep paths.
- **TypeScript strict**, `noUncheckedIndexedAccess`. No `any` on money/DB rows without a guard.
- **Server Components by default;** `"use client"` only when needed. Server Actions for mutations.
- Conventional commits (`feat:`/`fix:`/`chore:`/`docs:`). One phase = one PR (see `ROADMAP.md`).
- **Branches: `claude/<type>/<slug>`** (conventional-commit type + kebab slug with milestone/phase context) — e.g. `claude/feat/m1-p1-session-mint`, `claude/docs/research-context`. CI (build · lint · typecheck · migrations-check) runs every push and gates merges. **There is NO Claude review in CI** — `review`/`security`/`adversarial-pr` are **zero-token, always-green stub checks** that exist only to satisfy branch protection. **The review IS an in-session fresh-context adversarial subagent** (the Agent tool) run **pre-PR _and_ pre-merge** (see the Pre-PR sweep below) — fix its findings before opening/merging, and **post its verdict as a PR comment** for the record. No metered Action, no `review`/`adversarial` label ritual. **Don't front-load a happy-path build and lean on review to tease out the hardening — run the _Pre-PR self-review sweep_ (below), ending with the adversarial subagent, on your diff first; war stories in `.claude/LEARNINGS.md` #44/#47.** Details: `docs/WORKFLOW.md`.
- Tokens come from `@mms/ui/tokens.css`; don't hardcode colors. Light = editorial-forward, dark = Night.

## ⚠️ Critical / money + auth paths (extra care, CODEOWNERS-flagged)

- **Pricing is server-authoritative.** The client never sends a price — it sends an item id + modifier ids; the server (`apps/qr/lib/cart.ts`, service-role client) re-derives every amount. Never compute or trust a total client-side. The Stripe intent amount comes from `getCartTotals`, never the request body.
- **Tax** = the category-aware engine (`apps/qr/lib/tax.ts` ↔ `supabase/migrations/20260618000000_qr_platform_init.sql` `mms_line_tax`) — **both halves are now pinned by tests** (`lib/tax.test.ts` + `supabase/tests/tax_parity_test.sql`), so a one-sided edit reddens exactly one CI job. Keep the TS and SQL in sync. Tax is on the **discounted taxable base**, not a pro-rata of the aggregate.
- **RLS everywhere.** Diners are anonymous; a short-lived table-session JWT (`session_id`/`seat`/`app_role`) authorizes via `is_member`/`is_host`. Realtime group cart uses **private** channels gated by RLS on `realtime.messages`. Never expose `SUPABASE_SERVICE_ROLE_KEY` to the client.
- **Stripe = SAQ-A.** Card data lives only in the Payment Element iframe. Fulfillment is webhook-driven, signature-verified, idempotent on the PaymentIntent id (`mms_fulfill_order`).
- **Secrets** only in Vercel + GitHub Actions secrets — never in git (`.gitignore` covers `.env*`). Per-environment: test keys in preview, live in prod; migrate on a Supabase **branch**, not prod.
- Compliance: **SB-1524** service-charge disclosed; never surcharge debit; reviews ungated; **EBT/SNAP = 2027** (Forage/FNS).

## Pre-PR self-review sweep (read your own diff _before_ opening the PR)

The review/adversarial gates catch **escapes** — they are not your first pass. The recurring waste across M1 was shipping a correct-but-incomplete first commit and letting the gate tease out craft round-by-round (P1.2 took 5 passes; P1.5 took 3). The first commits were clean on the load-bearing parts (money/auth/RLS/tokens); the gate kept finding the same **three deferred categories** — so sweep the diff against them before opening, where a fix is one edit, not a fix-and-re-label cycle:

- **Money / auth / RLS / DB** — every mutation authz'd with the status guard **in the SQL statement** (not just the client); inputs bounded at the DB (Zod `.max()` **+** column `CHECK`); new `SECURITY DEFINER` fns `revoke … from public` + `grant … to service_role`; amounts server-derived (never a client total); RLS on every new table **and** Realtime path; migrations guarded + idempotent, no `types-fresh` drift, never DDL prod.
- **a11y — sweep _every_ interactive/region element, not just the layout** (QA-CHECKLIST §A): ≥44px touch targets; an accessible name on each control/list/region (`aria-label`/`-labelledby`); `role="list"` when `list-style:none`; **one** live region per view (no redundant `aria-live` on `role="status"`/`alert`); focus moved on remove / route / step change; decorative glyphs + emoji `aria-hidden`; a `prefers-reduced-motion` off-switch on any animation.
- **Error / recovery paths** — every `await` / `{ error }` is handled or a **commented, deliberate** swallow (a silent one → a broken session or a stuck screen); every async UI has a **loading _and_ a failure/recovery** state (never strand the user); fail fast on unrecoverable errors instead of burning a full retry budget; on serverless, drain side-effects with `after()` (don't couple the response to them).
- **Copy / fidelity** — strings **verbatim** from `docs/prototype/v7.2.html`; no promise the code doesn't keep ("live status here" only where it's wired); honest microcopy (no fabricated ETAs/counts); tokens, never hardcoded colors.
- **`pnpm verify:slice` FIRST — the mechanical gate, before the subagent.** Three review rounds across W9a/W8 each returned BLOCK, and nearly every finding reduced to one thing: **a guard was written and never made to fail.** A green test file was shipped as proof. `scripts/verify-slice.mjs` answers "can this guard fail?" mechanically — it runs the gate, applies 18 semantic mutations to the money/authority modules (each must turn its owning suite RED), and mirrors CI's orphan-suite check. ~1 minute, zero tokens; the review round that found the same class cost ~1M tokens and 56 minutes. **A SURVIVING mutant means the fixture is degenerate** — two code paths produce identical numbers on it — so find inputs that _separate_ them (search numerically), don't just pile on assertions. A **STALE** mutant (pattern no longer matches) is a failure too, not a skip. Add a mutant whenever you add a money/authority rule.
- **The red-first rule.** Never write a guard you have not watched fail: a test, a lint rule, a CI step, a SQL assert. Induce the violation, see it go red, revert. Two live bugs shipped past "proved, not assumed" claims that had only been proved for one shape (a bare `/menu` surviving as a default parameter; a `.test.tsx` orphan the guard whitelisted by directory).
- **Never transcribe a number into an assertion.** Compute it in the shell and paste the output. A value that crosses from prose (a subagent summary, a plan doc) into an expectation is how `-600 → -59` shipped when the real value is `-58`.
- **Adversarial subagent (independent eyes) — this IS the review.** As the LAST pre-PR step _and_ again pre-merge, spawn a **fresh-context subagent** (the Agent tool) to adversarially review the diff across the four lenses (a11y · perf · security/privacy · product-UX); fix its findings _before_ opening / before merging, and **post the subagent's verdict + findings as a PR comment** for the record. CI runs no Claude review — only zero-token green stub checks — so this in-session pass is the only real gate. (M1·P1.5 burned 6 metered Action rounds + a disable/fix/re-label dance doing review reactively in CI — this replaces exactly that.)

Ten minutes here beats a metered gate round per finding. The gate is the backstop, not the author. See `.claude/LEARNINGS.md` #44/#47 for the war stories.

## Gate before "done"

**`pnpm verify:slice` green** · CI green (`turbo lint typecheck build`) · Claude PR review + security review addressed · the QA-checklist items the change touches ticked (`docs/context/QA-CHECKLIST.md`, progress tracked in `docs/REVIEW.md`) · `ROADMAP.md` box checked · `CHANGELOG.md` line added · **`docs/OPEN-ITEMS.md` swept** (close/retire/add the items your change touches — it's the single registry; W0) · preview smoke-tested. If you learned something non-obvious or hit a sharp edge, append it to `.claude/LEARNINGS.md`.
