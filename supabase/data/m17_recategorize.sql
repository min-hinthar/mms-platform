-- Companion statement for any correction to `menu_items.tax_category` (M17).
--
-- Since `20260826000000_m17_line_tax_category.sql`, a cart line carries its own `tax_category`,
-- stamped at insert. `mms_set_line_fulfillment` reads the CATALOG first and falls back to that
-- stamp, so a correction DOES reach lines already in an open cart on their next for-here/to-go flip
-- — the behaviour that existed before M17 is preserved, and `m17_line_tax_category_test.sql` case 7
-- pins it.
--
-- What the stamp still holds, and why this file exists: a line's `tax_cents` was computed from the
-- OLD category when it was added, and a line nobody flips is never recomputed at all. So after a
-- correction, run this to bring open draft lines' stored tax into line with the corrected category.
-- Without it a mis-classified dish keeps its old taxability on every line already in a cart until
-- someone happens to tap the pill.
--
-- Scope is deliberate: DRAFT lines on OPEN carts only. A fired line belongs to the kitchen and a
-- closed cart is a settled receipt — neither may be re-taxed after the fact (the receipt is a
-- fulfillment-time snapshot rendered verbatim, CLAUDE.md).
--
-- Usage: run AFTER the `update menu_items set tax_category = …` in the same session.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/data/m17_recategorize.sql

begin;

update public.qr_cart_items ci
   set tax_category = mi.tax_category,
       tax_cents    = public.mms_line_tax(ci.unit_price_cents, mi.tax_category,
                                          ci.fulfillment = 'dinein')
  from public.menu_items mi, public.qr_carts c
 where c.id = ci.cart_id
   and c.status = 'open'
   and ci.state = 'draft'
   and ci.fulfillment <> 'grocery'
   -- `menu_item_id` is a soft text ref: a grocery barcode is not a uuid, and a bare cast raises 22P02.
   and ci.menu_item_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   and mi.id = ci.menu_item_id::uuid
   and ci.tax_category is distinct from mi.tax_category;

-- Read the affected lines back before committing. `tax_cents` is what `getCartTotals` reads as a
-- BOOLEAN taxable flag, so eyeball the 0 / non-0 column, not the magnitude.
select ci.id, ci.name, ci.fulfillment, ci.tax_category, ci.tax_cents,
       case when ci.tax_cents > 0 then 'TAXABLE' else 'exempt' end as charged
  from public.qr_cart_items ci
  join public.qr_carts c on c.id = ci.cart_id
 where c.status = 'open' and ci.state = 'draft'
 order by ci.name;

commit;
