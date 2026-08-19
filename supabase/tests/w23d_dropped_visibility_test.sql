-- supabase/tests/w23d_dropped_visibility_test.sql  (W23d — registry M71)
--
-- Proves the three things the W23d migration promises, each of which is invisible to `tsc`,
-- to the drift guard, and to every vitest suite (they all mock the database):
--
--   1. NEITHER ledger is diner-readable — not even for the diner's OWN cart, and not even for a
--      genuine MEMBER of the session that owns it (the most-privileged diner there is). Two
--      mechanisms hold that: no SELECT grant to `authenticated`, and a manager-only RLS policy
--      behind it. Either alone passes; see the block at the end for why both are accepted.
--   2. The fulfillment snapshot is scoped to ONE attempt. A cancelled all-dropped settlement leaves
--      its cart open, so a second order in that same cart must NOT inherit the first attempt's
--      dropped lines — that would print "sold out before we could make it" on a receipt for an
--      order that never contained the dish.
--   3. The cancellation ledger is per-INTENT and idempotent: a redelivery cannot mint a second row,
--      and two attempts on one cart each keep their own verdict.
--   4. The attempt stamp is written by the PRODUCTION writer (`mms_settle_precheck_and_void`), not
--      by a fixture — see §0. Nothing else in the repo can catch its removal from the SQL.
--
-- Run against any QR DB (rolls back — leaves NO data behind):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/w23d_dropped_visibility_test.sql

begin;
-- W8: without this GUC every ASSERT below compiles out and the file exits 0 having proved nothing.
set local plpgsql.check_asserts = on;

-- ── fixtures (privileged role — bypasses RLS) ──────────────────────────────────────────────────
insert into public.table_sessions (id, qr_code, mode, status, host_seat) values
  ('00000000-0000-0000-0000-00000023d000', 'W23DTEST', 'pickup', 'active',
   '00000000-0000-0000-0000-00000023d1ce');
insert into public.session_members (session_id, seat_id, display_name, role) values
  ('00000000-0000-0000-0000-00000023d000', '00000000-0000-0000-0000-00000023d1ce', 'Dana', 'host');
insert into public.qr_carts (id, session_id) values
  ('00000000-0000-0000-0000-00000023dca7', '00000000-0000-0000-0000-00000023d000');

-- ── 0. the drop row is written by the REAL writer, not by hand ─────────────────────────────────
-- The adversarial review's sharpest finding: every other assertion below was fed by a hand-written
-- INSERT, so `mms_settle_precheck_and_void` — the ONLY production writer of `payment_intent` — was
-- never called by anything. Deleting the column from its INSERT would have passed the vitest suites
-- (they mock the database), the drift guard (it compares schema to types) and this file. A guard fed
-- by a fixture proves the fixture.
--
-- So the first attempt's drop row is produced by CALLING the function, under the same preconditions
-- the settlement gives it: an OPEN cart, locked by the payer, on the matching attempt era, with a
-- DRAFT food line whose menu id is handed in.
insert into public.qr_cart_items (id, cart_id, menu_item_id, name, qty, unit_price_cents, state, fulfillment)
values ('00000000-0000-0000-0000-00000023d11e', '00000000-0000-0000-0000-00000023dca7',
        'w23d-test-mohinga', 'Mohinga', 2, 1200, 'draft', 'togo');
update public.qr_carts
   set locked_by = '00000000-0000-0000-0000-00000023d1ce',
       locked_at = '2026-08-19T18:00:00Z'
 where id = '00000000-0000-0000-0000-00000023dca7';

do $$
declare v_voided integer;
begin
  v_voided := public.mms_settle_precheck_and_void(
    '00000000-0000-0000-0000-00000023dca7',
    array['w23d-test-mohinga'],
    '00000000-0000-0000-0000-00000023d1ce',
    '2026-08-19T18:00:00Z'::timestamptz,
    'pi_w23d_first');
  assert v_voided = 1, format('the precheck should have voided exactly one line, voided %s', v_voided);
  -- THE assertion the hand-written fixture could never make: the writer stamps the attempt.
  assert (select payment_intent from public.qr_dropped_lines
            where cart_id = '00000000-0000-0000-0000-00000023dca7') = 'pi_w23d_first',
    'the precheck did not stamp the dropped line with its own PaymentIntent';
  -- …and it really did take the line off the basket, which is what makes the capture amount right.
  assert (select state from public.qr_cart_items
            where id = '00000000-0000-0000-0000-00000023d11e') = 'voided',
    'the precheck reported a void it did not perform';
end $$;

select public.mms_mark_settle_canceled(
  'pi_w23d_first', '00000000-0000-0000-0000-00000023dca7', 'nothing_left',
  '00000000-0000-0000-0000-00000023d1ce', now());

-- ── 1. per-ATTEMPT scoping ─────────────────────────────────────────────────────────────────────
do $$
begin
  assert jsonb_array_length(
    public.mms_dropped_snapshot('00000000-0000-0000-0000-00000023dca7', 'pi_w23d_first')) = 1,
    'the first attempt must see its own dropped line';
  -- THE load-bearing assertion. A cart_id-only join answers 1 here, and that answer becomes a
  -- fabricated "sold out" line on the receipt for an order placed after the shortage was known.
  assert public.mms_dropped_snapshot(
    '00000000-0000-0000-0000-00000023dca7', 'pi_w23d_second') = '[]'::jsonb,
    'LEAK: a later attempt inherited a previous attempt''s dropped lines';
  -- Diner-safe projection: name + qty only. amount_cents / reason_code / line_id stay staff-side,
  -- because a dollar figure beside the receipt rows for money never charged reads as a refund.
  assert (select array_agg(k order by k) from jsonb_object_keys(
    public.mms_dropped_snapshot('00000000-0000-0000-0000-00000023dca7', 'pi_w23d_first') -> 0) k)
    = array['name','qty'],
    'the snapshot must project name + qty and nothing else';
end $$;

-- ── 2. the cancellation ledger is per-intent and idempotent ────────────────────────────────────
do $$
declare v_again integer; v_rows integer;
begin
  -- A Stripe redelivery re-runs the mark. It must not mint a second verdict.
  v_again := public.mms_mark_settle_canceled(
    'pi_w23d_first', '00000000-0000-0000-0000-00000023dca7', 'over_authorized',
    '00000000-0000-0000-0000-00000023d1ce', now());
  assert v_again = 0, 'a redelivered mark must report 0 rows, not a second insert';
  select count(*) into v_rows from public.qr_settlement_cancellations
    where payment_intent = 'pi_w23d_first';
  assert v_rows = 1, 'a redelivery minted a duplicate cancellation row';
  assert (select reason from public.qr_settlement_cancellations
            where payment_intent = 'pi_w23d_first') = 'nothing_left',
    'a redelivery overwrote the original verdict';

  -- A SECOND attempt on the same cart keeps its own verdict — the reason this ledger is keyed on
  -- the PaymentIntent rather than the cart: a diner cancelled twice must be told the truth twice.
  perform public.mms_mark_settle_canceled(
    'pi_w23d_second', '00000000-0000-0000-0000-00000023dca7', 'over_authorized',
    '00000000-0000-0000-0000-00000023d1ce', now());
  assert (select count(*) from public.qr_settlement_cancellations
            where cart_id = '00000000-0000-0000-0000-00000023dca7') = 2,
    'the second attempt did not get its own verdict';
end $$;

-- ── 3. the reason vocabulary is bounded at the DB, not only in Zod/TS ──────────────────────────
do $$
begin
  begin
    insert into public.qr_settlement_cancellations (payment_intent, cart_id, reason)
    values ('pi_w23d_bad', '00000000-0000-0000-0000-00000023dca7', 'kitchen_closed');
    assert false, 'the reason CHECK accepted a code outside its vocabulary';
  exception when check_violation then null;
  end;
  -- The other half: an over-tight bound would block real service and no refusal-only test notices.
  insert into public.qr_settlement_cancellations (payment_intent, cart_id, reason)
  values ('pi_w23d_ok', '00000000-0000-0000-0000-00000023dca7', 'superseded');
  delete from public.qr_settlement_cancellations where payment_intent = 'pi_w23d_ok';
end $$;

-- ── 4. NEITHER ledger is diner-readable ────────────────────────────────────────────────────────
-- `set local role authenticated` + a jwt sub makes the very same policies a real anon-auth diner
-- hits evaluate here. This diner is a genuine MEMBER of the session that owns the cart, which is
-- what makes the assertion worth anything: it is the most-privileged diner there is.
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"00000000-0000-0000-0000-00000023d1ce","role":"authenticated"}';
--
-- FAIL-CLOSED EITHER WAY, and the distinction matters enough to spell out. There are TWO independent
-- mechanisms keeping a diner out of these ledgers, and the first draft of this test asserted only the
-- second — so CI failed with `permission denied for table qr_dropped_lines` rather than a leak:
--
--   1. `authenticated` has no table-level SELECT GRANT, so the read is refused outright. This is the
--      stronger of the two and it is the state both tables are actually in.
--   2. RLS filters the rows to zero even if a grant is ever added.
--
-- The rule being asserted is "a diner cannot read this", so BOTH outcomes pass and neither is
-- assumed. Asserting only zero-rows would have been green for the wrong reason the day someone added
-- a grant and dropped the policy; asserting only the refusal would go red the day a legitimate staff
-- surface needed the grant, even though RLS still did its job.
--
-- (The app never reads either ledger through a caller-scoped client — `mms_refunds` is read the same
-- way, service-role behind an app-level staff gate — so the missing grant breaks nothing today.)
do $$
declare v_n integer;
begin
  begin
    select count(*) into v_n from public.qr_dropped_lines
      where cart_id = '00000000-0000-0000-0000-00000023dca7';
    assert v_n = 0, 'LEAK: a diner read qr_dropped_lines directly';
  exception when insufficient_privilege then null;  -- refused before RLS: stronger, also correct
  end;
  begin
    select count(*) into v_n from public.qr_settlement_cancellations
      where cart_id = '00000000-0000-0000-0000-00000023dca7';
    assert v_n = 0, 'LEAK: a diner read qr_settlement_cancellations directly';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

rollback;
