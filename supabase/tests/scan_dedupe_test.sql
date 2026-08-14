-- supabase/tests/scan_dedupe_test.sql  (W7b — the offline scan queue's SQL dedupe)
--
-- 20260813210000_w7b_scan_events.sql adds a per-scan-EVENT claim to mms_cart_item_inc_qty /
-- mms_cart_item_insert_if_open: a replayed p_scan_id must NOT write again (the at-least-once queue
-- re-sends whenever a response is lost — without this, every replay is a silent qty+1 the shopper
-- is charged for). This file asserts the dedupe FROM THE DATABASE SIDE on CI's real stack: the
-- duplicate is an idempotent no-op (inc) / a NIL-uuid sentinel with no row (insert), the LIVE path
-- (no scan_id) still deliberately counts repeats, and the claim is atomic with the write.
--
-- Run against any QR DB (rolls back — leaves NO data behind):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/scan_dedupe_test.sql

begin;
set local plpgsql.check_asserts = on;

-- ── fixtures (rolled back) ───────────────────────────────────────────────────────────────────────
insert into public.table_sessions (id, qr_code, mode, status, host_seat) values
  ('00000000-0000-0000-0000-000000005e50', 'SCANDEDUPE-A', 'scango', 'active', '00000000-0000-0000-0000-000000005ea7');
insert into public.session_members (session_id, seat_id, display_name, role) values
  ('00000000-0000-0000-0000-000000005e50', '00000000-0000-0000-0000-000000005ea7', 'Shopper', 'host');
insert into public.qr_carts (id, session_id) values
  ('00000000-0000-0000-0000-00000000ca75', '00000000-0000-0000-0000-000000005e50');

do $$
declare
  v_cart constant uuid := '00000000-0000-0000-0000-00000000ca75';
  v_seat constant uuid := '00000000-0000-0000-0000-000000005ea7';
  v_scan_a constant uuid := '00000000-0000-0000-0000-0000000000a1';
  v_scan_b constant uuid := '00000000-0000-0000-0000-0000000000b2';
  v_nil constant uuid := '00000000-0000-0000-0000-000000000000';
  v_line uuid;
  v_dup uuid;
  v_qty integer;
  v_rows integer;
begin
  -- 1 · first insert WITH a scan_id: writes the line + claims the event.
  v_line := public.mms_cart_item_insert_if_open(
    v_cart, '8888000011112', 'Test Jar', '[]'::jsonb, 350, 0, v_seat, 'grocery',
    null, 1, v_scan_a);
  assert v_line is not null and v_line <> v_nil, 'DEDUPE: first scan must insert a real line';
  select count(*) into v_rows from public.qr_cart_items where cart_id = v_cart;
  assert v_rows = 1, 'DEDUPE: exactly one line after the first scan';

  -- 2 · the REPLAY (same scan_id): NIL sentinel, and — the money assertion — no second row.
  v_dup := public.mms_cart_item_insert_if_open(
    v_cart, '8888000011112', 'Test Jar', '[]'::jsonb, 350, 0, v_seat, 'grocery',
    null, 1, v_scan_a);
  assert v_dup = v_nil, 'DEDUPE: a duplicate scan_id must answer the NIL sentinel, not insert';
  select count(*) into v_rows from public.qr_cart_items where cart_id = v_cart;
  assert v_rows = 1, 'DEDUPE: a replayed insert must not add a row';

  -- 3 · inc WITH a fresh scan_id bumps once; its replay does NOT bump again.
  perform public.mms_cart_item_inc_qty(v_line, 1, v_scan_b);
  select qty into v_qty from public.qr_cart_items where id = v_line;
  assert v_qty = 2, 'DEDUPE: a fresh scan_id inc must bump (1 → 2)';
  perform public.mms_cart_item_inc_qty(v_line, 1, v_scan_b);
  select qty into v_qty from public.qr_cart_items where id = v_line;
  assert v_qty = 2, 'DEDUPE: a replayed inc (same scan_id) must NOT bump again';

  -- 4 · the LIVE path (no scan_id) still counts repeats — deliberate qty+1 (the kiosk/live rule).
  perform public.mms_cart_item_inc_qty(v_line, 1);
  select qty into v_qty from public.qr_cart_items where id = v_line;
  assert v_qty = 3, 'DEDUPE: a live repeat (no scan_id) must still increment';

  -- 5 · the ledger holds exactly the two claimed events, keyed to this cart.
  select count(*) into v_rows from public.mms_scan_events where cart_id = v_cart;
  assert v_rows = 2, 'DEDUPE: two claimed scan events (one per scan_id)';
end $$;

rollback;
