-- supabase/tests/m218_cash_refund_line_test.sql  (M218)
--
-- A cash refund was TOLD, never recorded: `mms_refund_authorize` answers `split_unsupported` for
-- any order with no PaymentIntent and `mms_fulfill_cash_order` never writes one, so the drawer paid
-- out while the receipt kept saying "Paid in full". `mms_refund_cash_line` records it.
--
-- ── What each case is for ───────────────────────────────────────────────────────────────────────
--   1. THE RECORD ITSELF — a manager refunds a cash line: 'ok', the ledger row (tender 'cash', NO
--      stripe_refund_id), both `refunded_cents` projections bumped, and the two-party audit row.
--   2. THE EXTRACTION DID NOT MOVE THE NUMBER. The migration lifted the pro-rata + clamp out of
--      `mms_refund_authorize` into `mms_refund_line_amount` so the cash path could not fork a second
--      copy of it. Two orders with IDENTICAL money, one cash one card, must be offered the SAME
--      cents by the two different functions — and that figure must be the whole pool here
--      (total − service − tip), which is the one value this fixture lets us state outright.
--   3. IDEMPOTENCE — money must not leave the drawer twice. A second call is refused and writes
--      NOTHING: no second ledger row, no second bump. (`mms_refunds_one_per_line` is the race
--      backstop under the check; this asserts the check and the write together.)
--   4. A CARD ORDER REFUSES THIS PATH. If a processor can give the money back, a hand from the
--      drawer is the wrong instrument and would refund the guest twice.
--   5. A CASH ORDER STILL REFUSES THE CARD PATH — `split_unsupported`, unchanged. Cases 4 and 5
--      pull in opposite directions on purpose: neither function may quietly grow the other's job.
--   6. AUTHORITY — a SERVER is refused and writes nothing. The floor is re-read here, not trusted
--      from the page.
--   7. THE POOL CLAMP BINDS, and 8. AN EXHAUSTED POOL REFUSES. An order-level ledger row (the shape
--      a processor-dashboard refund leaves) shrinks what the order can still give back; the cash
--      path must respect it exactly as the card path does, or Σ refunds exceeds what was collected.
--   9. THE FIXTURE SEPARATES THE TWO FORMULAS. Cases 1-2 use qty 1 with no discount, on which the
--      pre-remediation formula gives the same cents as the correct one — so they cannot prove the
--      extraction preserved the arithmetic. This order has qty 2, a discount, and a non-taxable
--      second line; the old formula is computed from the row and asserted to DIFFER.
--
-- Run against any QR DB (rolls back — leaves NO data behind):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/m218_cash_refund_line_test.sql

begin;
-- W8: without this GUC every ASSERT below compiles out and the file exits 0 having proved nothing.
set local plpgsql.check_asserts = on;

-- ── fixtures ────────────────────────────────────────────────────────────────────────────────────
-- A manager (money-out authority) and a server (none). `staff.user_id` FKs to auth.users, so the
-- auth rows come first.
insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000218a00'),
  ('00000000-0000-0000-0000-000000218b00');
insert into public.staff (user_id, role, display_name, active) values
  ('00000000-0000-0000-0000-000000218a00', 'manager', 'M218 Manager', true),
  ('00000000-0000-0000-0000-000000218b00', 'server',  'M218 Server',  true);

insert into public.table_sessions (id, qr_code, mode, status, host_seat) values
  ('00000000-0000-0000-0000-000000218001'::uuid, 'M218CASH', 'dinein', 'active',
   '00000000-0000-0000-0000-0000002180a0'::uuid),
  ('00000000-0000-0000-0000-000000218002'::uuid, 'M218CARD', 'dinein', 'active',
   '00000000-0000-0000-0000-0000002180a0'::uuid),
  ('00000000-0000-0000-0000-000000218003'::uuid, 'M218CLMP', 'dinein', 'active',
   '00000000-0000-0000-0000-0000002180a0'::uuid),
  ('00000000-0000-0000-0000-000000218004'::uuid, 'M218PROR', 'dinein', 'active',
   '00000000-0000-0000-0000-0000002180a0'::uuid),
  ('00000000-0000-0000-0000-000000218005'::uuid, 'M218PROC', 'dinein', 'active',
   '00000000-0000-0000-0000-0000002180a0'::uuid);

do $$
declare
  mgr   uuid := '00000000-0000-0000-0000-000000218a00';
  srv   uuid := '00000000-0000-0000-0000-000000218b00';
  dish  text := 'aaaaaaaa-0000-4000-8000-000000218d01';
  cart_cash uuid; cart_card uuid; cart_clamp uuid; cart_pro uuid; cart_proc uuid;
  ord_cash uuid; ord_card uuid; ord_clamp uuid; ord_pro uuid; ord_proc uuid;
  line_cash uuid; line_card uuid; line_clamp uuid; line_pro uuid; line_proc uuid;
  v_old_formula integer; v_pro_amt integer; v_proc_amt integer;
  r record; a record;
  n integer; v_amt integer; v_card_amt integer;
  v_order_refunded integer; v_line_refunded integer;
begin
  -- ══ A CASH order and a CARD order with IDENTICAL money ════════════════════════════════════════
  -- One line, 1 × $10.00, $1.05 tax. subtotal 1000, tax 105, total 1105, no service and no tip —
  -- so the refundable pool (total − service − tip) is the whole 1105 and one line exhausts it.
  cart_cash := gen_random_uuid();
  insert into public.qr_carts (id, session_id) values (cart_cash, '00000000-0000-0000-0000-000000218001');
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, fulfillment)
    values (cart_cash, dish, 'Mohinga', 1, 1000, 105, 'dinein');
  ord_cash := public.mms_fulfill_cash_order(cart_cash, mgr, 1000, 0, 0, 105, 0);

  cart_card := gen_random_uuid();
  insert into public.qr_carts (id, session_id) values (cart_card, '00000000-0000-0000-0000-000000218002');
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, fulfillment)
    values (cart_card, dish, 'Mohinga', 1, 1000, 105, 'dinein');
  ord_card := public.mms_fulfill_order(cart_card, 'pi_m218_card', 1105, 1000, 0, 0, 105, 0, mgr, 'card');

  select id into line_cash from public.qr_order_items where order_id = ord_cash;
  select id into line_card from public.qr_order_items where order_id = ord_card;
  assert line_cash is not null and line_card is not null, 'fixture: both orders must carry a line';

  -- ══ 5. THE CASH ORDER STILL REFUSES THE CARD PATH ═════════════════════════════════════════════
  -- Asserted BEFORE anything is refunded, so `split_unsupported` cannot be confused with a later
  -- `already_refunded`. This is the guard order the manager's copy depends on.
  select * into r from public.mms_refund_authorize(line_cash, mgr);
  assert r.reason = 'split_unsupported',
    format('5: the card authorizer must still refuse a cash order, got %s', r.reason);

  -- ══ 2. THE CARD PATH''S FIGURE, for the comparison in case 1 ══════════════════════════════════
  select * into r from public.mms_refund_authorize(line_card, mgr);
  assert r.reason = 'ok', format('2: the card line must authorize, got %s', r.reason);
  v_card_amt := r.amount_cents;
  assert v_card_amt = 1105,
    format('2: the whole pool is total-service-tip = 1105; the card path offered %s', v_card_amt);

  -- ══ 6. AUTHORITY — a server is refused, and writes nothing ════════════════════════════════════
  select * into a from public.mms_refund_cash_line(line_cash, srv, 'test_server');
  assert a.reason = 'not_manager', format('6: a server must be refused, got %s', a.reason);
  assert a.amount_cents = 0, '6: a refusal carries no amount';
  select count(*) into n from public.mms_refunds where order_item_id = line_cash;
  assert n = 0, '6: a refused call must write no ledger row';

  -- ══ 4. A CARD ORDER REFUSES THE CASH PATH ═════════════════════════════════════════════════════
  select * into a from public.mms_refund_cash_line(line_card, mgr, 'test_card');
  assert a.reason = 'not_cash', format('4: a card order must refuse the drawer path, got %s', a.reason);
  select count(*) into n from public.mms_refunds where order_item_id = line_card;
  assert n = 0, '4: the refused card line must have no ledger row';

  -- ══ 1. THE RECORD ITSELF ══════════════════════════════════════════════════════════════════════
  select * into a from public.mms_refund_cash_line(line_cash, mgr, 'test_cash');
  assert a.reason = 'ok', format('1: the cash line must refund, got %s', a.reason);
  v_amt := a.amount_cents;

  -- 2 (continued): the SAME cents from two different functions over identical money. A copy of the
  -- arithmetic that drifted by a cent would fail here and nowhere else.
  assert v_amt = v_card_amt,
    format('2: cash offered %s where the card path offered %s on identical money', v_amt, v_card_amt);

  select count(*) into n from public.mms_refunds
    where order_item_id = line_cash and tender = 'cash' and stripe_refund_id is null
      and amount_cents = v_amt and order_id = ord_cash;
  assert n = 1, '1: exactly one cash ledger row, with no processor id and the recorded amount';

  select refunded_cents into v_line_refunded from public.qr_order_items where id = line_cash;
  select refunded_cents into v_order_refunded from public.qr_orders where id = ord_cash;
  assert v_line_refunded = v_amt,
    format('1: the LINE must carry the movement, got %s want %s', v_line_refunded, v_amt);
  assert v_order_refunded = v_amt,
    format('1: the ORDER must carry the movement, got %s want %s', v_order_refunded, v_amt);

  select count(*) into n from public.mms_approvals
    where kind = 'refund' and line_id = line_cash and amount_cents = v_amt
      and initiator_staff_id = mgr and approver_staff_id = mgr;
  assert n = 1, '1: the two-party audit row must exist, for the amount that actually moved';

  -- ══ 3. IDEMPOTENCE — the drawer must not pay twice ════════════════════════════════════════════
  select * into a from public.mms_refund_cash_line(line_cash, mgr, 'test_again');
  assert a.reason = 'already_refunded',
    format('3: a second call must be refused, got %s', a.reason);
  assert a.amount_cents = 0, '3: a refusal carries no amount';
  select count(*) into n from public.mms_refunds where order_item_id = line_cash;
  assert n = 1, '3: still exactly one ledger row after the second call';
  select refunded_cents into v_line_refunded from public.qr_order_items where id = line_cash;
  assert v_line_refunded = v_amt,
    format('3: the line must NOT be bumped twice, got %s want %s', v_line_refunded, v_amt);
  select count(*) into n from public.mms_approvals where kind = 'refund' and line_id = line_cash;
  assert n = 1, '3: and no second audit row';

  -- ══ 7 + 8. THE POOL CLAMP ═════════════════════════════════════════════════════════════════════
  -- A third cash order, then an ORDER-LEVEL ledger row (the shape a processor-dashboard refund
  -- leaves: order_item_id null, so `mms_refunds_one_per_line` does not apply) that takes most of the
  -- pool. The cash path must pay only what is left.
  cart_clamp := gen_random_uuid();
  insert into public.qr_carts (id, session_id) values (cart_clamp, '00000000-0000-0000-0000-000000218003');
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, fulfillment)
    values (cart_clamp, dish, 'Mohinga', 1, 1000, 105, 'dinein');
  ord_clamp := public.mms_fulfill_cash_order(cart_clamp, mgr, 1000, 0, 0, 105, 0);
  select id into line_clamp from public.qr_order_items where order_id = ord_clamp;

  insert into public.mms_refunds (order_id, order_item_id, amount_cents, stripe_refund_id, reason_code)
    values (ord_clamp, null, 1000, 're_m218_dashboard', 'dashboard');

  select * into a from public.mms_refund_cash_line(line_clamp, mgr, 'test_clamp');
  assert a.reason = 'ok', format('7: the clamped line must still refund, got %s', a.reason);
  assert a.amount_cents = 105,
    format('7: pool 1105 less the 1000 already out leaves 105; got %s', a.amount_cents);
  select refunded_cents into v_order_refunded from public.qr_orders where id = ord_clamp;
  assert v_order_refunded = 105,
    format('7: the order carries only the cash movement (the dashboard row was never projected), got %s',
           v_order_refunded);

  -- 8. The pool is now exhausted. A NEW line on the same order can take nothing — asserted through
  -- the shared arithmetic, since the one line here is already refunded and would answer 3 instead.
  insert into public.qr_order_items (order_id, menu_item_id, name, qty, unit_price_cents, tax_cents, fulfillment)
    values (ord_clamp, dish, 'Mohinga', 1, 1000, 105, 'dinein')
    returning id into line_clamp;
  select * into a from public.mms_refund_cash_line(line_clamp, mgr, 'test_exhausted');
  assert a.reason = 'fully_refunded',
    format('8: an exhausted pool must refuse, got %s', a.reason);
  select count(*) into n from public.mms_refunds where order_item_id = line_clamp;
  assert n = 0, '8: and write nothing';

  -- ══ 9. THE FIXTURE ABOVE CANNOT TELL THE TWO FORMULAS APART, AND THIS ONE CAN ════════════════
  -- Cases 1-2 use qty 1, discount 0, one taxable line — on which the PRE-REMEDIATION formula that
  -- S4's P0-1/P1-1 replaced (`unit_price_cents * qty + oi.tax_cents`, the per-unit tax added once)
  -- gives the SAME cents as the correct one. So a transcription error in the arithmetic this
  -- migration lifts into `mms_refund_line_amount` would pass them. This order exercises both terms
  -- the simple one cannot: qty > 1 (so the tax share must SCALE) and a discount (so the pro-rata
  -- must bite), plus a non-taxable second line (so the taxable base is not the subtotal).
  --
  -- Nothing here is transcribed: the old formula is COMPUTED from the row and asserted to differ.
  cart_pro := gen_random_uuid();
  insert into public.qr_carts (id, session_id) values (cart_pro, '00000000-0000-0000-0000-000000218004');
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, fulfillment)
    values (cart_pro, dish, 'Mohinga', 2, 1000, 90, 'dinein'),
           (cart_pro, dish, 'Plain Rice', 1, 500, 0, 'dinein');
  -- subtotal 2500, discount 500, tax 180 → total 2180
  ord_pro := public.mms_fulfill_cash_order(cart_pro, mgr, 2500, 500, 0, 180, 0);
  select id into line_pro from public.qr_order_items where order_id = ord_pro and qty = 2;

  -- The identical order on CARD, so the two functions can be compared on money that separates them.
  cart_proc := gen_random_uuid();
  insert into public.qr_carts (id, session_id) values (cart_proc, '00000000-0000-0000-0000-000000218005');
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, fulfillment)
    values (cart_proc, dish, 'Mohinga', 2, 1000, 90, 'dinein'),
           (cart_proc, dish, 'Plain Rice', 1, 500, 0, 'dinein');
  ord_proc := public.mms_fulfill_order(cart_proc, 'pi_m218_pro', 2180, 2500, 500, 0, 180, 0, mgr, 'card');
  select id into line_proc from public.qr_order_items where order_id = ord_proc and qty = 2;

  select * into r from public.mms_refund_authorize(line_proc, mgr);
  assert r.reason = 'ok', format('9: the card line must authorize, got %s', r.reason);
  v_proc_amt := r.amount_cents;

  select * into a from public.mms_refund_cash_line(line_pro, mgr, 'test_prorata');
  assert a.reason = 'ok', format('9: the cash line must refund, got %s', a.reason);
  v_pro_amt := a.amount_cents;
  assert v_pro_amt = v_proc_amt,
    format('9: cash offered %s where the card path offered %s on identical money', v_pro_amt, v_proc_amt);

  -- The formula the remediation REPLACED, computed from this line's own stored row.
  select unit_price_cents * qty + tax_cents into v_old_formula
    from public.qr_order_items where id = line_pro;
  assert v_pro_amt <> v_old_formula,
    format('9: this fixture cannot separate the formulas — both answer %s, so cases 1-2 prove nothing about the extraction', v_pro_amt);

  -- And the projections carry exactly what was authorized, on a line whose qty is not 1.
  select refunded_cents into v_line_refunded from public.qr_order_items where id = line_pro;
  assert v_line_refunded = v_pro_amt,
    format('9: the line must carry the movement, got %s want %s', v_line_refunded, v_pro_amt);

  raise notice 'm218_cash_refund_line_test: all cases passed';
end $$;

rollback;
