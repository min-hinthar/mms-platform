-- supabase/tests/p2f_counter_cook_before_paid_test.sql  (Phase 2f · P2v — a counter order cooks before it is paid)
--
-- Pins supabase/migrations/20261001000000_p2f_counter_cook_before_paid.sql: the staff-only unpaid
-- fire and its undo, the name lock, the no-show write-off (SENT food only, the loss gate, the
-- pending-request supersede, the two-tablet reverse race, the 'changed' refusal when the sent set is
-- not the one the approver saw) and the sweeper's counter exemption — and, for every refusal, the
-- legitimate half it must NOT over-block. The fire-vs-sweep and fire-vs-clear ORDERINGS need two
-- sessions and live in scripts/verify-counter-fire-race.mjs; nothing here can interleave.
--
-- ⚠️ `now()` is the TRANSACTION start and this file is ONE transaction: every deadline a fire stamps
-- is now()+10s, and `fire_at > now()` stays true in here. A line "past its grace" is therefore made
-- so by setting its `fire_at` into the past directly — never by waiting.
--
-- Red-first: plpgsql ASSERT stops at the FIRST failure, so a red-then-green run proves one case.
-- Every case below is falsified by name in scripts/verify-mode-authority.mjs (suite `p2f`).
--
-- Run against any QR DB (rolls back — leaves NO data behind):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/p2f_counter_cook_before_paid_test.sql

begin;
-- W8: without this GUC every ASSERT below compiles out and the file exits 0 having proved nothing.
set local plpgsql.check_asserts = on;

-- ── fixtures: a manager and a server; staff.user_id FKs to auth.users ─────────────────────────
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000002f0a00'),
  ('00000000-0000-0000-0000-0000002f0b00');
insert into public.staff (user_id, role, display_name, active) values
  ('00000000-0000-0000-0000-0000002f0a00', 'manager', 'P2F Manager', true),
  ('00000000-0000-0000-0000-0000002f0b00', 'server',  'P2F Server',  true);

-- A counter order factory: a `reg-` pickup session + an open cart, named or not.
create or replace function pg_temp.p2f_counter(p_code text, p_name text, p_mode text default 'pickup',
                                               p_status text default 'active')
  returns uuid language plpgsql as $$
declare v_sess uuid; v_cart uuid;
begin
  insert into public.table_sessions (qr_code, mode, status, expires_at)
    values (p_code, p_mode, p_status, now() + interval '12 hours') returning id into v_sess;
  insert into public.qr_carts (session_id, customer_name) values (v_sess, p_name) returning id into v_cart;
  return v_cart;
end $$;

create or replace function pg_temp.p2f_line(p_cart uuid, p_price integer, p_qty integer default 1,
                                            p_fulfillment text default 'togo', p_state text default 'draft',
                                            p_fire_at timestamptz default null, p_comped boolean default false)
  returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents,
                                    fulfillment, state, fire_at, comped)
    values (p_cart, 'cccccccc-0000-4000-8000-0000000002f0', 'Mohinga', p_qty, p_price, 0,
            p_fulfillment, p_state, p_fire_at, p_comped)
    returning id into v_id;
  return v_id;
end $$;

-- ══ P2F.0 · the column: 'phone' and 'walkup' and null insert; anything else is refused ══════════
do $$
declare c uuid; ok boolean;
begin
  c := pg_temp.p2f_counter('reg-P2F0AAAA', 'Aye');
  update public.qr_carts set counter_arm = 'phone' where id = c;
  update public.qr_carts set counter_arm = 'walkup' where id = c;
  update public.qr_carts set counter_arm = null where id = c;
  ok := false;
  begin
    update public.qr_carts set counter_arm = 'bogus' where id = c;
  exception when check_violation then ok := true;
  end;
  assert ok, 'P2F.0 · counter_arm must refuse a value outside walkup|phone';
end $$;

-- ══ P2F.1 · privileges: service_role only, on all four + the sweeper still ════════════════════
do $$
declare r record;
begin
  for r in select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('mms_fire_counter_cart','mms_undo_counter_fire',
                  'mms_clear_cart_name','mms_counter_no_show','mms_sweep_expired_sessions') loop
    assert not has_function_privilege('anon', r.oid, 'execute')
       and not has_function_privilege('authenticated', r.oid, 'execute')
       and has_function_privilege('service_role', r.oid, 'execute'),
      format('P2F.1 · %s must be service_role-only', r.proname);
  end loop;
end $$;

-- ══ P2F.2 · a legit fire: named reg- cart, togo drafts fire under one batch; grocery and a
--    dine-in-tagged draft stay draft ═══════════════════════════════════════════════════════════
do $$
declare c uuid; a uuid; b uuid; g uuid; d uuid; r record; n integer;
begin
  c := pg_temp.p2f_counter('reg-P2F2AAAA', 'Aye');
  a := pg_temp.p2f_line(c, 800, 2);
  b := pg_temp.p2f_line(c, 600, 1);
  g := pg_temp.p2f_line(c, 300, 1, 'grocery');
  d := pg_temp.p2f_line(c, 500, 1, 'dinein');
  select * into r from public.mms_fire_counter_cart(c);
  assert r.fired = 2 and r.named and r.fire_deadline = now() + interval '10 seconds',
    format('P2F.2 · a named counter cart fires its two togo drafts (fired=%s named=%s)', r.fired, r.named);
  select count(*) into n from public.qr_cart_items
    where id in (a, b) and state = 'fired' and fire_batch = r.batch and fire_at = r.fire_deadline;
  assert n = 2, 'P2F.2 · both togo drafts carry the returned batch and deadline';
  select count(*) into n from public.qr_cart_items where id in (g, d) and state = 'draft';
  assert n = 2, 'P2F.2 · grocery and a dine-in-tagged draft never fire on the counter send';
end $$;

-- ══ P2F.3 · a DINER pickup session (not reg-) fires nothing ═════════════════════════════════════
do $$
declare c uuid; r record;
begin
  c := pg_temp.p2f_counter('P2F3DINER', 'Aye');
  perform pg_temp.p2f_line(c, 800);
  select * into r from public.mms_fire_counter_cart(c);
  assert r.fired = 0, 'P2F.3 · a diner pickup session must not fire unpaid';
end $$;

-- ══ P2F.4 · a kiosk- session fires nothing ════════════════════════════════════════════════════
do $$
declare c uuid; r record;
begin
  c := pg_temp.p2f_counter('kiosk-P2F4KK', 'Aye');
  perform pg_temp.p2f_line(c, 800);
  select * into r from public.mms_fire_counter_cart(c);
  assert r.fired = 0, 'P2F.4 · a kiosk order must not fire unpaid';
end $$;

-- ══ P2F.5 · a reg- SCAN-AND-GO session fires nothing; on a dine-in table the counter fire is
--    inert while mms_fire_cart still fires ═════════════════════════════════════════════════════
do $$
declare c uuid; t uuid; r record; n integer;
begin
  c := pg_temp.p2f_counter('reg-P2F5SCAN', 'Aye', 'scango');
  perform pg_temp.p2f_line(c, 800);
  select * into r from public.mms_fire_counter_cart(c);
  assert r.fired = 0, 'P2F.5 · a reg- scango session must not fire (the mode term)';
  t := pg_temp.p2f_counter('P2F5TABLE', 'Aye', 'dinein');
  perform pg_temp.p2f_line(t, 800, 1, 'dinein');
  select * into r from public.mms_fire_counter_cart(t);
  assert r.fired = 0, 'P2F.5 · the counter fire must be inert on a dine-in table';
  select fired into n from public.mms_fire_cart(t);
  assert n = 1, 'P2F.5 · mms_fire_cart still fires the dine-in table (untouched)';
end $$;

-- ══ P2F.6 · a nameless counter order fires nothing, and says so (named = false) ══════════════════
do $$
declare c uuid; r record;
begin
  c := pg_temp.p2f_counter('reg-P2F6NULL', null);
  perform pg_temp.p2f_line(c, 800);
  select * into r from public.mms_fire_counter_cart(c);
  assert r.fired = 0 and not r.named and not r.closed,
    'P2F.6 · a NULL name refuses the fire, named=false — and the order is NOT closed (noName, not closed)';
  c := pg_temp.p2f_counter('reg-P2F6BLNK', '   ');
  perform pg_temp.p2f_line(c, 800);
  select * into r from public.mms_fire_counter_cart(c);
  assert r.fired = 0 and not r.named, 'P2F.6 · a blank name refuses the fire, named=false';
end $$;

-- ══ P2F.7 · a PAID reg- cart fires nothing ═════════════════════════════════════════════════════
do $$
declare c uuid; r record;
begin
  c := pg_temp.p2f_counter('reg-P2F7PAID', 'Aye');
  perform pg_temp.p2f_line(c, 800);
  update public.qr_carts set status = 'paid' where id = c;
  select * into r from public.mms_fire_counter_cart(c);
  assert r.fired = 0 and r.closed,
    format('P2F.7 · a paid cart must not fire through the counter send, and says closed (fired=%s closed=%s)', r.fired, r.closed);
end $$;

-- ══ P2F.8 · a CLOSED reg- session fires nothing ════════════════════════════════════════════════
do $$
declare c uuid; r record;
begin
  c := pg_temp.p2f_counter('reg-P2F8CLSD', 'Aye', 'pickup', 'closed');
  perform pg_temp.p2f_line(c, 800);
  select * into r from public.mms_fire_counter_cart(c);
  assert r.fired = 0 and r.closed,
    format('P2F.8 · a closed session must not fire, and says closed (fired=%s closed=%s)', r.fired, r.closed);
end $$;

-- ══ P2F.8b · an EXPIRED session the sweeper has not reached yet fires nothing (C1) ═══════════════
do $$
declare c uuid; r record; st text;
begin
  c := pg_temp.p2f_counter('reg-P2F8BEXP', 'Aye');
  perform pg_temp.p2f_line(c, 800);
  update public.table_sessions set expires_at = now() - interval '1 second'
    where id = (select session_id from public.qr_carts where id = c);
  select * into r from public.mms_fire_counter_cart(c);
  select state into st from public.qr_cart_items where cart_id = c;
  assert r.fired = 0 and r.closed and st = 'draft',
    format('P2F.8b · an expired, unswept session gains no fired food and says closed (fired=%s closed=%s %s)',
           r.fired, r.closed, st);
end $$;

-- ══ P2F.9–12 · the undo: wrong batch 0; own batch 2; after the deadline 0; a comped line skipped ══
do $$
declare c uuid; a uuid; b uuid; k uuid; r record; n integer;
begin
  c := pg_temp.p2f_counter('reg-P2F9UNDO', 'Aye');
  a := pg_temp.p2f_line(c, 800, 2);
  b := pg_temp.p2f_line(c, 600, 1);
  select * into r from public.mms_fire_counter_cart(c);
  n := public.mms_undo_counter_fire(c, gen_random_uuid());
  assert n = 0, 'P2F.9 · an undo carrying another batch must reverse nothing';
  n := public.mms_undo_counter_fire(c, r.batch);
  assert n = 2, format('P2F.10 · the undo reverses its own batch (n=%s)', n);
  select count(*) into n from public.qr_cart_items
    where id in (a, b) and state = 'draft' and fire_at is null and fire_batch is null;
  assert n = 2, 'P2F.10 · undone lines are drafts with no fire_at and no batch';
  select * into r from public.mms_fire_counter_cart(c);
  update public.qr_cart_items set fire_at = now() - interval '1 second' where fire_batch = r.batch;
  n := public.mms_undo_counter_fire(c, r.batch);
  assert n = 0, 'P2F.11 · an undo after the deadline must reverse nothing — the kitchen has it';
  c := pg_temp.p2f_counter('reg-P2F12CMP', 'Aye');
  k := pg_temp.p2f_line(c, 800);
  select * into r from public.mms_fire_counter_cart(c);
  update public.qr_cart_items set comped = true where id = k;
  n := public.mms_undo_counter_fire(c, r.batch);
  assert n = 0, 'P2F.12 · an undo must skip a comped (audited) line';
end $$;

-- ══ P2F.13 · settle after an early send: totals and fulfilment unchanged, no second fire ═══════
do $$
declare c uuid; a uuid; b uuid; d uuid; b1 uuid := gen_random_uuid(); o uuid; o2 uuid; n integer;
        t text; fa timestamptz := now() - interval '5 minutes';
begin
  c := pg_temp.p2f_counter('reg-P2F13SET', 'Aye');
  a := pg_temp.p2f_line(c, 800, 1, 'togo', 'fired', fa);
  b := pg_temp.p2f_line(c, 600, 1, 'togo', 'fired', fa);
  update public.qr_cart_items set fire_batch = b1 where id in (a, b);
  d := pg_temp.p2f_line(c, 500);
  o := public.mms_fulfill_cash_order(c, '00000000-0000-0000-0000-0000002f0b00', 1900, 0, 0, 0, 0, 0);
  select count(*) into n from public.qr_order_items where order_id = o;
  assert n = 3, format('P2F.13 · all three lines (sent or not) are on the order (n=%s)', n);
  n := public.mms_fire_pending_food(c);
  assert n = 1, format('P2F.13 · settlement fires only the one draft (n=%s)', n);
  select count(*) into n from public.qr_cart_items where id in (a, b) and fire_batch = b1 and fire_at = fa;
  assert n = 2, 'P2F.13 · the sent lines keep their batch and fire_at (no second fire, no age reset)';
  n := public.mms_fire_pending_food(c);
  assert n = 0, 'P2F.13 · a second fire_pending fires nothing';
  o2 := public.mms_fulfill_cash_order(c, '00000000-0000-0000-0000-0000002f0b00', 1900, 0, 0, 0, 0, 0);
  assert o2 = o, 'P2F.13 · the cash fulfil is idempotent on the cart';
  t := public.mms_init_togo_status(o, c);
  select togo_status into t from public.qr_orders where id = o;
  assert t = 'preparing', format('P2F.13 · the bag enters the lane at preparing (%s)', t);
end $$;

-- ══ P2F.14 · clearing a name: refused once food is in (reg-), allowed otherwise ════════════════
do $$
declare c uuid; s uuid; t uuid; v text; nm text;
begin
  c := pg_temp.p2f_counter('reg-P2F14KEP', 'Aye');
  perform pg_temp.p2f_line(c, 800, 1, 'togo', 'fired', now() - interval '1 minute');
  select session_id into s from public.qr_carts where id = c;
  v := public.mms_clear_cart_name(s);
  select customer_name into nm from public.qr_carts where id = c;
  assert v = 'keep_name' and nm = 'Aye', format('P2F.14 · keep_name on a counter order with food in (%s, %s)', v, nm);
  c := pg_temp.p2f_counter('reg-P2F14DRF', 'Aye');
  perform pg_temp.p2f_line(c, 800);
  select session_id into s from public.qr_carts where id = c;
  v := public.mms_clear_cart_name(s);
  select customer_name into nm from public.qr_carts where id = c;
  assert v = 'ok' and nm is null, format('P2F.14 · a drafts-only counter order clears (%s)', v);
  t := pg_temp.p2f_counter('P2F14TABLE', 'Aye', 'dinein');
  perform pg_temp.p2f_line(t, 800, 1, 'dinein', 'fired', now() - interval '1 minute');
  select session_id into s from public.qr_carts where id = t;
  v := public.mms_clear_cart_name(s);
  assert v = 'ok', format('P2F.14 · a dine-in table with fired lines still clears its name (%s)', v);
  v := public.mms_clear_cart_name(gen_random_uuid());
  assert v = 'not_open', 'P2F.14 · no open cart answers not_open';
end $$;

-- ══ P2F.15 · no-show refusals: each writes nothing ════════════════════════════════════════════
do $$
declare mgr uuid := '00000000-0000-0000-0000-0000002f0a00'; srv uuid := '00000000-0000-0000-0000-0000002f0b00';
        c uuid; t uuid; l uuid; v text; n0 integer; n1 integer; st text;
begin
  select count(*) into n0 from public.mms_approvals;
  t := pg_temp.p2f_counter('P2F15TABLE', 'Aye', 'dinein');
  perform pg_temp.p2f_line(t, 800, 1, 'dinein', 'served', now() - interval '5 minutes');
  v := public.mms_counter_no_show(t, srv, '{}', mgr);
  assert v = 'not_counter', format('P2F.15a · a dine-in cart is not a counter order (%s)', v);
  c := pg_temp.p2f_counter('reg-P2F15DRF', 'Aye');
  perform pg_temp.p2f_line(c, 800);
  v := public.mms_counter_no_show(c, srv, '{}', mgr);
  assert v = 'nothing_sent', format('P2F.15b · drafts only is nothing_sent (%s)', v);
  c := pg_temp.p2f_counter('reg-P2F15GRC', 'Aye');
  perform pg_temp.p2f_line(c, 800, 1, 'togo', 'fired', now() + interval '10 seconds');
  v := public.mms_counter_no_show(c, srv, '{}', mgr);
  assert v = 'nothing_sent', format('P2F.15c · an in-grace line never reached the KDS (%s)', v);
  c := pg_temp.p2f_counter('reg-P2F15PAY', 'Aye');
  l := pg_temp.p2f_line(c, 800, 1, 'togo', 'fired', now() - interval '1 minute');
  update public.qr_carts set status = 'paid' where id = c;
  v := public.mms_counter_no_show(c, srv, array[l], mgr);
  assert v = 'not_open', format('P2F.15d · a paid cart is not_open (%s)', v);
  c := pg_temp.p2f_counter('reg-P2F15FRZ', 'Aye');
  l := pg_temp.p2f_line(c, 800, 1, 'togo', 'fired', now() - interval '1 minute');
  update public.qr_carts set settle_at = now() where id = c;
  v := public.mms_counter_no_show(c, srv, array[l], mgr);
  assert v = 'in_flight', format('P2F.15e · a fresh settle freeze is in_flight (%s)', v);
  c := pg_temp.p2f_counter('reg-P2F15LCK', 'Aye');
  l := pg_temp.p2f_line(c, 800, 1, 'togo', 'fired', now() - interval '1 minute');
  update public.qr_carts set locked = true, locked_at = now() where id = c;
  v := public.mms_counter_no_show(c, srv, array[l], mgr);
  assert v = 'in_flight', format('P2F.15i · a fresh single-pay lock is in_flight (%s)', v);
  c := pg_temp.p2f_counter('reg-P2F15GAT', 'Aye');
  l := pg_temp.p2f_line(c, 800, 1, 'togo', 'served', now() - interval '5 minutes');
  v := public.mms_counter_no_show(c, srv, array[l], null);
  assert v = 'needs_approval', format('P2F.15f · a served dish needs a manager (%s)', v);
  v := public.mms_counter_no_show(c, mgr, array[l], mgr);
  assert v = 'self_approve', format('P2F.15g · the initiator cannot approve (%s)', v);
  v := public.mms_counter_no_show(c, mgr, array[l], srv);
  assert v = 'bad_approver', format('P2F.15h · a server cannot approve (%s)', v);
  select count(*) into n1 from public.mms_approvals;
  select status into st from public.qr_carts where id = c;
  assert n1 = n0 and st = 'open', 'P2F.15 · no refusal writes an approval row or moves the cart';
end $$;

-- ══ P2F.15i · the legit half of the pay-lock refusal: a STALE lock (an abandoned attempt, past its
--    5-minute TTL) does not block, and an UNLOCKED cart with a stamp left behind does not either ═══
do $$
declare srv uuid := '00000000-0000-0000-0000-0000002f0b00'; c uuid; l uuid; v text;
begin
  c := pg_temp.p2f_counter('reg-P2F15STL', 'Aye');
  l := pg_temp.p2f_line(c, 500, 1, 'togo', 'fired', now() - interval '1 minute');
  update public.qr_carts set locked = true, locked_at = now() - interval '6 minutes' where id = c;
  v := public.mms_counter_no_show(c, srv, array[l], null);
  assert v = 'ok', format('P2F.15i · a stale pay lock does not block the no-show (%s)', v);
  c := pg_temp.p2f_counter('reg-P2F15UNL', 'Aye');
  l := pg_temp.p2f_line(c, 500, 1, 'togo', 'fired', now() - interval '1 minute');
  update public.qr_carts set locked = false, locked_at = now() where id = c;
  v := public.mms_counter_no_show(c, srv, array[l], null);
  assert v = 'ok', format('P2F.15i · an unlocked cart with a fresh stamp left behind does not block (%s)', v);
end $$;

-- ══ P2F.16 · no-show, manager-approved: only SENT food is written off ═════════════════════════
do $$
declare mgr uuid := '00000000-0000-0000-0000-0000002f0a00'; srv uuid := '00000000-0000-0000-0000-0000002f0b00';
        c uuid; s uuid; sv uuid; fp uuid; cp uuid; ig uuid; dr uuid; gr uuid; rd uuid; gf uuid;
        v text; n integer;
        st text; ss text; pst text; pres timestamptz;
begin
  c := pg_temp.p2f_counter('reg-P2F16NSW', 'Aye');
  select session_id into s from public.qr_carts where id = c;
  sv := pg_temp.p2f_line(c, 800, 1, 'togo', 'served', now() - interval '6 minutes');
  fp := pg_temp.p2f_line(c, 600, 1, 'togo', 'fired', now() - interval '2 minutes');
  cp := pg_temp.p2f_line(c, 700, 1, 'togo', 'fired', now() - interval '2 minutes', true);
  ig := pg_temp.p2f_line(c, 400, 1, 'togo', 'fired', now() + interval '10 seconds');
  dr := pg_temp.p2f_line(c, 3000);
  gr := pg_temp.p2f_line(c, 300, 1, 'grocery');
  -- A draft that CARRIES a past fire_at (mms_line_transition's fired→draft edge keeps fire_at) and a
  -- grocery line marked fired: the two fixtures that separate the SENT predicate's state and
  -- fulfillment terms from its fire_at term (without them either term could be deleted unseen).
  rd := pg_temp.p2f_line(c, 900, 1, 'togo', 'draft', now() - interval '3 minutes');
  gf := pg_temp.p2f_line(c, 300, 1, 'grocery', 'fired', now() - interval '3 minutes');
  insert into public.mms_approvals (kind, status, cart_id, session_id, line_id, line_name, qty,
                                    amount_cents, reason_code, cooked, initiator_staff_id)
    values ('void', 'pending', c, s, fp, 'Mohinga', 1, 600, 'mistake', false, srv);
  -- The expected set in SORTED order, so this case stays order-agnostic: only P2F.20 (a reordered
  -- and a repeated id) may decide whether the comparison is a set or a list.
  v := public.mms_counter_no_show(c, srv, (select array_agg(x order by x) from unnest(array[fp, sv]) x), mgr);
  assert v = 'ok', format('P2F.16 · the manager-approved no-show lands (%s)', v);
  select count(*) into n from public.mms_approvals
    where cart_id = c and status = 'approved' and reason_code = 'no_show' and gate_reason = 'cooked'
      and approver_staff_id = mgr
      and ((line_id = sv and amount_cents = 800 and cooked) or (line_id = fp and amount_cents = 600 and not cooked));
  assert n = 2, format('P2F.16 · exactly the two SENT lines are written off (n=%s)', n);
  select count(*) into n from public.mms_approvals where cart_id = c and status = 'approved';
  assert n = 2, format('P2F.16 · no row for a comped, in-grace, draft or grocery line (n=%s)', n);
  select count(*) into n from public.qr_cart_items where id in (sv, fp) and state = 'voided';
  assert n = 2, 'P2F.16 · the sent lines are voided';
  select state into st from public.qr_cart_items where id = cp;
  assert st = 'fired', 'P2F.16 · the comped line is untouched (its loss is already audited)';
  select count(*) into n from public.qr_cart_items where id = ig and state = 'draft' and fire_at is null and fire_batch is null;
  assert n = 1, 'P2F.16 · the in-grace line returns to draft';
  select count(*) into n from public.qr_cart_items where id in (dr, gr, rd) and state = 'draft';
  assert n = 3, 'P2F.16 · drafts (even one carrying an old fire_at) and grocery stay as they are';
  select state into st from public.qr_cart_items where id = gf;
  assert st = 'fired', 'P2F.16 · a grocery line is never written off as kitchen food';
  select status, resolved_at into pst, pres from public.mms_approvals where cart_id = c and line_id = fp and reason_code = 'mistake';
  assert pst = 'superseded' and pres is not null, format('P2F.16 · the pending request is superseded (%s)', pst);
  select status into st from public.qr_carts where id = c;
  select status into ss from public.table_sessions where id = s;
  assert st = 'cancelled' and ss = 'closed', format('P2F.16 · cart cancelled (%s), session closed (%s)', st, ss);
  select count(*) into n from public.qr_orders where cart_id = c;
  assert n = 0, 'P2F.16 · a no-show writes NO order — nothing charged, nothing refunded';
end $$;

-- ══ P2F.17 · no-show within solo authority: the $30 DRAFT never counts toward the ceiling ════════
do $$
declare srv uuid := '00000000-0000-0000-0000-0000002f0b00'; c uuid; l uuid; v text; n integer; g text;
begin
  c := pg_temp.p2f_counter('reg-P2F17SLO', 'Aye');
  l := pg_temp.p2f_line(c, 500, 1, 'togo', 'fired', now() - interval '1 minute');
  perform pg_temp.p2f_line(c, 3000);
  v := public.mms_counter_no_show(c, srv, array[l], null);
  assert v = 'ok', format('P2F.17 · a $5 sent line is within solo authority, drafts ignored (%s)', v);
  select count(*), max(gate_reason) into n, g from public.mms_approvals
    where cart_id = c and reason_code = 'no_show';
  assert n = 1 and g = 'solo', format('P2F.17 · one row, gate solo (n=%s gate=%s)', n, g);
end $$;

-- ══ P2F.18 · the reverse two-tablet race: a no-show committed first, the cash settle raises ═════
do $$
declare srv uuid := '00000000-0000-0000-0000-0000002f0b00'; c uuid; l uuid; v text; raised boolean := false; n integer;
begin
  c := pg_temp.p2f_counter('reg-P2F18RAC', 'Aye');
  l := pg_temp.p2f_line(c, 500, 1, 'togo', 'fired', now() - interval '1 minute');
  v := public.mms_counter_no_show(c, srv, array[l], null);
  assert v = 'ok', 'P2F.18 · setup: the no-show lands';
  begin
    perform public.mms_fulfill_cash_order(c, srv, 500, 0, 0, 0, 0, 0);
  exception when others then raised := true;
  end;
  select count(*) into n from public.qr_orders where cart_id = c;
  assert raised and n = 0, 'P2F.18 · a cash settle after a no-show raises and records nothing';
end $$;

-- ══ P2F.19 · the sweeper: a sent unpaid counter order survives; nothing else is exempt ════════
do $$
declare c1 uuid; c2 uuid; c3 uuid; c4 uuid; s1 uuid; s2 uuid; s3 uuid; s4 uuid; st text;
begin
  c1 := pg_temp.p2f_counter('reg-P2F19SNT', 'Aye');
  perform pg_temp.p2f_line(c1, 500, 1, 'togo', 'fired', now() - interval '1 minute');
  c2 := pg_temp.p2f_counter('reg-P2F19DRF', 'Aye');
  perform pg_temp.p2f_line(c2, 500);
  c3 := pg_temp.p2f_counter('P2F19TABLE', 'Aye', 'dinein');
  perform pg_temp.p2f_line(c3, 500, 1, 'dinein', 'fired', now() - interval '1 minute');
  c4 := pg_temp.p2f_counter('P2F19DINER', 'Aye');
  perform pg_temp.p2f_line(c4, 500, 1, 'togo', 'fired', now() - interval '1 minute');
  select session_id into s1 from public.qr_carts where id = c1;
  select session_id into s2 from public.qr_carts where id = c2;
  select session_id into s3 from public.qr_carts where id = c3;
  select session_id into s4 from public.qr_carts where id = c4;
  update public.table_sessions set expires_at = now() - interval '1 minute' where id in (s1, s2, s3, s4);
  perform public.mms_sweep_expired_sessions();
  select status into st from public.table_sessions where id = s1;
  assert st = 'active', format('P2F.19a · a sent unpaid counter order is never swept (%s)', st);
  select status into st from public.table_sessions where id = s2;
  assert st = 'closed', format('P2F.19b · a drafts-only counter order still expires (%s)', st);
  select status into st from public.table_sessions where id = s3;
  assert st = 'closed', format('P2F.19c · dine-in M171 is unchanged — swept (%s)', st);
  select status into st from public.table_sessions where id = s4;
  assert st = 'closed', format('P2F.19d · the exemption is reg- only — a diner pickup is swept (%s)', st);
end $$;

-- ══ P2F.19e-h · the exemption is an OPEN cart's SENT food, nothing wider; and in-grace / null-fire_at
--    SENT lines do exempt ══════════════════════════════════════════════════════════════════════════
do $$
declare c uuid; s uuid; st text;
begin
  -- e · a PAID reg- cart with fired lines: nothing to collect — the session expires.
  c := pg_temp.p2f_counter('reg-P2F19EPD', 'Aye');
  perform pg_temp.p2f_line(c, 500, 1, 'togo', 'fired', now() - interval '1 minute');
  update public.qr_carts set status = 'paid' where id = c;
  select session_id into s from public.qr_carts where id = c;
  update public.table_sessions set expires_at = now() - interval '1 minute' where id = s;
  perform public.mms_sweep_expired_sessions();
  select status into st from public.table_sessions where id = s;
  assert st = 'closed', format('P2F.19e · a paid counter order is swept — only an OPEN cart is exempt (%s)', st);
  -- f · only a COMPED fired line: nothing the no-show could write off — swept.
  c := pg_temp.p2f_counter('reg-P2F19FCP', 'Aye');
  perform pg_temp.p2f_line(c, 500, 1, 'togo', 'fired', now() - interval '1 minute', true);
  select session_id into s from public.qr_carts where id = c;
  update public.table_sessions set expires_at = now() - interval '1 minute' where id = s;
  perform public.mms_sweep_expired_sessions();
  select status into st from public.table_sessions where id = s;
  assert st = 'closed', format('P2F.19f · a comped-only counter order is swept (%s)', st);
  -- g · only a GROCERY line marked fired: shelf stock, not kitchen food — swept.
  c := pg_temp.p2f_counter('reg-P2F19GGR', 'Aye');
  perform pg_temp.p2f_line(c, 500, 1, 'grocery', 'fired', now() - interval '1 minute');
  select session_id into s from public.qr_carts where id = c;
  update public.table_sessions set expires_at = now() - interval '1 minute' where id = s;
  perform public.mms_sweep_expired_sessions();
  select status into st from public.table_sessions where id = s;
  assert st = 'closed', format('P2F.19g · a grocery-only counter order is swept (%s)', st);
  -- h · the legit half: an IN-GRACE line and a NULL-fire_at fired line each keep it alive.
  c := pg_temp.p2f_counter('reg-P2F19HGR', 'Aye');
  perform pg_temp.p2f_line(c, 500, 1, 'togo', 'fired', now() + interval '10 seconds');
  select session_id into s from public.qr_carts where id = c;
  update public.table_sessions set expires_at = now() - interval '1 minute' where id = s;
  perform public.mms_sweep_expired_sessions();
  select status into st from public.table_sessions where id = s;
  assert st = 'active', format('P2F.19h · an in-grace sent line keeps the order alive (%s)', st);
  c := pg_temp.p2f_counter('reg-P2F19HNL', 'Aye');
  perform pg_temp.p2f_line(c, 500, 1, 'togo', 'fired', null);
  select session_id into s from public.qr_carts where id = c;
  update public.table_sessions set expires_at = now() - interval '1 minute' where id = s;
  perform public.mms_sweep_expired_sessions();
  select status into st from public.table_sessions where id = s;
  assert st = 'active', format('P2F.19h · a null-fire_at fired line keeps the order alive (%s)', st);
end $$;

-- ══ P2F.20 · 'changed': the write-off lands only on the SENT set the approver saw ═════════════════
do $$
declare mgr uuid := '00000000-0000-0000-0000-0000002f0a00'; srv uuid := '00000000-0000-0000-0000-0000002f0b00';
        c uuid; a uuid; b uuid; v text; n0 integer; n1 integer; st text;
begin
  select count(*) into n0 from public.mms_approvals;
  c := pg_temp.p2f_counter('reg-P2F20CHG', 'Aye');
  a := pg_temp.p2f_line(c, 500, 1, 'togo', 'fired', now() - interval '1 minute');
  b := pg_temp.p2f_line(c, 400, 1, 'togo', 'fired', now() - interval '1 minute');
  v := public.mms_counter_no_show(c, srv, array[a], null);
  assert v = 'changed', format('P2F.20 · a sent line the sheet did not show refuses (%s)', v);
  v := public.mms_counter_no_show(c, srv, array[a, b, gen_random_uuid()], null);
  assert v = 'changed', format('P2F.20 · a line the sheet showed that is no longer sent refuses (%s)', v);
  v := public.mms_counter_no_show(c, srv, null, null);
  assert v = 'changed', format('P2F.20 · no expected set refuses (%s)', v);
  v := public.mms_counter_no_show(c, srv, array[a, b, null], null);
  assert v = 'changed', format('P2F.20 · a NULL element never matches (%s)', v);
  -- the cooked gate is reached only once the set matches: a line cooked after the sheet loaded is a
  -- CHANGE the approver never saw, but with the set intact the loss gate still asks for a manager.
  update public.qr_cart_items set state = 'in_progress' where id = b;
  v := public.mms_counter_no_show(c, srv, array[b, a], null);
  assert v = 'needs_approval', format('P2F.20 · a matching set still meets the loss gate (%s)', v);
  select count(*) into n1 from public.mms_approvals;
  select status into st from public.qr_carts where id = c;
  assert n1 = n0 and st = 'open', 'P2F.20 · a changed refusal writes nothing';
  -- the legit half: order and duplicates are not a change.
  v := public.mms_counter_no_show(c, srv, array[b, a, a], mgr);
  assert v = 'ok', format('P2F.20 · the same set in another order, with a duplicate, lands (%s)', v);
end $$;

-- ══ P2F.21 · the loss CEILING: a sent line nobody started, worth more than max_loss_cents, needs a
--    manager — and records gate 'ceiling' ═══════════════════════════════════════════════════════════
do $$
declare mgr uuid := '00000000-0000-0000-0000-0000002f0a00'; srv uuid := '00000000-0000-0000-0000-0000002f0b00';
        c uuid; l uuid; v text; g text; mx integer;
begin
  select coalesce(max_loss_cents, 2000) into mx from public.mms_loss_config where id;
  c := pg_temp.p2f_counter('reg-P2F21CEI', 'Aye');
  l := pg_temp.p2f_line(c, coalesce(mx, 2000) + 1, 1, 'togo', 'fired', now() - interval '1 minute');
  v := public.mms_counter_no_show(c, srv, array[l], null);
  assert v = 'needs_approval', format('P2F.21 · over the ceiling needs a manager (%s)', v);
  v := public.mms_counter_no_show(c, srv, array[l], mgr);
  select gate_reason into g from public.mms_approvals where cart_id = c and reason_code = 'no_show';
  assert v = 'ok' and g = 'ceiling', format('P2F.21 · the manager-approved write-off records ceiling (%s, %s)', v, g);
end $$;

-- ══ P2F.22 · a fired line with NO fire_at counts as sent (the KDS shows it) ═══════════════════════
do $$
declare srv uuid := '00000000-0000-0000-0000-0000002f0b00'; c uuid; l uuid; v text; n integer;
begin
  c := pg_temp.p2f_counter('reg-P2F22NUL', 'Aye');
  l := pg_temp.p2f_line(c, 500, 1, 'togo', 'fired', null);
  v := public.mms_counter_no_show(c, srv, array[l], null);
  select count(*) into n from public.mms_approvals where cart_id = c and line_id = l and reason_code = 'no_show';
  assert v = 'ok' and n = 1, format('P2F.22 · a null-fire_at fired line is written off as sent (%s, n=%s)', v, n);
end $$;

rollback;
