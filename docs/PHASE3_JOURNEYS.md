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
  **Menu · Order · Track · Account** — _amended by D7 (`docs/PHASE3B_DESIGN.md`, 2026-10-03): three
  places, Menu · Order · Account; the Order tab follows the order (open cart → live order → the bare
  slip), and the threshold lights nothing (D8)._ The header keeps the brand and the live-order chip/tray ONLY;
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
  existing anchor; the current zone is lit by a scroll/resize read (rAF-throttled, passive) of each heading's top against the strip's bottom edge — `lib/counter-zones.ts#currentZone` decides, the strip measures. Splitting the zones into
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

| Slice | What                                                                                                                                                                                                                                                                                                                                                                                            | Status                                                                                                                                                        |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3a    | The diner spine (D1 · D2 · D3) · the account hub (D4) · the counter map + up-link (D5) · D6's heading                                                                                                                                                                                                                                                                                           | **this PR**                                                                                                                                                   |
| 3b    | **Three places, one order** (`docs/PHASE3B_DESIGN.md`, D7–D12): the spine as Menu · Order · Account with the Order tab following the order; the threshold lights nothing; the door as a moment (`DoorSheet` on every menu and the market, absorbing `TableOptions`); the menu's thrown-away pickup pick retires; the pickup phone dies with the handover; the paid headline speaks both tongues | **built (PR after #312)**                                                                                                                                     |
| 3c    | Dine-in, two PRs: _3c-i_ (Checkout only) one hero verb per state, the undo lifted so the bill is live during the grace, Pay stating its reason, the Total row, the line ⋯ sheet, the table grid as a SECTION of the DoorSheet; _3c-ii_ (authority) the table bound at SEND time (`seatedSessionFor`, CAS bind, the register refusal), ideally after the partial unique index lands one-file     | 3c-i ✅ (2026-10-04, `docs/PHASE3C_DESIGN.md`) · 3c-ii ✅ (2026-10-05, `docs/PHASE3C_II_DESIGN.md`; its two migrations await the owner's apply — M260 · M258) |
| 3d    | Staff, two independent PRs: the kitchen's pass at two distances (Aa + bell as bar circles, the glance strip, the word "Late" in the badge — zero new strings); the counter's receipt stack (`taxCents` from `getCartTotals`) as a standalone S, then the cash-sheet re-host with a tablet in hand                                                                                               | filed (K38 · K39 · K-new)                                                                                                                                     |
| 3e    | To-go + account, decomposed: the Who/When slip (`lib/pickup-details.ts`, `payBlock`), contact messages named once, the ASAP chip inside the one sheet, the counter pass built once with the market's exit pass; reward terms from config, LA coupon expiry, the honest history foot, the receipt link on a row; the chip question as its own PR on the Stars-carry path                         | filed (J24 · 3e rows)                                                                                                                                         |
| 3f    | The craft coherence pass, LAST: bilingual empties through one `EmptyState`, the `said-once` guard, one paper on `/` and `/dine-in`, the post-pay stack ordered with the goodbye last, TierUp inline — over surfaces 3c–3e have settled; `<Bi>` only after D12 is ruled                                                                                                                          | filed (J25's prompts)                                                                                                                                         |
| —     | The market beyond the eyebrow (scan as a sheet, the basket dock, the miss ladder, Undo via a fresh `scanAdd`, the live pass) — parked until G1's real UPCs; XS keepers that need no G1: `queryKind` for a typed code, the Toast-action Undo on remove, the two 40px literals → tokens                                                                                                           | parked (G24 · G20 · G7)                                                                                                                                       |

## Scoring (RUBRIC J-axes, self-scored, before → after 3a)

| Path    | J-B progress clarity | J-C effort       | Note                                                            |
| ------- | -------------------- | ---------------- | --------------------------------------------------------------- |
| Dine-in | 3.5 → 4.3            | 4 → 4 (3b lifts) | the tab bar + the step rail answer "where am I" without reading |
| To-go   | 3.5 → 4.3            | 4 → 4 (3c lifts) | same                                                            |
| Grocery | 4 → 4.3              | 4 → 4            | one fewer route to checkout; the noun holds to the pay step     |
| Account | — → 4.3              | — → 4.3          | three panels, one tap each; sign-in visible; reorder on the row |

The counter home is scored on the O-axes by hand on a tablet (O-D rush behaviour: the zone strip is
the "+N more" of the console — nothing hides, everything is one tap).
