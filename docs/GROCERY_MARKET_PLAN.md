# Grocery market plan — the road to #1 online Burmese grocery (that also delivers)

**2026-07-17 · plan-of-record for the grocery vertical.** Companion docs: `PRODUCTION_PLAN.md` §W4
(the build track this extends), `GROCERY_SCANGO.md` (in-store flow),
`mandalay-morning-star-delivery-app/docs/grocery-delivery-plan.md` (the delivery half, G-track).
Competitive teardowns run 2026-07-17 (live-site research; sources inline).

## 1 · Market read — the vertical is unowned

| Player                                                           | Model                                                  | Catalog                                                                                                                                                                                        | Shipping/delivery                                                                                         | Weakness we exploit                                                                                                                                                                              |
| ---------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Myanmar Food USA** (myanmarfoodusa.com, MD, since 2008)        | Shopify (stock Canopy theme), nationwide USPS Priority | **~2,680 SKUs** — the deepest US Burmese catalog; bilingual EN+MY titles; 15–20 direct-import brands (Yuzana, Shan Shwe Taung, OBO…); dish-centric collections (Tea Leaf Salad 56, Mohinga 40) | 4–5 day USPS; **no published rates, no free-ship threshold, the shipping-policy page is literally empty** | Cost-shock at checkout · content-desert PDPs (no ingredients/allergens/prep) · zero reviews (broken widgets) · stale merchandising (spring sale live in July) · no local delivery, no cold chain |
| **Shop Myanmar Food** (shopmyanmarfood.com, SF Bay Area, ~4 yrs) | WooCommerce/Elementor, nationwide                      | **~400 SKUs**; fully bilingual nav + Burmese-script category URLs; brand + category + sale sections                                                                                            | Ship: $35+ reduced, **$80+ free**; $10 off $100+                                                          | Small catalog · template-grade UX · no local same-week delivery outside Bay Area events · thin PDPs                                                                                              |
| **Amazon channel** (incl. our A3JK79JD48OQZQ storefront)         | Marketplace                                            | Hero SKUs only — laphet jars/kits, dressings, tea mixes (Shan Shwe Taung, Yellow Cheek, Pintaya…) with bilingual titles                                                                        | Prime speed                                                                                               | Marketplace fees force premium prices · no basket economics (one jar, not a pantry) · no brand loyalty accrues to the seller · discovery limited to shoppers who already search "laphet"         |
| **Weee!** (sayweee.com — the ethnic-grocery benchmark)           | Vertical e-grocer                                      | Chinese/JP/KR/Viet/Thai/Filipino/Indian **storefronts; Myanmar exists only as long-tail SEO keyword pages** — no Burmese vertical, no Burmese-language UX                                      | Nationwide, free-ship minimums, local next-day in metros                                                  | **The gap in one line: the Weee! playbook has not been run for the Burmese diaspora.**                                                                                                           |

Read: the incumbents prove demand (18 years, 2,680 SKUs) but compete on assortment alone. Nobody
combines **local delivery + in-store tech + bilingual-first UX + content-rich PDPs + honest
shipping economics**. LA County holds one of the largest Burmese communities in the US; we're in
it, with a restaurant halo the shippers can't copy.

## 2 · Positioning — how MMS wins

1. **"Arrives with your delivery day," not "4–5 days via USPS."** The delivery PWA's Mon/Wed/Thu/Sat
   routes + 50mi coverage beat every shipper inside our zone — and groceries count toward the
   existing $100 free-delivery bar (basket-builder). Published fees vs their empty policy page.
2. **Fresh + frozen later = a moat shippers structurally can't cross** (USPS can't cold-chain
   mohinga broth or laphet thoke made fresh by the restaurant). Restaurant-made ready-to-eat is our
   unique aisle.
3. **Bilingual-first, not bilingual-pasted.** Incumbents concatenate EN+MY in one title string. We
   ship structured `name`/`name_my`, Burmese search (script + romanization synonyms —
   laphet/lahpet/letphet as data), Padauk type, and (W5) a real app-wide EN↔MY toggle.
4. **Trust surface they don't have:** unit prices ($/100g), EBT tagging + honest SNAP copy,
   ingredients/allergen model (delivery repo already has the fail-safe pattern), reviews ungated,
   server-authoritative pricing.
5. **Three doors, one catalog:** in-store Scan & Go (live today), browse-to-basket (shipped in this
   PR), delivery aisle (G-track). Amazon stays a funnel for hero SKUs; the app is where the pantry
   basket lives.

## 3 · UX blueprint (evidence-traced)

- **Card anatomy** (Weee! pattern; shipped W4b): photo → EN name → MY name → brand · pack size →
  price + **$/100g** + EBT chip → one-tap add that becomes a stepper. Incumbent cards stop at
  image/title/price.
- **Aisle IA** (shipped W4a): 10 shopper aisles folded from the ~40 wholesale categories — signature
  aisles first (Tea Leaf & Laphet · Noodles & Mohinga · Canned Fish) because that's what the
  diaspora actually searches (myanmarfoodusa's top collections are exactly Tea Leaf Salad + Mohinga).
- **Dish-centric merchandising** (steal from myanmarfoodusa, do it better): later, "cook mohinga
  tonight" bundles that add the paste + noodles + fish sauce in one tap — pairs with the
  restaurant's recipes.
- **Brand as a first-class facet** (steal): Burmese shoppers are brand-loyal (Yuzana vs Shan Shwe
  Taung). `brand` is now a column; a brand rail/filter is a cheap follow-up.
- **Search** (shipped): trigram + synonym search over EN/MY/romanizations — neither incumbent
  handles "lahpet" typos or script-agnostic search.
- **Honest economics** (exploit their #1 weakness): fee/threshold surfaced in the aisle UI before
  checkout, never discovered at payment.

## 4 · What shipped today (this PR) vs the road

**Shipped (W4a+W4b):** 395-SKU real bilingual catalog (owner price lists → `supabase/data/`),
10-aisle schema + pg_trgm search, Browse|Scan over one cart, unit prices, EBT subtotal.
**Data gates (Min, = OPEN-ITEMS C5/C6):** ① confirm current retail prices before the live import
(`supabase/data/grocery_catalog_import.sql` — the seed prices are 2022 vintage), ② capture real
shelf UPCs (scan-and-go matching; synthetic 299-prefix codes hold the browse/search path
meanwhile), ③ per-SKU photos (shelf shots fine to start).

- **Now (W4c/W4d, this repo):** scanner craft · QR exit pass + staff scan view · weighed-item
  type-2 UPCs. Then W5 bilingual toggle (the moat's second half).
- **Next (G0–G1, delivery repo):** catalog seed-sync → `/grocery` aisle on the delivery PWA → one
  basket + category-aware grocery tax + fee-engine reuse. Plan: `grocery-delivery-plan.md`.
- **Later (G2+):** pack-time stock + substitutions · reorder rails + Stars on groceries ·
  dish-bundles + restaurant-made fresh/frozen aisle · nationwide shipping of shelf-stable
  (compete head-on where the incumbents live, with a modern storefront) · EBT/SNAP 2027
  (Forage/FNS; undated copy until authorized).

**Defensive note:** assortment is the incumbents' only moat (2,680 vs our 395). We close it by
onboarding the full Hinthar import list + POS SKUs over time — the importer pipeline
(`supabase/data/grocery_catalog.json` + upsert artifact) is built for incremental batches.

_Research sources: myanmarfoodusa.com (site + collections + FAQ/policy pages), shopmyanmarfood.com
(site, sitemaps, about — "Ship: $35+ reduced · $80+ FREE"), amazon.com Burmese-food listings
(Shan Shwe Taung / Yellow Cheek / Pintaya laphet PDPs), sayweee.com explore pages (Myanmar as
keyword-only coverage)._

## Pricing — the Sale layer (W4e, 2026-07-18)

The 2022 price list is our **charged** price (`price_cents`) — genuinely below today's market because
it's 3–4 years old. We surface that as a value story honestly:

- **"Compare at $X", not "Was $X".** The struck reference (`grocery_items.compare_at_cents`) is a
  **market comparison**, never a former price of ours — the FTC-defensible construction (the
  TJ-Maxx "Compare At" pattern). We never imply the item once sold here at the higher price.
- **Grounded in real sampled competitor prices**, not invented markups (the house "never fabricate"
  bar). Per-category multipliers were derived from live 2026-07 sampling of myanmarfoodusa.com +
  shopmyanmarfood.com (size-comparable products): tea-laphet ≈1.75, noodles-mohinga ≈1.6,
  canned-fish ≈1.35, snacks ≈1.35, preserved-fruit ≈1.4, canned-veg ≈1.5, coffee ≈1.45,
  cooking ≈1.3. **health + home-personal are excluded** — their sampled market wasn't clearly above
  ours, so no defensible compare-at exists.
- **Guardrails (all in `gen_seed.py compare_at_for`):** advertised discount capped at **≤40%**
  (within observed competitor homepage sales); an absolute **per-category ceiling** = the real
  sampled competitor high, so a compare-at can never exceed a price a competitor was actually seen
  charging (a premium/above-median item that can't clear the bar honestly simply shows no sale);
  **bulk multipacks** (>3× the category single-unit median) are skipped (no comparable single-unit
  reference); charm-rounded; and the **DB CHECK `compare_at_cents > price_cents`** guarantees a sale
  is always a real discount. Result: **313/396 SKUs on sale, 11–40% off (avg ~29%)**.
- **Popular aisles** (tea-laphet · noodles-mohinga · canned-fish · snacks · preserved-fruit) badge
  broadly; the other food aisles badge only where they clearly beat market (≥15%). The **charged
  price is unchanged** — the Sale layer is display-only; checkout still re-derives every amount
  server-side. The basket shows a real **"You're saving $X vs. typical market prices."**
- **Owner review:** the compare-at values are a category-model estimate; confirm they read fairly
  for your catalog, and refresh the multipliers when you capture direct per-SKU competitor prices.
