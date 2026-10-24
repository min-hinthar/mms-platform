# Session Handoff — MMS Platform (2026-10-24 · the owner's four asks on #373; production on test keys)

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

## Where things stand (2026-10-24 — the owner's four asks, on PR #373)

The owner asked, verbatim: "elevate full features (iOS photo upload, add new menu items categories
etc, updates to names prices categories etc,) to menu-editor and with world-class UI UX. manual new
item add to tables orders. Remove PIN for all requests. guest names should also be in kitchen tickets
and boards." All four are built on `claude/blissful-cerf-jxz37k`, on top of round 4's design record,
so PR #373 now carries code. The CHANGELOG entry is the as-built; OPEN-ITEMS "The owner's four asks"
(OA1–OA8) is what is left.

- **The owner's next steps:** (1) the merge — a code PR, so the per-SHA line or the explicit
  instruction (G3 · G4); (2) **OA1** — apply `20261024120000_no_pin_manager_self_approve.sql`;
  (3) **OA2** — apply `20261024120100_menu_studio.sql`. Each is one file through the Supabase MCP
  `apply_migration` on the QR project `fasnpdhtvqtzjlvruqcu`, verified as its header says, before the
  next. The deploy and the applies can land in either order: before OA1, a manager's gated void is
  offered the request queue; before OA2, a photo upload says "Photo storage isn't set up yet".
- **Decisions waiting on the owner:** OA3 (does a manager approve their own queued request?) and
  OA4 (a custom item for servers?). Both ship the conservative side.
- **Measured locally, 2026-10-24:** the four SQL tests the change touches and the two new ones pass on
  the throwaway Postgres 16 (`/var/tmp/mmspg`, rebuilt by `/var/tmp/mmspg-kit/rebuild.sh` — gone with
  the container), and red-first for each new file; `verify-mode-authority` accounted for 349 mutants
  (27 documented survivors, as before) with the new `nopin` suite.

## Where things stand (2026-10-18 — the tranche merged, two migrations applied, production live on test keys)

Measure first: `git log origin/main --oneline --since=2026-10-13T00:00:00Z`, the open PRs
(`list_pull_requests`), and `git branch -r`. The previous block (the triage's merge window for
#351–#356) moved verbatim to the archive's 2026-10-13 block. Every PR it listed has merged.

### The owner's words this session (2026-10-18)

- "apply world-class design-thinking for all open decisions, merge all when ready, launch app
  production ready"
- "go ahead with all recommended decisions and migrations, merge when ready for production". The
  session reads this as the owner's sign-off on every recommendation in
  [`docs/DECISIONS_2026-10-18.md`](DECISIONS_2026-10-18.md) and the go for the migrations those
  decisions name. Ruling #5's mechanics and G3 still hold. The record states the reading, and the
  owner can correct it.
- "admin-bypass approved for this session, proceed and finalize production". This is the owner's
  approval of the admin bypass for this session. #367 merged on it (below). It grants nothing to a
  later session.

### Merged to `main` since the 2026-10-13 handoff (UTC, from the merge commits)

| PR   | Merged           | On `main`                  | What                                                                                         |
| ---- | ---------------- | -------------------------- | -------------------------------------------------------------------------------------------- |
| #354 | 2026-10-13 15:17 | `2fa4d4a`                  | /cart write results say what landed; guards that reach further                               |
| #355 | 2026-10-13 16:16 | `1132fd2`                  | a11y and fidelity fixes                                                                      |
| #356 | 2026-10-13 19:03 | `9e7aa5a`                  | PD1's and PD2's open code                                                                    |
| #353 | 2026-10-13 19:32 | `ca033f8`                  | one host source, named session refusals, the live promo quote, one day-ledger read           |
| #352 | 2026-10-13 20:03 | `5d7ac90`                  | money guards: the Stripe client, settle and Terminal guards, grocery money guards            |
| #351 | 2026-10-18 01:39 | `b2cff0b`                  | the registry sweep (`.md` only)                                                              |
| #359 | 2026-10-18 02:32 | `37a5c35`                  | /track shows the kitchen's real state after paying                                           |
| #360 | 2026-10-18 11:53 | `c41c734`                  | every staff surface tells the same live truth, and a mistake can be taken back               |
| #363 | 2026-10-18 14:09 | `ae18b57`                  | the lifecycle residuals: Cook now moves the order, the market can 86, the stranded note      |
| #367 | 2026-10-18 17:27 | `aea453d` (a merge commit) | the release: #364 (M309) · #366 (M210 · M208 · M205) · #365 (M160(b)) · #361 (session truth) |
| #368 | 2026-10-18 18:29 | `cb659c7`                  | the README's guest guide and the draft social posts (Codex reviewed, two rounds)             |

- **#367 was merged by the agent**, under the owner's session approval of the admin bypass (quoted
  above). Its `codex-review` was red only because Codex was out of quota. Every other check was green
  on its head. #364, #365, #366 and #361 closed as merged through it.
- **#358 is closed.** It was the integration base for the lifecycle PRs, marked "do not merge".
- **#362 is still open** (`claude/fix/lifecycle-diner-sold-out-edits`). It is being brought up to date
  with `main` in parallel and is not merged.
- **Four green PRs became one release.** #361, #364, #365 and #366 were each green on their own head,
  but each conflicted with `main` once another landed, because they all edit the same measured-count
  lines. They merged together as #367 (LEARNINGS #278).

### Prod migrations applied 2026-10-18 (the owner's go; one file at a time)

Each was applied through the Supabase MCP `apply_migration` to `fasnpdhtvqtzjlvruqcu`, after #367
merged, in this order. The objects each one creates were verified one by one before the next.

1. `20261018120000_m309_order_read_scope.sql`: one call, stamp `m309_order_read_scope`.
2. `20261018130000_m210_team_safety.sql`: applied in **eight sequential parts**, the repo file's
   statements in order. The stamps are `m210_team_safety_1_audit_table`, `_2_audit_indexes_rls`,
   `_3_audit_policy`, `_4_audit_grants`, `_5_staff_set`, `_6_staff_provision`, `_7_keep_an_owner`
   and `_8_audit_direct`. The MCP endpoint timed out on the larger calls. After each timeout a read
   showed nothing had been applied and no locks were held (LEARNINGS #279). This widens the M125
   history divergence by eight names for one file (recorded on M125).

### Production

- **Vercel production is READY on `main`.** No runtime errors after the deploy.
- **`CRON_SECRET` is set.** Probed: the cron route answers 401 without the header, not 503. The cron
  SCHEDULE is registered in a separate PR (`apps/qr/vercel.json`), not in this one (M160's status).
- **Stripe (C2) is not cut over, and nothing here says live payments work.** The owner reports
  `STRIPE_SECRET_KEY` set. But the production client bundle still inlines
  `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST` (a `pk_test_…` key), and `publishableKeyCandidates()`
  (`apps/qr/lib/stripe-env.ts`) takes it FIRST. Server-side, `apps/qr/lib/stripe.ts` checks
  `STRIPE_SECRET_KEY_TEST` first too. So while the `_TEST` variables stay in Vercel Production,
  production runs in test mode (LEARNINGS #280). A live webhook endpoint (`we_1U7KIJ…`) for
  `qr.mandalaymorningstar.com/api/stripe/webhook` exists and is enabled.

### Filed by this handoff

- From Codex's later rounds, under the two-round rule: M319 · M320 (#356's host-name ask), M321
  (#359: a split payer's old pickup leaves the tray), M328 · M329 · M330 (#360: the KDS's double alarm,
  the counter's sold-out tag, the wall's cap), M333 · M334 · M335 (#363: the stranded-note notices).
- From the builders: M331 (med: the webhook's own `payment_intent.succeeded` is not refund-checked)
  and M332 (the menu-availability outage sentence has no Burmese twin).
- M326 gains Codex's round-3 note on #363. M309 is applied (its residuals keep it open), M210 is
  closed, and M160 and C2 carry the 2026-10-18 state.
- The decisions round's record is [`docs/DECISIONS_2026-10-18.md`](DECISIONS_2026-10-18.md).

### Design round 4 (2026-10-23/24, `claude/blissful-cerf-jxz37k`)

The owner asked for a "creative design-thinking revamp enhance enrich refine expand improve UI UX". The
standard loop ran on eight NEW moments (m13–m20: the to-go slip, the exit after paying, the front door,
the account record, the money desk, Team, the bag station, the menu editor). The record is
[`docs/PATH_DESIGN_2026-10-23.md`](PATH_DESIGN_2026-10-23.md); the specs are under
[`docs/path-design-2026-10-23/`](path-design-2026-10-23/); the registry rows are PD14–PD21. The owner
was asked once and the prompt was declined, so the round stands on recorded defaults (R4·0–R4·8), each
reversible on the owner's word. Nothing was built and no migration was applied; the migrations it depends on (PD15's seat-membership authorization; PD18's two find indexes and RULING#24 A's `resolved_by` / `resolved_at` columns, each its own file) wait for the owner's go.

### Next tasks

1. **#362**: land it on the owner's per-SHA line (and the bypass where its `codex-review` is red),
   after it takes `main`.
2. **M160's last step:** the schedule merged in #369 (daily, 10:07 UTC). The owner confirms the job under
   Vercel → Cron Jobs and runs it once with `CRON_SECRET` (ENV.md step 5); a 200 closes M160.
3. **Build from the decisions record**, in its builder order. Each migration it names is one file,
   applied after its PR merges (ruling #5's mechanics).
4. **The filed rows above**, M331 first (money).
5. **Still open from earlier blocks:** the triage's buildable rows
   (`docs/OPEN-ITEMS_TRIAGE_2026-10-12.md`), the retrospective's ten PRs, the PD10 flip's three
   conditions, M276 and T55.

### The owner's checklist (still open)

0. **Round 4's defaults** (PATH_DESIGN_2026-10-23 R4·0–R4·8): reverse any with one word; the concept
   screens for every direction stay on the canvas. K40's take-out word for the native round.
1. **Finish C2.** Remove `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST` and `STRIPE_SECRET_KEY_TEST` from
   Vercel Production, then redeploy production. Confirm the bundle serves `pk_live_…`, then make one
   small real-card sale and refund it.
2. **The device sitting** (#12).
3. **The native Burmese check** (K15). #361 added one Claude-drafted line, `billRefundedTitle`
   (`apps/qr/lib/i18n/cart.ts`; the K15 · session-truth row).
4. **Branch protection** (C28; item 1 below).
5. **The social posts' `[confirm]` markers** (`docs/marketing/SOCIAL_POSTS_2026-10-18.md`) before
   anything is posted.
6. **PD13** stays gated on its measured reopen trigger.
7. **C6:** the grocery codes and prices only the owner holds.

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
   step 7, never in the key swap (PATH_DESIGN round 3, D5; PD2 · PD10). As of 2026-10-18 the `_TEST`
   variables still win in production (the top block's "Production"; OPEN-ITEMS C2).
4. **Each migration's go, one file at a time** (ruling #5, at a time the owner names). The wave's
   eight files were applied under the 2026-10-09 delegation, in the order the archive's 2026-10-11 block lists. PD1's
   file is never re-applied after PD1N's: its `create or replace` would put back the nudge with no
   line lock. M309's file and M210's (with M208 · M205) were applied 2026-10-18 (the top block). Still
   the owner's go, as their PRs go green: K30 with K34. M168
   (#21) and T4 (#22) each need their own go, and so will M276's follow-up migration.
5. **C25** (ruling #4): reload every staff screen once at a quiet moment. The trigger happened: #317's
   production deploy, 2026-10-07 09:43Z (rulings §D). Not reported done.
6. **C1 per ruling #9:** email confirmations ON, Google open to any Google account. Never a workspace
   restriction, never disabling sign-up (both break diners); re-test one diner upgrade afterwards.
7. **#13:** done for the secret. M160(b) merged in #367 and `CRON_SECRET` is set in Vercel Production
   (probed 2026-10-18: 401 without the header, not 503). The schedule lands in its own PR.
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
- **Delegated owner questions:** decide with the recommendation and record it as a decision made under the owner's delegation (decided by: the session), never as an owner ruling — in the PR's record and the CHANGELOG, or labelled so in the rulings file (§F/§G style). Delegation covers design (§F); a gate, merge or protection decision is never decided that way. (The one exception is the owner's own, after the fact: the 2026-10-09 wave's merges, which that day's delegation covered, OWNER_RULINGS §H1. It does not carry forward.)
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
  retirement, or the withdrawal of a grant that already exists) goes to the owner as a decision, never
  disguised inside a `DO` block and never silently left out. A new `SECURITY DEFINER` function's
  `revoke … from public` is not such a drop: it stays mandatory, in the same file. After an apply, check `pg_proc` by name that no old overload survives, not only
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
  (#349), and back by 2026-10-12 ~05:02Z (#349's three rounds). The PRs that merged before Codex had reviewed their head are the measured list of 15 in "Gate
  and merge calls made under the delegation" (the archive's 2026-10-11 block).
- **After adding a second path to the same outcome, re-run the module's WHOLE mutant set**, and fix
  the fixture so it separates the paths (LEARNINGS #266; #347's `m270/kds-board/news-outlives-ack`).
- **Test infra.** The Radix/jsdom timer flake (#343, LEARNINGS #257): `apps/qr/lib/test-setup.ts`
  drains real timers after each jsdom case, before the resets. Radix's close-time focus timing is
  #348's (LEARNINGS #265). Next 16.2.9 (and 16.3.8) serializes server actions, and only a navigate
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
