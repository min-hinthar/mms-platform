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

## Where things stand (2026-08-29)

Shipped through **W22c** (the gesture layer), then the menu's first screen (**M131–M139**), then
**#240–#242** — the Codex back-sweep and its follow-through (#241 the CI fast-lane teeth; #242 the
four leftovers M146 · M147 · M148 · M150). What that arc changed about how you work here, not just
what runs:

- **The Codex wait is a required check — and #241 is the proof it must be REQUIRED, not advisory.**
  `require-codex-review.yml` is RED until Codex has reviewed the PR's CURRENT head, publishing its
  verdict as a check run named **`codex-review`** against `pr.head.sha`. ⚠️ **It is not yet wired
  into branch protection (OPEN-ITEMS C16, owner-only)** — and #241 was squash-merged **eleven
  seconds after that check went red on its head**, by the same session that built the gate, putting
  a money-path commit (`8f2b11b`) on `main` unreviewed. Until C16 is wired, the merge ritual in
  `docs/WORKFLOW.md` (final push → ready → `@codex review` → WAIT for a summary saying "Codex has
  reviewed" the head → triage, looping any fix push back through the wait → merge) is all that
  stands between the gate and #241 happening again. Wire `codex-review`, never
  the retired `codex-reviewed`.
- **Guards get audited harder than the code they guard.** Thirteen Codex findings across #241/#242;
  **eleven were in guards written that same session**, zero in the product code changed beside them
  — every one a matcher satisfied by a _name, substring, count, position, or constant_ while the
  guarded _behaviour_ regressed (a comment, a dead `{false && …}` branch, an `await Promise.all`
  reorder). The distilled rules live in `.claude/LEARNINGS.md` **#60**; the short form is in the
  Pre-PR sweep below.
- **The money-path promo pin moved.** The stale-grant release now runs from the NEXT attempt in
  `create-intent`, not from the decline webhook — an inline decline re-confirms the SAME
  PaymentIntent, so clearing the pin there charged an amount fulfillment could not re-derive. Read
  `releasePromoGrantFor`'s docblock in `apps/qr/lib/lock.ts` before touching any of it; the remaining
  concurrent-attempt hole is **OPEN-ITEMS M151** (high) and needs a `qr_carts.live_payment_intent_id`
  column, i.e. a prod migration.
- **The CI fast lane grew teeth** (T6 · M149). `format:check`, `check:migration-versions` and
  `check:promo-pin` now run in `ci.yml` beside `check:docs` / `check:theme` / `check:types-sorted` —
  all file-read-only, seconds, no build and no DB. Before this, prettier drift merged silently (it
  DID: #240 landed an unformatted `webhook/route.ts` with every check green), and both correctness
  guards were reachable only through a local `verify:slice` nobody is obliged to run.

**The backlog is `docs/OPEN-ITEMS.md` and it is large** — 148 open rows (measured 2026-08-29), and
**90 of them sit in Money / security / hardening, so the bulk of what is left IS code.** The
non-code minority gates specific arcs: owner config (C1–C16, 10 open), a photo shoot (C5), hardware
(C7), a grocery SKU import (G1), and the prod-migration items blocked on the divergent history
(M123 · M124 · M125 · M151). Sweep it before claiming anything is done.

## Commands

```bash
pnpm dev                 # apps/qr on :3000
pnpm turbo lint typecheck build test   # the gate — run before any PR
pnpm verify:slice        # the MECHANICAL pre-PR gate: money-path coverage guard (a changed money
                         # file MUST have a mutant, or an in-file `verify:slice-exempt — <reason>`)
                         # + photo-filter grep + gate + 275 mutations + orphan check (a few minutes)
                         # ⚠️ REWRITES the 63 money/authority modules it mutates IN PLACE (60 under
                         # apps/qr/lib, plus create-share-intent, setup-intent and board routes) and
                         # restores them. It ABORTS if a target file is DIRTY — commit or stash
                         # first. ⚠️ ONE RUN PER CHECKOUT, and BOTH failure modes lie: a run can
                         # STALL alive-but-idle (seen: ~5h, empty output), and two overlapping runs
                         # rewrite each other's modules so the second reports "✗ These suites fail
                         # BEFORE any mutation: <file>" — which reads exactly like a real defect and
                         # is not. On a stall or a surprising pre-flight failure: kill ALL runs,
                         # `git checkout -- .`, confirm clean, start exactly one. Never report a
                         # result whose run you did not watch finish. ⚠️ AND NEVER COMMIT WHILE A
                         # RUN IS LIVE — the dirty-tree abort protects the RUN from your edits, not
                         # your COMMIT from the run: at every instant one tracked module on disk is a
                         # deliberately-broken version of itself, so `git commit -am` snapshots a
                         # mutant. #250 pushed `split.ts`'s `await releaseHold(pi)` → `"released"`
                         # inside a DOCS-only commit that way; CI surfaced it as a failure in a file
                         # the PR never touched (LEARNINGS #74). `pgrep -f "[v]erify-slice"` before
                         # any commit — bracket the first char or the pattern matches your own shell.
                         # Measure with:
                         #   grep -oE '^\s+file: "[^"]+"' scripts/verify-slice.mjs | sort -u | wc -l
pnpm verify:slice --no-gate --only=totals   # iterate on one module
pnpm format              # prettier --write
pnpm knip                # dead-code / unused deps
pnpm check:migration-versions   # one version per migration + the <timestamp>_name.sql shape the
                         # CLI matches. A duplicate prefix fails only at INSERT into
                         # schema_migrations — after a whole stack has started (M17 cost a CI cycle);
                         # a malformed name is SKIPPED silently. Runs inside verify:slice too.
pnpm check:docs          # tables render in EVERY tracked .md (GFM header/delimiter parity — prettier
                         # INTRODUCES breaks) + live-state counts (README · OPEN-ITEMS · HANDOFF)
                         # measured via `vitest list`, never transcribed + MENU_REFERENCE fresh
# ⚠️ THE QR PROD MIGRATION HISTORY IS DIVERGENT FROM THIS REPO — read before any apply.
# Measured 2026-08-27: prod's supabase_migrations.schema_migrations holds 97 rows whose version
# stamps are ALL MCP-generated and share ZERO values with the repo filenames (repo
# 20260618000000_qr_platform_init.sql vs prod 20260618063513 qr_platform_init).
#
# ⚠️ WHAT I HAVE AND HAVE NOT MEASURED, because this warning has now been wrong twice by inferring
# CLI behaviour instead of observing it. MEASURED: the zero-overlap above, from prod's own history
# table. NOT MEASURED: what `db push` actually does here — there is no DB connection string in the
# agent environment, so `--dry-run` could not be executed against prod.
#
# Draft 1 said plain `db push` replays from `create table menu_categories`. Wrong — that is the
# `--include-all` reading of the help text. Draft 2 then said `--include-all` WOULD force that
# replay and is "genuinely destructive". Also unverified: Codex reports (#236, round 2) that the
# CLI's `FindPendingMigrations` rejects remote versions absent from the local directory regardless
# of the flag, and that `includeAll` only admits local migrations preceding the latest remote
# version — so with 97 remote-only stamps BOTH forms stop before applying anything.
#
# What is safe to rely on: `db push` in ANY form cannot be used here until the histories are
# reconciled. Do not restate a failure mode you have not run.
#
# So: apply ONE FILE AT A TIME with the Supabase MCP `apply_migration` — the path every migration
# on this project has actually taken — and VERIFY the objects THAT FILE creates before the next
# (functions: signature + shape count + has_function_privilege; columns/indexes/policies/data:
# information_schema or pg_catalog, since a column-only migration leaves no pg_proc row to check).
# Reconciling the two histories once with `supabase migration repair`, after verifying each body,
# is the real fix and is filed as M125.
supabase db push         # ⚠️ LOCAL / BRANCH STACKS ONLY — QR prod history is divergent, see above
```

## Conventions

- **One-way deps:** apps → packages, never reverse. Import from package roots (`@mms/ui`, `@mms/db`), never deep paths.
- **TypeScript strict**, `noUncheckedIndexedAccess`. No `any` on money/DB rows without a guard.
- **Server Components by default;** `"use client"` only when needed. Server Actions for mutations.
- Conventional commits (`feat:`/`fix:`/`chore:`/`docs:`). One phase = one PR (see `ROADMAP.md`).
- **Branches: `claude/<type>/<slug>`** (conventional-commit type + kebab slug with milestone/phase context) — e.g. `claude/feat/m1-p1-session-mint`, `claude/docs/research-context`. CI (build · lint · typecheck · test · migrations-check + types-fresh · the SQL tests — every load-bearing `supabase/tests/*.sql` is named EXPLICITLY in `ci.yml`, so add yours to that list) runs every push and gates merges, plus **`require-docs-update`**: a PR touching `apps/**`/`packages/**` must also touch `docs/**`, `CHANGELOG.md`, `ROADMAP.md` or `README.md` (or carry `skip-docs`). **There is NO Claude review in CI** — the `review`/`security`/`adversarial-pr` stub checks that once existed only to satisfy branch protection are **retired**; `ci.yml`, `require-docs-update.yml`, `ensure-preview.yml` and `require-codex-review.yml` are the only workflows, so don't go looking for those statuses. **The review IS an in-session fresh-context adversarial subagent** (the Agent tool) run **pre-PR _and_ pre-merge** (see the Pre-PR sweep below) — fix its findings before opening/merging, and **post its verdict as a PR comment** for the record. No metered Action, no `review`/`adversarial` label ritual. **Don't front-load a happy-path build and lean on review to tease out the hardening — run the _Pre-PR self-review sweep_ (below), ending with the adversarial subagent, on your diff first; war stories in `.claude/LEARNINGS.md` #44/#47.** Details: `docs/WORKFLOW.md`.
- Tokens come from `@mms/ui/tokens.css`; don't hardcode colors. Light = editorial-forward, dark = Night.
- **Three W22r singletons — read from them, never re-derive (the "name it ONCE" rule applied to shapes and identity).** `apps/qr/lib/brand.ts` is the restaurant's identity (name · street address · both phone forms · email · socials, every string verbatim from the delivery repo's production constants) — surfaces adopt it as they're touched, and there are **NO business hours anywhere in either repo**, so never invent any. `apps/qr/lib/track-order.ts` is the ONE tracked-order shape (`TRACK_ORDER_SELECT` + `shapeTrackedOrder`), shared by `useOrderStatus`'s live read and both `getMyOrderFallback` server reads — it replaced three hand-copied selects and three hand-copied mappers, so add a field THERE, not at a call site. `apps/qr/lib/receipt-view.ts` is the ONE receipt derivation (`buildReceiptRows` · `fulfillmentLabel` · `groupReceiptLines` · `receiptStatusLabel` · `serviceDisclosed`) behind the durable receipt, the /track slip and the email: every money row is the fulfillment-time snapshot rendered verbatim, never recomputed, and a refunded order must never read "Paid in full".
- **Design language (as-built): `docs/DESIGN-LANGUAGE.md` — read before ANY visual/motion/copy work.** The load-bearing rules: ONE selection vocabulary (the lit-gold cap — extend it, never invent a parallel one; active state self-contained on one element); motion idioms from the kit (`mms-pop`/`mms-rise`/`mms-stagger`), every animation RM-escorted the moment it's written; the **optimistic doctrine** (instant flip · serialized chains · token-gate outcomes but record every confirmed value · revert-to-confirmed + re-read · drain `settled()`/`writesRef` before any charge · amounts never optimistic); honesty (claims data-backed + tie-aware, copy promises only what code keeps, empty states honest); bilingual on one surface (margins not whitespace in flex; new MY → K15); money surfaces speak receipt. **W22a·depth added the paper layer:** two-tier `--sh-paper` (a zero-spread wide layer reads as a hard square frame), pages carry LINES + cards carry DOTS (`.card-textured`), and **`PaperAmbient`'s host must NOT isolate**: the page ground lives on `<html>` alone, because an `isolation:isolate` host traps its own fixed overlays (tier-up scrim, toasts, confetti) under the app header. Ambient AUTO-motion rides the native scroller (manual input wins and pauses it), ships a **visible** pause control (WCAG 2.2.2 — hover luck is not a stop mechanism), and reduced-motion gets the static surface exactly, **duplicate DOM excluded** (the loop copies are only appended when motion is on). Slate: `docs/W22_DESIGN_PROPOSAL.md` (W22a **shipped**; b–f open). **M126 replaced W22a's mobile GPU rule with a DIAL** (owner lifted the budget 2026-08-27): glass frost runs at every viewport in Night, and every heavy declaration reads `--fx-glass-*`/`--fx-plane-blur`/`--fx-promote`, so `data-fx="lite"|"off"` on `<html>` scales it back with no redesign. Glass is Night-ONLY (light has no headroom), never nests, and never touches a selected element. Three composited bounds the hex-reading audit cannot see — the glass floor, the ambient's worst pixel, the moments' light bands — are pinned by `packages/ui/src/__tests__/composite-contrast.test.ts`; **it does not round to 8 bits, so where it and a hand calculation disagree the guard is the number.**

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
- **`pnpm verify:slice` FIRST — the mechanical gate, before the subagent.** Three review rounds across W9a/W8 each returned BLOCK, and nearly every finding reduced to one thing: **a guard was written and never made to fail.** A green test file was shipped as proof. `scripts/verify-slice.mjs` answers "can this guard fail?" mechanically — it runs the gate, applies 275 semantic mutations to the money/authority modules (each must turn its owning suite RED), and mirrors CI's orphan-suite check. A few minutes, zero tokens; the review round that found the same class cost ~1M tokens and 56 minutes. **A SURVIVING mutant means the fixture is degenerate** — two code paths produce identical numbers on it — so find inputs that _separate_ them (search numerically), don't just pile on assertions. A **STALE** mutant (pattern no longer matches) is a failure too, not a skip. Add a mutant whenever you add a money/authority rule.
- **The red-first rule.** Never write a guard you have not watched fail: a test, a lint rule, a CI step, a SQL assert. Induce the violation, see it go red, revert. Two live bugs shipped past "proved, not assumed" claims that had only been proved for one shape (a bare `/menu` surviving as a default parameter; a `.test.tsx` orphan the guard whitelisted by directory).
- **Guards PARSE — they never scan (LEARNINGS #60; eleven Codex findings in one day, all this shape).** A guard about executable behaviour that matches a _name, substring, count, position, or constant_ will be satisfied by text that does not ship the behaviour: a comment, a dead `{false && …}` branch, an `await Promise.all` reorder. So: parse with `typescript` (already a dependency — comments are not AST nodes) when the subject is JS/TS, and where no parser exists (CSS) constrain the scan instead — comments stripped, the candidate selected by what it DECLARES, ambiguity refused; bind extractions to the live candidate — excluding the enumerated literal-dead shapes, which is liveness against parked dead copies, not a reachability proof — and evaluate the shipped literal, refusing ambiguity instead of picking by position (**uniqueness ≠ liveness**); assert sequencing as _awaited, in a statement that finishes first_, never as lexical order; and aim red-first at the MATCHER too — ask "what text satisfies this without shipping the behaviour?" and falsify that exact evasion. ⚠️ `ts.forEachChild` is a SEARCH primitive: a visitor that returns a truthy value aborts the walk — write `(c) => { visit(c); }`.
- **Never transcribe a number into an assertion — nor a LIST.** Compute it in the shell and paste the output. A value that crosses from prose (a subagent summary, a plan doc) into an expectation is how `-600 → -59` shipped when the real value is `-58`. Same rule for sets: a merge-conflict resolution is verified as a set operation — derive `closed(parent1)` / `closed(parent2)` / `closed(merge)`, assert nothing lost and nothing invented — never from a remembered list (the #242 list was wrong twice; the resolution was right, provably, only after measuring — LEARNINGS #61).
- **Adversarial subagent (independent eyes) — this IS the review, and it runs BLIND.** Run **`pnpm review:bundle`** first: it writes `.review-bundle/` (raw diff · full current text of every changed file · heuristic blast radius · a narrative-free prompt), and you hand the subagent **that directory and nothing else**. Spawn it as `subagent_type: "adversarial-auditor"` (`.claude/agents/adversarial-auditor.md` — zero agreeableness, defect-biased, a four-part evidence standard, any CRITICAL forces REJECT). **Never describe the change in your own words.** Codex has repeatedly beaten the in-session pass on the same diff for exactly one reason: it never hears the author's argument. #223's P1 — a rotation plan that opted an event into retry when the handler's own comment forbids redelivery — sailed past every in-context pass because the author had written "idempotent, therefore safe" and no reviewer re-asked _safe against WHAT?_. Pick the ≤3 lenses the diff actually earns from {money semantics · concurrency · product truth · a11y · perf · security/privacy}, per the HARD CAP below; fix findings _before_ opening / before merging, and **post the verdict + findings as a PR comment** for the record. **Verify every finding against source before acting on it** — two of the three Codex rounds on #223 reached correct conclusions through invented mechanisms, and it is the mechanism the next reader trusts. CI runs no Claude review (the stub checks are retired), so this in-session pass plus the two Codex rounds are the only real gate. (M1·P1.5 burned 6 metered Action rounds + a disable/fix/re-label dance doing review reactively in CI — this replaces exactly that.)

- **Codex reviews are part of the gate, and the wait is MECHANICAL now (owner, 2026-08-29: "wire the wait into the flow properly").** The repo has the Codex GitHub app, but it only fires when a PR LEAVES draft (or on an explicit ask) — and the merge flow used to mark-ready-and-squash in one breath, so its findings landed minutes AFTER the merge, unread. That failed THREE times: W20/#191 buried 2×P1 + 2×P2, all four real; **#239 buried three P2s by NINE MINUTES** (a collapsed photo slot, a false count in the dietary sheet, a scroll-spy regression — all reached `main`); and a back-sweep of the twelve PRs before it found **76 findings, 16 never answered, 8 still live**, including a money-path P1 open for two days (a declined payment left an authorized promo grant pinned to a re-editable cart, so the next checkout charged a discount the new basket never earned). Every one arrived post-merge — a SEQUENCING problem, not a discipline one, which is why it is a required check rather than another paragraph: **`require-codex-review.yml` is RED until Codex has reviewed the exact head SHA about to merge**, and turns green on its own when Codex reports. ⚠️ The verdict rides a check run the job CREATES against `pr.head.sha`, named **`codex-review`** — that is the name to require in branch protection (OPEN-ITEMS **C16**, still un-wired), NOT the job's own check, which is green whenever the gate merely evaluates. The explicit creation is not decoration: a workflow's implicit check attaches to the SHA its RUN is for, and only `pull_request` events give that the PR head — measured on #240, `issue_comment` produced no run at all — so Codex's no-findings COMMENT could otherwise never clear a `pull_request` failure and the gate would wedge red forever. Because the check is per-head, the last push before a merge always needs one more Codex round; that does not conflict with the two-round budget below, which bounds how many rounds are TRIAGED, not how many exist. Drafts are exempt because a draft is MID-ITERATION — not because Codex cannot review one: it can, on an explicit ask, which is why the rule below still says to ask on the draft. Reddening on every WIP push would either burn Codex rounds on unfinished code or teach everyone to ignore a permanently-red check, so the gate arms at ready-for-review — the window where the merge button is live. The decision lives in `scripts/codex-review-gate.mjs`, unit-tested in `apps/qr/lib/codex-review-gate.test.ts` — including the near-misses that actually happened: a review of the PREVIOUS head, and a human writing the word "Codex". ⚠️ **The check proves the review EXISTS; it can never prove anyone read it** — so the rest of the rule stands: **comment `@codex review` on the draft PR immediately after opening it**, and **before merging, fetch its review comments (`pull_request_read` → get_reviews/get_review_comments) and fix-or-justify every finding**. Codex is a second independent reviewer, not a substitute for the in-session adversarial pass; triaging its findings is a hand-read, not another agent round (the HARD CAP below is untouched). **TWO Codex rounds per PR, then merge (owner, 2026-08-16: "When diminishing returns after round 2, should note for nice to-dos and merge").** Round 1 on the draft, round 2 on the fix commits; fix-or-justify both. From round 3 on, findings that would be fixed-on-sight may still be (one small commit), but anything else — polish, edge-case copy, shrinking-materiality nits — goes to `docs/OPEN-ITEMS.md` as a nice-to-do and the PR MERGES. W22a/#194 ran 4 rounds (4 → 5 → 1 → 2 findings, every one real but each smaller) before the owner called it: the review loop converges, it never terminates on its own. ⚠️ **Mark-ready and merge are NEVER one motion — #241 (2026-08-29) was squash-merged eleven seconds after `codex-review` went red on its head, by the session that BUILT the gate, and `8f2b11b` (money-path) reached `main` unreviewed.** The ritual: final push → mark ready → `@codex review` → **WAIT, event-driven** (subscribe to the PR; never sleep-poll) until `codex-review` is green with a summary saying **"Codex has reviewed"** the merge head (green-plus-SHA is NOT enough — the draft stand-down is green and names the SHA while asserting the opposite) → fetch the round, fix-or-justify — a pushed fix is a NEW head, so loop it back through the wait — → merge, only a head whose own reviewed verdict is green (normative copy: `docs/WORKFLOW.md` §Review step 5). #242 ran it and held four minutes; that is what the wait costs.

**Review budget — HARD CAP (owner directive, 2026-08-05: "Never run such long and inefficient passes").** ONE fresh-context adversarial pass per PR: delta-scoped, **≤3 lenses** (money semantics · concurrency · product truth), **≤10 agents**, **~15 min**. If it stalls or overruns, KILL it and hand-triage its partial output from the journal — never relaunch. After applying fixes: mechanical gates (`verify:slice` · `check:docs`) + a hand-read of the fix diff — **never another agent round**. The evidence: W10d ran 3 rounds / ~7M subagent tokens / 60-90 min each for 9 HIGH; two of the nine were greps (now `check-money-coverage.mjs`, ~1s), the doc lens is now `check:docs`, and the stalled round 3's hand-triage found its 3 real defects in minutes. Ten minutes of mechanical gates beat a metered round per finding. The gate is the backstop, not the author. See `.claude/LEARNINGS.md` #44/#47 for the war stories.

## Money-path rules learned the expensive way (W17 — read before touching a charged amount)

Four adversarial reviews across W17 found four real defects, and **three were the same shape**. These
are not style notes; each one shipped, or nearly shipped, a wrong number to a guest or a staff member.

- **A value computed in one place and quoted in another WILL drift. Name it ONCE.** The round-up tip
  froze a basket-dependent rate in `useState`, so a promo landing afterwards charged a tip that
  rounded to nothing with **no chip lit**. The cash settle passed a tip-FREE total to the tab-close
  audit row, under-reporting every tipped close by exactly the tip. The register computed tip chips
  off the **tax-inclusive** total while every other surface used the pre-tax base, so an identical
  "20%" label charged ~10% more at the counter. Each fix was the same: one binding
  (`effectiveTipRate`, `collectedCents`, `settleTipBaseCents`) that every consumer reads. **Before
  adding a second computation of a money value, look for the first one.**
- **`.update()` returns no row count — a BLOCKED write reports success.** A status-guarded update can
  do its job perfectly and still answer `ok`, claiming a change nobody recorded. Chain `.select("id")`
  and check the rows. `applyPromo` always did; `setMenuPrice` and `setKioskTip` only after review.
- **A guard that cannot be reached is decorative.** `verify:slice` caught the tip cap-filter mutant
  SURVIVING because a fixed 15/20/30 ladder never breaches the 50% cap. A surviving mutant means the
  code or the fixture cannot express the failure — make the rule reachable (`tipPresets` takes the
  ladder as a defaulted parameter), never delete the mutant.
- **Decision logic belongs in `lib/`, not a component.** `Checkout.tsx` sits outside
  `check-money-coverage`'s `MONEY_PATHS` and has no component test, so a rule left there **cannot be
  guarded at all**. That is why `effectiveTipRate` and `tipPresets` are pure modules.
- **Prove a DB constraint against the real database, red-first.** Before applying the cash-tip
  migration, the probe was run against prod and an `UPDATE tip_cents = -1` was **accepted** — the
  hole was live, not theoretical. Constraints get a SQL test in `supabase/tests/` (registered in
  CI's required-files list) that asserts BOTH the refusal and that a legitimate value still passes;
  an over-tight bound blocks real service and no refusal-only test would notice.
- **Two caps, not one.** Single-pay's ceiling is the **$1,000 AMOUNT** (W19 `TIP_AMOUNT_MAX_CENTS`,
  enforced in create-intent on the DERIVED cents — a rate cannot express a dollar cap; the schema's
  `.max(4000)` is only the transport rail). `shareIntentInput` allows a **0.5 rate**, matching
  `qr_cart_shares.tip_rate`'s column CHECK. A tip is chosen BEFORE the table decides how it
  settles, so anything OFFERED (the preset ladder) must clear the **tighter** bound — otherwise a
  bound surfaces as a failed payment at the last tap.
- **Some things genuinely cannot be attributed, and guessing is worse than saying so.**
  `qr_orders.settled_by` is null when a guest pays on their own phone. `/staff/tips` reports that as
  a shared bucket rather than splitting it, because a per-head number this app invented would look
  exactly like a policy the owner had agreed to. Never fabricate an average, a projection, or a
  split on a screen someone reads as a statement of their pay.

## Gate before "done"

**`pnpm verify:slice` green** · **`pnpm check:docs` green** · CI green (`turbo lint typecheck build`) · Claude PR review + security review addressed · the QA-checklist items the change touches ticked (`docs/context/QA-CHECKLIST.md`, progress tracked in `docs/REVIEW.md`) · `ROADMAP.md` box checked · `CHANGELOG.md` line added · **`docs/OPEN-ITEMS.md` swept** (close/retire/add the items your change touches — it's the single registry; W0) · preview smoke-tested. If you learned something non-obvious or hit a sharp edge, append it to `.claude/LEARNINGS.md`.
