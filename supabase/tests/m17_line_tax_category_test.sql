-- supabase/tests/m17_line_tax_category_test.sql  (M17)
--
-- A cart line must carry its own tax category, because the catalog can take it away.
--
-- `mms_set_line_fulfillment` recomputes a line's tax when the diner flips for-here ⇄ to-go, and used
-- to resolve the category from `menu_items` every time — coalescing a MISS to 'hot_prepared'.
-- `menu_item_id` is a soft text ref with no FK, so a pruned catalog row left a live draft line
-- pointing at nothing, and 'hot_prepared' is taxable in BOTH directions while cold food is exempt
-- to-go (CDTFA: cold to-go exempt, hot to-go taxable, dine-in all taxable, except groceries).
--
-- ⚠️ ASSERT ON THE CHARGE, NOT ON THE COLUMN. `getCartTotals` reads `tax_cents` only as a BOOLEAN —
-- a line joins the taxable base when `tax_cents > 0` (`totals-math.ts`). The first attempt at M17
-- compared the stored NUMBER before and after, which is why it "proved" a fix that changed nothing
-- the guest pays. Every money assertion below is written against `tax_cents = 0` / `> 0`, and the
-- exact integers are asked of the engine, never transcribed.
--
-- Measured on a real Postgres, catalog row pruned AFTER the line was minted:
--
--                        correct    before M17    refusing (rejected)   this fix
--     dine-in → to-go    exempt     TAXABLE       TAXABLE               exempt
--     to-go → dine-in    TAXABLE    TAXABLE       exempt                TAXABLE
--
-- Cases 3-5 are the ones that keep this honest: the fix must not change a single thing while the
-- item still resolves, and must not start exempting hot food.
--
-- Run against any QR DB (rolls back — leaves NO data behind):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/m17_line_tax_category_test.sql

begin;
-- W8: without this GUC every ASSERT below compiles out and the file exits 0 having proved nothing.
set local plpgsql.check_asserts = on;

do $$
declare
  ana   uuid := '00000000-0000-0000-0000-000001700a0a';
  cat   uuid := '00000000-0000-0000-0000-000001700ca7';
  cold  uuid := '00000000-0000-0000-0000-000001700c01';
  hot   uuid := '00000000-0000-0000-0000-000001700807';
  gone  uuid := '00000000-0000-0000-0000-0000017060e6';
  price integer := 1400;
  tax_in integer; tax_out integer;
  sess uuid; cart uuid; line uuid;
  r text; v_ful text; v_tax integer; v_cat text;
begin
  tax_in  := public.mms_line_tax(price, 'cold_food', true);
  tax_out := public.mms_line_tax(price, 'cold_food', false);
  assert tax_in > 0 and tax_out = 0,
    format('M17 fixture drift: cold food no longer separates dine-in (%s) from to-go (%s) — this '
           'test has nothing left to measure', tax_in, tax_out);

  insert into public.menu_categories (id, slug, name) values (cat, 'm17-fixture', 'M17 fixture');
  insert into public.menu_items (id, category_id, slug, name_en, base_price_cents, tax_category)
    values (cold, cat, 'm17-cold-dish', 'Pickled Tea Salad', price, 'cold_food'),
           (hot,  cat, 'm17-hot-dish',  'Shan Noodles',      price, 'hot_prepared'),
           (gone, cat, 'm17-pruned',    'Pruned Dish',       price, 'cold_food');

  sess := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat)
    values (sess, 'M17S1', 'dinein', 'active', ana);
  cart := gen_random_uuid();
  insert into public.qr_carts (id, session_id) values (cart, sess);

  -- ══ 1. the INSERT stamps the category onto the line ═══════════════════════════════════════════
  -- Everything below rests on this. Minted through the real RPC, never hand-inserted, so a stamp
  -- that silently stopped happening fails HERE rather than surfacing as a wrong tax three cases down.
  line := public.mms_cart_item_insert_if_open(
            cart, gone::text, 'Pruned Dish', '[]'::jsonb, price, tax_in, ana, 'dinein');
  select tax_category into v_cat from public.qr_cart_items where id = line;
  assert v_cat = 'cold_food',
    format('M17.1 the line was minted without its tax category: %L. Every guarantee below depends '
           'on the category being frozen at insert, while the item is certain to exist.', v_cat);

  -- ══ 2. THE DEFECT — item pruned, dine-in → to-go must become EXEMPT ═══════════════════════════
  delete from public.menu_items where id = gone;

  r := public.mms_set_line_fulfillment(line, 'togo');
  assert r = 'ok', format('M17.2 the toggle was refused after the item was pruned: %L', r);
  select fulfillment, tax_cents into v_ful, v_tax from public.qr_cart_items where id = line;
  assert v_tax = 0,
    format('M17.2 THE DEFECT: cold food in a bag is EXEMPT (CDTFA), but this line still carries '
           '%s¢ of tax, so getCartTotals folds its full $%s into the taxable base. Before M17 the '
           'category was re-resolved from a menu_items row that no longer exists and assumed '
           'hot_prepared — taxable both ways.', v_tax, price / 100.0);
  -- The tag has to MOVE, not merely stop being re-taxed. Refusing the toggle also leaves tax on the
  -- line, and additionally strands the box: mms_init_togo_status only stamps a cart holding a
  -- togo/grocery line, so a refused flip means the counter never sees a bag (M100's header).
  assert v_ful = 'togo',
    format('M17.2 the line never reached the bag: fulfillment=%L. A refusal is not a fix here — it '
           'leaves the same tax on the line AND takes the order out of the pickup pipeline.', v_ful);

  -- ══ 3. the other direction — to-go → dine-in stays TAXABLE ════════════════════════════════════
  -- The regression the rejected first attempt introduced. Dine-in is all taxable except groceries,
  -- so this line owes tax the moment it is eaten at the table; a guard that refuses here charges $0
  -- on premises. Under-collection, which M97 calls the legally worse direction.
  r := public.mms_set_line_fulfillment(line, 'dinein');
  assert r = 'ok', format('M17.3 the toggle back was refused: %L', r);
  select fulfillment, tax_cents into v_ful, v_tax from public.qr_cart_items where id = line;
  assert v_tax > 0 and v_ful = 'dinein',
    format('M17.3 food eaten at the table must be taxed: fulfillment=%L tax_cents=%s (expected '
           'dinein and > 0). The item is still pruned — the category has to come off the LINE.',
           v_ful, v_tax);

  -- ══ 4. HOT food is still taxable in the bag ══════════════════════════════════════════════════
  -- Without this, "make the pruned case exempt" could be satisfied by exempting everything to-go.
  line := public.mms_cart_item_insert_if_open(
            cart, hot::text, 'Shan Noodles', '[]'::jsonb, price, tax_in, ana, 'dinein');
  r := public.mms_set_line_fulfillment(line, 'togo');
  assert r = 'ok', format('M17.4 a hot line was refused its to-go toggle: %L', r);
  select tax_cents into v_tax from public.qr_cart_items where id = line;
  assert v_tax > 0,
    format('M17.4 hot food is taxable to-go (CDTFA) — this line came back at %s¢', v_tax);

  -- ══ 5. a LEGACY line — no stamp, item still resolves ═════════════════════════════════════════
  -- Rows written before this migration have no category. The catalog lookup survives as a bridge for
  -- exactly them, so they keep behaving correctly until their carts close. Simulated by clearing the
  -- stamp, which is what those rows look like.
  line := public.mms_cart_item_insert_if_open(
            cart, cold::text, 'Pickled Tea Salad', '[]'::jsonb, price, tax_in, ana, 'dinein');
  update public.qr_cart_items set tax_category = null where id = line;

  r := public.mms_set_line_fulfillment(line, 'togo');
  assert r = 'ok', format('M17.5 a legacy line was refused: %L', r);
  select tax_cents into v_tax from public.qr_cart_items where id = line;
  assert v_tax = 0,
    format('M17.5 a legacy line whose item still resolves must tax exactly as before: %s¢ on cold '
           'food to-go', v_tax);

  -- ══ 6. a grocery barcode must not raise out of the ::uuid cast ═══════════════════════════════
  -- `menu_item_id` is a barcode for scan lines. A bare cast raised 22P02 — a 500 to the diner rather
  -- than an answer — at insert AND on the toggle. The stamp is null for these, which is correct:
  -- groceries have no menu_items row, and the toggle refuses them by fulfillment anyway.
  line := public.mms_cart_item_insert_if_open(
            cart, '0123456789012', 'Rice 5kg', '[]'::jsonb, price, 0, ana, 'grocery');
  select tax_category into v_cat from public.qr_cart_items where id = line;
  assert v_cat is null, format('M17.6 a barcode line was stamped with a category: %L', v_cat);
  r := public.mms_set_line_fulfillment(line, 'togo');
  assert r = 'is_grocery',
    format('M17.6 a grocery line must refuse by fulfillment, not raise from a uuid cast: %L', r);

  -- ══ 7. a catalog CORRECTION still reaches a line already in an open cart ═════════════════════
  -- The behaviour a stamp-first read would have silently removed. Correcting a mis-classified dish
  -- is an established operation here (`supabase/data/w15_pos_apply.sql:30,33`), and one is still
  -- pending for `lemon-salad`. Before M17 the toggle re-read the catalog every flip, so the fix had
  -- to keep that: the snapshot answers only where the catalog cannot.
  line := public.mms_cart_item_insert_if_open(
            cart, cold::text, 'Pickled Tea Salad', '[]'::jsonb, price, tax_in, ana, 'dinein');
  select tax_category into v_cat from public.qr_cart_items where id = line;
  assert v_cat = 'cold_food', format('M17.7 fixture: the line was stamped %L, expected cold_food', v_cat);

  -- the operator corrects it: this dish is actually served hot, so it is taxable in a bag too
  update public.menu_items set tax_category = 'hot_prepared' where id = cold;

  r := public.mms_set_line_fulfillment(line, 'togo');
  assert r = 'ok', format('M17.7 the toggle was refused after a catalog correction: %L', r);
  select tax_cents into v_tax from public.qr_cart_items where id = line;
  assert v_tax > 0,
    format('M17.7 a corrected dish must ring its CORRECTED tax on lines already in the cart: this '
           'line came back at %s¢ on a hot dish sent to-go. Reading the stamp in preference to the '
           'catalog takes an operator''s correction away from every open cart — under-collection '
           'for a change they believe they just made.', v_tax);
  update public.menu_items set tax_category = 'cold_food' where id = cold;

  -- No case for "the catalog lookup must not ERASE the stamp" (plpgsql sets a SELECT INTO target to
  -- NULL when no row matches, so reading a pruned item straight into `v_cat` would wipe it). One was
  -- written and DELETED as degenerate: erasure falls back to 'hot_prepared', which is taxable, so any
  -- case expecting TAX still passes. Case 2 is the guard — it is the only one expecting EXEMPT on a
  -- pruned item, so it is the only one the erasure can fail. Adding a second, weaker case would have
  -- read as extra coverage while pinning nothing.

  raise notice 'M17 — 7 cases passed (cold % dine-in / % to-go)', tax_in, tax_out;
end $$;

rollback;
