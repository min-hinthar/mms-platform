-- W17d-1 — align the catalog to the most recent POS reference (owner, 2026-08-16: "prices should be
-- most recent POS 2026 reference").
--
-- W17a established that the register's price IS the price. The generated reference
-- (docs/data/MENU_REFERENCE.md, from the Jan–Jul 2026 Zettle export) found exactly TWO dishes where
-- ours disagreed with what the register rings, both matched on the BURMESE name — the reliable key,
-- since POS and catalog English labels diverge freely:
--
--   Balachaung  ဘာလချောင်ကြော်   $3.00  → $10.00   (269 units in 2026)
--   Crab Masala ဂဏန်းမဆလာ        $30.00 → $35.00   (93 units)
--
-- Balachaung is the large move, and it was flagged to the owner as possibly a different dish — ours
-- read as a $3 condiment side, the POS ring as the $10 fried version. The Burmese names match
-- exactly, and the owner's answer was to follow the POS. Recorded here so the reasoning survives:
-- if a $3 side genuinely exists alongside the $10 dish, it is a SECOND menu item, not this one.
--
-- Only these two. Approximate (`≈`) name matches in the reference are deliberately untouched — one
-- name merely containing another is not evidence about price (ပဲပြုတ် "White Peas" is a substring of
-- ပဲပြုတ်ထမင်းကြော် "Burmese Fried Rice", two different dishes).
--
-- Guarded on the CURRENT value, not just the slug: re-running this after a manager has since edited
-- a price from /staff/menu must not stomp their decision. A second run is a no-op either way.

update public.menu_items
   set base_price_cents = 1000
 where slug = 'balachaung' and base_price_cents = 300;

update public.menu_items
   set base_price_cents = 3500
 where slug = 'crab-masala-curry' and base_price_cents = 3000;
