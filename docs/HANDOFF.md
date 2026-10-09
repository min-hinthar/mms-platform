# Session Handoff — MMS Platform (2026-10-08 · after #320 and #324)

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

## Where things stand (2026-10-08)

Measure first: `git log origin/main --oneline -3` and `gh pr list`.

- **#319 merged as `8dc5210`:** the path-design record
  [`PATH_DESIGN_2026-10-07.md`](PATH_DESIGN_2026-10-07.md), its twelve specs in
  [`path-design-2026-10-07/`](path-design-2026-10-07/), OPEN-ITEMS PD1–PD13, and the design-prototyping
  standard ([`SKILL.md`](../.claude/skills/design-prototyping/SKILL.md)). The owner's canvas ("MMS paths
  — design prototypes", private; find it by title with `Artifact` `action: "list"`) holds the screens.
- **#320 merged as `d9614ae` (2026-10-08T06:59Z): the merge gate, fitted to 30 minutes.** The owner, in
  order: "verify:slice should not take this long, either break it apart with subagents or disable it
  because we can't take more than 30 minutes for each PR merge", then "is verify:slice optimized and
  other CI checks necessary?", then picked "Keep it, made fast" and "Make public again" (the rulings
  file §G, G1 · G2). What changed:
  - The full battery is the aggregate CI check **`verify-slice`** over 12 cost-balanced
    `verify-slice shard` jobs, on non-draft heads and pushes to main; `check:shard-partition` proves the
    shards partition it. A draft's is RED on purpose ("not run — DRAFT"); a docs-only PR's is green ("not
    run — docs-only lane"). A `changes` job splits CI into docs / code / sql lanes (a push to main runs
    every lane). The Codex gate also reads the Completed row of Codex's summary comment for the head (a
    clean auto-review edits that comment and adds a thumbs-up reaction, nothing else).
  - Measured: shard jobs 4.1–10.5 min (two PR runs), the aggregate ~10.5–11 min wall after `changes`;
    `build` ~6 min; `migrations-check + types-fresh` 11.1–13.3 min (the critical path when the sql lane
    runs). A full serial local run took 164–180 min (2026-10-06..08), so it is never a pre-push step:
    run `node scripts/verify-slice.mjs --no-gate --only=<substr>` per money/authority module touched
    (`--list --only=<substr>` shows what a filter selects). Deferred, not blocking: T48 · T49 · T50.
- **#324 fixed main's first sharded run.** `checkout-bind/stale-refusal-said` SURVIVED on main's push run
  of `d9614ae` after being CAUGHT on both PR runs of the same tree; the two stale-refusal tests in
  `apps/qr/components/Checkout.bind.test.tsx` now read the region's history (LEARNINGS #248). A mutant
  that survives on one run and is caught on another of the same tree is a suite defect: fix the read,
  red-first. Never re-run a red `verify-slice` hoping for green.
- **The repo is public again** (owner: "made it public, add to same PR, merge when ready"). **Branch
  protection, measured 2026-10-08 ~07:20Z with an admin-scoped token:** `GET /branches/main` →
  `protected: false`; `/branches/main/protection` → 404; `/rulesets` → `[]`; `/rules/branches/main` →
  `[]`. The owner reported "wired the required checks on main, codex-review can be replaced with blind
  review if out of quota so merge is not blocked waiting on quota" that morning, but no rule was in
  effect as measured, so **every check is advisory until a re-measure shows the rule** (OPEN-ITEMS C28
  ③). Until then the merge ritual ([`docs/WORKFLOW.md`](WORKFLOW.md) §Review step 5) is the only
  enforcement — and the agent's GitHub token is admin-scoped, so the API would let it merge past a red
  required check. Only the procedure stops that. Asked to check it saved, the owner answered "Not
  necessary" (2026-10-08, declining the re-check); a re-measure at 11:07Z still read none.
- **The owner, later that day:** "go with the manual admin bypass for quota" (G3; owner's item 2) and
  "merge when green, then the ReadMe, Claude.md, and docs update+cleanup PR" (G4, a request). Then, on
  #325: "1. Yes one more; 2. Confirm; 3. Not necessary; 4. target is fasnpdhtvqtzjlvruqcu; . Merge" (§G
  (h)) — one more capped pass over fix commits pushed after the blind pass (G3), the waiver tightening
  confirmed (WORKFLOW step 5 (f)), a re-check of branch protection declined (G2), `.mcp.json` re-pointed
  to QR, and the go to merge #325 after that pass — the merge itself the owner's under G3 while
  `codex-review` is red (G4: a request for that PR, not a standing rule).

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
4. **Each migration's go, one file at a time** (ruling #5, at a time the owner names): PD1's nudge stamp;
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

## Next tasks — build the path designs

**Read, in order:** OPEN-ITEMS (Config, then the PD rows) → the rulings file (wins on rulings) →
PATH_DESIGN_2026-10-07.md (its round-3 section first: it wins over everything before it, and over a
stream card for the moments it covers; then "Sequencing") → the moment's spec.

**Build in the record's Sequencing, smallest safe step first:**

1. **guards-style's token-only PR:** `--fs-pass`, `--till-fs-hand` and the `--pass-*` constant inks in
   `packages/ui/src/tokens.css` (D1(c)). No money path, no migration.
2. **post-pay's primitives:** the one CounterPass and the kitchen-track UI (ONE PASS · ONE KITCHEN
   TRACK), rendering a stage they are handed.
3. **PD5's re-key with `lib/kitchen-track.ts`** (kitchen-ops): the one stage derivation, and
   `KDS_UNDO_MS` moved to `lib/`. Then PD1–PD8 by their streams, then the TV board (PD9) and the live
   pass (PD10), then the guides last (PD11, PD12), each after every control it teaches.
4. **ROADMAP's open Phase 3 slices** — 3d·counter's cash-sheet re-host (K39 · K44), 3e and 3f — are not PD rows: before building a PD that touches the same surface, check whether it absorbs the slice, and record which in the PR.
5. **Money doors stay parked:** PD2's `dineInPhonePay = false` lands first (diner-cart draws, then
   money-rails answers in create-intent); the D5 served gate (PD10) is built behind it; the flip waits
   for owner's item 3.

Each spec's appendix C holds suggestions not yet taken: take them where the build agrees and record what
you took in the spec. A design question the build raises goes through the design-prototyping loop (a
quick round is fine), never into code by guess.

**Streams — ask the owner once.** The nine 2026-10-07 stream cards are not in the repo: their owned
files, hot-file rules and "table-door's package 2" (cited by ruling #21 and M168) live only in the
cards. The eight re-queued on 2026-10-07 were not confirmed started; on 2026-10-08 no stream branch
exists and main has no stream commit. Ask: parallel sessions, or the sequence above in one session?
Recommend the sequence (steps 1–2 unblock everything and carry no money risk). A re-queued card must
carry the quota rule (owner's item 2). If T47 · T37 · J33 · J38 · K16 are still open, guards-style's
docs-only reconcile closes them (rulings intro).

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

## Parallel streams (wave of 2026-10-07)

None started (2026-10-08): money-rails · counter-floor · diner-cart · grocery · staff-authority ·
kitchen-ops · post-pay · table-door · guards-style. Only if the owner picks parallel sessions, each
stream adds one bullet of its own below this line and edits only that bullet.

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
- **ESLint is pinned to 9.x** (`^9.39.4`, root `package.json`): ESLint 10 broke `eslint-config-next`'s
  react plugin (the archived note; not re-tested).
