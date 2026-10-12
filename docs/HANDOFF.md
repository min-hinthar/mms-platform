# Session Handoff — MMS Platform (2026-10-11 · the path-design wave, built)

The chat context does not carry across sessions — **this file is the durable pickup point.** Rules:
[`CLAUDE.md`](../CLAUDE.md) and [`docs/WORKFLOW.md`](WORKFLOW.md). Open work:
[`docs/OPEN-ITEMS.md`](OPEN-ITEMS.md). The owner's rulings, which win over this file:
[`docs/OWNER_RULINGS_2026-10-07.md`](OWNER_RULINGS_2026-10-07.md). Research map: [`docs/context/INDEX.md`](context/INDEX.md); the backend design of record: [`docs/BACKEND_ARCHITECTURE.md`](BACKEND_ARCHITECTURE.md); every docs file: [`docs/README.md`](README.md). History: [`ROADMAP.md`](../ROADMAP.md),
[`CHANGELOG.md`](../CHANGELOG.md), [`.claude/LEARNINGS.md`](../.claude/LEARNINGS.md).

**Older blocks** (newest first, all superseded) are verbatim in
[`docs/HANDOFF_ARCHIVE.md`](HANDOFF_ARCHIVE.md). Code, migrations, OPEN-ITEMS rows and CHANGELOG
entries that cite `docs/HANDOFF.md` for history resolve there — and two of them are still BINDING despite the archive's banner: the p2f apply procedure and the `PICKUP_MANUAL_CAPTURE` flip gate (restated in [`docs/ENV.md`](ENV.md)'s row) — plus the M17 / M109 notes, the `lemon-salad` tax note, the Terminal
warning, owner decisions 1–10 and the M2–M9 device table (its opening list names each block). The
first-owner bootstrap is [`docs/ENV.md`](ENV.md) "Bootstrap the first owner".

## Where things stand (2026-10-11 — the path-design wave, built)

Measure first: `git log origin/main --oneline --since=2026-10-08T00:00:00Z` (with a bare date, git starts
at that day's current clock time: "How work runs here"), the open PRs (`list_pull_requests`), and
`git branch -r`.

### The owner's directives, and what the delegation covered

- **2026-10-08:** "I trust you to comprehensively orchestrate/build the path designs in parallel streams
  with even more creative design-thinking refinements enhancements best hospitality qr dine-in to-go
  grocery ordering industry worldclass UIUX iOS design-thinking awesomeness. Believe in yourself". Then
  "just handoff and merge all on CI green". Then the owner's go to carry on the orchestration.
- **2026-10-09:** "I trust you to make all decisions, apply migrations, and merge all". It covered THIS
  wave's PRs and migrations (2026-10-08 to 10-11): decisions, prod migrations and merges. Then
  "permission granted, run the whole train" and "switched to Accept, proceed all".
- **The delegation is NOT authority for later sessions.** From the next session on, CLAUDE.md,
  WORKFLOW §Review step 5 and the OWNER_RULINGS file govern, unless the owner renews the delegation in
  their own words. Under them, only the owner merges a red-`codex-review` head (G3), and each prod
  migration waits for the owner's go for that file (ruling #5). The rules files did not change during
  the wave.
- **How this wave's PRs merged.** Each PR merged on its own head once `build` · `verify-slice` ·
  `require-docs` and the lanes that ran were green, the blind pass's findings were fixed or justified
  on the PR, and Codex's rounds were triaged. Where Codex had not reviewed the merge head, the capped
  blind pass stood in. After fix commits, ONE more capped pass covered exactly those commits, and the
  lead hand-read anything after that. The lead then merged the head under the wave's delegation: the
  owner's "merge all", not an automated bypass. The section "Gate and merge calls made under the
  delegation" below lists these merges for the owner to ratify.
- **How this wave's migrations reached prod.** Each wave migration went to the QR project
  `fasnpdhtvqtzjlvruqcu` ONE FILE AT A TIME through the Supabase MCP `apply_migration`, after
  `get_project_url`, on the wave's delegation rather than a go for each file. Each was verified object
  by object before the next (the list is below).
- **Decisions.** Each is recorded where it was made, as decided under the owner's delegation and never
  as an owner ruling. They are listed below for the owner to ratify.
- **Branch protection** was re-measured 2026-10-11 22:56Z with C28 ③'s reads: `private: false`,
  `GET /branches/main` → `protected: false`, `/branches/main/protection` → 404, `/rulesets` → `[]`,
  `/rules/branches/main` → `[]`. Every check is still advisory.

### Merged (dates UTC)

Before the wave, on 2026-10-08: #319 · #320 · #324 · #325 (the archive's 2026-10-08 block).

- **Foundations:** #326 the pass tokens `1e9f554` (10-08) · #327 `CounterPass` and `KitchenTrack`
  `1b5e7e9` (10-09) · #332 the in-flight handoff `1f35ba3` (10-09).
- **PD1:** #335 `b0f6948` (10-11). Follow-up: #342 `54046e9` (10-11), Codex's post-merge review of
  #335 (the nudge's line lock).
- **PD2:** #331 `c363267` (10-09). Follow-up: M268 #338 `9bc12c8` (10-11), PD2's residual (the
  register's settle releases a dead attempt's promo pin).
- **PD3:** #330 `1c82585` (10-09). Follow-up: #339 `eef4a46` (10-11), a solo session refuses a second
  member.
- **PD4:** #329 `dd3ce03` (10-11), with the Sheet's `initialFocus`.
- **PD5:** #328 `2c0135e` (10-09). Follow-up: PD5b #340 `440e6dd` (10-11).
- **PD6:** #334 `f878725` (10-11), with PD2's pane twin, PD1's ring, K44 and P2do.
- **PD7:** #341 `3036e64` (10-11), M182. Follow-up: M270 (1) #347 `f913713` (10-11), the KDS stop
  card; the kitchen guide ships with it.
- **PD8:** #333 `e116500` (10-09), with M184's close arm. Follow-up: M269 #337 `2c0d040` (10-09).
- **PD9:** #336 `191a549` (10-11).
- **PD10:** #346 `f95f8cc` (10-11): the live pass, with card / Apple Pay after served built behind the
  parked flag.
- **PD11:** #348 PD11 → `73c34c9` (10-11), the diner's first-visit guide.
- **PD12:** #345 `4b3e7d6` (10-11), the counter guide. The kitchen guide shipped with #347.
- **Other follow-ups:** #343 `33c5179` (10-11), T54 (the Radix teardown flake) · #344 `bd9ea46`
  (10-11), G25 (a delivered offline replay records its charge).

### Prod migrations applied, in order

One file at a time, through the MCP, on the QR project. The files are in `supabase/migrations/`.

1. M184: `20261008120000_m184_approval_refuses_when_changed.sql` (#333)
2. M269: `20261009120100_m269_approve_cart_lock.sql` (#337)
3. PD3's solo session: `20261009120200_pd3_solo_session_refuses_join.sql` (#339)
4. PD1: `20261008123000_pd1_send_nudge.sql` (#335; prod row `20261011045025`)
5. PD5b: `20261009120300_pd5b_settlement_batch_and_fold.sql` (#340)
6. M268: `20261009120000_m268_settlement_releases_stale_pin.sql` (#338)
7. M182: `20261009120400_m182_table_clear.sql` (#341)
8. PD1N: `20261011123000_pd1_nudge_line_lock.sql` (#342)

The last prod stamp is `20261011105607`. The MCP generates prod's stamps and they match no filename
(M125), so this is the apply order, not the files' order. PD1's file is never re-applied after
PD1N's: its `create or replace` would put back the nudge with no line lock (OPEN-ITEMS PD1). Measured
on prod 2026-10-11 16:37Z: `qr_table_clears` held 0 rows.

**Apply order vs file order.** Some files were applied out of filename order (PD1 after M269 and
PD3's; M268 after PD5b). Measured over the eight files' `create … function` names: no pair applied out
of file order restates the same function. The only functions two files share are
`mms_resolve_approval` (M184 → M269) and `mms_nudge_host` (PD1 → PD1N), and both pairs were applied in
file order.

### Decided under the delegation — for the owner to ratify

One line per moment, with where it is recorded. Each spec's build notes hold the reasons.

- **PD1** (diner-cart; m1 §H, "Decided under the owner's delegation" 1–7). "Let {host} know" is offered
  only for a host the table can name. There is one stamp per cart (the latest nudger). "Aye can see
  you're waiting." follows the stamp on both host surfaces. The grace reads "Sending…". The Sheet keeps
  its own initial focus. Status is read on the view's server clock. The confirmation is said once.
- **PD2** (diner-cart; m2 §H, "Decided under the owner's delegation" 1–6 and "Residuals filed"). The
  dock's slot is a min-height. The reader's line is "Ready for the bill?". The note names the state and
  the dock names the next step. A tablemate's ask does not join `viewKey`. The parked split clause drops
  its first sentence. The create-intent refusal is English-only (`K15 · diner-cart`). M268 was built as
  #338: every settlement door releases a dead attempt's promo pin under its own freeze.
- **PD3** (post-pay; m3 §H6 and OPEN-ITEMS PD3). The 30-minute lead (`ARRIVAL_LEAD_MIN`), the 10-minute
  replay window (`PENDING_ARRIVAL_MAX_AGE_MS`) and the `too_early` sentence are kept as built. A solo
  session (pickup and scan-and-go) refuses a second member, in SQL (`mms_refuse_solo_join`, #339).
- **PD4** (grocery; m4 §H, "Decided under the owner's delegation" 1–7 and "Open questions, decided"
  1–3). Examples: screen 2's NEXT sentence, the counter tag's Burmese line at `--fs-h2`, the wording of
  `drainSummary`, the Undo and "Add another" sharing one slot, a single-slot pairing (its reopen trigger
  recorded), and an iOS `<body>` opener refused.
- **PD5** (kitchen-ops; m5 §H, "Decided under the owner's delegation", and §H.4). A rail chip counts as
  a twin. Line 2 is frozen at the bump. `kds.undo.stillOn` takes `{x}`. A counter walk-up that sends
  twice is not numbered. PD5b (#340) marks settlement food with a version-8 batch UUID, and the merge's
  fold keeps each Send whole.
- **PD6** (counter-floor; m6 §H, "Decided under the owner's delegation" 1–6). "Opening payment…" shows
  only while a newer read is due. An unpriced read refuses the door (`pad.reason.unpriced`). The seal
  has its own hero sizes and step-downs. "Back to the counter" appears only in the counter's pane. The
  slip is drawn only in the till layout. The seal's actions sit outside the pass.
- **PD7** (counter-floor; m7 §H, "Decided under delegation", and §I for M270 (1)). B9 took its
  alternative: the window lives in the pane's Clear, and the floor card's window is M270 (2). There is
  no slab and no Merge door on the slip. `p_seen_lines` keys a line as draft or sent, never by kitchen
  state. Paid food the kitchen has not finished holds the clear (the lead's default, not Codex's
  stop-only alternative). Each Send gets one stop card, each clear one "Got it", and there is no age
  floor.
- **PD8** (staff-authority; m8 §H, "Delegated decisions" and its M269 paragraph; OPEN-ITEMS M269). The
  close arm is also admitted when the line changed on an open cart. Approve refuses `changed` without
  writing. The verdict channel is the focused receipt row. M269 is its own migration, applied after
  M184.
- **PD9** (kitchen-ops; m9 §G, "Decided in the build". The record says "build", not "delegation").
  The wall recomputes a Send's round on every poll. The frozen bound runs on the device clock.
  Same-name rows sort by first stamp. There is no kiosk code and one `KitchenStage`. Two owner
  questions are recorded there and not decided.
- **PD10** (post-pay's primitives; m10 §H, "Decisions made under the owner's delegation"). A portrait
  pass keeps the stub on the right and a landscape pass on the left. There is no inset sheen, and the
  stub's ground is a mix. The 40px and 54px tiers are scoped to `.ui-pass`. The accessible name uses one
  tongue. TURN is keyed by the host. m10 §I records the live pass's readings of the spec, not labelled
  as delegation.
- **PD12** (kitchen-ops; m12 §H, "Taken and decided"). The kitchen guide was built and held until the
  stop card it teaches was mounted. It shipped with M270 (1) in #347, and the flip's condition (b) was
  decided there (m12 §I).
- **PD11** (the PD11 stream; m11 §H, "Decided under the owner's delegation" 1–9). Focus stays on the
  pressed control while the dialog's one region speaks the page. The opening stop is the sheet's
  container. The sheet's ✕ is the close, and it is not armed. It shares PD12's guide grammar. Page 5 is
  titled "Your order". Page 2's two sentences are English-only. Page 4 states no tender before the flip
  and draws no Pay control after it (`GUIDE_PROVEN_WALLETS = ["Apple Pay"]`). Page 2's picture has no
  avatars.

### Gate and merge calls made under the delegation — for the owner to ratify

These were measured 2026-10-11 from each PR's `merged_at` and the `codex-review` check runs on its
merge head (`GET /repos/min-hinthar/mms-platform/commits/<head>/check-runs?check_name=codex-review`).

- **15 PRs merged before Codex had reviewed their merge head:** #329 #330 #331 #332 #333 #334 #335
  #336 #337 #338 #339 #340 #341 #343 #346.
  - **#335** is the one where Codex's verdict arrived after the merge. It merged at 04:51:07Z, with no
    `codex-review` run yet on its head `7811cba`. Codex's review came at 05:13:05Z, and the check
    turned green ("Codex reviewed this commit") at 05:18:19Z. Its findings became #342 (PD1N). PD1's
    migration was applied before #335 merged (prod row `20261011045025`), so the nudge ran on prod
    without its line lock until PD1N was applied, the wave's last apply (`20261011105607`).
  - The other 14 had `codex-review` red ("Waiting on Codex") at merge, with Codex out of quota. The
    capped blind passes and the lead's hand-read stood in.
- **Codex had reviewed the merge head before the merge** on #326 #327 #328 #342 #344 #345 #347 #348.
- **Money-path PRs merged without waiting for Codex.** Ruling #1's default is to wait. Measured over
  the 15, from each PR's file list (`GET /repos/min-hinthar/mms-platform/pulls/<n>/files`), against
  `scripts/check-money-coverage.mjs`'s `MONEY_PATHS` (non-test files under `apps/qr/lib/` or
  `apps/qr/app/api/`):
  - 13 touch a `MONEY_PATHS` file: #329 #330 #331 #333 #334 #335 #336 #338 #339 #340 #341 #343
    #346.
  - Of those, 9 touch a file the guard treats as money-bearing (its text at the merge commit matches
    a `MONEY_MARKERS` pattern): #329 #330 #331 #333 #334 #335 #338 #341 #346.
  - #332 and #337 touch none. `MONEY_PATHS` covers TypeScript only: #337 (M269) changes the SQL
    function `mms_resolve_approval`, which it does not see.
- **PD6 (#334) merged before the device sitting.** Ruling #12 puts the sitting "before K39 merges",
  PD6 carried K39's re-host, and K39's row said "PD6 merges after the device sitting (#12)".
- **The eight prod migrations were applied on the delegation**, not on the owner's go for each file
  (ruling #5).
- **A tension for the owner, not resolved here.** PD7's "paid food the kitchen has not finished holds
  the clear" (`paid_unserved`, m7 §H, decided under the delegation) reads against ruling #6's
  "Clearing a table never waits."

### Open PRs and branches (measured 2026-10-11 ~22:55Z)

- **#348 PD11 → `73c34c9`** merged at 23:18Z, after this block was first written. Its branch,
  `claude/feat/pd11-diner-guide`, joins the merged-PR branches below.
- **#323**: dependabot's `npm_and_yarn` group bump, open since 2026-10-08. It is not part of the wave.
- **This handoff** is on `claude/docs/handoff-path-design-wave-built`. The wave's first handoff branch,
  `claude/docs/handoff-path-design-wave`, belongs to #332 (merged).
- Every other wave branch on origin belongs to a merged PR and has not been deleted. Under
  `claude/feat/`: pd-tokens-pass · pd-pass-primitives · pd3-pickup-promise · pd5-kitchen-round-two ·
  pd2-pd1-diner-cart · pd8-manager-approval · pd6-till-tray · pd1-tablemate-send · pd4-grocery-miss ·
  pd9-tv-board · pd7-clearing-a-table · pd12-staff-guides · pd10-live-pass · m270-kds-stop-card ·
  pd11-diner-guide. Under
  `claude/fix/`: m269-approve-cart-lock · pickup-session-refuses-join ·
  pd5b-settlement-batch-and-fold · m268-register-releases-promo-pin · pd1-codex-post-merge ·
  radix-focus-scope-teardown · g25-replay-billed.

## Next tasks — after the wave

**Start from the retrospective:** [`RETRO_PATH_DESIGN_WAVE_2026-10-11.md`](RETRO_PATH_DESIGN_WAVE_2026-10-11.md). It holds the wave's measured baselines and the next ten PRs in order. In that order: ledger conflicts made impossible; one sanctioned merge path; memory that loads; mutants where they pay; the SQL lane as a matrix; reviewers in the order they pay; the playbook as a skill; `pnpm retro`; migration safety; deterministic jsdom timing. It also covers the staff and guest feedback → issues → fixes loop, and the owner decisions the plan waits on.

1. **#348 PD11 → `73c34c9`** merged 2026-10-11 23:18Z. No wave PR is left open but this handoff (#349).
2. **The registry's stale statuses were swept in this handoff's PR.** Status cells now say "built and
   merged" with the PR and merge SHA, and each migration row says when it was applied to prod and that
   it went through the MCP, one file, verified. The rows: M268 · M182 · M184 · M269 · P2do · P2hf · K44 · PD3 ·
   PD4 · PD5 · PD6 · PD7 · PD8 · PD11 · PD12. The rows' now-false sentences were restated too ("NOT applied",
   "apply it before #342 merges", "prod apply on the owner's go", "Merges after the device sitting",
   "Waits on PD7"), in M184 · M269 · PD1 · PD2 · PD5 · PD6 · K39. Every open follow-up stayed open, and
   no row was moved. Left to the streams: M269, P2do, PD3 and PD8 say in their text that they close on
   a merge (for PD8, also M184's apply) that has now happened. K44's and PD6's old status said "closes
   on merge" too. Each of these can move to Closed.
3. **What the delegated follow-ups still need** (their rows and spec notes):
   - **M269** (#337, applied): its row says it closes on #337's merge (item 2). Its text notes the card
     doors' webhook fulfillment was not traced.
   - **M268** (#338, applied): nothing beyond its row's status.
   - **The pickup-join refusal** (#339, applied): it closes with PD3's row. m3 §H6 lists nothing left.
   - **PD5b** (#340, applied): batches fired before the migration carry no mark. A table live across
     the deploy that had earlier settlement food can read one round high until its session ends (m5
     §H.4). This ends on its own and is recorded. Nothing is left to build.
4. **The PD10 flip** (`SURFACES.dineInPhonePay`, parked) ships in its own PR (one commit), never in the
   key swap. It needs D5's three conditions: live keys verified (C2); PD2 and PD10 merged (both are);
   and the device sitting confirming that drinks get bumped. Right after it deploys, prove the door
   with one real Apple Pay payment for the cheapest dish at a table, refunded from Today's payments &
   refunds. If that payment or its refund fails, revert the flip PR (PATH_DESIGN D5; OPEN-ITEMS C2 and
   PD10; m10 §I). PD10's row also keeps open:
   - Dad's after-flip cash-only line (counter-floor);
   - screen 3's stamped pass (post-pay);
   - the verdict wired into `openSettlement` and `create-share-intent` before `selfServeSplit` reopens;
   - K15 drafts for the new English-only lines;
   - a device measurement of the folded pay step.
5. **New rows from this handoff:**
   - M276: M182's invoker clear relies on the hosted project's default privileges.
   - T55: `verify-mode-authority` is growing toward its 15-minute timeout.
6. **Filed this wave, open:** G26 (the G25 residual), M270 (2)–(9), M271–M275, and the
   `K15 · <stream>` rows (post-pay · kitchen-ops · diner-cart · grocery · counter-floor ·
   staff-authority).
7. **What PD1–PD13 still hold** (each row's own words, measured 2026-10-11):
   - **PD1:** drop `SplitContext.qrCode` and its select (no reader since the fix round); the host's
     name ask (m1 decision 16); `showServerStatus` delegating to `lib/kitchen-track.ts`.
   - **PD2:** the ask over unsent dishes, refused until P2do (P2do was built in #334).
   - **PD4:** the composite-contrast rows for the constant-cream tag and for the CounterPass over a
     live image (m4 amendment A2); the device-sitting checks.
   - **PD6:** it merged (#334) before the device sitting (#12), so the sitting's till-tray checks still
     stand (item 2; "Gate and merge calls made under the delegation").
   - **PD7:** M270 (2)–(9).
   - **PD9:** a station nobody bumps pins its table; burn-in and the TURN's frame rate on the TV; the
     read's p95 (m9 §G); an "All clear" wording question for the native sitting.
   - **PD10:** item 4.
   - **PD11:** its row names nothing left (#348 PD11 → `73c34c9`).
   - **PD12:** the headless measurement at 1366 and in the 34rem sheet (m12 risk 9), and the K15-HIGH
     candidates (for staff-authority or the owner).
   - **PD13:** `gated`. It is not built, and its reopen trigger is unchanged.
   - **PD3 · PD5 · PD8:** their rows name nothing left (item 2).
8. **ROADMAP's open Phase 3 slices:** 3e and 3f. (3d · counter's cash-sheet re-host is ticked.)
9. **Owner-gated:** the device sitting (#12), the native Burmese check (K15), live Stripe keys (C2) and
   branch protection (C28: none in effect, above).

## The owner's items (not code)

1. **C28 ② (with C16):** require on `main` `codex-review`, `verify-slice`, `build`,
   `migrations-check + types-fresh`, `docs` and `require-docs` — never a `verify-slice shard (N)` leg,
   `publish-codex-verdict`, the retired `codex-reviewed`, `Supabase Preview` or `Vercel Preview Comments`.
   **Keep the admin bypass** (classic rule: leave "Do not allow bypassing the above settings" unticked;
   ruleset: Repository admin on the bypass list) and **do not require Code Owner review** (the sole code
   owner authors every PR and cannot approve their own). Then re-measure with C28 ③'s commands.
2. **Codex out of quota** (owner, 2026-10-08; normative in the rulings file §G G3 and WORKFLOW §Review
   step 5 (g)). When Codex answers a review request with its usage-limit message ("You have reached your
   Codex usage limits for code reviews"), the capped blind adversarial review of the EXACT head stands
   in: its verdict is posted on the PR naming that head SHA, with `verify-slice` and the rest of CI green
   on the same SHA. The OWNER then merges that head with GitHub's admin bypass, by hand. An agent never merges a head whose `codex-review` is red (the `.md`-only waiver, under the conditions in WORKFLOW §Review step 5 (f), is the one exception) and never automates the bypass (a gate accepting a verdict
   comment posted from the owner's account was refused as a CI bypass: the agent posts AS the owner and would satisfy its own required check).
   The bypass covers a red `codex-review` only — never `verify-slice`, `build`, `docs`,
   `migrations-check + types-fresh` or `require-docs`. Rulings #1–#2 still frame it: the `.md`-only waiver (how an agent applies it: WORKFLOW step 5 (f); listed `#N @ SHA · .md-only` for the same bypass once the check is required); A money-path PR the blind pass flagged keeps ruling #1's default: it waits for Codex's review of its head unless the owner overrides that line; with Codex out of quota, the owner's override is their own bypass merge. #1's "full verify:slice watched to the end" is now the `verify-slice` check green on that SHA. A fix pushed after the capped pass gets ONE more capped blind pass over exactly those fix commits — the last agent round (owner, 2026-10-08: "Yes one more"; WORKFLOW step 5 (g)).
3. **C2, the live-key cutover** (ruling #8). The dine-in phone-pay flip is its own PR after C2 and ENV
   step 7, never in the key swap (PATH_DESIGN round 3, D5; PD2 · PD10).
4. **Each migration's go, one file at a time** (ruling #5, at a time the owner names). The wave's
   eight files were applied under the 2026-10-09 delegation, in the order the top block lists. PD1's
   file is never re-applied after PD1N's: its `create or replace` would put back the nudge with no
   line lock. Still the owner's go, as their PRs go green: K30 with K34, and M210 · M208 · M205. M168
   (#21) and T4 (#22) each need their own go, and so will M276's follow-up migration.
5. **C25** (ruling #4): reload every staff screen once at a quiet moment. The trigger happened: #317's
   production deploy, 2026-10-07 09:43Z (rulings §D). Not reported done.
6. **C1 per ruling #9:** email confirmations ON, Google open to any Google account. Never a workspace
   restriction, never disabling sign-up (both break diners); re-test one diner upgrade afterwards.
7. **#13:** once money-rails' M160 cron lands, add `CRON_SECRET` in Vercel Production.
8. **The device sitting** (#12: K39 · P2bw · J28 · J42, plus PATH_DESIGN's "What still goes to the owner",
   e.g. whether drinks get bumped) and **the native Burmese sitting** (rulings §C, plus PATH_DESIGN's
   K15 drafts and D3's confirmations). Facts only the owner holds keep their defaults (rulings intro, 3).
9. **No registry row yet:** the Phase 2i device measurements M2–M9 (a preview plus one real tablet; the
   table is in the archive's 2026-10-02 block). #12's sitting does not list them: file them in
   OPEN-ITEMS, and the owner decides whether the sitting takes them.

## How work runs here (only what CLAUDE.md and WORKFLOW.md do not say)

- **The shape of a phase:** an understand/design pass → a contract commit → parallel worktree streams,
  each through a fresh-context critic → integration and the local gate (`--only=` per touched
  money/authority module) → the PR → mark ready, `@codex review`, ONE capped blind pass over the full PR
  diff beside `verify-slice` → the merge (WORKFLOW §Review step 5, on ruling #1's per-SHA line).
- **Delegated owner questions:** decide with the recommendation and record it as a decision made under the owner's delegation (decided by: the session), never as an owner ruling — in the PR's record and the CHANGELOG, or labelled so in the rulings file (§F/§G style). Delegation covers design (§F); a gate, merge or protection decision is never decided that way.
- **Staff copy:** plain words — never settle / tab / fire / bump / void / comp / 86 / expo / update /
  updating in visible copy; Burmese-first bilingual; K15-HIGH strings (food, money) keep their English
  in Burmese-only mode (DESIGN-LANGUAGE's plain-words rule is the base).
- **Counts:** refresh them on every push from `pnpm check:docs`'s output (word-boundary replace, then
  diff the number tokens against the base). This file holds no measured count.
- **Prod migrations:** never `supabase db push` or SQL-editor DDL against the QR project (divergent
  history, M125); ONE file at a time with the Supabase MCP `apply_migration` on the owner's go,
  verifying the objects that file creates (CLAUDE.md, Commands).
- **A top-level `DROP` / `DELETE` in a prod migration.** Observed this wave: `apply_migration`
  stalled on a file that had one. The mechanism is not established. `create or replace` covers a
  restate under the same signature only. A migration that must drop something (an overload's
  retirement, a revoke) goes to the owner as a decision, never disguised inside a `DO` block and never
  silently left out. After an apply, check `pg_proc` by name that no old overload survives, not only
  the objects the file creates (LEARNINGS #267).
- **A migration that changes a lock order re-runs every race harness, not only its own.** PD1's new
  cart lock (the cart is locked first) made PD5b's grace-race scenario hang, which would have timed CI
  out. Codex caught it on #340's merge with `main`. The scenario was rewritten for the new lock order,
  and every race harness ran against the throwaway Postgres 16 before the push (LEARNINGS #268).
- **An invoker function's row locks need table privileges from its caller** (LEARNINGS #256). CI's
  `supabase start` does not grant `service_role` table privileges the way the hosted project's defaults
  do. Grant what the function locks or writes in its own migration, and assert it in its test. The open
  instance is OPEN-ITEMS M276.
- **`verify-mode-authority` grows with the migration chain.** Every wave migration that restates a
  mutated function lengthens each mutant's replay. Watch its CI step before it reddens the sql lane
  (OPEN-ITEMS T55).
- **The capped pass over fix commits after a `main` merge:**
  `pnpm review:bundle --base <the merge commit of the reviewed head with main>` yields exactly the fix
  commits, not `main`'s changes.
- **Mark a PR ready only once `GET /repos/min-hinthar/mms-platform/actions/runs?head_sha=<sha>` lists
  a run named `CI` for the pushed head.** The other workflows start on the same push, so any run does
  not satisfy it. Observed this wave (LEARNINGS #269).
- **Ask Codex on every final head (`@codex review`): its quota is not predictable.** It was out of
  quota through 2026-10-09 and into 2026-10-11 ~01:16Z. It was back ~15:15Z, out again ~19:14Z and
  ~19:31Z, and back ~20:29Z, and it reviewed through #347's merge (~22:40Z). It was out again ~23:08Z
  (#349). The PRs that merged before Codex had reviewed their head are the measured list of 15 in "Gate
  and merge calls made under the delegation" (top block).
- **After adding a second path to the same outcome, re-run the module's WHOLE mutant set**, and fix
  the fixture so it separates the paths (LEARNINGS #266; #347's `m270/kds-board/news-outlives-ack`).
- **Test infra.** The Radix/jsdom timer flake (#343, LEARNINGS #257): `apps/qr/lib/test-setup.ts`
  drains real timers after each jsdom case, before the resets. Radix's close-time focus timing is
  #348's (LEARNINGS #265). Next 16.2.9 serializes server actions, and only a navigate
  or restore starts early (LEARNINGS #262).
- **Give `git log --since` a time.** A bare `--since=2026-10-08` starts at that day's current clock
  time: run at 2026-10-11 ~22:54Z, it dropped every merge of 2026-10-08 (#319, #320, #324, #325 and
  #326).
  Write `--since=2026-10-08T00:00:00Z`.

## Environment facts (measured 2026-10-08 unless cited)

- **QR's own Supabase project is `fasnpdhtvqtzjlvruqcu`** (delivery's is `ukuzkhuppqwtrdkjqrkv`).
  Preview and production share it; there is no staging project (OPEN-ITEMS T3, [`docs/ENV.md`](ENV.md),
  which also lists the app env the owner sets in Vercel). Target that `project_ref` with the Supabase MCP — confirm it first (e.g. `get_project_url`): the repo's `.mcp.json` Supabase entry points there (the owner, 2026-10-08: "target is fasnpdhtvqtzjlvruqcu"; OPEN-ITEMS T53 ⑥), but a session can load another MCP config — and run `get_advisors` (security and performance) after every migration.
- **Check the shell's Supabase env before `pnpm dev`** — names only, values unprinted:
  `env | grep -oE '^[A-Z_]*SUPABASE[A-Z_]*='`, then `printenv NEXT_PUBLIC_SUPABASE_URL`. Next lets shell
  env override `.env.local`. Here the URL pointed at `fasnpdhtvqtzjlvruqcu`, beside
  `NEXT_PUBLIC_SUPABASE_KEY` and `SUPABASE_SECRET_KEY` (names the app does not read: it reads `…_ANON_KEY`
  or `…_PUBLISHABLE_KEY`), and no `SUPABASE_SERVICE_ROLE_KEY`. If it names another project, inline-override:
  `NEXT_PUBLIC_SUPABASE_URL=https://fasnpdhtvqtzjlvruqcu.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable key> pnpm --filter @mms/qr dev`.
  Local smoke: `curl "localhost:3000/menu?mode=dinein"`.
- **No Docker daemon, no Supabase CLI:** `docker` and `dockerd` are installed but no daemon ran (no
  `/var/run/docker.sock`; whether `sudo dockerd` starts was not measured) and `supabase` is not on
  `PATH`, so `supabase start` does not run as the container comes. PostgreSQL 16's server binaries are
  in `/usr/lib/postgresql/16/bin`: LEARNINGS #95 builds the throwaway Supabase-shaped cluster on
  `127.0.0.1:54322` (nothing listened there when measured), and #243 runs the `supabase` job's scripts
  against it before a push.
- **Types:** CI's `types-fresh` pins the Supabase CLI at 2.107.0 (`ci.yml`) and diffs `pnpm db:types`
  byte for byte; the committed `database.types.ts` is the raw `--local --schema public` output,
  prettier-ignored. The recipe last used (not re-run 2026-10-08): `sudo dockerd &`, download `supabase`
  2.107.0 from GitHub releases, `supabase start -x edge-runtime,studio,imgproxy,logflare,vector,mailpit`
  (the pg-delta / edge-runtime TLS error at boot is benign — migrations still apply), `pnpm db:types`.
- **The container is 4 CPUs / 15 GB.** Six streams running their gates at once put the 1-minute load near
  45; under that load vitest's 5 s default timeout reddened untouched suites in two local full gates (the
  primitives' and PD4's), each green on CI's `build` for the same head. Run the one full gate per stream
  when the load is under ~12, and read CI's `build` as the measurement.
- **ESLint is pinned to 9.x** (`^9.39.4`, root `package.json`): ESLint 10 broke `eslint-config-next`'s
  react plugin (the archived note; not re-tested).
