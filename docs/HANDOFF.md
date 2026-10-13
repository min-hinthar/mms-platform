# Session Handoff — MMS Platform (2026-10-13 · the open-items triage and its tranche)

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

## Where things stand (2026-10-13 — the open-items triage and its tranche)

Measure first: `git log origin/main --oneline --since=2026-10-12T00:00:00Z`, the open PRs
(`list_pull_requests`), and `git branch -r`. **Everything below about #351–#356 is a record of
2026-10-13 ~06:22Z,** when all six were open. This handoff lands after them (the order below), so by
the time you read it some or all have merged: read each PR's state before acting on its line. The path-design wave's record (what merged, the eight prod
migrations in apply order, the decisions made under the 2026-10-09 delegation, and the 15 merges the
owner ratified in OWNER_RULINGS §H1) moved verbatim to the archive's 2026-10-11 block.

### The owner's directives this session (2026-10-12)

- **"merge all. Yes it covered"**: the wave's 15 merges were ratified (OWNER_RULINGS §H1, #350).
  **"merge both"**: #323 → `533a886` and #350 → `02bf46c`, merged on that instruction.
- **"I trust you to resolve all remaining plan design and open items to end session."** Read as:
  read every open row against the code, close what is stale or duplicated with evidence, build a
  tranche of the buildable rows and the PD1/PD2 remainders, and list what waits on the owner. It is
  not a merge instruction (G4), and it is not a go for any migration (ruling #5). No PR below has been
  merged by an agent, and no migration was applied this session. None of the six PRs adds a migration.

### What was done

1. **Every open row was read against the code.** That covered every row that was open, gated, planned
   or parked on `main` at `02bf46c`. The record is `docs/OPEN-ITEMS_TRIAGE_2026-10-12.md` (in #351):
   its summary table holds the counts (recomputed after Codex's two reviews of #351, which reopened
   K28 and moved 28 rows to the verdicts its definitions give them). It sorts every row into
   Buildable without the owner, Owner-gated, Keep open, Closed by the sweep, or Done in place. Each
   row has its next step, and each buildable row has a size and its money and migration flags.
2. **Six PRs, open at 06:22Z, none merged by an agent.** Codex was out of quota when their blind
   passes ran (its usage-limit replies from 00:31Z on), so for each the capped blind pass on the full
   diff stood in, then ONE more capped pass over exactly the fix commits (launched before Codex's
   04:30Z review of #356's `aadd2dd`, the first it gave that morning). The lead hand-read anything after
   that, in one comment per PR naming the final head and the commits no blind reviewer read. Codex came
   back intermittently from 05:40Z and reviewed some final heads (the merge window says which).

   | PR   | What                                                                                                   | Closes                                                                                                                                     |
   | ---- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
   | #351 | The registry sweep (`.md` only)                                                                        | 28 rows closed with evidence and 5 folded into the rows that carry them (PD7 into M270); K28 reopened on Codex's review; M284 · M285 filed |
   | #352 | Money guards: the Stripe client's budget, settle and Terminal guards, grocery money guards             | M164 M165 M155 M166 M216 M252 T9 M187 M188 M189 T25; M72c partial; M277–M279 · J55 · M286–M291 filed                                       |
   | #353 | One host source, named session refusals, the live promo quote, one day-ledger read                     | M169 J16 M123 M211 M221; M280 K47 J56 filed                                                                                                |
   | #354 | /cart write results say what landed; guards that reach further                                         | T41 T42 M230 P2au M220 T28 T44; M226 partial; T57 filed                                                                                    |
   | #355 | a11y and fidelity: the promo and account boxes are Fields, /menu's one region                          | K44 M127 F20 F31 M214; PD4 · PD12 partial; K48 F37 filed                                                                                   |
   | #356 | PD1's and PD2's open code: the tablemate pass on the kitchen track, the counter ask over unsent dishes | PD1 PD2; J57 T58 M281–M283 filed                                                                                                           |

3. **Filed by this handoff** (from the capped passes' open questions): J58 (may an invitee who reloads
   a still-hostless table become its host; the owner's call), J59 (is a dish inside the send's undo
   window "gone to the kitchen"; the owner's call), T59 (`totals.test.ts` answers the charged reads
   whatever their key), M292 (the split door's release owner is guarded by prose, for its reopen) and
   F38 (a keyboard Apply pulls focus back into the promo box).

### The merge window — for the owner

Each line is `#N @ SHA`, valid only once CI is green on that SHA. Read each PR's last hand-read comment
for what it lists. Branch protection was re-measured 2026-10-13 05:41Z with C28 ③'s reads:
`private: false`, `GET /branches/main` → `protected: false`, `/branches/main/protection` → 404,
`/rulesets` → `[]`, `/rules/branches/main` → `[]`. Every check is still advisory. G3 applies to every line below: an agent never merges a red `codex-review` head, and
the owner merges with the admin bypass by hand.

Measured 2026-10-13 06:22Z, on each PR's final head. Codex's quota came and went through the morning:
it reviewed #354's and #356's heads clean and #351's first two heads (three findings, all fixed), and
answered #352, #353 and #351's last head with its usage-limit message. A head whose `codex-review` is
green ("Codex has reviewed" that head) needs only the owner's per-SHA yes (G4). A head still red needs
the owner's bypass (G3). Every PR below except #351 changes `CLAUDE.md` or `.claude/**`, so each needs
the owner's per-SHA line either way. Each PR's last hand-read comment names the commits no blind
reviewer read. **A merge-in commit is a new head:** a "per-SHA yes" line below holds only for the head
it names, and the head that actually merges (after taking `main`) needs its own Codex review or the
owner's bypass.

- `#351 @ 750a705` · `.md` only, no rule file. `docs`, `require-docs` and `verify-slice` are green.
  `codex-review` is red (usage limit on this head), so it needs **the owner's bypass**.
- `#352 @ 4dcef3b` · `build`, `verify-slice` and `require-docs` are green. `codex-review` is red (usage
  limit), so it needs **the owner's bypass**. One commit after the capped pass touches MONEY_PATHS
  (`fa9b86e`, a `git revert` to bytes the first blind pass read, proved by an empty diff of those
  files; the diff proves bytes, not how they combine with the fix commits kept, which the capped pass
  over the fix commits read). The gaps the revert leaves are open on that head: M289 and M290.
- `#353 @ 5653f13` · `build`, `verify-slice` and `require-docs` are green. `codex-review` is red (usage
  limit), so it needs **the owner's bypass**. The capped pass over the fix commits reviewed this exact
  head (APPROVE). **Decide J58 with it:** #353's host promotion lets an invitee who reloads a
  staff-started (hostless) table become its host for good; J58 asks whether that is allowed.
- `#354 @ 73ccc1d` · **every check green, `codex-review` included** (Codex: no findings).
  `mergeable_state: clean`. It needs only the owner's per-SHA yes.
- `#355` · Codex's review of `63f35fe` found three races (a refusal bound to a box retyped during the
  round trip; a deferred diet count said after its filters were unlit). The fix is a further head;
  its own hand-read comment names it. One commit after the capped pass touches a MONEY_PATHS file, and
  only its comment (`promo-field.ts`).
- `#356 @ 00a768f` · **every check green, `codex-review` included** (Codex: no findings).
  `mergeable_state: clean`. It needs only the owner's per-SHA yes.
- This handoff: `.md` and `.claude/**` only, so it needs the per-SHA line.

**Order and conflicts.** All seven PRs (this one included) touch `docs/OPEN-ITEMS.md` and
`CHANGELOG.md`. #352–#356 also touch the counts in `CLAUDE.md` and `README.md` and the mutant
registry. #354, #355 and #356 all touch `apps/qr/components/Checkout.tsx`. Merge one at a time, in
this order: #351 → #353 → #352 → #354 → #356 → #355 → this handoff. After each merge, the next PR
merges `main` in (a merge commit, never a rebase), resolves conflicts as a set (LEARNINGS #61),
re-measures the counts with `pnpm check:docs`, and waits for CI green on its new head. The merge
commit is a new head, so its line above is void until its own hand-read comment names it: under the
quota rule, a hand-read of the merge's conflict resolutions. #354, #355 and #356 resolve each other's
`Checkout.tsx` changes this way, and a component is not a MONEY_PATHS file, so the merge lines will not
flag it: the owner may require a capped pass on those resolutions (see "For the owner").

### Next tasks

1. **Land whichever of #351–#356 are still open**, in the order above, each on the owner's per-SHA
   line (and the bypass where its `codex-review` is red), then this handoff.
2. **The buildable rows** (`docs/OPEN-ITEMS_TRIAGE_2026-10-12.md`, "Buildable without the owner").
   These high-severity rows are still open after the tranche: F3 · F5 · S2 (no money), and M160 ·
   P3b · PD10 (money). Those with a migration, whose prod apply waits for the owner's go per file,
   are M178 · M210 (with M208 · M205) · K30 (with K34) · M124 · M168 · M270. Build them as themed PRs,
   like the tranche. Reserve an ID range per stream before any fan-out (LEARNINGS #272).
3. **The retrospective's ten PRs** (`docs/RETRO_PATH_DESIGN_WAVE_2026-10-11.md`) still stand, in its
   order.
4. **Still open from the wave** (each row's own words): the PD10 flip's three conditions (C2, PD2 and
   PD10 merged, the device sitting), M276, T55, and the PD4 · PD6 · PD9 · PD12 device checks. PD13
   stays `gated`.

### For the owner (decisions, not code)

- **Questions this session raised:** J57 (should the send's undo window still hold the counter), J58,
  J59, M270 (2) (B9's in-slot Undo window, or PD7's shipped alternative), T43 (what "your usual" says
  under a visible lock), and K20 (the age policy for the queue).
- **Still to ratify from the wave:** the decisions made under the 2026-10-09 delegation (the archive's
  2026-10-11 block, "Decided under the delegation"), and the P2hf tension with ruling #6.
- **Whether the merge-in resolutions of `Checkout.tsx` (#354 · #355 · #356) need a capped pass,** or
  the author's hand-read is enough.
- **The owner-gated rows:** the triage record's "Owner-gated" table, each with what it waits on.
  The items below ("The owner's items") are the standing ones.

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
   eight files were applied under the 2026-10-09 delegation, in the order the archive's 2026-10-11 block lists. PD1's
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
