-- 20260621120000_staff_oauth_email.sql
-- Staff sign-in gains Google OAuth + magic-link alongside the existing email-OTP code (S1.1 follow-up).
-- With OAuth/magic-link the auth uid is minted at FIRST sign-in, so the staff gate can't rely on a
-- pre-created uid alone. ADDITIVE + non-destructive: `user_id` stays the PK (provisionStaff still
-- pre-creates the auth user, so OTP `shouldCreateUser:false` keeps working), and we add an EMAIL
-- allowlist match — so a Google sign-in that links to the pre-created user matches by `user_id`, and one
-- that mints a fresh uid still resolves to the provisioned row by `email`. Either path → the same role.

alter table staff add column email text;
-- bound at the DB to match the Zod .max(254) (the project's "Zod + column CHECK" rule); NULL allowed.
alter table staff add constraint staff_email_len check (email is null or length(email) <= 254);
-- case-insensitive uniqueness; NULLs allowed (a legacy/dashboard row may match by user_id alone).
create unique index staff_email_lower_key on staff (lower(email));

-- is_staff / is_staff_at_least now match user_id OR the verified email claim (auth.jwt email). An
-- anonymous diner carries no email claim → the email branch is null → no match (correct). auth.* wrapped
-- in (select …) for the initplan; search_path pinned; SECURITY DEFINER (breaks RLS recursion on staff).
create or replace function is_staff() returns boolean
  language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.staff s
    where s.active and (
      s.user_id = (select auth.uid())
      or lower(s.email) = lower(((select auth.jwt()) ->> 'email'))
    )
  );
$$;

create or replace function is_staff_at_least(min_role text) returns boolean
  language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.staff s
    where s.active
      and ( s.user_id = (select auth.uid())
            or lower(s.email) = lower(((select auth.jwt()) ->> 'email')) )
      and (case s.role   when 'owner' then 3 when 'manager' then 2 when 'server' then 1 else 0 end)
       >= (case min_role when 'owner' then 3 when 'manager' then 2 when 'server' then 1 else 99 end)
  );
$$;

-- A staff member reads their OWN row (by uid or email); an owner reads all.
alter policy staff_read_self on staff using (
  user_id = (select auth.uid())
  or lower(email) = lower(((select auth.jwt()) ->> 'email'))
  or public.is_staff_at_least('owner')
);

-- create-or-replace preserves grants, but re-assert the lockdown explicitly (Supabase grants EXECUTE to
-- anon AND authenticated by name on new fns; here we only refresh bodies, but keep this idempotent).
revoke all on function public.is_staff()              from public, anon;
revoke all on function public.is_staff_at_least(text) from public, anon;
grant execute on function public.is_staff()              to authenticated;
grant execute on function public.is_staff_at_least(text) to authenticated;
