-- supabase/tests/m269_approve_cart_lock_test.sql  (M269 — an approve reads the cart only after its lock)
--
-- Pins supabase/migrations/20261009120100_m269_approve_cart_lock.sql: `mms_resolve_approval`'s APPROVE
-- arm takes the line's cart FOR SHARE before the request and the line, and then reads the cart's
-- freshness: a settle freeze or a pay lock it reads is refused 'in_flight', with nothing applied. Each
-- refusal sits beside the legitimate case it must not over-block (W17):
--
--   M269.1   approve while the cart is SETTLING (a fresh `settle_at`): 'in_flight', the line untouched,
--            the request still pending with no approver
--   M269.2   the same approve once the freeze is STALE (older than 10 minutes): ok, the line voided
--   M269.3   approve while the cart is PAY-LOCKED (a fresh `locked_at`): 'in_flight'; once the lock is
--            stale: ok
--   M269.4   privileges, the empty search_path, exactly one definition, after the restatement
--
-- ⚠️ WHAT THIS FILE CANNOT SEE: the lock's existence and its ORDER. One session interleaves nothing, and
-- the `xmax` probe M261.1 uses is blind here: the fixture's line insert (an FK check) already stamps the
-- cart row in this transaction. Both are proved with two sessions, in
-- scripts/verify-counter-fire-race.mjs (orders k and k2, mutants `m269/*`); scripts/verify-mode-authority.mjs
-- lists the two lock mutants as documented survivors for exactly that reason.
--
-- Each case is falsified by name in scripts/verify-mode-authority.mjs (suite `m269`).
--
-- ⚠️ `now()` is the TRANSACTION start and this file is ONE transaction, so a "stale" stamp is written
-- as `now() - interval …` directly.
--
-- Run against any QR DB (rolls back — leaves NO data behind):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/m269_approve_cart_lock_test.sql

begin;
-- W8: without this GUC every ASSERT below compiles out and the file exits 0 having proved nothing.
set local plpgsql.check_asserts = on;

-- ── fixtures: a manager (Aye) and a server (Thiri, the asker) ─────────────────────────────────────
insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000269a01'),
  ('00000000-0000-0000-0000-000000269a04');
insert into public.staff (user_id, role, display_name, active) values
  ('00000000-0000-0000-0000-000000269a01', 'manager', 'M269 Aye',   true),
  ('00000000-0000-0000-0000-000000269a04', 'server',  'M269 Thiri', true);

-- A dine-in table with one cooked line and a pending void request on it, as `mms_request_approval`
-- writes it. Answers the request's id; the line and the cart are read back from it.
create or replace function pg_temp.m269_asked(p_code text) returns uuid language plpgsql as $$
declare v_sess uuid; v_cart uuid; v_line uuid; v_id uuid;
begin
  insert into public.table_sessions (qr_code, mode, status, expires_at)
    values (p_code, 'dinein', 'active', now() + interval '12 hours') returning id into v_sess;
  insert into public.qr_carts (session_id) values (v_sess) returning id into v_cart;
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents,
                                    fulfillment, state, comped)
    values (v_cart, 'cccccccc-0000-4000-8000-000000000269', 'Mohinga', 1, 1400, 0, 'dinein',
            'in_progress', false)
    returning id into v_line;
  insert into public.mms_approvals (kind, status, cart_id, session_id, line_id, line_name, qty,
                                    amount_cents, reason_code, cooked, initiator_staff_id, gate_reason)
    values ('void', 'pending', v_cart, v_sess, v_line, 'Mohinga', 1, 1400, 'kitchen_error', true,
            '00000000-0000-0000-0000-000000269a04', 'cooked')
    returning id into v_id;
  return v_id;
end $$;

-- ══ M269.1 · settling: in_flight, nothing applied ═══════════════════════════════════════════════════
do $$
declare mgr uuid := '00000000-0000-0000-0000-000000269a01';
        r uuid; c uuid; l uuid; v text; st text; ast text; who uuid;
begin
  r := pg_temp.m269_asked('M269-1');
  select cart_id, line_id into c, l from public.mms_approvals where id = r;
  update public.qr_carts set settle_at = now(), settle_by = mgr where id = c;
  v := public.mms_resolve_approval(r, mgr, 'approve');
  assert v = 'in_flight', format('M269.1 · approve on a settling cart is refused in_flight (%s)', v);
  select state into st from public.qr_cart_items where id = l;
  assert st = 'in_progress', format('M269.1 · nothing was taken off the line (%s)', st);
  select status, approver_staff_id into ast, who from public.mms_approvals where id = r;
  assert ast = 'pending' and who is null,
    format('M269.1 · the request is still pending with no approver (%s)', ast);
end $$;

-- ══ M269.2 · a STALE freeze blocks nothing: ok, the line voided ═════════════════════════════════════
do $$
declare mgr uuid := '00000000-0000-0000-0000-000000269a01';
        r uuid; c uuid; l uuid; v text; st text;
begin
  r := pg_temp.m269_asked('M269-2');
  select cart_id, line_id into c, l from public.mms_approvals where id = r;
  update public.qr_carts set settle_at = now() - interval '11 minutes', settle_by = mgr where id = c;
  v := public.mms_resolve_approval(r, mgr, 'approve');
  assert v = 'ok', format('M269.2 · approve after a stale settle freeze lands (%s)', v);
  select state into st from public.qr_cart_items where id = l;
  assert st = 'voided', format('M269.2 · the line is voided (%s)', st);
end $$;

-- ══ M269.3 · pay-locked: in_flight; a stale pay lock blocks nothing ═════════════════════════════════
do $$
declare mgr uuid := '00000000-0000-0000-0000-000000269a01';
        r uuid; c uuid; l uuid; v text; st text;
begin
  r := pg_temp.m269_asked('M269-3a');
  select cart_id, line_id into c, l from public.mms_approvals where id = r;
  update public.qr_carts set locked = true, locked_at = now() where id = c;
  v := public.mms_resolve_approval(r, mgr, 'approve');
  assert v = 'in_flight', format('M269.3 · approve on a pay-locked cart is refused in_flight (%s)', v);
  select state into st from public.qr_cart_items where id = l;
  assert st = 'in_progress', format('M269.3 · nothing was taken off the pay-locked line (%s)', st);

  r := pg_temp.m269_asked('M269-3b');
  select cart_id, line_id into c, l from public.mms_approvals where id = r;
  update public.qr_carts set locked = true, locked_at = now() - interval '6 minutes' where id = c;
  v := public.mms_resolve_approval(r, mgr, 'approve');
  assert v = 'ok', format('M269.3 · approve after a stale pay lock lands (%s)', v);
end $$;

-- ══ M269.4 · privileges, the empty search_path, exactly one definition ══════════════════════════════
do $$
declare n integer; sp text;
begin
  assert not has_function_privilege('anon', 'public.mms_resolve_approval(uuid, uuid, text)', 'execute'),
    'M269.4 · anon cannot execute';
  assert not has_function_privilege('authenticated', 'public.mms_resolve_approval(uuid, uuid, text)', 'execute'),
    'M269.4 · authenticated cannot execute';
  assert has_function_privilege('service_role', 'public.mms_resolve_approval(uuid, uuid, text)', 'execute'),
    'M269.4 · service_role executes';
  select count(*), max(array_to_string(p.proconfig, ',')) into n, sp
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.proname = 'mms_resolve_approval';
  assert n = 1, format('M269.4 · exactly one definition (%s)', n);
  assert sp = 'search_path=""', format('M269.4 · the empty search_path (%s)', sp);
end $$;

rollback;
