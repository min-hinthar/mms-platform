# W17_PLAN — Real POS pricing · staff price control · tipping · the missing menu

The owner, 2026-08-16, verbatim:

> let's just revert to real POS pricing for both dine-in and take-out for now (staff portal should
> be able to update prices?) and maybe enhance the tipping features. make sure new menu items from
> POS are creatively created and not duplicated if we already have prior to the POS data.

and, on keeping a record:

> should keep record of detailed menu items information in repo for ease of reference and updates

Two `AskUserQuestion` decisions are locked:

| Question       | Answer                                                                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Dine-in prices | **Bare POS price, no markup** — dine-in = to-go = what the register rings. Service charge stays retired.                                  |
| Tipping        | **All four**: round-up + smarter defaults · tip on the staff cash settle · tip prompt on kiosk + register · tip transparency for the team |

---

## The POS pricing truth (the finding that drives W17a)

Zettle/PayPal stores **one menu price per dish.** What separated a dine-in ring from a to-go ring at
the register was the **tax column**, not the price:

- dine-in rows carry **25.5%** — 10.5% L.A sales tax **+ a 15% dine-in service charge**
- to-go rows carry **10.5%**

The qty=1 rows of the 2025 report are the Rosetta stone, because net is recoverable exactly:

| Ring                       | Tax   | Gross  | Net (gross − tax) | Rate  |
| -------------------------- | ----- | ------ | ----------------- | ----- |
| Duck **To-Go** ×1          | $2.00 | $21.00 | $19.00            | 10.5% |
| Salted Fish **Dine-In** ×1 | $4.85 | $23.85 | $19.00            | 25.5% |

Same dish, same **$19.00 menu price**, two tax treatments. Across the 365 rows of that report whose
rate is derivable: **209 at ~10.5%, 155 at ~25.5%**, one outlier. And in the Jan–Jul 2026 raw
export, of the **72** dishes sold BOTH ways, **66 price identically**.

So W16a's dine-in ×1.15 re-created, as a price increase, exactly the service charge the owner had
just retired. W17a reverts it.

**Every number above is recomputed, never transcribed** — regenerate with
`node scripts/gen-menu-reference.mjs` and read [`docs/data/MENU_REFERENCE.md`](data/MENU_REFERENCE.md).

---

## The menu record (the owner's "keep record in repo" ask)

Three files under `docs/data/`, one generated from the other two:

| File                                                | What it is                                                                                                             |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| [`menu_catalog.json`](data/menu_catalog.json)       | Snapshot of prod `menu_items` — price, tax category, tags, allergens, photo, modifier-group count, category            |
| [`pos_2026_prices.json`](data/pos_2026_prices.json) | 149 POS items — price, observed dine/to-go rings, units sold Jan–Jul 2026, variants                                    |
| [`MENU_REFERENCE.md`](data/MENU_REFERENCE.md)       | **Generated.** Our catalog by category × the POS join, price deltas, mode disagreements, the unmatched backlog, counts |

`pnpm check:docs` fails if the markdown drifts from the JSON, so the record cannot rot. Regenerate
after editing either input: `node scripts/gen-menu-reference.mjs`.

**The join is on the Burmese name, not the English one.** POS English labels and ours diverge freely
(POS `Chicken Liver ကြက်သဲမြစ်` is our `Chicken Giblets Curry ကြက်အသဲမြစ်`), while the Burmese is
what the kitchen and the owner actually use. An **exact** Burmese match means we already carry the
dish. A `≈` row means one name merely contains the other — kept for discovery, never used to
conclude anything about price (`ပဲပြုတ်` White Peas is a substring of `ပဲပြုတ်ထမင်းကြော်` Burmese
Fried Rice, which would otherwise read as a $12-vs-$5 "delta" between two different dishes).

---

## W17a — real POS pricing ✅ (2026-08-16)

- `apps/qr/lib/mode-price.ts` **deleted**, with `mode-price.test.ts` and `reorder-mode.test.ts`.
- The charged unit is `base_price_cents` + the chosen modifiers' deltas at the ONE `priceItem` seam
  — inherited by every add path (diner, staff register, kiosk, reorder). Every price DISPLAY reverts
  with it (menu cards, item sheet, upsell rail, favorites, Start-here, kiosk, staff modifier sheet).
- **The for-here↔to-go toggle is tax-only again.** A flip moves the routing tag and the per-line tax
  (cold food is taxable dine-in, exempt to-go); it never re-prices. `setLineFulfillment` omits
  `p_unit_price_cents`, which is the SQL fn's documented "leave the price alone" path
  (`coalesce(null, stored)`) — **so no migration and no signature change.** The optimistic client
  flip drops its rescale preview for the same reason.
- Tax stays **10.5%** and the service charge stays retired: `serviceChargeCents` is a constant 0 in
  the totals shape, and `lib/receipt-view.ts` keeps its `> 0`-gated historical row + SB-1524
  disclosure so pre-change orders still render their own snapshot.
- verify:slice: the 5 markup mutants retired; 2 added — `order-lines/pos-price-marked-up` (a factor
  grown back at the seam) and `cart/toggle-re-prices-the-line` (any price forwarded on a flip). The
  staff mode-fork mutant survives guarding what it really guards: the routing + **tax** fork.

**Prod carry-over — swept 2026-08-16, ZERO affected lines.** `menu_items.base_price_cents` was
never touched by W16a (the markup lived in TS), so the deploy alone restores POS pricing. The open
question was cart lines **added** during the W16a window, which would carry a marked-up
`unit_price_cents` on the row. Measured against prod: of 126 open food lines across 31 open carts,
only **5** were created on or after 2026-08-15, and every one of them is at the bare POS price —
e.g. `Kyay-O / Si-Chat` at 2200 is 2000 + a real 200¢ "Brains add-on", not `round25(2000 × 1.15)` =
2300; `Mee-Shay` at 1400 is the base, not `round25(1400 × 1.05)` = 1475. Nothing was ever ordered
through the markup. **No data fix is needed.**

⚠️ If you re-run this check, do NOT use a bare `unit_price_cents <> base_price_cents` predicate — it
is not diagnostic. `unit_price_cents` includes **modifier deltas**, and older lines legitimately
carry **pre-W15 prices** (W15 corrected 10 menu prices), so that predicate returns ~30 rows of which
none are markups. Compare against the W16a formulas explicitly instead:

```sql
select ci.id, ci.name, ci.unit_price_cents, mi.base_price_cents, ci.modifiers, ci.created_at
from qr_cart_items ci
join qr_carts c on c.id = ci.cart_id
join menu_items mi on mi.id::text = ci.menu_item_id
where c.status = 'open' and ci.fulfillment <> 'grocery'
  and ci.created_at >= '2026-08-15T00:00:00Z'   -- the W16a window only
order by ci.created_at;
```

Paid orders are history and must NOT be rewritten — they carry what was really charged.

---

## W17b — per-mode price + the staff price editor ⬜

**Per-mode price.** Six POS items ring differently by mode; only ~4 look like a real policy rather
than a register anomaly (see §"POS items whose dine-in and to-go rings disagree" in the reference —
`Fish Paste` $42/$14 and `Shrimp Spicy` $15/$19 at 8 units are anomalies, not a two-price rule):

| Dish                                       | Dine-in | To-go | 2026 units |
| ------------------------------------------ | ------- | ----- | ---------- |
| Pork Offal ဝက်ကလီစာ                        | $15     | $14   | 217        |
| Salted Fish Pounded ငါးခြောက်ထောင်းကြော်   | $19     | $17   | 64         |
| Beef Pounded အမဲထောင်းကြော်                | $19     | $17   | 31         |
| Salted Fish Eggplant ငါးခြောက်ခရမ်းသီးနှပ် | $14     | $12   | 20         |

Design: a **nullable `menu_items.togo_price_cents`** — null means "same as dine-in", which keeps 62
of the 66 items expressing exactly one price and makes the exception explicit. `priceItem` then
takes back a fulfillment argument, but as a **column lookup, not a factor** — the mutant to add is
"the to-go column is ignored", and the seam mutant from W17a must stay red for any _computed_
markup. Confirm the four with the owner before seeding; a register anomaly seeded as policy is a
permanent wrong price.

**Staff price editor** (the owner's parenthetical: _"staff portal should be able to update
prices?"_). Manager-gated (`app_role`), edits `base_price_cents` (+ `togo_price_cents`), writes an
audit row, and is bounded at the DB (Zod `.max()` **and** a column `CHECK`) — a fat-fingered $1900
is a money incident. Never a client-computed value; the editor sends an amount and the server
validates and stores it. Prices are read by `priceItem` at add time, so an edit takes effect on the
next add and never retroactively re-prices a line already in a cart.

---

## W17c — tipping, all four ⬜

1. **Round-up + smarter defaults.** A "round up to $X" chip beside the percentage chips, and
   defaults that scale with basket size (percentage chips read wrong on a $6 tea and on a $180
   table). The tip stays server-confirmed — the chip is a hint, `getCartTotals` is the authority,
   and the Zod 0–50% cap stands.
2. **Tip on the staff cash settle.** Today `CashSettleButton` records no tip ("in-hand/off-system").
   Give the settle a tip entry so cash tips land in the ledger and on the Z-report — that is a money
   path: server-derived total, tip added as its own column, never folded into the subtotal.
3. **Tip prompt on kiosk + register.** The kiosk hands off to the counter with no tip ask at all;
   the register settles without one. Both need a prompt sized for the surface (kiosk: big-touch,
   three chips + skip; register: cashier-entered).
4. **Tip transparency for the team.** A staff view of tips by shift/day. Real values only — never a
   projected or averaged number presented as earned.

---

## W17d — the missing POS menu items ⬜

**98 of 149 POS items have no exact Burmese match in our 66-item catalog** (see the reference's
backlog table, sorted by 2026 volume). Do **not** bulk-import. Each row is one of:

- a genuine missing dish with real volume (Pork Tamarind, Ngapi Sambal, Water Spinach, Bean
  Fritters, Beef Jerky, Mohingh Soup, Kufee, shwekyi, Catfish Head Mon, Silurus Dried, Chicken
  Salad, Fresh Fruits, Coconut Sago, Duck curry, Goat Brains…),
- a **modifier**, not an item — `ကြက်ဥ Egg Add-on $3` belongs on a modifier group,
- **alcohol** — a licensing/compliance question for the owner before it can appear in the app,
- a combo/tray/party ring, or
- a dish we already carry under a Burmese spelling the loose match missed.

Verify each against the reference, then create the genuinely-missing ones **with the same care as a
designed menu item** (bilingual name, description EN+MY, tax category, allergens, dietary tags,
modifier groups where the dish has real choices) — not as bare rows.

**Open price questions for the owner** (from §"Price deltas"): `Balachaung` — ours is a $3.00 side,
POS rings $10.00 (the fried version); `Crab Masala` — ours $30.00, POS $35.00.

---

## Owner-side blockers unchanged by W17

C1 auth hardening · C2 Stripe live keys · C5 the 3 dishes still needing photography · C7 hardware ·
C11 kitchen modifier confirm · C14 fuzzy-match review · K15 native check of the Claude-authored
Burmese · `RESEND_RECEIPT_FROM`.
