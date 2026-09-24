# Phase 1c · account-star — integration notes

Keeping what you earned: a save-your-Stars door on the /track success moment, one rewards door at a
time, a celebration latch for the browser's Back, /account reordered so today's orders and receipts
come first, a chooser note that names what a Welcome-back chip strands, and a matching skeleton.

## §XX Keeping what you earned (Phase 1c)

- **A door, not a copy.** When a surface needs a flow that already lives elsewhere, it links to it —
  it does not mount a second instance. The /track save card has ONE action, a secondary link to
  /account, where the one save flow (AccountUpgrade, every merge/carry rule) sits directly under the
  live row. Mounting that flow on /track was rejected: its `resume` handler reads /track's own
  `resume=1` as a lend-mode email, its verify never clears `busy` on success, and it owns a live
  region /track has no room for.
- **One rewards door at a time, decided once.** `successRewardsDoor` (lib/save-stars.ts) is the only
  place that decides which rewards door the success screen shows; the card and GoodbyeBeat both
  render from its answer and neither re-derives it. While attribution is undecided the answer is
  `pending` and NO rewards link renders anywhere, so a door can appear but never vanish under a
  finger. After "Not now" the answer moves to GoodbyeBeat's link: a door appears, none vanishes.
- **The card mounts only after what sits above it has settled.** The save card waits for the
  progress poll AND for ReceiptActions' `onSettled` report (minted, refused or failed — always
  reported), so the receipt's actions are already in place and can never push its buttons down. No
  placeholder while it waits: a skeleton for a maybe-card is a guess wearing recognition's clothes.
- **An ask on a success screen is quiet.** Inline, never fixed, never a sheet or toast, never takes
  focus on mount, never scrolls the page, and adds NO live region. The CTA is `secondary` — the
  screen exists for status and proof, and a filled pill would out-rank both. "Not now" is `quiet`
  and is recorded per device; after two declined orders the ask stops and the header ✦ link stays
  the standing door.
- **Only claims the data holds.** Asked only when this order earned THIS viewer a Star, the viewer
  is a guest, the server total is above zero and the order is not refunded. The count is the server
  total after attribution, never the order's +1. "The reward you just unlocked" reads the SAME
  `rewardJustUnlocked` binding PaySuccess reads (lib/rewards-progress.ts). The Burmese line carries
  no numeral. A note about the receipt email appears only when that control is on screen.
- **A withheld action stays on screen with its reason.** Offline, or while the tracker's W10c
  `weDown` verdict holds, the CTA is an `<a>` WITHOUT href (role=link, aria-disabled, focusable,
  described by a static reason line) — never a transition link with a swallowed click. The local
  "Not now" stays live.
- **Dismiss is an instant cut, and focus moves first.** If focus was inside the card it moves (no
  scroll) to the previous focusable element in the tracker's `<main>`, else the next — never "Back
  to menu" while an earlier target exists. A touch tap does not focus, so touch users see no jump.
- **A disclosure BEFORE a costly tap names every cost.** A Welcome-back chip signs in with the merge
  suppressed, stranding this phone's guest Stars AND its guest orders. `chooserLeavesNote` says so
  in one static line between the chooser's heading and its chips — before the tap. It names the
  order in progress when one is live, is count-free when the Stars read failed, and makes no "bring
  everything along" promise where the merge would not keep it (a zero-Star guest's order).
- **/account reads now → you → what you own → the record → reference → settings.** The live row,
  then identity (the save/sign-in door), then the Stars ring with the coupons spendable today
  directly under it, then order history (the record five surfaces send diners here for), favourites,
  the tier ladder and "How it works", then sound. The order is plain JSX pinned by a render test of
  the page itself; W9c holds inside it (a failed rewards read costs the Stars panel, never the
  history — and a guest still gets the save door, count-free).
- **The live row is fresh, not a snapshot.** Seeded by the server read (no fetch, no flash), then
  refreshed on a hidden→visible wake and on focus (the email-code round trip IS such a wake), and
  replaced by any new server snapshot. It stays the only order status on /account; the header pill
  stays off there, because two claims about one order on one screen is what W22b removed.
- **No hash landings behind a loading boundary.** Next consumes a `#hash` on the loading skeleton's
  commit, so a `/account#…` landing cannot scroll to the real page. Put what the arrival needs at
  the top instead.
- **A resume is not an arrival — including the browser's own Back.** PaySuccess latches its
  celebration per payment in sessionStorage (`mms.celebrated:<paymentIntent | orderId>`); a remount
  of the same payment (a reload, or Back from /account to Stripe's return URL) skips the confetti,
  the celebrate haptic and the paid chime. Storage that throws celebrates as before. The SSR'd 1.05s
  thermal print still replays.
- **A skeleton's geometry comes from the tokens it stands in for.** The /account skeleton models the
  masthead line for line with heights computed from the same `--fs-*` × `--lh-*` tokens the masthead
  reads, and says in its docblock that it matches only when nothing is live.

## CHANGELOG

- **Phase 1c · account-star — keeping what you earned.** A guest who earns a Star now sees an honest
  "Keep your N Stars" card under the receipt on /track (one secondary link to /account; "Not now"
  twice and it stops), GoodbyeBeat yields its rewards link to it so there is one rewards door at a
  time, and Back to the Stripe return URL no longer replays the confetti, haptic or chime. /account
  now opens on today's live orders (refreshed on wake/focus), then the save/sign-in card, the Stars
  and spendable rewards, and the order history — reference and settings last; a failed rewards read
  still shows a guest the save door; the Welcome-back chooser says what a chip tap leaves behind
  before the tap; and the loading skeleton matches the masthead.

## OPEN-ITEMS rows

| Sev | Item                                                                                                          | Why / where                                                                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| low | K15: three new Burmese strings need the native check                                                          | `apps/qr/lib/save-stars.ts` — the save card's heading line (`SAVE_STARS_HEADING_MY`) and the two chooser-note lines (`CHOOSER_NOTE_MY_STRANDS`, `CHOOSER_NOTE_MY_ORDER`). All numeral-free by design.                                        |
| med | Measure /account + the save card on a preview before quoting a screen count                                   | No preview/device in the build env. Measure 390×844, 375×667 and 320 for a guest with and without a live row: is the identity card on screen 1; does the card's action row fit one line from ~340px and wrap below it.                       |
| low | `app/account/loading.tsx` masthead heights are DERIVED from the type tokens, not measured                     | Heights are `--fs-*` × `--lh-*` per line (kicker, title, MY line, two lede lines, rule). Confirm on the preview that the no-live-order swap does not shift; the one-section shift with a live order is stated and accepted.                  |
| low | Save card's rise offset (420ms) and `margin-top: 14px` are the spec's starting values                         | GoodbyeBeat's rhythm, copied; check the stacked cards read as one beat on the preview (`.save-stars` in `apps/qr/app/globals.css`).                                                                                                          |
| low | Check the `.vt-receipt` morph when the save card's CTA is tapped                                              | The /track receipt morphs toward /account's history card, now the 5th section and possibly below the viewport, so the morph travels downward. Expected harmless.                                                                             |
| med | A mixed-case strand: Stars > 0 plus an in-progress PAYER order, then the email-taken sign-in                  | The merge re-stamps `earned_by` but not `qr_order_payers.payer_uid` (the M29 lineage), so that one payer order stays on the anon uid while the chooser note's "bring everything along" covers everything else. Needs a merge migration.      |
| low | Consolidate the pre-existing extra live regions                                                               | /account: AccountUpgrade + SoundToggle; /track: tracker + ReceiptActions + FeedbackPrompt. This change adds none.                                                                                                                            |
| low | Put the email/Google form ahead of the Welcome-back chips on a save arrival (or change the chip merge policy) | Needs a save-intent signal that must not collide with AccountUpgrade's `resume`; AccountUpgrade is mutation-tested; docs/SHARED_DEVICE.md owns the policy. This change only discloses the cost.                                              |
| low | Realtime (channel) status on /account                                                                         | TodayOrders refreshes on wake/focus/new snapshot; a Ready that lands while the diner stares at /account shows on the next wake, focus or navigation. A channel would be a new realtime subscription on the route.                            |
| low | Latch the 1.05s thermal print and the `.mms-rise` entrances on a Back to the Stripe URL                       | The print class is SSR'd; reading a latch there would be a hydration mismatch. Confetti, haptic and chime ARE latched.                                                                                                                       |
| low | A per-uid decline cap                                                                                         | The save-card decline record (`mms.saveStars.declined.v1`) is per device: on a shared phone one guest's two declines silence the ask for the next guest. The header ✦ link stays the door.                                                   |
| low | Hide the save card when the diner upgrades in ANOTHER tab while /track is open                                | The card reads the progress poll's `isUpgraded`, which is not re-read after the poll settles.                                                                                                                                                |
| low | A full refund landing live while the save card shows                                                          | The card and GoodbyeBeat both leave (the screen turns into the refund state); focus may fall to `<body>` if it was in the card.                                                                                                              |
| low | The chooser note's "in progress" count is the server snapshot                                                 | `app/account/page.tsx` computes it from `getMyLiveOrders` at render; TodayOrders may refresh past it on a wake (e.g. an order picked up meanwhile). The stranded order is still on the anon uid, so the note stays true, just stale-counted. |
| low | `AccountUpgrade`'s OAuth `redirectTo` stays `/account`; no auto-focus of the email field on landing           | Both deliberate (out of scope): the redirect is where the save card now sits; auto-focus would pop the iOS keyboard uninvited.                                                                                                               |
| low | The PaySuccess pill's own late-mount shift above the receipt                                                  | Pre-existing, not touched here.                                                                                                                                                                                                              |
| low | A `.mms-pop` on a TodayOrders status word that changed on wake                                                | LiveOrderRow is shared with the header tray; not animated here.                                                                                                                                                                              |
| low | Unify heading styles across the /account cards; cap or paginate the 20-row OrderHistory                       | Out of scope for the reorder.                                                                                                                                                                                                                |
| low | The header's aria-hidden "Save" micro-chip copy                                                               | Its link's accessible name already says "— save them to an account".                                                                                                                                                                         |

## Mutate-set / CLAUDE.md enumeration changes

- **Files added to the mutate set** (both bucket `lib`): `apps/qr/lib/rewards-progress.ts`,
  `apps/qr/lib/save-stars.ts`. Measured with the CLAUDE.md grep on this branch: `apps/qr/lib` 118,
  `apps/qr/app/api` 3, components 12, `packages/db` 1 — **134 total** (was 116 / 132). Mutations:
  **763** (754 + 9), per `check:mutant-anchors` ("763 anchors, 134 files").
- **Mutants added** (one block, `// ── Phase 1c · account-star ──`, end of the array) — all KILLED:
  `rewards-progress/unlock-at-zero-stars`, `save-stars/pitches-signed-in`,
  `save-stars/pitches-share-payer`, `save-stars/claims-this-orders-plus-one`,
  `save-stars/pitches-a-refunded-order`, `save-stars/door-flips-before-attribution`,
  `save-stars/card-lands-above-receipt-actions`, `save-stars/decline-cap-ignored`,
  `save-stars/chooser-tells-a-zero-star-guest`.
- **Mutants re-anchored:** none. `AccountUpgrade.tsx` changed only at its signature and the
  WelcomeBackChooser mount (no anchor on either); `check:mutant-anchors` clean, and all 12
  `account-upgrade/*` mutants re-run KILLED against the edited suite.
- **Test counts** (for check:docs): qr 3042 (2958 + 84 added here), ui 159 (146 + 13 added here).

## Owner-visible behaviour changes

- **/track, fresh payment, guest who earned a Star:** a new "Keep your N Stars" card appears under
  the receipt's view/print + email row, after the receipt row has settled: ✦ medallion, a bilingual
  heading, "Guest Stars live only on this phone…", a "Save to an account →" button and "Not now".
  It adds "Emailing a receipt doesn’t save them." when the email-receipt control is on screen.
  Offline or during an outage the button stays but is disabled with a one-line reason. "Not now"
  removes it instantly; after two declined orders on a device it stops appearing.
- **/track, GoodbyeBeat:** while the card is showing, the goodbye no longer shows its "See them in
  your rewards" link or "Your Star and this receipt are with your rewards." After "Not now" (or for
  anyone the card is not for) the link returns. For everyone, the link now appears once rewards
  attribution is decided (~0.3s for most, up to ~6s for a guest who did not earn this order).
- **/track, Back from /account (or a reload) to the Stripe return URL:** no more replayed confetti,
  haptic buzz or paid chime for the same payment in the same tab.
- **/account order:** "Your live orders" first (when any), then the save/sign-in card (or the
  signed-in card), then Stars with any spendable rewards directly under the ring, then "Your
  orders", favourites, the tier ladder + lifetime spend, "How it works", and the sound switch last.
- **/account live row:** updates when the diner switches back to the tab (e.g. after reading the
  sign-in code in Mail) — a Ready that landed meanwhile is showing on return.
- **/account, rewards read failed:** a guest now still sees the save card (with the count-free
  copy) below the alert, instead of no way to save or sign in.
- **Welcome-back chooser:** one new line under "Welcome back — pick up where you left off" saying
  what tapping a name leaves behind (the guest Stars, the orders, the one in progress).
- **/account loading skeleton:** shaped like the masthead (kicker, title, Burmese line, two lede
  lines) instead of one short bar; the tier-row placeholder is gone.

## Deviations from spec

1. **globals.css placement.** The spec says "next to `.goodbye-beat`" and "next to `.wb-heading`";
   the brief's shared-file rule wins — all rules live in ONE labelled block at the END of the file.
   The spec's "comment line in the adjacent reduced-motion block" became an explicit
   `@media (prefers-reduced-motion: reduce) { .save-stars.mms-rise { animation: none } }` escort
   with its comment inside the same block, so no existing shared line is edited.
2. **Docs files not edited** (DESIGN-LANGUAGE, CHANGELOG, OPEN-ITEMS incl. K15, HANDOFF, CLAUDE.md
   bucket counts, README counts): per the brief, their content is in this file for integration.
3. **Skeleton heights** are derived from the tokens, not taken from a preview (none available);
   filed above.
4. **`safeSessionStorage()`** — the spec calls it but names no home; it lives in
   `lib/celebration-latch.ts` (guards SSR and a throwing `window.sessionStorage` getter).
5. **`parseDeclined` also deduplicates** before capping, so a hand-edited `["a","a"]` cannot count as
   two declined orders.
6. **The receipt note** renders as a trailing sentence (`span.save-stars-note`) inside the body
   paragraph — one `--t2` paragraph rather than a second block.
7. **GoodbyeBeat `none`** hides the whole sub-line; the spec names only the guest variant, and the
   signed-in variant cannot co-occur with `none` (the offer requires a guest), so it is equivalent.
8. **Extra test** `apps/qr/lib/useLiveOrders.test.tsx` pins the unseeded (AppHeader) contract —
   empty + loading start, load on mount, reload on `pokeKey`, nothing when disabled.
9. **Small collateral edits:** ReceiptActions' mint effect now lists `onSettled` in its deps (the
   one-mint ref guard keeps it single-shot); PaySuccess's haptic effect deps are
   `[replay, celebrationKey]`; OrderTracker's revisit-link comment now names `successRewardsDoor`;
   `fullscreen-blur-contract.test.ts` prose points at `page.tsx:69` / `:152` and `RewardsSummary`.
10. **Composite-contrast test names** are `"<theme>[ (reduced motion)] · <ink> on vellum · the
<stop> end"`; the spec's red-first target "light · --t2 on vellum" is the `--ac`-end case.
    Measured floor: light reduced-motion `--t2` at the `--ac` end **4.9286**; `--ac` on the light
    wash 4.1462–4.1672 (why the card has no `--ac` text).

## LEARNINGS candidates

- **The "is a verify:slice run live?" check is machine-wide, not checkout-wide.** In a multi-worktree
  setup the prescribed `ps … | awk '/verify-slice\.mjs/'` lists sibling worktrees' runs too — check
  `readlink /proc/<pid>/cwd` before deciding it is YOUR run (and before deciding it is not).
- **A `vi.mock` factory must grow with the render path.** AccountUpgrade's suite mocked
  `@/lib/deviceIdentity` with two exports; the moment a case seeded an identity, WelcomeBackChooser
  reached `maskEmail` and vitest threw "no export defined on the mock". Add the exports the new path
  reaches, not a looser mock.
- **Next's `no-html-link-for-pages` fires on test fixtures too** — an `<a href="/">` in a jsdom
  fixture fails lint; use fragment hrefs (`#back`) for focus-order fixtures.
