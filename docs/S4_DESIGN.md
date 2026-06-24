# S4 — Unified basket (design of record)

**Status: pre-build design + threat model (2026-06-23).** The plan for S4 per `ROADMAP.md` + the decided
model in `docs/context/ORDER-MODEL.md` ("unified basket: one cart, routed by destination"), written like
`docs/S3_DESIGN.md` / `docs/M4_DESIGN.md`. Companion: `docs/context/ORDER-MODEL.md` (the _why_),
`docs/BACKEND_ARCHITECTURE.md`, `CLAUDE.md` (money-authoritative · tax in sync TS↔SQL · RLS · a11y · tokens).

## What S4 is

**One table basket holds dine-in food + to-go food + grocery, routed per line, paid once.** Each line
carries a **fulfillment tag** that routes it: `dinein` → kitchen **now** (served to the table); `togo` →
kitchen **at checkout** (freshest) with a guest **"make it now"** toggle; `grocery` → no kitchen, locks at
payment, bagged at checkout. The KDS and the expo/bagging station each see only their subset. The cart is
**grouped by destination** for legibility; the receipt is mixed (good SB-1524 transparency).

The model is **already decided** in `ORDER-MODEL.md`; the only "open" items there are the loss threshold
(settled at $20 in S2) and the EBT split-tender seam (design now, build in the 2027 EBT track).

## Confirmed decisions (Min, 2026-06-23)

1. **Scope:** this design doc + **S4.1 = the unified-basket spine** (per-line fulfillment tag + the mixed
   basket grouped by destination, with **per-line tax** driven by the tag). Per-line **fire routing** + KDS
   subset = **S4.2**; the **bagging/expo station** + "to-go ready" departure signal = **S4.3**.
2. **Line fulfillment:** a **per-line For-here / To-go toggle** on food (grocery auto-tags `grocery`),
   defaulted from context (dine-in session → `dinein`; pickup/scan entry → `togo`). **The fulfillment tag
   supersedes the session `mode` for routing _and_ for tax.**

## The spine S4 plugs into (current-state facts)

- **The cart line is `qr_cart_items`** — `menu_item_id` (uuid for food via `menu_items`, a barcode for
  grocery via `grocery_items`), `state` (S2 draft→fired→…), `fire_at`/`fire_batch` (S2 kitchen timer),
  `tax_cents` (stored per line). **No fulfillment tag yet** → S4 adds `fulfillment`.
- **Tax is per-line + category-aware** (`lib/tax.ts` ↔ SQL `mms_line_tax`). **Crucially, `dineIn` changes
  taxability**: `cold_food`/`beverage_cold` are taxable **only dine-in** (CDTFA Reg 1603); hot/prepared
  always taxable; `grocery_food` exempt. Today `dineIn = (session.mode === 'dinein')` for the WHOLE cart —
  S4 must drive it **per line from the fulfillment tag**, or a to-go cold item in a dine-in session is
  over-taxed. `getCartTotals` builds the taxable base from lines whose stored `tax_cents > 0`, so a line's
  stored `tax_cents` (computed via `lineTax`) is the single thing that must reflect its fulfillment.
- **Add paths:** food → `lib/cart.ts addItem` → `priceItem` (menu_items) → `insertOrIncLine`; grocery →
  `lib/grocery.ts scanAdd` (grocery_items) → the same line insert. Both set `tax_cents` via `lineTax`.
- **Fire** (`mms_fire_cart`) is currently **dine-in-session-gated**; S4.2 makes it **per-line by
  fulfillment** (dine-in fires now; to-go fires at checkout / "make it now"; grocery never fires).
- **Money is server-authoritative, cents end-to-end.** One payment over the mixed basket already works
  (`getCartTotals` sums all lines; the intent covers the whole basket; promo/reward apportion across the
  taxable base). S4 adds **no** new total/charge path.

## Threat model & hardening — per phase

### S4.1 — the spine (tag + per-line tax + grouped basket)

- **U1 — per-line tax correctness (money/compliance, load-bearing).** A line's `tax_cents` is computed from
  **its own fulfillment** (`dinein` → taxable-as-dine-in; `togo`/`grocery` → not dine-in), in BOTH the TS
  (`lib/tax.ts`) and the SQL (`mms_line_tax`) mirrors — kept in sync. The For-here/To-go **toggle
  recomputes `tax_cents`** for the line (a cold item flips taxability). `getCartTotals`'s taxable base then
  reflects each line's true status; the reconcile + snapshots inherit it. **Grocery (`grocery_food`) stays
  exempt regardless.** Hot/prepared stays taxable regardless. No double-count; the discount still apportions
  on the discounted taxable base.
- **U2 — fulfillment is server-set + authz'd.** Set on add (food = context default; grocery = `grocery`,
  never guest-flippable). The toggle is **member-gated** (`assertCartItemMember` + `canMutateLine` —
  own/host draft only; a fired/served line can't be re-routed), **open-cart**, and **food-only** (refuse
  flipping a `grocery` line — its routing + exemption are fixed). The tag changes routing + (for cold food)
  tax, never price.
- **U3 — fire routing seam (S4.2).** S4.1 records + displays the tag but does **not** yet change fire — the
  existing dine-in fire still applies. So an S4.1 dine-in session's to-go line still fires now until S4.2.
  Honest: the basket grouping shows _where a line goes_, not its fire timing (that copy lands with S4.2).
- **U4 — legibility / a11y.** The basket is grouped into labelled regions ("At your table / To-go /
  Grocery"); each group a `role`/`aria`-named section; the toggle a ≥44px, properly-labelled control;
  reduced-motion safe; tokens, honest microcopy.

### S4.2 — per-line fire routing + KDS subset + ready signal (built 2026-06-23)

**Scope: the dine-in unified basket.** A dine-in session's mixed cart fires per line by tag; pickup/scango
keep their existing M2 **scheduled** fire (`qr_orders.fire_at = slot − prep`, kitchen-actor consumption
still deferred) — S4.2 does **not** touch that path. The two fire mechanisms stay distinct:
**per-line `qr_cart_items.fire_at`** (this slice) vs **order-level scheduled `fire_at`** (pickup, untouched).

- **F1 — fire routing (the core).** `mms_fire_cart` ("Send to kitchen") now fires **only `fulfillment='dinein'`**
  draft lines (was: every draft line of a dine-in session — the S4.1→S4.2 seam U3). A `togo` line **waits**;
  a `grocery` line **never** fires. Undo (`mms_undo_fire`) is unchanged (latest in-grace batch, mode-gated).
- **F2 — "make it now" (early to-go fire).** `mms_fire_line(p_line)` fires **one `togo` food line** early
  (draft→fired, `fire_at = now()+10s` grace, its own `fire_batch`). Guards re-derived **in SQL**: open cart,
  draft state, **`fulfillment='togo'`** (a `dinein` line uses the batch send; `grocery` is refused). The
  diner action is member + `canMutateLine` gated (own/host draft) — same authority surface as the S4.1 toggle.
- **F3 — fire-at-checkout = the "no charge-with-no-fire" safety net (load-bearing).** At settlement, any
  still-**draft food** line (`fulfillment in ('dinein','togo')`, **never `grocery`**) of the **paid** dine-in
  cart fires via `mms_fire_pending_food(p_cart_id)` (`fire_at = now()`, immediately due — you've paid, no
  undo). This is called **best-effort _after_** the money RPCs (`mms_fulfill_order` card-webhook /
  `mms_fulfill_cash_order` cash), **drained via `after()`** — a kitchen-fire bug must **never** roll back a
  captured payment or NACK a Stripe webhook (CLAUDE.md side-effect rule; the money RPCs are left untouched).
  Gated to `mode='dinein'` so pickup/scango keep their scheduled fire. Idempotent: re-running fires nothing
  (no draft food left). A line already fired/served during the meal is skipped (not re-fired).
- **F4 — KDS subset + visibility.** Fire routing makes the subset correct **for free**: only `dinein` +
  fired `togo` lines ever reach `state='fired'`, so the existing KDS (reads `state in ('fired','in_progress')`)
  shows exactly the kitchen subset; grocery (never fired) is implicitly excluded. **One required change:** the
  KDS read must include lines on a **`paid`** cart, not just `open` — a `togo` line fired at checkout lives on
  the just-paid cart, and the old `status='open'` filter would hide it (the cook would never see paid-for
  to-go food). Now reads carts `status in ('open','paid')` (still `cancelled`-excluded; the line-state gate
  keeps served/voided off). A per-ticket **destination badge** ("To-go") tells the cook/expo where it goes.
- **F5 — "ready in ~X" signal (honest, lightweight).** When a to-go line is made-now or fires at checkout,
  the diner sees "made fresh — ready in about **X** min", where **X = `pickup_config.prep_minutes`** (a real
  configured value, same honesty basis as the pickup ETA — **never** a fabricated live countdown). The full
  persistent "to-go ready, don't walk out without it" departure status + bagging/expo station is **S4.3**.
- **F6 — a11y / legibility.** The "Make it now" control is a ≥44px labelled button (draft + food + `togo`
  only); the KDS badge is text (not color-only); tokens, honest microcopy, reduced-motion safe.

**Known behavioral edges (reviewed, accepted — no money/safety impact):**

- **Undo × make-it-now.** `mms_fire_line` stamps the same `now()+10s` grace + its own `fire_batch`, so the
  host's grace-window "Undo" (`mms_undo_fire`, newest in-grace batch) _can_ reverse a guest's just-fired
  to-go line. Accepted: nothing is cooked within grace, and un-fire → draft is non-destructive. Fire-at-
  checkout is immune (`fire_at = now()`, no grace, so `undo_fire`'s `fire_at > now()` excludes it).
- **Lingering paid to-go on the KDS.** A to-go line fired at checkout sits `fired` on a `paid` cart until a
  cook bumps it `served` — the intended bagging cue. If never bumped it lingers (same as any un-bumped line);
  the `state` gate keeps served/voided off and grocery can never appear (never fired). Ops awareness, not a bug.

**Deferred to S4.3 (documented):** the bagging/expo station, the persistent diner "to-go ready" departure
signal (realtime ready-state on `/track`), line-level refunds, and the split-tender seam generalization.
Pickup/scango **scheduled-fire → KDS** consumption stays the M2 seam (no kitchen actor for it yet).

### S4.3 — close out S4: to-go fulfillment loop · line-level refunds · split-tender seam (built 2026-06-24)

S4.3 is **three slices, one PR each** (Min's "Everything" scope). Each carries its own threat model below.

#### S4.3a — to-go fulfillment loop (bagging/expo station + "to-go ready" departure signal)

Completes the unified-basket loop: order → route → fire → cook → **bag → ready → hand off**, with a diner
signal so nobody pays and walks out without their bag. The fulfillment lifecycle today ends at the kitchen
(`qr_cart_items.state` → `served`); there's no order-level "ready" and no bagging actor. S4.3a adds both.

- **A1 — the ready signal lives on the order (`qr_orders.togo_status`), so `/track` reads it for free.**
  `togo_status text check in ('preparing','ready','picked_up')`, **nullable** (null = pure dine-in eat-in, no
  bag). `/track` already subscribes to `qr_orders` by PI/order-id (`useOrderStatus`) — the status rides that
  existing Realtime path; no new channel. Set to `'preparing'` at settlement (see A3); the expo bumps it
  `ready` → `picked_up`.
- **A2 — the expo reads only the takeaway subset (snapshot `fulfillment` onto `qr_order_items`).** Today the
  order-item snapshot drops the per-line `fulfillment` tag, so a paid order can't say which lines are the bag.
  Add `qr_order_items.fulfillment` (default `'dinein'`, backfilled) and copy `ci.fulfillment` in the snapshot
  `insert…select` of all three fulfill RPCs (`mms_fulfill_order` · `mms_fulfill_cash_order` ·
  `mms_fulfill_split_order`) — a purely **additive column copy**, no money logic changed. The expo lists
  orders with `togo_status in ('preparing','ready')` joined to their `togo`/`grocery` order-items. (Slice C
  inherits this per-line categorization on the order.)
- **A3 — init `preparing` best-effort, off the money path.** `mms_init_togo_status(p_order, p_cart)` sets
  `togo_status='preparing'` iff the cart has a non-voided `togo`/`grocery` line (idempotent: only when
  currently null). Called in the **same settlement `after()` side-effects** that S4.2 already wired
  (card webhook · cash · split close) — never inside the money RPCs. A kitchen/expo hiccup can't roll back a
  payment. Pickup/scango orders (all-takeaway) get `preparing` too — the expo is the takeaway station for all
  channels.
- **A4 — expo bump is staff-gated + legal-edge in SQL.** `mms_set_togo_status(p_order, p_to)` allows only
  `preparing→ready` and `ready→picked_up` (re-asserted in the UPDATE `WHERE`; `'stale'` on a raced/illegal
  edge). `SECURITY DEFINER`, `search_path=''`, revoke public/anon/authenticated + grant service_role. The
  `lib/expo.ts` actions re-check `requireStaff()` (the KDS pattern — the client is the affordance, never the gate).
- **A5 — `/track` shows real progression.** Map `togo_status` → the existing pickup/scango step rail
  (`preparing`→"In the kitchen", `ready`→"Ready for pickup"/"Ready", `picked_up`→"Picked up"/"Served"). Honest:
  steps light only from the server signal (no fake countdown); a dine-in order with no bag keeps `togo_status`
  null and the tracker rests as today. One live region (the existing `role="status"`), focus/SR-safe.
- **A6 — a11y/legibility.** Expo station mirrors the KDS (≥44px bump buttons, labelled, realtime + poll
  backstop); destination grouping is text-labelled; tokens, reduced-motion safe.

#### S4.3b — line-level refunds (`charge.refunded` webhook + per-line refund) — built 2026-06-24

S2.3 already **gates + audits** a money-leaving void on an OPEN cart; a _captured-line_ refund on a PAID order
was the explicit seam (`mms_void_line` refuses a non-open cart). S4.3b adds the **money-out execution**: a
manager-facing **`/staff/orders`** surface (Min's "build a staff orders surface" scope) lists recent paid
orders; a manager refunds a specific line. `charge.refunded` (unhandled platform-wide) becomes the
Stripe-authoritative reconcile.

- **B1 — per-line refund, server-derived, manager-gated.** `/staff/orders` is `requireStaff('manager')`. The
  `refundLine` action re-checks manager + a **self-PIN confirmation** (`verifyStaffPin(caller, pin)` — the
  money-out step-up at the moment of action; the surface is already manager-gated, so it's a re-auth, not a
  second person). `mms_refund_authorize(line, initiator)` **server-derives** the amount
  (`unit_price_cents*qty + tax_cents` — goods + that line's tax; service/tip are order-level, **not** per-line
  refunded in v1) + the PaymentIntent, and validates: order `paid`, **single-PI** (`stripe_payment_intent_id`
  not null — split orders return `split_unsupported`, deferred), line not already refunded, initiator an active
  manager/owner. Never a client amount.
- **B2 — execute then record; Stripe idempotency-keyed.** The action calls `stripe.refunds.create({payment_intent,
amount}, {idempotencyKey: 'refundline_<lineId>'})` — concurrent double-submits return the SAME refund (no
  double money out). On success `mms_record_refund` writes the **`mms_refunds` ledger** (unique
  `stripe_refund_id` + a unique-per-line index — the DB backstop) + a `mms_approvals` audit row (`kind='refund'`,
  initiator = approver = the manager). Idempotent (`on conflict (stripe_refund_id) do nothing`; audit only on
  first record).
- **B3 — `charge.refunded` = the status truth + the ledger backstop.** The webhook (signature-verified)
  (1) **backstop-records** each of our line refunds from the refund's metadata (`orderItemId`/`reasonCode`/
  `initiator`, set on `refunds.create`) via `mms_record_refund` — idempotent on the refund id, so if the
  action's ledger write failed _after_ Stripe succeeded (money out, no row), the webhook restores the
  `mms_refunds` row + `mms_approvals` audit (closing the "no durable audit" + ">24h re-refund" gap the
  adversarial pass flagged); then (2) calls `mms_apply_refund_reconcile(pi, charge.amount_refunded)` to flip
  `qr_orders.status='refunded'` **iff** `amount_refunded >= total_cents` (Stripe-authoritative — works for a
  dashboard refund too; the state **M4 refund-recede** was blocked on — the rewards summary counts only
  `status='paid'`, so a full refund recedes the Star). A partial (single-line) refund leaves `status='paid'`
  (the ledger carries the line detail). Idempotent (only flips from `paid`); a non-order PI → `no_order`; a DB
  error → 5xx so Stripe redelivers.
- **B4 — money safety.** Amount + PI are **server-derived** (never client); the Stripe idempotency key
  (`refundline_<lineId>`) collapses a same-line double-submit to ONE refund + the unique-per-line index is the
  DB backstop + the webhook re-records from metadata, so a double-refund is unreachable and every executed
  refund leaves a durable audit trail; refunds flow only on a `paid` (post-capture) order. **Voided/comped
  lines are never in `qr_order_items`** — the fulfill snapshots filter `state <> 'voided' and not comped`
  (S4.3a/S2.3), so a refund can never pay out a line that was never charged (no extra guard needed). **Split-
  tender line refunds are deferred** (`split_unsupported` — a share refunds against the _payer's_ PI;
  S4.3c/split-refund problem). **No coupon claw-back** in v1 (the Star _count_ recedes via the status flip; a
  minted milestone coupon isn't rescinded — documented).

#### S4.3c — split-tender seam (data model only; build the EBT tender in the 2027 track)

Today's split (M3·P3.3b) is **per-seat** (each payer covers a share of _all_ lines, one order). The EBT seam
is **per-line-subset** (one tender — an EBT card — pays only eligible grocery lines). S4.3c lays the data
model so 2027 is a tender-time branch, not a rewrite — it builds **no** tender split now (EBT = 2027, Forage/FNS).

- **C1 — per-line payment association + eligibility on the order.** With `qr_order_items.fulfillment` already
  snapshotted (A2), add the seam: a way to associate a payment with a **subset** of order lines (a
  `payment_lines` join or `qr_order_items.paid_by_intent`) + snapshot/derive EBT-eligibility per line
  (`grocery_items.ebt_eligible`). Documented + minimally migrated; no 2027 tender logic. Detailed when C is built.

#### Out of scope / deferred (unchanged)

- Pickup/scango **scheduled-fire → KDS** consumption stays the M2 seam (no kitchen actor for it yet).
- The **EBT tender split execution** is the 2027 EBT track (Forage/FNS); S4.3c only readies the data model.

## EBT split-tender seam (design now, build 2027)

A payment can cover a **subset** of lines (EBT/SNAP pays only eligible grocery). **Seam:** the per-line
`fulfillment`/`tax_category` already partitions the basket; a 2027 tender split associates a PaymentIntent
with a **line subset** (e.g. a `payment_lines` join or a per-line `paid_by_intent`). S4 keeps the data model
ready (lines are independently categorized + tagged); it builds **no** tender split now (EBT = 2027, Forage/FNS).

## New surface / RLS / money checklist (S4.1 build)

- **`qr_cart_items.fulfillment`** `text not null default 'dinein' check (fulfillment in ('dinein','togo','grocery'))`
  — service-role-write (set on add / toggle). Backfill existing rows from the session mode (`dinein`→`dinein`,
  else→`togo`; grocery lines→`grocery`) so stored `tax_cents` stays consistent (non-dine-in ⇒ `dineIn=false`,
  unchanged).
- **`mms_set_line_fulfillment(line, fulfillment)`** RPC — re-derive authz (member, own/host draft, open
  cart, **food-only**), set the tag, and **recompute `tax_cents`** from the line's category + the new
  fulfillment. `SECURITY DEFINER`, `search_path=''`, revoke public/anon/authenticated + grant service_role.
- **`lib/tax.ts` + SQL `mms_line_tax`** — both already take `dineIn`; S4 passes `fulfillment === 'dinein'`
  per line. Keep the two mirrors in sync (the recurring war-story).
- **`addItem` / `scanAdd`** — set `fulfillment` (food default from mode; grocery = `grocery`) + compute
  `tax_cents` from it. **`insertOrIncLine`** carries the tag; merge only lines with the SAME fulfillment.
- **`getCartView` / `CartItem`** — expose `fulfillment` per line so the cart groups by destination.
- **UI** — `Checkout` groups lines into At-your-table / To-go / Grocery, each a labelled region; a per-food-
  line For-here/To-go toggle (server action → `setLineFulfillment` → refresh). Tokens, 44px, a11y, honest copy.

## Out of scope (deferred)

- Per-line **fire routing** + KDS subset → **S4.2**. Bagging/expo station + "to-go ready" → **S4.3**.
- **EBT split-tender** (subset payment) → **2027 EBT track** (seam designed above).
- **Kitchen-load smoothing** for fire-at-checkout spikes → later optimization (ORDER-MODEL watch-out).
