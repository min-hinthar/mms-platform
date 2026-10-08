# Owner rulings — 2026-10-07 (the parallel wave's decision brief)

**The owner's words, 2026-10-07: "yes to all recommended defaults."**

This file records that answer to the decision brief, which came out of the design pass over the nine
parallel streams (money-rails · counter-floor · diner-cart · grocery · staff-authority · kitchen-ops ·
post-pay · table-door · guards-style). It covers every question in the brief, plus the owner-only items
those questions depend on.

**What the owner answered was the brief, not the cards.** Each stream's task card carries an **ASK THE
OWNER** list, and the brief condensed those lists. Every question below is DECIDED **as worded in this
file**. Where a card's ASK line says something different, **this file wins**:

- money-rails' T4 "price rules": the ruling is bill lines only;
- table-door's M168 "next wave": the ruling is after package 2;
- money-rails' unqualified Codex waiver: #1 keeps the money-path Codex wait _(2026-10-08: unchanged — with Codex out of quota, the owner's override on that line is their own bypass merge, §G, G3)_;
- staff-authority's base-role word: #18 waits for the owner's Burmese word.

Build each ruling as the final answer (reversible, as the lens asks), and don't ask again. **Where a
ruling is conditional, the condition is part of it.** Four things still go to the owner:

1. **The merge-window message:** each ready PR as `#N @ head SHA`, answered yes or hold per line (#1).
   _(2026-10-08: each line also shows `codex-review`'s state and the blind-pass verdict link for that
   SHA; a yes on a quota-red head is the owner's own admin-bypass merge — §G, G3.)_
2. **The moment to apply each approved migration, and its go where #5 does not give one.** There are no
   business hours anywhere in the repo, so the time is always the owner's.
3. **Facts only the owner holds.** Each takes the stated default until the owner volunteers it:
   - closed days;
   - payments taken outside the app;
   - the reward minimum's number;
   - who besides the owner can refund in Stripe;
   - any other instant payment method enabled on purpose;
   - the Burmese word for the base role;
   - the S17 retention window.
4. **Anything a condition below leaves open,** such as whether branch protection lets admins bypass (#2).
   _(That one is answered 2026-10-08: the owner chose the admin bypass, and it stays available — §G,
   G3.)_

The affected OPEN-ITEMS rows carry a one-line `Owner 2026-10-07` note pointing here. Rows the rulings
leave with nothing to build (T47, T37, J33, J38, K16) are closed by guards-style's reconcile PR, not
here. J27 stays open for its bare `/menu` question.

## A · Merges, money and production

| #   | Item (rows)                           | Ruling                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Who acts                             |
| --- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| 1   | Codex out of quota                    | **One owner message per merge window.** It lists each ready PR as `#N @ head SHA`, with its blind-pass verdict link and a full `verify:slice` watched to the end. The owner answers yes or hold per line, and a yes covers only that SHA. **Part of the approved default:** a PR that changes charges, orders, cash or approvals (money-rails M72c · M160 · M123 · P2he · P3b, counter-floor M163, staff-authority M184) carries "recommend: wait for Codex" on its line whenever the blind pass flagged that path. Such a PR waits for a Codex review of its head (or a quota raise) unless the owner overrides that line. **`.md`-only PRs merge without the Codex wait this wave** (CI green still required). CLAUDE.md and `.claude/**` are excluded: they need the per-SHA line. Raising the quota is still preferred. _(Later 2026-10-07: Codex has quota again; see D's session notes. This ruling is unchanged.)_ _(2026-10-08, §G: each line also shows `codex-review`'s state on that SHA (reviewed, or red: quota) beside the blind-pass verdict link. "A full `verify:slice` watched to the end" is now the `verify-slice` CI check green on that SHA (G1). Quota no longer blocks: "recommend: wait for Codex" is advice, the owner decides per SHA, and a yes on a quota-red head is the owner's own admin-bypass merge of that SHA, never an agent's (G3).)_ | every stream · owner                 |
| 2   | C16                                   | Make `codex-review` (never `codex-reviewed`) a required check on `main` **if branch protection lets admins bypass it** for the SHAs the owner lists. The repo cannot tell whether it does (UNKNOWN), and GitHub ties a bypass to an actor, not a SHA, so the per-SHA limit is a process promise. If admins cannot bypass, the check stays advisory until Codex has quota. Once it is required, an `.md`-only PR under #1 is red on it too (the workflow has no path filter), so the merge-window message lists it as `#N @ SHA · .md-only` for the same bypass. _(Answered 2026-10-08, §G: the owner chose the manual admin bypass, so the rule keeps admin bypass available and the "advisory" fallback no longer applies once it is wired. The bypass is the owner's own act per SHA, never automated and never an agent's (G3). As measured 2026-10-08 no rule is in effect yet, so every check is still advisory: G2, C28.)_                                                                                                                                                                                                                                                                                                                                                                                                                                            | owner (branch protection)            |
| 3   | C18                                   | **Withdrawn 2026-10-07 (see D and _C18 — closed_): C18 is closed by measurement. Nothing to set, nothing to redeploy, and do NOT resend anything.** The original text: ~~Fix the dead webhook before counter-floor's M163 merges: put the **test** endpoint's signing secret into Vercel Production and redeploy (the 2026-09-08 decision). Nothing needs resending: the planning session measured on 2026-10-06 that no open cart is still locked from before 2026-09-09. Re-measure succeeded test PaymentIntents against `qr_orders` and the pinned carts before resending anything anyway. See _C18 — the exact steps_ below.~~ That steps section was replaced by _C18 — closed_.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | — (withdrawn)                        |
| 4   | C25                                   | Reload every staff screen once, at a quiet moment, after the **first production deploy after 2026-10-07 07:13Z**. #315 merged at 03:16Z, before that time, so it does not count.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | owner                                |
| 5   | Prod migrations                       | **Go, one file at a time, in merge order, each after its PR is green, at a quiet time the owner names.** Each is verified (signature, body compared with the repo, grants) with a revert file ready, and its first real use is watched. The four files: K30 kitchen-done (then K34's timezone guard, in the same go); M184 approval-refuses-when-changed; the team-safety file (M210 · M208 · M205); the table-clear RPC (M182 · P2hf). M168 (#21) and T4 (#22) are approved to build, but each of their migrations still needs its own owner go once its PR is green; #5 does not cover them.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | streams build · owner names the time |
| 6   | Loss rule (P2hf · M182 · P2go · M248) | A manager PIN for losses that can wait: a dish that is cooked or over $20, and an uncollected counter bag (today a cheap, still-fired bag is a no-PIN write-off, so the PIN is **added**). **Clearing a table never waits.** It frees the table, stops the kitchen, and records every sent dish on the owner's loss list as not approved (`void` / `table_cleared`, `gate_reason` `unapproved`), unless a manager approved that clear. That makes it an **explicit, recorded exception to S2 decision 1**, behind one SQL seam that can switch the PIN on. No new `mms_approvals` kind.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | counter-floor · staff-authority      |
| 7   | M155                                  | Phone payments for meals take card only (Apple Pay and Google Pay ride the card method). No bank debits. One named constant. If the owner names another instant method enabled on purpose (e.g. Cash App Pay, Klarna), the constant admits it and still excludes bank debits. The live account's enabled methods were not measured: the session's permission guard refused a live-mode read on 2026-10-07.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | money-rails                          |
| 8   | C2                                    | Hold live Stripe keys until C18 is fixed and money-rails' M72c, M164–M166 (with M155) and M160 have merged. Then follow the cutover lines they add to ENV.md.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | owner                                |
| 9   | C1                                    | When hardening Supabase sign-in, keep Google open to any Google account and turn email confirmations **ON**. Two settings would break diners: a workspace restriction refuses a personal Google account at the Google upgrade (`linkIdentity`, `AccountUpgrade.tsx:600`) and at its sign-in recovery (`:249-250`), and disabling sign-up refuses the anonymous sign-in every diner route starts with (`AnonAuthGate.tsx:100`). Re-test one diner upgrade afterwards.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | owner · post-pay records it          |

## B · Before a particular package

| #   | Item (rows)                             | Ruling                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Who acts                        |
| --- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| 10  | Pickup window                           | Times unchanged, but **not confirmed**: the owner saw placeholders, not the live values. diner-cart reads `pickup_config` and prints the real open–close in its first merge-window line. No closed day has been named. If one is named, file "pickup closed days" (new schema plus a restatement of `mms_pickup_slots` / `mms_pickup_asap`, prod DDL) for next wave. Never fake a closed day by editing the times.                                                                                               | diner-cart                      |
| 11  | Payments outside the app                | No answer volunteered, so the default holds: the pad's walk-up sale offers **cash only**, and dishes on a cleared table count as a loss the owner can review.                                                                                                                                                                                                                                                                                                                                                    | counter-floor                   |
| 12  | Device sitting (K39 · P2bw · J28 · J42) | One ~20-minute sitting, ideally with Mom and Dad, after kitchen-ops' sound PR and before K39 merges. It covers the counter tablet's 6 checks, the kitchen tablet's 5-step sound check, then J28's phone list (J42's screen-reader check included). The walk-up test sale is one real order on the cheapest dish: tell the kitchen it's a test, then refund it from Today's payments & refunds. The Clear refusal is read on the word-check sheet. K43 is measured headless by counter-floor, not in the sitting. | owner · counter-floor schedules |
| 13  | M160 cron                               | Yes. Once money-rails' M160 merges, its follow-up adds the cron, and the owner adds a `CRON_SECRET` in Vercel so stuck card payments are re-checked with nobody watching.                                                                                                                                                                                                                                                                                                                                        | money-rails · owner             |
| 14  | K23                                     | Unlock returns to the exact screen that was locked. Only the signed-in person's own PIN unlocks, and a half-finished payment sheet is not reopened.                                                                                                                                                                                                                                                                                                                                                              | counter-floor · kitchen-ops     |
| 15  | Unsent dishes (P2do · P2z)              | Yes to both, revisiting 5c. Once a phone table asks to pay at the counter, its unsent dishes show as "not sent" on the floor card. Its table page shows "not sent · N min", with no "late" rule.                                                                                                                                                                                                                                                                                                                 | counter-floor                   |
| 16  | Reward minimum                          | No number named, so the account page prints the live `mms_rewards_config` value.                                                                                                                                                                                                                                                                                                                                                                                                                                 | post-pay                        |
| 17  | M16                                     | ASAP pickup keeps promising the **booked slot**, on checkout and /track alike. diner-cart's hint and post-pay's /track follow this one answer.                                                                                                                                                                                                                                                                                                                                                                   | post-pay · diner-cart           |
| 18  | Base role word                          | English **"Staff"** replaces "Server" on the badge and the invite form, **with the owner's (or the parents') Burmese word, never `ဝန်ထမ်း`**, which already names the whole team. No word has been given yet. Until it arrives the rename does not ship, and the badge stays "Server" / `စားပွဲထိုး` (a K15 draft).                                                                                                                                                                                              | staff-authority                 |
| 19  | G20                                     | **Unparked.** Market basket lines show Burmese names now, before G1 (`/cart` already does). ROADMAP and PHASE3_JOURNEYS are updated in the same PR as this file.                                                                                                                                                                                                                                                                                                                                                 | grocery                         |
| 20  | Scanner device half (G5 …)              | **Parked until G1's real shelf barcodes:** the flashlight, the iPhone decoder replacement (a vendor pick) and the iPhone/Android scan check. The no-device fixes still ship: M233's pick, G10's throttle, G15, G23.                                                                                                                                                                                                                                                                                              | grocery                         |
| 21  | M168                                    | Yes. Each table visit gets its own invite code, as its own PR after table-door's package 2. Its one migration is applied only on the owner's own go once that PR is green (#5 does not cover it). Scanning the sticker works as today.                                                                                                                                                                                                                                                                           | table-door                      |
| 22  | T4                                      | Yes. A CHECK that a **bill line** can never be negative, with live rows probed first. Option price deltas stay free. Applied only on the owner's own go once its PR is green (#5 does not cover it).                                                                                                                                                                                                                                                                                                             | money-rails                     |
| 23  | C27                                     | Yes, if the plan allows it. Pin the Vercel functions to `pdx1`, next to the database in `us-west-2`, before money-rails measures the Stripe latency its timeout is sized from. A preview build checks the plan.                                                                                                                                                                                                                                                                                                  | planning session · owner        |
| 24  | Refunds in Stripe                       | Default: this wave keeps "refund it in Stripe", plus a record of who marked it done. An in-app "Refund this charge" (manager PIN, idempotent) is built next wave **only if the owner says no one else can refund in Stripe**. That fact is still UNKNOWN.                                                                                                                                                                                                                                                        | staff-authority (next wave)     |
| 25  | P2gv                                    | Close it **without a new database flag** once P3b, M160 and unlink-on-resolve land. The unlink must ship in staff-authority's plain-code PR 1a, so it never waits on the team-safety migration.                                                                                                                                                                                                                                                                                                                  | money-rails · staff-authority   |
| 26  | Card reader timing                      | No date given, so it is treated as "not within a month" (the default when unsure). P3b's safety fix lands either way. The nine reader-polish items (P2hy · P2gu · P2gd · P2ie · P2gg · P2gx · P2gw · P2ha · P2gy) wait for the reader, and the setup note says not to connect it before P3b.                                                                                                                                                                                                                     | money-rails                     |
| 27  | D12 / 3f                                | If D12 is still unruled when 3e lands, 3f may ship English-first with Burmese beneath and without `<Bi>`.                                                                                                                                                                                                                                                                                                                                                                                                        | post-pay                        |

## C · The FYI defaults (decided; reply only to overrule)

- **M166:** an unrecognised Stripe key prefix counts as live for the webhook secret. A diagnostic names why.
- **M189:** market items go only on scan-and-go carts, plus kiosk market carts once the kiosk returns. They
  never go on a dine-in order or a plain online to-go order.
  - A kiosk market session and a kiosk to-go session are the same row today: both are `KIOSK_PREFIX` +
    `mode: "pickup"` (`lib/kiosk.ts:100-105`), and `KIOSK_PREFIX` is not exported.
  - So while the kiosk is parked, grocery's gate may admit kiosk-prefixed pickup carts. Telling the two
    apart needs a stored kind before the kiosk returns.
- **M265:** a sticker is re-assigned only while its table is empty.
- **J33 · J38:** no second-table stop and no "move to table" tool. A stray table is merged from the floor.
- **T37:** keep one lock sentence ("someone is checking out").
- **K16:** no guest names on kitchen tickets.
- **T47:** `checkoutSteps` stays out of the money-coverage guard.
- **J27:** the menu header's two names fold into the K40 word sweep, with no change this wave. Its second
  question (should bare `/menu` redirect to `/grocery`?) stays open.
- **M99:** sent dishes stay separate when tables merge, fixed next wave in the next merge-function migration.
- **P2ia / P2ib:** pad adds lost to a reload get "not confirmed — add again?" next wave. The kitchen's
  undo across a reload waits until a mis-bump is reported (D7).
- **S17:** **no retention window has been named.** 90 days for scan events and counter phone numbers is
  only the suggestion (a starting point, not legal advice). Nothing is deleted until the owner names a
  window. The S17 sweep (next wave) may be built with the window unset, but deletes nothing until then.
- **T3:** no staging database this wave. Payment and reader proofs stay on unit tests and the throwaway
  Postgres.
- **Native Burmese sitting** at the end of the wave covers:
  - the K15 ledger and every `K15 · <stream>` row beneath it, money words first;
  - the K40 / K41 word picks;
  - C24's plain words;
  - the D12 question;
  - #18's base-role word.

## D · The owner's follow-up (2026-10-07, later)

**The owner's words: "yes to all worldclass design thinking recommendations and merge when ready. vercel
STRIPE_WEBHOOK_SECRET_TEST has always been set and correct, I had to update and edit the endpoint
https://qr.mandalaymorningstar.com/api/stripe/webhook".**

- **The two questions this file left open are answered yes.** Both went to the owner as "recommend: yes",
  and "yes to all … recommendations" is read as covering them:
  - an `.md`-only PR (not CLAUDE.md or `.claude/**`) also skips the full `verify:slice`, since it changes
    no code. CI green is still required;
  - a rebase that changes only the measured-count lines `pnpm check:docs` names keeps the owner's yes,
    provided `git diff <yes'd SHA> <new head>` shows nothing else and CI is green on the new head.
- **#317 (C27, the `pdx1` pin) merges when ready:** CI green, Codex's review of its head, a full
  `verify:slice` green.
- **C18 is closed, and #3 is withdrawn** (see _C18 — closed_ below). M163's sequencing gate (#3) and the
  C18 half of C2's gate (#8) are met.
- **#4 (C25):** no C18 redeploy will happen. The trigger is the first production deploy after
  2026-10-07 07:13Z from any merge. That was #317's merge, whose production deploy started at 2026-10-07 09:43Z.

**Session notes (the planning session's measurements and readings, not owner rulings):**

- **Codex has quota again (measured):** it reviewed #317's head twice on 2026-10-07, both clean. #1 is
  unchanged, and its `.md`-only waiver stands as written for this wave. #1 relaxed CLAUDE.md's Codex wait
  for code PRs only because the quota was empty, so the planning session recommends that every code PR
  waits for Codex's review of its head again (CLAUDE.md's ritual), alongside #1's merge-window line. The
  owner has not ruled on this. _(Answered 2026-10-08 by (e) and (f), §G: `codex-review` is a check to
  require, so a code PR waits for Codex's review of its head; only with Codex out of quota does the
  capped blind review of the exact head stand in, the owner merging that SHA by admin bypass — G3.)_
- **C16 (#2) stays as worded:** make `codex-review` required if branch protection lets admins bypass it.
  #2's "advisory until Codex has quota" fallback could be read as lapsed now that the quota is back. But a
  required check with no bypass would also hold every `.md`-only PR for a Codex verdict, which #1's waiver
  does not ask for. So wiring it without a bypass is the owner's call, not this note's. _(Answered
  2026-10-08, §G: the owner chose the manual admin bypass, so the rule keeps admin bypass available;
  wiring it without one is off the table — G3, C28.)_

## E · The owner's design picks (2026-10-07, later still)

**The owner's words, after seeing three concept directions drawn for eight diner and staff moments: "I
prefer diner moments guided and staff moments glanceable. I actually love all 3 directions but could be
more enhanced, elevated, world-class design-thinking."**

[`PATH_DESIGN_2026-10-07.md`](PATH_DESIGN_2026-10-07.md) is the record: the direction, the owner's three
answers, the defaults that stand, the shared design vocabulary, and one refined spec per moment. **For
those eight moments' design, that file wins over a stream card's.** These rulings still win on rulings.
In short:

- Diner moments are guided and staff moments glanceable, each elevated with the best of the other two
  directions.
- Until live card keys are switched on (C2), the dine-in Bill offers only "Pay at the counter" (a new
  parked surface, refused in create-intent; that refusal is money-path, so #1's Codex line applies when the blind pass flags it). _(2026-10-08: #1's line now carries its §G note — G3.)_
- A guest whose dish waits on the host's Send gets the words, a "Show a server" card for Dad, and a quiet
  "Let Aye know" nudge.
- A dish waiting for a manager never blocks payment: staff are warned and may take payment. The dish
  stays charged, and if a manager agrees after the table has paid, it is refunded from Today's payments
  & refunds. That close is recorded as `superseded` ("Table paid first"), never `denied` (section F, D2).

## F · The owner's delegation (2026-10-07, latest)

**The owner's words: "I trust you to apply world-class design-thinking best standards on all open
decisions. staff board also needs moment designs integration so TV board display shows live order
progress in details (per item per table etc.,) for customers and staff. after food items served,
customers should be allowed to pay by card/apple pay. I really like the direction of premium iOS
designs, wallet boarding pass, One pass and progress updates, visual animated step guides for customers
and staff to get familiar with the new app."**

The planning session decided every open design question under that delegation, and designed the new
moments the owner asked for. [`PATH_DESIGN_2026-10-07.md`](PATH_DESIGN_2026-10-07.md)'s round-3 section is
the record. Each decision is reversible on the owner's word. In short:

- **D1 · Owners:** `CartBar.tsx`, `ArrivalBeat` and `lib/surfaces.ts` → diner-cart; `tokens.css` and the
  Sheet's opt-in `initialFocus` stay with guards-style, which already owns them. Handoffs are on PD1, PD2,
  PD4 and PD6.
- **D2 · A request closed after the table paid** records `superseded`, never `denied`, through a `close`
  arm carried in M184's migration. **Annotation to #5, not a re-ruling:** same function, signature and
  grants, no CHECK change; the owner's apply-time go and the per-SHA merge line (#1) still govern, and
  holding that line moves the arm into its own file with its own go.
- **D3 · One act, one word:** ပြန်ယူ for taking back a Send (console and phone), ပြန်ဖျက် for erasing a
  mark just made. No shipped string changes; the native sitting confirms it.
- **D4 · The asker-by-PIN seam** is not built this wave; PD13 holds its reopen trigger.
- **D5 · Card / Apple Pay after the food is served:** a dine-in phone pays once nothing on the bill is waiting to be sent or still with the kitchen (D5's hold set in PATH_DESIGN), enforced in create-intent. It is parked until C2, then flipped by its own PR after the three conditions in PATH_DESIGN, and proved right after by one refunded Apple Pay payment at a table. Ruling #8 is unchanged: D5 adds nothing to the key swap,
  only to the dine-in flag.
- **New moments (PD9–PD12):** the TV board showing each table's dishes live; the guest's live pass; the
  first-run step guides for guests, the counter and the kitchen.

## G · The owner's gate decisions (2026-10-08)

**The owner's words, 2026-10-08, in order:**

- (a) "verify:slice should not take this long, either break it apart with subagents or disable it because we can't take more than 30 minutes for each PR merge"
- (b) "is verify:slice optimized and other CI checks necessary?"
- (c) Two picks from a question (option labels, not quotes): "Keep it, made fast" (verify:slice stays a
  merge gate, sharded into CI) and "Make public again".
- (d) "made it public, add to same PR, merge when ready"
- (e) "wired the required checks on main, codex-review can be replaced with blind review if out of quota so merge is not blocked waiting on quota"
- (f) "go with the manual admin bypass for quota"
- (g) "merge when green, then the ReadMe, Claude.md, and docs update+cleanup PR"

Earlier the same day the owner also made the design-thinking loop standard; #319 recorded those words
and the loop (`.claude/skills/design-prototyping/SKILL.md`).

- **G1 · `verify:slice` stays a merge gate, made fast, in CI** ((a)–(c)). Built by #320 (`d9614ae`):
  - the battery runs as the aggregate `verify-slice` check over 12 cost-balanced `verify-slice shard`
    jobs, on non-draft PR heads and pushes to `main`; `check:shard-partition` proves the shards
    partition the battery;
  - a draft's `verify-slice` is RED on purpose ("not run — DRAFT"); a docs-only PR's is green
    ("not run — docs-only lane");
  - measured: shard jobs 4.1–10.5 min and the aggregate ~10.5–11 min wall after `changes`, against
    164–180 min for a full serial local run;
  - locally, the pre-push step is `node scripts/verify-slice.mjs --no-gate --only=<substr>` for each
    money/authority module touched;
  - #1's "a full `verify:slice` watched to the end" now means this check green on that SHA.

  (b)'s other half: a `changes` job splits CI into docs / code / sql lanes, and pushes to `main` run
  every lane. `build` takes ~6 min; `migrations-check + types-fresh` takes 11.1–13.3 min and is the
  critical path when the sql lane runs.

- **G2 · The repo is public again; then the checks get required** ((c)–(e)). Made public 2026-10-08
  (API: `private: false`). The checks to require on `main` (C28 ②): `codex-review`, `verify-slice`,
  `build`, `migrations-check + types-fresh`, `docs`, `require-docs`. Never a `verify-slice shard (N)`
  leg, `publish-codex-verdict`, the retired `codex-reviewed`, `Supabase Preview` or
  `Vercel Preview Comments`. The owner reported wiring them (e), but a read at ~07:20Z with an
  admin-scoped token found no rule:
  - `GET /branches/main` → `protected: false`;
  - `/branches/main/protection` → 404;
  - `/rulesets` → `[]`, and `/rules/branches/main` → `[]`.

  So every check stays advisory until a re-measure shows the rule. C28 ③ holds the commands; C16 and C28
  hold the live state.

- **G3 · Codex out of quota** ((e), (f)). When Codex answers a review request with its usage-limit
  message ("You have reached your Codex usage limits for code reviews"), the capped blind adversarial
  review of the EXACT head stands in for Codex: post its verdict on the PR naming that head SHA, with
  `verify-slice` and the rest of CI green on the same SHA. The **OWNER** then merges that head with
  GitHub's admin bypass, by hand. An agent never merges a head whose `codex-review` is red — even though
  its admin-scoped token could — and never automates the bypass (an automated version, the gate
  accepting a verdict comment posted from the owner's account, was refused as a CI bypass: the agent
  posts AS the owner and would satisfy its own required check). Branch protection therefore keeps admin
  bypass available (classic rule: leave "Do not allow bypassing the above settings" unticked; ruleset:
  Repository admin on the bypass list) and does NOT require Code Owner review (every PR is authored by
  the sole code owner, who cannot approve their own PR). The bypass covers a red `codex-review` only —
  never `verify-slice`, `build`, `docs`, `migrations-check + types-fresh` or `require-docs`.
  - The session's GitHub token is admin-scoped, so GitHub would let an agent merge past a red required
    check through the API. Only this procedure stops that, and the refused automated path is not to be rebuilt.
  - _Procedure (the lead, 2026-10-08, not an owner ruling):_ If fix commits moved the head after the capped pass, the stand-in for the final head is that pass's verdict PLUS the author's hand-read of every later fix commit, posted as ONE comment naming the final head SHA and the SHA the pass reviewed — never a second agent round (the HARD CAP); the merge-window line for that head lists those commits and says whether any touches a `MONEY_PATHS` file, so the owner decides with that in view. And how an agent applies #1's `.md`-only waiver is tightened (only when Codex is out of quota; only while `codex-review` is re-measured as not required; never for a PR touching the rules that govern merges). Both are the lead's, for the owner to confirm or overrule (normative copy: `docs/WORKFLOW.md` §Review step 5 (f)–(g)).
  - What it changes above (each annotated in place): #1's `.md`-only waiver stands while no check is
    enforced; once `codex-review` is required, such a PR is listed `#N @ SHA · .md-only` for the owner's
    same bypass (#2). A money-path PR the blind pass flagged keeps #1's default — it waits for Codex unless the owner overrides that line — and with Codex out of quota the owner's override is their own bypass merge.

  The procedure is [`WORKFLOW.md`](WORKFLOW.md) §Review step 5 (g).

- **G4 · Two requests, recorded as requests, not standing rules** ((d), (g)). "add to same PR, merge
  when ready" put the public-repo follow-through in #320. "merge when green, then the ReadMe, Claude.md,
  and docs update+cleanup PR" asked for this docs update and cleanup. Each was the owner's explicit instruction for that PR; neither sets a standing merge-when-green rule: every other merge still waits for the owner's per-SHA yes (the rulings intro) and follows WORKFLOW §Review step 5 and G3.

## C18 — closed (2026-10-07)

**Closed by measurement: every succeeded test payment since 2026-09-09 has its order. Only the owner's
production test pass on 2026-09-07 is recorded as failed, and the repo kept calling the webhook dead for a
month without re-measuring.**

- **Stripe's test-mode event log** (read-only; the API's 30-day window, 117 events): the endpoint's 47
  failed deliveries are all `payment_intent.*` events from 2026-09-07 08:59:03Z to 12:53:01Z. None of them
  ever cleared (Stripe retries sandbox deliveries three times over a few hours). Every subscribed event
  created since (28, the newest 2026-10-03 21:35Z) reads delivered (`pending_webhooks` 0). That field
  says no delivery is still owed; it does not say which attempt succeeded, or when.
- **Prod `qr_orders`** (read-only SELECT): all seven succeeded test PaymentIntents since 2026-09-09 01:05Z
  have a `paid` order, written one to two seconds after the charge, so real-time delivery is proven from
  then on. Between 2026-09-07 12:54Z and 2026-09-09 01:05Z there are only two subscribed events (one
  canceled PaymentIntent), so when deliveries resumed in that span is not measured. #274 (per-mode
  secrets) merged inside it, at 2026-09-08 23:42Z.
- **Owner, 2026-10-07:** `STRIPE_WEBHOOK_SECRET_TEST` "has always been set and correct", and the owner
  edited the test endpoint `we_1TkFUzD7LsBxOcnN7MDQk0Et` to
  `https://qr.mandalaymorningstar.com/api/stripe/webhook`. A read-only measurement earlier on 2026-10-07
  had it at `https://mms-platform.vercel.app/api/stripe/webhook`. Payments were already reaching their
  orders before that edit, so the edit is not what ended the 2026-09-07 failures.
- **What caused and what ended the 2026-09-07 failures is not measured.** Every build before #274 read
  only `STRIPE_WEBHOOK_SECRET`, including the one serving the outage. So the owner's statement about
  `_TEST` does not speak to it, and the 2026-09-08 secret finding may have held for those builds. The
  read-only Stripe API exposes no history of an endpoint's edits. The Dashboard's request logs
  (Workbench → Logs, filtered by the endpoint id) were not checked.
- **Do NOT resend anything.** The five test-pass PaymentIntents of 2026-09-07 (`pi_3UCySD…`,
  `pi_3UCyb9…`, `pi_3UCypc…`, `pi_3UCyxG…`, `pi_3UCyyV…`; $75.42, all test cards) have no order, and
  their carts no longer exist in `qr_carts`. No real money moved. Unexplained: `pi_3UCyb9…`'s succeeded
  event reads delivered, yet it has no order.
- **How the route picks the secret** (code, true since #274): in test mode it verifies with exactly one
  secret, `STRIPE_WEBHOOK_SECRET_TEST` when set, otherwise `STRIPE_WEBHOOK_SECRET`
  (`webhookCandidatesForMode`, `apps/qr/lib/stripe-env.ts:169`; `pickEnv` takes the first name set,
  `:61-66`). A failed signature has no fallback.
- **The test endpoint renders events at API version 2022-08-01.** The live endpoint
  `we_1U7KIJD7LsBxOcnN13khTrnM` (same URL, enabled) and the SDK pin are on `2026-05-27.dahlia`. Audited
  2026-10-07: no field the webhook handler reads differs between the two. `charge.refunds` is re-listed
  through the SDK, and `last_payment_error.code` feeds only analytics. Re-creating the test endpoint on
  dahlia is optional, and it rotates `STRIPE_WEBHOOK_SECRET_TEST`.
- **Stale code comments, for money-rails:** `apps/qr/app/api/stripe/webhook/route.ts:133` ("THIS is the
  branch that shipped the C18 outage … for a week") and `apps/qr/lib/stripe-env.ts:4-16` state C18's
  mechanism as fact. Correct them with the next change to those files. That is code, outside this docs
  fix.
