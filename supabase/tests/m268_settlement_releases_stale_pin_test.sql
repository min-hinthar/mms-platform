-- supabase/tests/m268_settlement_releases_stale_pin_test.sql  (M268)
--
-- `mms_promo_discount` honours any non-null pin outright (m70: "a granted pin wins outright"), so a
-- pin an abandoned card attempt left priced the register's cash settle with a discount a different
-- basket earned. The settle now releases it under its own freeze, before it reads a total, through
-- `mms_release_promo_grant_for_settlement` (20261009120000). This file proves the legitimate release
-- AND every refusal, and that each guard is what refuses.
--
-- ── What each case is for ───────────────────────────────────────────────────────────────────────
--   1. THE DEFECT, then the fix. A $30 basket's attempt pinned $10; the basket is now $24, under the
--      promo's $25 minimum. Before the release the settle's discount is the stale $10; after it, the
--      live derivation's $0 — the counter charges the UN-discounted total.
--   2. A LEGITIMATE PROMO STILL DISCOUNTS. A stale $5 pin over a basket whose applied code is worth
--      $10 live: after the release the discount is the re-derived $10, and `promo_code` is untouched.
--   3. No pin at all: the release still answers 1 (its postcondition — the pin is null under THIS
--      freeze), and the applied promo still discounts.
--   4–7. REFUSALS — each answers 0 and leaves the pin: another request's freeze · no freeze · a cart
--      still naming a live intent (M151's rule) · a cart that is no longer open.
--   8. PRIVILEGES — service_role only; anon and authenticated cannot execute it.
--   9. A MUTANT PER GUARD, built from the LIVE definition (`pg_get_functiondef`, one guard removed
--      by an exact find that must match once — a stale find fails the file): on its own refusal
--      fixture each mutant DOES write, so the fixture separates the guard from the rest of the
--      predicate and the real function's 0 above is that guard's doing, never the fixture's. One
--      more for the legitimate-promo half: a release that also drops `promo_code` loses case 2's
--      discount on case 2's fixture.
--
-- Run against any QR DB (rolls back — leaves NO data behind):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/m268_settlement_releases_stale_pin_test.sql

begin;
-- W8: without this GUC every ASSERT below compiles out and the file exits 0 having proved nothing.
set local plpgsql.check_asserts = on;

do $$
declare
  ana   uuid := '00000000-0000-0000-0000-0000000268a0';
  dish  text := 'cccccccc-0000-4000-8000-000000000268';
  mine  uuid := gen_random_uuid();   -- THIS settle request's freeze owner
  other uuid := gen_random_uuid();   -- a colleague's request
  sess uuid; cart uuid;
  n integer; d integer; pin integer; applied text;
  def text; mutated text; guard record;
begin
  -- $10 off, needs a $25 basket.
  insert into public.promo_codes (code, kind, value, max_uses, used, active, per_session_limit,
                                  min_subtotal_cents, valid_from, valid_until)
    values ('M268TEN', 'flat', 1000, 999, 0, true, 99, 2500, null, null)
    on conflict (code) do update set kind = 'flat', value = 1000, active = true, used = 0,
      per_session_limit = 99, min_subtotal_cents = 2500, valid_from = null, valid_until = null;

  -- ══ 1. THE DEFECT, then the fix — a stale $10 pin over a $24 basket ═══════════════════════════
  sess := gen_random_uuid(); cart := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat)
    values (sess, 'M268C1', 'dinein', 'active', ana);
  insert into public.qr_carts (id, session_id, promo_code) values (cart, sess, 'M268TEN');
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (cart, dish, 'Mohinga', 1, 3000, 0, null, 'dinein');
  -- The abandoned card attempt: pinned at $30, then the client's exits both failed.
  assert public.mms_pin_promo_grant(cart) = 1000, 'M268.1 fixture drift: the pin should capture $10';
  update public.qr_cart_items set state = 'voided' where cart_id = cart;
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (cart, dish, 'Mohinga', 1, 2400, 0, null, 'dinein');
  assert public.mms_promo_discount_live(cart) = 0,
    'M268.1 DEGENERATE: the $24 basket must earn nothing live — else the pin and the live value agree';
  d := public.mms_promo_discount(cart);
  assert d = 1000,
    format('M268.1 CONTROL LOST: before the release the settle must still read the stale pin '
           '(the defect) — got %s. If this is 0 the case cannot tell the fix from nothing.', d);
  -- The counter takes the freeze (acquireSettlement's write), then releases under it.
  update public.qr_carts set settle_at = now(), settle_by = mine where id = cart;
  n := public.mms_release_promo_grant_for_settlement(cart, mine);
  assert n = 1, format('M268.1 the release under THIS freeze must write one row, got %s', n);
  select promo_granted_cents into pin from public.qr_carts where id = cart;
  assert pin is null, format('M268.1 the stale pin survived the release: %s', pin);
  d := public.mms_promo_discount(cart);
  assert d = 0,
    format('M268.1 THE DEFECT: the counter would charge a $10 discount the $24 basket never earned — '
           'got %s, want 0 (the un-discounted total)', d);

  -- ══ 2. A LEGITIMATE PROMO STILL DISCOUNTS — a stale $5 pin over a basket the code earns $10 on ══
  sess := gen_random_uuid(); cart := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat)
    values (sess, 'M268C2', 'dinein', 'active', ana);
  insert into public.qr_carts (id, session_id, promo_code, promo_granted_cents, settle_at, settle_by)
    values (cart, sess, 'M268TEN', 500, now(), mine);
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (cart, dish, 'Mohinga', 1, 4000, 0, null, 'dinein');
  assert public.mms_promo_discount(cart) = 500, 'M268.2 fixture drift: the stale pin should read $5';
  n := public.mms_release_promo_grant_for_settlement(cart, mine);
  assert n = 1, format('M268.2 the release must write one row, got %s', n);
  select promo_code into applied from public.qr_carts where id = cart;
  assert applied = 'M268TEN', format('M268.2 the release touched the APPLIED code: %s', applied);
  d := public.mms_promo_discount(cart);
  assert d = 1000,
    format('M268.2 a promo applied at the register must still discount, re-derived live — got %s, '
           'want 1000', d);

  -- ══ 3. No pin: the postcondition still holds, and the applied promo still discounts ═══════════
  sess := gen_random_uuid(); cart := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat)
    values (sess, 'M268C3', 'dinein', 'active', ana);
  insert into public.qr_carts (id, session_id, promo_code, settle_at, settle_by)
    values (cart, sess, 'M268TEN', now(), mine);
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (cart, dish, 'Mohinga', 1, 3000, 0, null, 'dinein');
  n := public.mms_release_promo_grant_for_settlement(cart, mine);
  assert n = 1,
    format('M268.3 an unpinned cart under THIS freeze is the postcondition already — want 1, got %s '
           '(0 would refuse every ordinary settle)', n);
  assert public.mms_promo_discount(cart) = 1000, 'M268.3 the applied promo must still discount';

  -- ══ 4–7. REFUSALS — each answers 0 and leaves the pin ════════════════════════════════════════
  -- 4. another request's freeze
  sess := gen_random_uuid(); cart := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat)
    values (sess, 'M268C4', 'dinein', 'active', ana);
  insert into public.qr_carts (id, session_id, promo_code, promo_granted_cents, settle_at, settle_by)
    values (cart, sess, 'M268TEN', 1000, now(), other);
  n := public.mms_release_promo_grant_for_settlement(cart, mine);
  select promo_granted_cents into pin from public.qr_carts where id = cart;
  assert n = 0 and pin = 1000,
    format('M268.4 a request released a pin under a COLLEAGUE''s freeze — rows %s, pin %s', n, pin);

  -- 5. no freeze at all
  sess := gen_random_uuid(); cart := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat)
    values (sess, 'M268C5', 'dinein', 'active', ana);
  insert into public.qr_carts (id, session_id, promo_code, promo_granted_cents)
    values (cart, sess, 'M268TEN', 1000);
  n := public.mms_release_promo_grant_for_settlement(cart, mine);
  select promo_granted_cents into pin from public.qr_carts where id = cart;
  assert n = 0 and pin = 1000,
    format('M268.5 a release with NO freeze on the cart wrote — rows %s, pin %s', n, pin);

  -- 6. a live intent still named (M151: its pin is not this caller's to clear)
  sess := gen_random_uuid(); cart := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat)
    values (sess, 'M268C6', 'dinein', 'active', ana);
  insert into public.qr_carts (id, session_id, promo_code, promo_granted_cents, settle_at, settle_by,
                               live_payment_intent_id)
    values (cart, sess, 'M268TEN', 1000, now(), mine, 'pi_m268_live');
  n := public.mms_release_promo_grant_for_settlement(cart, mine);
  select promo_granted_cents into pin from public.qr_carts where id = cart;
  assert n = 0 and pin = 1000,
    format('M268.6 a pin a LIVE intent reconciles against was cleared — rows %s, pin %s', n, pin);

  -- 7. a cart that is no longer open
  sess := gen_random_uuid(); cart := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat)
    values (sess, 'M268C7', 'dinein', 'active', ana);
  insert into public.qr_carts (id, session_id, promo_code, promo_granted_cents, settle_at, settle_by, status)
    values (cart, sess, 'M268TEN', 1000, now(), mine, 'paid');
  n := public.mms_release_promo_grant_for_settlement(cart, mine);
  select promo_granted_cents into pin from public.qr_carts where id = cart;
  assert n = 0 and pin = 1000,
    format('M268.7 a PAID cart''s pin (its order''s history) was cleared — rows %s, pin %s', n, pin);

  -- ══ 8. PRIVILEGES ════════════════════════════════════════════════════════════════════════════
  assert not has_function_privilege('anon',
           'public.mms_release_promo_grant_for_settlement(uuid, uuid)', 'execute'),
    'M268.8 anon can execute the settlement release';
  assert not has_function_privilege('authenticated',
           'public.mms_release_promo_grant_for_settlement(uuid, uuid)', 'execute'),
    'M268.8 authenticated can execute the settlement release';
  assert has_function_privilege('service_role',
           'public.mms_release_promo_grant_for_settlement(uuid, uuid)', 'execute'),
    'M268.8 service_role cannot execute the settlement release — the settle would always refuse';

  -- ══ 9. A MUTANT PER GUARD, from the LIVE definition ══════════════════════════════════════════
  def := pg_get_functiondef('public.mms_release_promo_grant_for_settlement(uuid, uuid)'::regprocedure);
  for guard in
    select * from (values
      ('owner',  'and settle_by = p_owner',              4),
      ('link',   'and live_payment_intent_id is null',   6),
      ('status', 'and status = ''open''',                7)
    ) as g(name, find, refusal_case)
  loop
    assert (length(def) - length(replace(def, guard.find, ''))) / length(guard.find) = 1,
      format('M268.9 STALE MUTANT %s: its find must match the live definition exactly once', guard.name);
    mutated := replace(replace(def, guard.find, ''),
                       'public.mms_release_promo_grant_for_settlement(', 'pg_temp.m268_mutant(');
    execute mutated;
    -- Rebuild that guard's refusal fixture and run the MUTANT on it: it must WRITE.
    sess := gen_random_uuid(); cart := gen_random_uuid();
    insert into public.table_sessions (id, qr_code, mode, status, host_seat)
      values (sess, 'M268M' || guard.refusal_case, 'dinein', 'active', ana);
    insert into public.qr_carts (id, session_id, promo_code, promo_granted_cents, settle_at, settle_by,
                                 live_payment_intent_id, status)
      values (cart, sess, 'M268TEN', 1000, now(),
              case when guard.refusal_case = 4 then other else mine end,
              case when guard.refusal_case = 6 then 'pi_m268_live' end,
              case when guard.refusal_case = 7 then 'paid' else 'open' end);
    n := pg_temp.m268_mutant(cart, mine);
    assert n = 1,
      format('M268.9 DEGENERATE FIXTURE for the %s guard: without it the release still wrote %s rows, '
             'so case %s''s refusal is not that guard''s doing', guard.name, n, guard.refusal_case);
    -- …and the REAL function refuses the very same row.
    update public.qr_carts set promo_granted_cents = 1000 where id = cart;
    n := public.mms_release_promo_grant_for_settlement(cart, mine);
    assert n = 0, format('M268.9 the real %s guard did not refuse its fixture (rows %s)', guard.name, n);
    drop function pg_temp.m268_mutant(uuid, uuid);
  end loop;

  -- …and the legitimate-promo half: a release that ALSO dropped the applied code would lose the
  -- discount case 2 keeps. Built the same way; on case 2's fixture it must read $0 where the real
  -- function's release read $10, so case 2's 1000 is the untouched code's doing.
  assert (length(def) - length(replace(def, 'set promo_granted_cents = null', '')))
           / length('set promo_granted_cents = null') = 1,
    'M268.9 STALE MUTANT code: its find must match the live definition exactly once';
  mutated := replace(replace(def, 'set promo_granted_cents = null',
                             'set promo_granted_cents = null, promo_code = null'),
                     'public.mms_release_promo_grant_for_settlement(', 'pg_temp.m268_mutant(');
  execute mutated;
  sess := gen_random_uuid(); cart := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat)
    values (sess, 'M268M2', 'dinein', 'active', ana);
  insert into public.qr_carts (id, session_id, promo_code, promo_granted_cents, settle_at, settle_by)
    values (cart, sess, 'M268TEN', 500, now(), mine);
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (cart, dish, 'Mohinga', 1, 4000, 0, null, 'dinein');
  n := pg_temp.m268_mutant(cart, mine);
  d := public.mms_promo_discount(cart);
  assert n = 1 and d = 0,
    format('M268.9 DEGENERATE FIXTURE for the applied code: a release that drops it still discounted '
           '%s (rows %s), so case 2 cannot tell the untouched code from a cleared one', d, n);
  drop function pg_temp.m268_mutant(uuid, uuid);

  raise notice 'M268 settlement promo-pin release: all 9 cases passed';
end $$;

rollback;
