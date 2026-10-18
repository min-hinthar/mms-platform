-- supabase/tests/m210_team_safety_test.sql  (M210 · M208 · M205 — the team-safety migration)
--
-- Pins supabase/migrations/20261018130000_m210_team_safety.sql: privileges and RLS; every refusal of
-- `mms_staff_set` (a caller gone, off or below the floor; a target not there; yourself; a role that
-- moved since the console showed it; the A6 ceiling on the target's current role and on the role
-- requested) and of `mms_staff_provision` (the same caller rule, the ceiling, a duplicate) — each
-- beside the legitimate call it must NOT over-block, and each checked to have WRITTEN NOTHING; the
-- `staff_audit` row every write leaves, in the same transaction (M205); and the table-level invariant
-- `staff_keep_an_owner` (M210) — the last active owner cannot be demoted, deactivated or deleted by
-- ANY writer, while every other change to an owner row still goes through.
--
-- The ORDERS no single session can interleave (two cross-demotions, a revocation landing mid-call, a
-- promotion landing mid-call, two direct demotions of the last two owners) are
-- scripts/verify-team-race.mjs's; its `--mutants` also replays every rule here against this file.
--
-- ⚠️ The owner invariant is over the WHOLE table, so a database that already holds active owners (a
-- dev stack with a bootstrapped owner) would let the "last owner" cases pass for the wrong reason.
-- The prelude below switches those owners off INSIDE this transaction — the trigger disabled for that
-- one statement and re-enabled before any case runs — and the rollback restores them.
--
-- Red-first: plpgsql ASSERT stops at the FIRST failure, so a red-then-green run proves one case.
--
-- ⚠️ LOCAL / THROWAWAY STACKS ONLY — never the shared QR project (there is no staging: preview and
-- prod are the one project, docs/ENV.md). It rolls back and leaves no data behind, but WHILE it runs
-- it holds `ALTER TABLE public.staff DISABLE TRIGGER` (an ACCESS EXCLUSIVE lock on `staff`, so every
-- staff read and sign-in on that database waits for this file) and switches every live owner off
-- inside its transaction. Run it against `supabase start` or CI's stack:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/m210_team_safety_test.sql

begin;
-- W8: without this GUC every ASSERT below compiles out and the file exits 0 having proved nothing.
set local plpgsql.check_asserts = on;

-- ── prelude: no owner outside this file's fixtures (see the header) ────────────────────────────
alter table public.staff disable trigger staff_keep_an_owner;
update public.staff set active = false where role = 'owner' and active;
alter table public.staff enable trigger staff_keep_an_owner;

-- ── fixtures: two owners, two managers, three servers, a manager switched off, an owner switched off
insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000210a01'), ('00000000-0000-0000-0000-000000210a02'),
  ('00000000-0000-0000-0000-000000210b01'), ('00000000-0000-0000-0000-000000210b02'),
  ('00000000-0000-0000-0000-000000210c01'), ('00000000-0000-0000-0000-000000210c02'),
  ('00000000-0000-0000-0000-000000210d01'), ('00000000-0000-0000-0000-000000210d02'),
  ('00000000-0000-0000-0000-000000210e01'), ('00000000-0000-0000-0000-000000210e02'),
  ('00000000-0000-0000-0000-000000210c03');
insert into public.staff (user_id, role, display_name, active, email) values
  ('00000000-0000-0000-0000-000000210a01', 'owner',   'M210 Owner One',   true,  'o1@m210.test'),
  ('00000000-0000-0000-0000-000000210a02', 'owner',   'M210 Owner Two',   true,  'o2@m210.test'),
  ('00000000-0000-0000-0000-000000210b01', 'manager', 'M210 Manager One', true,  'm1@m210.test'),
  ('00000000-0000-0000-0000-000000210b02', 'manager', 'M210 Manager Two', true,  'm2@m210.test'),
  ('00000000-0000-0000-0000-000000210c01', 'server',  'M210 Server One',  true,  's1@m210.test'),
  ('00000000-0000-0000-0000-000000210c02', 'server',  'M210 Server Two',  true,  's2@m210.test'),
  -- c03 is never touched: the ACTIVE server M210.9's floor case needs (c02 is switched off in
  -- M210.4, so refusing it would prove the active rule, not the floor).
  ('00000000-0000-0000-0000-000000210c03', 'server',  'M210 Server Three', true, 's3@m210.test'),
  ('00000000-0000-0000-0000-000000210d01', 'manager', 'M210 Manager Off', false, 'moff@m210.test'),
  ('00000000-0000-0000-0000-000000210d02', 'owner',   'M210 Owner Off',   false, 'ooff@m210.test');
-- 210e01 / 210e02 are auth users with NO staff row yet: the invite's targets.

create or replace function pg_temp.id(p text) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0000-000000210' || p)::uuid
$$;
create or replace function pg_temp.role_of(p text) returns text language sql as $$
  select role from public.staff where user_id = pg_temp.id(p)
$$;
create or replace function pg_temp.active_of(p text) returns boolean language sql as $$
  select active from public.staff where user_id = pg_temp.id(p)
$$;
-- The RPC ledger rows naming `p` (the fixtures' own INSERTs leave `direct` rows: M210.14).
create or replace function pg_temp.audits(p text) returns integer language sql as $$
  select count(*)::integer from public.staff_audit where target_id = pg_temp.id(p) and source = 'rpc'
$$;
-- Every ledger row naming `p`, whichever path wrote it — what "recorded once" is counted against.
create or replace function pg_temp.all_audits(p text) returns integer language sql as $$
  select count(*)::integer from public.staff_audit where target_id = pg_temp.id(p)
$$;
-- The direct-write rows naming `p` with `action`.
create or replace function pg_temp.direct(p text, p_action text) returns integer language sql as $$
  select count(*)::integer from public.staff_audit
   where target_id = pg_temp.id(p) and source = 'direct' and actor_id is null and action = p_action
$$;
-- A role change / an active flip by `by`, on `who`, as the console showed `seen`.
create or replace function pg_temp.set_role(p_by text, p_who text, p_seen text, p_role text)
  returns jsonb language sql as $$
  select public.mms_staff_set(pg_temp.id(p_by), pg_temp.id(p_who), p_seen, p_role, null)
$$;
create or replace function pg_temp.set_active(p_by text, p_who text, p_seen text, p_on boolean)
  returns jsonb language sql as $$
  select public.mms_staff_set(pg_temp.id(p_by), pg_temp.id(p_who), p_seen, null, p_on)
$$;
-- Calls that must RAISE: the error text, or 'no error'.
create or replace function pg_temp.raises(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'no error';
exception when others then
  return sqlerrm;
end $$;

-- ══ M210.0 · privileges, RLS and the trigger's shape ═════════════════════════════════════════
do $$
declare r record; seen integer := 0;
        want text[] := array['mms_staff_set', 'mms_staff_provision'];
begin
  for r in select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = any(want) loop
    seen := seen + 1;
    assert not has_function_privilege('anon', r.oid, 'execute')
       and not has_function_privilege('authenticated', r.oid, 'execute')
       and has_function_privilege('service_role', r.oid, 'execute'),
      format('M210.0 · %s must be service_role-only', r.proname);
  end loop;
  assert seen = cardinality(want),
    format('M210.0 · checked %s functions, want exactly %s (one per name)', seen, cardinality(want));
  assert not has_function_privilege('anon', 'public.mms_staff_keep_an_owner()', 'execute')
     and not has_function_privilege('authenticated', 'public.mms_staff_keep_an_owner()', 'execute'),
    'M210.0 · the trigger function is not reachable as an RPC';
  assert (select tgtype from pg_trigger
           where tgrelid = 'public.staff'::regclass and tgname = 'staff_keep_an_owner'
             and tgenabled = 'O') = 25,
    'M210.0 · staff_keep_an_owner is AFTER UPDATE OR DELETE FOR EACH ROW, and enabled';
  assert (select relrowsecurity from pg_class where oid = 'public.staff_audit'::regclass),
    'M210.0 · staff_audit has RLS on';
  assert (select count(*) from pg_policies
           where schemaname = 'public' and tablename = 'staff_audit') = 1
     and exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'staff_audit'
                    and policyname = 'staff_audit_read' and cmd = 'SELECT'
                    and roles::text = '{authenticated}'
                    and qual = 'is_staff_at_least(''manager''::text)'),
    'M210.0 · staff_audit carries ONE policy: managers and owners read';
  assert not has_table_privilege('anon', 'public.staff_audit', 'select')
     and not has_table_privilege('authenticated', 'public.staff_audit', 'insert')
     and not has_table_privilege('authenticated', 'public.staff_audit', 'update')
     and not has_table_privilege('authenticated', 'public.staff_audit', 'delete'),
    'M210.0 · no client role can write the ledger, and anon cannot read it';
  -- service_role bypasses RLS, so a privilege is the whole door: a direct service-client insert
  -- would forge a ledger row. Every writer is a SECURITY DEFINER function (M210.8 / .9 / .14 prove
  -- they still write), so it needs none.
  assert not has_table_privilege('service_role', 'public.staff_audit', 'insert')
     and not has_table_privilege('service_role', 'public.staff_audit', 'update')
     and not has_table_privilege('service_role', 'public.staff_audit', 'delete')
     and not has_table_privilege('service_role', 'public.staff_audit', 'truncate'),
    'M210.0 · service_role cannot insert, update, delete or truncate the ledger';
  assert not has_function_privilege('anon', 'public.mms_staff_audit_direct()', 'execute')
     and not has_function_privilege('authenticated', 'public.mms_staff_audit_direct()', 'execute'),
    'M210.0 · the direct-write trigger function is not reachable as an RPC';
  assert (select tgtype from pg_trigger
           where tgrelid = 'public.staff'::regclass and tgname = 'staff_audit_direct'
             and tgenabled = 'O') = 29,
    'M210.0 · staff_audit_direct is AFTER INSERT OR UPDATE OR DELETE FOR EACH ROW, and enabled';
  for r in select p.proname, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = any(want) loop
    assert 'lock_timeout=5s' = any(r.proconfig),
      format('M210.0 · %s bounds its lock waits (lock_timeout=5s; got %s)', r.proname, r.proconfig);
  end loop;
end $$;

-- The privilege, exercised: as service_role, every write to the ledger is refused.
set local role service_role;
do $$
declare e text;
begin
  e := pg_temp.raises($q$insert into public.staff_audit (actor_id, action, target_id, from_role, to_role)
                         values (gen_random_uuid(), 'invited', gen_random_uuid(), null, 'owner')$q$);
  assert e like 'permission denied%', format('M210.0 · service_role cannot forge a ledger row (%s)', e);
  e := pg_temp.raises($q$update public.staff_audit set to_role = 'owner'$q$);
  assert e like 'permission denied%', format('M210.0 · service_role cannot rewrite the ledger (%s)', e);
  e := pg_temp.raises($q$delete from public.staff_audit$q$);
  assert e like 'permission denied%', format('M210.0 · service_role cannot erase the ledger (%s)', e);
end $$;
reset role;

-- ══ M210.1 · the caller: gone, switched off, or below the floor — and a manager who is none ══
do $$
declare j jsonb;
begin
  j := public.mms_staff_set(gen_random_uuid(), pg_temp.id('c01'), 'server', 'manager', null);
  assert j->>'status' = 'not_authorized', format('M210.1 · a caller with no row is refused (%s)', j);
  j := pg_temp.set_role('d01', 'c01', 'server', 'manager');
  assert j->>'status' = 'not_authorized',
    format('M210.1 · a switched-off manager is refused (%s)', j);
  j := pg_temp.set_role('c02', 'c01', 'server', 'manager');
  assert j->>'status' = 'not_authorized', format('M210.1 · a server is refused (%s)', j);
  assert pg_temp.role_of('c01') = 'server' and pg_temp.audits('c01') = 0,
    'M210.1 · a refused caller wrote nothing';
  -- The legitimate half: an active manager moves a server.
  j := pg_temp.set_role('b01', 'c01', 'server', 'manager');
  assert j->>'status' = 'ok', format('M210.1 · an active manager promotes a server (%s)', j);
  assert pg_temp.role_of('c01') = 'manager', 'M210.1 · the promotion landed';
end $$;

-- ══ M210.2 · a target that is not there ══════════════════════════════════════════════════════
do $$
declare j jsonb;
begin
  j := public.mms_staff_set(pg_temp.id('a01'), gen_random_uuid(), 'server', null, false);
  assert j->>'status' = 'not_found', format('M210.2 · an unknown target is not_found (%s)', j);
end $$;

-- ══ M210.3 · yourself ═════════════════════════════════════════════════════════════════════════
do $$
declare j jsonb;
begin
  j := pg_temp.set_role('b02', 'b02', 'manager', 'owner');
  assert j->>'status' = 'self', format('M210.3 · a manager cannot promote themselves (%s)', j);
  j := pg_temp.set_active('a01', 'a01', 'owner', false);
  assert j->>'status' = 'self', format('M210.3 · an owner cannot switch themselves off (%s)', j);
  assert pg_temp.role_of('b02') = 'manager' and pg_temp.active_of('a01')
     and pg_temp.audits('b02') = 0 and pg_temp.audits('a01') = 0,
    'M210.3 · a self change wrote nothing';
end $$;

-- ══ M210.4 · the role the console showed is not the role now ═════════════════════════════════
do $$
declare j jsonb;
begin
  -- s2 is a server; the console still shows the manager it once was.
  j := pg_temp.set_active('b01', 'c02', 'manager', false);
  assert j->>'status' = 'changed' and j->>'role' = 'server',
    format('M210.4 · a stale look refuses and names the role now (%s)', j);
  assert pg_temp.active_of('c02') and pg_temp.audits('c02') = 0,
    'M210.4 · a stale look wrote nothing';
  j := pg_temp.set_active('b01', 'c02', 'server', false);
  assert j->>'status' = 'ok', format('M210.4 · the true look deactivates (%s)', j);
  assert pg_temp.active_of('c02') is false, 'M210.4 · the deactivation landed';
end $$;

-- ══ M210.5 · already there: a no-op, no write, no audit row ═════════════════════════════════
do $$
declare j jsonb; n integer := pg_temp.audits('b02');
begin
  -- The active flag first: without the no-op rule it would write a reactivation over an active
  -- member and say ok, which only this assert can see (the role arm would trip the ledger's shape
  -- constraint instead, and name no case).
  j := pg_temp.set_active('a01', 'b02', 'manager', true);
  assert j->>'status' = 'noop', format('M210.5 · the same active flag is a no-op (%s)', j);
  j := pg_temp.set_role('a01', 'b02', 'manager', 'manager');
  assert j->>'status' = 'noop', format('M210.5 · the same role is a no-op (%s)', j);
  assert pg_temp.audits('b02') = n, 'M210.5 · a no-op leaves no audit row';
end $$;

-- ══ M210.6 · the ceiling on the target's CURRENT role ════════════════════════════════════════
do $$
declare j jsonb;
begin
  j := pg_temp.set_role('b01', 'a02', 'owner', 'server');
  assert j->>'status' = 'ceiling', format('M210.6 · a manager cannot demote an owner (%s)', j);
  j := pg_temp.set_active('b01', 'a02', 'owner', false);
  assert j->>'status' = 'ceiling', format('M210.6 · a manager cannot switch an owner off (%s)', j);
  j := pg_temp.set_active('b01', 'd02', 'owner', true);
  assert j->>'status' = 'ceiling',
    format('M210.6 · a manager cannot switch an owner back on either (%s)', j);
  -- The ceiling comes BEFORE the no-op: a request that would change nothing about an owner is still
  -- refused, never answered ok for an account outside a manager's reach.
  j := pg_temp.set_active('b01', 'd02', 'owner', false);
  assert j->>'status' = 'ceiling',
    format('M210.6 · a manager cannot switch an off owner off (no ok for an owner) (%s)', j);
  j := pg_temp.set_role('b01', 'a02', 'owner', 'owner');
  assert j->>'status' = 'ceiling',
    format('M210.6 · a manager cannot re-send an owner their own role (%s)', j);
  assert pg_temp.role_of('a02') = 'owner' and pg_temp.active_of('a02')
     and pg_temp.active_of('d02') is false and pg_temp.audits('a02') = 0
     and pg_temp.audits('d02') = 0,
    'M210.6 · a ceiling refusal wrote nothing';
  -- The legitimate half: a manager acts on a PEER manager (the equality), an owner on a co-owner.
  j := pg_temp.set_active('b01', 'd01', 'manager', true);
  assert j->>'status' = 'ok', format('M210.6 · a manager switches a peer back on (%s)', j);
  j := pg_temp.set_active('a01', 'd02', 'owner', true);
  assert j->>'status' = 'ok', format('M210.6 · an owner switches a co-owner back on (%s)', j);
end $$;

-- ══ M210.7 · the ceiling on the REQUESTED role ═══════════════════════════════════════════════
do $$
declare j jsonb;
begin
  j := pg_temp.set_role('b01', 'c01', 'manager', 'owner');
  assert j->>'status' = 'ceiling', format('M210.7 · a manager cannot mint an owner (%s)', j);
  assert pg_temp.role_of('c01') = 'manager', 'M210.7 · the refused promotion wrote nothing';
  j := pg_temp.set_role('a01', 'c01', 'manager', 'owner');
  assert j->>'status' = 'ok', format('M210.7 · the owner promotes to owner (%s)', j);
  assert pg_temp.role_of('c01') = 'owner', 'M210.7 · the owner promotion landed';
end $$;

-- ══ M210.8 · every write leaves its audit row, saying exactly what happened (M205) ══════════
do $$
declare j jsonb; r record; n integer;
begin
  select count(*) into n from public.staff_audit where target_id = pg_temp.id('b02');
  j := pg_temp.set_role('a01', 'b02', 'manager', 'server');
  assert j->>'status' = 'ok' and j->>'from_role' = 'manager' and j->>'to_role' = 'server'
     and j->>'action' = 'role_changed',
    format('M210.8 · the role change answers what it did (%s)', j);
  assert (select count(*) from public.staff_audit where target_id = pg_temp.id('b02')) = n + 1,
    'M210.8 · ONE audit row per write';
  -- `created_at` is the transaction's now(): every row in this file shares it, so the row is picked
  -- by what it is (the RPC's role change), never by a timestamp order that cannot tell them apart.
  select * into r from public.staff_audit
   where target_id = pg_temp.id('b02') and source = 'rpc' and action = 'role_changed';
  assert r.actor_id = pg_temp.id('a01') and r.action = 'role_changed'
     and r.from_role = 'manager' and r.to_role = 'server',
    format('M210.8 · the role change is recorded as who, what, from, to (%s)', row_to_json(r));
  j := pg_temp.set_active('a01', 'b02', 'server', false);
  assert j->>'status' = 'ok' and j->>'email' = 'm2@m210.test',
    format('M210.8 · the deactivation answers the address to tell (%s)', j);
  select * into r from public.staff_audit
   where target_id = pg_temp.id('b02') and action = 'deactivated' and source = 'rpc';
  assert r.actor_id = pg_temp.id('a01') and r.from_role = 'server' and r.to_role = 'server',
    format('M210.8 · the deactivation is recorded at the role it happened at (%s)', row_to_json(r));
  j := pg_temp.set_active('a01', 'b02', 'server', true);
  assert exists (select 1 from public.staff_audit
                  where target_id = pg_temp.id('b02') and action = 'reactivated'
                    and actor_id = pg_temp.id('a01')),
    format('M210.8 · the reactivation is recorded (%s)', j);
  assert pg_temp.active_of('b02'), 'M210.8 · the reactivation landed';
end $$;

-- ══ M210.9 · the invite's staff row ══════════════════════════════════════════════════════════
do $$
declare j jsonb;
begin
  j := public.mms_staff_provision(pg_temp.id('c03'), pg_temp.id('e01'), 'x@m210.test', 'server', 'X');
  assert j->>'status' = 'not_authorized', format('M210.9 · a server cannot invite (%s)', j);
  -- d01 was switched back on in M210.6; switch it off again for this one.
  update public.staff set active = false where user_id = pg_temp.id('d01');
  j := public.mms_staff_provision(pg_temp.id('d01'), pg_temp.id('e01'), 'x@m210.test', 'server', 'X');
  assert j->>'status' = 'not_authorized', format('M210.9 · a switched-off manager cannot invite (%s)', j);
  j := public.mms_staff_provision(pg_temp.id('b01'), pg_temp.id('e01'), 'x@m210.test', 'owner', 'X');
  assert j->>'status' = 'ceiling', format('M210.9 · a manager cannot invite an owner (%s)', j);
  assert not exists (select 1 from public.staff where user_id = pg_temp.id('e01'))
     and pg_temp.audits('e01') = 0,
    'M210.9 · a refused invite wrote nothing';
  -- The legitimate halves: a manager invites a server; an owner invites an owner.
  j := public.mms_staff_provision(pg_temp.id('b01'), pg_temp.id('e01'), 'New@M210.test', 'server', 'New');
  assert j->>'status' = 'ok', format('M210.9 · a manager invites a server (%s)', j);
  assert pg_temp.role_of('e01') = 'server' and pg_temp.active_of('e01')
     and (select email from public.staff where user_id = pg_temp.id('e01')) = 'new@m210.test',
    'M210.9 · the staff row is written, active, its e-mail lower-cased';
  assert exists (select 1 from public.staff_audit
                  where target_id = pg_temp.id('e01') and action = 'invited' and source = 'rpc'
                    and actor_id = pg_temp.id('b01') and from_role is null and to_role = 'server'),
    'M210.9 · the invite is recorded';
  assert pg_temp.all_audits('e01') = 1,
    'M210.9 · the invite is recorded ONCE — not again as a direct write';
  j := public.mms_staff_provision(pg_temp.id('a01'), pg_temp.id('e02'), 'co@m210.test', 'owner', 'Co');
  assert j->>'status' = 'ok' and pg_temp.role_of('e02') = 'owner',
    format('M210.9 · an owner invites an owner (%s)', j);
  -- A duplicate: the same row again, or another row with that e-mail.
  j := public.mms_staff_provision(pg_temp.id('a01'), pg_temp.id('e01'), 'again@m210.test', 'server', 'A');
  assert j->>'status' = 'exists', format('M210.9 · the same member again is exists (%s)', j);
  j := public.mms_staff_provision(pg_temp.id('a01'), gen_random_uuid(), 'NEW@m210.test', 'server', 'A');
  assert j->>'status' = 'exists', format('M210.9 · the same e-mail again is exists (%s)', j);
  assert pg_temp.all_audits('e01') = 1, 'M210.9 · a duplicate leaves no second audit row';
end $$;

-- ══ M210.10 · a malformed call raises — it is a bug, never a verdict ═════════════════════════
do $$
declare e text;
begin
  e := pg_temp.raises($q$select public.mms_staff_set(null, gen_random_uuid(), 'server', 'manager', null)$q$);
  assert e like 'mms_staff_set: caller, target%', format('M210.10 · a NULL caller raises (%s)', e);
  e := pg_temp.raises($q$select public.mms_staff_set(gen_random_uuid(), gen_random_uuid(), 'server', 'manager', true)$q$);
  assert e like 'mms_staff_set: exactly one%', format('M210.10 · both changes at once raise (%s)', e);
  e := pg_temp.raises($q$select public.mms_staff_set(gen_random_uuid(), gen_random_uuid(), 'server', null, null)$q$);
  assert e like 'mms_staff_set: exactly one%', format('M210.10 · no change at all raises (%s)', e);
  e := pg_temp.raises($q$select public.mms_staff_set(gen_random_uuid(), gen_random_uuid(), 'server', 'admin', null)$q$);
  assert e like 'mms_staff_set: unknown role%', format('M210.10 · an unknown role raises (%s)', e);
  e := pg_temp.raises($q$select public.mms_staff_provision(gen_random_uuid(), gen_random_uuid(), 'a@b.c', 'admin', 'A')$q$);
  assert e like 'mms_staff_provision: unknown role%', format('M210.10 · an unknown invite role raises (%s)', e);
end $$;

-- ══ M210.11 · the table-level invariant: at least one active owner, for EVERY writer ═════════
do $$
declare e text; n integer;
begin
  -- Down to ONE active owner first (a01), through plain writes the trigger must allow: a co-owner
  -- demoted, another deactivated, one deleted — each while another owner remains.
  update public.staff set role = 'manager' where user_id = pg_temp.id('a02');
  update public.staff set active = false where user_id = pg_temp.id('d02');
  update public.staff set role = 'server' where user_id = pg_temp.id('c01');
  delete from public.staff where user_id = pg_temp.id('e02');
  assert (select count(*) from public.staff where role = 'owner' and active) = 1,
    'M210.11 · the fixture is down to one active owner';
  -- The last owner, three ways.
  n := pg_temp.all_audits('a01');
  e := pg_temp.raises($q$update public.staff set role = 'manager' where user_id = pg_temp.id('a01')$q$);
  assert e like 'staff_keep_an_owner:%', format('M210.11 · the last owner cannot be demoted (%s)', e);
  e := pg_temp.raises($q$update public.staff set active = false where user_id = pg_temp.id('a01')$q$);
  assert e like 'staff_keep_an_owner:%', format('M210.11 · the last owner cannot be switched off (%s)', e);
  e := pg_temp.raises($q$delete from public.staff where user_id = pg_temp.id('a01')$q$);
  assert e like 'staff_keep_an_owner:%', format('M210.11 · the last owner cannot be deleted (%s)', e);
  e := pg_temp.raises($q$delete from auth.users where id = pg_temp.id('a01')$q$);
  assert e like 'staff_keep_an_owner:%',
    format('M210.11 · nor by deleting their auth user (the cascade) (%s)', e);
  assert pg_temp.role_of('a01') = 'owner' and pg_temp.active_of('a01'),
    'M210.11 · the last owner is still there';
  assert pg_temp.all_audits('a01') = n,
    'M210.11 · a refused direct write leaves no ledger row (it rolled back with the write)';
  -- What it must NOT block: the last owner's own name edit, any non-owner row, an off owner's row.
  update public.staff set display_name = 'M210 Owner Renamed' where user_id = pg_temp.id('a01');
  update public.staff set active = false where user_id = pg_temp.id('b01');
  update public.staff set role = 'server' where user_id = pg_temp.id('d02');
  delete from public.staff where user_id = pg_temp.id('c02');
  -- And a hand-over: promote first, then the old owner may step down.
  update public.staff set role = 'owner' where user_id = pg_temp.id('a02');
  update public.staff set role = 'manager' where user_id = pg_temp.id('a01');
  assert pg_temp.role_of('a01') = 'manager' and pg_temp.role_of('a02') = 'owner',
    'M210.11 · a hand-over (promote, then step down) goes through';
end $$;

-- ══ M210.12 · the ledger's shape: no row says what did not happen ════════════════════════════
do $$
declare e text;
begin
  e := pg_temp.raises($q$insert into public.staff_audit (actor_id, action, target_id, from_role, to_role)
                         values (gen_random_uuid(), 'role_changed', gen_random_uuid(), 'server', 'server')$q$);
  assert e like '%staff_audit_shape%', format('M210.12 · a role change to the same role is refused (%s)', e);
  e := pg_temp.raises($q$insert into public.staff_audit (actor_id, action, target_id, from_role, to_role)
                         values (gen_random_uuid(), 'invited', gen_random_uuid(), 'server', 'manager')$q$);
  assert e like '%staff_audit_shape%', format('M210.12 · an invite with a role before is refused (%s)', e);
  e := pg_temp.raises($q$insert into public.staff_audit (actor_id, action, target_id, from_role, to_role)
                         values (gen_random_uuid(), 'deactivated', gen_random_uuid(), 'server', 'owner')$q$);
  assert e like '%staff_audit_shape%', format('M210.12 · an active flip that moves the role is refused (%s)', e);
  e := pg_temp.raises($q$insert into public.staff_audit (actor_id, source, action, target_id, from_role, to_role)
                         values (null, 'rpc', 'invited', gen_random_uuid(), null, 'server')$q$);
  assert e like '%staff_audit_source%', format('M210.12 · an RPC row must name its caller (%s)', e);
  e := pg_temp.raises($q$insert into public.staff_audit (actor_id, source, action, target_id, from_role, to_role)
                         values (gen_random_uuid(), 'direct', 'invited', gen_random_uuid(), null, 'server')$q$);
  assert e like '%staff_audit_source%', format('M210.12 · a direct row names no caller (%s)', e);
  e := pg_temp.raises($q$insert into public.staff_audit (actor_id, source, action, target_id, from_role, to_role)
                         values (gen_random_uuid(), 'rpc', 'removed', gen_random_uuid(), 'server', null)$q$);
  assert e like '%staff_audit_shape%', format('M210.12 · no RPC removes a member (%s)', e);
  e := pg_temp.raises($q$insert into public.staff_audit (actor_id, source, action, target_id, from_role, to_role)
                         values (null, 'direct', 'removed', gen_random_uuid(), 'server', 'server')$q$);
  assert e like '%staff_audit_shape%', format('M210.12 · a removal has no role after (%s)', e);
  e := pg_temp.raises($q$insert into public.staff_audit (actor_id, source, action, target_id, from_role, to_role)
                         values (null, 'direct', 'invited', gen_random_uuid(), null, null)$q$);
  assert e like '%staff_audit_shape%', format('M210.12 · an invite names the role granted (%s)', e);
end $$;

-- ══ M210.14 · a write that did NOT come through the RPCs is recorded too — once, with no actor ══
-- (after every RPC case above, in the same transaction: the RPCs' mark must not outlive their write)
do $$
declare j jsonb; n integer;
begin
  -- A direct INSERT (the old app's provision, a hand-run bootstrap) — the fixtures above are some.
  assert pg_temp.direct('c03', 'invited') = 1,
    'M210.14 · a direct insert is recorded as an invite with no actor';
  n := pg_temp.all_audits('c03');
  update public.staff set role = 'manager' where user_id = pg_temp.id('c03');
  assert pg_temp.direct('c03', 'role_changed') = 1
     and exists (select 1 from public.staff_audit where target_id = pg_temp.id('c03')
                  and source = 'direct' and action = 'role_changed'
                  and from_role = 'server' and to_role = 'manager'),
    'M210.14 · a direct role change is recorded, from and to';
  update public.staff set active = false where user_id = pg_temp.id('c03');
  assert pg_temp.direct('c03', 'deactivated') = 1 and pg_temp.direct('c03', 'reactivated') = 0,
    'M210.14 · a direct deactivation is recorded as one';
  -- One statement changing both writes both, the flip at the new role.
  update public.staff set role = 'server', active = true where user_id = pg_temp.id('c03');
  assert pg_temp.direct('c03', 'role_changed') = 2 and pg_temp.direct('c03', 'reactivated') = 1
     and exists (select 1 from public.staff_audit where target_id = pg_temp.id('c03')
                  and action = 'reactivated' and from_role = 'server' and to_role = 'server'),
    'M210.14 · a direct change of both is recorded as both';
  assert pg_temp.all_audits('c03') = n + 4, 'M210.14 · four direct changes, four rows';
  -- Not a team change: a rename, and an UPDATE naming role/active without changing them.
  update public.staff set display_name = 'M210 Server Renamed' where user_id = pg_temp.id('c03');
  update public.staff set role = role, active = active where user_id = pg_temp.id('c03');
  assert pg_temp.all_audits('c03') = n + 4, 'M210.14 · a rename or an unchanged write records nothing';
  -- An RPC write right after: recorded ONCE, as rpc — and the direct write after IT still recorded.
  j := pg_temp.set_role('a02', 'c03', 'server', 'manager');
  assert j->>'status' = 'ok', format('M210.14 · the RPC write lands (%s)', j);
  assert pg_temp.all_audits('c03') = n + 5 and pg_temp.direct('c03', 'role_changed') = 2,
    'M210.14 · an RPC write is not double-recorded as a direct one';
  update public.staff set role = 'server' where user_id = pg_temp.id('c03');
  assert pg_temp.direct('c03', 'role_changed') = 3,
    'M210.14 · a direct write after an RPC write is still recorded (the mark did not outlive it)';
  -- A direct DELETE — through the auth user's cascade too.
  delete from auth.users where id = pg_temp.id('c03');
  assert pg_temp.direct('c03', 'removed') = 1
     and exists (select 1 from public.staff_audit where target_id = pg_temp.id('c03')
                  and action = 'removed' and from_role = 'server' and to_role is null),
    'M210.14 · a removal is recorded with the role it held';
end $$;

-- ══ M210.13 · managers and owners read the ledger; a server reads none of it ══════════════════
-- (as `authenticated`, with the JWT `auth.uid()` reads — the rls_membership_test.sql idiom)
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000210a02","role":"authenticated"}';
do $$
begin
  assert (select count(*) from public.staff_audit) > 0,
    'M210.13 · an owner reads the ledger';
end $$;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000210e01","role":"authenticated"}';
do $$
begin
  assert (select count(*) from public.staff_audit) = 0,
    'M210.13 · a server reads none of the ledger';
end $$;
-- d01 is a manager switched off (M210.9): `is_staff_at_least` requires `active`, so an offboarded
-- manager whose JWT has not expired yet reads nothing.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000210d01","role":"authenticated"}';
do $$
begin
  assert (select count(*) from public.staff_audit) = 0,
    'M210.13 · a switched-off manager reads none of the ledger';
end $$;
reset role;

rollback;
