-- 20260622000000_is_staff_email_verified.sql
-- S1 AUDIT B1 fix — the SQL `is_staff()` email-allowlist branch trusted the raw JWT `email` claim with NO
-- verification, so it diverged from the app guard (`getStaffAuth`, which checks `email_confirmed_at`).
-- RLS/Realtime evaluate `is_staff()` DIRECTLY (bypassing the TS guard), so any session carrying an `email`
-- claim equal to a provisioned staff address read every active table's diner data + the staff roster.
--
-- This replaces the spoofable JWT-claim match with an AUTHORITATIVE check against `auth.users` for the
-- current `auth.uid()`: the email must be (1) CONFIRMED (`email_confirmed_at`), (2) equal to the staff
-- allowlist email, and (3) from a provider-verified OAuth identity — NOT a public email/password signup
-- (`provider = 'email'`), because with email-confirmations OFF GoTrue AUTO-confirms such signups, which
-- would make `email_confirmed_at` meaningless. Provisioned + bootstrapped staff (and OTP/magic-link sign-ins
-- into their pre-created auth user) always match by `s.user_id = auth.uid()`, so this branch only governs the
-- fresh-uid OAuth (Google) case it was added for — they keep working; the spoof path is closed.
--
-- ⚠️ DEFENSE-IN-DEPTH, not the whole story: the BINDING control is live auth CONFIG — disable public
-- email/password signup (staff are admin-provisioned; diners use anonymous sign-in — neither needs public
-- signup) OR turn email confirmations ON, and restrict the Google provider to the workspace domain with
-- automatic cross-provider linking OFF. Without that, a public signup flow can still mint identities; this
-- SQL gate ensures the RLS surface only ever trusts a confirmed, provider-verified email. Additive + idempotent.

-- Authoritative "is the CURRENT session a confirmed, provider-verified identity for this staff email?"
-- SECURITY DEFINER so it can read auth.users (the querying `authenticated` role cannot). Used by both
-- is_staff* and the staff_read_self policy so the rule lives in exactly one place.
create or replace function public.staff_session_email_match(p_email text)
  returns boolean language sql stable security definer set search_path = '' as $$
  select p_email is not null and exists (
    select 1 from auth.users u
    where u.id = (select auth.uid())
      and u.email_confirmed_at is not null
      and lower(u.email) = lower(p_email)
      -- only a provider-verified OAuth identity, never a public email/password signup (auto-confirmed
      -- when confirmations are off → otherwise spoofable). Provisioned/OTP staff match by user_id instead.
      and coalesce(u.raw_app_meta_data ->> 'provider', 'email') <> 'email'
  );
$$;

create or replace function public.is_staff() returns boolean
  language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.staff s
    where s.active and (
      s.user_id = (select auth.uid())
      or public.staff_session_email_match(s.email)
    )
  );
$$;

create or replace function public.is_staff_at_least(min_role text) returns boolean
  language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.staff s
    where s.active
      and ( s.user_id = (select auth.uid())
            or public.staff_session_email_match(s.email) )
      and (case s.role   when 'owner' then 3 when 'manager' then 2 when 'server' then 1 else 0 end)
       >= (case min_role when 'owner' then 3 when 'manager' then 2 when 'server' then 1 else 99 end)
  );
$$;

-- A staff member reads their OWN row (by uid or the verified-email match); an owner reads all.
alter policy staff_read_self on public.staff using (
  user_id = (select auth.uid())
  or public.staff_session_email_match(email)
  or public.is_staff_at_least('owner')
);

-- Lockdown (Supabase grants EXECUTE to anon+authenticated by name on new fns). The helper is called from
-- within RLS evaluated as `authenticated`, so authenticated needs EXECUTE; never anon (a diner is anon).
revoke all on function public.staff_session_email_match(text) from public, anon;
revoke all on function public.is_staff()                       from public, anon;
revoke all on function public.is_staff_at_least(text)          from public, anon;
grant execute on function public.staff_session_email_match(text) to authenticated, service_role;
grant execute on function public.is_staff()                      to authenticated, service_role;
grant execute on function public.is_staff_at_least(text)         to authenticated, service_role;
