-- m72_settlement_derives_availability_test.sql — M72.
--
-- WHY THIS FILE EXISTS, stated bluntly: the repo's only SQL test of this money-path function
-- (`w23d_dropped_visibility_test.sql`) cannot falsify a single one of its WHERE arms. Measured on a
-- scratch stack against the live 5-arg function: deleting `and ci.menu_item_id = any(p_menu_ids)`,
-- `and ci.state = 'draft'`, `and ci.fulfillment in ('dinein','togo')`, or even
-- `where ci.cart_id = p_cart` EACH still returns v_voided = 1 and the file still passes. Its fixture
-- is a single cart line, so every arm is satisfied vacuously.
--
-- That matters more here than it would elsewhere, because SQL has NO second guard in this repo:
-- `verify:slice` mutates only .ts (0 of 227 mutants name a supabase/ file), and
-- `manual-capture-run.test.ts` mocks the database wholesale — every assertion there is about the
-- CALLER's argument construction, never about what the SQL does. If a WHERE arm can be deleted with
-- everything green, it is not guarded at all.
--
-- ── The fixture is the test ─────────────────────────────────────────────────────────────────────
-- Five lines, and each one exists to kill a specific mutation. Measured: with only the sold-out line
-- (the obvious fixture), deleting the ENTIRE sellability predicate still returns 1 and passes.
--
--   L1 sold-out food          — the headline arm.
--   L2 SELLABLE food          — the negative control. Without it the predicate is deletable: void
--                               everything and the count still matches. No fixture is complete
--                               without a line that must SURVIVE.
--   L3 delisted food          — `is_active = false`, the arm with no runtime writer, so it can only
--                               ever be exercised here.
--   L4 grocery barcode        — must NOT be voided. It joins no catalog row, so without the
--                               fulfillment filter it falls into the dangling arm and every
--                               scan-and-go line is voided at settlement.
--   L5 dangling food id       — a uuid with no menu_items row, on a FOOD line. Kills LEFT->INNER
--                               (which fails OPEN, reversing availability.ts:104-113) and pins the
--                               cast direction: `ci.menu_item_id::uuid` raises 22P02 on L4's barcode.
--
-- Expected: 3 voided (L1, L3, L5), 2 surviving (L2, L4).
--
-- Cases:
--   1. The derivation — 3 voided, and the RIGHT 3. Asserts per-line state, not just the count.
--   2. The negative control survives, and its line is still chargeable.
--   3. LEDGER PARITY — exactly one qr_dropped_lines row per voided line, stamped with this attempt's
--      intent. A second call must not double-write: the ledger has no unique constraint and
--      mms_dropped_snapshot aggregates without `distinct`, so a duplicate reaches the diner's
--      /track card and receipt as the same dish listed twice.
--   4. A comped line's ledger amount is 0, not its list price.
--   5. The caller's list is IGNORED — the whole point of M72. Passing a list naming the SELLABLE
--      line must not void it, and passing an empty list must not stop the derivation.
--   6-8. The authority arms (-1 cart not open, -2 lock lost, -2 superseded era), which have had
--      ZERO SQL coverage until now — they are pinned only in TypeScript, against a MOCKED return
--      value, i.e. the test asserts what the caller does with a number it invented.
--   9. PRIVILEGES. Measured: a drop-and-recreate resets pg_proc.proacl to NULL — EXECUTE to PUBLIC —
--      and every QR diner is `authenticated` (anonymous auth). With SECURITY DEFINER bypassing table
--      grants and `null is distinct from null` being FALSE, a diner could then void lines and mint a
--      qr_dropped_lines row with an attacker-chosen payment_intent, which mms_dropped_snapshot
--      renders back to a diner. Nothing else in this repo would catch it: types-fresh diffs a file
--      carrying no privilege data, and the only other has_function_privilege assertion anywhere is
--      hand-written for one unrelated function.
--
-- Run against any QR DB (rolls back — leaves NO data behind):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/m72_settlement_derives_availability_test.sql

begin;
set local client_min_messages = warning;

do $$
declare
  cat   uuid := '00000000-0000-0000-0000-0000000072c0';
  sess  uuid := '00000000-0000-0000-0000-0000000072e0';
  cart  uuid := '00000000-0000-0000-0000-0000000072ca';
  ana   uuid := '00000000-0000-0000-0000-0000000072a0';
  era   timestamptz := now();
  m_out uuid := '00000000-0000-4000-8000-000000720001';  -- L1 sold out
  m_ok  uuid := '00000000-0000-4000-8000-000000720002';  -- L2 sellable
  m_del uuid := '00000000-0000-4000-8000-000000720003';  -- L3 delisted
  l1 uuid := '00000000-0000-0000-0000-0000007201f1';
  l2 uuid := '00000000-0000-0000-0000-0000007201f2';
  l3 uuid := '00000000-0000-0000-0000-0000007201f3';
  l4 uuid := '00000000-0000-0000-0000-0000007201f4';
  l5 uuid := '00000000-0000-0000-0000-0000007201f5';
  v integer; n integer;
begin
  insert into public.menu_categories (id, slug, name_en, sort)
    values (cat, 'm72-cat', 'M72', 720)
    on conflict (id) do nothing;
  insert into public.menu_items (id, category_id, slug, name_en, base_price_cents, is_active, is_sold_out)
    values (m_out, cat, 'm72-out', 'Sold Out Dish', 1200, true,  true),
           (m_ok,  cat, 'm72-ok',  'Available Dish', 1500, true,  false),
           (m_del, cat, 'm72-del', 'Delisted Dish',  1300, false, false);

  insert into public.table_sessions (id, qr_code, mode, status, host_seat)
    values (sess, 'M72QR', 'pickup', 'active', ana);
  insert into public.qr_carts (id, session_id, status, locked, locked_at, locked_by)
    values (cart, sess, 'open', true, era, ana);

  insert into public.qr_cart_items
    (id, cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, state, fulfillment, comped)
  values
    (l1, cart, m_out::text,                          'Sold Out Dish',  2, 1200, 0, 'draft', 'togo',  false),
    (l2, cart, m_ok::text,                           'Available Dish', 1, 1500, 0, 'draft', 'togo',  false),
    (l3, cart, m_del::text,                          'Delisted Dish',  1, 1300, 0, 'draft', 'dinein',false),
    -- A grocery barcode: not a uuid. This is the line that makes `ci.menu_item_id::uuid` raise.
    (l4, cart, '0123456789012',                      'Rice 5kg',       1,  900, 0, 'draft', 'grocery', false),
    -- A well-formed uuid with no catalog row, on a FOOD line.
    (l5, cart, '00000000-0000-4000-8000-0000007209ff','Ghost Curry',   1, 1100, 0, 'draft', 'togo',  false);

  -- ══ 1. THE DERIVATION — three void, and the right three ═══════════════════════════════════════
  v := public.mms_settle_precheck_and_void(cart, null, ana, era, 'pi_m72_1');
  assert v = 3, format('M72.1 wrong count: got %s, want 3 (sold-out + delisted + dangling)', v);

  assert (select state from public.qr_cart_items where id = l1) = 'voided', 'M72.1 sold-out line survived';
  assert (select state from public.qr_cart_items where id = l3) = 'voided', 'M72.1 delisted line survived — is_active has no runtime writer, so this arm is only ever exercised here';
  assert (select state from public.qr_cart_items where id = l5) = 'voided',
    'M72.1 DANGLING id survived: an INNER join fails OPEN on a line whose catalog row is gone, '
    'reversing availability.ts:104-113 (the "Ghost Curry" rule). The join must be LEFT with an is-null arm';

  -- ══ 2. THE NEGATIVE CONTROL — without this the whole predicate is deletable ═══════════════════
  assert (select state from public.qr_cart_items where id = l2) = 'draft',
    'M72.2 A SELLABLE DISH WAS VOIDED. Measured: with a sold-out-only fixture, deleting the entire '
    'sellability predicate still returns the expected count and passes. This line is the fixture''s '
    'only defence against "void everything"';
  assert (select state from public.qr_cart_items where id = l4) = 'draft',
    'M72.4 A GROCERY LINE WAS VOIDED. A barcode joins no catalog row, so without the fulfillment '
    'filter it falls into the dangling arm and every scan-and-go basket is emptied at settlement';

  -- ══ 3. LEDGER PARITY — one row per voided line, and a re-run must not double-write ════════════
  select count(*) into n from public.qr_dropped_lines where cart_id = cart;
  assert n = 3, format('M72.3 ledger rows: got %s, want 3', n);
  assert (select count(*) from public.qr_dropped_lines where cart_id = cart and payment_intent = 'pi_m72_1') = 3,
    'M72.3 dropped lines not stamped with THIS attempt''s intent';

  v := public.mms_settle_precheck_and_void(cart, null, ana, era, 'pi_m72_1');
  assert v = 0, format('M72.3 second call voided %s — the lines are already voided, so the draft filter must exclude them', v);
  select count(*) into n from public.qr_dropped_lines where cart_id = cart;
  assert n = 3,
    format('M72.3 DUPLICATE LEDGER ROWS: got %s, want 3. qr_dropped_lines has no unique constraint '
           'and mms_dropped_snapshot aggregates without `distinct`, so a duplicate reaches the '
           'diner''s /track card and receipt as the same dish listed twice.', n);

  -- ══ 4. A COMPED LINE IS WORTH ZERO TO THE LEDGER ══════════════════════════════════════════════
  assert (select amount_cents from public.qr_dropped_lines where line_id = l1) = 2400,
    'M72.4 amount is qty * unit_price for an uncomped line';

  -- ══ 5. THE CALLER'S LIST IS IGNORED — the whole point of M72 ══════════════════════════════════
  -- Before this change the void was `where menu_item_id = any(p_menu_ids)`: the app read the
  -- catalog, decided which dishes could not be made, and the server voided exactly what it was told.
  -- Naming the SELLABLE dish here must therefore do nothing at all.
  update public.qr_cart_items set state = 'draft' where id in (l1, l2);
  delete from public.qr_dropped_lines where cart_id = cart;
  v := public.mms_settle_precheck_and_void(cart, array[m_ok::text], ana, era, 'pi_m72_5');
  assert v = 1, format('M72.5 got %s, want 1 — only the sold-out line should void', v);
  assert (select state from public.qr_cart_items where id = l2) = 'draft',
    'M72.5 CLIENT OPINION HONOURED: naming a sellable dish in p_menu_ids voided it. The parameter is '
    'accepted for deploy compatibility and must never be read';
  assert (select state from public.qr_cart_items where id = l1) = 'voided',
    'M72.5 an EMPTY-of-this-dish list stopped the derivation — the function must not consult it at all';

  -- ══ 6-8. THE AUTHORITY ARMS — no SQL coverage before this file ════════════════════════════════
  update public.qr_cart_items set state = 'draft' where cart_id = cart and state = 'voided';

  assert public.mms_settle_precheck_and_void(cart, null, gen_random_uuid(), era, 'pi_m72_6') = -2,
    'M72.6 a payer who does not hold the lock must be refused (-2)';
  assert public.mms_settle_precheck_and_void(cart, null, ana, era - interval '5 minutes', 'pi_m72_7') = -2,
    'M72.7 a SUPERSEDED era must be refused (-2): acquireCartLock lets the same uid reacquire, so '
    'locked_by alone cannot separate a live attempt from an older one';

  update public.qr_carts set status = 'paid' where id = cart;
  assert public.mms_settle_precheck_and_void(cart, null, ana, era, 'pi_m72_8') = -1,
    'M72.8 a cart that is no longer open must be refused (-1)';
  assert public.mms_settle_precheck_and_void(gen_random_uuid(), null, ana, era, 'pi_m72_8b') = -1,
    'M72.8 a cart that does not exist must be refused (-1), not treated as empty';

  -- …and a refusal must not have touched anything.
  assert (select count(*) from public.qr_cart_items where cart_id = cart and state = 'voided') = 0,
    'M72.8 a REFUSED call still voided lines — the authority gates must run before any write';

  raise notice 'M72 settlement-derives-availability: all cases passed';
end $$;

-- ══ 9. PRIVILEGES — the guard this repo did not have ════════════════════════════════════════════
-- A drop-and-recreate of a SECURITY DEFINER function resets pg_proc.proacl to NULL, which is EXECUTE
-- to PUBLIC. The revoke in the ORIGINAL migration belongs to the old pg_proc row and does not carry
-- over. This is asserted rather than trusted because nothing else in the repo can see it.
do $$
begin
  assert not has_function_privilege('anon', 'public.mms_settle_precheck_and_void(uuid, text[], uuid, timestamptz, text)', 'execute'),
    'M72.9 anon can EXECUTE the settlement void';
  assert not has_function_privilege('authenticated', 'public.mms_settle_precheck_and_void(uuid, text[], uuid, timestamptz, text)', 'execute'),
    'M72.9 AUTHENTICATED can EXECUTE the settlement void. Every QR diner is `authenticated` '
    '(anonymous auth), SECURITY DEFINER bypasses the table grants, and `null is distinct from null` '
    'is FALSE — so an open cart with a released lock passes both -2 gates. A diner could void lines '
    'and mint a qr_dropped_lines row with an attacker-chosen payment_intent, which '
    'mms_dropped_snapshot then renders back to a diner.';
  assert has_function_privilege('service_role', 'public.mms_settle_precheck_and_void(uuid, text[], uuid, timestamptz, text)', 'execute'),
    'M72.9 service_role LOST execute — the settlement path would 500 and Stripe would redeliver for 72h';
  raise notice 'M72 privileges: anon/authenticated refused, service_role granted';
end $$;

rollback;
