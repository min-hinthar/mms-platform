# W6B_PLAN — The kiosk shell (S5 · M6·P6.1 pulled forward)

**Status: building (2026-08-06).** Closes **S5** (kiosk mode seam absent). Design parents:
`docs/M6_DESIGN.md` §P6.1 (reuse-don't-fork, HID = keyboard wedge, no personal account) +
`docs/PRODUCTION_PLAN.md` §W6b. Terminal payment stays **W6c** — every kiosk order ends at
"pay at the counter", which is exactly W6a's register machinery.

Grounded by a five-reader map (entry/guard · session/idle · doors · checkout/handoff · touch/i18n).
The findings that shaped the design:

- **The `/board` pattern is the device-guard template**: token in the URL (`?k=`), bare
  `process.env` (unset ⇒ 503 feature-off, never a crash), `timingSafeEqual` before any read, the
  PAGE ungated ("the API is the gate"), `robots noindex`, `useWakeLock` for always-on.
- **There is NO diner-side session close and NO idle machinery anywhere** — the privacy reset is
  new server + client work, not composition.
- **A memberless (reg-style) session cannot drive client cart writes** (`assertCartMember` needs a
  membership row) — so the kiosk session must carry a member row for the kiosk device's anon uid,
  or every cart op becomes a bespoke service-role action.
- **A device-stable session key is the privacy bug**: pay-at-counter carts stay OPEN, so the next
  customer's find-or-create lands in the previous customer's live order. One session per order.
- **The KDS dine-in ticket dies when its session closes** — so kiosk dine-in sessions must NOT be
  closed at settle (the table is still seated); only counter-style kiosk sessions close.
- **The pre-payment handoff cannot show the `#CODE`** — the order id is minted AT settle. The
  kiosk handoff is name/tent-based; the `#CODE` + `/board` call-out take over after the counter
  settles (unchanged machinery).
- **`/api/session` will happily MINT a client-asserted `reg-` code today** — a spoof surface W6a
  left open (fake queue entries). W6b closes it: reserved prefixes can be JOINED (that is how the
  kiosk client attaches to its server-minted session) but never CREATED through `/api/session`.

## The session model

The kiosk is an ordinary anonymous client (AnonAuthGate mints one anon uid per device — **never
rotated per reset**: GoTrue anon sign-ins are capped 30/hour/IP shared with diner phones). Each
customer's order is a **fresh `kiosk-<code>` session minted server-side** by a device-token-gated
action, WITH a `session_members` row for the kiosk's uid — so `scanAdd`, `addItem`, `getCartView`,
and the whole diner cart machinery run verbatim. The client then attaches via the normal
`/api/session` join (the code is server-issued and unguessable; joins converge, mints of reserved
prefixes are refused).

| Door                                       | Session it mints                                                                                     | Firing / settle                                                                                                                                                                                         |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **To-go** (name capture)                   | `kiosk-<code>` · `mode='pickup'` · no table                                                          | Fires at counter settle (`mms_fire_pending_food` on the paid cart); session **closed** at settle                                                                                                        |
| **Grocery** (HID scan)                     | Same as to-go; lines are `fulfillment='grocery'` (never fire)                                        | Expo "Verified/Handed over" vocabulary unchanged                                                                                                                                                        |
| **Dine-in** (tent = registered table 1–99) | `kiosk-<code>`… no — **`mode='dinein'` + `table_number`** via the K2 registry resolve, `kiosk-` code | Food fires at settle (paid-cart branch covers dinein); session **stays active** (the table is seated; staff clear at turnover). Occupied table ⇒ refuse ("ask a server") — never show a stranger's cart |

`lib/kiosk.ts`:

- **`openKioskOrder`** — verifies the device token (`KIOSK_DEVICE_TOKEN`, `timingSafeEqual`),
  verifies the caller's anon auth (the seat), service-role mints session + membership + cart,
  writes `customer_name` at mint for to-go. No staffGate — the token IS the authority; no
  `/api/session` rate budget burned.
- **`kioskReset`** — the idle/finish privacy reset: verifies the token, verifies the session is
  `kiosk-`-prefixed (**the token can never close a diner or staff session**), closes it + cancels
  its open cart (the clearTable shape minus staffGate). Client side wipes `mms.qr.*`, `mms.name`,
  and kiosk state, then returns to attract. No payment-race guard needed in W6b (no diner-side
  charge exists; revisit at W6c).

## The register composes it

`getRegisterQueue` widens to `reg-% OR kiosk-%` (kiosk rows labeled "Kiosk"); the floor-board
exclusion widens the same way; `settleCash`'s session close applies to counter-style
(`mode='pickup'`) kiosk sessions only. A kiosk order is settled at the counter exactly like a
walk-up — tendered/change helper, lifted `#CODE` handoff card, `/board` call-out, all unchanged.

## The shell

- **Route**: `/kiosk` under the root layout (the repo's only layout — kiosk pages self-scope).
  `AppHeader`/`LendModeBanner` add `/kiosk` to their hide prefixes; `AnonAuthGate` keeps running
  (the kiosk needs the anon session). The page carries `?k=<token>` (the bookmark), threads it to
  the kiosk actions, `robots noindex`, `useWakeLock`.
- **Big-touch tier**: the `.kds-root`/`--kfs-*` precedent, literally — a `.kiosk-root` wrapper
  declaring a purpose scale (`--xfs-*` + `--xtap: 68px`) consumed by kiosk-only classes in
  `globals.css`. Global `--fs-*`/`--s*` are NOT remapped (most diner classes use literal px — a
  remap wouldn't reach them anyway).
- **Attract screen**: full-bleed brand moment, tap-anywhere, the two language tiles (EN / မြန်မာ)
  ARE the entry. Animation within the discipline (transform/opacity only, radial-gradient glows,
  CSS reduced-motion off-switch; no `useInView` — the layer is always visible).
- **EN/MY**: the attract choice sets the KIOSK CHROME language from a small local dictionary
  (`lib/kiosk/strings.ts`, ~30 pairs — attract, doors, review, idle modal, handoff), with a
  persistent header toggle. Menu/item data keeps the app's stacked-bilingual idiom (both always).
  ⚠️ The Burmese chrome strings need Min's native check (the K15/W5c pattern).
- **Idle reset**: activity listener (pointer/touch/key) → 45s idle → 15s countdown modal ("Still
  there?") → `kioskReset` → attract. The handoff screen **pins the timer** while visible for a
  grace period, then resets — the lifted-card lesson: never let a timer unmount the screen the
  customer is reading.
- **HID wedge**: a kiosk-scope keydown accumulator (buffer, flush on Enter or inter-key timeout,
  ignore focused inputs, its own repeat-scan dedupe) → the existing `scanAdd`. No grocery-flow
  change — the scanner is another input device.
- **Review + upsell + handoff**: the Checkout review-step pattern minus Stripe — server-derived
  totals, no tip (consistent: the counter settle records `tip_cents=0`), no rewards/promo/account
  UI anywhere in kiosk mode. Between review and pay: **exactly one** `goesWellWith` rail —
  anchor = last-added food line, pool pre-filtered to exclude every cart item id, capped 6,
  shown once per order. Then the handoff: "Pay at the counter — we'll call your name" (to-go) /
  "Take tent N to your table and pay at the counter" (dine-in), name via `setCartCustomerName`'s
  kiosk twin at mint.

## Hardening (new rules → mutants)

- `/api/session` refuses to **create** a session whose code carries a reserved prefix
  (`reg-`/`kiosk-`); joining an existing active one stays allowed. Closes the W6a spoof surface
  too.
- `kioskReset` scoped to `kiosk-` sessions in the statement (prefix predicate) — the device token
  is not a skeleton key.
- The token compare is constant-time and unset ⇒ the kiosk answers "not configured" (feature-off),
  copying `/board`.

## Deliberately out (registry rows / W6c)

- Terminal payment, reader tipping (W6c). Rewards/upgrade UI (never in kiosk mode — design).
- ADA screen-reader/high-contrast kiosk pass (M6 2027 task, per P6.1).
- Real-device validation of idle/reset timings (hardware-gated; C7).

## Slices

- **W6b·1** — `.kiosk-root` tier + `/kiosk` shell + attract (language tiles) + doors screen +
  chrome-hide prefixes + `KIOSK_DEVICE_TOKEN` env docs.
- **W6b·2** — `lib/kiosk.ts` (mint + reset, token-gated) + `/api/session` reserved-prefix refusal +
  the order screens (menu reuse · grocery scan + HID wedge · dine-in tent) + idle machinery.
- **W6b·3** — review + one-shot upsell + handoff; register queue/floor/settle widenings.
- **W6b·4** — guards + mutants (token gate, reset prefix scope, reserved-prefix refusal, queue
  widening) · docs sweep (S5 close) · gate · ONE capped review · PR.
