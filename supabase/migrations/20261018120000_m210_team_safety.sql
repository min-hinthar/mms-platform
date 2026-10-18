-- 20261018120000_m210_team_safety.sql — M210 · M208 · M205: the team-safety migration.
--
-- ⚠️ PROD: the third of the four files ruling #5 approved (OWNER_RULINGS_2026-10-07 #5 — "the
-- team-safety file (M210 · M208 · M205)"). Applied ONE FILE AT A TIME through the Supabase MCP
-- `apply_migration`, after its PR is green, at a quiet time the OWNER names — never `db push` (M125).
-- BEFORE the apply: `select count(*) from public.staff where role = 'owner' and active` must be ≥ 1
-- (the trigger below refuses a write that ends the last owner; a database with none already is left
-- as it is, but nothing can then be fixed through the app). Verify after: ONE definition each of
-- `public.mms_staff_set(uuid, uuid, text, text, boolean)`, `public.mms_staff_provision(uuid, uuid,
-- text, text, text)` and `public.mms_staff_keep_an_owner()`; for the first two
-- `has_function_privilege('service_role', …, 'execute')` true and anon / authenticated false; the
-- third revoked from anon / authenticated; the trigger `staff_keep_an_owner` on `public.staff`
-- (AFTER UPDATE OR DELETE, FOR EACH ROW — `pg_trigger.tgtype = 25`); the table `public.staff_audit`
-- with RLS on, the one SELECT policy `staff_audit_read` (to authenticated, `is_staff_at_least
-- ('manager')`), and no INSERT / UPDATE / DELETE privilege for anon or authenticated. Deploy order:
-- migration first, app second — the old app's direct `.update()`s keep working (the trigger refuses
-- only a write that would leave no active owner), and until the new app ships nothing writes the
-- audit table.
--
-- ## THE THREE DEFECTS
--   M210 — two owners demoting (or deactivating) each other at once could leave the restaurant with
--          NO owner. Each request passed its checks while both callers were still owners and wrote a
--          DIFFERENT row, guarded only by that row's own old role, so both landed. The invariant is
--          over the TABLE (at least one active owner), which no per-row guard can express.
--   M208 — the actions decided the CALLER's authority in one statement and wrote in another, several
--          round trips apart (A6's re-read narrowed that to one round trip; it did not close it), so
--          a revocation could land between the two and be unseen.
--   M205 — the only record of an invite, a role change or a deactivation was a best-effort PostHog
--          event, skipped outright when analytics is off.
--
-- ## THE DESIGN — ONE statement decides, under ONE lock
-- `mms_staff_set` (a role change OR an active flip) decides the caller, the target and the write in
-- one transaction, in this order (`mms_staff_provision`, the invite's staff row, takes (2) and the
-- ceiling on the role granted — section 3 says why it needs no (1)):
--   1. the TEAM LOCK — `pg_advisory_xact_lock(hashtext('mms_staff_team'))`, first, before any row.
--      Every team write takes it, so two of them never interleave: the second waits for the first to
--      COMMIT and then decides on what it committed. Taken before the row locks so two calls that
--      lock each other's rows (A demotes B while B demotes A — each the other's target and its own
--      caller) queue instead of deadlocking (verify-team-race.mjs order c).
--   2. the CALLER's row FOR SHARE — the authority, read under a lock. Every team write already
--      waits at (1); the row lock is for any OTHER writer of that row (a hand-run UPDATE, a future
--      path): it waits for the decision to commit, or the decision waits for it and reads its
--      result. FOR SHARE, not FOR KEY SHARE: KEY SHARE is compatible with a non-key UPDATE (a role
--      or `active` change), so it would read the old role past an uncommitted revocation (order d).
--      The caller is active and ranks at least `manager`, else 'not_authorized'. THIS is M208: the
--      decision and the write are one transaction against a row that cannot move under it.
--   3. the TARGET's row FOR UPDATE — the row the write changes, read under the lock the write would
--      take anyway, so the ceiling is decided on the role the UPDATE writes over (order e). The UPDATE
--      therefore carries no role guard of its own: nothing can change the row between the two.
--   4. the decision, each refusal BEFORE any write: 'not_found' · 'self' (the target IS the caller's
--      row; the app's own check, in front, also matches the session's e-mail) · 'changed' (the role the console
--      showed, `p_seen_role`, is not the role now) · 'noop' (already there — no write, no audit
--      row) · 'ceiling' (the caller ranks below the target's CURRENT role or, for a role change, the
--      REQUESTED one — A6's two halves; either alone leaks).
--   5. the write, then ONE `staff_audit` row in the same transaction (M205): it commits with the write
--      or not at all.
--
-- Why that closes M210: an owner can only be demoted or deactivated by ANOTHER active owner (the
-- ceiling, and 'self'), and that caller's row is locked active-owner for the whole transaction, so
-- the table still holds an active owner when it commits. Two cross-demotions serialize at (1); the
-- second re-reads its caller — now a manager — and meets the ceiling: exactly one succeeds
-- (orders a and c). So `mms_staff_set` carries no owner count of its own: on its own path the count
-- cannot reach zero, and a check that cannot fail is decoration.
--
-- ## THE TABLE-LEVEL INVARIANT — `staff_keep_an_owner`, for every OTHER writer
-- An AFTER UPDATE OR DELETE trigger on `staff`, for a row that WAS an active owner and is no longer
-- (demoted, deactivated or deleted — an auth user's cascade included): it takes the same team lock and
-- refuses ('check_violation') if no active owner remains. It is the invariant for writers that do not
-- go through (1)–(5): the old app between the migration and the deploy, a hand-run UPDATE, a future
-- code path. The lock is what makes it hold under concurrency (order f): two direct demotions of the
-- last two owners would each count the other still an owner — neither sees the other's uncommitted
-- write — so the second waits at the lock and then counts again. That recount sees the first's commit
-- because a VOLATILE plpgsql function takes a fresh snapshot per statement in READ COMMITTED, the
-- level every app and RPC write runs at. Under REPEATABLE READ or SERIALIZABLE the recount reads the
-- transaction's snapshot and cannot see the other commit — no writer here runs at either level, and
-- this header says so rather than claiming otherwise.
-- A row the trigger refuses is a statement that fails: the INSERT of the first owner is never
-- touched (the trigger is UPDATE / DELETE only, and only for a row that WAS an active owner), so the
-- bootstrap (`insert into staff … role='owner'`) is unchanged, and a database with no owner at all is
-- left alone except that it cannot lose one it does not have.
--
-- ## `staff_audit` (M205)
-- One row per invite, role change, deactivation and reactivation: who (`actor_id`, the caller's
-- `staff.user_id`), what (`action`), to whom (`target_id`), the role before and after, and when.
-- No foreign key on either id, matching `menu_price_audit` / `menu_availability_audit`: the ledger
-- outlives a deleted staff row, because "who made this person a manager" is the point. RLS on, ONE
-- SELECT policy for managers and owners, and no INSERT / UPDATE / DELETE privilege for any client
-- role: it is written only inside the two functions, as the service role.
--
-- Statuses (`mms_staff_set`): 'ok' | 'noop' | 'not_authorized' | 'not_found' | 'self' | 'changed' |
-- 'ceiling'. (`mms_staff_provision`): 'ok' | 'not_authorized' | 'ceiling' | 'exists'. Each returns
-- jsonb `{status, …}`; a malformed call (a NULL id, an unknown role, neither or both of p_role and
-- p_active) RAISES — it is a bug in the caller, never a verdict about anyone's authority.
--
-- Pinned by supabase/tests/m210_team_safety_test.sql (named in ci.yml) and, for the orders no single
-- session can interleave, scripts/verify-team-race.mjs (`--mutants` replays every rule of this file,
-- the single-session ones against the SQL test). Idempotent: `if not exists` on the table and its
-- indexes, `drop policy if exists` before the policy, `create or replace` on the functions and the
-- trigger (no DROP of a function: the MCP apply path cannot confirm one), grants restated.

-- ── 1. the audit ledger (M205) ───────────────────────────────────────────────────────────────────
create table if not exists public.staff_audit (
  id         uuid primary key default gen_random_uuid(),
  -- `staff.user_id` of the RESOLVED caller row (StaffCaller.staffId) — no FK, see the header.
  actor_id   uuid not null,
  action     text not null
             check (action in ('invited', 'role_changed', 'deactivated', 'reactivated')),
  target_id  uuid not null,
  from_role  text check (from_role in ('server', 'manager', 'owner')),
  to_role    text not null check (to_role in ('server', 'manager', 'owner')),
  created_at timestamptz not null default now(),
  -- The row says what happened and nothing it cannot: an invite has no role before; a role change
  -- moved between two DIFFERENT roles; an active flip records the role it happened at, unchanged.
  constraint staff_audit_shape check (
    (action = 'invited' and from_role is null)
    or (action = 'role_changed' and from_role is not null and from_role <> to_role)
    or (action in ('deactivated', 'reactivated') and from_role = to_role)
  )
);
comment on table public.staff_audit is
  'M205 — one row per team write (invite, role change, deactivation, reactivation), written in the '
  'same transaction as the write by mms_staff_set / mms_staff_provision. Managers and owners read it.';
create index if not exists staff_audit_target_idx on public.staff_audit (target_id, created_at desc);
create index if not exists staff_audit_created_idx on public.staff_audit (created_at desc);

alter table public.staff_audit enable row level security;
drop policy if exists staff_audit_read on public.staff_audit;
create policy staff_audit_read on public.staff_audit
  for select to authenticated using (public.is_staff_at_least('manager'));
-- No insert / update / delete policy, and no such privilege either: with RLS on and no permissive
-- policy a client write is refused anyway, and with no grant it never reaches RLS. Stated so a later
-- reader does not "fix" the omission and open a path to a fictional entry.
revoke all on table public.staff_audit from public, anon, authenticated;
grant select on table public.staff_audit to authenticated;
grant select, insert on table public.staff_audit to service_role;

-- ── 2. a role change or an active flip (M210 · M208 · M205) ─────────────────────────────────────
create or replace function public.mms_staff_set(
  p_caller uuid,
  p_target uuid,
  p_seen_role text,
  p_role text default null,
  p_active boolean default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_caller_role   text;
  v_caller_active boolean;
  v_target_role   text;
  v_target_active boolean;
  v_target_email  text;
  v_caller_rank   integer;
  v_action        text;
begin
  if p_caller is null or p_target is null or p_seen_role is null then
    raise exception 'mms_staff_set: caller, target and the role the console showed are required';
  end if;
  if (p_role is null) = (p_active is null) then
    raise exception 'mms_staff_set: exactly one of p_role or p_active';
  end if;
  if p_role is not null and p_role not in ('server', 'manager', 'owner') then
    raise exception 'mms_staff_set: unknown role %', p_role;
  end if;

  -- (1) the team lock: every team write queues here, before any row lock.
  perform pg_advisory_xact_lock(hashtext('mms_staff_team'));

  -- (2) the caller's authority, under a lock nothing else can write past (M208).
  select s.role, s.active
    into v_caller_role, v_caller_active
    from public.staff s where s.user_id = p_caller
    for share;
  v_caller_rank := case v_caller_role when 'owner' then 3 when 'manager' then 2
                                      when 'server' then 1 else 0 end;
  -- No row reads as NULLs: rank 0, never active — one refusal for gone, off and below the floor.
  if v_caller_active is not true or v_caller_rank < 2 then
    return jsonb_build_object('status', 'not_authorized');
  end if;

  -- (3) the target, under the lock its UPDATE would take.
  select s.role, s.active, lower(s.email)
    into v_target_role, v_target_active, v_target_email
    from public.staff s where s.user_id = p_target
    for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  -- (4) the decision.
  -- By ROW. The e-mail arm the app also checks (a session whose e-mail names another row) cannot
  -- arise here: `staff_email_lower_key` makes an e-mail name at most one row, and that row is the
  -- caller's own only when it IS p_caller. The app keeps its session-aware check in front of this.
  if p_target = p_caller then
    return jsonb_build_object('status', 'self');
  end if;
  if v_target_role <> p_seen_role then
    return jsonb_build_object('status', 'changed', 'role', v_target_role);
  end if;
  if (p_role is not null and p_role = v_target_role)
     or (p_active is not null and p_active = v_target_active) then
    return jsonb_build_object('status', 'noop', 'role', v_target_role, 'active', v_target_active);
  end if;
  if v_caller_rank < (case v_target_role when 'owner' then 3 when 'manager' then 2 else 1 end)
     or (p_role is not null
         and v_caller_rank < (case p_role when 'owner' then 3 when 'manager' then 2 else 1 end)) then
    return jsonb_build_object('status', 'ceiling');
  end if;

  -- (5) the write, and its audit row in the same transaction.
  update public.staff s
     set role = coalesce(p_role, s.role),
         active = coalesce(p_active, s.active),
         updated_at = now()
   where s.user_id = p_target;
  v_action := case when p_role is not null then 'role_changed'
                   when p_active then 'reactivated' else 'deactivated' end;
  insert into public.staff_audit (actor_id, action, target_id, from_role, to_role)
    values (p_caller, v_action, p_target, v_target_role, coalesce(p_role, v_target_role));

  return jsonb_build_object('status', 'ok', 'action', v_action,
                            'from_role', v_target_role, 'to_role', coalesce(p_role, v_target_role),
                            'email', v_target_email);
end $$;
comment on function public.mms_staff_set(uuid, uuid, text, text, boolean) is
  'M210 · M208 · M205 — change one staff member''s role (p_role) or active flag (p_active), deciding '
  'the caller (active, at least manager), the target (not self, still p_seen_role) and the A6 ceiling '
  'under the team lock and both row locks, then writing the change and its staff_audit row together.';
revoke all on function public.mms_staff_set(uuid, uuid, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.mms_staff_set(uuid, uuid, text, text, boolean) to service_role;

-- ── 3. the invite's staff row (M208 · M205) ─────────────────────────────────────────────────────
-- The auth user is created first, by the app (the GoTrue admin API is not SQL); this writes the
-- staff row under the same lock and the same caller rule, so the authority behind the INSERT is
-- decided where the INSERT is. A refusal writes nothing and the app deletes the auth user it made.
create or replace function public.mms_staff_provision(
  p_caller uuid,
  p_user_id uuid,
  p_email text,
  p_role text,
  p_display_name text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_caller_role   text;
  v_caller_active boolean;
  v_caller_rank   integer;
begin
  if p_caller is null or p_user_id is null or p_email is null or p_display_name is null then
    raise exception 'mms_staff_provision: caller, user, email and name are required';
  end if;
  if p_role is null or p_role not in ('server', 'manager', 'owner') then
    raise exception 'mms_staff_provision: unknown role %', p_role;
  end if;

  -- The caller's row FOR SHARE, and no team lock: every revocation of this caller (mms_staff_set's
  -- target FOR UPDATE, a hand-run UPDATE) conflicts with it, so either it commits first and is read
  -- here, or it waits for this insert. This call touches no other existing row, so it cannot close
  -- a lock cycle with mms_staff_set and needs no queue to avoid one (verify-team-race.mjs order h).
  select s.role, s.active into v_caller_role, v_caller_active
    from public.staff s where s.user_id = p_caller
    for share;
  v_caller_rank := case v_caller_role when 'owner' then 3 when 'manager' then 2
                                      when 'server' then 1 else 0 end;
  -- No row reads as NULLs: rank 0, never active — one refusal for gone, off and below the floor.
  if v_caller_active is not true or v_caller_rank < 2 then
    return jsonb_build_object('status', 'not_authorized');
  end if;
  if v_caller_rank < (case p_role when 'owner' then 3 when 'manager' then 2 else 1 end) then
    return jsonb_build_object('status', 'ceiling');
  end if;

  begin
    insert into public.staff (user_id, email, role, display_name)
      values (p_user_id, lower(p_email), p_role, p_display_name);
  exception when unique_violation then
    -- The row (or another row with that e-mail) is already there. Said as one status, never which:
    -- the action answers every create failure with one sentence (S1-audit S7).
    return jsonb_build_object('status', 'exists');
  end;
  insert into public.staff_audit (actor_id, action, target_id, from_role, to_role)
    values (p_caller, 'invited', p_user_id, null, p_role);
  return jsonb_build_object('status', 'ok');
end $$;
comment on function public.mms_staff_provision(uuid, uuid, text, text, text) is
  'M208 · M205 — insert an invited member''s staff row, deciding the caller (active, at least '
  'manager) and the A6 ceiling on the role granted under the team lock, and write its staff_audit row.';
revoke all on function public.mms_staff_provision(uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.mms_staff_provision(uuid, uuid, text, text, text) to service_role;

-- ── 4. the table-level invariant: at least one active owner (M210) ──────────────────────────────
create or replace function public.mms_staff_keep_an_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Still an active owner after the write (a name or e-mail edit, an owner row re-keyed): nothing lost.
  if tg_op = 'UPDATE' and new.role = 'owner' and new.active then
    return null;
  end if;
  -- The same lock every team write takes, so a concurrent loss of another owner is counted after it
  -- commits, never before (the header's ## THE TABLE-LEVEL INVARIANT).
  perform pg_advisory_xact_lock(hashtext('mms_staff_team'));
  if not exists (select 1 from public.staff s where s.role = 'owner' and s.active) then
    raise exception 'staff_keep_an_owner: the restaurant must keep at least one active owner'
      using errcode = 'check_violation';
  end if;
  return null;
end $$;

create or replace trigger staff_keep_an_owner
  after update or delete on public.staff
  for each row
  when (old.role = 'owner' and old.active)
  execute function public.mms_staff_keep_an_owner();

-- A trigger function fires as its owner whatever the grants; revoke anyway so it is not reachable as
-- an RPC (the party cap's lockdown, 20260621000000_abuse_limits.sql; LEARNINGS #58).
revoke all on function public.mms_staff_keep_an_owner() from public, anon, authenticated;
