-- supabase/tests/m17_unknown_item_tax_test.sql  (M17)
--
-- `mms_set_line_fulfillment` recomputes a line's tax from its menu item's `tax_category`. That
-- category can fail to resolve, because `menu_item_id` is a SOFT text ref with no FK
-- (`20260618000000_qr_platform_init.sql:146-157`), and the function used to answer the failure by
-- assuming 'hot_prepared' — which is taxable BOTH ways, while the categories that separate the two
-- tags are exempt to-go under CDTFA Reg 1603.
--
-- Measured against the pre-M17 body on a real Postgres, one $14.00 cold-food line, dine-in → to-go:
--
--     item present   -> ok    tax_cents 147 -> 0     ← correct
--     item DELETED   -> ok    tax_cents 147 -> 147   ← the defect: tax on an exempt transaction
--
-- Cases 1-2 are the two ways the category fails to resolve. Cases 3-5 are the ones that keep the
-- refusal HONEST: over-blocking is as bad as under-blocking, so a guard written as "refuse whenever
-- the tax would change" or "refuse every toggle" passes 1-2 and fails here. Case 5 is also what
-- makes case 1 legible — it proves 147¢ is what a genuinely HOT line pays to-go, so the number the
-- defect produced was the fallback's answer and not a coincidence of the fixture.
--
-- `plpgsql` ASSERT stops at the FIRST failure, so red-then-green on this file is a claim about case
-- 1 only (`.claude/LEARNINGS.md` #51). Each case is proven falsifiable individually by the
-- `toggle/unknown-item-*` mutants in `scripts/verify-mode-authority.mjs`.
--
-- Run against any QR DB (rolls back — leaves NO data behind):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/m17_unknown_item_tax_test.sql

begin;
-- W8: without this GUC every ASSERT below compiles out and the file exits 0 having proved nothing.
set local plpgsql.check_asserts = on;

do $$
declare
  ana   uuid := '00000000-0000-0000-0000-000001700a0a';
  cat   uuid := '00000000-0000-0000-0000-000001700ca7';
  cold  uuid := '00000000-0000-0000-0000-000001700c01';
  hot   uuid := '00000000-0000-0000-0000-000001700807';
  gone  uuid := '00000000-0000-0000-0000-0000017060e6';   -- inserted, then DELETED: the M17 shape
  price integer := 1400;
  tax_in  integer;                          -- what the ENGINE says a dine-in cold unit owes
  tax_out integer;                          -- …and a to-go one
  tax_hot integer;                          -- …and a hot one to-go
  sess uuid; cart uuid; line uuid;
  r text; v_ful text; v_tax integer;
begin
  -- The tax engine is the fixture, never the expectation: ask it, don't transcribe it. If a rate or
  -- category change ever makes cold food stop separating the two tags, THIS fails with a readable
  -- message instead of the cases below failing for a reason nobody can trace.
  tax_in  := public.mms_line_tax(price, 'cold_food', true);
  tax_out := public.mms_line_tax(price, 'cold_food', false);
  tax_hot := public.mms_line_tax(price, 'hot_prepared', false);
  assert tax_in > 0 and tax_out = 0,
    format('M17 fixture drift: cold food no longer separates dine-in (%s) from to-go (%s) — this '
           'test has nothing left to measure', tax_in, tax_out);
  assert tax_hot = tax_in,
    format('M17 fixture drift: the hot_prepared fallback no longer produces the dine-in number '
           '(hot to-go %s vs cold dine-in %s), so case 1 would no longer show the over-collection '
           'as a NON-CHANGE', tax_hot, tax_in);

  insert into public.menu_categories (id, slug, name) values (cat, 'm17-fixture', 'M17 fixture');
  insert into public.menu_items (id, category_id, slug, name_en, base_price_cents, tax_category)
    values (cold, cat, 'm17-cold-dish', 'Pickled Tea Salad', price, 'cold_food'),
           (hot,  cat, 'm17-hot-dish',  'Shan Noodles',      price, 'hot_prepared'),
           (gone, cat, 'm17-pruned',    'Pruned Dish',       price, 'cold_food');

  -- One dine-in session for every case: M100 already bounds WHICH tags a session may reach, and a
  -- non-dine-in session would short-circuit at `not_dinein_session` before reaching this rule.
  sess := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat)
    values (sess, 'M17S1', 'dinein', 'active', ana);
  cart := gen_random_uuid();
  insert into public.qr_carts (id, session_id) values (cart, sess);

  -- ══ 1. THE DEFECT — the item is gone, so the tax is unknowable ════════════════════════════════
  line := gen_random_uuid();
  insert into public.qr_cart_items (id, cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (line, cart, gone::text, 'Pruned Dish', 1, price, tax_in, ana, 'dinein');
  delete from public.menu_items where id = gone;

  r := public.mms_set_line_fulfillment(line, 'togo');
  assert r = 'unknown_item',
    format('M17.1 THE DEFECT: the menu item is gone, so this line''s tax category is unknowable — '
           'and the RPC answered %L instead of refusing. The pre-M17 body assumed hot_prepared, '
           'which is taxable BOTH ways, so a cold line went to-go still carrying %s¢ of tax on a '
           'transaction CDTFA Reg 1603 exempts.', r, tax_in);
  -- The refusal is only half of it: assert the ROW. A function can refuse in its return value and
  -- still have written (this repo''s most expensive lesson, one process boundary out).
  select fulfillment, tax_cents into v_ful, v_tax from public.qr_cart_items where id = line;
  assert v_ful = 'dinein',
    format('M17.1 the RPC refused but the row moved anyway: fulfillment=%L', v_ful);
  assert v_tax = tax_in,
    format('M17.1 the RPC refused but re-taxed the line anyway: tax_cents=%s, expected %s',
           v_tax, tax_in);

  -- ══ 2. the OTHER unresolvable shape — a non-uuid id is a reason, not a 500 ════════════════════
  -- A grocery barcode on a line whose fulfillment is not 'grocery'. Nothing in `apps/` writes that
  -- shape today (scanAdd tags grocery; the S4 backfill did too), but `menu_item_id` is plain text
  -- with no constraint, and `v_mid::uuid` on one raised 22P02 — a 500 to the diner rather than a
  -- verdict. Same question as case 1, different symptom, so the same answer.
  line := gen_random_uuid();
  insert into public.qr_cart_items (id, cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (line, cart, '0123456789012', 'Barcode Line', 1, price, tax_in, ana, 'dinein');

  r := public.mms_set_line_fulfillment(line, 'togo');
  assert r = 'unknown_item',
    format('M17.2 a non-uuid menu_item_id must refuse by NAME, not raise 22P02 out of the cast: %L', r);

  -- ══ 3. over-blocking — a REAL cold line still goes to-go, and stops being taxed ═══════════════
  -- The case a guard written as "refuse whenever the tax would change" destroys. This is the whole
  -- point of the toggle: cold food is taxable at the table and exempt in the bag.
  line := gen_random_uuid();
  insert into public.qr_cart_items (id, cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (line, cart, cold::text, 'Pickled Tea Salad', 1, price, tax_in, ana, 'dinein');

  r := public.mms_set_line_fulfillment(line, 'togo');
  assert r = 'ok', format('M17.3 a real cold-food line was refused its to-go toggle: %L', r);
  select fulfillment, tax_cents into v_ful, v_tax from public.qr_cart_items where id = line;
  assert v_ful = 'togo' and v_tax = tax_out,
    format('M17.3 the toggle landed wrong: fulfillment=%L tax_cents=%s, expected togo/%s',
           v_ful, v_tax, tax_out);

  -- ══ 4. …and back again ═══════════════════════════════════════════════════════════════════════
  -- The reverse direction, because a guard that only lets tax DROP passes case 3 and fails here.
  r := public.mms_set_line_fulfillment(line, 'dinein');
  assert r = 'ok', format('M17.4 the same line was refused its for-here toggle: %L', r);
  select fulfillment, tax_cents into v_ful, v_tax from public.qr_cart_items where id = line;
  assert v_ful = 'dinein' and v_tax = tax_in,
    format('M17.4 the toggle back landed wrong: fulfillment=%L tax_cents=%s, expected dinein/%s',
           v_ful, v_tax, tax_in);

  -- ══ 5. a REAL hot line is still taxable to-go ════════════════════════════════════════════════
  -- What makes case 1 readable: 147¢ is genuinely what a hot line pays in the bag, so the number the
  -- defect produced was the fallback's answer for a category the line did not have. A fix that
  -- refused ALL of them, or one that quietly zeroed the unresolvable case instead of refusing it,
  -- both pass 1-2 and fail here.
  line := gen_random_uuid();
  insert into public.qr_cart_items (id, cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (line, cart, hot::text, 'Shan Noodles', 1, price, tax_in, ana, 'dinein');

  r := public.mms_set_line_fulfillment(line, 'togo');
  assert r = 'ok', format('M17.5 a real hot-food line was refused its to-go toggle: %L', r);
  select tax_cents into v_tax from public.qr_cart_items where id = line;
  assert v_tax = tax_hot,
    format('M17.5 hot food must stay taxable to-go: tax_cents=%s, expected %s', v_tax, tax_hot);

  -- RAISE's placeholder is a bare `%`, not `%s` — that belongs to format(), which every assert
  -- above uses correctly. The first cut printed "cold 147s dine-in" and would have read as
  -- correct forever.
  raise notice 'M17 — 5 cases passed (cold % dine-in / % to-go, hot % to-go)',
    tax_in, tax_out, tax_hot;
end $$;

rollback;
