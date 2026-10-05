-- supabase/tests/m258_undo_fire_lock_guard_test.sql  (M258 · Phase 3c-ii D29 — the undo refuses under a fresh lock)
--
-- Pins supabase/migrations/20261005120100_m258_undo_fire_lock_guard.sql: `mms_undo_fire(cart, batch)`
-- refuses under a FRESH single-pay lock (5 min) or a FRESH split freeze (10 min) and — W17's rule —
-- still reverses under a STALE one, which the strict `c.locked = false` form would over-block. Each
-- refusal sits beside the legitimate case it must not refuse:
--
--   M1. fire two drafts → `locked = true, locked_at = now()` → undo = 0, both lines still fired
--       with the batch (the hole D20 filed: a guest's create-intent locked and read zero drafts);
--   M2. `locked_at = now() - 6 minutes` (an abandoned pay tab) → undo = 2 — the legitimate undo
--       the bare `c.locked = false` would refuse forever, since `locked` is sticky;
--   M3. unlocked → a fresh send undoes in full (the guard reads nothing but the two columns);
--   M4. `settle_at = now()` (a fresh split freeze) → undo = 0, the lines stay fired;
--   M5. `settle_at = now() - 11 minutes` (an abandoned settlement) → the same batch reverses;
--   M6. privileges: anon and authenticated cannot EXECUTE it, service_role can (the migration's
--       revoke/grant actually landed — nothing else in the repo can see a grant).
--
-- ⚠️ `now()` is the TRANSACTION start and this file is ONE transaction, so every fire's deadline is
-- now()+10s and `fire_at > now()` stays true throughout: the only thing that varies between cases is
-- the cart's lock columns, which is the point. Freshness is DB-clocked against the same `now()`.
--
-- CI-only: it needs the local stack (Docker). In the authoring environment it was run against a
-- throwaway Postgres 16 cluster carrying the four tables' DDL and the LATEST `mms_fire_cart` /
-- `mms_undo_fire` bodies (20260624030000) — M1 red before the migration file was applied, all six
-- green after, and the four verify-mode-authority rows each red on their NAMED case — not against
-- the Supabase stack; the first CI run is its first run on the real schema.
-- Every case is falsified by name in scripts/verify-mode-authority.mjs (suite `p3c2`).
--
-- Run against any QR DB (rolls back — leaves NO data behind):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/m258_undo_fire_lock_guard_test.sql

begin;
-- W8: without this GUC every ASSERT below compiles out and the file exits 0 having proved nothing.
set local plpgsql.check_asserts = on;

do $$
declare
  ana   uuid := '00000000-0000-0000-0000-000000025800';
  dish  text := 'cccccccc-0000-4000-8000-000000000258';
  sess  uuid := gen_random_uuid();
  cart  uuid := gen_random_uuid();
  l1 uuid; l2 uuid;
  v_fired integer; v_batch uuid;
  n integer;
begin
  -- ── fixtures: a dine-in table with two drafts, the shape staff_fire_undo_test.sql uses ────────
  insert into public.table_sessions (id, qr_code, mode, status, host_seat) values (sess, 'M258-1', 'dinein', 'active', ana);
  insert into public.qr_carts (id, session_id) values (cart, sess);
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (cart, dish, 'Mohinga', 1, 1400, 147, ana, 'dinein') returning id into l1;
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (cart, dish, 'Mohinga', 2, 1400, 147, ana, 'dinein') returning id into l2;
  select count(*) into n from public.qr_carts where id = cart and locked = false and settle_at is null;
  assert n = 1, 'fixture drift: the cart is not unlocked and unfrozen at the start';

  -- ══ M1. a FRESH pay lock refuses the undo; the lines stay fired with their batch ══════════════
  select f.fired, f.batch into v_fired, v_batch from public.mms_fire_cart(cart) f;
  assert v_fired = 2, format('fixture: the send fired %s lines, expected 2', v_fired);
  update public.qr_carts set locked = true, locked_at = now(), locked_by = ana where id = cart;
  n := public.mms_undo_fire(cart, v_batch);
  assert n = 0, format('M258.1 · an undo under a FRESH pay lock reversed %s lines — a create-intent that locked and read zero drafts now charges over dishes the undo flipped back', n);
  select count(*) into n from public.qr_cart_items
    where id in (l1, l2) and state = 'fired' and fire_batch = v_batch;
  assert n = 2, format('M258.1 · %s of the 2 lines still carry the batch after the refused undo', n);

  -- ══ M2. a STALE lock (an abandoned pay tab) does not refuse — W17: never over-block ═══════════
  update public.qr_carts set locked_at = now() - interval '6 minutes' where id = cart;
  n := public.mms_undo_fire(cart, v_batch);
  assert n = 2, format('M258.2 · an undo under a STALE lock (6 min) reversed %s lines, expected 2 — `locked` is sticky, so a bare locked=false guard blocks every later undo', n);
  select count(*) into n from public.qr_cart_items
    where id in (l1, l2) and state = 'draft' and fire_batch is null and fire_at is null;
  assert n = 2, format('M258.2 · %s of the 2 lines are clean drafts again', n);

  -- ══ M3. unlocked: a fresh send undoes in full ═════════════════════════════════════════════════
  update public.qr_carts set locked = false, locked_at = null, locked_by = null where id = cart;
  select f.fired, f.batch into v_fired, v_batch from public.mms_fire_cart(cart) f;
  assert v_fired = 2, format('fixture: the re-send fired %s lines, expected 2', v_fired);
  n := public.mms_undo_fire(cart, v_batch);
  assert n = 2, format('M258.3 · an undo on an UNLOCKED cart reversed %s lines, expected 2', n);

  -- ══ M4. a FRESH split freeze refuses ══════════════════════════════════════════════════════════
  select f.fired, f.batch into v_fired, v_batch from public.mms_fire_cart(cart) f;
  assert v_fired = 2, format('fixture: the third send fired %s lines, expected 2', v_fired);
  update public.qr_carts set settle_at = now() where id = cart;
  n := public.mms_undo_fire(cart, v_batch);
  assert n = 0, format('M258.4 · an undo under a FRESH split freeze reversed %s lines — the table is paying against the current base', n);
  select count(*) into n from public.qr_cart_items
    where id in (l1, l2) and state = 'fired' and fire_batch = v_batch;
  assert n = 2, format('M258.4 · %s of the 2 lines still carry the batch after the refused undo', n);

  -- ══ M5. a STALE settlement (11 min) does not refuse — the same batch reverses ═════════════════
  update public.qr_carts set settle_at = now() - interval '11 minutes' where id = cart;
  n := public.mms_undo_fire(cart, v_batch);
  assert n = 2, format('M258.5 · an undo under a STALE settlement (11 min) reversed %s lines, expected 2 — an abandoned settlement must not freeze the table forever', n);

  -- ══ M6. privileges — the migration's revoke/grant landed on the replaced row ══════════════════
  assert not has_function_privilege('anon', 'public.mms_undo_fire(uuid, uuid)', 'execute'),
    'M258.6 · anon can EXECUTE mms_undo_fire';
  assert not has_function_privilege('authenticated', 'public.mms_undo_fire(uuid, uuid)', 'execute'),
    'M258.6 · authenticated can EXECUTE mms_undo_fire — every QR diner is `authenticated` (anonymous auth)';
  assert has_function_privilege('service_role', 'public.mms_undo_fire(uuid, uuid)', 'execute'),
    'M258.6 · service_role LOST execute on mms_undo_fire — every Undo would 500';

  raise notice 'm258_undo_fire_lock_guard_test: all cases passed';
end $$;

rollback;
