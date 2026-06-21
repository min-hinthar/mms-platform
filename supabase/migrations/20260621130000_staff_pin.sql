-- 20260621130000_staff_pin.sql
-- S1.1b — Staff PIN primitive (ORDER-MODEL.md: "treat the PIN as sudo on the existing role model,
-- not a new subsystem: per-person, verified server-side, rate-limited with lockout, rotatable").
-- The PIN is a FAST-PATH on a shared floor tablet, NOT a new identity: a staff member already signs
-- in for real (S1.1a magic-link / OAuth / OTP), then sets a PIN so they can re-authorize quickly on
-- the shared device without a full email round-trip. The verify-with-lockout function here is the
-- SAME primitive S2's manager step-up (cooked-item void / refund) reuses — so it lives at the DB,
-- atomic, where no app path can skip the lockout.
--
-- Secret isolation: the PIN hash lives in its OWN service-role-only table, NOT a column on `staff`.
-- `staff` is RLS-readable by self/owner (staff_read_self) and `authenticated` holds table SELECT, so a
-- pin_hash column would be reachable by a client `select pin_hash`. A separate default-deny table keeps
-- the hash off every client read surface entirely (the rate_events / promo_attempts secret-table pattern).
-- Additive only (new table + new fns): safe to apply to live ahead of merge (LEARNINGS #79).

-- pgcrypto provides bcrypt (crypt / gen_salt) — a deliberately slow hash so a leaked table can't be
-- brute-forced offline at PIN entropy. Supabase ships it in the `extensions` schema; idempotent here so
-- a fresh local CI stack enables it too. With search_path='' the fns below qualify it as extensions.crypt.
create extension if not exists pgcrypto with schema extensions;

-- ============ staff_pins (the secret; service-role only) ============
-- One row per staff member who has set a PIN. Keyed by the staff ROW pk (staff.user_id) — the server
-- resolves the caller to their staff row (by uid OR the verified email allowlist, mirroring is_staff)
-- and passes that id, so a Google/magic-link session whose uid differs from the provisioned row still
-- lands on the right PIN. The lockout counters live here so an attacker can't reset them by any client path.
create table public.staff_pins (
  staff_id        uuid primary key references public.staff(user_id) on delete cascade,
  pin_hash        text not null,
  set_at          timestamptz not null default now(),
  -- Consecutive wrong attempts since the last success / lockout; drives the lockout below.
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  -- When set and in the future, verification is refused until it passes (then attempts reset on next try).
  locked_until    timestamptz,
  updated_at      timestamptz not null default now()
);
alter table public.staff_pins enable row level security;  -- default-deny: NO policies → no client read/write

-- ============ set / rotate the PIN ============
-- Upsert: the same fn sets a first PIN or rotates an existing one (rotatable, per the standard) and
-- always clears any lockout. Format is bounded HERE too (4–8 digits) — the Zod .regex at the action is
-- the first gate, this is the DB backstop (the project's "Zod + DB check" rule) so no path stores a
-- weak/oversized secret. Called by the staff member for THEMSELVES (the action passes their resolved id).
create or replace function public.mms_staff_set_pin(p_staff_id uuid, p_pin text)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if p_pin !~ '^\d{4,8}$' then
    raise exception 'pin_format' using errcode = 'P0001';  -- the action maps this to friendly copy
  end if;
  insert into public.staff_pins (staff_id, pin_hash, set_at, failed_attempts, locked_until, updated_at)
  values (p_staff_id, extensions.crypt(p_pin, extensions.gen_salt('bf', 10)), now(), 0, null, now())
  on conflict (staff_id) do update
    set pin_hash = excluded.pin_hash, set_at = now(),
        failed_attempts = 0, locked_until = null, updated_at = now();
end; $$;

-- ============ clear the PIN ============
-- Remove the PIN entirely (the staff member turns the fast-path off; or, later, an owner resets it).
-- Idempotent: deleting a non-existent row is a no-op.
create or replace function public.mms_staff_clear_pin(p_staff_id uuid)
returns void language sql volatile security definer set search_path = '' as $$
  delete from public.staff_pins where staff_id = p_staff_id;
$$;

-- ============ verify the PIN (atomic, rate-limited with lockout) ============
-- The load-bearing primitive: returns one of ('ok' | 'wrong' | 'locked' | 'no_pin') plus the remaining
-- attempts (on 'wrong') / the lock expiry (on 'locked'). Atomic under concurrent attempts via an
-- advisory xact lock keyed by the staff id, so the counter can't be raced past the cap (mirrors
-- mms_set_pickup_slot / the party-cap trigger). After 5 consecutive misses the account locks for 15 min;
-- an EXPIRED lock grants a fresh budget (a lapsed lockout shouldn't re-lock on the first new miss). On a
-- correct PIN the counters reset. KEEP the 5 / 15-min IN SYNC with apps/qr/lib/staff-pin.ts.
create or replace function public.mms_staff_verify_pin(p_staff_id uuid, p_pin text)
returns table (status text, attempts_remaining integer, locked_until timestamptz)
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_row      public.staff_pins;
  v_base     integer;
  v_attempts integer;
  v_max      constant integer  := 5;
  v_lockout  constant interval := interval '15 minutes';
begin
  perform pg_advisory_xact_lock(hashtext('mms_staff_pin:' || p_staff_id::text));

  select * into v_row from public.staff_pins where staff_id = p_staff_id;
  if not found then
    return query select 'no_pin'::text, null::integer, null::timestamptz;
    return;
  end if;

  -- Active lockout still in force → refuse without touching the hash (don't leak timing on a locked acct).
  if v_row.locked_until is not null and v_row.locked_until > now() then
    return query select 'locked'::text, 0, v_row.locked_until;
    return;
  end if;

  -- A lapsed lockout resets the attempt budget for this evaluation (fresh 5 attempts after the wait).
  v_base := case when v_row.locked_until is not null then 0 else v_row.failed_attempts end;

  if v_row.pin_hash = extensions.crypt(p_pin, v_row.pin_hash) then
    update public.staff_pins
      set failed_attempts = 0, locked_until = null, updated_at = now()
      where staff_id = p_staff_id;
    return query select 'ok'::text, null::integer, null::timestamptz;
    return;
  end if;

  v_attempts := v_base + 1;
  if v_attempts >= v_max then
    update public.staff_pins
      set failed_attempts = v_attempts, locked_until = now() + v_lockout, updated_at = now()
      where staff_id = p_staff_id;
    return query select 'locked'::text, 0, (now() + v_lockout);
  else
    update public.staff_pins
      set failed_attempts = v_attempts, locked_until = null, updated_at = now()
      where staff_id = p_staff_id;
    return query select 'wrong'::text, (v_max - v_attempts), null::timestamptz;
  end if;
end; $$;

-- ============ EXECUTE / SELECT lockdown (advisors 0026/0028/0029; LEARNINGS #58) ============
-- All three are SECURITY DEFINER and called ONLY by the server actions over the service-role client —
-- no client hits /rest/v1/rpc for them. Postgres grants EXECUTE to PUBLIC and Supabase also grants
-- anon+authenticated by name, so lock all three down then grant only service_role.
revoke all on function public.mms_staff_set_pin(uuid, text)    from public, anon, authenticated;
revoke all on function public.mms_staff_clear_pin(uuid)        from public, anon, authenticated;
revoke all on function public.mms_staff_verify_pin(uuid, text) from public, anon, authenticated;
grant execute on function public.mms_staff_set_pin(uuid, text)    to service_role;
grant execute on function public.mms_staff_clear_pin(uuid)        to service_role;
grant execute on function public.mms_staff_verify_pin(uuid, text) to service_role;

-- staff_pins is the secret store: RLS-on + revoke the default anon/authenticated SELECT so neither the
-- hash nor the lockout state is ever client-reachable (clears pg_graphql discoverability too, advisor 0026).
revoke all on public.staff_pins from anon, authenticated;
