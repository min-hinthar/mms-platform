-- 20260621000000_abuse_limits.sql  (M3·P3.4 — abuse limits)
-- Hardens the group-cart + split-tender surface (P3.1–P3.3b) against a hostile client now that the
-- join/mutation/pay paths are live public POSTs. Four things, all DB-enforced so no app path can skip them:
--   1. A GENERIC rate limiter (rate_events + mms_rate_limit) — the count-first / self-GC / reject-without-
--      record window pattern proven by mms_promo_attempt, reused for join (/api/session) + cart mutations.
--   2. A PARTY-SIZE cap on session_members (a sticker is one table) — an advisory-locked trigger so a
--      shared code can't pile unbounded diners onto one cart, atomic under concurrent joins.
--   3. A BACKGROUND session sweeper (mms_sweep_expired_sessions on pg_cron) — closes idle expired
--      sessions so the table_sessions_active_qr_uniq slot stays clean (renewal-on-write + the mint-time
--      sweep already cover the in-use path; this is the missing background backstop the index anticipated).
--   4. (RLS membership negative tests live in supabase/tests/rls_membership_test.sql — proving, not new SQL.)
-- Additive only (new table + new fns + a trigger): safe to apply to live ahead of merge (LEARNINGS #79).

-- ============ 1. generic rate limiter (anti-flood / anti-enumeration) ============
-- One ledger, keyed by (bucket, key): bucket = the limited action ('join' | 'mutate'), key = the verified
-- seat (auth.uid()) so the unit is ONE device. Per-seat (not per-session) is deliberate: a per-session cap
-- would let one hostile member exhaust the budget and DoS their co-diners' shared cart; per-seat bounds the
-- bad actor to themselves. New-seat churn is bounded a layer down by GoTrue's anonymous sign-up rate limit
-- (supabase/config.toml). Ephemeral: the sweeper (below) bounds rows the per-key self-GC never revisits.
create table if not exists public.rate_events (
  id         uuid primary key default gen_random_uuid(),
  bucket     text not null,
  key        text not null,
  created_at timestamptz not null default now()
);
create index if not exists rate_events_bucket_key_time_idx
  on public.rate_events (bucket, key, created_at);
alter table public.rate_events enable row level security;  -- default-deny; service-role only

-- Returns whether THIS attempt is allowed. COUNT FIRST, then record — a key already at the cap is rejected
-- WITHOUT inserting, so the trailing window actually drains (a noisy attacker can't keep a legit diner
-- locked out forever). Self-GCs its own out-of-window rows for the key so the ledger stays bounded per key.
-- Exactly p_max events are allowed per window (the p_max-th passes; the next is rejected). Mirrors
-- mms_promo_attempt — kept as a SEPARATE generic fn (promo's stays narrowly scoped; don't refactor a
-- working money-path fn mid-phase).
create or replace function public.mms_rate_limit(
  p_bucket text, p_key text, p_max integer, p_window_seconds integer
) returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare v_count integer;
begin
  delete from public.rate_events
    where bucket = p_bucket and key = p_key
      and created_at < now() - make_interval(secs => p_window_seconds);
  select count(*) into v_count from public.rate_events e
    where e.bucket = p_bucket and e.key = p_key
      and e.created_at > now() - make_interval(secs => p_window_seconds);
  if v_count >= p_max then return false; end if;  -- at the cap: reject, don't record (let the window drain)
  insert into public.rate_events(bucket, key) values (p_bucket, p_key);
  return true;
end; $$;

-- ============ 2. party-size cap on session_members ============
-- A physical table sticker (or a shared invite code) is ONE table; bound how many members one session can
-- carry so a code can't be used to pile unbounded diners onto one cart (presence/realtime DoS + a way to
-- inflate the shared order). Enforced as a BEFORE INSERT trigger so EVERY insert path is covered, not just
-- /api/session. KEEP THE CAP (12) IN SYNC with MAX_PARTY_SIZE in apps/qr/lib/limits.ts.
create or replace function public.mms_enforce_party_size() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  -- Serialize concurrent joins to the SAME session so the count-then-insert can't overshoot the cap under
  -- a race (mirrors the per-slot advisory lock in mms_set_pickup_slot). Transaction-scoped → released at
  -- commit; the membership insert is a single statement, so it's held only momentarily.
  perform pg_advisory_xact_lock(hashtext('mms_party:' || new.session_id::text));
  select count(*) into v_count from public.session_members where session_id = new.session_id;
  if v_count >= 12 then
    raise exception 'party_full' using errcode = 'P0001';  -- /api/session maps this to a friendly 409
  end if;
  return new;
end; $$;

drop trigger if exists session_members_party_cap on public.session_members;
create trigger session_members_party_cap
  before insert on public.session_members
  for each row execute function public.mms_enforce_party_size();

-- ============ 3. background expired-session sweeper ============
-- Closes idle sessions that hit the hard TTL while still status='active' (no authorized touch renewed them).
-- The mint sweeps ONE squatting code on demand and assertCartMember slides an in-use session forward, but
-- nothing closes a truly-abandoned session in the background → it lingers on the active partial unique
-- index. This is that backstop (the sweep the index comment anticipated). Also bounds the ephemeral ledgers
-- the per-key self-GC never revisits (an abandoned key's last rows). Returns the count of sessions closed.
create or replace function public.mms_sweep_expired_sessions() returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare v_closed integer;
begin
  update public.table_sessions set status = 'closed'
    where status = 'active' and expires_at <= now();
  get diagnostics v_closed = row_count;
  delete from public.rate_events     where created_at  < now() - interval '1 day';
  delete from public.promo_attempts  where attempted_at < now() - interval '1 day';
  return v_closed;
end; $$;

-- Schedule every 15 min via pg_cron. Guarded: the Supabase live project has pg_cron installed, but a local
-- CI stack (migrations-check) may not — without the guard `cron.schedule` would fail the job. The function
-- works whether or not it's scheduled (callable manually / by a future edge cron), so skipping the schedule
-- on a stack without pg_cron is harmless. cron.schedule upserts by jobname → idempotent on re-apply.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('mms-sweep-expired-sessions', '*/15 * * * *',
      'select public.mms_sweep_expired_sessions();');
  end if;
exception when others then
  raise notice 'pg_cron schedule skipped (extension unavailable here): %', sqlerrm;
end $$;

-- ============ EXECUTE / SELECT lockdown (advisors 0028/0029 + 0026) ============
-- Postgres grants EXECUTE on new fns to PUBLIC and Supabase also grants anon+authenticated — so locking a
-- SECURITY DEFINER fn needs all three revoked (LEARNINGS #58, verified live). All three are service-role
-- only — no client calls them via /rest/v1/rpc. (mms_enforce_party_size is a trigger fn: revoking EXECUTE
-- doesn't affect trigger firing, which runs as the function owner; revoke anyway so it's not RPC-reachable.)
revoke all on function public.mms_rate_limit(text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.mms_enforce_party_size()                      from public, anon, authenticated;
revoke all on function public.mms_sweep_expired_sessions()                  from public, anon, authenticated;
grant execute on function public.mms_rate_limit(text, text, integer, integer) to service_role;
grant execute on function public.mms_sweep_expired_sessions()                 to service_role;

-- rate_events: RLS on + revoke the default anon/authenticated SELECT (clears pg_graphql discoverability too,
-- advisor 0026) — service-role only, matching the promo_attempts/promo_redemptions lockdown.
revoke select on public.rate_events from anon, authenticated;

-- ============ make the session-scoped `authenticated` SELECT grant EXPLICIT (portability) ============
-- Diners are `authenticated` (anonymous-auth) and read their own rows via RLS (`is_member`); the policies
-- are `to authenticated`, so the role needs base-table SELECT (RLS then gates ROWS, not the privilege).
-- The hosted project has this grant (Supabase's default privileges apply it on table creation), but a
-- FRESH local stack / new env doesn't reproduce it reliably — so the RLS membership tests (and a fresh
-- deploy's real diner reads) hit a bare "permission denied" the live project never shows. Grant it
-- explicitly so the schema is self-contained and CI's local stack matches live. Idempotent; `anon` stays
-- revoked (the lockdown intent). No types impact (grants don't change generated types).
grant select on
  public.table_sessions, public.session_members,
  public.qr_carts, public.qr_cart_items, public.qr_cart_shares,
  public.qr_orders, public.qr_order_items
  to authenticated;
