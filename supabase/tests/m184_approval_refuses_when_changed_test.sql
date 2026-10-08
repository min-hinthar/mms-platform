-- supabase/tests/m184_approval_refuses_when_changed_test.sql  (M184 · round 3 D2 — the resolve and the close arm)
--
-- Pins supabase/migrations/20261008120000_m184_approval_refuses_when_changed.sql:
-- `mms_resolve_approval(p_id, p_approver, p_decision)` — APPROVE refuses 'changed' when the line is no
-- longer the one asked about (M184), the new `close` arm writes 'superseded' (never 'denied') and only
-- once the cart has left 'open' or the line changed (D2), deny is unchanged. Every refusal sits beside
-- the legitimate case it must not over-block (W17):
--
--   M184.1       approve on the line as asked: ok, the line voided, the row approved at the snapshot
--   M184.2–.4    approve after a qty step, a re-price, the line gone: 'changed' / 'stale', NOTHING taken
--                off, the row still pending with no approver
--   M184.5       deny is unchanged — it closes a changed line's request as 'denied', line untouched
--   M184.6       close on an open, unchanged request: 'still_open', the row still pending
--   M184.7–.8    close on a PAID and on a CANCELLED cart: ok, 'superseded', the closer and the time
--                recorded, the line untouched (still charged)
--   M184.9       the request's OWN asker may close it; the same asker still cannot approve it
--   M184.10      a server and an inactive manager cannot close it
--   M184.11      close on an open cart whose line changed: ok, 'superseded', the line at its new qty
--   M184.12      close on a resolved row: 'already_resolved'; on an unknown id: 'not_found'
--   M184.13      an illegal decision raises
--   M184.14      approve on a paid cart stays 'not_open'; a comp approve on an unchanged line lands
--   M184.15      privileges, the empty search_path, exactly one definition
--
-- Red-first (the authoring environment's throwaway Supabase-shaped Postgres 16, LEARNINGS #95): red on
-- M184.2 (`changed` expected, `ok` returned — the shipped resolve applied the 2× line) before the
-- migration was applied, green after; each case is falsified by name in
-- scripts/verify-mode-authority.mjs (suite `m184`).
--
-- ⚠️ `now()` is the TRANSACTION start and this file is ONE transaction.
--
-- Run against any QR DB (rolls back — leaves NO data behind):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/m184_approval_refuses_when_changed_test.sql

begin;
-- W8: without this GUC every ASSERT below compiles out and the file exits 0 having proved nothing.
set local plpgsql.check_asserts = on;

-- ── fixtures: a manager (Aye), a second manager, an owner, a server (Thiri), an inactive manager ──
insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000184a01'),
  ('00000000-0000-0000-0000-000000184a02'),
  ('00000000-0000-0000-0000-000000184a03'),
  ('00000000-0000-0000-0000-000000184a04'),
  ('00000000-0000-0000-0000-000000184a05');
insert into public.staff (user_id, role, display_name, active) values
  ('00000000-0000-0000-0000-000000184a01', 'manager', 'M184 Aye',      true),
  ('00000000-0000-0000-0000-000000184a02', 'manager', 'M184 Manager2', true),
  ('00000000-0000-0000-0000-000000184a03', 'owner',   'M184 Owner',    true),
  ('00000000-0000-0000-0000-000000184a04', 'server',  'M184 Thiri',    true),
  ('00000000-0000-0000-0000-000000184a05', 'manager', 'M184 Gone',     false);

-- A dine-in table: a session + an open cart.
create or replace function pg_temp.m184_table(p_code text, p_status text default 'open')
  returns uuid language plpgsql as $$
declare v_sess uuid; v_cart uuid;
begin
  insert into public.table_sessions (qr_code, mode, status, expires_at)
    values (p_code, 'dinein', 'active', now() + interval '12 hours') returning id into v_sess;
  insert into public.qr_carts (session_id, status) values (v_sess, p_status) returning id into v_cart;
  return v_cart;
end $$;

create or replace function pg_temp.m184_line(p_cart uuid, p_price integer, p_qty integer default 1,
                                             p_state text default 'in_progress')
  returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents,
                                    fulfillment, state, comped)
    values (p_cart, 'cccccccc-0000-4000-8000-000000000184', 'Mohinga', p_qty, p_price, 0,
            'dinein', p_state, false)
    returning id into v_id;
  return v_id;
end $$;

-- A pending request as `mms_request_approval` writes it: the snapshot is the line AT THE ASK.
create or replace function pg_temp.m184_request(p_cart uuid, p_line uuid, p_kind text default 'void',
                                                p_initiator uuid default '00000000-0000-0000-0000-000000184a04')
  returns uuid language plpgsql as $$
declare v_id uuid; v_sess uuid; v_qty integer; v_price integer;
begin
  select session_id into v_sess from public.qr_carts where id = p_cart;
  select qty, unit_price_cents into v_qty, v_price from public.qr_cart_items where id = p_line;
  insert into public.mms_approvals (kind, status, cart_id, session_id, line_id, line_name, qty,
                                    amount_cents, reason_code, cooked, initiator_staff_id, gate_reason)
    values (p_kind, 'pending', p_cart, v_sess, p_line, 'Mohinga', v_qty, v_price * v_qty,
            'kitchen_error', true, p_initiator, 'cooked')
    returning id into v_id;
  return v_id;
end $$;

-- ══ M184.1 · the legitimate approve: the line as asked, voided, the row approved at the snapshot ═══
do $$
declare mgr uuid := '00000000-0000-0000-0000-000000184a01';
        c uuid; l uuid; r uuid; v text; st text; ast text; amt integer; who uuid; at timestamptz;
begin
  c := pg_temp.m184_table('M184-1');
  l := pg_temp.m184_line(c, 1400);
  r := pg_temp.m184_request(c, l);
  v := public.mms_resolve_approval(r, mgr, 'approve');
  assert v = 'ok', format('M184.1 · approve on the line as asked lands (%s)', v);
  select state into st from public.qr_cart_items where id = l;
  assert st = 'voided', format('M184.1 · the line is voided (%s)', st);
  select status, amount_cents, approver_staff_id, resolved_at into ast, amt, who, at
    from public.mms_approvals where id = r;
  assert ast = 'approved' and amt = 1400 and who = mgr and at is not null,
    format('M184.1 · the row reads approved at $14.00 by the manager (%s %s %s)', ast, amt, who);
end $$;

-- ══ M184.2 · a qty step after the ask: 'changed', NOTHING taken off, the row still pending ═════════
do $$
declare mgr uuid := '00000000-0000-0000-0000-000000184a01';
        c uuid; l uuid; r uuid; v text; st text; ast text; who uuid;
begin
  c := pg_temp.m184_table('M184-2');
  l := pg_temp.m184_line(c, 1400);
  r := pg_temp.m184_request(c, l);
  update public.qr_cart_items set qty = 2 where id = l;         -- the $12 comp that took $36 off
  v := public.mms_resolve_approval(r, mgr, 'approve');
  assert v = 'changed', format('M184.2 · approve after a qty step is refused as changed (%s)', v);
  select state into st from public.qr_cart_items where id = l;
  assert st = 'in_progress', format('M184.2 · nothing was taken off the line (%s)', st);
  select status, approver_staff_id into ast, who from public.mms_approvals where id = r;
  assert ast = 'pending' and who is null, format('M184.2 · the row is still pending with no approver (%s)', ast);
end $$;

-- ══ M184.3 · a re-price at the SAME qty is a change too (the amount, not only the count) ═══════════
do $$
declare mgr uuid := '00000000-0000-0000-0000-000000184a01';
        c uuid; l uuid; r uuid; v text; st text;
begin
  c := pg_temp.m184_table('M184-3');
  l := pg_temp.m184_line(c, 1400);
  r := pg_temp.m184_request(c, l);
  update public.qr_cart_items set unit_price_cents = 1600 where id = l;
  v := public.mms_resolve_approval(r, mgr, 'approve');
  assert v = 'changed', format('M184.3 · approve after a re-price is refused as changed (%s)', v);
  select state into st from public.qr_cart_items where id = l;
  assert st = 'in_progress', 'M184.3 · the re-priced line is untouched';
  -- 2 × $7.00 = $14.00: the amount agrees with the snapshot, the qty does not — still changed.
  update public.qr_cart_items set qty = 2, unit_price_cents = 700 where id = l;
  v := public.mms_resolve_approval(r, mgr, 'approve');
  assert v = 'changed', format('M184.3 · a qty and price that multiply back to the snapshot are not the line asked about (%s)', v);
end $$;

-- ══ M184.4 · the line is gone: the shipped 'stale', the row still pending ═════════════════════════
do $$
declare mgr uuid := '00000000-0000-0000-0000-000000184a01';
        c uuid; l uuid; r uuid; v text; ast text;
begin
  c := pg_temp.m184_table('M184-4');
  l := pg_temp.m184_line(c, 1400, 1, 'draft');
  r := pg_temp.m184_request(c, l);
  delete from public.qr_cart_items where id = l;
  v := public.mms_resolve_approval(r, mgr, 'approve');
  assert v = 'stale', format('M184.4 · approve on a gone line is stale (%s)', v);
  select status into ast from public.mms_approvals where id = r;
  assert ast = 'pending', 'M184.4 · the row is still pending';
end $$;

-- ══ M184.5 · deny is UNCHANGED: it closes a changed line's request as denied, line untouched ══════
do $$
declare mgr uuid := '00000000-0000-0000-0000-000000184a01';
        c uuid; l uuid; r uuid; v text; st text; q integer; ast text; who uuid; at timestamptz;
begin
  c := pg_temp.m184_table('M184-5');
  l := pg_temp.m184_line(c, 1400);
  r := pg_temp.m184_request(c, l);
  update public.qr_cart_items set qty = 2 where id = l;
  v := public.mms_resolve_approval(r, mgr, 'deny');
  assert v = 'ok', format('M184.5 · deny lands on a changed line (%s)', v);
  select status, approver_staff_id, resolved_at into ast, who, at from public.mms_approvals where id = r;
  assert ast = 'denied' and who = mgr and at is not null, format('M184.5 · the row reads denied (%s)', ast);
  select state, qty into st, q from public.qr_cart_items where id = l;
  assert st = 'in_progress' and q = 2, 'M184.5 · deny touches no line';
end $$;

-- ══ M184.6 · close on an OPEN, unchanged request: still_open — a real decision is still to be made ═
do $$
declare mgr uuid := '00000000-0000-0000-0000-000000184a01';
        c uuid; l uuid; r uuid; v text; ast text; who uuid;
begin
  c := pg_temp.m184_table('M184-6');
  l := pg_temp.m184_line(c, 1400);
  r := pg_temp.m184_request(c, l);
  v := public.mms_resolve_approval(r, mgr, 'close');
  assert v = 'still_open', format('M184.6 · close on a live request is refused as still_open (%s)', v);
  select status, approver_staff_id into ast, who from public.mms_approvals where id = r;
  assert ast = 'pending' and who is null, format('M184.6 · the refusal writes nothing (%s)', ast);
end $$;

-- ══ M184.7 · close on a PAID cart: ok, superseded (never denied), the closer and the time, line kept ═
do $$
declare mgr uuid := '00000000-0000-0000-0000-000000184a01';
        c uuid; l uuid; r uuid; v text; st text; cp boolean; ast text; who uuid; at timestamptz;
begin
  c := pg_temp.m184_table('M184-7');
  l := pg_temp.m184_line(c, 1400);
  r := pg_temp.m184_request(c, l);
  update public.qr_carts set status = 'paid' where id = c;    -- the table paid while this waited
  v := public.mms_resolve_approval(r, mgr, 'close');
  assert v = 'ok', format('M184.7 · close on a paid cart lands (%s)', v);
  select status, approver_staff_id, resolved_at into ast, who, at from public.mms_approvals where id = r;
  assert ast = 'superseded', format('M184.7 · the row reads superseded, never denied (%s)', ast);
  assert who = mgr and at is not null, 'M184.7 · the closer and the time are recorded';
  select state, comped into st, cp from public.qr_cart_items where id = l;
  assert st = 'in_progress' and not cp, 'M184.7 · the line stays charged — a refund is its own record';
end $$;

-- ══ M184.8 · close on a CANCELLED cart (a clear outside M182's RPC): ok, superseded ═══════════════
do $$
declare mgr uuid := '00000000-0000-0000-0000-000000184a01';
        c uuid; l uuid; r uuid; v text; ast text;
begin
  c := pg_temp.m184_table('M184-8');
  l := pg_temp.m184_line(c, 1400);
  r := pg_temp.m184_request(c, l);
  update public.qr_carts set status = 'cancelled' where id = c;
  v := public.mms_resolve_approval(r, mgr, 'close');
  assert v = 'ok', format('M184.8 · close on a cancelled cart lands (%s)', v);
  select status into ast from public.mms_approvals where id = r;
  assert ast = 'superseded', format('M184.8 · the row reads superseded (%s)', ast);
end $$;

-- ══ M184.9 · the request's OWN asker may close it (a manager who asked); the same asker still cannot
--    approve it ═══════════════════════════════════════════════════════════════════════════════════
do $$
declare mgr uuid := '00000000-0000-0000-0000-000000184a01';
        c uuid; l uuid; r uuid; v text; ast text; who uuid;
begin
  c := pg_temp.m184_table('M184-9a');
  l := pg_temp.m184_line(c, 1400);
  r := pg_temp.m184_request(c, l, 'void', mgr);                -- Aye asked
  v := public.mms_resolve_approval(r, mgr, 'approve');
  assert v = 'self_approve', format('M184.9 · the asker still cannot approve their own request (%s)', v);
  update public.qr_carts set status = 'paid' where id = c;
  v := public.mms_resolve_approval(r, mgr, 'close');
  assert v = 'ok', format('M184.9 · the asker may close their own request once the table paid (%s)', v);
  select status, approver_staff_id into ast, who from public.mms_approvals where id = r;
  assert ast = 'superseded' and who = mgr, format('M184.9 · superseded, closed by the asker (%s)', ast);
end $$;

-- ══ M184.10 · a server and an inactive manager cannot close ═════════════════════════════════════════
do $$
declare srv uuid := '00000000-0000-0000-0000-000000184a04'; gone uuid := '00000000-0000-0000-0000-000000184a05';
        c uuid; l uuid; r uuid; v text; ast text;
begin
  c := pg_temp.m184_table('M184-10');
  l := pg_temp.m184_line(c, 1400);
  r := pg_temp.m184_request(c, l, 'void', '00000000-0000-0000-0000-000000184a01');
  update public.qr_carts set status = 'paid' where id = c;
  v := public.mms_resolve_approval(r, srv, 'close');
  assert v = 'bad_approver', format('M184.10 · a server cannot close (%s)', v);
  v := public.mms_resolve_approval(r, gone, 'close');
  assert v = 'bad_approver', format('M184.10 · an inactive manager cannot close (%s)', v);
  select status into ast from public.mms_approvals where id = r;
  assert ast = 'pending', 'M184.10 · the refusals write nothing';
end $$;

-- ══ M184.11 · close on an OPEN cart whose line changed after the ask: ok, superseded, line kept ═══
do $$
declare mgr uuid := '00000000-0000-0000-0000-000000184a01';
        c uuid; l uuid; r uuid; v text; ast text; q integer; st text;
begin
  c := pg_temp.m184_table('M184-11');
  l := pg_temp.m184_line(c, 1400);
  r := pg_temp.m184_request(c, l);
  update public.qr_cart_items set qty = 2 where id = l;
  v := public.mms_resolve_approval(r, mgr, 'close');
  assert v = 'ok', format('M184.11 · close on a changed line lands (%s)', v);
  select status into ast from public.mms_approvals where id = r;
  assert ast = 'superseded', format('M184.11 · the row reads superseded (%s)', ast);
  select qty, state into q, st from public.qr_cart_items where id = l;
  assert q = 2 and st = 'in_progress', 'M184.11 · the line stays at its new qty, charged';
end $$;

-- ══ M184.12 · once only: close on a resolved row is already_resolved; an unknown id is not_found ═══
do $$
declare mgr uuid := '00000000-0000-0000-0000-000000184a01';
        c uuid; l uuid; r uuid; v text;
begin
  c := pg_temp.m184_table('M184-12');
  l := pg_temp.m184_line(c, 1400);
  r := pg_temp.m184_request(c, l);
  update public.qr_carts set status = 'paid' where id = c;
  perform public.mms_resolve_approval(r, mgr, 'close');
  v := public.mms_resolve_approval(r, mgr, 'close');
  assert v = 'already_resolved', format('M184.12 · a second close is already_resolved (%s)', v);
  v := public.mms_resolve_approval('00000000-0000-0000-0000-000000184f00', mgr, 'close');
  assert v = 'not_found', format('M184.12 · an unknown id is not_found (%s)', v);
end $$;

-- ══ M184.13 · an illegal decision raises ════════════════════════════════════════════════════════════
do $$
declare mgr uuid := '00000000-0000-0000-0000-000000184a01';
        c uuid; l uuid; r uuid; raised boolean := false;
begin
  c := pg_temp.m184_table('M184-13');
  l := pg_temp.m184_line(c, 1400);
  r := pg_temp.m184_request(c, l);
  begin
    perform public.mms_resolve_approval(r, mgr, 'supersede');
  exception when others then
    raised := true;
  end;
  assert raised, 'M184.13 · an illegal decision raises';
end $$;

-- ══ M184.14 · the legitimate halves around the compare: approve on a paid cart stays not_open; a
--    comp approve on an unchanged line lands and comps the line ════════════════════════════════════
do $$
declare mgr uuid := '00000000-0000-0000-0000-000000184a01';
        c uuid; l uuid; r uuid; v text; cp boolean; ast text; amt integer;
begin
  c := pg_temp.m184_table('M184-14a');
  l := pg_temp.m184_line(c, 1400);
  r := pg_temp.m184_request(c, l);
  update public.qr_carts set status = 'paid' where id = c;
  v := public.mms_resolve_approval(r, mgr, 'approve');
  assert v = 'not_open', format('M184.14 · approve on a paid cart is not_open (%s)', v);
  c := pg_temp.m184_table('M184-14b');
  l := pg_temp.m184_line(c, 1300);
  r := pg_temp.m184_request(c, l, 'comp');
  v := public.mms_resolve_approval(r, mgr, 'approve');
  assert v = 'ok', format('M184.14 · a comp approve on the line as asked lands (%s)', v);
  select comped into cp from public.qr_cart_items where id = l;
  assert cp, 'M184.14 · the line is comped';
  select status, amount_cents into ast, amt from public.mms_approvals where id = r;
  assert ast = 'approved' and amt = 1300, format('M184.14 · approved at $13.00 (%s %s)', ast, amt);
end $$;

-- ══ M184.15 · privileges, the empty search_path, exactly one definition ═════════════════════════════
do $$
declare n integer; sp text;
begin
  assert not has_function_privilege('anon', 'public.mms_resolve_approval(uuid, uuid, text)', 'execute'),
    'M184.15 · anon cannot execute';
  assert not has_function_privilege('authenticated', 'public.mms_resolve_approval(uuid, uuid, text)', 'execute'),
    'M184.15 · authenticated cannot execute';
  assert has_function_privilege('service_role', 'public.mms_resolve_approval(uuid, uuid, text)', 'execute'),
    'M184.15 · service_role executes';
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.proname = 'mms_resolve_approval';
  assert n = 1, format('M184.15 · exactly one definition (%s)', n);
  select coalesce(array_to_string(p.proconfig, ','), '') into sp
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.proname = 'mms_resolve_approval';
  assert sp like '%search_path=%', format('M184.15 · search_path is pinned (%s)', sp);
end $$;

rollback;
