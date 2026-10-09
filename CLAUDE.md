# CLAUDE.md — MMS Platform (monorepo)

Project guide for Claude Code working in this repo. Read this first. Memory of mistakes lives in `.claude/LEARNINGS.md` + `.claude/ERROR_HISTORY.md` (loaded at session start by a hook). **Resuming work? Read the top block of `docs/HANDOFF.md` first** — current state + the next tasks (its history: `docs/HANDOFF_ARCHIVE.md`). Every other doc is indexed in `docs/README.md`.

## Developer profile (how to work with Min)

- **Terse, action-first.** Skip preamble; lead with the implementation. One- to two-sentence rationale max.
- **Recommend, don't enumerate.** Lead with a pick; offer options only when they materially differ.
- **Verify before "done."** Run the full check (`pnpm turbo lint typecheck build test`) and confirm nothing else broke. **Never trade correctness for speed; flag regressions proactively** — regressions are the #1 frustration.
- **UI/UX polish is a core requirement**, not a follow-up — build every screen to `docs/prototype/v7.2.html` + `docs/context/DESIGN-RESEARCH.md` and the `docs/context/RUBRIC.md` ≥4.3 bar in the **first commit** (tokens not hardcoded colors, animation timing, spacing, contrast, real semantics/44px/a11y per QA-CHECKLIST §A, brand-voice microcopy); run the **Pre-PR self-review sweep** (below) on your diff before the PR — don't let the review surface craft gaps (the review/adversarial gates now cross-check fidelity).
- **Vendor choices:** when proposing a lib, give the trade-off + evidence (bundle size, activity).
- **Design-thinking prototyping has a standard loop** (owner, 2026-10-08: "make this standard"): map → diverge three directions on a canvas → one sharp owner question → refine with a consistency pass and a critic → record → blind pass → Codex → merge on the owner's go (Codex out of quota: the quota rule in the Pre-PR sweep). Follow `.claude/skills/design-prototyping/SKILL.md` (worked example: `docs/PATH_DESIGN_2026-10-07.md`, #319).

## What this is

Turborepo monorepo for the **QR** app: `apps/qr` (dine-in/pickup + grocery scan-and-go, the staff console under `/staff` — register, kitchen and expo, tables, approvals, team, tips — the kiosk and the order-ready board) + `packages/ui`, `packages/db`, `packages/config`. The **delivery** PWA is a **separate repo** (`min-hinthar/mandalay-morning-star-delivery-app`) — **not** in this monorepo. The two apps share **one Stripe account** and each run on their **own** Supabase project (QR `fasnpdhtvqtzjlvruqcu`, delivery `ukuzkhuppqwtrdkjqrkv` — see `docs/BACKEND_ARCHITECTURE.md`; `docs/DATA_RECONCILIATION.md` is the superseded shared-project history). **M5 (reshaped 2026-06-24): repos stay separate; QR _learns from_ delivery** — adopts its hardened mobile/a11y/motion patterns + reusable primitives (`docs/M5_DESIGN.md`, `docs/QR_FROM_DELIVERY.md`); full co-location reconsidered at M6. Full spec: `docs/ARCHITECTURE.md`. Plan: `ROADMAP.md`. Loop: `docs/WORKFLOW.md`. **Research context** (the _why_ — decisions, QA gate, rubric, red-team standards, the v7.2 prototype): `docs/context/INDEX.md`.

## Where things stand (2026-10-08)

Shipped the polish plan's Phase 0–2 and Phase 3a–3d's receipt stack (#299–#315; `ROADMAP.md`) — 3d·counter's cash-sheet re-host (K39 · K44), 3e and 3f stay open — then **#319**
(the path-design record `docs/PATH_DESIGN_2026-10-07.md` + OPEN-ITEMS PD1–PD13, and the
design-prototyping standard), **#320** (the merge gate fits in 30 minutes) and **#324** (the flaky-mutant
fix). **Next:** build the path designs in the record's Sequencing order — `docs/HANDOFF.md`'s top block.

- **The merge gate (#320).** The owner: "verify:slice should not take this long, either break it apart
  with subagents or disable it because we can't take more than 30 minutes for each PR merge" — and
  picked keeping it, made fast. The full battery is the CI check **`verify-slice`**, an aggregate over 12
  cost-balanced `verify-slice shard` jobs (`grep -n 'shard: \[' .github/workflows/ci.yml`) on non-draft
  heads and pushes to main; a `changes` job routes each PR into docs / code / sql lanes (main runs all).
  A draft's `verify-slice` is RED on purpose ("not run — DRAFT"); a docs-only PR's is green ("not run —
  docs-only lane"). Measured 2026-10-08: shards 4.1–10.5 min (two PR runs), the aggregate ~10.5–11 min
  wall after `changes`, `build` ~6 min, `migrations-check + types-fresh` 11.1–13.3 min (the critical path
  whenever the sql lane runs).
- **GitHub enforces nothing on `main` yet.** The repo is public again (the owner's pick, 2026-10-08);
  measured ~07:20Z that day with an admin-scoped token: `GET /branches/main` → `protected:false`,
  `/branches/main/protection` → 404, `/rulesets` → `[]`, `/rules/branches/main` → `[]`. The owner
  reported wiring the required checks that morning, but no rule is in effect as measured, so every check
  is advisory until a re-measure shows one (asked to check it saved, the owner answered "Not necessary"; re-measured
  11:07Z: still none) (C28 ③ the commands, ② the list; never a `verify-slice shard (N)` leg, `publish-codex-verdict`, the retired `codex-reviewed`, `Supabase Preview` or `Vercel Preview Comments`). The session's token is admin-scoped, so GitHub
  would let an agent merge past a red required check through the API — **only the procedure stops
  that**: the merge ritual (Pre-PR sweep; `docs/WORKFLOW.md` §Review step 5).
- **If Codex is out of quota** (a rule, owner 2026-10-08 — Codex had quota earlier that day: it reviewed #324 and #325's first two rounds, then was out of quota on #325's later head): the capped blind review of the EXACT head stands in, and the OWNER merges that head with GitHub's admin bypass, by hand; an agent never merges a red `codex-review` head and never automates the bypass. Full rule: the Pre-PR sweep.
- **Owner-gated:** prod migrations, one file at a time on the owner's go (OWNER_RULINGS_2026-10-07 #5);
  live Stripe keys (C2, #8); the device sitting (#12) and the native-Burmese check (K15); a photo shoot (C5) and hardware (C7); C28 · C16.
- **The backlog is `docs/OPEN-ITEMS.md`** — most open rows sit in Money / security / hardening, so the
  bulk of what is left IS code. Sweep it before claiming anything is done.

## Commands

```bash
pnpm dev                 # apps/qr on :3000
pnpm turbo lint typecheck build test   # the gate — ONE step of CI's `build` job (which also runs format:check, check-test-env and the parsed guards: grep ci.yml); run before any PR
pnpm format              # prettier --write
pnpm format:check        # what CI runs — prettier drift once merged with every check green (#240)
pnpm knip                # dead-code / unused deps
pnpm review:bundle       # writes .review-bundle/, the blind subagent's ONLY input (aborts on a dirty tree)
pnpm check:docs          # GFM table parity in EVERY tracked .md (prettier INTRODUCES breaks) + the
                         # live-state counts in README · CLAUDE · OPEN-ITEMS · HANDOFF, measured via
                         # `vitest list` and the mutant registry, never transcribed + LEARNINGS `## #N`
                         # keys unique + MENU_REFERENCE fresh. Minutes, not seconds (`vitest list`).
pnpm check:migration-versions   # one version per migration + the <timestamp>_name.sql shape the
                         # CLI matches. A duplicate prefix fails only at INSERT into
                         # schema_migrations — after a whole stack has started (M17 cost a CI cycle);
                         # a malformed name is SKIPPED silently. Runs in CI and inside verify:slice.
pnpm verify:slice        # the MECHANICAL money/authority gate: cheap pre-checks (money-path coverage —
                         # a changed money file MUST have a mutant, or an in-file
                         # `verify:slice-exempt — <reason>` — plus migration versions · photo filter ·
                         # theme parity · promo pin · types order · unique mutant ids)
                         # + gate + 3314 mutations + orphan check. Size it: `--list | wc -l`.
                         # ⚠️ NOT minutes: a full SERIAL run measured 164–180 min (LEARNINGS #247), so
                         # the FULL battery runs in CI as the `verify-slice` check (Where things stand).
                         # Before a push, run `--only=` for each money/authority module you touched; a
                         # full local run is not the pre-push step (in an agent session it races the
                         # tool's 2 h ceiling).
                         # `--only` matches mutant IDS, not paths, and one file's mutants can sit under
                         # several id prefixes — list a file's ids with
                         #   awk -v f=apps/qr/lib/cart.ts '$1=="id:"{id=$2} $1=="file:" && $2=="\""f"\","{gsub(/[",]/,"",id); print id}' scripts/verify-slice.mjs
                         # then run one `--only=<prefix>` per prefix (a repeated `--only` exits 2) and
                         # check each selection with `--list`.
                         # FLAGS — strict: anything else, a bare `--only`, or a malformed `--shard`
                         # prints usage and exits 2. `--no-gate` · `--only=<substr>` (ids containing it;
                         # one matching nothing exits 2) · `--shard=<i>/<n>` (1-based, n <= 1000,
                         # balanced by estimated cost; the n shards are disjoint and their union is the
                         # selection, which `check:shard-partition` proves in CI) · `--list` (print the
                         # selected ids and exit 0 — no gate, no pre-checks, no mutation).
                         # `VERIFY_SLICE_TIMEOUT_MS` (default 180000, at most 2147483647) is the
                         # per-mutant timeout. Verdicts: CAUGHT · SURVIVED · STALE · UNPARSEABLE ·
                         # TIMEOUT · ERROR, and only CAUGHT passes — a CAUGHT needs the OWNING suite's
                         # own row red (a failure in another file the filter ran is an ERROR), and a
                         # timeout or a crashed runner is never a kill. Exit 0 pass · 1 fail · 2 usage.
                         # ⚠️ IN PLACE: it REWRITES the 272 money/authority modules it mutates
                         # (182 under apps/qr/lib), ONE at a time, restoring each — also on SIGINT,
                         # SIGTERM and SIGHUP. It ABORTS if a target file is DIRTY — commit or stash
                         # first, and NEVER EDIT a target file while a run is live (its restore overwrites the edit).
                         # After any killed or stalled run (a SIGKILL cannot be trapped), `git status --short`
                         # names the module left mutated: read `git diff -- <file>` first, and only when it is
                         # exactly one mutant's find→replace, `git checkout -- <file>`; then confirm clean. Measure the set, never count
                         # it by eye:
                         #   grep -oE '^\s+file: "[^"]+"' scripts/verify-slice.mjs | sort -u | wc -l
                         # and its buckets:
                         #   grep -oE '^\s+file: "[^"]+"' scripts/verify-slice.mjs | sort -u \
                         #     | cut -d'"' -f2 | sed -E 's#^(apps/qr/(lib|app/api|components))/.*#\1#' \
                         #     | sort | uniq -c
                         # ⚠️ ONE RUN PER CHECKOUT, and BOTH failure modes lie: a run can STALL
                         # alive-but-idle (seen: ~5h, empty output), and two overlapping runs rewrite
                         # each other's modules so the second reports "✗ These suites fail BEFORE any
                         # mutation: <file>" — which reads exactly like a real defect and is not. On
                         # either: kill ALL runs, restore, confirm clean, start exactly one. Never
                         # report a result whose run you did not watch finish.
                         # ⚠️ NEVER COMMIT WHILE A RUN IS LIVE (LEARNINGS #74): the dirty-tree abort
                         # protects the RUN from your edits, not your COMMIT from the run — mid-run one
                         # tracked module is always a mutant, so `git commit -am` snapshots it (#250
                         # pushed one inside a docs-only commit).
                         # ⚠️ Check for a live run with
                         #   ps -eo pid,comm,args | awk '$2=="node" && /verify-slice\.mjs/'
                         # never `pgrep -f "[v]erify-slice"`: it matches your own
                         # `git add scripts/verify-slice.mjs` and cries wolf (LEARNINGS #92).
pnpm verify:slice --no-gate --only=totals   # iterate on one module (the pre-push step, per module)
pnpm verify:slice --list --only=totals      # what a filter selects, without running anything
# ⚠️ THE QR PROD MIGRATION HISTORY IS DIVERGENT FROM THIS REPO (M125) — read before any apply.
# Prod's supabase_migrations.schema_migrations stamps are all MCP-generated: they share no version
# with the repo filenames, and even by NAME the mapping is not one-for-one. So `db push`, in ANY form,
# cannot be used against the QR project until the histories are reconciled — and do not restate a
# failure mode you have not run (this warning was wrong twice by inferring CLI behaviour). Never
# ad-hoc DDL there either (the SQL editor). Instead, on the owner's go (OWNER_RULINGS_2026-10-07 #5):
# apply ONE FILE AT A TIME with the Supabase MCP `apply_migration` — the path every migration on this
# project has actually taken — FIRST confirming the MCP server targets the QR project
# `fasnpdhtvqtzjlvruqcu` (e.g. `get_project_url`): the repo's `.mcp.json` Supabase entry points there
# (the owner, 2026-10-08: "target is fasnpdhtvqtzjlvruqcu"), but a session can load another MCP config,
# so confirm it every time — and VERIFY the objects THAT FILE creates before the next (functions:
# signature + shape count + has_function_privilege; columns/indexes/policies/data:
# information_schema or pg_catalog, since a column-only migration leaves no pg_proc row to check).
# Reconciling the two histories once with `supabase migration repair`, after verifying each body, is
# the real fix (M125). There is no staging project (T3): preview and prod share the one QR project
# (`docs/ENV.md`).
supabase start           # a LOCAL stack: applies every migration + seed
supabase db push         # ⚠️ LOCAL / BRANCH STACKS ONLY — never the QR project (see above)
```

**CI (`ci.yml`) — measure it, never count it from prose.**

- **List its guard steps with** `grep -nE '^\s+(- )?run: (pnpm (check:|format:)|node scripts/)' .github/workflows/ci.yml`. ⚠️ **`(- )?` is load-bearing (#279):** a step written as a `- name:` block puts its `run:` on a later line with no dash, and the old `- run:` pattern hid exactly the step that then reddened CI. The grep still cannot see a `run: |` block (the inline `No orphaned test files` step), and it also matches lines outside the fast lane (the `docs` job's repeats, the sql-lane harnesses, the shard step). A count read off a pattern that cannot match every shape is not a measurement.
- **`node scripts/check-test-env.mjs`** (the `build` job) refuses a `.test.ts` declaring `@vitest-environment jsdom`. Local vitest honours that docblock, so the suite passes here and CI rejects it (#279) — run it before a push.
- **`node scripts/check-build-stamp.mjs`** reads the BUILD OUTPUT (the stamp in `/api/version`'s prerendered body and in a client chunk), so it runs after `pnpm turbo run lint typecheck build test`; locally, run it right after `pnpm turbo … build`.
- **The sql-lane harnesses** (`verify-merge-race --mutants`, `verify-mode-authority`, and `verify-line-guard-race`, `verify-counter-fire-race`, `verify-bind-race`, each plain and `--mutants`) run in `migrations-check + types-fresh` behind `supabase start`, which needs a Docker daemon: none runs in the agent environment (the binaries are installed; whether `sudo dockerd` starts is unmeasured, and the `supabase` CLI is not on PATH — HANDOFF's Environment facts) — but they are NOT CI-only: run each before a push against the throwaway Supabase-shaped Postgres 16 on `127.0.0.1:54322`, the races with their own `*_ASSUME_DISPOSABLE=1` (LEARNINGS #95 · #243; `pnpm verify:*-race[:mutants]`, `pnpm verify:mode-authority`).
- **Three guards carry a rule of their own:** `check:style-literals` is a ratchet (a hardcoded weight/size/tracking count may fall, never rise; re-record with `--update`); `check:mutant-anchors` answers in ~1 s what a full `verify:slice` reports only when it reaches that mutant (LEARNINGS #106); `check:shard-partition` proves the `verify-slice` shards are disjoint and cover the battery (a shard that drops a mutant would pass as "0 mutants caught").
- **Every `build` step carries `if: !cancelled()`,** so each guard reports in the same run (until 2026-10-08 one red step skipped every step behind it). A stale doc count still reds `build` — and the `docs` job on a docs-only PR — so refresh counts on EVERY push, not last.

## Conventions

- **One-way deps:** apps → packages, never reverse. Import from package roots (`@mms/ui`, `@mms/db`), never deep paths.
- **TypeScript strict**, `noUncheckedIndexedAccess`. No `any` on money/DB rows without a guard.
- **Server Components by default;** `"use client"` only when needed. Server Actions for mutations.
- Conventional commits (`feat:`/`fix:`/`chore:`/`docs:`). One phase = one PR (see `ROADMAP.md`).
- **Branches:** use the branch the session assigns (it may not follow a pattern); when you create one yourself, `claude/<type>/<slug>` (conventional-commit type + kebab slug with milestone/phase context — e.g. `claude/feat/m1-p1-session-mint`, `claude/docs/research-context`).
- **CI runs by lane.** `ci.yml`'s `changes` job routes each PR: `docs` (every changed path is `*.md` or under `.claude/` — `check:docs` + `format:check`), `build` (code — the fast-lane guards + `lint typecheck build test`), `migrations-check + types-fresh` (sql — `supabase/**`, the generated types, the race harnesses, a workflow file; every load-bearing `supabase/tests/*.sql` is named EXPLICITLY in `ci.yml`, so add yours to that list) and `verify-slice` (code, non-draft heads); pushes to main run every lane. Beside it: **`require-docs`** (`require-docs-update.yml` — a PR touching `apps/**`/`packages/**` must also touch `docs/**`, `CHANGELOG.md`, `ROADMAP.md` or `README.md`, or carry `skip-docs`) and **`codex-review`**. ⚠️ None of them blocks a merge until branch protection requires it (Where things stand; C28). The workflows are what `ls .github/workflows` lists, and there is **NO Claude review in CI** — the `review`/`security`/`adversarial-pr` stub checks are retired, so don't go looking for those statuses.
- **The review is ONE blind, in-session adversarial subagent pass over the FULL PR diff** (LEARNINGS #216), run after the mark-ready in parallel with the `verify-slice` check and the Codex round (the Pre-PR sweep below) — fix its findings before merging, and **post its verdict as a PR comment** for the record. No metered Action, no `review`/`adversarial` label ritual. **Don't front-load a happy-path build and lean on review to tease out the hardening — run the _Pre-PR self-review sweep_ on your diff first** (war stories: `.claude/LEARNINGS.md`'s opening bullets, "Front-load money/auth hardening in the FIRST commit" and "Build UI to the prototype + research in the FIRST commit"). Details: `docs/WORKFLOW.md`.
- Tokens come from `@mms/ui/tokens.css`; don't hardcode colors. Light = editorial-forward, dark = Night.
- **Three W22r singletons — read from them, never re-derive (the "name it ONCE" rule applied to shapes and identity).** `apps/qr/lib/brand.ts` is the restaurant's identity (name · street address · both phone forms · email · socials, every string verbatim from the delivery repo's production constants) — surfaces adopt it as they're touched, and there are **NO business hours anywhere in either repo**, so never invent any. `apps/qr/lib/track-order.ts` is the ONE tracked-order shape (`TRACK_ORDER_SELECT` + `shapeTrackedOrder`), shared by `useOrderStatus`'s live read and both `getMyOrderFallback` server reads — it replaced three hand-copied selects and three hand-copied mappers, so add a field THERE, not at a call site. `apps/qr/lib/receipt-view.ts` is the ONE receipt derivation (`buildReceiptRows` · `fulfillmentLabel` · `groupReceiptLines` · `serviceDisclosed`; its refund-aware status line, `receiptStatusLabel`, lives beside it in `apps/qr/lib/refund-view.ts` since W23b) behind the durable receipt, the /track slip and the email: every money row is the fulfillment-time snapshot rendered verbatim, never recomputed, and a refunded order must never read "Paid in full".
- **Design language (as-built): `docs/DESIGN-LANGUAGE.md` — read before ANY visual/motion/copy work.** The load-bearing rules: ONE selection vocabulary (the lit-gold cap — extend it, never invent a parallel one; active state self-contained on one element); motion idioms from the kit (`mms-pop`/`mms-rise`/`mms-stagger`), every animation RM-escorted the moment it's written; the **optimistic doctrine** (instant flip · serialized chains · token-gate outcomes but record every confirmed value · revert-to-confirmed + re-read · drain `settled()`/`writesRef` before any charge · amounts never optimistic); honesty (claims data-backed + tie-aware, copy promises only what code keeps, empty states honest); bilingual on one surface (margins not whitespace in flex; every Claude-authored MY string joins the K15 native-check ledger the day it ships); money surfaces speak receipt. **W22a·depth added the paper layer:** two-tier `--sh-paper` (a zero-spread wide layer reads as a hard square frame), pages carry LINES + cards carry DOTS (`.card-textured`), and **`PaperAmbient`'s host must NOT isolate**: the page ground lives on `<html>` alone, because an `isolation:isolate` host traps its own fixed overlays (tier-up scrim, toasts, confetti) under the app header. Ambient AUTO-motion rides the native scroller (manual input wins and pauses it), ships a **visible** pause control (WCAG 2.2.2 — hover luck is not a stop mechanism), and reduced-motion gets the static surface exactly, **duplicate DOM excluded** (the loop copies are only appended when motion is on). Slate: `docs/W22_DESIGN_PROPOSAL.md` (all shipped except W22d's light half — owner-blocked on the hue, M86; its dark half became M126). **M126 replaced W22a's mobile GPU rule with a DIAL** (owner lifted the budget 2026-08-27): glass frost runs at every viewport in Night, and every heavy declaration reads `--fx-glass-*`/`--fx-plane-blur`/`--fx-promote`, so `data-fx="lite"|"off"` on `<html>` scales it back with no redesign. Glass is Night-ONLY (light has no headroom), never nests, and never touches a selected element. Three composited bounds the hex-reading audit cannot see — the glass floor, the ambient's worst pixel, the moments' light bands — are pinned by `packages/ui/src/__tests__/composite-contrast.test.ts`; **it does not round to 8 bits, so where it and a hand calculation disagree the guard is the number.**

## ⚠️ Critical / money + auth paths (extra care, CODEOWNERS-flagged)

- **Pricing is server-authoritative.** The client never sends a price — it sends an item id + modifier ids; the server (`apps/qr/lib/cart.ts`, service-role client) re-derives every amount. Never compute or trust a total client-side. The Stripe intent amount comes from `getCartTotals`, never the request body.
- **Tax** = the category-aware engine (`apps/qr/lib/tax.ts` ↔ `supabase/migrations/20260618000000_qr_platform_init.sql` `mms_line_tax`; the rate is `mms_tax_rate()`, last restated in `20260815200000_w16a_mode_prices_tax.sql`) — **both halves are pinned by tests** (`lib/tax.test.ts` + `supabase/tests/tax_parity_test.sql`), so a one-sided edit reddens exactly one CI job. Keep the TS and SQL in sync. Tax is on the **discounted taxable base**, not a pro-rata of the aggregate.
- **RLS everywhere.** Diners are anonymous; a short-lived table-session JWT (`session_id`/`seat`/`app_role`) authorizes via `is_member`/`is_host`. Realtime group cart uses **private** channels gated by RLS on `realtime.messages`. Never expose `SUPABASE_SERVICE_ROLE_KEY` to the client.
- **Stripe = SAQ-A.** Card data lives only in the Payment Element iframe. Fulfillment is webhook-driven, signature-verified, idempotent on the PaymentIntent id (`mms_fulfill_order`).
- **Secrets** only in Vercel + GitHub Actions secrets — never in git (`.gitignore` covers `.env*`). Per-environment: test keys in preview, live in prod (live keys held until C2's cutover, OWNER_RULINGS_2026-10-07 #8).
- **Migrations reach prod only ONE FILE AT A TIME through the Supabase MCP `apply_migration`, on the owner's go**, each verified object by object before the next (Commands) — after confirming the MCP targets the QR project `fasnpdhtvqtzjlvruqcu` — `.mcp.json` points there (the owner, 2026-10-08), but a session can load another MCP config. Never `supabase db push` or SQL-editor DDL against the QR project (divergent history, M125); a local stack is `supabase start`.
- Compliance: **SB-1524** — there is no service charge since W16a (historical receipts still disclose theirs, `serviceDisclosed`), and any reintroduction must be disclosed; never surcharge debit; reviews ungated; **EBT/SNAP = 2027** (Forage/FNS).

## Pre-PR self-review sweep (read your own diff _before_ opening the PR)

The review gates catch **escapes** — they are not your first pass. M1's first commits were clean on the load-bearing parts (money/auth/RLS/tokens), yet the gate kept finding the same **three deferred categories** round after round (P1.2 took 5 passes; P1.5 took 3) — so sweep the diff against them before you push, where a fix is one edit, not a fix-and-re-review cycle. The bullets through "Never transcribe" run before the push. Codex's round 1 is asked on the draft at open; the blind pass and the merge head's Codex round run after the mark-ready, in parallel with the `verify-slice` check.

- **Money / auth / RLS / DB** — every mutation authz'd with the status guard **in the SQL statement** (not just the client); inputs bounded at the DB (Zod `.max()` **+** column `CHECK`); new `SECURITY DEFINER` fns `revoke … from public` + `grant … to service_role`; amounts server-derived (never a client total); RLS on every new table **and** Realtime path; migrations guarded + idempotent, no `types-fresh` drift, never ad-hoc DDL on prod.
- **a11y — sweep _every_ interactive/region element, not just the layout** (QA-CHECKLIST §A): ≥44px touch targets; an accessible name on each control/list/region (`aria-label`/`-labelledby`); `role="list"` when `list-style:none`; **one** live region per view (no redundant `aria-live` on `role="status"`/`alert`); focus moved on remove / route / step change; decorative glyphs + emoji `aria-hidden`; a `prefers-reduced-motion` off-switch on any animation.
- **Error / recovery paths** — every `await` / `{ error }` is handled or a **commented, deliberate** swallow (a silent one → a broken session or a stuck screen); every async UI has a **loading _and_ a failure/recovery** state (never strand the user); fail fast on unrecoverable errors instead of burning a full retry budget; on serverless, drain side-effects with `after()` (don't couple the response to them).
- **Copy / fidelity** — strings **verbatim** from `docs/prototype/v7.2.html` where v7.2 draws the surface; where it has no string, the house's own words held to `docs/DESIGN-LANGUAGE.md` §9 (J29); a v7.2 string the code cannot keep is not copied (honesty, DESIGN-LANGUAGE §5). No promise the code doesn't keep ("live status here" only where it's wired); honest microcopy (no fabricated ETAs/counts); tokens, never hardcoded colors.
- **`verify:slice` — the mechanical gate: `--only=` locally before the push, the FULL battery in CI.** Three review rounds across W9a/W8 each returned BLOCK, and nearly every finding reduced to one thing: **a guard was written and never made to fail.** A green test file was shipped as proof. `scripts/verify-slice.mjs` answers "can this guard fail?" mechanically — it applies 3314 semantic mutations to the money/authority modules (each must turn its owning suite RED) and mirrors CI's orphan-suite check. Zero tokens, but not minutes (LEARNINGS #247), so: before pushing, run `pnpm verify:slice --no-gate --only=<substring>` for every money/authority module you touched (Commands: how to find a file's ids); the full battery is the CI check **`verify-slice`**, and the merge waits for it green on the merge head. **A SURVIVING mutant means the fixture is degenerate** — two code paths produce identical numbers on it — so find inputs that _separate_ them (search numerically), don't just pile on assertions. **A mutant that SURVIVES on one run and is CAUGHT on another of the same tree is a suite defect** — the suite reads a moment, not history (LEARNINGS #248; #324): fix the read, red-first, and never re-run a red `verify-slice` hoping for green. A **STALE** mutant (pattern no longer matches) is a failure too, not a skip. Add a mutant whenever you add a money/authority rule.
- **The red-first rule.** Never write a guard you have not watched fail: a test, a lint rule, a CI step, a SQL assert. Induce the violation, see it go red, revert. Two live bugs shipped past "proved, not assumed" claims that had only been proved for one shape (a bare `/menu` surviving as a default parameter; a `.test.tsx` orphan the guard whitelisted by directory).
- **Guards PARSE — they never scan (LEARNINGS #60; eleven Codex findings in one day, all this shape).** A guard about executable behaviour that matches a _name, substring, count, position, or constant_ will be satisfied by text that does not ship the behaviour: a comment, a dead `{false && …}` branch, an `await Promise.all` reorder. So: parse with `typescript` (already a dependency — comments are not AST nodes) when the subject is JS/TS, and where no parser exists (CSS) constrain the scan instead — comments stripped, the candidate selected by what it DECLARES, ambiguity refused; bind extractions to the live candidate — excluding the enumerated literal-dead shapes, which is liveness against parked dead copies, not a reachability proof — and evaluate the shipped literal, refusing ambiguity instead of picking by position (**uniqueness ≠ liveness**); assert sequencing as _awaited, in a statement that finishes first_, never as lexical order; and aim red-first at the MATCHER too — ask "what text satisfies this without shipping the behaviour?" and falsify that exact evasion. ⚠️ `ts.forEachChild` is a SEARCH primitive: a visitor that returns a truthy value aborts the walk — write `(c) => { visit(c); }`.
- **Never transcribe a number into an assertion — nor a LIST.** Compute it in the shell and paste the output. A value that crosses from prose (a subagent summary, a plan doc) into an expectation is how `-600 → -59` shipped when the real value is `-58`. Same rule for sets: a merge-conflict resolution is verified as a set operation — derive `closed(parent1)` / `closed(parent2)` / `closed(merge)`, assert nothing lost and nothing invented — never from a remembered list (the #242 list was wrong twice; the resolution was right, provably, only after measuring — LEARNINGS #61).
- **Adversarial subagent (independent eyes) — this IS the review, and it runs BLIND.** ONE pass per PR over the FULL PR diff (LEARNINGS #216), started after the mark-ready and run **in parallel with the `verify-slice` check and the Codex round** — the subagent reads `.review-bundle/`, a copy, and the shards mutate their own runners' checkouts, so neither can disturb the other; both must be green before the merge. Run **`pnpm review:bundle`** first: it writes `.review-bundle/` (raw diff · full current text of every changed file · heuristic blast radius · a narrative-free prompt), and you hand the subagent **that directory and nothing else**. Spawn it as `subagent_type: "adversarial-auditor"` (`.claude/agents/adversarial-auditor.md` — zero agreeableness, defect-biased, a four-part evidence standard, any CRITICAL forces REJECT). **Never describe the change in your own words** — Codex keeps beating in-context passes on the same diff because it never hears the author's argument (LEARNINGS #55). Pick the ≤3 lenses the diff earns (HARD CAP below); fix findings before merging, and **post the verdict + findings as a PR comment naming the head SHA it reviewed** — with Codex out of quota that verdict is the Codex stand-in, and the owner's bypass merge is tied to that SHA. **Verify every finding against source before acting on it** — two of the three Codex rounds on #223 reached correct conclusions through invented mechanisms, and it is the mechanism the next reader trusts. CI runs no Claude review, so this pass plus the Codex rounds are the only real review.
- **Codex reviews are part of the gate, and the wait is MECHANICAL (owner, 2026-08-29: "wire the wait into the flow properly").** Codex fires when a PR LEAVES draft (or on an explicit ask), and a flow that marked ready and squashed in one breath read its findings minutes AFTER the merge — three times, a money-path P1 among them (the record: `require-codex-review.yml`'s header). So **`require-codex-review.yml` is RED until Codex has reviewed the exact head SHA about to merge**, and turns green on its own when Codex reports — a review, a no-findings comment, or the Completed row of its summary comment for that head (a clean auto-review only edits that comment and adds a 👍). ⚠️ The verdict rides a check run the `publish-codex-verdict` job CREATES against `pr.head.sha`, named **`codex-review`** — that is the name to require, NOT the job's own check (green whenever the gate merely evaluates) and never the retired `codex-reviewed`. Drafts are exempt because a draft is mid-iteration, not because Codex cannot review one: the gate arms at ready-for-review, the window where the merge button is live. The decision lives in `scripts/codex-review-gate.mjs`, unit-tested in `apps/qr/lib/codex-review-gate.test.ts` — including the near-misses that actually happened: a review of the PREVIOUS head, and a human writing the word "Codex". A gate stuck red after Codex reported: re-run the latest `publish-codex-verdict` run — a human comment no longer re-evaluates it. ⚠️ **The check proves the review EXISTS; it can never prove anyone read it** — so **comment `@codex review` on the draft PR immediately after opening it**, and **before merging, fetch its round (`pull_request_read` → get_reviews / get_review_comments / get_comments) and fix-or-justify every finding** — a hand-read, not another agent round (the HARD CAP is untouched). **TWO Codex rounds per PR, then merge (owner, 2026-08-16: "When diminishing returns after round 2, should note for nice to-dos and merge").** Round 1 on the draft, round 2 on the fix commits; fix-or-justify both. From round 3 on, findings that would be fixed-on-sight may still be (one small commit), but anything else — polish, edge-case copy, shrinking-materiality nits — goes to `docs/OPEN-ITEMS.md` as a nice-to-do and the PR MERGES: the loop converges, it never terminates on its own (W22a/#194 ran 4 → 5 → 1 → 2 findings). The check is per-head, so the last push before a merge always needs one more Codex round; the two-round budget bounds how many rounds are TRIAGED, not how many exist.
- ⚠️ **Mark-ready and merge are NEVER one motion — #241 (2026-08-29) was squash-merged eleven seconds after `codex-review` went red on its head, by the session that BUILT the gate, and `8f2b11b` (money-path) reached `main` unreviewed (LEARNINGS #61).** The ritual (normative copy: `docs/WORKFLOW.md` §Review step 5): final push → mark ready → `@codex review` → **WAIT, event-driven** (subscribe to the PR; never sleep-poll — and never a re-armed `send_later` / cron re-check either: a PARKED PR waits on EVENTS ONLY; hourly self-wakes burned a day of the owner's plan on #284 — owner, 2026-09-15, LEARNINGS #114) until `codex-review` is green with a summary saying **"Codex has reviewed"** the merge head (green-plus-SHA is NOT enough — the draft stand-down is green and names the SHA while asserting the opposite; and a green beside Codex's usage-limit reply on that head is unproven — WORKFLOW step 5(d), (g)) **AND the `verify-slice` check is green on that same head** (it starts on the mark-ready; a draft's is RED on purpose — "not run — DRAFT" — so a draft-era verdict can never pass for the battery) → fetch the round, fix-or-justify — a pushed fix is a NEW head, so loop it back through BOTH waits — → merge, on the owner's per-SHA yes (ruling #1's merge-window line) or the owner's explicit instruction to merge that PR (never a red-`codex-review` head: G3), only a head whose own reviewed verdict AND own `verify-slice` are green. #242 ran it and held four minutes; since #320 `verify-slice` bounds the wait (Where things stand).
- **Codex out of quota (owner, 2026-10-08: "wired the required checks on main, codex-review can be replaced with blind review if out of quota so merge is not blocked waiting on quota", then "go with the manual admin bypass for quota").** When Codex answers a review request with its usage-limit message ("You have reached your Codex usage limits for code reviews"), the capped blind adversarial review of the EXACT head stands in for Codex: post its verdict on the PR naming that head SHA, with `verify-slice` and the rest of CI green on the same SHA. The OWNER then merges that head with GitHub's admin bypass, by hand. An agent never merges a head whose `codex-review` is red (the `.md`-only waiver, under the conditions in WORKFLOW §Review step 5 (f), is the one exception) — even though its admin-scoped token could — and never automates the bypass (an automated version, the gate accepting a verdict comment posted from the owner's account, was refused as a CI bypass: the agent posts AS the owner and would satisfy its own required check). Branch protection therefore keeps admin bypass available (classic rule: leave "Do not allow bypassing the above settings" unticked; ruleset: Repository admin on the bypass list) and does NOT require Code Owner review (every PR is authored by the sole code owner, who cannot approve their own PR). The bypass covers a red `codex-review` only — never `verify-slice`, `build`, `docs`, `migrations-check + types-fresh` or `require-docs`. Normative copies: `docs/WORKFLOW.md` §Review step 5(g); `docs/OWNER_RULINGS_2026-10-07.md` G3. **A fix pushed after the capped pass (owner, 2026-10-08: "Yes one more"):** ONE more capped blind pass runs over exactly the fix commits (`pnpm review:bundle --base <the HEAD SHA of the first pass's reviewed pair>`; after a rebase between the passes, the full PR on the PR's final head as GitHub reports it, same cap), and its verdict, posted naming the final head SHA and the base it reviewed from, stands in for that head — the last agent round, and an owner-made exception to the HARD CAP's "never another agent round", only with Codex out of quota (with quota, Codex's round on the final head covers the fix commits). _The lead's procedure (2026-10-08, not an owner ruling — the owner may require more):_ a fix pushed after THAT pass is carried by the author's hand-read of the commits after it, posted as ONE comment naming the final head SHA. The merge-window line for that head lists those fix commits and says whether any touches a `MONEY_PATHS` file (`scripts/check-money-coverage.mjs`), so the owner bypass-merges knowing which commits no blind reviewer read.
- **The standing rulings beside it** (`docs/OWNER_RULINGS_2026-10-07.md`). A session merges only on the owner's per-SHA yes (ruling #1's merge-window line) or the owner's explicit instruction to merge that PR (G4) — neither covers a head whose `codex-review` is red: the owner merges that (G3). **How an agent applies ruling #1's `.md`-only waiver** (the owner's words: "`.md`-only PRs merge without the Codex wait this wave (CI green still required). CLAUDE.md and `.claude/**` are excluded: they need the per-SHA line." — the lead's tightening, confirmed by the owner 2026-10-08): only within the wave it was given for (the 2026-10-07 parallel wave); only when Codex is out of quota (with quota, every PR waits for Codex); only while `codex-review` is not a required check, re-measured immediately before the merge with OPEN-ITEMS C28 ③'s reads, their output quoted in the PR; and never for a PR that touches the rules governing merges — `CLAUDE.md`, `.claude/**`, `docs/WORKFLOW.md`, `docs/OWNER_RULINGS_*.md`, OPEN-ITEMS C16/C28, `.github/**` — which need the owner's per-SHA line. Once `codex-review` is required, an `.md`-only PR is listed `#N @ SHA · .md-only` for the owner's same bypass (#2). A money-path PR the blind pass flagged keeps ruling #1's default: it waits for Codex's review of its head unless the owner overrides that line; with Codex out of quota, the owner's override is their own bypass merge. Ruling #1's "a full `verify:slice` watched to the end" is now the `verify-slice` CI check green on that SHA.

**Review budget — HARD CAP (owner directive, 2026-08-05: "Never run such long and inefficient passes"; re-affirmed 2026-10-04 after the 103-agent deep pass on #312: "pass should never be that deep, codex level adversarial review is fine if codex red").** ONE fresh-context adversarial pass per PR, scoped to the FULL PR diff (LEARNINGS #216) and never deeper: **≤3 lenses** chosen from {money semantics · concurrency · product truth · a11y · perf · security/privacy} (the auditor applies them through its own defensive / architectural / idiomatic method), **≤10 agents**, **~15 min**. If it stalls or overruns, KILL it and hand-triage its partial output from the journal — never relaunch. After applying fixes: mechanical gates (`verify:slice --only=` for what the fixes touched · `check:docs`, then the `verify-slice` check on the pushed head) + a hand-read of the fix diff — **never another agent round** — except, with Codex out of quota, ONE more capped pass over the fix commits pushed after the blind pass, the last agent round (owner, 2026-10-08: "Yes one more"; the quota bullet above). A second, Codex-depth adversarial round is earned only when Codex's own round comes back RED on the head — then it is one more capped pass over the files Codex named, not a fleet (LEARNINGS #218). Ten minutes of mechanical gates beat a metered round per finding (the W10d evidence: `.claude/LEARNINGS.md`, "Review rounds are capped at ONE per PR"). The gate is the backstop, not the author.

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
- **Decision logic belongs in `lib/`, not a component — and M46 changed the REASON, not the rule.**
  A `.test.tsx` now runs (jsdom, opted in per file with `/** @vitest-environment jsdom */`; see
  `apps/qr/vitest.config.ts`), and `verify:slice` mutates components too. But a component sits
  outside `check-money-coverage`'s `MONEY_PATHS` (`Checkout.tsx` has suites and mutants now, yet a
  change there is still never ASKED for a mutant), and a pure module is falsified by a VALUE where a
  component needs a render plus five mocks. So `lib/` first: it is finer-grained, not merely
  possible. That is why `effectiveTipRate` and `tipPresets` are pure modules. Use a component suite
  for WIRING that has nowhere else to live (T18).
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
- **Before touching the promo pin, read `releasePromoGrantFor`'s docblock in `apps/qr/lib/lock.ts`.**
  The stale-grant release runs from the NEXT attempt in `create-intent`, never from the decline
  webhook — an inline decline re-confirms the SAME PaymentIntent, so clearing the pin there charged
  an amount fulfillment could not re-derive.

## Gate before "done"

**CI green on the merge head** — `build` (`pnpm turbo lint typecheck build test`), `migrations-check + types-fresh` when the sql lane runs, `docs` on a docs-only PR, and `require-docs` · **the `verify-slice` CI check green on the merge head** (locally: `--only=` for each module you touched) · **`pnpm check:docs` green** · the blind-pass verdict posted on the PR and its findings fixed-or-justified · **`codex-review` green with "Codex has reviewed" the merge head**, both Codex rounds fixed-or-justified — or, with Codex out of quota, the blind verdict naming that head and the OWNER's admin-bypass merge (an `.md`-only PR: ruling #1's waiver, under WORKFLOW step 5 (f)'s conditions) · the owner's per-SHA yes or explicit instruction for the merge · the QA-CHECKLIST items the change touches (`docs/context/QA-CHECKLIST.md`) ticked in the PR body's QA section · `ROADMAP.md` box checked · `CHANGELOG.md` line added · **`docs/OPEN-ITEMS.md` swept** (close/retire/add the items your change touches — it's the single registry; W0) · preview smoke-tested. If you learned something non-obvious or hit a sharp edge, append it to `.claude/LEARNINGS.md` under the next free `## #N` heading (`check:docs` refuses a duplicate key).
