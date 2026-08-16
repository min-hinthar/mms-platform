-- supabase/tests/cash_tip_bound_test.sql  (W17c-2 — the cash tip's floor, from the database side)
--
-- The cash tip is the ONE amount on the money path a human types: nothing on the server can derive
-- what cash a guest handed over. `mms_fulfill_cash_order` computes
--   total = subtotal - discount + service + tax + tip
-- with no constraint of its own on the last term, so a NEGATIVE tip would silently REDUCE the
-- recorded total — a discount wearing a tip's name, arriving through the money path with every other
-- guard satisfied.
--
-- The app bounds it in Zod (`settleCashInput.tipCents`, 0..100000), and `apps/qr/lib/cash-tip.test.ts`
-- watches that refusal go red. This file is the OTHER half: the `qr_orders_tip_cents_nonneg` column
-- CHECK, asserted from the database, where no caller can route around it. The W17c-2 review's L3 was
-- exactly this — nobody had watched the constraint itself reject anything, so a typo in it (wrong
-- column, wrong operator) would have gone unnoticed behind a green app-layer test.
--
-- Same deliberate no-cross-reading rule as tax_parity_test.sql: the TS half and this half pin the
-- rule independently, in different CI jobs, so a one-sided edit reddens exactly one of them.
--
-- Run against any QR DB (rolls back — leaves NO data behind):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/cash_tip_bound_test.sql
--
-- ⚠️ `set local plpgsql.check_asserts = on` is NOT optional — with the GUC off every ASSERT compiles
-- out and the file exits 0 having proved nothing.

begin;
set local plpgsql.check_asserts = on;

-- ── 1 · the constraint exists, on the column we think it does ───────────────────────────────────
do $$
declare v_def text;
begin
  select pg_get_constraintdef(c.oid) into v_def
    from pg_constraint c join pg_class t on t.oid = c.conrelid
   where t.relname = 'qr_orders' and c.conname = 'qr_orders_tip_cents_nonneg';
  assert v_def is not null, 'qr_orders_tip_cents_nonneg is missing';
  -- Names it explicitly: a constraint that exists but guards `total_cents`, or reads `<= 0`, is the
  -- failure this whole file exists to catch.
  assert v_def ilike '%tip_cents%', format('constraint does not mention tip_cents: %s', v_def);
end $$;

-- ── 2 · it actually REFUSES a negative tip (the red-first half) ─────────────────────────────────
-- A row is INSERTED rather than borrowed: the CI stack boots from seed.sql, which creates no orders,
-- so a test that needed an existing row would either fail there or (worse) skip itself into a
-- vacuous green. Only four columns lack defaults and none are foreign keys, so a synthetic row is
-- cheap and the whole block rolls back.
do $$
declare v_order uuid; v_refused boolean := false;
begin
  insert into public.qr_orders (subtotal_cents, service_charge_cents, tax_cents, total_cents)
  values (4000, 0, 368, 4368)
  returning id into v_order;
  assert v_order is not null, 'could not create the probe order';

  begin
    update public.qr_orders set tip_cents = -1 where id = v_order;
  exception when check_violation then
    v_refused := true;
  end;
  assert v_refused, 'the CHECK accepted tip_cents = -1 — a negative tip can reduce a recorded total';

  -- The insert path too: a CHECK is only half-proven if it is watched refusing an UPDATE alone.
  v_refused := false;
  begin
    insert into public.qr_orders (subtotal_cents, service_charge_cents, tax_cents, total_cents, tip_cents)
    values (4000, 0, 368, 4368, -1);
  exception when check_violation then
    v_refused := true;
  end;
  assert v_refused, 'the CHECK accepted an INSERT with tip_cents = -1';

  -- ...and does NOT refuse a legitimate one. An over-tight bound is as broken as no bound: it would
  -- block a real settle mid-service, the failure nobody notices in a test that only checks refusals.
  update public.qr_orders set tip_cents = 0 where id = v_order;
  update public.qr_orders set tip_cents = 100000 where id = v_order;
end $$;

rollback;
