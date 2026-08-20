# 🚪 W9 — Journeys that finish (the happy-path + craft close)

**Plan-of-record for the W9 arc.** Produced 2026-07-31 by a 14-agent audit: six walkers took the
customer journeys screen by screen through the code, three craft lenses swept the diner surfaces
(design-system fidelity vs the v7.2 prototype · microcopy/brand-voice/bilingual honesty · mobile
ergonomics + first-run comprehension), a triage pass deduped, and three adversarial verifiers with
distinct refutation lenses (reachability · code-truth · regression-risk) tried to kill each finding.
**84 raw → 32 deduped → 24 CONFIRMED + 8 downgraded to OVERSTATED, 0 refuted.**

Read with [`docs/HANDOFF.md`](HANDOFF.md), [`docs/OPEN-ITEMS.md`](OPEN-ITEMS.md) (the registry),
[`docs/W8_PLAN.md`](W8_PLAN.md) (the test harness several W9 fixes are gated on), and `CLAUDE.md`.

---

## 0 · Verdict

The money machinery is genuinely sound and the verifiers proved it: server-authoritative pricing,
RLS, webhook-idempotent fulfillment, the TTL-derived lock/settle model and the tax engine all
survived adversarial reading, and the refutation pass downgraded five findings rather than upgrading
any. What does not hold is that **not one diner journey is finished end to end**. Dine-in solo: the
Add pill is dead and silent through the whole session mint, the sheet's ✕ scrolls out of reach on
any dish with modifiers, back-swiping off the pay step strands the cart server-locked for five
minutes with the menu telling the party "you're checking out" about someone who left, /track labels
the table "To-go" and runs a four-step rail that can never advance past step 1, and the single
forward link on that screen mints a brand-new scan-and-go session. Pickup: two controls that only
make sense at a table render on every cart — one of them permanently locks the line out of editing
and back-dates a scheduled 6 PM order to cook now. Grocery: the default door has no basket review at
all. Split: a diner who joins during the freeze gets a board with no row of her own and no string
anywhere in the app for that state. Post-pay: a server clearing the table for the next party —
routine turnover, no PIN — kills /track in minutes and tells the diner their paid meal "hasn't
appeared yet."

On craft the fundamentals are real and consistently applied — token purity, `prefers-reduced-motion`
gating, one live region per view, and comments showing people actively reasoning about WCAG 2.4.3
focus loss. Nothing worth filing was a hardcoded color. The gap is geometry and copy anchoring. The
add-confirmation toast is a bare `bottom: 84` with no safe-area term, so on every notched iPhone it
overlaps the clay cart bar at the app's single highest-frequency moment; `.mms-sheet` is the one
unbounded overlay in an app whose every page column is capped at 440; the sheet's ✕ is absolutely
positioned inside its own scroll container, so it and the swipe handle both scroll away; the
prototype's visible `Add a little extra?` tip heading was dropped, leaving an aria-label with no
visible match. And several strings promise what the code does not deliver — "ready in about 12 min"
four sections above the control that scheduled the order for tomorrow, "we'll call your name when
your order's up" to a shopper holding their own bagged groceries, and a loud gold "Save 25%" pill on
306 of 396 SKUs. The unenforced 153 px font-sizes in `globals.css` are real but the least urgent
thing on this list.

## 1 · The theme

The app already computed the answer and drops it at the last hop. Mode, `locked`, `settling`,
`loading`, the server's own error reason, the kitchen note, the item's Burmese name, the per-seat
tax weight — every one is derived correctly server-side and then simply not passed to the component
that renders the screen (`view.locked` never reaches `<Checkout>`; `loading` is on the cart context
and no call site destructures it; `error` isn't destructured from the rewards RPC; `notes` isn't in
reorder's SELECT; `?mode=` isn't on six `/menu` links). These are not logic bugs, they are one-line
omissions at a prop boundary — which is why they are cheap to fix and exactly why they compound into
dead ends.

---

## 2 · The slices

### W9a — One door, carried all the way through — mode identity from scan to reorder &nbsp;`L`

**Why:** A diner who pays at the table and taps the one forward link stops being a dine-in diner; a takeout diner stops being asked table questions; /track stops calling Table 4 "To-go".

**Findings:** bare-menu-links-drop-mode, join-code-mints-phantom-table, for-here-toggle-on-pickup-cart, make-it-now-on-pickup-cart, grocery-checkout-promises-pickup, made-fresh-copy-on-scheduled-pickup, track-labels-dinein-togo

**Files:**

- `apps/qr/lib/menu-href.ts`
- `apps/qr/lib/useTableSession.ts`
- `apps/qr/components/GuestList.tsx`
- `apps/qr/components/Checkout.tsx`
- `apps/qr/components/OrderTracker.tsx`
- `apps/qr/app/track/page.tsx`
- `apps/qr/app/account/page.tsx`
- `apps/qr/components/OrderHistory.tsx`
- `apps/qr/app/cart/page.tsx`
- `apps/qr/eslint.config.mjs`

**Changes:**

- LAND FIRST (the two fixes are coupled): `lib/useTableSession.ts:36-37` — delete the
  `localStorage.setItem(DINEIN_KEY, code)` from `resolveQrCode`; persist only after a 200,
  alongside the existing post-mint persist at :150. A rejected code can then never drive the next
  mint, nor a later bare `/menu?mode=dinein`.
- `components/GuestList.tsx:41-53` — surface the server's own reason instead of collapsing to
  "Couldn't join this table." Make the 404 (`No table found for that code`,
  app/api/session/route.ts:120) TERMINAL like the party-full arm, with an "Enter a different code"
  action re-opening the existing JoinTable sheet. Keep `window.location.reload()` only for a
  transient arm (offline / 5xx). Stays a plain `role="alert"` paragraph — the provider's `flash`
  remains the view's single live region.
- New `lib/menu-href.ts`: `menuHref(mode)` → `/menu?mode=…`, `/grocery` for scango, and `/` (the
  door picker) when the mode is genuinely unknown. Replace the six reachable bare literals:
  OrderTracker.tsx:661, track/page.tsx:96 + :138, account/page.tsx:107, OrderHistory.tsx:62,
  cart/page.tsx:28. Client links read `useActiveOrder().mode`; server-rendered ones thread the
  tracked order's own mode (preferred over the persisted last-door). The scango→`/grocery` arm
  also closes G13.
- `components/Checkout.tsx:723` — add `&& !isTakeout` to the For-here/To-go `role="group"`.
  `Checkout.tsx:752` — add `&& !isTakeout` to "Make it now". Both flags already exist at :195.
  Treat a NULL `splitContext` as unknown-mode and HIDE both (cart/page.tsx:37-41 nulls it on a
  read failure — do not fall through to dine-in).
- `components/Checkout.tsx:800-808` — gate the "Made fresh when you check out — ready in about
  {prepMinutes} min" paragraph on `!initialPickupSlot`, NOT on `!isPickupMode`: an ASAP-snapped
  cart deliberately passes null (cart/page.tsx:57-58) and the copy is true there.
- `components/Checkout.tsx:881-920` — gate the "First name for pickup" block on `isTakeout &&
!pureGrocery` (the discriminant already suppresses the tip ask at :955 and the SB-1524 copy at
  :943). Confirm expo + /board fall back to the short code with no empty name slot.
- `components/OrderTracker.tsx:212` — add a dine-in arm keyed on the order snapshot's own `mode ===
"dinein"` (NOT `tableNumber != null`; board/route.ts:66-68 records unregistered stickers stamp
  null). `modeLabel` → `Table ${n}` when a number exists, else `Dine-in`. Suppress the step rail
  only when `!order.hasTogoFood` so a mixed table keeps a truthful rail; replace the :658 promise
  with "Paid in full — thanks for dining with us." Route the word through `liveOrderStatusWord`
  (lib/live-order.ts:31-45) so the header pill and /track cannot drift again.
- Replace the inline-styled ~20px link at cart/page.tsx:28 with the repo's `nav-link-strong`
  primitive (as used at track/page.tsx:117/:138) at ≥44px. New copy checked verbatim against
  docs/prototype/v7.2.html; tokens only (`--warn`, `--ac`, `--fs-*`); no new animation, so no
  reduced-motion switch needed.
- Add the ESLint ban on the bare `"/menu"` string, scoped to JSX `href` + `router.push` the way F3
  scoped its numeric-fontSize ban — it must NOT flag TransitionNav.tsx:22 (route-depth map) or
  AppHeader.tsx:96 (pathname compare).

**⚠️ Regression watch** (each drawn from a verifier's `fix_risk` — this repo's owner rates
regressions the #1 frustration):

- The generic reload IS the only recovery for a transient mint failure (offline, route.ts:206/259) —
  keep a non-terminal arm or a network blip strands the diner.
- Deferring the DINEIN_KEY write must not break re-join-on-reload for the `?t=` sticker path
  (persisted at :150) or the host-start mint, which returns a server-generated code.
- `isTakeout` derives from `splitContext?.mode`, which cart/page.tsx:37-41 nulls on any read failure
  — a naive `!isTakeout` gate silently reopens both pickup controls.
- `ActiveOrderProvider`'s persisted mode is the LAST door used on the device; a two-door diner gets
  routed to the wrong session. Prefer the tracked order's mode, fall back to `/`, never guess.
- Ordering is load-bearing: `/menu?mode=dinein` with no `?t=`/`?j=` re-mints from DINEIN_KEY, so the
  localStorage fix must land before the link fix or the post-pay link hands a diner into a phantom
  table.
- `pureGrocery` comes from the OPTIMISTIC `viewItems` — gating the name field on it can unmount a
  focused `#pickup-name` mid-edit and drop focus to `<body>`.
- OrderTracker's `<ul>` is the `useInView` ref target (:55-58) with a documented accepted stuck-
  pulse edge; adding another exclusive branch alongside the pureGrocery (:346) and refunded arms
  risks two rendering or none.
- The ESLint literal ban going red on TransitionNav/AppHeader would fail CI on correct code.

### W9b — Every dead control says why — lock, settle, mint and slot-load states &nbsp;`L`

**Why:** No screen in the app goes read-only or silently disabled again without naming the reason and offering the way out.

**Findings:** pay-step-not-a-history-entry, cart-review-never-reads-locked, menu-guest-not-told-about-split, session-mint-window-no-state, late-joiner-has-no-share, board-freezes-after-takeover, stale-settlement-strands-holds, slot-sheet-no-failure-state

**Files:**

- `apps/qr/components/Checkout.tsx`
- `apps/qr/app/cart/page.tsx`
- `apps/qr/components/TableCartProvider.tsx`
- `apps/qr/components/GuestList.tsx`
- `apps/qr/components/AddButton.tsx`
- `apps/qr/components/ItemSheet.tsx`
- `apps/qr/components/TableTimeline.tsx`
- `apps/qr/components/SettlementBoard.tsx`
- `apps/qr/components/SplitSection.tsx`
- `apps/qr/components/PickupSlotSheet.tsx`
- `apps/qr/lib/pickup.ts`

**Changes:**

- Pay-step back: do NOT pushState on the same `/cart` pathname — cart/page.tsx:71-72 and
  track/page.tsx:58-60 already document the ~4s view-transition popstate hang that causes. Instead
  (a) add an explicit "← Back to review" control at the top of the mounted pay step calling the
  existing `editOrder()` (Checkout.tsx:474-486) at ≥44px with `nav-link-strong`, and (b) add a
  `pagehide` `navigator.sendBeacon` release to a new thin `POST /api/cart/release-lock` route
  (`releasePayLock` is a Server Action and beacons need a real endpoint). Do NOT release on plain
  `visibilitychange`.
- Thread `view.locked` / `view.lockedBy` from cart/page.tsx:83-95 into `<Checkout>` and track them
  in `refresh()` (Checkout.tsx:229-234). Render the v7.2 `.lockbar` treatment above the line list
  ONLY when `lockedBy !== mySeat` and `step === "review"`, and set `aria-disabled` on the steppers
  / promo / tip while locked so a refused edit is a disabled control rather than the silent snap-
  back at :314-318.
- `TableCartProvider.tsx:487` — add a `settling` EDGE announcement alongside the existing
  `prevLocked` diff, into the SAME single live region, with the same edge discipline so a guest
  arriving at an already-settling table isn't announced-at on mount; suppress it on `/cart`, where
  the keyed view swap + focus move (Checkout.tsx:264, :287-289) already announce it.
- `GuestList.tsx` — add a settling banner variant with a direct `/cart?cart=…` link, placed AFTER
  the `!me` branch (:39-53) so it cannot shadow the join-failure recovery W9a just built.
  `AddButton.tsx:303-309` — extend the `aria-label` to name the settling state (today an SR user
  hears "Add Tea Leaf Salad to your order" on a disabled pill).
- `TableTimeline.tsx:167` — stop folding `settling` into `quiet`; keep the link rendered and swap
  its copy to "Pay your share" so it points at the board instead of inviting edits on a frozen
  cart.
- `AddButton.tsx` + `ItemSheet.tsx` consume the already-exposed `loading`
  (TableCartProvider.tsx:502, destructured by zero call sites): during the mint window render the
  pill `aria-busy` with a "Setting up your table…" accessible name. Do NOT relax
  `blocked`/`inactive` — a tap reaching `add()` with `cartId === null` surfaces the session-
  recovery banner for a non-error (M10).
- `SettlementBoard.tsx` — (a) diff `ctx.members` against `shares` and render an explicit READ-ONLY
  branch for a member with no row: "You joined after the split started — ask {host} to restart the
  split, or pay together." (b) Move `loadError` out of the `!loaded` gate (:186-206) so a post-
  first-load failure is visible; discriminate server-side with a typed result (`{ ok:false,
reason:'settled'|'not_member'|'error' }`) — only `reason:'settled'` may route to `/track`.
- `SplitSection.tsx:77-79` — call `onChanged()` in the CATCH as well as the try: `openSettlement`
  acquires the freeze at split.ts:107 then throws at :121, so the server state changed and a
  refresh is exactly what restores the board. Do NOT release the freeze.
- `lib/pickup.ts:19` — give `getPickupSlots` a discriminated result (`{ ok:true; slots } | {
ok:false }`) and update BOTH PickupSlotSheet call sites (:36 and the post-failure re-list inside
  `choose()` at :66). Add a third branch above PickupSlotSheet.tsx:119: a `role="alert"` "Couldn't
  load pickup times" card with a 44px "Try again" re-running the fetch in place. Keep the calm "No
  pickup times available right now" copy for `ok:true` with zero slots.

**⚠️ Regression watch** (each drawn from a verifier's `fix_risk` — this repo's owner rates
regressions the #1 frustration):

- A duplicate same-pathname history entry on `/cart` reintroduces the documented ~4s popstate hang
  on the highest-traffic money screen.
- Releasing the pay lock on `visibilitychange` drops it every time a diner app-switches to a wallet,
  re-opening the peer-mutation-mid-checkout hole the lock exists to close.
- Gate the review lockbar on `lockedBy !== mySeat`, not `locked` — the payer holds their own lock
  while standing on the pay step and on the settle view.
- `refresh()` is deliberately scoped to exclude pay-step state (Checkout.tsx:225-227) so a mid-
  payment refetch can't disturb the mounted Stripe Element — widening what it writes must not re-
  render the Elements host.
- Do NOT add an "Unlock and edit" that calls `releasePayLock` from the review step: it would drop a
  lock while the diner's own PaymentIntent is live on another tab.
- Do NOT top up the split ledger for late joiners — `mms_fulfill_split_order` hard-raises when
  Σ(captured) ≠ expected. Read-only copy only in this slice.
- Do NOT release the stale freeze on the in-progress throw — `releaseSettlement` unfreezes every
  cart-mutation guard (cart.ts:49/116/157/226/283/330/397/448/476) under live PIs.
- The board's terminal branch must key on a SERVER-side typed reason: Server Action errors are
  redacted in prod (Checkout.tsx:238-241), so a blip is indistinguishable from a 403 and would
  eject mid-authorization payers to a receipt that doesn't exist yet.
- `GuestList`'s `if (locked)` early-return precedes the `!me` recovery branch — a settling early-
  return placed alongside it shadows "Couldn't join this table" / the party-full copy.
- AddButton's disabled-vs-aria-disabled split is load-bearing for FOCUS (sold-out is deliberately
  focusable for restoration after removal; transient states deliberately are not) — a tab stop
  that appears then relabels itself mid-session must not break the item-sheet focus-return path.
- A genuinely sold-out pickup day must keep the calm copy, not a red "Try again" that can never
  produce a slot.
- `getPickupSlots`'s second call site inside `choose()` must change with the first or the slot grid
  renders a result object.
- Every new banner must be plain static text or share the one existing live region — G15 already
  tracks live-region seams.

### W9c — Your paid order stays yours — post-pay reachability and an honest history &nbsp;`M`

**Why:** A paid meal stops disappearing when a server clears the table, and /account stops inventing a zeroed rewards state or silently dropping an allergy note.

**Findings:** track-dies-when-table-cleared, paid-cart-placeholder-dead-end, stale-confirming-pill, rewards-error-swallowed, reorder-drops-allergy-note

**Files:**

- `apps/qr/components/OrderTracker.tsx`
- `apps/qr/lib/orders.ts`
- `apps/qr/lib/rewards.ts`
- `apps/qr/components/TierUpCelebration.tsx`
- `apps/qr/components/useActiveOrderStatus.ts`
- `apps/qr/components/AppHeader.tsx`
- `apps/qr/app/cart/page.tsx`
- `apps/qr/lib/reorder.ts`
- `apps/qr/components/menu/MenuBrowser.tsx`

**Changes:**

- /track server fallback: when the `is_member`-gated client read yields nothing (session closed by
  `clearTable`, floor.ts:414-418, or past the 4h TTL), fall back to the uid-scoped `earned_by =
auth.uid()` read `getOrderHistory` already uses (rewards.ts:342-351) — it survives session
  close. Keep it uid-scoped; NEVER key the fallback on the PaymentIntent id, which would hand a
  live tracker to whoever holds the URL.
- Handle the known split gap explicitly: `rewards.ts:158` stamps only the HOST as earner, so a non-
  host share payer still resolves nothing — give that case its own honest copy rather than the
  false-alarm card.
- `OrderTracker.tsx:530-537` — rewrite the timedOut copy so it stops asserting the order is missing
  ("your order just hasn't appeared here yet" about a paid, eaten meal), and render the `/account`
  link in that branch. Do NOT drop the `arrived &&` gate at :671 wholesale — the :668-670 comment
  records it is decided once at mount so it can't vanish underfoot and drop focus to `<body>`
  (WCAG 2.4.3); compute the new branch once alongside `arrived`.
- `app/cart/page.tsx:12-32` — discriminate on `AuthzError.status` but keep unknown-cart (404) and
  non-member (403) INDISTINGUISHABLE so cart ids stay un-enumerable. Give the paid-cart and
  expired-session cases their own honest copy. Any `qr_carts.status` read must stay MEMBER-GATED —
  do not service-role read before membership is established. Route the exit through W9a's
  `menuHref()` with `nav-link-strong` at ≥44px.
- `useActiveOrderStatus.ts` — surface the `timedOut` that `useOrderStatus` already computes (:34,
  :168) and use it to fix the PILL LABEL only: stop falling back to "Confirming" at :88 when
  `tracked` is null. Do NOT call `clearOrder()` on `timedOut` (a slow webhook would wipe the only
  route back to a split order's /track, which has no `payment_intent` in any URL) and do NOT
  prefer `liveOrders` over the client record at AppHeader.tsx:106-107.
- `lib/rewards.ts:56` and `:122` — destructure `error` from the `mms_rewards_summary` RPC and
  `return null` on error, so /account renders its existing honest alert and the header shows the
  plain "Rewards" label. Do NOT extend this to `if (!data) return null` — a brand-new diner
  legitimately has no row and the `?? 0` fallbacks at :88-92 are what render their first visit.
- `TierUpCelebration.tsx:47-56` — skip the `SEEN_KEY` baseline write (currently at :52, "regardless
  of outcome", before the comparison at :56) when the incoming tier is the zeroed `new` default,
  or pass a `loaded` flag. Otherwise one failed load fires a full-screen "Tier unlocked · Gold"
  confetti overlay on the next healthy visit for a climb that never happened. Keep its `prefers-
reduced-motion` off-switch intact.
- `lib/reorder.ts:93` — add `notes` to the SELECT (it IS snapshotted at fulfillment,
  w3_kitchen.sql:352-353) and pass `notes: l.notes ?? undefined` at :147-159, re-clamped to the
  same Zod 160 + column CHECK the add path enforces. Keep the `p_notes`-only-when-truthy spread
  (order-lines.ts:167) for deploy-order safety. Add a `notesDropped: string[]` arm to
  `ReorderResult` and a branch in MenuBrowser.tsx:173-206 alongside `optionsReset`, so a dropped
  allergy note is stated out loud — ItemSheet.tsx:266 promises "add any allergy in the note below
  and the kitchen will see it."

**⚠️ Regression watch** (each drawn from a verifier's `fix_risk` — this repo's owner rates
regressions the #1 frustration):

- `earned_by` is host-only on split tenders — the uid-scoped fallback must not be silently assumed
  to cover share payers, and a PI-keyed fallback would bypass the only authorization /track has.
- The `arrived &&` gate exists to stop the /account link vanishing underfoot when the progress poll
  resolves (focus drops to `<body>`) — decide the branch once at mount.
- Discriminating AuthzError statuses re-opens cart-id enumeration; 404 and non-member must render
  identically, and no service-role cart read may happen before membership.
- `timedOut` also fires on legitimate slow fulfillment — `useOrderStatus` gives up polling at ~30s
  but deliberately keeps its Realtime subscription open, so a `clearOrder()` there destroys a
  just-paid split order's only route back.
- `clientLive` outranks the server list on purpose (AppHeader.tsx:100-104 — the pill shows instantly
  on pay); inverting it makes the pill blink out in the seconds right after payment.
- Respect the hook's single-subscriber `track` gate (:22-24) and the `resolved.cartId === cartId`
  guard (:62-65) so a stale id can't retire the next order.
- `if (!data) return null` in rewards would replace every brand-new diner's hub with an error state.
- `getRewardsBadge` feeds the persistent header on every route — verify its null branch renders the
  plain label rather than collapsing and shifting layout.
- Carrying notes changes reorder MERGE semantics (order-lines.ts:118-133: a noted line never merges
  in either direction), so three identical noted lines now insert three rows instead of folding
  into one — the qty-1-per-line reorder contract shifts.
- An un-reclamped legacy note over the 160 cap raises inside `mms_cart_item_insert_if_open` and
  turns the whole reorder into "Your cart just closed."

### W9d — The market reads like a market — Browse basket, honest sale badge, honest expo &nbsp;`M`

**Why:** A shopper on the default door can finally see what's in their basket, a "Save 25%" pill means something again, and staff stop being handed phantom bagging work.

**Findings:** browse-door-has-no-basket, paid-cart-strands-grocery-page, sale-pill-blankets-the-market, scango-fakes-a-bag

**Files:**

- `apps/qr/app/grocery/page.tsx`
- `apps/qr/components/grocery/GroceryBrowse.tsx`
- `apps/qr/components/grocery/GroceryItemSheet.tsx`
- `apps/qr/lib/grocery.ts`
- `apps/qr/components/staff/ExpoBoard.tsx`
- `supabase/data/grocery_catalog.json`

**Changes:**

- Browse basket review: expand the fixed `.grocery-cta` (grocery/page.tsx:699-721) into a bottom
  sheet listing the same `lines` rows plus the W4e savings line and the W4a EBT subtotal. Do NOT
  drop the `hidden={tab !== "scan"}` on the `<ul>` at :619-620 — those rows carry their own
  steppers and would duplicate the per-card steppers at GroceryBrowse.tsx:336-356, doubling
  accessible names and racing the `busyLine` one-op lock. `hidden` is deliberate so focus and the
  removed-row focus-parking survive a tab switch. The sheet reuses the same `onStep` path, uses
  the shared `.mms-sheet` primitive with `role="list"` rows, ≥44px steppers, and NumberFlow on its
  total matching the CTA's rolling figure.
- Stranded basket: land a discriminated result on `scanAdd` / `getGroceryLines` FIRST (`{ ok:false,
reason:'cart_closed'|'session_expired' }`) so grocery/page.tsx can tell "expired, re-mint" from
  "paid, offer a fresh basket". Then stop blaming the connection in the blanket catches at
  :207-209 and :172-173, and pull `revalidate` out of `useTableSession` at :33 (it is returned at
  useTableSession.ts:168 and currently discarded, while TableCartProvider.tsx:415-419 / :459-467
  deliberately call it for exactly these failures).
- Re-render the pre-hydration truth strip whenever a sync 403s even with stale lines on screen — its
  gate at :554 (`cartId && !hydrated && !lines.length`) makes it structurally unreachable in the
  failure case it exists for.
- Sale pill: replace the inert `sale.pct >= 15` gate (306 of 396 SKUs clear it; grocery-
  aisles.ts:53-56 even notes the catalog floors at 10%) with an explicit `is_featured_deal` column
  — a per-aisle percentile would move the badge between SKUs on every catalog refresh, which is
  worse for trust than a constant rule. Land the column + `pnpm gen:types` regeneration, backfill
  a bounded set, gate BOTH GroceryBrowse.tsx:268 and GroceryItemSheet.tsx:131-135, and move the
  accessible-name suffix at GroceryBrowse.tsx:256 with it (today it announces "on sale, compare at
  $X, save N%" ungated). Keep the quiet inline "Compare at $X" at :302-306 on every genuine
  discount — that is the honest surface.
- Expo vocabulary only: on a PURE-grocery order, ExpoBoard.tsx:175/:207 should read "Verify ·
  #{shortCode}" / "Handed over" rather than "Bag for {callOut}" / "Bagged & ready", and the header
  count at :110-111 should not fold it into "N bags waiting". Do NOT touch
  `mms_init_togo_status`'s predicate (see deferred).
- Re-check the G16 owner note in docs/OPEN-ITEMS.md once the featured-deal set is chosen — it is
  currently marked done with an unresolved "confirm the compare-at reads fairly."

**⚠️ Regression watch** (each drawn from a verifier's `fix_risk` — this repo's owner rates
regressions the #1 frustration):

- Un-`hidden`ing the `<ul>` on Browse yields two stepper sets per item, duplicate accessible names,
  a doubled focus order, and both racing the one-op `busyLine` lock so a tap silently no-ops the
  other.
- `revalidate()` sets session null → `cartId` null → `<BarcodeScanner>` (grocery/page.tsx:538-540)
  unmounts, tearing down the camera stream and re-firing the permission/stream setup mid-shop.
- A re-mint against an unreadable cart find-or-creates a BRAND NEW open cart
  (api/session/route.ts:276-282) — any lines the shopper couldn't see are silently abandoned
  unless the reason is surfaced first.
- Tightening only the visual pill while GroceryBrowse.tsx:256 stays ungated widens an existing
  sighted/SR divergence — both move together.
- Adding a basket sheet must not create a fourth live region: G15 already tracks the sync-failed
  alert, the Browse catalog-failure alert and the status toast co-rendering.
- The `is_featured_deal` column is a schema change — it needs a guarded, idempotent migration and a
  committed `types-fresh` regeneration or the migrations-check job fails.
- Do NOT narrow `mms_init_togo_status` in this slice (see deferred) — it breaks the 24h reconciler
  and removes the only staff-side door handle.

### W9e — Chrome that stays where it belongs — safe-area, sheet bounds, sticky exit, the missing tip heading &nbsp;`M`

**Why:** The highest-frequency moment in the app (adding a dish) stops looking like a rendering glitch, and every bottom sheet gets a reachable ✕ and a 440px column like the page under it.

**Findings:** toast-collides-with-pinned-cta, sheet-exit-chrome-scrolls-away, mms-sheet-unbounded, sb1524-above-points-at-fees, type-scale-css-unswept

**Files:**

- `apps/qr/components/TableCartProvider.tsx`
- `apps/qr/app/globals.css`
- `packages/ui/src/sheet.tsx`
- `apps/qr/components/Checkout.tsx`

**Changes:**

- Toast safe-area: `TableCartProvider.tsx:597` → `bottom: calc(84px + env(safe-area-inset-bottom,
0px))`, and `globals.css:4202` `.grocery-toast` → `calc(90px + env(safe-area-inset-bottom,
0px))`. `viewportFit: "cover"` (app/layout.tsx:73-75) guarantees a non-zero inset, and
  CartBar.tsx:37-45 already composes it — this is a pure omission. Do NOT refactor to a shared
  `--pinned-bar-h` var in this PR.
- Sticky sheet head: group `.mms-grab-zone` + `.mms-sheet-title` + `.mms-sheet-close` (already
  siblings at packages/ui/src/sheet.tsx:118-125) into one `.mms-sheet-head` that is `position:
sticky; top: 0; z-index: 2; background: var(--pg)`, mirroring how `.item-cta-bar` already pins
  the CTA at globals.css:1246. Re-derive `.mms-sheet-close`'s `top: 6px` / `right: 10px` against
  the new containing block so the 44×44 padding + `background-clip: content-box` trick still lands
  the visible disc at the v7.2 32px. Verify `.mms-grab-zone`'s `touch-action: none` still starts
  the framer drag from inside a sticky row; if the browser reclaims the gesture, keep the grab
  zone in normal flow and stick only title + close. Closes the QA §A P0 line "Each sheet has a
  visible, labelled ✕ close (not Esc/scrim only)."
- Sheet width cap: `.mms-sheet` (globals.css:70-73) → `max-width: var(--w-content); margin-inline:
auto;` with `inset-inline: 0`, matching the 440 cap every host page already uses
  (MenuBrowser.tsx:332, grocery/page.tsx:341, Checkout.tsx:495/566). Center with AUTO MARGINS,
  never `translateX(-50%)` — framer writes `transform` on the same element for `drag="y"`. Keep it
  at exactly 440 so ItemSheet.tsx:222 / GroceryItemSheet.tsx:141's `sizes="(max-width:440px)
100vw, 440px"` stays correct. Add the side radii (`border-radius: var(--r-sheet) var(--r-sheet)
0 0` reads as a broken card once the sheet no longer touches both edges), and scope the cap away
  from the staff `LossActionSheet` or accept the narrower staff sheet deliberately.
- Restore the prototype's visible tip heading: insert `<h3 id="tip-h">Add a little extra?</h3>`
  above Checkout.tsx:957 — verbatim from docs/prototype/v7.2.html:418, where a grep across apps/qr
  confirms the string does not currently exist — and swap the group's `aria-label="Add a tip"` for
  `aria-labelledby="tip-h"` so accessible name and visible name match (QA §A). LEAVE the SB-1524
  disclosure ABOVE the tip ask: moving it back to the prototype's position re-opens the F9 double-
  ask arm W2d deliberately closed (Checkout.tsx:922-926 is the record of that trade).
- One type-scale fix, not the sweep: `.slot-soonest-tag` (globals.css:922) is `font-size: 9px`,
  below the scale's own `--fs-xs` floor of 11px (packages/ui/src/tokens.css:33), on a diner-facing
  pickup surface — raise it to `var(--fs-xs)`.

**⚠️ Regression watch** (each drawn from a verifier's `fix_risk` — this repo's owner rates
regressions the #1 frustration):

- `--z-toast: 50` deliberately beats `--z-sheet: 45` so notices float above an open sheet — raising
  the toast's bottom offset pushes it INTO the sheet body, and the sheet itself rises with `--kb-
inset` while the allergy-note field is focused. Verify the toast never covers "Add to order"
  mid-typing.
- Do NOT introduce a `--pinned-bar-h` custom property: a bar-height var read before it is written is
  0 at first paint, so the toast and CTA jump on hydration (`--header-height` / `--lend-offset`
  already drive the error banner and rail offsets).
- Re-parenting `.mms-sheet-close` changes its containing block and breaks the `background-clip:
content-box` 44×44/32px trick unless the offsets are re-derived — the disc lands 6px off
  otherwise.
- A second sticky band eats scroll height on short viewports where ItemSheet already sticks `.item-
cta-bar` at the bottom with the keyboard up.
- Moving `.mms-grab-zone` into a sticky, scroll-adjacent row risks the browser reclaiming the
  gesture and killing swipe-to-close outright — it is the ONLY drag origin
  (`dragListener={false}`).
- `.mms-sheet` is shared with staff `LossActionSheet` on a 15.6" landscape KDS touchscreen; a
  blanket `var(--w-content)` cap narrows it there.
- Do not break `max-height: calc(var(--sheet-max-h) - var(--kb-inset))` or the VisualViewport
  keyboard lift (globals.css:75-83, sheet.tsx:74-96).
- Inserting the `<h3>` lands inside the `viewKey`-keyed subtree that owns Checkout's on-view-change
  focus move (:264, :287-289) — the group's accessible name and the focus target must survive a
  realtime `settling` flip.
- Checkout.tsx is ~1300 lines under file-size discipline — if the edit forces an extraction, keep
  `tipPreview` / `effectiveTipRate` (:181-189, :425) untouched; they sit one line from create-
  intent's rate.

---

## 3 · Deliberately deferred (do NOT build these now)

- **The SQL back-stops on `mms_fire_line` and `mms_set_line_fulfillment`** (a session-mode join
  returning `not_dinein`). W9a's client gates remove the only reachable path, and these two RPCs
  are load-bearing: `mms_set_line_fulfillment` is the ONLY place a line's `tax_cents` is
  recomputed after insert (cold food flips taxability), and `mms_fire_line` is the only early-fire
  path S4.2 legitimately needs for dine-in to-go lines. Both return text reasons the caller
  swallows entirely (Checkout.tsx:348-363, :369-378), so a botched join or WHERE would silently
  kill the dine-in feature with NO error surface anywhere. Land it after T1 gives cart/tax/split
  executable coverage. Residual risk accepted: a stale cached client could still call the ungated
  RPC.

- **`split-preview-diverges-from-charge`** — swapping `computeShares` for `deriveShareBreakdowns` in
  the preview. The finding is correct and the arithmetic reproduces ($22.46/$22.46/$22.46/$22.47
  previewed vs $21.00/$22.95/$22.95/$22.95 charged), but the fix visibly moves EVERY existing even
  split by 1-2¢ — with NumberFlow rolling the change — for tables that have nothing to do with the
  bug, and it must mirror split.ts:141's `state !== 'voided' && !comped` filter or it trades a tax
  divergence for a voided/comped one. T1 records zero coverage on `split-math` / `split` /
  `totals` / `tax`, and a penny-distribution regression in `allocate` breaks the sum invariant
  `mms_fulfill_split_order` hard-raises on. Make it the first consumer of W8's split-math suite.
  CHEAP INTERIM that can ride W9b: soften the false caveat at SplitSection.tsx:209-211 from "Each
  person's share of the order, including tax & service" to an approximate framing — one line, zero
  math touched.

- **`money-path-drops-existing-burmese` (S2 / F6, already planned:W5).** The novel evidence is right
  — `name_my` is fetched at menu/page.tsx:113 and discarded at order-lines.ts:36/58/73 — but the
  "cheap slice" isn't cheap. `qr_cart_items.modifiers` is simultaneously the line-MERGE key
  (order-lines.ts:15/141), the KDS/expo/`/board` chip source (kitchen.ts:117/183) and the
  immutable order snapshot: widening it makes identical adds stop merging (shifting per-seat
  weights in `computeShares`) and can print Burmese onto tickets line cooks read in English. The
  only safe shape is a NEW nullable `name_my` carried alongside with `name`/`modifiers` byte-
  identical — a schema + snapshot change, i.e. W5's job. The fixed-string translations (kitchen-
  note label, SB-1524 paragraph, /track step titles) must route through K15 for Min's native
  check; do not ship Claude-authored Burmese onto the allergy channel.

- **The full 153-declaration `globals.css` type-scale sweep + stylelint (F3).** Converting to
  `--fs-*` CHANGES rendered sizes (22px→21px, 14px→13px, 24px has no exact step), shifting every
  diner screen 1-3px at once — the silent layout-twitch class this owner rates worst. A mechanical
  sweep would also map KDS px onto the smaller diner tier, shrinking ticket type at the pass,
  which F3 deliberately avoided by keeping kitchen reads on `--kfs-*`. Adding `lint:css` to the
  turbo gate turns 153 pre-existing violations into instant red CI for every in-flight branch
  unless the rule and the conversion land in one commit. And `contrast-audit.test.ts` measures COLOUR only, so it
  stays green through a type change and gives false assurance there. (W22d-1 correction: the
  "pins hex fixtures" half of this sentence was wrong — the test parses `tokens.css` at test time
  and always has. The font-size blind spot is real; the fixture claim never was.) Do it as its own PR
  after W9a-e stop touching these files. W9e takes only the one genuinely-below-floor 9px
  declaration.

- **Ledger top-up for late split joiners, and cancelling sibling PIs after a single-pay takeover
  (M12 / M13).** Both move money. Topping up must re-run `deriveShareBreakdowns` over ALL members
  atomically — appending a share row breaks the Σ invariant `mms_fulfill_split_order` raises on
  and would block fulfillment on a table that has already paid — while preserving the $0-share
  auto-capture (split.ts:184-189) and the money-in-flight refusal (:113-121). Cancelling a PI that
  `captureAllIfReady` is mid-capture on is exactly the money-moved-but-marked-canceled trap split-
  settle.ts:91-113 guards against. W9b ships the read-only copy for both states; the ledger and PI
  work is a money PR of its own, gated on T1.

- **Narrowing `mms_init_togo_status` to `ci.fulfillment = 'togo'`** (the SQL half of `scango-fakes-
a-bag`). It would make `mms_reconcile_settled_fulfillment`'s `togo_status is null` disjunct
  match every pure-grocery order forever, so the pg_cron reconciler re-processes each one for its
  full 24h window — and it would strip grocery from `/board` and the expo entirely, removing the
  ONLY staff-side handle at the door while G7's machine-verifiable exit pass is still unbuilt.
  Three separate in-code comments (expo.ts:12-18, board/route.ts:63-65, OrderTracker.tsx:~340)
  record the current behavior as intended. W9d fixes the vocabulary; the predicate waits for G7.

- **`tip-asked-before-food-fired`** — verified overstated and should not be built. `tipRate`
  initialises to 0 (Checkout.tsx:162), no tip control is required or pre-selected, nothing gates
  the scroll, and paying before firing is not a broken outcome (K4 made paid orders reach the
  KDS). Critically, v7.2 has NO send-to-kitchen concept at all — it calls `pay()` directly at :432
  — so there is no design-source anchor for the claimed hierarchy. Relocating
  `SendToKitchenButton` would put its server-clocked 10s undo and its own focus owner into
  contention with Checkout's on-view-change focus move (:277, :287-289), and demoting "Continue ·
  $X" touches the J1 `.vt-cart-total` morph target and CartBar's prefetch assumption. Revisit only
  if real traffic shows tables paying before firing.

- **Desktop / wide-viewport work (F8's ≥768px column tier, G18's grocery shell widening).** Out of
  scope here: the diner's device is the phone the QR sticker sends them to, and both are already
  filed with their own slices. W9e caps `.mms-sheet` to match the 440 page column — that is
  bounding an overlay, NOT the start of a desktop tier, and should not be allowed to grow into one
  mid-PR.

---

## 4 · The confirmed findings

Severity is the verifier's CORRECTED value. `known` = an OPEN-ITEMS id the finding sharpens with
new evidence.

| Sev  | Finding                                                                                                                                                               | Where                                                            | known |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ----- |
| high | A wrong party code silently makes the guest host of a phantom table — their whole meal lands on a cart nobody can see                                                 | `apps/qr/components/GuestList.tsx:43`                            | —     |
| high | "Make it now" renders on every pickup cart, fires a line the KDS deliberately refuses, and permanently locks the diner out of editing it                              | `apps/qr/components/Checkout.tsx:752`                            | —     |
| high | The "For here / To go" toggle renders on pickup carts; flipping to "For here" deletes the order from expo and freezes /track forever                                  | `apps/qr/components/Checkout.tsx:723`                            | —     |
| high | Back-swipe from the pay step abandons checkout and leaves the cart server-locked for 5 minutes with no release                                                        | `apps/qr/components/Checkout.tsx:190`                            | —     |
| high | Six reachable "Back to menu" links drop the ordering mode — including the only forward affordance on the post-pay screen                                              | `apps/qr/components/OrderTracker.tsx:661`                        | F9    |
| high | /track goes permanently blank minutes after a table is cleared and tells the diner their paid order "hasn't appeared yet"                                             | `apps/qr/components/OrderTracker.tsx:536`                        | S1    |
| high | A transient rewards RPC failure renders a confident "0 Stars · new tier · $0 lifetime spend" — and poisons the tier-up baseline so a fake "Tier unlocked" fires later | `apps/qr/lib/rewards.ts:56`                                      | —     |
| high | Reorder silently drops the kitchen/allergy note attached to the dish, and never tells the diner                                                                       | `apps/qr/lib/reorder.ts:93`                                      | —     |
| med  | A diner who joins after the split opens has no share, no way to pay, and no screen that acknowledges them                                                             | `apps/qr/components/SettlementBoard.tsx:277`                     | —     |
| med  | The /cart review step never reads `locked`, so a frozen cart renders as fully editable and every edit silently no-ops                                                 | `apps/qr/components/Checkout.tsx:229`                            | —     |
| med  | Every bottom sheet's ✕ and drag handle scroll out of view — no reliable dismiss on any dish with modifiers                                                            | `apps/qr/app/globals.css:125`                                    | —     |
| med  | /track labels a dine-in order "To-go", runs a rail that can never advance past step 1, and promises status updates that are structurally impossible                   | `apps/qr/components/OrderTracker.tsx:212`                        | —     |
| med  | Back from /track hits "This order isn't available on this device" — one string for four causes, and its only exit drops the diner into scan-&-go                      | `apps/qr/app/cart/page.tsx:21`                                   | —     |
| med  | A settlement past its 10-minute TTL silently unmounts the board with cards still authorized, and the host's recovery throws without restoring the view                | `apps/qr/lib/split.ts:115`                                       | —     |
| med  | Once a stale settlement is taken over by a single payer, the other diners' boards freeze forever on a stale progress bar with their money still held                  | `apps/qr/components/SettlementBoard.tsx:69`                      | M12   |
| med  | Grocery checkout asks for a "First name for pickup" and promises "we'll call your name when your order's up"                                                          | `apps/qr/components/Checkout.tsx:195`                            | —     |
| med  | "Made fresh when you check out — ready in about 12 min" renders on a cart scheduled for tomorrow, four sections above the "When would you like it?" question          | `apps/qr/components/Checkout.tsx:800`                            | —     |
| med  | The pickup slot sheet has a loading state but no failure state — a DB read error renders as "No pickup times available right now", with no retry                      | `apps/qr/components/PickupSlotSheet.tsx:119`                     | —     |
| med  | The default Browse door has no basket surface — total, savings, EBT subtotal and the line list are all Scan-only                                                      | `apps/qr/app/grocery/page.tsx:620`                               | —     |
| med  | The "Save X%" gate meant to prevent "a wall of uniform bargains" admits 306 of 396 SKUs                                                                               | `apps/qr/components/grocery/GroceryBrowse.tsx:268`               | G16   |
| med  | A paid or expired cart leaves /grocery rendering a live basket + Check-out CTA, with every failure blamed on the connection                                           | `apps/qr/app/grocery/page.tsx:33`                                | —     |
| med  | Every diner bottom sheet spans the full viewport past 441px — the page column is capped at 440, the overlay is not                                                    | `apps/qr/app/globals.css:70`                                     | —     |
| med  | The add-confirmation toast overlaps the sticky cart bar / grocery CTA on every notched iPhone — on every single add                                                   | `apps/qr/components/TableCartProvider.tsx:597`                   | —     |
| med  | The menu is bilingual and the cart deliberately discards it — the Burmese exists in the DB and is thrown away at the cart boundary                                    | `apps/qr/lib/order-lines.ts:73`                                  | S2    |
| med  | The by-person split preview the table decides on is computed differently from the amounts they're then asked to authorize                                             | `apps/qr/components/SplitSection.tsx:38`                         | —     |
| med  | Header pill + homepage resume card stick on "Confirming your order" for up to 4h after the order becomes unreadable, and deep-link into the dead end                  | `apps/qr/components/useActiveOrderStatus.ts:70`                  | —     |
| med  | A guest still on the menu is never told the table started splitting — the Add buttons just go dead and the settle nudge disappears                                    | `apps/qr/components/TableCartProvider.tsx:487`                   | —     |
| med  | Every Add control is dead and silent for the whole session-mint round trip — the context exposes `loading` and nobody consumes it                                     | `apps/qr/components/TableCartProvider.tsx:502`                   | —     |
| low  | Paying for a self-scanned basket stamps togo_status='preparing' → a phantom bagging ticket on expo and the shopper's name on the public ready TV                      | `supabase/migrations/20260624000000_s4_togo_fulfillment.sql:167` | —     |
| low  | The type scale is enforced in TSX only — globals.css carries ~153 raw-px font sizes and there is no stylelint anywhere in the monorepo                                | `apps/qr/app/globals.css:122`                                    | F3    |
| low  | "anything extra above is yours to give" now sits ABOVE the tip chips — the sentence points at the service charge and tax                                              | `apps/qr/components/Checkout.tsx:945`                            | F9    |
| low  | On a dine-in cart the tip decision is demanded before the diner has any way to send food to the kitchen                                                               | `apps/qr/components/Checkout.tsx:1087`                           | —     |
