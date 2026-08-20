-- supabase/tests/m96_merge_keeps_adder_test.sql  (M96)
--
-- `mms_merge_table_orders` folds a source line into a matching target line by bumping the target's
-- qty and DELETING the source row. M87 made that dangerous: a line re-parented by an EARLIER merge
-- is seatless (`by_seat = null`) but keeps its `added_by`, so a twice-merged table could fold a dish
-- B chose into a line A chose, delete B's row, and leave B with no record of it.
--
-- Three cases, driven by the REAL merge RPC — never by a hand-written fold (W23d's lesson that a
-- guard fed by a fixture proves the fixture):
--
--   0. A STAFF-added target and a DINER-added source — DOES NOT FOLD. This is the shape that needs
--      no prior merge at all, and the one the first draft of this note under-told: a staff line is
--      seatless and adderless from the start, so before this change a diner's very first merge into
--      one deleted their row.
--   1. Both sides seatless AND adderless (a staff-added line on each table) — STILL FOLDS. This is
--      the case the fold exists for, and the one a careless `=` instead of `is not distinct from`
--      would silently break, since `null = null` is null.
--   2. Different adders — DOES NOT FOLD. The source re-parents as its own line and keeps its adder,
--      so both diners still own what they chose.
--   3. Same adder on both sides — STILL FOLDS. Narrowing the match must not cost the legitimate case.
--
-- Plus the invariant underneath all three: a re-parent clears the SEAT and never the ADDER.
--
-- Run against any QR DB (rolls back — leaves NO data behind):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/m96_merge_keeps_adder_test.sql

begin;
-- W8: without this GUC every ASSERT below compiles out and the file exits 0 having proved nothing.
set local plpgsql.check_asserts = on;

do $$
declare
  ana  uuid := '00000000-0000-0000-0000-0000009600a0';
  ben  uuid := '00000000-0000-0000-0000-0000009600b0';
  dish text := 'cccccccc-0000-4000-8000-000000000d96';
  src_sess uuid; tgt_sess uuid; src_cart uuid; tgt_cart uuid;
  n integer; got uuid; moved integer;
begin
  -- ══ 1. both adderless — the fold must survive the narrowing ═══════════════════════════════════
  src_sess := gen_random_uuid(); tgt_sess := gen_random_uuid();
  src_cart := gen_random_uuid(); tgt_cart := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat) values
    (src_sess, 'M96S1', 'dinein', 'active', ana), (tgt_sess, 'M96T1', 'dinein', 'active', ana);
  insert into public.qr_carts (id, session_id) values (src_cart, src_sess), (tgt_cart, tgt_sess);
  -- `by_seat` null on both → the trigger seeds `added_by` null too. A staff-added line on each table.
  -- (A KIOSK line would NOT be adderless: it carries the kiosk device's own verified anon uid.)
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (src_cart, dish, 'Mohinga', 1, 1000, 105, null, 'dinein'),
           (tgt_cart, dish, 'Mohinga', 1, 1000, 105, null, 'dinein');

  moved := public.mms_merge_table_orders(src_cart, tgt_cart);
  assert moved = 1, format('M96.1 merge reported %s moved units, expected 1', moved);
  select count(*) into n from public.qr_cart_items where cart_id = tgt_cart;
  assert n = 1, format('M96.1 two adderless lines did NOT fold — %s lines, expected 1. A `=` where the code needs `is not distinct from` breaks exactly this.', n);
  select qty into n from public.qr_cart_items where cart_id = tgt_cart;
  assert n = 2, format('M96.1 the fold did not carry the qty: %s, expected 2', n);

  -- ══ 1b. staff target, diner source — must NOT fold (no earlier merge required) ════════════════
  src_sess := gen_random_uuid(); tgt_sess := gen_random_uuid();
  src_cart := gen_random_uuid(); tgt_cart := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat) values
    (src_sess, 'M96S1B', 'dinein', 'active', ana), (tgt_sess, 'M96T1B', 'dinein', 'active', ana);
  insert into public.qr_carts (id, session_id) values (src_cart, src_sess), (tgt_cart, tgt_sess);
  -- The target is staff-added: no seat, and so no adder. The source is Ben's own.
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (tgt_cart, dish, 'Mohinga', 1, 1000, 105, null, 'dinein'),
           (src_cart, dish, 'Mohinga', 1, 1000, 105, ben, 'dinein');

  perform public.mms_merge_table_orders(src_cart, tgt_cart);
  select count(*) into n from public.qr_cart_items where cart_id = tgt_cart;
  assert n = 2, format('M96.1b THE FIRST-MERGE DEFECT: Ben''s dish folded into a staff line and his record of it was deleted (%s lines, expected 2)', n);
  select count(*) into n from public.qr_cart_items where cart_id = tgt_cart and added_by = ben;
  assert n = 1, 'M96.1b Ben''s line reached the target but lost his adder';
  select count(*) into n from public.qr_cart_items where cart_id = tgt_cart and added_by is null;
  assert n = 1, 'M96.1b the staff line did not survive as its own row';

  -- ══ 2. different adders — must NOT fold ═══════════════════════════════════════════════════════
  src_sess := gen_random_uuid(); tgt_sess := gen_random_uuid();
  src_cart := gen_random_uuid(); tgt_cart := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat) values
    (src_sess, 'M96S2', 'dinein', 'active', ana), (tgt_sess, 'M96T2', 'dinein', 'active', ana);
  insert into public.qr_carts (id, session_id) values (src_cart, src_sess), (tgt_cart, tgt_sess);
  -- The TARGET is a line Ana added on an earlier merge: seatless, but her adder survived (M87's
  -- keep-trigger). Built the way production builds it — insert with the seat, then clear the seat,
  -- which is exactly what the re-parent branch does.
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (tgt_cart, dish, 'Mohinga', 1, 1000, 105, ana, 'dinein');
  update public.qr_cart_items set by_seat = null where cart_id = tgt_cart;
  select added_by into got from public.qr_cart_items where cart_id = tgt_cart;
  assert got = ana, 'M96.2 fixture drift: clearing by_seat also cleared added_by (the M87 trigger is not holding)';
  -- The SOURCE is Ben's.
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (src_cart, dish, 'Mohinga', 1, 1000, 105, ben, 'dinein');

  perform public.mms_merge_table_orders(src_cart, tgt_cart);
  select count(*) into n from public.qr_cart_items where cart_id = tgt_cart;
  assert n = 2, format('M96.2 THE DEFECT: Ben''s dish folded into Ana''s line and his record of it was deleted (%s lines, expected 2)', n);
  select count(*) into n from public.qr_cart_items where cart_id = tgt_cart and added_by = ben;
  assert n = 1, 'M96.2 Ben''s line reached the target but lost his adder';
  select count(*) into n from public.qr_cart_items where cart_id = tgt_cart and added_by = ana;
  assert n = 1, 'M96.2 Ana''s line lost her adder';
  -- …and the re-parented line lost its SEAT, which is the part that must still happen.
  select count(*) into n from public.qr_cart_items where cart_id = tgt_cart and by_seat is not null;
  assert n = 0, 'M96.2 a re-parented line kept a seat from a session it is not a member of';

  -- ══ 3. same adder — the narrowing must not cost the legitimate fold ═══════════════════════════
  src_sess := gen_random_uuid(); tgt_sess := gen_random_uuid();
  src_cart := gen_random_uuid(); tgt_cart := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat) values
    (src_sess, 'M96S3', 'dinein', 'active', ana), (tgt_sess, 'M96T3', 'dinein', 'active', ana);
  insert into public.qr_carts (id, session_id) values (src_cart, src_sess), (tgt_cart, tgt_sess);
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (tgt_cart, dish, 'Mohinga', 1, 1000, 105, ana, 'dinein');
  update public.qr_cart_items set by_seat = null where cart_id = tgt_cart;
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (src_cart, dish, 'Mohinga', 1, 1000, 105, ana, 'dinein');

  perform public.mms_merge_table_orders(src_cart, tgt_cart);
  select count(*) into n from public.qr_cart_items where cart_id = tgt_cart;
  assert n = 1, format('M96.3 the same diner''s two lines stopped folding — the narrowing cost the legitimate case (%s lines, expected 1)', n);
  select qty into n from public.qr_cart_items where cart_id = tgt_cart;
  assert n = 2, format('M96.3 the fold did not carry the qty: %s, expected 2', n);
  select added_by into got from public.qr_cart_items where cart_id = tgt_cart;
  assert got = ana, 'M96.3 the folded line lost its adder';
end $$;

select 'm96_merge_keeps_adder_test: ok' as result;

rollback;
