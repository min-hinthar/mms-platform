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
none are markups. Scope to the W16a window instead and read the rows, checking each against the
W16a formulas by hand — `round25(base × 1.15)` for dine-in, `round25(base × 1.05)` for to-go — since
the modifier deltas mean SQL alone can't tell a markup from a legitimate add-on:

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

**Addendum (W21d, from Codex's #179 review — the sweep above had holes, closed by a stronger
measurement.)** The open-lines sweep couldn't support "nothing was ever ORDERED through the markup"
on its own: it excluded carts already `paid`, lines created before the window but re-priced by a
fulfillment toggle during it, and its example formula applied the factor before modifier deltas.
The decisive probe (run against prod 2026-08-16, W21d): **zero `qr_orders` rows were created in
the W16a window** (2026-08-15T19:16Z → 2026-08-16T02:31Z; 11 orders ever exist, all June test
data) **and zero open-cart lines from that window survive** — so no charge and no chargeable line
ever carried the markup, closing the question for every shape the review named.

---

## W17b — the staff price editor ✅ (2026-08-16) · per-mode price DEFERRED

**Shipped: the price editor.** `/staff/menu`, manager+. The owner's parenthetical — _"staff portal
should be able to update prices?"_ — is the whole slice.

This is the ONE place in the app where a money amount crosses from a human into the system. Every
other amount is server-derived, and that rule is not weakened: a manager setting the menu price is
the decision the rule protects. What changes is which number `priceItem` reads next.

- The **manager floor is re-checked inside `setMenuPrice`** — a Server Action is a public POST
  endpoint, so the page gate is convenience and the action gate is the authority. The service client
  is created only **after** the gate: authz proven before elevation.
- **Bounded on both sides:** Zod `.min(25).max(500000)` and a new `menu_items_base_price_cents_bounds`
  column CHECK. `base_price_cents` was writable only by a migration until now.
- **`menu_price_audit`** records old → new against the caller's `staffId`. Manager+ read; **no insert
  policy at all**, so only the service-role path can append — which is what makes the ledger
  un-forgeable (W21d, Codex on #181: not "unskippable" — an insert FAILURE after the committed
  price update leaves a change with no row, which is why the failure copy tells the manager to
  report it; atomicity is OPEN-ITEMS M55). An insert failure is **surfaced**, not swallowed; the price is not rolled back,
  because an unrecorded correct price beats a reverted one the kitchen already heard about.
- **Nobody is re-priced mid-meal:** `unit_price_cents` is stamped at add time and nothing here
  touches `qr_cart_items`.
- **Compare-and-swap on the write** (review MED): the update asserts the price it read. Keyed on the
  id alone, two concurrent edits both land and the second records a ledger row claiming it changed
  the price _from_ a value already gone — the live price is fine, the ledger is what breaks, and
  answering "from what?" is the only reason it exists. A lost race is re-read and named ("someone
  else just set it to $X"), distinct from a vanished dish; an unreadable re-read is treated as the
  race, since telling a manager to look again beats claiming a dish vanished when it did not.
- Migration `20260816000000_w17b_price_editor.sql`. 5 new mutants (106 total), each watched red.

**Deferred: per-mode `togo_price_cents`.** Six POS items ring differently by mode; only ~4 look like
policy rather than a register anomaly (`Fish Paste` $42/$14 and `Shrimp Spicy` $15/$19 at 8 units
are anomalies):

| Dish                                       | Dine-in | To-go | 2026 units |
| ------------------------------------------ | ------- | ----- | ---------- |
| Pork Offal ဝက်ကလီစာ                        | $15     | $14   | 217        |
| Salted Fish Pounded ငါးခြောက်ထောင်းကြော်   | $19     | $17   | 64         |
| Beef Pounded အမဲထောင်းကြော်                | $19     | $17   | 31         |
| Salted Fish Eggplant ငါးခြောက်ခရမ်းသီးနှပ် | $14     | $12   | 20         |

**Why it is deferred, not just unbuilt.** A per-mode price means the dine-in↔to-go toggle must
**re-price the line on every flip** — precisely the machinery W17a removed, with its exact/rescale/
refuse ladder and its `p_unit_price_cents` forward. That is a real money-path change, and the four
prices above are unconfirmed. Building it on the chance the owner says yes would reintroduce the
complexity for a feature that may be rejected.

**When it is confirmed**, the shape is: a nullable `menu_items.togo_price_cents` (null = same as
dine-in, so 62 of 66 items keep expressing exactly one price and the exception is explicit);
`priceItem` takes `fulfillment` back as a **column lookup, never a factor** — the W17a seam mutant
`order-lines/pos-price-marked-up` must stay red for any _computed_ markup; and the toggle re-price
returns, which needs its own guards restored. Confirm the four with the owner first: a register
anomaly seeded as policy is a permanent wrong price.

## W17c — tipping, all four ✅ (2026-08-16 · #182 #183 #184 #186)

1. **Round-up + smarter defaults** (#182). `roundUpTip` + `effectiveTipRate` in `lib/tip.ts` — the
   chip is a hint, `getCartTotals` stays the authority, the 0–50% Zod cap stands. The review HIGH
   here seeded the "name it ONCE" rule: the round-up rate was frozen in `useState` and desynced from
   the total it named.
2. **Tip on the staff cash settle** (#183). Cash tip is an **amount** (only the cashier knows);
   bounded Zod + column CHECK (`20260816010000`), proven red against prod first (`tip_cents = -1`
   was ACCEPTED before the migration). `collectedCents` is the one binding the return, audit row and
   analytics all read.
3. **Tip prompt on kiosk + register** (#184). The house ladder `TIP_LADDER = [15, 20, 30]%` on both
   surfaces; kiosk records **intent** (`intended_tip_cents`, null = never asked ≠ 0 = chose nothing)
   that pre-fills the register settle with provenance copy; chips compute off the **pre-tax** base
   (`settleTipBaseCents`) after the review caught the register using the tax-inclusive total.
4. **Tip transparency for the team** (#186). `/staff/tips` — two buckets never blended (attributed
   vs `settled_by is null` = shared pool), scope narrowed **in-process** (`scopeToSelf`), never by
   query predicate (the predicate version zeroed the shared bucket — "guests tipped $0.00" as fact).
   No averages, no projections, no invented splits on a screen read as a statement of pay.

---

## W17d-1 — align the catalog to the POS ring ✅ (2026-08-16 · #185)

Every exact-Burmese-matched item now carries the price the register actually rings
(`20260816030000_w17d_pos_2026_prices.sql`, prod-applied). The reference's §Price deltas reads
**"None"** — and `check:docs` keeps it honest.

## W17d-2 — the missing POS menu items ✅ (2026-08-16)

**98 of 149 POS items had no exact Burmese match in the 66-item catalog.** Every one was classified
BEFORE anything was created ("verify each item before adding"), and the verifier
(`w17d2_build.py` → `20260816040000_w17d2_pos_menu_items.sql`) machine-checks each insert: no slug /
English / exact-Burmese collision, loose-Burmese overlaps printed for adjudication (one, adjudicated
distinct: oil-rice-with-peas ⊂⊃ white-peas), and every price **read from the named POS row,
never transcribed**. The catalog is now **97 items**; the backlog table dropped 98 → 60, and every
residual row is classified below.

**31 genuine adds — 1,450 units of Jan–Jul 2026 volume** (price = the POS ring; no photo yet, so the
designed `PhotoPlaceholder` renders; declared-only allergens — never `allergen-reviewed`; Burmese
descriptions awaiting the owner's K15 native check):

| Dish (EN)                      | မြန်မာ                | POS $  | Category           | 2026 units |
| ------------------------------ | --------------------- | ------ | ------------------ | ---------- |
| Pork Tamarind Stew             | ဝက်မကျည်းနှပ်         | $14.00 | curries-a-la-carte | 151        |
| Ngapi Sambal (Fried)           | ငပိကြော်              | $10.00 | sides              | 125        |
| Water Spinach Sour Soup        | ကန်စွန်းရွက်ချဥ်ရည်   | $14.00 | vegetables         | 98         |
| Bean Fritters                  | ပဲကပ်ကြော်            | $10.00 | appetizers-salads  | 97         |
| Beef Jerky (Grilled)           | အမဲခြောက်ဖုတ်         | $19.00 | curries-a-la-carte | 91         |
| Mohinga Soup (Side)            | ဟင်းခါးပွဲ            | $5.00  | sides              | 87         |
| Catfish Head Curry (Mon-Style) | ငါးခေါင်းမွန်ချက်     | $17.00 | seafood-curries    | 72         |
| Dried Silurus Fried            | ငါးကျည်းခြောက်ကြော်   | $25.00 | seafood-curries    | 68         |
| Kufee (Milk Cream)             | ကူဖီးနို့မလိုင်       | $5.00  | drinks             | 65         |
| Salted Fish Pounded Fried      | ငါးခြောက်ထောင်းကြော်  | $19.00 | seafood-curries    | 64         |
| Stir-Fried Water Spinach       | ကန်စွန်းရွက်ကြော်     | $14.00 | vegetables         | 63         |
| Chicken with Dregea            | ကြက်ဂွေးတောက်         | $14.00 | curries-a-la-carte | 58         |
| Chicken Salad                  | ကြက်သားသုပ်           | $15.00 | appetizers-salads  | 55         |
| Stir-Fried Mixed Greens        | အစိမ်းကြော်           | $14.00 | vegetables         | 53         |
| Sanwin Makin (Semolina Cake)   | ဆနွင်းမကင်း           | $10.00 | desserts           | 48         |
| Pork with Fermented Soybean    | ဝက်ပဲငပိ              | $14.00 | curries-a-la-carte | 45         |
| Dried Snakehead Grilled        | ငါးရံ့ခြောက်ဖုတ်      | $25.00 | seafood-curries    | 40         |
| Goat Brains Curry              | ဆိတ်ဦးနှောက်          | $30.00 | curries-a-la-carte | 22         |
| Salted Fish & Eggplant Stew    | ငါးခြောက်ခရမ်းသီးနှပ် | $14.00 | seafood-curries    | 20         |
| Crispy Shrimp in Fish Sauce    | ပုဇွန်ကြော်စပ်        | $15.00 | seafood-curries    | 18         |
| Coconut Sago                   | အုန်းနို့သာကူ         | $10.00 | desserts           | 17         |
| Balachaung (Side)              | ဘာလချောင်ပွဲ          | $3.00  | sides              | 14         |
| Grilled Fish                   | ငါးကင်                | $25.00 | seafood-curries    | 13         |
| Fermented Sesame Salad         | နှမ်းဖတ်ချဥ်သုပ်      | $12.00 | appetizers-salads  | 13         |
| Dried Goat                     | ဆိတ်သားခြောက်         | $30.00 | curries-a-la-carte | 12         |
| Fresh Fruit Platter            | သီးစုံအချိုပွဲ        | $12.00 | desserts           | 12         |
| Bombay Duck Grilled            | အာဗြဲခြောက်ဖုတ်       | $20.00 | seafood-curries    | 12         |
| Kayah Sausages                 | ကယားဝက်အူချောင်း      | $14.00 | curries-a-la-carte | 7          |
| Oil-Drizzled Rice with Peas    | ပဲပြုတ်ထမင်းဆီဆမ်း    | $10.00 | rice-noodles-soups | 6          |
| Shredded Beef Fry              | အမဲမွှကြော်           | $17.00 | curries-a-la-carte | 3          |
| Bottled Water                  | ရေသန့်ဗူး             | $1.00  | drinks             | 1          |

Plus a new **Desserts** category (sort 75) — sanwin makin, coconut sago and fresh fruits had no home.

**Everything skipped, and why** (the residual 60-row backlog table in the reference is exactly
these):

- **Duplicates under another spelling / word order / English-only label** (~25) — POS
  `ကြက်သဲမြစ်` = our `ကြက်အသဲမြစ်` (Chicken Giblets); `နန်းကြီးသုပ်` (1,702 units!) = our
  `နန်းကြီးမုန့်တီ`; word-swapped Biryani; English-only `Faluda` / `Everything Salad` /
  `Red Bull` / `Pop Soda` / `Coffee` / `shwekyi` (= sanwin makin). The Burmese-only join cannot see
  these; they stay in the backlog table by design rather than being force-matched.
- **4 catalog typos fixed** (they were hiding real matches): `လက်ဖတ် → လက်ဖက်` on burmese-milk-tea
  - pickled-tea-salad (laphet is လက်ဖက် — the catalog's own လက်ဖက်ထမင်း already spelled it right),
    `ငါးရံ → ငါးရံ့` (snakehead-innards-curry), `ထေါင်း → ထောင်း` (beef-pounded-deep-fried).
- **1 generator bug fixed, red-first**: the join compared non-NFC strings, so asat/dot-below
  ordering (`103A-1037` vs `1037-103A` — identical on screen) hid Rakhine Mont-Ti's 126-unit match.
  `myOnly` now NFC-normalizes. Same fix class as the ranking bug found in the same pass: one dish
  can own several exact-named POS rows (ပဲပြုတ်ထမင်းဆီဆမ်း is both the $10 dish and a $100 catering
  tray), so exact matches now prefer the price-agreeing row and a delta is flagged only when NO
  exact ring agrees.
- **Modifiers, not items**: `ကြက်ဥ Egg Add-on` $3 (our egg add-ons ring $1.50/$2.00 — price question
  for the owner); `Chicken Masala ကြက်ကလယ်` = chicken-curry's "Masala" style option.
- **Alcohol — NOT added** (Kirin, IPA 12/16oz, Guinness, Michelob, Soju, house red/white, ~49
  units): selling alcohol through the app is a licensing question the owner answers first.
- **Catering trays**: the $100 oil-rice tray, $20 parata rings.
- **≤2-unit noise**: one-off rings (`During`/`during`/`durian`, `parata`, `napi`, `pea`, `nan`,
  `chicken`, `wine`, misc misspellings of shwekyi…) — not menu items.

**Flagged for the owner, not built**: Hilsa `ငါး‌သလောက်ကြော်နှပ်` (261 units) — we carry steamed
(`ငါးသလောက်ပေါင်း`); fried-vs-steamed is a _naming/prep_ question (no prep modifier exists — verified
against prod); `Duck ဘဲသားဟင်း` (1 unit) and `Ginger Salad` (1 unit) — real dishes but one ring
each, owner should confirm they belong on the menu; `Fishcake Fried ငါးဖယ်ကြော်` (41 units) —
ambiguous against our fish-cake items; Nangyi `နန်းကြီးသုပ်` naming (thoke vs mont-ti) — classified as
our `နန်းကြီးမုန့်တီ`, but the owner may prefer the POS label; Egg Add-on $3 vs our $1.50/$2.00.

---

## Owner-side blockers unchanged by W17

C1 auth hardening · C2 Stripe live keys · C5 the 3 dishes still needing photography · C7 hardware ·
C11 kitchen modifier confirm · C14 fuzzy-match review · K15 native check of the Claude-authored
Burmese · `RESEND_RECEIPT_FROM`.
