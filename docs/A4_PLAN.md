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
| A4·2     | Tables & settle | Floor + register + expo on one screen; `/staff/register` and `/staff/expo` become redirects; K30 (B) "kitchen done" badge on the to-go lane; the approvals count in the bar.                                                                                                                                                                                                                                                 | K30 (B) · M204 groundwork |
| A4·3     | Tables & settle | The manager rails: approvals and "settled today" with the refund console reading the receipt (`receipt-view.ts` · `refund-view.ts`); `/staff/approvals` and `/staff/orders` redirect. ⚠️ `refunds.ts` has no mutant — this PR lands one.                                                                                                                                                                                     | M204 · M183 · F18 (b)     |
| A4·4     | Sign-in         | login · lock · profile · team as one screen with states; `/staff/profile` and `/staff/team` redirect. The front-door rules of §17 (top-aligned card, the escape a quiet link, last) hold for every state.                                                                                                                                                                                                                    | —                         |
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

## A4·2 — Tables & settle, as one screen (scoped 2026-09-13, not yet built)

What the counter person does today across three pages, in the order they do it, on one column
(mobile-first; the tablet tier may lay the to-go lane beside the tables):

1. **Start** — `RegisterStart` as built (walk-up · phone · start a table), first, because it is the
   one action taken most. It was the register page's primary and the floor's first tile; on one
   screen it is a zone, not a link.
2. **Tables & counter orders** — `FloorBoard` (the live floor, A1's sort: the longest "pay at
   counter" ask first) and the register's open counter orders (`getRegisterQueue`, the walk-up and
   phone sessions still being built, today's `/staff/register` list) in ONE `role="list"` keyed by
   session, each row carrying its channel. Both are SESSIONS; the drill-down stays
   `/staff/table/[id]` · `/add`.
3. **To-go bags** — `ExpoBoard`'s queue (two-stage bump, "Here now" pinned, due-time sort) as a
   lane on this screen. These are ORDERS, post-settlement work, so they are their own list, not rows
   in the one above. **K30 (B)** lands here: `getExpoQueue` joins `qr_cart_items` on the ticket's
   `cart_id` and badges "kitchen done" (no non-voided to-go line still `fired`/`in_progress`),
   kitchen-done bags sorting first — the pure rule in a `lib/` module with a value test.
4. **Today's cash** — `getDayCashSummary` (manager+, hides itself otherwise) at the bottom, as the
   register renders it.

The two live boards keep their own realtime subscriptions and 5s backstops for this slice (two
pollers on one screen is measured, not assumed, before a unified poll is built). `/staff/register`
and `/staff/expo` become `redirect("/staff?floor=1")` — a tablet bookmark must land, not 404 — and
the floor's More grid drops the two tiles the screen now carries. `check-staff-lang` rule 4's page
count moves from 16 to 14 in the same commit. The bar keeps `floor.eyebrow` as the title until
A4·5 renames the screen in the dictionary (new MY → K15). Help: the counter's sheet gains one card
for the to-go lane (the expo sheet's cards move, they are not rewritten).

Not in A4·2: approvals and the refund console (A4·3), any change to the doors, any new Burmese
beyond the one help card.
