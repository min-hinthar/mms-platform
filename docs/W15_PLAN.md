# W15_PLAN — POS truth (real Zettle data → menu · grocery · favorites)

**Status: SHIPPED (2026-08-15; PR #172 merged, prod-applied + probe-verified: kyay-o 2000 · tea salad 1400 · 10 popular tags · 6 new dishes w/ correct tax classes · 404 grocery rows incl 9 HM15xx · 0 compare_at violations).** Owner directive: "learn from real POS data to update dine-in,
take-out, and grocery items, and feature customer favorites to enhance UI/UX." Source artifacts
(owner-uploaded, session scratchpad as normalized JSON): the **Zettle item library export**
(2026-07-31, 439 items, per-item price + Dine-In Service Charge / L.A CA Sales Tax / Tax-exempt
flags) and **Sales by product Jan–Jul 2026** (232 rows, sold quantity + revenue per item —
six months of real teahouse history).

## What the data says (computed, not transcribed — see scratchpad `zettle_rankings.json`)

- **Favorites are unambiguous.** Top sellers by quantity: Rice (1,972) · Tea (1,653) · Nangyi
  (1,074 + 638 to-go) · Mohinga (846 + 223) · Kyay-O SiChat (791 + 478 + 241) · Meeshay (564 + 231) · Faluda (458 + 238) · Pork Skewers (447 + 220) · Roselle Shrimp (400) · Tea Salad (367)
  · Shan Noodles (267) · Chicken curry (259 + 259) · Catfish (243) · Coconut Noodles (242).
- **The app's prices already agree with the POS on nearly every matched dish** (Mohinga $14,
  Kyay-O $18, Meeshay $14, Faluda $9, Pork Skewers $15, Shan $13, Nangyi $13 …) — the catalog
  is truthful. Real deltas found: **Tea Salad $12 (app) vs $14 (POS)**; a Kyay-O $20 protein
  variant rides modifiers (no base change).
- **High-volume dishes MISSING from the app menu**: Veggie Fritters (289 sold) · NgaPi &
  Veggies ငပိတို့စရာ (237) · Malar Spicy Beef (214) · Chicken Liver (190) · Rakhine-style rows
  to verify against `rakhine-mont-ti` · Mixed Vegetable soup (112) · packaged drinks (Red Bull
  SHARK 503, sodas 162).
- **Tax shape matches the engine's categories**: dine-in food = service charge + sales tax;
  take-out food = sales tax only; Myanmar Store SKUs ride untaxed (grocery_food). Two **config
  discrepancies are owner decisions, NOT silently changed** (→ OPEN-ITEMS):
  - POS flags a **15% Dine-In Service Charge**; the app charges + discloses **5%** (SB-1524).
  - POS sales tax is **10.5% (L.A)**; the app `RATE = 0.0975` (Covina) — one-line + SQL-mirror
    change once the owner confirms the store's actual situs rate.

## The design (extend what exists — never a fourth favorites concept)

The map (in-session Explore) pinned the existing machinery: `getMostLoved()`
(`lib/menu/mostLoved.ts`) computes REAL QR-order favorites (60-day window) and supersedes the
hand-set `popular` tag fallback (`lib/menu/badges.ts` — "Table favorite" > "Popular";
`MenuBrowser.tsx` StartHereBand pool). Today the fallback layer is guesswork: **1 of 60 rows**
tagged. W15 makes the fallback layer TRUE — the POS's six months of history IS the crowd until
QR's own history outgrows it (by design, no code change needed to the precedence).

- **W15a · Menu truth**
  - Stamp `popular` onto the POS-proven top sellers (~10 dishes, per-category winners; keeps
    the band's 6-cap meaningful). Seed + prod data update; no schema change.
  - Price corrections where the POS disagrees (Tea Salad 1200 → 1400; full matched-delta sweep
    computed in-build, never transcribed).
  - Add the missing high-volume dishes as real menu rows (name_en + name_my from the POS
    strings — K15-flagged; honest short descriptions; category-mapped; `hot_prepared` unless
    category says otherwise; no fabricated photos — `image_url` placeholder pattern).
- **W15b · Grocery truth**
  - Match Myanmar Store (197 POS items) + Grocery (11) against `grocery_items` (395 SKUs) by
    name/name_my; correct drifted prices; flag POS items absent from the catalog.
  - Ground `is_featured_deal` / merchandising in REAL sellers (Balachaung, Ngapi Sambal, Beef
    Jerky lead grocery sales) — featured stays a stored decision (W9d), now data-informed.
- **Prod apply** — data-only `update`/`insert` script, applied post-merge via the MCP
  execute_sql catch-up flow (the W4e pattern), verified with count/price probes.
- **Registry** — the two config discrepancies + POS items deliberately not added (Custom
  Amount, 21+ alcohol without license flow) + C11 unchanged.

## Rules that bind

- Charged amounts stay server-derived; this slice changes DATA (prices/tags/rows), never money
  code. Every number lands via computed script output — the no-transcription rule.
- The `popular` tag is the ONLY featuring channel touched; "Table favorite" (computed) and
  diner hearts (personal) are untouched.
- New MY strings are POS-verbatim where the POS carries them (owner-authored!), K15 the rest.

## What shipped (the build's actual decisions)

- **Menu — 10 price corrections** to the 2026-07-31 library's dine-in price (computed, per-slug
  guarded `and base_price_cents = <old>`): Kyay-O 18→20 · Tea Salad 12→14 · Coffee 6.50→5 ·
  Fried Rice 13→12 · Fish Paste Curry 14→12 · Pinto Beans 14→12 · Pork Offal 14→15 · Acacia
  Shrimp 14→15 · Coconut Chicken Rice 14→17 · Coconut Rice 3→3.50. Where POS prices dine-in and
  to-go differently (e.g. Beef Pounded 19/17), the app keeps the DINE-IN price (single-price
  model) — registry note.
- **Menu — 9 new `popular` tags** (POS top sellers; joins the pre-tagged Nan-Gyi): mohinga ·
  kyay-o · mee-shay · faluda · pork-skewers · roselle-with-shrimp-curry · pickled-tea-salad ·
  shan-noodles · chicken-curry. Rice/tea are staples, deliberately not "favorites."
- **Menu — 6 missing high-sellers added** (POS names verbatim, MY from the POS where present,
  K15 the rest): Veggie Fritters $12 · NgaPi & Veggies $10 · Malar Spicy Beef $17 · White Peas
  $5 · Red Bull - SHARK $4 · Pop Soda $3. The two packaged drinks are pinned
  `retail_nonfood` — carbonated/energy drinks are ALWAYS taxable in CA; the drinks category's
  `beverage_cold` would exempt them to-go.
- **Grocery — 60 exact-match price updates** to real shelf prices (≥85% token overlap + same
  size + |Δ|≥10¢; `price_source: zettle_pos_jul2026`; compare_at cleared when it would violate
  the CHECK) + **9 new house SKUs** (Balachaung jar, dried goat/fish/crickets/chili/kathapaung —
  synthetic 29915-prefix EAN-13s, same convention as W4a).
- **Prod apply artifact**: `supabase/data/w15_pos_apply.sql` (guarded updates + idempotent
  inserts) — run post-merge via MCP execute_sql, verify with probes.
- **Featured-deal refresh from sales**: deliberately NOT done — `is_featured_deal` is SALE
  merchandising (W9d); POS bestsellers ≠ deals. Registry.

## Fuzzy matches — NOT applied (owner review; POS name vs catalog name)

| POS item                               | POS $  | Catalog item                           | App $  | overlap |
| -------------------------------------- | ------ | -------------------------------------- | ------ | ------- |
| Analgesic Balm - U Sai                 | $3.00  | Analgesic Balm - U Sai                 | $41.86 | 1.0     |
| Deied Strawberry-200g (Tone Tone)      | $3.90  | Dried Strawberry (200g) - Tone Tone    | $4.49  | 0.75    |
| Onion Frd Bot(Sein Hinthar)-454g       | $3.58  | Ka Yin Gyi - Salted Fish Small Bot(454 | $5.72  | 0.67    |
| Silurus Fish Sauce ငါးကျည်းငံပြာရည်ကြေ | $10.00 | Fish Curry Sauce (US)                  | $2.92  | 0.67    |
| Boiled Yellow Pea-400g                 | $4.00  | Boiled Yellow Bea-400g                 | $3.90  | 0.75    |
| Snack Crispy- Hot Hot Assorted         | $2.60  | Snack Crispy- Hot Hot                  | $2.99  | 0.75    |
| Bombay Duck Fish အာဗြဲခြောက်ဖုတ်       | $20.00 | Fried Bombay Duck Fish - Times Mon     | $5.85  | 1.0     |
| Zayan Tea Lvs Bot                      | $6.44  | Tea Lvs H&S Bot - Zayan (Sein Hinthar) | $2.86  | 1.0     |
| Salted Fish Dried ငါးပုပ်ခြောက်ဖုတ်    | $25.00 | Fried Dried Fish with Tomato           | $4.29  | 0.67    |
| Dried Fish                             | $13.00 | Fried Dried Fish with Tomato           | $4.29  | 1.0     |
| Snack Crispy- Hot Hot Crab Masalar     | $2.60  | Hot Hot Crab Masala Snack              | $2.99  | 0.6     |
| Brooms                                 | $10.00 | Brooms                                 | $2.99  | 1.0     |
| Shan Yoma Balm                         | $3.00  | Shan Yoma Balm                         | $44.85 | 1.0     |
| Kaung Htike-Assorted Fries             | $3.58  | Assorted Fried Snack - Kaung Htaik     | $4.11  | 0.75    |

Plus three dropped ambiguities: `SD0111` (house Balachaung jar ≠ branded Red Fish Balachaung —
resolved by the new HM1501 house SKU) · `BK0102` (two POS sizes map one SKU) · `MD0110`
(salted-lemon size ambiguity).

## Owner decisions surfaced (config, deliberately untouched)

1. **Service charge**: POS flags dine-in items 15%; the app charges + discloses 5% (SB-1524).
2. **Sales tax rate**: POS = 10.5% (L.A); app `RATE = 0.0975` (Covina) in `lib/tax.ts` + the
   SQL mirror. One-line change each once the store's situs rate is confirmed.
