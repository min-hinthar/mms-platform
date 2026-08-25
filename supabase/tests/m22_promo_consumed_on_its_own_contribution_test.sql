-- supabase/tests/m22_promo_consumed_on_its_own_contribution_test.sql  (M22, Codex round 1 P2)
--
-- Fulfillment consumed a promo redemption whenever the COMBINED discount was positive:
--
--     if v_promo is not null and p_discount_cents > 0 then
--       perform public.mms_promo_consume(v_promo, v_session, v_order);
--
-- `p_discount_cents` folds the promo and the reward coupon together, so it is not a fact about the
-- promo at all. When the promo delivers 0 and a reward keeps the sum positive, the code is consumed
-- for nothing: `promo_codes.used` increments and a `promo_redemptions` row lands, spending global
-- and per-session budget that bought no discount for anyone.
--
-- Two ways to reach it. One is OLD — an attached code that has expired or fallen under its
-- min-subtotal makes `mms_promo_discount` return 0 while an applied reward keeps the total positive.
-- One is NEW — M22 made the reward clamp FIRST, so a coupon covering the whole basket leaves the
-- promo at 0. M22 widened a hole it did not dig; the fix closes both.
--
-- ── What each case is for ───────────────────────────────────────────────────────────────────────
--   1. THE DEFECT — promo contributes 0, reward carries the discount. Must NOT consume.
--   2. The legitimate case — promo contributes. Must consume, or the fix has simply broken promos.
--      Without this case, deleting `mms_promo_consume` entirely would leave the file green.
--   3. DEPLOY SAFETY — `p_promo_cents` omitted. The coalesce must fall back to the old predicate so
--      a not-yet-updated caller behaves exactly as today; this is what lets the migration land
--      before the app deploy rather than in lockstep with it.
--
-- Every case asserts on BOTH sides of the ledger (`promo_codes.used` and the `promo_redemptions`
-- row), because `mms_promo_consume` writes both and a half-fix would leave one of them wrong.
--
-- Run against any QR DB (rolls back — leaves NO data behind):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/m22_promo_consumed_on_its_own_contribution_test.sql

begin;
-- W8: without this GUC every ASSERT below compiles out and the file exits 0 having proved nothing.
set local plpgsql.check_asserts = on;

do $$
declare
  ana   uuid := '00000000-0000-0000-0000-0000000022a0';
  dish  text := 'cccccccc-0000-4000-8000-000000000022';
  price integer := 1000;
  sess  uuid; cart uuid; ord uuid;
  used_before integer; used_after integer; reds integer;
begin
  -- One code, generous budget, so nothing below is refused by a limit rather than by the gate.
  insert into public.promo_codes (code, kind, value, max_uses, used, active, per_session_limit)
    values ('M22ZERO', 'flat', 100, 999, 0, true, 99)
    on conflict (code) do update set used = 0, active = true, per_session_limit = 99;

  -- ══ 1. THE DEFECT — the promo delivered NOTHING; the reward carried the whole discount ════════
  sess := gen_random_uuid(); cart := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat)
    values (sess, 'M22C1', 'dinein', 'active', ana);
  insert into public.qr_carts (id, session_id, promo_code) values (cart, sess, 'M22ZERO');
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (cart, dish, 'Mohinga', 1, price, 0, null, 'dinein');

  select used into used_before from public.promo_codes where code = 'M22ZERO';

  -- subtotal 1000, discount 1000 (ALL of it the reward), promo contribution 0 → total 0.
  ord := public.mms_fulfill_order(
    cart, 'pi_m22_case1', 0, price, price, 0, 0, 0, null, 'card',
    0                                  -- p_promo_cents: the promo delivered nothing
  );
  assert ord is not null, 'M22.1 fixture drift: fulfillment should still succeed';

  select used into used_after from public.promo_codes where code = 'M22ZERO';
  assert used_after = used_before,
    format('M22.1 THE DEFECT: a promo that delivered 0 must not be consumed — used went %s → %s',
           used_before, used_after);
  select count(*) into reds from public.promo_redemptions where code = 'M22ZERO' and session_id = sess;
  assert reds = 0, format('M22.1 THE DEFECT: no redemption row should exist, found %s', reds);

  -- ══ 2. The legitimate case — the promo DID deliver, so it must still be consumed ══════════════
  sess := gen_random_uuid(); cart := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat)
    values (sess, 'M22C2', 'dinein', 'active', ana);
  insert into public.qr_carts (id, session_id, promo_code) values (cart, sess, 'M22ZERO');
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (cart, dish, 'Mohinga', 1, price, 0, null, 'dinein');

  select used into used_before from public.promo_codes where code = 'M22ZERO';

  -- subtotal 1000, discount 100, ALL of it the promo → total 900.
  ord := public.mms_fulfill_order(
    cart, 'pi_m22_case2', 900, price, 100, 0, 0, 0, null, 'card',
    100                                -- p_promo_cents: the promo delivered 100
  );
  assert ord is not null, 'M22.2 fixture drift: fulfillment should succeed';

  select used into used_after from public.promo_codes where code = 'M22ZERO';
  assert used_after = used_before + 1,
    format('M22.2 OVER-TIGHTENED: a promo that DELIVERED must still be consumed — used went %s → %s',
           used_before, used_after);
  select count(*) into reds from public.promo_redemptions where code = 'M22ZERO' and session_id = sess;
  assert reds = 1, format('M22.2 OVER-TIGHTENED: exactly one redemption row expected, found %s', reds);

  -- ══ 3. DEPLOY SAFETY — p_promo_cents OMITTED falls back to the old combined-discount predicate ═
  -- This is the case that lets the migration land ahead of the app: an old caller keeps today's
  -- behaviour exactly. It is deliberately the PERMISSIVE direction — asserting the fallback consumes
  -- is what proves the coalesce is wired, since a hard-coded `false` would pass cases 1 and 3 both.
  sess := gen_random_uuid(); cart := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat)
    values (sess, 'M22C3', 'dinein', 'active', ana);
  insert into public.qr_carts (id, session_id, promo_code) values (cart, sess, 'M22ZERO');
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (cart, dish, 'Mohinga', 1, price, 0, null, 'dinein');

  select used into used_before from public.promo_codes where code = 'M22ZERO';

  ord := public.mms_fulfill_order(
    cart, 'pi_m22_case3', 900, price, 100, 0, 0, 0, null, 'card'
  );                                   -- p_promo_cents omitted → coalesce to p_discount_cents
  assert ord is not null, 'M22.3 fixture drift: fulfillment should succeed';

  select used into used_after from public.promo_codes where code = 'M22ZERO';
  assert used_after = used_before + 1,
    format('M22.3 FALLBACK LOST: an un-updated caller must keep the OLD behaviour — used went %s → %s',
           used_before, used_after);

  -- ══ 4. The cash path carries the identical gate ═══════════════════════════════════════════════
  -- `mms_fulfill_cash_order` consumes through the same `mms_promo_consume`, so a fix applied to only
  -- one of the two would leave the register burning codes for nothing. Same defect, other door.
  sess := gen_random_uuid(); cart := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat)
    values (sess, 'M22C4', 'dinein', 'active', ana);
  insert into public.qr_carts (id, session_id, promo_code) values (cart, sess, 'M22ZERO');
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (cart, dish, 'Mohinga', 1, price, 0, null, 'dinein');

  select used into used_before from public.promo_codes where code = 'M22ZERO';

  -- `p_settled_by` is null, not `ana`: the column FKs to `public.staff(user_id)` and this file
  -- creates no staff row, so passing a fabricated id would fail on the FK rather than the gate —
  -- green for the wrong reason in the loudest possible way. Null is a real production value here
  -- (a guest paying on their own phone leaves it null).
  ord := public.mms_fulfill_cash_order(cart, null, price, price, 0, 0, 0, 0);
  assert ord is not null, 'M22.4 fixture drift: cash fulfillment should succeed';

  select used into used_after from public.promo_codes where code = 'M22ZERO';
  assert used_after = used_before,
    format('M22.4 THE DEFECT (cash): the CASH path must not consume a promo that delivered 0 — used went %s → %s',
           used_before, used_after);

  raise notice 'M22 promo-consumption gate: all 4 cases passed';
end $$;

rollback;
