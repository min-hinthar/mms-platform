# A4 — `/staff` to five screens (Kitchen · Tables & settle · Menu · Tips · Sign-in)

The plan behind OPEN-ITEMS **A4**, written so a later session can pick up the next slice without
re-deriving the map. Owner's brief (Option A, 2026-09-09): on `/staff` only the kitchen sees use
(21 bumps in 30 days); every other page is at ≤3 views. Fold what the family needs into five
screens, built to `docs/prototype/v7.2.html` + `docs/DESIGN-LANGUAGE.md` §17/§19, mobile-first,
new Burmese → K15. **The two doors (P7·1) stay** — they are the front door, not a page.

## The map — sixteen routes into five screens

| Today (`apps/qr/app/staff/…`)   | Views/30d | Becomes                                                                                                                                                                            |
| ------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/staff` (doors · floor)        | —         | The **front door** (two doors, unchanged) and, behind the Counter door, **Tables & settle**.                                                                                       |
| `kitchen`                       | 21 bumps  | **Kitchen** — the KDS as built, plus the served rail (K31, A4·1).                                                                                                                  |
| `expo`                          | ≤3        | → **Tables & settle**: the to-go lane beside the tables. The bagger and the register are the same person at this counter; K30 (B) badges "kitchen done" bags there.                |
| `register`                      | ≤3        | → **Tables & settle**: the counter queue and the day's cash summary ARE the settle side; one screen, sorted the way A1 already sorts (longest "pay at counter" ask first).         |
| `approvals`                     | ≤3        | → **Tables & settle** (manager rail): a void/comp approval and a refund-needed row are about a table's lines; they sit beside those tables, count in the bar.                      |
| `orders`                        | ≤3        | → **Tables & settle** (manager rail): "settled today" with the refund console reading the receipt (M204). Day-scoped and Burmese-first, which `/staff/orders` never was.           |
| `table/[id]` · `table/[id]/add` | —         | Stay, as Tables & settle's drill-down (F18 puts Burmese on the drill-down's lines).                                                                                                |
| `menu`                          | ≤3        | **Menu** — availability (server) / prices (manager) as built, plus the printed word-check sheet as one action (`glossary` folds here: it is a list of dish names).                 |
| `glossary`                      | ≤3        | → **Menu** (a "Print word check" action; the sheet itself is unchanged).                                                                                                           |
| `tips`                          | ≤3        | **Tips** — "Tips today" as built, plus the day's guest feedback beneath it (`feedback` folds here: both are the end-of-day read). The pilot night sheet stays behind its own gate. |
| `feedback`                      | ≤3        | → **Tips**.                                                                                                                                                                        |
| `login` · `lock` · `profile`    | —         | **Sign-in** — ONE screen with three states: signed out (email), locked (PIN), signed in (who you are · your PIN · sign out, last).                                                 |
| `team`                          | ≤3        | → **Sign-in** (manager section: who can sign in, roles — A6 as built, moved under the identity screen).                                                                            |
| More grid                       | —         | Gone. Behind the doors sit the three remaining tiles (Menu · Tips · Sign-in) instead of eleven. The bar's Screens circle keeps leading to the doors.                               |

Navigation stays the P7·1b model — the doors, the bar's Screens circle, `{ kind: "back" }` on a
drill-down. **No bottom tab bar**: the KDS is a measured surface (P4 counts tickets per screen on the
real tablet) and §17 makes the bar the ONLY sticky element; a tab bar would subtract from exactly the
thing being measured.

## The slices — one PR each, in this order

| Slice    | Screen          | What lands                                                                                                                                                                                                                                                                                                                                                                                                                   | Rows                      |
| -------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| **A4·1** | Kitchen + wall  | ✅ The served rail (`lib/served-today.ts` + the rail's segmented view in `KdsBoard`), the ONE service-day rule (`lib/day-window.ts`, from `pickup_config.tz` — `laDayStartIso` is now that rule applied to LA), the ONE Burmese name loader (`lib/line-names.ts`, replacing the copies in kitchen · expo · `/api/board`), the wall's wait minutes off the DB clock and its saturation refusal (`/api/board` + `ReadyBoard`). | K31 · K32 (a) · F18 (a)   |
| A4·2     | Tables & settle | ✅ Floor + register + expo on one screen; `/staff/register` and `/staff/expo` become redirects; K30 (B) "kitchen done" badge on the to-go lane; the approvals count in the bar.                                                                                                                                                                                                                                              | K30 (B) · M204 groundwork |
| A4·3     | Tables & settle | ✅ The manager rails: approvals and "settled today" with the refund console reading the receipt (`receipt-view.ts` · `refund-view.ts`); `/staff/approvals` and `/staff/orders` redirect. ⚠️ `refunds.ts` has no mutant — this PR lands one.                                                                                                                                                                                  | M204 · M183 · F18 (b)     |
| A4·4     | Sign-in         | ✅ login · lock · profile · team as one screen with states; `/staff/profile` and `/staff/team` redirect. The front-door rules of §17 (top-aligned card, the escape a quiet link, last) hold for every state.                                                                                                                                                                                                                 | —                         |
| A4·5     | Menu + Tips     | Glossary → a Menu action; feedback → beneath Tips; the More grid → three tiles. `resolveStaffHome` unchanged.                                                                                                                                                                                                                                                                                                                | —                         |

Owner decisions this plan does NOT make: **K32 (b)** (a table number on the wall is a SPEC reversal
of SPEC-KDS §6, pinned by `route.test.ts`'s whole-body property — needs Min's word); **K30 (A)**
(`kitchen_done_at`, a prod migration — Min's go, one file, `apply_migration`, and the stamp goes
AFTER `get diagnostics`); the machine-authored Burmese in every slice (K15).

## Rules the slices inherit

- **One rule, one place.** "Today" is `dayStartIso(now, tz)`; a line's Burmese is `loadLineNames`;
  a receipt row is `receipt-view.ts`. A slice that needs one of these reads it — never a second copy.
- **Advisory reads stay advisory.** A rail, a label, a count that cannot misidentify food or money
  logs and degrades; only a read that could put the wrong dish on the wrong table refuses.
- **A redirect keeps the old URL alive.** A tablet bookmark to `/staff/register` must land on the
  counter screen, not a 404 — every folded page becomes a `redirect()` to its new home, and
  `check-staff-lang` rule 4's 16/16 count moves down with each removal in the same commit.
- **Measured surfaces stay measured.** Nothing sticky is added to a page (§17); the KDS ticket
  envelope is untouched by A4·1 (the served rail lives inside the rail the board already had).

## A4·2 — Tables & settle, as one screen (scoped and built 2026-09-13)

What the counter person does today across three pages, in the order they do it, on one column
(mobile-first; the tablet tier may lay the to-go lane beside the tables):

1. **Start** — `RegisterStart` as built (walk-up · phone · start a table), first, because it is the
   one action taken most. It was the register page's primary and the floor's first tile; on one
   screen it is a zone, not a link.
2. **Tables & counter orders** — `FloorBoard` (the live floor, A1's sort: the longest "pay at
   counter" ask first) and the register's open counter orders (`getRegisterQueue`, the walk-up and
   phone sessions still being built, today's `/staff/register` list) in ONE `role="list"` keyed by
   session, each row carrying its channel. _As built:_ the counter read moved to
   `lib/register-queue.ts` · `readRegisterQueue` and rides the floor's own snapshot inside
   `getFloorView` (one poll, one outage posture); `lib/floor-rows.ts` · `mergeFloorRows` is the
   seam. Both are SESSIONS; the drill-down stays
   `/staff/table/[id]` · `/add`.
3. **To-go bags** — `ExpoBoard`'s queue (two-stage bump, "Here now" pinned, due-time sort) as a
   lane on this screen. These are ORDERS, post-settlement work, so they are their own list, not rows
   in the one above. **K30 (B)** lands here: `getExpoQueue` joins `qr_cart_items` on the ticket's
   `cart_id` and badges "kitchen done" (no non-voided to-go line still `fired`/`in_progress`),
   kitchen-done bags sorting first — the pure rule in a `lib/` module with a value test.
4. **Today's cash** — `getDayCashSummary` (manager+, hides itself otherwise) at the bottom, as the
   register renders it.

The two live boards keep their own realtime subscriptions and 5s backstops for this slice (two
pollers on one screen is measured, not assumed, before a unified poll is built). _As built:_ the
takeaway board's help door went with the board — the counter's sheet (six cards) composes its bump
card from the board's two bump sentences and takes the paper card whole; a redirect-only page is
exempt from rule 4 by its exact parsed shape. The blind pass found the two boards colliding on one
realtime channel — `useFloorRealtime` takes a channel name now. `/staff/register`
and `/staff/expo` become `redirect("/staff?floor=1")` — a tablet bookmark must land, not 404 — and
the floor's More grid drops the two tiles the screen now carries. `check-staff-lang` rule 4's page
count moves from 16 to 14 in the same commit. The bar keeps `floor.eyebrow` as the title until
A4·5 renames the screen in the dictionary (new MY → K15). Help: the counter's sheet gains one card
for the to-go lane (the expo sheet's cards move, they are not rewritten).

Not in A4·2: approvals and the refund console (A4·3), any change to the doors, any new Burmese
beyond the one help card.

## A4·3 — Tables & settle, the manager rails (scoped and built 2026-09-13)

The same screen, three more zones for a manager, after the bags and around the takings:

4. **Refunds needed** — the W11/M43 strip (money taken with no order behind it), moved from
   `/staff/approvals` as `RefundsNeededStrip`. Renders nothing when the ledger is empty; an
   UNREADABLE ledger prints one honest line (an empty strip must mean empty).
5. **Approvals** — `ApprovalsBoard` as a zone (`.staff-zone`, its h2 the region's name), its
   5 s poll kept. _As built:_ the count/freeze line is PLAIN text and each card's `role="status"`
   exists only once a decision is open (the floor's region is the screen's one state region —
   A4·2's rule); the server's failed read starts the zone frozen with cause `outage`
   (`initialOutage`), never all-clear; a failed roster read loads on the poll (`approvers: null`)
   instead of offering "No managers available"; the card's six server verdicts are dictionary keys.
6. **Today's takings** — unchanged (`DayCash`), its pointer now naming the zone below.
7. **Settled today** — `SettledToday`, the refund console READING THE RECEIPT (M204):
   `getSettledToday` (`refunds.ts`) reads the orders paid today and the earlier orders refunded
   here today (the ledger's rows since the floor name them — the blind pass's CRITICAL 1: the
   takings' pointer had sent a manager here for exactly the order a `created_at` floor excluded)
   under the ONE service-day rule, with every column the receipt selects, the ledger's amounts,
   and the Burmese loader (F18 (b)); the list renders through `groupReceiptLines` / `buildReceiptRows` /
   `buildRefundRows` / `summarizeRefund` / `lineRefundLabel`, every row word pinned to the
   artifact's English in `settled-view.test.ts` (the ONE exception, "Guest paid" for the guest's
   "You paid", is asserted as such). `refund-console.ts` holds the pure rules — `refundPathFor`
   (M183: cash → the drawer, a PaymentIntent → in-app, else the dashboard), `lineRefundableCents`
   (moved), `remainingPoolCents` (the SQL's pool: total − service − tip, minus every ledger row)
   and `offeredRefund` (the line clamped to the pool, and whether the clamp bit) — so the sheet
   shows the figure the server will charge back and explains a clamp before the tap. Refund is
   offered only on the in-app path, a paid order, a line not in the ledger, a non-zero offer; the
   cash and split orders carry their path note instead. A manual Refresh, not a third live
   subscription — and a refresh that fails keeps the last good list and dates it (the pass's
   CRITICAL 2: the read returns its failures, so the first draft installed an outage over the
   confirmation); a full page (50) says so.

`/staff/approvals` → `redirect("/staff?floor=1#appr-h")`, `/staff/orders` →
`redirect("/staff?floor=1#settled-h")` (their loaders deleted); the bar's approvals circle scrolls
to the zone; the doors' More keeps two tiles pointing at the zones and the floor drops both.
`check-staff-lang` rule 4 reads 12/12 + 4 exempt. Eight mutants (`refund-console/…` ×4,
`refunds/…` ×4), a mocked-db wiring suite for the read, a jsdom suite for the console's gating,
names and refresh posture. New Burmese (`floor.settled.*`, `floor.refund.*`, `table.appr.msg.*`,
`table.appr.refunds.outage`, `floor.nav.settled`; `reg.day.note` / `reg.day.refunded.*`
re-pointed) is a machine draft → K15.

Not in A4·3: Burmese on the approvals cards (`mms_approvals.line_name` is a snapshot column —
F18 (b) names the join), a live subscription for the settled list, any change to the doors or
the help sheet (the manager rails are not on the counter person's six cards).

## A4·4 — Sign-in, one screen with states (scoped and built 2026-09-14)

`/staff/login` is the Sign-in screen. `lib/sign-in-state.ts` · `resolveSignInState` — pure,
value-tested, two mutants — picks its state from the auth answer, the lock cookie and whether the
URL carried a `?next=` at all:

1. **Signed out** — `StaffLogin` as built (email · code · Google), the bar's static people mark.
2. **Locked** — `/staff/lock` as built. It keeps its own URL: the lock is a device cookie every
   console page redirects to, and its card was already this screen's vocabulary (`.entry-*`).
3. **Signed in** — `SignedInCard`: who you are (the name, the verified email), your PIN (set ·
   rotate · remove), sign out LAST — the old `/staff/profile`, converted while it moved (K25 named
   it the only console page with no Burmese below the bar). Every word is a key; `setPin` /
   `removePin` answer REASON CODES (`invalid` · `trivial` · `outage` · `auth` · `save`) so no refusal
   is English under the switch; the two refusals the card can see itself (a short PIN, a mismatch)
   are SAID with focus on the field at fault rather than greyed — the old form's own messages were
   unreachable behind its disabled button; ONE live region for the PIN outcome and the sign-out
   failure. The bar is the console's here: the Screens circle, the name, the role, Lock when a PIN
   exists.
4. **The roster** — a manager zone beneath the card (`TeamManager` · `#team-h`, the old
   `/staff/team`): its heading takes focus on arrival and on a same-page jump (the A4·3 pattern),
   and a failed read prints one honest line under the heading instead of throwing the person's own
   card away with it (the old page threw to the error boundary, which was its whole page).

The ORDER of the staff arms is the pinned behaviour: an explicit `?next=` still wins (a bookmarked
`/staff/login?next=/kiosk` on the lobby iPad stays idempotent; the destination gates itself, and
the lock is a `/staff`-scoped cookie the kiosk never sees), then the lock, then the signed-in
state — only a visit with NO destination lands on the card. `unavailable` renders the outage shell
(W10b) where the old login rendered the form: on this folded screen a form would tell a staff
member who tapped "Your PIN" that they had been logged out.

`/staff/profile` → `redirect("/staff/login")`, `/staff/team` → `redirect("/staff/login#team-h")`;
the doors' More tiles re-point; `revalidatePath` on the PIN and team actions names the new home.
`check-staff-lang` rule 4 reads 10/10 + 6 exempt. `PinManager` and `StaffSignOut` are deleted, and
two dead keys (`what.team`, `floor.team.backToFloor`) with them. New Burmese (`entry.me.head`,
`entry.pin.*`, `floor.team.outage`) is a machine draft → K15.

Not in A4·4: the roster form's own English (P2m — the heading, labels, options and tags stay as A6
built them), `RoleBadge`, any change to the lock screen, the More grid itself (A4·5).
