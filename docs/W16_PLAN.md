# W16_PLAN — The owner's reset (bilingual-only · mode prices · confirms · photos · polish)

**Status: PLANNING (2026-08-15).** Owner directives (verbatim intent, 2026-08-15):

1. **"Ditch the language toggle and have bilingual only."** Remove the W5 EN↔MY toggle + locale
   switching; every surface shows BOTH tongues stacked (the W12/W13 idiom — EN primary, MY accent
   with `lang="my"` + Padauk). The `lib/i18n` dictionaries stay as the bilingual string source;
   the cookie/provider/proxy/profile-sync plumbing goes.
2. **"Why did photos of some menu items like Kyay-O disappear? Should use existing photos."**
   ROOT-CAUSED: W13 filtered `fallback.jpg` as a generic placeholder, but an HTTP probe of the
   storage bucket proves every `menu-photos/<id>/fallback.jpg` is a UNIQUE REAL dish photo
   (distinct sizes/etags — Kyay-O's is its own 35KB image; `photo.jpg` 400s for those items).
   Fix = remove the filename filter; the existing photos come back everywhere.
3. **"Texts, fonts, contents, surfaces, layers properly displayed with enough paddings and
   margins."** A concrete spacing/typography sweep (bilingual stacked labels need vertical
   breathing room; long Burmese runs need wrap safety).
4. **"Important buttons like Send to kitchen (Kitchen သို့ မှာယူရန် အတည်ပြုပါပြီ) or finalize
   pay bill should ask to confirm decision."** Confirm step on the two irreversible CTAs,
   bilingual copy (owner-authored MY for the kitchen confirm).
5. **"No more service charge or dine-in charge. Raise dine-in prices by 15% and take-out prices
   by 5%, round off to nearest .25. And 10.5% LA sales tax is correct."** The money model
   changes: the 5% service charge is REMOVED (its SB-1524 disclosure with it — nothing to
   disclose); prices become MODE-DERIVED from the stored base:
   `dinein = round25(base × 1.15)` · `togo = round25(base × 1.05)` · grocery = base;
   `round25(c) = round(c/25)·25`. Tax `RATE` 0.0975 → **0.105** (TS + SQL mirror + parity tests
   — closes C13; C12 closes as "no service charge at all").

## The money design (W16a — compute, never store)

- **One pure rule**: `lib/mode-price.ts` — `modePriceCents(baseCents, fulfillment)` with pinned
  constants (1.15 / 1.05 / round-to-25¢). Applied to the SUM (base + modifier deltas) at the one
  place unit prices are derived (`priceItem`/add paths), so modifiers inherit the mode factor and
  the rounded price is what the line stores, the kitchen sees, and the totals engine sums.
  Computing (not storing two columns) keeps `base_price_cents` the single menu anchor — the
  POS-verified W15 prices — and covers prod-only rows automatically.
- **The line re-prices on a mode flip**: `setLineFulfillment` (dinein↔togo) must re-derive
  `unit_price_cents` + `tax_cents`, not just the tax flag (map confirms the exact hook).
- **Menu display shows the session-mode price** (cards, item sheet, rails, kiosk, register).
- **Service charge → 0 everywhere**: `totals-math` drops the 5% limb (field stays, always 0 —
  `qr_orders.service_charge_cents` keeps its column; render sites already gate on `> 0` go
  silent for free); split-math's service limb allocates 0; SB-1524 disclosure strings and the
  "Service charge (5%)" rows are REMOVED (not hidden) from Checkout/receipt/email/i18n dict.
- **Tax 10.5%**: `lib/tax.ts` RATE + the SQL `mms_line_tax` mirror in ONE slice (both sides
  pinned by the parity tests); every hardcoded test expectation recomputed in-shell (the
  no-transcription rule); verify-slice mutant find-strings updated (rate + service mutants).
- **Reference table** (computed from current bases — scratchpad `w16_price_table.json`):
  Kyay-O 20.00 → 23.00 / 21.00 · Mohinga 14.00 → 16.00 / 14.75 · Tea Salad 14.00 → 16.00 /
  14.75 · Faluda 9.00 → 10.25 / 9.50 · Rice 2.00 → 2.25 / 2.00 · Crab Masala 30.00 → 34.50 /
  31.50 (full 63-row table in the scratchpad; prod-only rows priced by the same rule at
  runtime).

## Slices

- **W16a · Money** — mode-price rule + service-charge removal + 10.5% tax (TS+SQL+tests+mutants).
- **W16b · Bilingual-only** — toggle/locale plumbing removed; dictionary-driven stacked
  bilingual render at the W5-L2 sites; `<html lang="en">` fixed; body.my CSS out, `[lang="my"]`
  typographic rules stay.
- **W16c · Confirms** — bilingual confirm step on Send-to-kitchen (owner MY: "Kitchen သို့
  မှာယူရန် အတည်ပြုပါပြီ") and the finalize-pay CTA; a11y-complete (focus, 44px, one live region).
- **W16d · Photos** — remove the fallback.jpg filename filter (W13 learning corrected); real
  photos return on menu/cart/history/favorites.
- **W16e · Polish** — the mapped spacing/typography fixes (top-25, token-pure).

Maps: in-session workflow (4 lenses) — findings folded in below when complete.
