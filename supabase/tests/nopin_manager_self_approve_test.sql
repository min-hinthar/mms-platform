-- supabase/tests/nopin_manager_self_approve_test.sql  (No-PIN — owner, 2026-10-24)
--
-- Pins supabase/migrations/20261024120000_no_pin_manager_self_approve.sql: a signed-in manager or
-- owner approves their OWN void, comp and counter no-show (the initiator = approver refusal is gone),
-- while the approver must still be an ACTIVE manager or owner, a gated write still needs SOME
-- approver, and the audit row still records both people. Each refusal sits beside its legitimate half.
--
-- Red-first: plpgsql ASSERT stops at the FIRST failure. Every case is falsified by name in
-- scripts/verify-mode-authority.mjs (suite `nopin`).
--
-- Run against any QR DB (rolls back — leaves NO data behind):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/nopin_manager_self_approve_test.sql

begin;
-- W8: without this GUC every ASSERT below compiles out and the file exits 0 having proved nothing.
set local plpgsql.check_asserts = on;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000a0a0'),
  ('00000000-0000-0000-0000-00000000a0b0'),
  ('00000000-0000-0000-0000-00000000a0c0'),
  ('00000000-0000-0000-0000-00000000a0d0');
insert into public.staff (user_id, role, display_name, active) values
  ('00000000-0000-0000-0000-00000000a0a0', 'manager', 'NOPIN Manager',  true),
  ('00000000-0000-0000-0000-00000000a0b0', 'server',  'NOPIN Server',   true),
  ('00000000-0000-0000-0000-00000000a0c0', 'owner',   'NOPIN Owner',    true),
  ('00000000-0000-0000-0000-00000000a0d0', 'manager', 'NOPIN Departed', false);

-- A dine-in table with an open cart, and a counter (`reg-`) order with one.
create or replace function pg_temp.np_cart(p_code text, p_mode text default 'dinein')
  returns uuid language plpgsql as $$
declare v_sess uuid; v_cart uuid;
begin
  insert into public.table_sessions (qr_code, mode, status, expires_at)
    values (p_code, p_mode, 'active', now() + interval '12 hours') returning id into v_sess;
  insert into public.qr_carts (session_id) values (v_sess) returning id into v_cart;
  return v_cart;
end $$;

create or replace function pg_temp.np_line(p_cart uuid, p_state text, p_fulfillment text default 'dinein')
  returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents,
                                    fulfillment, state, fire_at)
    values (p_cart, 'cccccccc-0000-4000-8000-00000000a0a0', 'Mohinga', 1, 1400, 0,
            p_fulfillment, p_state, case when p_state = 'draft' then null else now() - interval '5 minutes' end)
    returning id into v_id;
  return v_id;
end $$;

-- ══ NOPIN.1 · a manager voids a COOKED dish on their own sign-in; the audit row names them twice ══
do $$
declare mgr uuid := '00000000-0000-0000-0000-00000000a0a0'; c uuid; l uuid; v text; st text;
        ini uuid; apr uuid;
begin
  c := pg_temp.np_cart('NOPIN-1');
  l := pg_temp.np_line(c, 'served');
  v := public.mms_void_line(l, 'void', 'mistake', mgr, mgr);
  assert v = 'ok', format('NOPIN.1 · a manager approves their own cooked void (%s)', v);
  select state into st from public.qr_cart_items where id = l;
  assert st = 'voided', format('NOPIN.1 · the line is voided (%s)', st);
  select initiator_staff_id, approver_staff_id into ini, apr
    from public.mms_approvals where line_id = l and status = 'approved';
  assert ini = mgr and apr = mgr, 'NOPIN.1 · the audit row records the manager as both';
end $$;

-- ══ NOPIN.2 · an owner comps their own dish ══════════════════════════════════════════════════
do $$
declare own uuid := '00000000-0000-0000-0000-00000000a0c0'; c uuid; l uuid; v text; cp boolean;
begin
  c := pg_temp.np_cart('NOPIN-2');
  l := pg_temp.np_line(c, 'fired');
  v := public.mms_void_line(l, 'comp', 'service_recovery', own, own);
  assert v = 'ok', format('NOPIN.2 · an owner approves their own comp (%s)', v);
  select comped into cp from public.qr_cart_items where id = l;
  assert cp, 'NOPIN.2 · the line is comped';
end $$;

-- ══ NOPIN.3 · the legitimate halves the rule must keep: a server is never an approver, a departed
--    manager is never one, and a gated void with NO approver still asks for one ═══════════════════
do $$
declare srv uuid := '00000000-0000-0000-0000-00000000a0b0';
        gone uuid := '00000000-0000-0000-0000-00000000a0d0'; c uuid; l uuid; v text; st text;
begin
  c := pg_temp.np_cart('NOPIN-3');
  l := pg_temp.np_line(c, 'served');
  v := public.mms_void_line(l, 'void', 'mistake', srv, srv);
  assert v = 'bad_approver', format('NOPIN.3 · a server cannot approve their own void (%s)', v);
  v := public.mms_void_line(l, 'void', 'mistake', gone, gone);
  assert v = 'bad_approver', format('NOPIN.3 · an inactive manager cannot approve (%s)', v);
  v := public.mms_void_line(l, 'void', 'mistake', srv, null);
  assert v = 'needs_approval', format('NOPIN.3 · a cooked void still needs a manager (%s)', v);
  select state into st from public.qr_cart_items where id = l;
  assert st = 'served', 'NOPIN.3 · no refusal moved the line';
end $$;

-- ══ NOPIN.4 · a manager writes off their own counter no-show; a server still cannot ═════════════
do $$
declare mgr uuid := '00000000-0000-0000-0000-00000000a0a0';
        srv uuid := '00000000-0000-0000-0000-00000000a0b0'; c uuid; l uuid; v text; st text;
begin
  c := pg_temp.np_cart('reg-NOPIN4S', 'pickup');
  l := pg_temp.np_line(c, 'served', 'togo');
  v := public.mms_counter_no_show(c, srv, array[l], srv);
  assert v = 'bad_approver', format('NOPIN.4 · a server cannot approve their own no-show (%s)', v);
  v := public.mms_counter_no_show(c, mgr, array[l], mgr);
  assert v = 'ok', format('NOPIN.4 · a manager approves their own no-show (%s)', v);
  select state into st from public.qr_cart_items where id = l;
  assert st = 'voided', format('NOPIN.4 · the sent dish is written off (%s)', st);
end $$;

-- ══ NOPIN.5 · the request queue is UNCHANGED: the asker still cannot approve their own request ══
do $$
declare mgr uuid := '00000000-0000-0000-0000-00000000a0a0'; c uuid; l uuid; v text; r uuid;
begin
  c := pg_temp.np_cart('NOPIN-5');
  l := pg_temp.np_line(c, 'served');
  v := public.mms_request_approval(l, 'void', 'mistake', mgr);
  assert v = 'ok', format('NOPIN.5 · the request is filed (%s)', v);
  select id into r from public.mms_approvals where line_id = l and status = 'pending';
  v := public.mms_resolve_approval(r, mgr, 'approve');
  assert v = 'self_approve', format('NOPIN.5 · the asker still cannot approve their own request (%s)', v);
end $$;

-- ══ NOPIN.6 · the grants: service_role only ════════════════════════════════════════════════════
do $$
begin
  assert has_function_privilege('service_role', 'public.mms_void_line(uuid, text, text, uuid, uuid)', 'execute'),
    'NOPIN.6 · service_role executes mms_void_line';
  assert not has_function_privilege('anon', 'public.mms_void_line(uuid, text, text, uuid, uuid)', 'execute'),
    'NOPIN.6 · anon does not execute mms_void_line';
  assert not has_function_privilege('authenticated', 'public.mms_void_line(uuid, text, text, uuid, uuid)', 'execute'),
    'NOPIN.6 · authenticated does not execute mms_void_line';
  assert has_function_privilege('service_role', 'public.mms_counter_no_show(uuid, uuid, uuid[], uuid)', 'execute'),
    'NOPIN.6 · service_role executes mms_counter_no_show';
  assert not has_function_privilege('anon', 'public.mms_counter_no_show(uuid, uuid, uuid[], uuid)', 'execute'),
    'NOPIN.6 · anon does not execute mms_counter_no_show';
  assert not has_function_privilege('authenticated', 'public.mms_counter_no_show(uuid, uuid, uuid[], uuid)', 'execute'),
    'NOPIN.6 · authenticated does not execute mms_counter_no_show';
end $$;

rollback;
