# Session Handoff — MMS Platform (2026-10-09 · the path-design wave in flight)

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

## Where things stand (2026-10-09 ~03:45Z — the path-design wave is in flight)

Measure first: `git log origin/main --oneline -5`, the open PRs (`list_pull_requests` / `gh pr list`), and
`git branch -r | grep claude/feat/pd`.

- **The owner's answers (2026-10-08).** To HANDOFF's "parallel sessions, or the sequence?": "I trust you
  to comprehensively orchestrate/build the path designs in parallel streams with even more creative
  design-thinking refinements" — so the wave runs as parallel streams in ONE session, each in its own
  worktree and branch, each through the full ritual. Then: **"just handoff and merge all on CI green"** —
  the owner's explicit instruction (G4-style, for THIS wave's PRs) that the session merges each PR once
  every check is green on its head (`verify-slice` · `build` · `require-docs` · the lanes that ran ·
  `codex-review` with Codex having reviewed that head — never a red `codex-review` head, G3) and the
  blind pass's findings are fixed or justified on the PR. The per-SHA merge-window line is not needed
  for these PRs; everything else in WORKFLOW §Review step 5 still runs.
- **Merged:** #327 `feat(ui): CounterPass and KitchenTrack` → `1b5e7e9` (2026-10-09 03:50Z, head
  `4c18bef`: the blind pass's items fixed, three Codex rounds, the last with no findings); #326
  `feat(ui): the pass tokens` → `1e9f554` (`--fs-pass`, `--till-fs-hand`, the nine
  constant `--pass-*` inks + `--pass-hole`, pinned by `contrast-audit.test.ts`'s "the pass — constant
  paper" block; the blind pass's REJECT on its first head was the missing guard).
- **Open PRs** — each runs the full ritual (blind-pass verdict posted on the PR, every Codex round
  answered on its threads, `codex-review` green on the merge head):
  - **#328** kitchen-ops' PD5 — one Send = one card. Head `f498d33`: the blind pass's REJECT (the frozen
    stub vs the live-ordinal name) and Codex round 1 fixed in `a870aaf`; the verdict and its
    fix-or-justify table are posted. Based on the old `main` (`f26cc8f`): merge `main` in after its Codex
    round-2 fixes, refresh the counts, and take one more Codex round on that final head.
  - **#329** grocery's PD4 — the paper tag in the lens, the Name sheet, the Sheet's `initialFocus`.
    Head `27081ce`: the blind pass's REJECT and Codex round 1 fixed in `75ec322`, one follow-up (the
    asking sheet compared by identity) in `27081ce`. Same `main` merge after #328.
  - **#330** post-pay's PD3 (draft) — head `d2a3d76`, Codex round 1's ten findings fixed. **#331**
    diner-cart's PD2 (draft, money path) — head `5c074e1`, Codex round 1's three findings fixed. Both
    were retargeted to `main` when #327 merged: merge `main` in after their Codex round-2 fixes, mark
    ready, then the blind pass and Codex on the final head.
  - **#332** — this handoff.
- **Built, PR not yet open:** staff-authority's PD8 (`claude/feat/pd8-manager-approval`: the server
  half + the M184 migration with its `close` arm, then the UI half; finishing its gate);
  counter-floor's PD6 (`claude/feat/pd6-till-tray`, on #327's branch: the till tray, the seal, PD2's
  pane twin, PD1's ring — the tray UI in progress); diner-cart's PD1 (`claude/feat/pd1-tablemate-send`,
  stacked on #331).
- **Not started:** PD7 (after PD6; its migration M182 is not written yet), PD9 (after #327 and #328),
  PD10 (after PD2, #327, #328), PD11 and PD12 last.
- **Integration hazards, handled at each merge:** #328 and #329 both add `.claude/LEARNINGS.md
  ## #250` (`check:docs` refuses a duplicate key, so whichever merges second renumbers; #330 already
  moved to `## #252`); every PR carries its own measured counts (re-run `pnpm check:docs` after merging
  `main` in); CHANGELOG entries stack newest-first; #330 · #331 · PD6 sit on #327's branch (retarget
  to `main` and merge it in once #327 lands); `KitchenStage` is declared in both `@mms/ui` and
  `apps/qr/lib/kitchen-track.ts` until PD9's PR makes lib `import type` it.
- **Migrations, each applied only on the owner's go (ruling #5):** written this wave — M184 + the
  `close` arm (PD8). Planned, not written yet — PD1's nudge stamp (PD1's PR) and M182 (PD7's PR).
- **Two quota stops, no work lost either time** (commits held, uncommitted trees intact): a rate limit
  ~13:20Z on 2026-10-08 (resumed 17:25Z); then the agents' usage credits ran out ~18:35Z, with Codex
  out of quota from 18:26Z, and the container restarted. Resumed 2026-10-09 03:10Z. Codex reviewed
  again from 03:11Z to 03:46Z (#327's final head among them), then answered with its usage-limit
  message again: while it does, a head Codex has not reviewed goes the G3 way — the capped blind pass
  of that exact head, then the OWNER's admin-bypass merge — and an `.md`-only PR may take ruling #1's
  waiver under WORKFLOW step 5 (f). Lesson kept: commit after every coherent step.

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
4. **Each migration's go, one file at a time** (ruling #5, at a time the owner names): PD1's nudge stamp
   (`20261008123000`, applied BEFORE #335 merges — the old build runs unchanged against it);
   M184's, carrying the widened `close` arm (D2; holding that line moves the arm to its own file and
   go); the other #5 files as their PRs go green (K30 with K34, M210 · M208 · M205, M182 · P2hf). M168
   (#21) and T4 (#22) each need their own go.
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

## Next tasks — finish the wave, in the record's order

1. **Merge on CI green, in this order:** #328 → #329, each once Codex has reviewed its final head and
   every finding is fixed or justified (#327 merged; #330 and #331 already target `main`; PD6's PR
   opens against `main`).
2. **Open the draft PRs still owed:** PD8 (money/authority path: its body carries the mutant table and
   "recommend: wait for Codex", ruling #1), PD6 (money path), PD1 (stacked on #331). Then each of
   #330 · #331 · PD8 · PD6 · PD1: mark ready → blind pass → Codex on the final head → merge on green.
3. **Then PD9** (kitchen-ops: `lib/board-tables.ts` + the landscape CounterPass on `/board`; amends
   `board-pulse.ts`, SPEC-KDS, K32(b) / P6a; merge line names the privacy change), **PD7**
   (counter-floor: clearing, the loss slip, M182), **PD10** (the live One Pass on the Bill + the D5
   served gate behind the flag), **PD11** and **PD12** last, each after every control it teaches.
4. **ROADMAP's open Phase 3 slices** (3d·counter's cash-sheet re-host K39 · K44, 3e, 3f): PD6 records
   which it absorbed; the rest stay.
5. **Money doors stay parked:** `dineInPhonePay = false` ships in PD2; the D5 gate (PD10) is built behind
   it; the flip waits for the owner's item 3.

Each spec's §H build notes record what each stream took from appendix C and decided under the
owner's delegation; read them before building a dependent moment.

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

## Parallel streams (wave of 2026-10-07, run 2026-10-08 to 10-09)

One bullet per stream; a stream edits only its own bullet.

- **guards-style:** #326 merged (the tokens); the Sheet's `initialFocus` rode PD4's #329 as its own commit.
- **post-pay:** #327 (CounterPass + KitchenTrack, merged as `1b5e7e9`); #330 (PD3, draft; retarget to `main` after #327).
- **kitchen-ops:** #328 (PD5); PD9 next.
- **grocery:** #329 (PD4 + G20).
- **staff-authority:** PD8 on `claude/feat/pd8-manager-approval` (M184 + the `close` arm).
- **diner-cart (+ money-rails' create-intent half):** #331 (PD2, draft; retarget to `main` after #327); PD1 stacked on it next.
- **counter-floor:** PD6 on `claude/feat/pd6-till-tray`; PD7 next.
- **table-door, money-rails (the rest):** not in this wave.

- **staff-authority — PD8 built (2026-10-08, `claude/feat/pd8-manager-approval`, draft PR; CHANGELOG's
  PD8 entry; the m8 spec's `### H · Build notes`).** A money path: waits on Codex's rounds or the capped
  blind pass of its head, the owner's per-SHA line (ruling #1), and M184's apply — one file, the owner's
  go, after the merge. The table-clear seam (a clear superseding its own requests) is left for M182
  (counter-floor, PD7); the till tray (PD6) re-hosts the cash sheet the acknowledged-ids prop rides on.
- **diner-cart (2026-10-08):** PD2 on `claude/feat/pd2-pd1-diner-cart` (base `claude/feat/pd-tokens-pass`,
  #326) — the parked `SURFACES.dineInPhonePay`, the docked counter door, the pass (post-pay's `CounterPass` from
  `claude/feat/pd-pass-primitives`, merged in), the create-intent
  refusal with `check-phone-pay-door.mjs`; PD1 stacked on it (`claude/feat/pd1-tablemate-send`). Both
  money paths: "recommend: wait for Codex (ruling #1)"; PD1 carries the nudge-stamp migration for the
  owner's go. Build notes: m2 / m1 specs' `### H`.

- **diner-cart (2026-10-08):** PD2 on `claude/feat/pd2-pd1-diner-cart` (base `claude/feat/pd-tokens-pass`,
  #326) — the parked `SURFACES.dineInPhonePay`, the docked counter door, the pass (post-pay's `CounterPass` from
  `claude/feat/pd-pass-primitives`, merged in), the create-intent
  refusal with `check-phone-pay-door.mjs`; PD1 stacked on it (`claude/feat/pd1-tablemate-send`). Both
  money paths: "recommend: wait for Codex (ruling #1)"; PD1 carries the nudge-stamp migration for the
  owner's go — apply it before or with PD1's merge (until then "Let {host} know" answers "That didn’t
  go through"). Build notes: m2 / m1 specs' `### H`.

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
