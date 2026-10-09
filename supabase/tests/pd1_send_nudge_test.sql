-- supabase/tests/pd1_send_nudge_test.sql  (PD1 — "Let Aye know": the nudge stamp, from the database side)
--
-- `mms_nudge_host(p_cart_id, p_seat)` writes the guest's nudge as a durable stamp on the cart with
-- EVERY rule in the statement's WHERE (20261008123000_pd1_send_nudge.sql), and `mms_fire_cart`
-- clears it in the same statement as the fire. This file pins each guard from the database side —
-- a refusal AND the legitimate write beside it (an over-tight guard would block a real nudge and a
-- refusal-only test would never notice):
--
--   1. the two columns exist, nullable, with the shapes the view reads;
--   2. a GUEST of a host table may nudge: the stamp lands with their seat and `now()`;
--   3. the HOST may not (`is_host`); a NON-member may not (`not_member`); a HOSTLESS table has
--      nobody to nudge (`no_host`); a CLOSED cart refuses (`closed`) — none of them writes;
--   4. a second nudge inside a minute is `recent` and the first stamp STANDS (idempotent — the
--      guest's line keeps showing, and a tablemate cannot re-stamp the host's phone every second);
--      a stamp older than a minute is replaced;
--   5. the Send clears the stamp in the same statement as the fire, and a Send that fires nothing
--      leaves the stamp standing (the wait it names is still real);
--   6. the function is callable by service_role only.
--
-- ⚠️ `now()` is the TRANSACTION start time and this whole file is one transaction, so "a minute
-- later" is simulated by moving `send_nudge_at` into the past directly.
--
-- CI-only: it needs the local stack (Docker). Written against the migration's signatures and never
-- run in the authoring environment — the first CI run is its first run.
--
-- Run against any QR DB (rolls back — leaves NO data behind):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/pd1_send_nudge_test.sql
begin;
-- Without this GUC every ASSERT below compiles out and the file exits 0 having proved nothing.
set local plpgsql.check_asserts = on;

-- ── 1 · the columns exist with the shape the reads assume ──────────────────────────────────────
do $$
declare v_type text; v_nullable text;
begin
  select data_type, is_nullable into v_type, v_nullable
    from information_schema.columns
   where table_schema = 'public' and table_name = 'qr_carts' and column_name = 'send_nudge_seat';
  assert v_type = 'uuid', format('send_nudge_seat is %s, expected uuid', coalesce(v_type, 'missing'));
  assert v_nullable = 'YES', 'send_nudge_seat must be nullable — null IS "nobody waiting"';
  select data_type, is_nullable into v_type, v_nullable
    from information_schema.columns
   where table_schema = 'public' and table_name = 'qr_carts' and column_name = 'send_nudge_at';
  assert v_type = 'timestamp with time zone', format('send_nudge_at is %s, expected timestamptz', coalesce(v_type, 'missing'));
  assert v_nullable = 'YES', 'send_nudge_at must be nullable';
end $$;

-- ── 2–5 · the guards, each refusing AND the legitimate write beside it ─────────────────────────
do $$
declare
  aye   uuid := '00000000-0000-0000-0000-00000000a4e1';   -- the host
  thiri uuid := '00000000-0000-0000-0000-00000000111b';   -- a guest
  stranger uuid := '00000000-0000-0000-0000-0000000057a0'; -- not a member
  dish  text := 'cccccccc-0000-4000-8000-00000000d1d1';
  sess  uuid := gen_random_uuid();
  cart  uuid := gen_random_uuid();
  hsess uuid := gen_random_uuid();   -- a hostless (staff-started) table
  hcart uuid := gen_random_uuid();
  r record;
  v_seat uuid; v_at timestamptz; v_first timestamptz;
  v_fired integer;
begin
  insert into public.table_sessions (id, qr_code, mode, status, host_seat) values
    (sess,  'PD1-NUDGE-1', 'dinein', 'active', aye),
    (hsess, 'PD1-NUDGE-H', 'dinein', 'active', null);
  insert into public.session_members (session_id, seat_id, role, display_name) values
    (sess, aye, 'host', 'Aye'), (sess, thiri, 'guest', 'Thiri'), (hsess, thiri, 'guest', 'Thiri');
  insert into public.qr_carts (id, session_id) values (cart, sess), (hcart, hsess);
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (cart, dish, 'Mohinga', 2, 1400, 147, thiri, 'dinein');

  -- 2 · the guest's nudge lands
  select * into r from public.mms_nudge_host(cart, thiri);
  assert r.ok, format('a guest of a host table must be able to nudge — got %s', r.reason);
  select send_nudge_seat, send_nudge_at into v_seat, v_first from public.qr_carts where id = cart;
  assert v_seat = thiri, 'the stamp names the nudger''s seat';
  assert v_first = now(), 'the stamp is now()';
  assert r.nudged_at = v_first, 'the function returns the stamp it wrote';

  -- 4 · a second tap inside the minute: refused as recent, the first stamp stands
  select * into r from public.mms_nudge_host(cart, thiri);
  assert not r.ok and r.reason = 'recent', format('a nudge inside a minute must be recent — got %s', r.reason);
  assert r.nudged_at = v_first, 'recent returns the standing stamp';
  select send_nudge_at into v_at from public.qr_carts where id = cart;
  assert v_at = v_first, 'a recent nudge must not move the stamp';
  -- …and a stamp older than a minute is replaced
  update public.qr_carts set send_nudge_at = now() - interval '2 minutes' where id = cart;
  select * into r from public.mms_nudge_host(cart, thiri);
  assert r.ok, 'a nudge after a minute lands again';
  select send_nudge_at into v_at from public.qr_carts where id = cart;
  assert v_at = now(), 'the replaced stamp is now()';

  -- 3 · the host may not; a stranger may not; a hostless table; a closed cart
  update public.qr_carts set send_nudge_seat = null, send_nudge_at = null where id = cart;
  select * into r from public.mms_nudge_host(cart, aye);
  assert not r.ok and r.reason = 'is_host', format('the host nudging themselves must be is_host — got %s', r.reason);
  select * into r from public.mms_nudge_host(cart, stranger);
  assert not r.ok and r.reason = 'not_member', format('a non-member must be not_member — got %s', r.reason);
  select * into r from public.mms_nudge_host(hcart, thiri);
  assert not r.ok and r.reason = 'no_host', format('a hostless table must be no_host — got %s', r.reason);
  select count(*) into v_fired from public.qr_carts where id in (cart, hcart) and send_nudge_at is not null;
  assert v_fired = 0, 'no refused nudge may write';
  update public.qr_carts set status = 'paid' where id = cart;
  select * into r from public.mms_nudge_host(cart, thiri);
  assert not r.ok and r.reason = 'closed', format('a closed cart must be closed — got %s', r.reason);
  update public.qr_carts set status = 'open' where id = cart;

  -- 5 · the Send clears the stamp in the same statement; a Send that fires nothing leaves it
  select * into r from public.mms_nudge_host(cart, thiri);
  assert r.ok, 'the nudge before the send lands';
  select fired into v_fired from public.mms_fire_cart(cart);
  assert v_fired = 2, format('the send fires the 2 units — got %s', v_fired);
  select send_nudge_seat, send_nudge_at into v_seat, v_at from public.qr_carts where id = cart;
  assert v_seat is null and v_at is null, 'the fire clears the stamp in the same statement';
  -- nothing draft now: a fresh nudge stands through a send that moves no line
  update public.qr_carts set send_nudge_seat = thiri, send_nudge_at = now() - interval '5 minutes' where id = cart;
  select fired into v_fired from public.mms_fire_cart(cart);
  assert v_fired = 0, 'nothing left to fire';
  select send_nudge_at into v_at from public.qr_carts where id = cart;
  assert v_at is not null, 'a send that fires nothing must not clear a standing wait';
end $$;

-- ── 6 · service_role only ──────────────────────────────────────────────────────────────────────
do $$
begin
  assert has_function_privilege('service_role', 'public.mms_nudge_host(uuid, uuid)', 'execute'),
    'service_role must be able to call mms_nudge_host';
  assert not has_function_privilege('anon', 'public.mms_nudge_host(uuid, uuid)', 'execute'),
    'anon must not call mms_nudge_host';
  assert not has_function_privilege('authenticated', 'public.mms_nudge_host(uuid, uuid)', 'execute'),
    'authenticated must not call mms_nudge_host';
  assert not has_function_privilege('anon', 'public.mms_fire_cart(uuid)', 'execute'),
    'the restated mms_fire_cart keeps its revoke';
end $$;

rollback;
