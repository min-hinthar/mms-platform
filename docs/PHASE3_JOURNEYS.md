# Phase 3 — the journeys (2026-10-03)

**Owner's ask (2026-10-03):** "Phase 1 and Phase 2 is improving the app but still does not feel like
major overhauls … Still not intuitive: customer ordering dine-in to-go grocery flows, staff manager
kitchen simplify, account page and features revamp."

**Why the first two phases did not feel like an overhaul.** Phase 0 built the system, Phase 1 polished
the guest screens and Phase 2 hardened the staff screens — every one of them a pass over a screen
_as it stood_. Four blind audits of the as-built journeys (2026-10-03, read-only, evidence as
file:line) found the same shape under all four surfaces: **a long single scroll with no persistent
map, and no answer to "where am I, what just happened, what's next" without reading.** That is a
STRUCTURE problem, and no amount of per-screen craft moves it. Phase 3 changes the structure.

## The audit digest (structural findings only — craft findings are filed in OPEN-ITEMS)

| Surface             | Finding                                                                                                                                                                                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Diner, every route  | **No bottom navigation and no progress indicator.** v7.2 (`docs/prototype/v7.2.html:189-193`) has a persistent Order · Track · Rewards · Account tab bar; the app ships a top header whose order slot, rewards chip and cart link appear and vanish by route (`AppHeader.tsx:48,117-153`). |
| Diner, dine-in      | 9 taps + a forced 10 s wait to a paid 2-dish order over 5 surfaces (picker → menu → order → bill → pay). The 3 checkout stages are STATE on one URL with no visible step (`Checkout.tsx:2413` is an animation wrapper). ~8 control groups sit before the first dish on the menu.           |
| Diner, to-go        | The pickup time is asked three times (menu greeting, menu chip, checkout); 15 controls on one checkout scroll; name + phone are required but fail only on Pay.                                                                                                                             |
| Grocery             | Three routes to checkout (CTA bar, basket sheet, header slot); the scan list falls under the fixed CTA bar; the checkout H1 says "Your order" for a basket (`Checkout.tsx:1116`); no manual-entry or "ask staff" fallback after a miss; no undo on remove.                                 |
| Staff, counter home | A manager's `/staff` stacks **8 zones on one scroll** (4–6 screen heights; `app/staff/page.tsx:247-288`); tables are drawn twice (strip tile + card); the manager rails sit between the bags lane and More; "up" from Menu / Tips / Sign-in lands on the doors, two taps from work.        |
| Staff, kitchen      | Mostly one-tap already (All done = 1, a line = 2). Text size is 3 taps deep in Help; sound needs a tap every shift. Not restructured in 3a.                                                                                                                                                |
| Account             | A 2–4 screen single scroll; no visible "Sign in" for a returning diner (the only door is headed "Save your Stars"); six sign-in actions on one card; the reward's value, minimum and expiry are never stated on the hub; the back link goes to the door picker, never the diner's mode.    |

## The decisions (owner decision 11, delegated — recorded here and in the CHANGELOG)

- **D1 — one spine for diners.** A persistent bottom tab bar, v7.2's, on every diner route:
  **Menu · Order · Track · Account**. The header keeps the brand and the live-order chip/tray ONLY;
  its cart link and rewards chip retire into the Order and Account tabs (the Account tab carries the
  Star count). The tab bar is the one place "where am I" is answered; it never re-animates on a route
  change (`view-transition-name`, the header's rule).
- **D2 — the tab labels are English.** Four 11–12px labels cannot carry a stacked Burmese pair at a
  44px target; the content under every tab stays bilingual. The Burmese pair for the four words is
  filed as a K15 row for the glossary, not invented here.
- **D3 — the checkout shows its steps.** A step rail under the heading: Order → Bill → Pay at a
  table; Order → Pay for to-go and the market. Presentational — it reads the state Phase 1b already
  keeps (`stage`, `step`); it adds no transition.
- **D4 — /account is a hub with three panels: Orders · Rewards · You.** Panels are addressed by
  `?tab=` (a hash is consumed by the loading boundary — the page's own note), so a deep link and
  Back both work. The save door gets a visible **"I already have an account"** switch (copy only —
  the email/Google mechanics already handle the existing-account case). "Order again" rides the
  collapsed history row. The hub states what a reward IS (every `milestoneStep` Stars, the amount
  read from the coupon rows — never a transcribed number). A Help & contact card reads `lib/brand.ts`.
  The door-picker back link retires: the Menu tab is the way back, and it carries the mode.
- **D5 — the counter home keeps one screen, gains a map.** A sticky zone strip under the staff bar
  (Start · Tables · Bags · [Requests · Takings · Settled] for a manager) jumps to each zone by its
  existing anchor; the current zone is lit by an IntersectionObserver. Splitting the zones into
  screens was rejected for 3a: the counter bell hears BOTH boards (owner decision 5c), the split pane
  and the mint lock wrap them, and unmounting any of it is a Phase-2-sized change. The strip turns a
  4–6 screen scroll into one tap, with no board unmounted. The up-link from Menu, Tips and Sign-in
  returns to the counter on a counter device (`?floor=1`), the doors elsewhere.
- **D6 — grocery.** The checkout heading reads "Your basket" in the market (`orderNoun`, the
  dictionary's own K15-HIGH pair). The header's basket slot retires with D1 (routes to checkout:
  three → two plus the Order tab). Manual barcode entry, "ask us — we'll ring it up", undo on remove
  and the exit-pass QR are filed (3c), because they need the real UPC import (G1) to be worth
  anything to a shopper.

## The slices

| Slice | What                                                                                                                                                                                                                                   | Status           |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| 3a    | The diner spine (D1 · D2 · D3) · the account hub (D4) · the counter map + up-link (D5) · D6's heading                                                                                                                                  | **this PR**      |
| 3b    | Dine-in: bind the table at SEND time, not before the menu (the picker becomes a sheet on first send); one verb per state (Send, then Pay); the bill readable during the undo window; the per-line For here / To go behind the line's ⋯ | filed (J-C rows) |
| 3c    | To-go + market: the pickup time asked ONCE (checkout); name + phone as the first checkout step with inline validation; manual barcode entry + "ask us"; undo on remove; the exit-pass QR                                               | filed            |
| 3d    | Staff: KDS text size and sound as bar controls; Team out from behind "Your PIN"; the walk-up sale in one screen (pad → pay without the bounce home); "Picked up" undo                                                                  | filed            |
| 3e    | Account features: history past 20 with a load-more; receipt actions on a row; a tappable favorite; pickup phone editable on You                                                                                                        | filed            |

## Scoring (RUBRIC J-axes, self-scored, before → after 3a)

| Path    | J-B progress clarity | J-C effort       | Note                                                            |
| ------- | -------------------- | ---------------- | --------------------------------------------------------------- |
| Dine-in | 3.5 → 4.3            | 4 → 4 (3b lifts) | the tab bar + the step rail answer "where am I" without reading |
| To-go   | 3.5 → 4.3            | 4 → 4 (3c lifts) | same                                                            |
| Grocery | 4 → 4.3              | 4 → 4            | one fewer route to checkout; the noun holds to the pay step     |
| Account | — → 4.3              | — → 4.3          | three panels, one tap each; sign-in visible; reorder on the row |

The counter home is scored on the O-axes by hand on a tablet (O-D rush behaviour: the zone strip is
the "+N more" of the console — nothing hides, everything is one tap).
