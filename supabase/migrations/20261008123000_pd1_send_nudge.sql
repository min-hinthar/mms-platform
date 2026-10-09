-- 20261008123000_pd1_send_nudge.sql — PD1 "Let Aye know": the guest's nudge is a DURABLE STAMP on
-- the cart, cleared by the Send (PATH_DESIGN_2026-10-07 moment 1; Codex round 3 on the specs).
--
-- ## Why a stamp, not presence
-- The first design rode the table's realtime presence channel: a `waiting` flag on the guest's own
-- presence entry. Presence dies the moment the guest locks their phone (`useGroupCart` removes the
-- channel on unmount, lib/realtime.ts), and a face-down phone is exactly the case the nudge exists
-- for — on both sides: the host's phone is face-down too, and must find the line waiting when it
-- wakes. So the nudge is two columns on the cart, written by a member-authorized server action and
-- read by every view of the cart (the host's /cart line and /menu bar; the guest's confirmation).
--
-- ## The guard lives IN the statement
-- `mms_nudge_host(p_cart_id, p_seat)` writes the stamp in ONE UPDATE whose WHERE restates every
-- rule: the cart is open; the session is active and has a host; the nudger is a MEMBER of that
-- session and is NOT the host (a host nudging themselves is a stamp that names nobody's wait);
-- and at most once a minute (a second tap inside the minute is answered `recent` with the standing
-- stamp — idempotent, so the guest's line still shows, and no tablemate can hammer the host's phone
-- with a fresh timestamp every second). `.update()` reports success on zero rows (CLAUDE.md, W17),
-- so the function returns the row count's verdict and, on a miss, a read-only diagnosis that never
-- fabricates a cause it did not establish (M116): `closed`, `no_host`, `is_host`, `not_member`,
-- `recent`, or `unknown`.
--
-- ## The Send clears it in the SAME statement as the fire
-- `mms_fire_cart` is restated whole below with a data-modifying CTE: the lines' draft→fired UPDATE
-- and the cart's stamp clear are one statement, so there is no instant at which the dishes are fired
-- and the host's phone still reads "Thiri is waiting on this send". A fire that moves NO line
-- (nothing draft) clears nothing — the wait it names is still real. Same signature, same return
-- shape (`fired`, `batch`, `fire_deadline`), same grants; `create or replace` keeps the privileges
-- and the revoke/grant below re-asserts them. The staff Send (`staffFireCart`, lib/staff-send.ts)
-- calls this same function, so the console's Send answers the nudge too (m1: "our staff can send
-- it too" — and the line leaves the host's phone when they do).
--
-- ## Applying to prod (the QR history is divergent — CLAUDE.md, M125)
-- On the OWNER's go (OWNER_RULINGS_2026-10-07 #5), ONE file at a time with the Supabase MCP
-- `apply_migration`, after confirming the MCP targets `fasnpdhtvqtzjlvruqcu`; then verify: the two
-- columns in `information_schema.columns`; `mms_nudge_host(uuid, uuid)` in pg_proc with
-- `has_function_privilege('service_role', …, 'execute')` true and false for `anon` /
-- `authenticated`; `mms_fire_cart(uuid)`'s body md5 against this file's. Never `db push`, never the
-- SQL editor.
--
-- Guarded + idempotent: every statement re-applies cleanly.

-- ── 1 · the stamp: who is waiting, and since when ───────────────────────────────────────────────
alter table public.qr_carts add column if not exists send_nudge_seat uuid;
alter table public.qr_carts add column if not exists send_nudge_at timestamptz;
comment on column public.qr_carts.send_nudge_seat is
  'PD1 — the seat (auth.uid) of the guest who tapped "Let {host} know"; cleared by mms_fire_cart in the same statement as the fire.';
comment on column public.qr_carts.send_nudge_at is
  'PD1 — when that guest tapped; a second tap inside a minute is refused (recent). Null = nobody waiting.';

-- ── 2 · the nudge, status-guarded IN the statement ──────────────────────────────────────────────
create or replace function public.mms_nudge_host(p_cart_id uuid, p_seat uuid)
  returns table(ok boolean, reason text, nudged_at timestamptz)
  language plpgsql set search_path = '' as $$
declare
  n integer;
  v_at timestamptz;
  v_status text; v_sess_status text; v_host uuid; v_prev timestamptz; v_member boolean;
begin
  update public.qr_carts c
    set send_nudge_seat = p_seat, send_nudge_at = now()
    from public.table_sessions s
    where c.id = p_cart_id
      and s.id = c.session_id
      and c.status = 'open'
      and s.status = 'active'
      and s.host_seat is not null
      and s.host_seat <> p_seat
      and exists (select 1 from public.session_members m
                   where m.session_id = s.id and m.seat_id = p_seat)
      and (c.send_nudge_at is null or c.send_nudge_at < now() - interval '1 minute')
    returning c.send_nudge_at into v_at;
  get diagnostics n = row_count;
  if n = 1 then
    return query select true, 'ok'::text, v_at; return;
  end if;
  -- Zero rows: say which guard refused, from a read — never a guess.
  select c.status, s.status, s.host_seat, c.send_nudge_at,
         exists (select 1 from public.session_members m where m.session_id = s.id and m.seat_id = p_seat)
    into v_status, v_sess_status, v_host, v_prev, v_member
    from public.qr_carts c join public.table_sessions s on s.id = c.session_id
    where c.id = p_cart_id;
  if not found then return query select false, 'no_cart'::text, null::timestamptz; return; end if;
  if v_status <> 'open' or v_sess_status <> 'active' then
    return query select false, 'closed'::text, null::timestamptz; return;
  end if;
  if not v_member then return query select false, 'not_member'::text, null::timestamptz; return; end if;
  if v_host is null then return query select false, 'no_host'::text, null::timestamptz; return; end if;
  if v_host = p_seat then return query select false, 'is_host'::text, null::timestamptz; return; end if;
  if v_prev is not null and v_prev >= now() - interval '1 minute' then
    -- The stamp stands (idempotent): the caller keeps showing the guest their line.
    return query select false, 'recent'::text, v_prev; return;
  end if;
  return query select false, 'unknown'::text, null::timestamptz;
end $$;
revoke all on function public.mms_nudge_host(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mms_nudge_host(uuid, uuid) to service_role;

-- ── 3 · the Send clears the stamp in the same statement as the fire ─────────────────────────────
-- Restated WHOLE from 20260624030000_s4_money_remediation.sql:89-108 (the live definition): the
-- same single atomic draft→fired UPDATE, dine-in only, `v_deadline` captured ONCE so `fire_at` equals
-- the returned deadline exactly — now the first arm of a CTE whose second arm clears the nudge on the
-- cart whenever at least one line fired. Same signature and return shape; `create or replace`.
create or replace function public.mms_fire_cart(p_cart_id uuid)
  returns table(fired integer, batch uuid, fire_deadline timestamptz)
  language plpgsql set search_path = '' as $$
declare n integer; v_batch uuid := gen_random_uuid(); v_deadline timestamptz := now() + interval '10 seconds';
begin
  with fired_lines as (
    update public.qr_cart_items ci
      set state = 'fired', fire_at = v_deadline, fire_batch = v_batch
      from public.qr_carts c
      join public.table_sessions s on s.id = c.session_id
      where ci.cart_id = p_cart_id
        and c.id = ci.cart_id
        and c.status = 'open'
        and s.mode = 'dinein'
        and ci.state = 'draft'
        and ci.fulfillment = 'dinein'   -- S4.2: to-go waits for checkout/make-it-now; grocery never fires
      returning ci.id
  ), cleared as (
    -- PD1 — the wait the stamp names is answered by THIS fire: cleared in the same statement, and
    -- only when a line actually moved (a Send with nothing draft leaves a real wait standing).
    update public.qr_carts c
      set send_nudge_seat = null, send_nudge_at = null
      where c.id = p_cart_id
        and exists (select 1 from fired_lines)
      returning c.id
  )
  select count(*) into n from fired_lines;
  return query select n, v_batch, v_deadline;   -- the caller ignores batch/deadline when n=0 (nothing sent)
end $$;
revoke all on function public.mms_fire_cart(uuid) from public, anon, authenticated;
grant execute on function public.mms_fire_cart(uuid) to service_role;
