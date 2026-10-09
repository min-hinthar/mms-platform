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
--   4–8. REFUSALS — each leaves the pin, and says WHICH refusal: -1 when this request does not hold
--      the cart (another request's freeze · no freeze · THIS request's freeze gone STALE · a cart no
--      longer open), 0 when its fresh freeze holds the cart and only a live intent stands in the way
--      (M151's rule) — the one answer under which the caller may supersede that intent.
--      6 is Codex's case on #338 @ 56a4fd1: a settle stalled past the 10-minute TTL while a diner
--      took the cart (`acquireCartLock` accepts a stale `settle_at` and leaves `settle_by`) and
--      pinned a grant it has not linked yet. Plus the TTL's edge (stale AT 10 minutes, matching
--      `acquireCartLock`'s `lte`) and one second inside it (still ours — the TTL, not a tighter one).
--   9. PRIVILEGES — service_role only; anon and authenticated cannot execute it.
--  10. A MUTANT PER GUARD, built from the LIVE definition (`pg_get_functiondef`, one guard removed
--      by an exact find that must match once — a stale find fails the file): on its own refusal
--      fixture each mutant DOES write, so the fixture separates the guard from the rest of the
--      predicate and the real function's refusal above is that guard's doing, never the fixture's.
--      The probe that names the refusal gets the same treatment: each of its guards removed, a
--      LINKED fixture violating that guard answers 0 ("still yours — supersede") where the real
--      function answers -1. One more for the legitimate-promo half: a release that also drops
--      `promo_code` loses case 2's discount on case 2's fixture.
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

  -- ══ 4–8. REFUSALS — each leaves the pin and names its refusal ══════════════════════════════════
  -- 4. another request's freeze
  sess := gen_random_uuid(); cart := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat)
    values (sess, 'M268C4', 'dinein', 'active', ana);
  insert into public.qr_carts (id, session_id, promo_code, promo_granted_cents, settle_at, settle_by)
    values (cart, sess, 'M268TEN', 1000, now(), other);
  n := public.mms_release_promo_grant_for_settlement(cart, mine);
  select promo_granted_cents into pin from public.qr_carts where id = cart;
  assert n = -1 and pin = 1000,
    format('M268.4 a release under a COLLEAGUE''s freeze must refuse as not-ours (-1) and leave the '
           'pin — rows %s, pin %s', n, pin);

  -- 5. no freeze at all
  sess := gen_random_uuid(); cart := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat)
    values (sess, 'M268C5', 'dinein', 'active', ana);
  insert into public.qr_carts (id, session_id, promo_code, promo_granted_cents)
    values (cart, sess, 'M268TEN', 1000);
  n := public.mms_release_promo_grant_for_settlement(cart, mine);
  select promo_granted_cents into pin from public.qr_carts where id = cart;
  assert n = -1 and pin = 1000,
    format('M268.5 a release with NO freeze on the cart must refuse as not-ours (-1) — rows %s, pin %s',
           n, pin);

  -- 6. THIS request's freeze, gone STALE — and a successor diner pinned in the gap (Codex, P2)
  sess := gen_random_uuid(); cart := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat)
    values (sess, 'M268C6', 'dinein', 'active', ana);
  insert into public.qr_carts (id, session_id, promo_code, settle_at, settle_by)
    values (cart, sess, 'M268TEN', now() - interval '11 minutes', mine);
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (cart, dish, 'Mohinga', 1, 3000, 0, null, 'dinein');
  -- The successor's create-intent: acquireCartLock's write (pay-lock columns ONLY — `settle_by`
  -- stays ours), then its pin, and the link not yet written.
  update public.qr_carts set locked = true, locked_at = now(), locked_by = ana where id = cart;
  assert public.mms_pin_promo_grant(cart) = 1000, 'M268.6 fixture drift: the successor should pin $10';
  n := public.mms_release_promo_grant_for_settlement(cart, mine);
  select promo_granted_cents into pin from public.qr_carts where id = cart;
  assert n = -1 and pin = 1000,
    format('M268.6 a settle stalled past the TTL cleared the SUCCESSOR''s fresh pin (or was told the '
           'cart is still its own) — rows %s, pin %s; want -1 and 1000', n, pin);
  -- …at the TTL's edge it is already stale: `acquireCartLock` takes the cart at `settle_at <= cutoff`.
  sess := gen_random_uuid(); cart := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat)
    values (sess, 'M268C6E', 'dinein', 'active', ana);
  insert into public.qr_carts (id, session_id, promo_code, promo_granted_cents, settle_at, settle_by)
    values (cart, sess, 'M268TEN', 1000, now() - interval '10 minutes', mine);
  n := public.mms_release_promo_grant_for_settlement(cart, mine);
  select promo_granted_cents into pin from public.qr_carts where id = cart;
  assert n = -1 and pin = 1000,
    format('M268.6 AT the 10-minute edge a diner may already hold the cart — want -1, got rows %s, '
           'pin %s', n, pin);
  -- …and one second inside it the freeze is still ours: the TTL is the settle TTL, not a tighter one.
  sess := gen_random_uuid(); cart := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat)
    values (sess, 'M268C6I', 'dinein', 'active', ana);
  insert into public.qr_carts (id, session_id, promo_code, promo_granted_cents, settle_at, settle_by)
    values (cart, sess, 'M268TEN', 1000, now() - interval '9 minutes 59 seconds', mine);
  n := public.mms_release_promo_grant_for_settlement(cart, mine);
  select promo_granted_cents into pin from public.qr_carts where id = cart;
  assert n = 1 and pin is null,
    format('M268.6 a freeze one second inside the TTL is still THIS request''s — want 1, got rows %s, '
           'pin %s', n, pin);

  -- 7. a live intent still named (M151: its pin is not this caller's to clear) — under OUR fresh
  -- freeze, so the answer is 0: the caller holds the cart and may supersede that intent.
  sess := gen_random_uuid(); cart := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat)
    values (sess, 'M268C7', 'dinein', 'active', ana);
  insert into public.qr_carts (id, session_id, promo_code, promo_granted_cents, settle_at, settle_by,
                               live_payment_intent_id)
    values (cart, sess, 'M268TEN', 1000, now(), mine, 'pi_m268_live');
  n := public.mms_release_promo_grant_for_settlement(cart, mine);
  select promo_granted_cents into pin from public.qr_carts where id = cart;
  assert n = 0 and pin = 1000,
    format('M268.7 a pin a LIVE intent reconciles against must stay, answered 0 (ours, linked) — '
           'rows %s, pin %s', n, pin);

  -- 8. a cart that is no longer open
  sess := gen_random_uuid(); cart := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat)
    values (sess, 'M268C8', 'dinein', 'active', ana);
  insert into public.qr_carts (id, session_id, promo_code, promo_granted_cents, settle_at, settle_by, status)
    values (cart, sess, 'M268TEN', 1000, now(), mine, 'paid');
  n := public.mms_release_promo_grant_for_settlement(cart, mine);
  select promo_granted_cents into pin from public.qr_carts where id = cart;
  assert n = -1 and pin = 1000,
    format('M268.8 a PAID cart''s pin (its order''s history) must stay, refused as not-ours (-1) — '
           'rows %s, pin %s', n, pin);

  -- ══ 9. PRIVILEGES ════════════════════════════════════════════════════════════════════════════
  assert not has_function_privilege('anon',
           'public.mms_release_promo_grant_for_settlement(uuid, uuid)', 'execute'),
    'M268.9 anon can execute the settlement release';
  assert not has_function_privilege('authenticated',
           'public.mms_release_promo_grant_for_settlement(uuid, uuid)', 'execute'),
    'M268.9 authenticated can execute the settlement release';
  assert has_function_privilege('service_role',
           'public.mms_release_promo_grant_for_settlement(uuid, uuid)', 'execute'),
    'M268.9 service_role cannot execute the settlement release — the settle would always refuse';

  -- ══ 10. A MUTANT PER GUARD, from the LIVE definition ═════════════════════════════════════════
  def := pg_get_functiondef('public.mms_release_promo_grant_for_settlement(uuid, uuid)'::regprocedure);
  -- The UPDATE's guards: without one, its own refusal fixture is WRITTEN.
  for guard in
    select * from (values
      ('owner',  'and settle_by = p_owner',                           4, -1),
      ('fresh',  'and settle_at > now() - interval ''10 minutes''',   6, -1),
      ('link',   'and live_payment_intent_id is null',                7,  0),
      ('status', 'and status = ''open''',                             8, -1)
    ) as g(name, find, refusal_case, refusal)
  loop
    assert (length(def) - length(replace(def, guard.find, ''))) / length(guard.find) = 1,
      format('M268.10 STALE MUTANT %s: its find must match the live definition exactly once', guard.name);
    mutated := replace(replace(def, guard.find, ''),
                       'public.mms_release_promo_grant_for_settlement(', 'pg_temp.m268_mutant(');
    execute mutated;
    -- Rebuild that guard's refusal fixture and run the MUTANT on it: it must WRITE.
    sess := gen_random_uuid(); cart := gen_random_uuid();
    insert into public.table_sessions (id, qr_code, mode, status, host_seat)
      values (sess, 'M268M' || guard.refusal_case, 'dinein', 'active', ana);
    insert into public.qr_carts (id, session_id, promo_code, promo_granted_cents, settle_at, settle_by,
                                 live_payment_intent_id, status)
      values (cart, sess, 'M268TEN', 1000,
              case when guard.refusal_case = 6 then now() - interval '11 minutes' else now() end,
              case when guard.refusal_case = 4 then other else mine end,
              case when guard.refusal_case = 7 then 'pi_m268_live' end,
              case when guard.refusal_case = 8 then 'paid' else 'open' end);
    n := pg_temp.m268_mutant(cart, mine);
    assert n = 1,
      format('M268.10 DEGENERATE FIXTURE for the %s guard: without it the release still answered %s, '
             'so case %s''s refusal is not that guard''s doing', guard.name, n, guard.refusal_case);
    -- …and the REAL function refuses the very same row, with that case's answer.
    update public.qr_carts set promo_granted_cents = 1000 where id = cart;
    n := public.mms_release_promo_grant_for_settlement(cart, mine);
    assert n = guard.refusal,
      format('M268.10 the real %s guard did not refuse its fixture as %s (answered %s)',
             guard.name, guard.refusal, n);
    drop function pg_temp.m268_mutant(uuid, uuid);
  end loop;

  -- The PROBE's guards: it names the refusal, and 0 licenses the caller to supersede a live intent.
  -- Every fixture here is LINKED (so the UPDATE refuses regardless) and violates one probe guard:
  -- without that guard the probe answers 0 — "still yours, supersede" — where the real one says -1.
  for guard in
    select * from (values
      ('held-owner',  'and c.settle_by = p_owner'),
      ('held-fresh',  'and c.settle_at > now() - interval ''10 minutes'''),
      ('held-status', 'and c.status = ''open''')
    ) as g(name, find)
  loop
    assert (length(def) - length(replace(def, guard.find, ''))) / length(guard.find) = 1,
      format('M268.10 STALE MUTANT %s: its find must match the live definition exactly once', guard.name);
    mutated := replace(replace(def, guard.find, ''),
                       'public.mms_release_promo_grant_for_settlement(', 'pg_temp.m268_mutant(');
    execute mutated;
    sess := gen_random_uuid(); cart := gen_random_uuid();
    insert into public.table_sessions (id, qr_code, mode, status, host_seat)
      values (sess, 'M268P' || guard.name, 'dinein', 'active', ana);
    insert into public.qr_carts (id, session_id, promo_code, promo_granted_cents, settle_at, settle_by,
                                 live_payment_intent_id, status)
      values (cart, sess, 'M268TEN', 1000,
              case when guard.name = 'held-fresh' then now() - interval '11 minutes' else now() end,
              case when guard.name = 'held-owner' then other else mine end,
              'pi_m268_successor',
              case when guard.name = 'held-status' then 'paid' else 'open' end);
    n := pg_temp.m268_mutant(cart, mine);
    assert n = 0,
      format('M268.10 DEGENERATE FIXTURE for the %s probe guard: without it the probe still answered '
             '%s, so the real -1 below is not that guard''s doing', guard.name, n);
    n := public.mms_release_promo_grant_for_settlement(cart, mine);
    select promo_granted_cents into pin from public.qr_carts where id = cart;
    assert n = -1 and pin = 1000,
      format('M268.10 the real %s probe guard told a request that does not hold the cart it may '
             'supersede the intent (answered %s, pin %s)', guard.name, n, pin);
    drop function pg_temp.m268_mutant(uuid, uuid);
  end loop;

  -- …and the legitimate-promo half: a release that ALSO dropped the applied code would lose the
  -- discount case 2 keeps. Built the same way; on case 2's fixture it must read $0 where the real
  -- function's release read $10, so case 2's 1000 is the untouched code's doing.
  assert (length(def) - length(replace(def, 'set promo_granted_cents = null', '')))
           / length('set promo_granted_cents = null') = 1,
    'M268.10 STALE MUTANT code: its find must match the live definition exactly once';
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
    format('M268.10 DEGENERATE FIXTURE for the applied code: a release that drops it still discounted '
           '%s (rows %s), so case 2 cannot tell the untouched code from a cleared one', d, n);
  drop function pg_temp.m268_mutant(uuid, uuid);

  raise notice 'M268 settlement promo-pin release: all 10 cases passed';
end $$;

rollback;
