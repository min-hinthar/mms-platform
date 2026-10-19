-- supabase/tests/lcb_set_qty_growth_gate_test.sql  (#362 · 20261018140000_lcb_set_qty_growth_gate)
--
-- `mms_cart_item_set_qty_if_open` never GROWS a line whose dish the kitchen can no longer make, and
-- "growth" is measured against the quantity the write REPLACES — never the caller's earlier read.
-- (Codex P2 on #362: the diner's `setQty` judged growth from `lineQty` read before the RPC, so a
-- concurrent decrease 5 → 3 let a request for 4 grow a sold-out line.) Single-session: the line's
-- quantity is moved first and the call then made with the stale number, which is the race's shape
-- as the function sees it. Every case names itself in its ASSERT message; scripts/verify-mode-
-- authority.mjs mutates the live body and requires the NAMED case to go red.
--
-- ⚠️ `now()` is the TRANSACTION start, constant through this file — the refusal's stamp is it.
--
-- Run against any QR DB (rolls back — leaves NO data behind):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/lcb_set_qty_growth_gate_test.sql

begin;
set local plpgsql.check_asserts = on;

do $$
declare
  cat   uuid := '00000000-0000-0000-0000-00000000c4b0';
  m_out uuid := '00000000-0000-0000-0000-00000000c4b1';
  m_ok  uuid := '00000000-0000-0000-0000-00000000c4b2';
  m_del uuid := '00000000-0000-0000-0000-00000000c4b3';
  sess  uuid := gen_random_uuid();
  cart  uuid := gen_random_uuid();
  out1 uuid; ok1 uuid; del1 uuid; nocat uuid; groc uuid; cmp uuid;
  n integer; q integer; msg text; det text; hnt text; cart_before jsonb; lines_before jsonb;
begin
  insert into public.menu_categories (id, slug, name) values (cat, 'lcbq-cat', 'LCBQ fixture');
  insert into public.menu_items (id, category_id, slug, name_en, base_price_cents, is_active, is_sold_out)
    values (m_out, cat, 'lcbq-out', 'Sold Out Dish', 1200, true,  true),
           (m_ok,  cat, 'lcbq-ok',  'Available Dish', 1500, true,  false),
           (m_del, cat, 'lcbq-del', 'Delisted Dish',  1300, false, false);
  insert into public.table_sessions (id, qr_code, mode, status) values (sess, 'LCBQ-1', 'dinein', 'active');
  insert into public.qr_carts (id, session_id) values (cart, sess);

  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents)
    values (cart, m_out::text, 'Sold Out Dish', 5, 1200, 0) returning id into out1;
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents)
    values (cart, m_ok::text, 'Available Dish', 1, 1500, 0) returning id into ok1;
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents)
    values (cart, m_del::text, 'Delisted Dish', 1, 1300, 0) returning id into del1;
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents)
    values (cart, 'cccccccc-0000-4000-8000-00000000c4b9', 'No Row', 1, 900, 0) returning id into nocat;
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, fulfillment)
    values (cart, m_out::text, 'Grocery', 1, 300, 0, 'grocery') returning id into groc;
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, comped)
    values (cart, m_out::text, 'Comped', 1, 1200, 0, true) returning id into cmp;

  -- ══ LCBQ.0 · controls: an available dish, and a line with no catalog row, still grow ═════════
  n := public.mms_cart_item_set_qty_if_open(ok1, 3);
  select qty into q from public.qr_cart_items where id = ok1;
  assert n = 1 and q = 3, format('LCBQ.0 · an available dish must grow (n=%s qty=%s)', n, q);
  n := public.mms_cart_item_set_qty_if_open(nocat, 2);
  select qty into q from public.qr_cart_items where id = nocat;
  assert n = 1 and q = 2, format('LCBQ.0 · a line with no catalog row must grow (n=%s qty=%s)', n, q);

  -- ══ LCBQ.1 · the RACE: a concurrent decrease 5 → 3, then a stale "−" asking for 4 ═════════════
  update public.qr_cart_items set qty = 3 where id = out1;
  select to_jsonb(c) into cart_before from public.qr_carts c where c.id = cart;
  select jsonb_agg(to_jsonb(ci) order by ci.id) into lines_before
    from public.qr_cart_items ci where ci.cart_id = cart;
  msg := null; det := null; hnt := null;
  begin
    perform public.mms_cart_item_set_qty_if_open(out1, 4);
  exception when others then
    get stacked diagnostics msg = message_text, det = pg_exception_detail, hnt = pg_exception_hint;
  end;
  select qty into q from public.qr_cart_items where id = out1;
  assert msg = 'dish unavailable' and det = 'sold_out' and q = 3,
    format('LCBQ.1 · growing a sold-out line past the quantity under the lock must be refused, named (msg=%s det=%s qty=%s)', msg, det, q);
  -- Nothing else moved either: the cart row and every line on it are exactly as before the call.
  assert (select to_jsonb(c) from public.qr_carts c where c.id = cart) = cart_before
     and (select jsonb_agg(to_jsonb(ci) order by ci.id) from public.qr_cart_items ci
           where ci.cart_id = cart) = lines_before,
    'LCBQ.1 · a refused growth must leave the cart and its lines untouched';
  -- The stamp: the transaction start, as an ISO instant the app parses — no later than the read.
  assert hnt = to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    format('LCBQ.1 · the refusal must carry its stamp (hint=%s)', hnt);

  -- ══ LCBQ.2 · a delisted dish is `gone`, never an 86 ══════════════════════════════════════════
  msg := null; det := null;
  begin
    perform public.mms_cart_item_set_qty_if_open(del1, 2);
  exception when others then
    get stacked diagnostics msg = message_text, det = pg_exception_detail;
  end;
  select qty into q from public.qr_cart_items where id = del1;
  assert msg = 'dish unavailable' and det = 'gone' and q = 1,
    format('LCBQ.2 · a delisted dish must be refused as gone (msg=%s det=%s qty=%s)', msg, det, q);

  -- ══ LCBQ.3 · the way OUT stays open: the same quantity, a shrink, a removal ══════════════════
  -- Each call is caught, so a refusal here fails as THIS case, never as an unnamed error.
  msg := null; n := null;
  begin n := public.mms_cart_item_set_qty_if_open(out1, 3); exception when others then msg := sqlerrm; end;
  assert msg is null and n = 1,
    format('LCBQ.3 · an unchanged quantity of a sold-out line must land (n=%s msg=%s)', n, msg);
  msg := null; n := null;
  begin n := public.mms_cart_item_set_qty_if_open(out1, 2); exception when others then msg := sqlerrm; end;
  select qty into q from public.qr_cart_items where id = out1;
  assert msg is null and n = 1 and q = 2,
    format('LCBQ.3 · a shrink of a sold-out line must land (n=%s qty=%s msg=%s)', n, q, msg);
  msg := null; n := null;
  begin n := public.mms_cart_item_set_qty_if_open(out1, 0); exception when others then msg := sqlerrm; end;
  assert msg is null and n = 1 and not exists (select 1 from public.qr_cart_items where id = out1),
    format('LCBQ.3 · removing a sold-out line must land (n=%s msg=%s)', n, msg);

  -- ══ LCBQ.4 · a grocery line is never a dish ══════════════════════════════════════════════════
  msg := null; n := null;
  begin n := public.mms_cart_item_set_qty_if_open(groc, 2); exception when others then msg := sqlerrm; end;
  select qty into q from public.qr_cart_items where id = groc;
  assert msg is null and n = 1 and q = 2,
    format('LCBQ.4 · a grocery line must grow whatever the dish table says (n=%s qty=%s msg=%s)', n, q, msg);

  -- ══ LCBQ.5 · a comped draft keeps its old answer (0), never the new raise ════════════════════
  msg := null;
  begin
    n := public.mms_cart_item_set_qty_if_open(cmp, 2);
  exception when others then
    msg := sqlerrm;
  end;
  assert msg is null and n = 0, format('LCBQ.5 · a comped draft must answer 0 (n=%s msg=%s)', n, msg);
end $$;

rollback;
