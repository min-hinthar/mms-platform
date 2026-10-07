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
- money-rails' unqualified Codex waiver: #1 keeps the money-path Codex wait;
- staff-authority's base-role word: #18 waits for the owner's Burmese word.

Build each ruling as the final answer (reversible, as the lens asks), and don't ask again. **Where a
ruling is conditional, the condition is part of it.** Four things still go to the owner:

1. **The merge-window message:** each ready PR as `#N @ head SHA`, answered yes or hold per line (#1).
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

The affected OPEN-ITEMS rows carry a one-line `Owner 2026-10-07` note pointing here. Rows the rulings
leave with nothing to build (T47, T37, J33, J38, K16) are closed by guards-style's reconcile PR, not
here. J27 stays open for its bare `/menu` question.

## A · Merges, money and production

| #   | Item (rows)                           | Ruling                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Who acts                             |
| --- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| 1   | Codex out of quota                    | **One owner message per merge window.** It lists each ready PR as `#N @ head SHA`, with its blind-pass verdict link and a full `verify:slice` watched to the end. The owner answers yes or hold per line, and a yes covers only that SHA. **Part of the approved default:** a PR that changes charges, orders, cash or approvals (money-rails M72c · M160 · M123 · P2he · P3b, counter-floor M163, staff-authority M184) carries "recommend: wait for Codex" on its line whenever the blind pass flagged that path. Such a PR waits for a Codex review of its head (or a quota raise) unless the owner overrides that line. **`.md`-only PRs merge without the Codex wait this wave** (CI green still required). CLAUDE.md and `.claude/**` are excluded: they need the per-SHA line. Raising the quota is still preferred. | every stream · owner                 |
| 2   | C16                                   | Make `codex-review` (never `codex-reviewed`) a required check on `main` **if branch protection lets admins bypass it** for the SHAs the owner lists. The repo cannot tell whether it does (UNKNOWN), and GitHub ties a bypass to an actor, not a SHA, so the per-SHA limit is a process promise. If admins cannot bypass, the check stays advisory until Codex has quota.                                                                                                                                                                                                                                                                                                                                                                                                                                                   | owner (branch protection)            |
| 3   | C18                                   | Fix the dead webhook before counter-floor's M163 merges: put the **test** endpoint's signing secret into Vercel Production and redeploy (the 2026-09-08 decision). Nothing needs resending: the planning session measured on 2026-10-06 that no open cart is still locked from before 2026-09-09. Re-measure succeeded test PaymentIntents against `qr_orders` and the pinned carts before resending anything anyway. See _C18 — the exact steps_ below.                                                                                                                                                                                                                                                                                                                                                                    | owner (Stripe Dashboard + Vercel)    |
| 4   | C25                                   | Reload every staff screen once, at a quiet moment, after the **first production deploy after 2026-10-07 07:13Z**. #315 merged at 03:16Z, before that time, so it does not count.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | owner                                |
| 5   | Prod migrations                       | **Go, one file at a time, in merge order, each after its PR is green, at a quiet time the owner names.** Each is verified (signature, body compared with the repo, grants) with a revert file ready, and its first real use is watched. The four files: K30 kitchen-done (then K34's timezone guard, in the same go); M184 approval-refuses-when-changed; the team-safety file (M210 · M208 · M205); the table-clear RPC (M182 · P2hf). M168 (#21) and T4 (#22) are approved to build, but each of their migrations still needs its own owner go once its PR is green; #5 does not cover them.                                                                                                                                                                                                                              | streams build · owner names the time |
| 6   | Loss rule (P2hf · M182 · P2go · M248) | A manager PIN for losses that can wait: a dish that is cooked or over $20, and an uncollected counter bag (today a cheap, still-fired bag is a no-PIN write-off, so the PIN is **added**). **Clearing a table never waits.** It frees the table, stops the kitchen, and records every sent dish on the owner's loss list as not approved (`void` / `table_cleared`, `gate_reason` `unapproved`), unless a manager approved that clear. That makes it an **explicit, recorded exception to S2 decision 1**, behind one SQL seam that can switch the PIN on. No new `mms_approvals` kind.                                                                                                                                                                                                                                     | counter-floor · staff-authority      |
| 7   | M155                                  | Phone payments for meals take card only (Apple Pay and Google Pay ride the card method). No bank debits. One named constant. If the owner names another instant method enabled on purpose (e.g. Cash App Pay, Klarna), the constant admits it and still excludes bank debits. The live account's enabled methods were not measured: the session's permission guard refused a live-mode read on 2026-10-07.                                                                                                                                                                                                                                                                                                                                                                                                                  | money-rails                          |
| 8   | C2                                    | Hold live Stripe keys until C18 is fixed and money-rails' M72c, M164–M166 (with M155) and M160 have merged. Then follow the cutover lines they add to ENV.md.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | owner                                |
| 9   | C1                                    | When hardening Supabase sign-in, keep Google open to any Google account and turn email confirmations **ON**. Two settings would break diners: a workspace restriction refuses a personal Google account at the Google upgrade (`linkIdentity`, `AccountUpgrade.tsx:600`) and at its sign-in recovery (`:249-250`), and disabling sign-up refuses the anonymous sign-in every diner route starts with (`AnonAuthGate.tsx:100`). Re-test one diner upgrade afterwards.                                                                                                                                                                                                                                                                                                                                                        | owner · post-pay records it          |

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

## C18 — the exact steps

**The endpoints, measured 2026-10-07 through the Stripe connector (read-only, endpoints only):**

- **Test-mode endpoint** `we_1TkFUzD7LsBxOcnN7MDQk0Et`, at `https://mms-platform.vercel.app/api/stripe/webhook`.
  - It is **enabled**, on API version 2022-08-01.
  - Its events: `payment_intent.created`, `.succeeded`, `.payment_failed`, `.canceled`,
    `.amount_capturable_updated`, plus `setup_intent.succeeded` and `charge.refunded`.
- **Live endpoint** `we_1U7KIJD7LsBxOcnN13khTrnM`, at `https://qr.mandalaymorningstar.com/api/stripe/webhook`
  (**enabled**).

**What Vercel holds was NOT measured.** The Stripe connector cannot read Vercel.

- C18 (2026-09-08) records that Production held the live endpoint's secret.
- The CHANGELOG entry of the same day records that a `STRIPE_WEBHOOK_SECRET_TEST` also existed in Vercel,
  in a scope it does not name.

**How the route picks the secret: in test mode it verifies with exactly one secret.** It uses
`STRIPE_WEBHOOK_SECRET_TEST` when that is set, otherwise `STRIPE_WEBHOOK_SECRET`.

- `webhookCandidatesForMode` keeps both names (`apps/qr/lib/stripe-env.ts:169`).
- `pickEnv` takes the first name that is set (`:61-66`; `route.ts:70`).
- A failed signature has no fallback, so a wrong `_TEST` value shadows a correct base one.

**This session suggests keeping the live secret where it is.** The 2026-09-08 form, the test secret in
`STRIPE_WEBHOOK_SECRET`, also works, but it overwrites the live secret that the C2 cutover needs:

1. In the Stripe Dashboard, switch to **test mode** → Developers → Webhooks → open `we_1TkFUz…` →
   **reveal the signing secret**. The API never returns a secret after creation.
2. In Vercel → Production, **set `STRIPE_WEBHOOK_SECRET_TEST` to it**. Edit the value if the variable
   already exists. Leave `STRIPE_WEBHOOK_SECRET` alone.
3. **Redeploy** production. Env changes only take effect on a new deployment. This deploy also counts as
   #4's trigger if it lands after 07:13Z.
4. Re-measure succeeded test PaymentIntents against `qr_orders` and the pinned carts before resending any
   event.
5. Check: the next test-mode payment gets a `qr_orders` row and a kitchen ticket, and the Stripe Dashboard
   shows the endpoint's latest deliveries answering 200.
