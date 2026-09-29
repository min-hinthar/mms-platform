-- supabase/tests/p2dd_p2cy_line_guards_test.sql  (P2dd · P2cy — 20260929000000_p2dd_p2cy_line_guards)
--
-- The three line RPCs, pinned from the database side:
--   P2DD — a quantity change / removal / merge-bump never touches a line that left 'draft';
--   P2CY — a FRESH settle freeze (settle_at within 10 minutes) refuses every line write on an OPEN
--          cart, a STALE one does not, a closed cart keeps its old answer, and a refused scan write
--          never burns its claim while a duplicate replay still answers idempotently.
-- Every case names itself in its ASSERT message; scripts/verify-mode-authority.mjs mutates the
-- live bodies and requires the NAMED case to go red (plpgsql ASSERT stops at the first failure,
-- so this file alone proves one case per run — the battery proves the rest).
--
-- The race itself (a settlement claim interleaved with an add) needs two sessions, so it is not in
-- here. MEASURED 2026-09-29 on a local PG16 with two live psql sessions: an add holding its lock
-- made the claim wait (1.54s) and the settlement then saw the line; a claim holding its UPDATE made
-- the add wait (1.54s) and then raise 'cart is being paid'. With `for share` deleted the add did not
-- wait (0.04s) and landed under the live freeze — the P2cy hole, reproduced. A CI two-session case
-- is OPEN-ITEMS P2dk. This file pins the single-session contract.
--
-- ⚠️ `now()` is the TRANSACTION start, constant through this file: `settle_at = now()` is fresh,
-- `now() - 11 minutes` is stale.
--
-- Run against any QR DB (rolls back — leaves NO data behind):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/p2dd_p2cy_line_guards_test.sql

begin;
set local plpgsql.check_asserts = on;

do $$
declare
  dish  text := 'cccccccc-0000-4000-8000-00000000d2dd';
  sess  uuid := gen_random_uuid();
  cart  uuid := gen_random_uuid();
  sess2 uuid := gen_random_uuid();
  paid  uuid := gen_random_uuid();
  d1 uuid; d2 uuid; f1 uuid; p1 uuid; s1 uuid; c99 uuid; cmp uuid; pl uuid; v uuid;
  scan_a uuid := gen_random_uuid();
  scan_b uuid := gen_random_uuid();
  scan_c uuid := gen_random_uuid();
  nil uuid := '00000000-0000-0000-0000-000000000000';
  n integer; q integer; msg text;
begin
  insert into public.table_sessions (id, qr_code, mode, status) values
    (sess, 'P2DD-1', 'dinein', 'active'), (sess2, 'P2DD-2', 'dinein', 'active');
  insert into public.qr_carts (id, session_id) values (cart, sess);
  insert into public.qr_carts (id, session_id, status) values (paid, sess2, 'paid');

  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents)
    values (cart, dish, 'Mohinga', 2, 1400, 147) returning id into d1;
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents)
    values (cart, dish, 'Mohinga', 1, 1400, 147) returning id into d2;
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, state)
    values (cart, dish, 'Mohinga', 2, 1400, 147, 'fired') returning id into f1;
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, state)
    values (cart, dish, 'Mohinga', 2, 1400, 147, 'in_progress') returning id into p1;
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, state)
    values (cart, dish, 'Mohinga', 2, 1400, 147, 'served') returning id into s1;
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents)
    values (cart, dish, 'Mohinga', 99, 1400, 147) returning id into c99;
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, comped)
    values (cart, dish, 'Mohinga', 1, 1400, 147, true) returning id into cmp;
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents)
    values (paid, dish, 'Mohinga', 1, 1400, 147) returning id into pl;

  -- ══ controls: an unfrozen draft still edits, bumps and inserts ══════════════════════════════
  n := public.mms_cart_item_set_qty_if_open(d1, 3);
  select qty into q from public.qr_cart_items where id = d1;
  assert n = 1 and q = 3, format('P2DD.0 · a draft set_qty must land (n=%s qty=%s)', n, q);
  perform public.mms_cart_item_inc_qty(d1, 2);
  select qty into q from public.qr_cart_items where id = d1;
  assert q = 5, format('P2DD.0 · a draft bump must land (qty=%s)', q);

  -- ══ P2DD.1 · set_qty refuses a fired / in-progress / served line, by name, unchanged ════════
  msg := null;
  begin perform public.mms_cart_item_set_qty_if_open(f1, 5); exception when others then msg := sqlerrm; end;
  select qty into q from public.qr_cart_items where id = f1;
  assert msg = 'line already sent' and q = 2,
    format('P2DD.1 · set_qty on a FIRED line must raise "line already sent" and leave qty 2 (msg=%s qty=%s)', msg, q);
  msg := null;
  begin perform public.mms_cart_item_set_qty_if_open(p1, 1); exception when others then msg := sqlerrm; end;
  assert msg = 'line already sent', format('P2DD.1 · set_qty on an IN-PROGRESS line must raise (msg=%s)', msg);
  msg := null;
  begin perform public.mms_cart_item_set_qty_if_open(s1, 9); exception when others then msg := sqlerrm; end;
  assert msg = 'line already sent', format('P2DD.1 · set_qty on a SERVED line must raise (msg=%s)', msg);

  -- ══ P2DD.2 · removal (qty ≤ 0) refuses a sent line too — the row survives ═══════════════════
  msg := null;
  begin perform public.mms_cart_item_set_qty_if_open(f1, 0); exception when others then msg := sqlerrm; end;
  select count(*) into n from public.qr_cart_items where id = f1;
  assert msg = 'line already sent' and n = 1,
    format('P2DD.2 · removing a FIRED line must raise and keep the row (msg=%s rows=%s)', msg, n);

  -- ══ P2DD.3 · inc_qty refuses a sent line by name (the app then inserts a fresh draft) ════════
  msg := null;
  begin perform public.mms_cart_item_inc_qty(f1, 1); exception when others then msg := sqlerrm; end;
  select qty into q from public.qr_cart_items where id = f1;
  assert msg = 'line already sent' and q = 2,
    format('P2DD.3 · a bump on a FIRED line must raise "line already sent" and leave qty 2 (msg=%s qty=%s)', msg, q);
  -- …and a refused SCAN bump leaves no claim behind, so the fresh insert can claim it.
  msg := null;
  begin perform public.mms_cart_item_inc_qty(f1, 1, scan_c); exception when others then msg := sqlerrm; end;
  select count(*) into n from public.mms_scan_events where scan_id = scan_c;
  assert msg = 'line already sent' and n = 0,
    format('P2DD.3 · a refused scan bump must roll its claim back (msg=%s claims=%s)', msg, n);

  -- ══ P2DD.4 · a capped or comped DRAFT stays the silent no-op it always was ══════════════════
  perform public.mms_cart_item_inc_qty(c99, 1);
  perform public.mms_cart_item_inc_qty(cmp, 1);
  select qty into q from public.qr_cart_items where id = c99;
  assert q = 99, format('P2DD.4 · the 99-cap is a silent no-op (qty=%s)', q);
  -- The comped half was called and never read back, so deleting `not ci.comped` from the bump
  -- survived this whole file (measured 2026-09-29): a repeat tap grew a line staff had comped, and
  -- every extra unit rode the bill at zero while the kitchen cooked it.
  select qty into q from public.qr_cart_items where id = cmp;
  assert q = 1, format('P2DD.4 · a comped draft is never grown — the bump is a silent no-op (qty=%s)', q);

  -- ══ a FRESH freeze ══════════════════════════════════════════════════════════════════════════
  update public.qr_carts set settle_at = now(), settle_by = gen_random_uuid() where id = cart;

  -- P2CY.1 · insert refuses, by name, writes nothing — live path and scan path, claim rolled back
  select count(*) into n from public.qr_cart_items where cart_id = cart;
  msg := null;
  begin
    perform public.mms_cart_item_insert_if_open(cart, dish, 'Mohinga', '[]'::jsonb, 1400, 147, null, 'dinein');
  exception when others then msg := sqlerrm; end;
  select count(*) into q from public.qr_cart_items where cart_id = cart;
  assert msg = 'cart is being paid' and q = n,
    format('P2CY.1 · an insert under a fresh freeze must raise "cart is being paid" and write nothing (msg=%s rows %s→%s)', msg, n, q);
  msg := null;
  begin
    perform public.mms_cart_item_insert_if_open(cart, dish, 'Mohinga', '[]'::jsonb, 1400, 147, null, 'dinein',
      null, 1, scan_a);
  exception when others then msg := sqlerrm; end;
  select count(*) into n from public.mms_scan_events where scan_id = scan_a;
  assert msg = 'cart is being paid' and n = 0,
    format('P2CY.1 · a scan insert under a fresh freeze must raise and leave no claim (msg=%s claims=%s)', msg, n);

  -- P2CY.2 · inc_qty refuses, qty unchanged, scan claim rolled back
  msg := null;
  begin perform public.mms_cart_item_inc_qty(d2, 1); exception when others then msg := sqlerrm; end;
  select qty into q from public.qr_cart_items where id = d2;
  assert msg = 'cart is being paid' and q = 1,
    format('P2CY.2 · a bump under a fresh freeze must raise "cart is being paid" and leave qty 1 (msg=%s qty=%s)', msg, q);
  msg := null;
  begin perform public.mms_cart_item_inc_qty(d2, 1, scan_b); exception when others then msg := sqlerrm; end;
  select count(*) into n from public.mms_scan_events where scan_id = scan_b;
  assert msg = 'cart is being paid' and n = 0,
    format('P2CY.2 · a scan bump under a fresh freeze must raise and leave no claim (msg=%s claims=%s)', msg, n);

  -- P2CY.3 · set_qty refuses a DRAFT line (the freeze, not the state), qty and row unchanged
  msg := null;
  begin perform public.mms_cart_item_set_qty_if_open(d2, 4); exception when others then msg := sqlerrm; end;
  select qty into q from public.qr_cart_items where id = d2;
  assert msg = 'cart is being paid' and q = 1,
    format('P2CY.3 · set_qty under a fresh freeze must raise "cart is being paid" and leave qty 1 (msg=%s qty=%s)', msg, q);
  msg := null;
  begin perform public.mms_cart_item_set_qty_if_open(d2, 0); exception when others then msg := sqlerrm; end;
  select count(*) into n from public.qr_cart_items where id = d2;
  assert msg = 'cart is being paid' and n = 1,
    format('P2CY.3 · a removal under a fresh freeze must raise and keep the row (msg=%s rows=%s)', msg, n);

  -- P2CY.4 · a scan that ALREADY landed still answers idempotently under the freeze (never "not
  -- delivered" for a write that did land). Claimed directly: the freeze is up, nothing can land now.
  insert into public.mms_scan_events (scan_id, cart_id) values (scan_c, cart);
  msg := null; v := null;
  begin
    v := public.mms_cart_item_insert_if_open(cart, dish, 'Mohinga', '[]'::jsonb, 1400, 147, null, 'dinein',
      null, 1, scan_c);
  exception when others then msg := sqlerrm; end;
  assert v = nil and msg is null,
    format('P2CY.4 · a duplicate scan insert under the freeze must answer the NIL sentinel (got %s, msg=%s)', v, msg);
  msg := null;
  begin perform public.mms_cart_item_inc_qty(d2, 1, scan_c); exception when others then msg := sqlerrm; end;
  select qty into q from public.qr_cart_items where id = d2;
  assert q = 1 and msg is null,
    format('P2CY.4 · a duplicate scan bump under the freeze is a silent no-op (qty=%s, msg=%s)', q, msg);

  -- ══ P2CY.5 · a STALE freeze (an abandoned settlement) refuses nothing ══════════════════════
  update public.qr_carts set settle_at = now() - interval '11 minutes' where id = cart;
  msg := null; v := null; n := -1;
  begin
    v := public.mms_cart_item_insert_if_open(cart, dish, 'Mohinga', '[]'::jsonb, 1400, 147, null, 'dinein');
    perform public.mms_cart_item_inc_qty(d2, 1);
    n := public.mms_cart_item_set_qty_if_open(d1, 1);
  exception when others then msg := sqlerrm; end;
  select qty into q from public.qr_cart_items where id = d2;
  assert msg is null and v is not null and v <> nil and q = 2 and n = 1,
    format('P2CY.5 · insert, bump and set_qty under a STALE freeze must all land (msg=%s qty=%s n=%s)', msg, q, n);

  -- ══ P2CY.6 · a CLOSED cart keeps its old answers even with a fresh settle_at ════════════════
  update public.qr_carts set settle_at = now() where id = paid;
  msg := null; v := nil;
  begin
    v := public.mms_cart_item_insert_if_open(paid, dish, 'Mohinga', '[]'::jsonb, 1400, 147, null, 'dinein');
  exception when others then msg := sqlerrm; end;
  assert v is null and msg is null,
    format('P2CY.6 · an insert into a PAID cart returns null, not "being paid" (got %s, msg=%s)', v, msg);
  msg := null; n := -1;
  begin n := public.mms_cart_item_set_qty_if_open(pl, 3); exception when others then msg := sqlerrm; end;
  assert n = 0 and msg is null, format('P2CY.6 · set_qty on a PAID cart returns 0 (got %s, msg=%s)', n, msg);
  msg := null;
  begin perform public.mms_cart_item_inc_qty(pl, 1); exception when others then msg := sqlerrm; end;
  assert msg = 'cart is no longer open', format('P2CY.6 · a bump on a PAID cart says "no longer open" (msg=%s)', msg);
end $$;

rollback;
