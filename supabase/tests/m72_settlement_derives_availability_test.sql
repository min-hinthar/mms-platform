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
--   L6 COMPED + sold out      — takes the `case when u.comped then 0` ledger branch. Without it that
--                               branch can be replaced with an unconditional list price and the
--                               suite stays green (Codex #234 round 2).
--   L7 on a SECOND cart       — unsellable, and must survive untouched. Without it,
--                               `where ci.cart_id = p_cart` can be deleted with the file still green
--                               — while in production it voids unrelated baskets mid-service and
--                               stamps their ledger rows with the settling cart's id (Codex #234 r2).
--
-- Expected on `cart`: 4 voided (L1, L3, L5, L6), 2 surviving (L2, L4). On `cart2`: nothing touched.
--
-- ⚠️ ONE load-bearing rule is NOT guarded here, and the file says so rather than implying coverage:
-- the UPDATE's own `t.state = 'draft'` qual. It defends against a CONCURRENT void (EPQ re-checks the
-- UPDATE's qual, not the CTE's filter), and no single-session test can reach it — the CTE's draft
-- filter already excludes whatever a previous call voided. Filed as M72d for
-- `scripts/verify-merge-race.mjs`, which already runs two sessions in CI.
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
--      line must not void it; passing the EMPTY ARRAY must not stop the derivation either. That
--      second call matters most: the empty array is what the old body short-circuits on
--      (`array_length(p_menu_ids, 1) is null`, w23d:190) and what the unchanged app sends when its
--      catalog read comes back clean, so a regression restoring only that short-circuit would
--      otherwise pass the whole suite (Codex #234 round 2).
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
  l6 uuid := '00000000-0000-0000-0000-0000007201f6';
  -- A SECOND cart, to falsify the function's `cart_id = p_cart` scope (Codex #234 round 2).
  sess2 uuid := '00000000-0000-0000-0000-0000000072e2';
  cart2 uuid := '00000000-0000-0000-0000-0000000072c2';
  l7 uuid := '00000000-0000-0000-0000-0000007201f7';
  v integer; n integer;
begin
  insert into public.menu_categories (id, slug, name) values (cat, 'm72-cat', 'M72 fixture');
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
    (l5, cart, '00000000-0000-4000-8000-0000007209ff','Ghost Curry',   1, 1100, 0, 'draft', 'togo',  false),
    -- COMPED and sold out. Without it the `case when u.comped then 0` branch is never taken, and
    -- replacing it with an unconditional list price leaves the suite green (Codex #234 round 2).
    (l6, cart, m_out::text,                          'Sold Out Dish',  3, 1200, 0, 'draft', 'togo',  true);

  -- A DIFFERENT cart, with its own unsellable draft food line. Without this, deleting
  -- `where ci.cart_id = p_cart` from the function leaves the whole file green — every candidate row
  -- belongs to `cart` anyway — while in production it would void unsellable lines out of UNRELATED
  -- carts and stamp their ledger rows with the settling cart's id (Codex #234 round 2).
  insert into public.table_sessions (id, qr_code, mode, status, host_seat)
    values (sess2, 'M72QR2', 'pickup', 'active', ana);
  insert into public.qr_carts (id, session_id, status) values (cart2, sess2, 'open');
  insert into public.qr_cart_items
    (id, cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, state, fulfillment, comped)
  values
    (l7, cart2, m_out::text, 'Sold Out Dish', 1, 1200, 0, 'draft', 'togo', false);

  -- ══ 1. THE DERIVATION — three void, and the right three ═══════════════════════════════════════
  v := public.mms_settle_precheck_and_void(cart, null, ana, era, 'pi_m72_1');
  assert v = 4, format('M72.1 wrong count: got %s, want 4 (sold-out + delisted + dangling + comped sold-out)', v);

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
    'M72.2 A GROCERY LINE WAS VOIDED. A barcode joins no catalog row, so without the fulfillment '
    'filter it falls into the dangling arm and every scan-and-go basket is emptied at settlement';
  assert (select state from public.qr_cart_items where id = l7) = 'draft',
    'M72.2 ANOTHER CART''S LINE WAS VOIDED. Deleting `where ci.cart_id = p_cart` is invisible to a '
    'single-cart fixture; in production it empties unrelated baskets mid-service';
  assert (select count(*) from public.qr_dropped_lines where cart_id = cart2) = 0,
    'M72.2 a foreign cart gained a dropped-lines row';
  assert (select count(*) from public.qr_dropped_lines where line_id = l7) = 0,
    'M72.2 another cart''s line was stamped into THIS settlement''s ledger';

  -- ══ 3. LEDGER PARITY — one row per voided line, and a re-run must not double-write ════════════
  select count(*) into n from public.qr_dropped_lines where cart_id = cart;
  assert n = 4, format('M72.3 ledger rows: got %s, want 4', n);
  assert (select count(*) from public.qr_dropped_lines where cart_id = cart and payment_intent = 'pi_m72_1') = 4,
    'M72.3 dropped lines not stamped with THIS attempt''s intent';

  -- ⚠️ IDEMPOTENCE, not the EPQ race — and the distinction is load-bearing (Codex #234 round 2).
  -- A sequential second call cannot exercise the UPDATE's `t.state = 'draft'` qual at all: the
  -- `unsellable` CTE's own draft filter already excludes everything the first call voided, so this
  -- returns 0 whether or not that qual exists. The duplicate the migration describes needs a
  -- CONCURRENT state change landing after the CTE's snapshot, which takes two sessions.
  -- That qual is therefore NOT guarded by this file; see M72d.
  v := public.mms_settle_precheck_and_void(cart, null, ana, era, 'pi_m72_1');
  assert v = 0, format('M72.3 second call voided %s — the draft filter must exclude already-voided lines', v);
  select count(*) into n from public.qr_dropped_lines where cart_id = cart;
  assert n = 4,
    format('M72.3 REPLAY WROTE MORE LEDGER ROWS: got %s, want 4. qr_dropped_lines has no unique '
           'constraint and mms_dropped_snapshot aggregates without `distinct`, so a duplicate reaches '
           'the diner''s /track card and receipt as the same dish listed twice.', n);

  -- ══ 4. A COMPED LINE IS WORTH ZERO TO THE LEDGER ══════════════════════════════════════════════
  -- The heading used to sit over an assertion about an UNCOMPED line, so the `case when u.comped
  -- then 0` branch was never taken and could be replaced with an unconditional list price with the
  -- suite still green (Codex #234 round 2). Both directions are asserted now.
  assert (select amount_cents from public.qr_dropped_lines where line_id = l1) = 2400,
    'M72.4 an UNCOMPED line must record qty * unit_price (2 x 1200)';
  assert (select amount_cents from public.qr_dropped_lines where line_id = l6) = 0,
    'M72.4 A COMPED LINE RECORDED ITS LIST PRICE. The ledger answers "what did we fail to SELL"; a '
    'comped dish was never going to be charged, so booking 3 x 1200 overstates the shortage';

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

  -- …and specifically the EMPTY ARRAY, which is the shape the old body short-circuits on
  -- (`array_length(p_menu_ids, 1) is null`, w23d:190) and the shape the unchanged app sends whenever
  -- its catalog read finds nothing unavailable. Round 1's P1 turned on exactly this value, and no
  -- call in this file passed it: the first uses SQL NULL and the case above a non-empty array, so a
  -- regression restoring only the empty-array short-circuit would have passed the whole suite while
  -- missing every dish that sold out after the app's read (Codex #234 round 2).
  update public.qr_cart_items set state = 'draft' where id = l1;
  delete from public.qr_dropped_lines where cart_id = cart;
  v := public.mms_settle_precheck_and_void(cart, array[]::text[], ana, era, 'pi_m72_5b');
  assert v = 1,
    format('M72.5 THE EMPTY ARRAY SHORT-CIRCUITED THE DERIVATION: got %s, want 1. The old body '
           'returns 0 on `array_length(p_menu_ids, 1) is null`; the new one must derive regardless '
           'of what it is handed.', v);
  assert (select state from public.qr_cart_items where id = l1) = 'voided',
    'M72.5 the sold-out line survived an empty-array call';

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
