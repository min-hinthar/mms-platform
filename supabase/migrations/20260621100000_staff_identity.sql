-- 20260621100000_staff_identity.sql
-- S1.1a — Staff identity, roles, and RLS (the foundation of the staff/floor layer, ORDER-MODEL.md).
-- Diners are anonymous-auth (authorized by is_member); STAFF are REAL accounts (magic-link / email-
-- OTP) with a role (server < manager < owner) and a stable auth.uid() — the per-person identity the
-- S2 two-party void audit needs. A staff member may read ANY active table session (the floor view,
-- S1.2); diners still see only their own. Writes stay service-role Server Actions (decision #3) —
-- this adds the READ surface + the is_staff() authority those actions check. PIN step-up is S1.1b.

-- ============ staff (real, non-anonymous accounts; provisioned by an owner) ============
create table staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('server','manager','owner')),
  display_name text not null check (length(display_name) between 1 and 80),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============ RLS helpers (mirror is_member: SECURITY DEFINER breaks RLS recursion; search_path
--             pinned; auth.uid() wrapped in (select …) so it's evaluated once per query, advisor 0003) =====
-- is_staff(): the caller is an ACTIVE staff member (any role). The staff row IS the authority — an
-- anonymous diner has an auth.uid() but never a staff row, so it's excluded for free.
create function is_staff() returns boolean
  language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.staff s
    where s.user_id = (select auth.uid()) and s.active
  );
$$;

-- is_staff_at_least(min_role): role-floor check for step-up gating (owner ≥ manager ≥ server).
-- Unknown min_role ranks 99 → never satisfied (fail-closed).
create function is_staff_at_least(min_role text) returns boolean
  language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.staff s
    where s.user_id = (select auth.uid()) and s.active
      and (case s.role   when 'owner' then 3 when 'manager' then 2 when 'server' then 1 else 0 end)
       >= (case min_role when 'owner' then 3 when 'manager' then 2 when 'server' then 1 else 99 end)
  );
$$;

-- ============ RLS on staff ============
alter table staff enable row level security;
-- A staff member reads their OWN row (to render the role-gated console); an owner reads ALL (the Team
-- view). ONE permissive policy per role/action (advisor 0006). Writes are service-role only
-- (provisionStaff Server Action, owner-gated) — no client INSERT/UPDATE/DELETE policy (default-deny).
create policy staff_read_self on staff for select to authenticated
  using (user_id = (select auth.uid()) or public.is_staff_at_least('owner'));

-- ============ extend session-scoped reads: a staff member may read EVERY active table's rows ========
-- Fold `or public.is_staff()` INTO each existing member policy (ALTER, not a 2nd policy) so we keep
-- ONE permissive policy per role/action (advisor 0006 multiple_permissive_policies). Purely additive:
-- is_member is unchanged, so a diner's access is provably unaffected; staff get a parallel grant in
-- the same expression. is_staff() is false for everyone until an owner provisions the first staff row.
alter policy sess_read     on table_sessions using (is_member(id)          or public.is_staff());
alter policy mem_read      on session_members using (is_member(session_id) or public.is_staff());
alter policy qr_cart_read  on qr_carts        using (is_member(session_id) or public.is_staff());
alter policy qr_citem_read on qr_cart_items   using (
  exists (select 1 from qr_carts c where c.id = qr_cart_items.cart_id and is_member(c.session_id))
  or public.is_staff());
alter policy qr_order_read on qr_orders       using (is_member(session_id) or public.is_staff());
alter policy qr_oitem_read on qr_order_items  using (
  exists (select 1 from qr_orders o where o.id = qr_order_items.order_id and is_member(o.session_id))
  or public.is_staff());

-- ============ EXECUTE / SELECT lockdown (advisors 0026/0028/0029) ============
-- is_staff/is_staff_at_least are SECURITY DEFINER RLS helpers — callable by `authenticated` (policy
-- evaluation needs it) but not `anon`/public. Same accepted exception as is_member/is_host.
-- NB: Supabase's default privileges grant EXECUTE to `anon` AND `authenticated` BY NAME on every new
-- function, so `from public` alone leaves the anon grant intact — revoke from anon explicitly (the
-- init migration revokes is_member/is_host from anon for exactly this reason).
revoke all on function public.is_staff()                 from public, anon;
revoke all on function public.is_staff_at_least(text)    from public, anon;
grant execute on function public.is_staff()              to authenticated;
grant execute on function public.is_staff_at_least(text) to authenticated;
-- anon (truly unauthenticated) shouldn't discover the staff roster; RLS already gates the rows.
-- `authenticated` KEEPS RLS-gated SELECT ON PURPOSE (same posture as the session-scoped tables): the
-- staff_read_self policy returns 0 rows to a non-owner (incl. an anon diner, who is `authenticated`),
-- so there's no leak — and a staff member MUST keep SELECT to read their own row. Do NOT revoke SELECT
-- from `authenticated` here or owner/self reads break. (Advisor 0027 on `staff` is expected, like the
-- other QR tables.)
revoke select on public.staff from anon;
