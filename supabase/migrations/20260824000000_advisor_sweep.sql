-- Advisor sweep (2026-08-22) — from a full Supabase/Stripe/Vercel connector check.
--
-- 91 security advisories were triaged; the overwhelming majority are this app's design working as
-- intended and are deliberately NOT touched here: 28 anonymous-sign-in notices (diners ARE
-- anonymous), 21 `rls_enabled_no_policy` (RLS on with no policy = deny-all, service-role only — the
-- safe shape, not a gap), 7 SECURITY DEFINER RLS helpers (`is_member`/`is_host`/`is_staff…`, all
-- `anon_exec=false` with `search_path=''`, and RLS cannot function unless `authenticated` may
-- execute them), 2 further definers that are TRIGGER functions and so not callable at all —
-- verified against production: `ERROR: trigger functions can only be called as triggers` — and 3
-- mutable-`search_path` functions inside the vendor-managed `stripe` sync schema, where our edit
-- would be overwritten on its next sync.
--
-- Every statement below was executed against the LIVE schema inside a rolled-back transaction
-- before being committed here, and the rollback was confirmed to have left no trace.

-- ── 1. The two `auth_rls_initplan` warnings — pre-emptive, NOT a live perf win ───────────────────
--
-- Read this before assuming it does something at runtime: it does not, today.
--
-- The advisory is real in form — a bare `auth.uid()` in a USING clause is re-evaluated per row,
-- where a scalar subquery lets the planner hoist it into a once-per-statement InitPlan. But both
-- policies are currently UNREACHABLE. `20260623060000_m4_rewards.sql` does
-- `revoke all on … from anon, authenticated` on both tables, and a policy can only ever NARROW
-- access a GRANT already permits. Measured on production:
--
--     mms_profiles   anon_select=false  auth_select=false  svc_select=true
--     mms_rewards    anon_select=false  auth_select=false  svc_select=true
--
-- So these policies never execute; every read goes through the service role, which bypasses RLS
-- entirely. The rewrite is therefore hygiene — it silences two advisories and leaves the policies
-- in the correct shape for the day a grant is added — and it is explicitly NOT a performance fix.
-- Anyone citing this migration as one is repeating a claim the schema does not support.
--
-- Drop-then-create because Postgres has no `create or replace policy`; both run inside the
-- migration's transaction, so there is no window where the table sits unprotected.

drop policy if exists mms_profiles_owner_read on public.mms_profiles;
create policy mms_profiles_owner_read on public.mms_profiles for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists mms_rewards_owner_read on public.mms_rewards;
create policy mms_rewards_owner_read on public.mms_rewards for select to authenticated
  using ((select auth.uid()) = user_id);

-- ── 2. The pg_graphql exposure — NOT fixable here, and the attempt is instructive ───────────────
--
-- `pg_graphql` is installed and `anon`/`authenticated` hold USAGE on `graphql_public` (and on
-- `graphql`), so every table PostgREST can reach is reachable over GraphQL too — 29 of the 91
-- advisories from that one grant. Not a data hole (GraphQL evaluates the same RLS), but an
-- unnecessary second query surface this codebase never opens: `grep -rn graphql` across `apps/`,
-- `packages/` and `docs/` returns nothing.
--
-- The obvious hunk — `revoke usage on schema graphql_public from anon, authenticated` — was written,
-- and it is a SILENT NO-OP. The ACL is `anon=U/supabase_admin`: the grant was issued BY
-- `supabase_admin`, and Postgres REVOKE only removes grants made by the revoking role. `postgres`
-- (the migration role) is not a member of `supabase_admin` — `pg_has_role(...,'MEMBER') = false` —
-- so the statement succeeds, changes nothing, and reports no error. It was caught only because the
-- companion test asserted the OUTCOME rather than trusting the statement.
--
-- Disabling the GraphQL API on Supabase is a platform action (dashboard/extension), not a user
-- migration. Tracked as M112 in `docs/OPEN-ITEMS.md`. Deliberately not attempted here: a migration
-- that appears to close a surface and does not is worse than one that never claimed to.
