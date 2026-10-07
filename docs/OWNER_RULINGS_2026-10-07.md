# Owner rulings — 2026-10-07 (the parallel wave's decision brief)

**The owner's words, 2026-10-07: "yes to all recommended defaults."**

This file records that answer. It covers every question in the decision brief that came out of the
design pass over the nine parallel streams (money-rails · counter-floor · diner-cart · grocery ·
staff-authority · kitchen-ops · post-pay · table-door · guards-style), plus the owner-only items they
depend on.

Each stream's task card carries an **ASK THE OWNER** list. **Every recommended default in those lists is
now DECIDED.** Build it as the final answer: keep it reversible, as the lens asks, but don't ask again.
Three things still go to the owner:

1. **The merge-window message:** each ready PR as `#N @ head SHA`, answered yes or hold per line (#1 below).
2. **The moment to apply each approved prod migration.** The go is given; the time is the owner's,
   because there are no business hours anywhere in the repo.
3. **Facts only the owner holds:** closed days, payments taken outside the app, the reward minimum's
   number, and who besides the owner can refund in Stripe. Each takes the stated default until the owner
   volunteers the fact.

The affected OPEN-ITEMS rows carry a one-line `Owner 2026-10-07` note pointing here. Rows the rulings
leave with nothing to build (T47, T37, J33, J38, K16) are closed by guards-style's reconcile PR, not here.

## A · Merges, money and production

| #   | Item (rows)                           | Ruling                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Who acts                             |
| --- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| 1   | Codex out of quota                    | **One owner message per merge window.** It lists each ready PR as `#N @ head SHA` with its blind-pass verdict link and a full `verify:slice` watched to the end, and the owner answers yes or hold per line. A yes covers only that SHA. **`.md`-only PRs merge without the Codex wait or a full `verify:slice` this wave** (CI green still required). CLAUDE.md and `.claude/**` are excluded and need the per-SHA line. Raising the quota is still preferred. | every stream · owner                 |
| 2   | C16                                   | Make `codex-review` (never `codex-reviewed`) a required check on `main`, with admin bypass for the SHAs the owner lists.                                                                                                                                                                                                                                                                                                                                        | owner (branch protection)            |
| 3   | C18                                   | Fix the dead webhook before counter-floor's M163 merges. Put the **test** endpoint's signing secret into Vercel Production and redeploy. Nothing needs resending: the stranded test-pass carts are gone (measured 2026-10-06). See _C18 — the exact steps_ below.                                                                                                                                                                                               | owner (Stripe Dashboard + Vercel)    |
| 4   | C25                                   | Reload every staff screen once, at a quiet moment, after the **first production deploy after 2026-10-07 07:13Z**. #315's merge deployed at about 03:16Z and does not count.                                                                                                                                                                                                                                                                                     | owner                                |
| 5   | Prod migrations                       | **Go, one file at a time, each after its PR is green, at a quiet time the owner names.** Each is verified (signature, body compared with the repo, grants) with a revert file ready, and its first real use is watched. The files: K30 kitchen-done, then K34 timezone guard; M184 approval-refuses-when-changed; the team-safety file (M210 · M208 · M205); the table-clear RPC (M182 · P2hf). Also #21 (M168) and #22 (T4).                                   | streams build · owner names the time |
| 6   | Loss rule (P2hf · M182 · P2go · M248) | A manager PIN for losses that can wait: a dish that is cooked or over $20, and an uncollected counter bag. **Clearing a table never waits.** It frees the table, stops the kitchen and records every dish as `void` / `table_cleared`, with `gate_reason` `unapproved` when no manager approved. That makes it an **explicit, recorded exception to S2 decision 1**, behind one SQL seam that can switch the PIN on. No new `mms_approvals` kind.               | counter-floor · staff-authority      |
| 7   | M155                                  | Phone payments for meals take card only (Apple Pay and Google Pay ride the card method). No bank debits. One named constant. The live account's enabled-method list was not measured: a live-mode read was refused by the session's permission guard on 2026-10-07, so the card-only default stands on this ruling.                                                                                                                                             | money-rails                          |
| 8   | C2                                    | Hold live Stripe keys until C18 is fixed and money-rails' M72c, M164–M166 (with M155) and M160 have merged. Then follow the cutover lines they add to ENV.md.                                                                                                                                                                                                                                                                                                   | owner                                |
| 9   | C1                                    | When hardening Supabase sign-in, keep Google open to any Google account and turn email confirmations **ON**. Do **not** restrict Google to a workspace or disable sign-up: either would break every diner account upgrade (`AccountUpgrade.tsx:164`, `:249-250`). Re-test one diner upgrade after.                                                                                                                                                              | owner · post-pay records it          |

## B · Before a particular package

| #   | Item (rows)                                   | Ruling                                                                                                                                                                                                                                                                                                                                                                      | Who acts                        |
| --- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| 10  | Pickup window                                 | Keep the live `pickup_config` times. No closed day has been named. If one is named later, file "pickup closed days" (new schema plus a restatement of `mms_pickup_slots` / `mms_pickup_asap`, prod DDL) for next wave. Never fake a closed day by editing the times.                                                                                                        | diner-cart                      |
| 11  | Payments outside the app                      | No answer volunteered, so the default holds: the pad's walk-up sale offers **cash only**, and dishes on a cleared table count as a loss the owner can review.                                                                                                                                                                                                               | counter-floor                   |
| 12  | Device sitting (K39 · P2bw · J28 · K43 · J42) | One ~20-minute sitting, ideally with Mom and Dad, after kitchen-ops' sound PR and before K39 merges. Covers the counter tablet's 6 checks, the kitchen tablet's 5-step sound check, then J28's phone list. The walk-up test sale is one real order on the cheapest dish, refunded after from Today's payments & refunds. The Clear refusal is read on the word-check sheet. | owner · counter-floor schedules |
| 13  | M160 cron                                     | Yes. Once money-rails' M160 merges, its follow-up adds the cron, and the owner adds a `CRON_SECRET` in Vercel so stuck card payments are re-checked with nobody watching.                                                                                                                                                                                                   | money-rails · owner             |
| 14  | K23                                           | Unlock returns to the exact screen that was locked. Only the signed-in person's own PIN unlocks, and a half-finished payment sheet is not reopened.                                                                                                                                                                                                                         | counter-floor · kitchen-ops     |
| 15  | Unsent dishes (P2do · P2z)                    | Yes to both. Once a phone table asks to pay at the counter, its unsent dishes show as "not sent" on the floor card. Its table page shows "not sent · N min", with no "late" rule. This revisits 5c.                                                                                                                                                                         | counter-floor                   |
| 16  | Reward minimum                                | No number named, so the account page prints the live `mms_rewards_config` value.                                                                                                                                                                                                                                                                                            | post-pay                        |
| 17  | M16                                           | ASAP pickup keeps promising the **booked slot**, on checkout and /track alike. diner-cart's hint and post-pay's /track follow this one answer.                                                                                                                                                                                                                              | post-pay · diner-cart           |
| 18  | Base role word                                | The base role reads **"Staff"**, not "Server", on the badge and the invite form. Burmese `ဝန်ထမ်း` ships as a K15 draft for Min's native pass.                                                                                                                                                                                                                              | staff-authority                 |
| 19  | G20                                           | **Unparked.** Market basket lines show Burmese names now, before G1 (`/cart` already does). ROADMAP and PHASE3_JOURNEYS are updated in the same PR as this file.                                                                                                                                                                                                            | grocery                         |
| 20  | Scanner device half (G5 …)                    | **Parked until G1's real shelf barcodes:** the flashlight, the iPhone decoder replacement (a vendor pick) and the iPhone/Android scan check. The no-device fixes still ship: M233's pick, G10's throttle, G15, G23.                                                                                                                                                         | grocery                         |
| 21  | M168                                          | Yes. Each table visit gets its own invite code (one migration, on the owner's go, #5), as its own PR after table-door's package 2. Scanning the sticker works as today.                                                                                                                                                                                                     | table-door                      |
| 22  | T4                                            | Yes. A CHECK that a **bill line** can never be negative, live rows probed first, on the owner's go (#5). Option price deltas stay free.                                                                                                                                                                                                                                     | money-rails                     |
| 23  | C27                                           | Yes. Pin the Vercel functions to `pdx1`, next to the database in `us-west-2`, before money-rails measures the Stripe latency its timeout is sized from. A preview build checks whether the plan allows it.                                                                                                                                                                  | planning session · owner        |
| 24  | Refunds in Stripe                             | Default: this wave keeps "refund it in Stripe", plus a record of who marked it done. An in-app "Refund this charge" (manager PIN, idempotent) is next wave. Who besides the owner can refund in Stripe is still UNKNOWN.                                                                                                                                                    | staff-authority (next wave)     |
| 25  | P2gv                                          | Close it **without a new database flag** once P3b, M160 and unlink-on-resolve land. The unlink must ship in staff-authority's plain-code PR 1a, so it never waits on the team-safety migration.                                                                                                                                                                             | money-rails · staff-authority   |
| 26  | Card reader timing                            | "Not within a month." P3b's safety fix lands either way. The nine reader-polish items wait for the reader, and the setup note says not to connect it before P3b.                                                                                                                                                                                                            | money-rails                     |
| 27  | D12 / 3f                                      | If D12 is still unruled when 3e lands, 3f may ship English-first with Burmese beneath and without `<Bi>`.                                                                                                                                                                                                                                                                   | post-pay                        |

## C · The FYI defaults (decided; reply only to overrule)

- **M166:** an unrecognised Stripe key prefix counts as live for the webhook secret. A diagnostic names why.
- **M189:** market items go only on scan-and-go carts, plus kiosk-market carts (`KIOSK_PREFIX`) once the
  kiosk returns. They never go on a dine-in order or a plain online to-go order.
- **M265:** a sticker is re-assigned only while its table is empty.
- **J33 · J38:** no second-table stop and no "move to table" tool. A stray table is merged from the floor.
- **T37:** keep one lock sentence ("someone is checking out").
- **K16:** no guest names on kitchen tickets.
- **T47:** `checkoutSteps` stays out of the money-coverage guard.
- **J27:** the menu header's two names go into the K40 word sweep. No change this wave.
- **M99:** sent dishes stay separate when tables merge, fixed next wave in the next merge-function migration.
- **P2ia / P2ib:** pad adds lost to a reload get "not confirmed — add again?" next wave. The kitchen's
  undo across a reload waits until a mis-bump is reported (D7).
- **S17:** keep scan events and counter phone numbers **90 days**. That is the working window, a starting
  point and not legal advice. Nothing is deleted until the S17 sweep (next wave) implements it.
- **T3:** no staging database this wave. Payment and reader proofs stay on unit tests and the throwaway
  Postgres.
- **Native Burmese sitting** at the end of the wave covers:
  - the K15 ledger and every `K15 · <stream>` row beneath it, money words first;
  - the K40 / K41 word picks;
  - C24's plain words;
  - the D12 question.

## C18 — the exact steps (measured 2026-10-07 through the Stripe connector, read-only)

- **The test-mode endpoint** is `we_1TkFUzD7LsBxOcnN7MDQk0Et`, at `https://mms-platform.vercel.app/api/stripe/webhook`.
  - It is **enabled**, on API version 2022-08-01.
  - Its events: `payment_intent.created`, `.succeeded`, `.payment_failed`, `.canceled`,
    `.amount_capturable_updated`, plus `setup_intent.succeeded` and `charge.refunded`.
- **The live endpoint** is `we_1U7KIJD7LsBxOcnN13khTrnM`, at
  `https://qr.mandalaymorningstar.com/api/stripe/webhook` (**enabled**). Its secret is the one Vercel
  Production holds today. That is why every test-mode event fails its signature check.
- **The webhook accepts both secrets in test mode.** `webhookCandidatesForMode` keeps both names, trying
  `STRIPE_WEBHOOK_SECRET_TEST` first (`apps/qr/lib/stripe-env.ts`). So the safer form of the decided fix
  is to keep the live secret where it is:
  1. In the Stripe Dashboard, switch to **test mode** → Developers → Webhooks → open `we_1TkFUz…` →
     **reveal the signing secret**. The API never returns a secret after creation.
  2. In Vercel → Production, add it as **`STRIPE_WEBHOOK_SECRET_TEST`**. Leave `STRIPE_WEBHOOK_SECRET`
     alone; it holds the live secret, which the C2 cutover needs.
  3. **Redeploy** production. Env changes only take effect on a new deployment. This deploy also counts
     for #4's reload if it lands after 07:13Z.
  4. Check: the next test-mode payment gets a `qr_orders` row and a kitchen ticket. The Stripe Dashboard
     shows the endpoint's latest deliveries answering 200.
