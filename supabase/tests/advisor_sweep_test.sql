-- supabase/tests/advisor_sweep_test.sql  (2026-08-22 connector sweep)
--
-- Guards `20260824000000_advisor_sweep.sql`.
--
-- The first draft of this file tried to assert the owner-read policies' SEMANTICS — impersonate a
-- diner, expect to see exactly your own row. It could not be written: `authenticated` has no SELECT
-- grant on either table (`revoke all … from anon, authenticated` in the M4 migration), so the probe
-- died on `permission denied for table mms_profiles` before RLS was ever consulted. That failure is
-- the useful fact: **both policies are unreachable**, every read goes through the service role, and
-- the thing actually protecting these tables is the ABSENCE OF A GRANT, not the policy.
--
-- So this file guards what genuinely holds:
--   1. no client role can reach `mms_profiles` / `mms_rewards` at all — the real protection, and the
--      regression that would matter (a stray `grant select … to authenticated` would expose every
--      profile row the policy's `using` clause failed to cover);
--   2. BOTH policies are still present AND in the InitPlan-hoisted form, so they are correct on the
--      day a grant IS added and the two advisories stay silent. Asserted as a positive count of
--      correct policies — counting offenders instead passes vacuously when a policy is dropped.
--
-- A third case (GraphQL usage revoked) was written and then DELETED — see the note at the bottom;
-- no migration can satisfy it.
--
-- Run against any QR DB (rolls back — leaves NO data behind):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/advisor_sweep_test.sql
--
-- ⚠️ `set local plpgsql.check_asserts = on` is NOT optional — with the GUC off every ASSERT compiles
-- out and the file exits 0 having proved nothing.
--
-- ⚠️ Per LEARNINGS #51, ASSERT aborts the whole block on the FIRST failure, so one red-then-green run
-- proves only case 1. Both cases were induced separately against production, rolled back: case 1
-- reported `a client role gained SELECT on a service-role-only table: mms_profiles(authenticated)`
-- after an induced grant, and case 2 reported `expected 2 hoisted owner-read
-- policies, found 0` against the pre-migration schema. Neither is green by default.

begin;
set local plpgsql.check_asserts = on;

-- ── 1. The real protection: these tables are service-role only ───────────────────────────────────
do $$
declare leaked text;
begin
  select string_agg(format('%s(%s)', c.relname, r.rolname), ', ')
    into leaked
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join (values ('anon'), ('authenticated')) as r(rolname)
  where n.nspname = 'public'
    and c.relname in ('mms_profiles', 'mms_rewards')
    and has_table_privilege(r.rolname, c.oid, 'SELECT');

  -- `mms_profiles` holds PII (email, name). If a grant ever appears, the owner-read policy becomes
  -- load-bearing for the first time — and it has never once been exercised.
  assert leaked is null,
    format('a client role gained SELECT on a service-role-only table: %s', leaked);
end $$;

-- ── 2. The policies stay in the InitPlan-hoisted form ────────────────────────────────────────────
do $$
declare hoisted int;
begin
  -- Count the policies that are PRESENT and correct, not the ones that are wrong. Counting
  -- offenders passes vacuously when there are no rows to offend: drop either policy, or recreate it
  -- with no USING clause (`qual` IS NULL, and NULL fails a NOT ILIKE), and the offender count is
  -- still 0 while the guarantee this case advertises — both policies retained, both hoisted — is
  -- broken. Codex round 1 on #223.
  select count(*) into hoisted
  from pg_policies
  where schemaname = 'public'
    and policyname in ('mms_profiles_owner_read', 'mms_rewards_owner_read')
    and qual ilike '%( SELECT auth.uid()%';

  assert hoisted = 2,
    format('expected 2 hoisted owner-read policies, found %s (dropped, un-qualified, or regressed to a per-row auth.uid())', hoisted);
end $$;

-- ── (no GraphQL case) ───────────────────────────────────────────────────────────────────────────
--
-- A third case asserted that `anon`/`authenticated` had lost USAGE on `graphql_public`. It stays
-- deleted rather than skipped, because the migration cannot deliver it: that grant is owned by
-- `supabase_admin` and REVOKE from `postgres` is a silent no-op (see the migration header). Keeping
-- a red case for something no migration can satisfy would just train the next person to ignore it;
-- keeping a green one would require weakening it into a lie. M112 tracks the platform-side fix.

rollback;
