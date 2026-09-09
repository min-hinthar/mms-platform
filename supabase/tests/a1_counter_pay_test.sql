-- supabase/tests/a1_counter_pay_test.sql  (A1 — "Pay at the counter": the column, from the database side)
--
-- `qr_carts.counter_requested_at` is an ASK, not a freeze: nullable, no default, no constraint. The
-- app SELECTs it from `getCartView` and both floor reads, and PostgREST rejects a WHOLE query for one
-- unknown column (42703) — so the only way this migration fails is silently, by not being there,
-- and the failure is /cart and the floor down together. This file asserts the shape the app relies
-- on: the column exists, is `timestamptz`, is nullable, and takes a timestamp and NULL back.
--
-- Run against any QR DB (rolls back — leaves NO data behind):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/a1_counter_pay_test.sql
--
-- ⚠️ `set local plpgsql.check_asserts = on` is NOT optional — with the GUC off every ASSERT compiles
-- out and the file exits 0 having proved nothing.
begin;
set local plpgsql.check_asserts = on;

-- ── 1 · the column exists with the shape the reads assume ──────────────────────────────────────
do $$
declare v_type text; v_nullable text;
begin
  select data_type, is_nullable into v_type, v_nullable
    from information_schema.columns
   where table_schema = 'public' and table_name = 'qr_carts' and column_name = 'counter_requested_at';
  assert v_type is not null, 'qr_carts.counter_requested_at is missing — getCartView and the floor SELECT it';
  assert v_type = 'timestamp with time zone', format('counter_requested_at is %s, expected timestamptz', v_type);
  assert v_nullable = 'YES', 'counter_requested_at must be nullable — null IS "no ask"';
end $$;

-- ── 2 · it takes an ask and takes it back (the write shapes counter-pay.ts performs) ───────────
do $$
declare v_session uuid; v_cart uuid; v_at timestamptz;
begin
  insert into public.table_sessions (qr_code, mode) values ('a1-test', 'dinein') returning id into v_session;
  insert into public.qr_carts (session_id) values (v_session) returning id into v_cart;
  select counter_requested_at into v_at from public.qr_carts where id = v_cart;
  assert v_at is null, 'a fresh cart must carry no ask';
  update public.qr_carts set counter_requested_at = now()
   where id = v_cart and status = 'open' and counter_requested_at is null;
  select counter_requested_at into v_at from public.qr_carts where id = v_cart;
  assert v_at is not null, 'the ask did not land';
  update public.qr_carts set counter_requested_at = null where id = v_cart and status = 'open';
  select counter_requested_at into v_at from public.qr_carts where id = v_cart;
  assert v_at is null, 'the withdrawal did not land';
end $$;

rollback;
