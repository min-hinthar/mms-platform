-- supabase/tests/pickup_phone_bound_test.sql  (W21 — the pickup phone's DB belt)
--
-- `qr_carts.customer_phone` backs the required pickup contact (create-intent refuses a pickup
-- payment without it — apps/qr/lib/pickup-contact.ts, mutant-pinned). The app layer is the front
-- rule; this file proves the COLUMN CHECK behind it, where no caller can route around it: the
-- 7–20-char shape, the ≥7-DIGIT floor (the shape alone accepts '-------'), and — the half a
-- refusal-only test would miss — that a legitimate number in every common format still passes
-- (an over-tight bound would refuse real customers at the pay tap).
--
-- Run against any QR DB (rolls back — leaves NO data behind):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/pickup_phone_bound_test.sql
--
-- ⚠️ `set local plpgsql.check_asserts = on` is NOT optional — with the GUC off every ASSERT
-- compiles out and the file exits 0 having proved nothing.

begin;
set local plpgsql.check_asserts = on;

-- ── 1 · the constraint exists, on the column we think it does ───────────────────────────────────
do $$
declare v_def text;
begin
  select pg_get_constraintdef(c.oid) into v_def
    from pg_constraint c join pg_class t on t.oid = c.conrelid
   where t.relname = 'qr_carts' and c.contype = 'c'
     and pg_get_constraintdef(c.oid) ilike '%customer_phone%';
  assert v_def is not null, 'no CHECK mentioning customer_phone exists on qr_carts';
  assert v_def ilike '%regexp_replace%', format('the CHECK lost its digit floor: %s', v_def);
end $$;

-- ── 2 · refusals AND acceptances, against a real cart row ───────────────────────────────────────
do $$
declare v_cart uuid; v_refused boolean;
begin
  insert into public.table_sessions (id, qr_code, mode, status, host_seat) values
    ('00000000-0000-0000-0000-000000007e01', 'W21TEST-1', 'pickup', 'active',
     '00000000-0000-0000-0000-000000000ea1');
  insert into public.qr_carts (id, session_id) values
    ('00000000-0000-0000-0000-00000000cd01', '00000000-0000-0000-0000-000000007e01')
    returning id into v_cart;

  -- Refuse: separator-only (passes the shape, fails the digit floor).
  v_refused := false;
  begin
    update public.qr_carts set customer_phone = '-------' where id = v_cart;
  exception when check_violation then v_refused := true; end;
  assert v_refused, 'the CHECK accepted a 0-digit phone (''-------'') — the digit floor is gone';

  -- Refuse: too short (6 digits — under BOTH the 7-char shape floor and the 7-digit floor).
  v_refused := false;
  begin
    update public.qr_carts set customer_phone = '555014' where id = v_cart;
  exception when check_violation then v_refused := true; end;
  assert v_refused, 'the CHECK accepted a 6-digit phone — the floors are gone';

  -- Refuse: too long (review LOW — 21 digits satisfies the digit floor, so without this probe the
  -- {7,20} UPPER bound had no refusal watching it and could be dropped green).
  v_refused := false;
  begin
    update public.qr_carts set customer_phone = '123456789012345678901' where id = v_cart;
  exception when check_violation then v_refused := true; end;
  assert v_refused, 'the CHECK accepted a 21-char phone — the 20-char ceiling is gone';

  -- Refuse: disallowed characters.
  v_refused := false;
  begin
    update public.qr_carts set customer_phone = 'call me maybe' where id = v_cart;
  exception when check_violation then v_refused := true; end;
  assert v_refused, 'the CHECK accepted non-phone text';

  -- ...and does NOT refuse legitimate numbers. An over-tight bound blocks a real pickup payment
  -- at the last tap, the failure no refusal-only test would see.
  update public.qr_carts set customer_phone = '6265550142'      where id = v_cart;
  update public.qr_carts set customer_phone = '(626) 555-0142'  where id = v_cart;
  update public.qr_carts set customer_phone = '+1 626 555 0142' where id = v_cart;
  update public.qr_carts set customer_phone = null              where id = v_cart; -- clearable
end $$;

rollback;
