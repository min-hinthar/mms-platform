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
-- rule: the cart is open; the session is an active DINE-IN table with a host; the nudger is a
-- MEMBER of that session and is NOT the host (a host nudging themselves is a stamp that names
-- nobody's wait); no payment holds the cart (a fresh pay lock — `CART_LOCK_TTL_MS`, 5 minutes — or
-- a fresh split freeze — `SETTLE_TTL_MS`, 10 minutes: nobody, staff included, can Send under
-- either, so a stamp would name a wait nobody can end); at least one DINE-IN DRAFT is on the cart
-- (the nudge asks for a Send, and only a dine-in draft is something a Send moves — `mms_fire_cart`'s
-- own predicate); and at most once a minute. `.update()` reports success on zero rows (CLAUDE.md,
-- W17), so the function returns the row count's verdict and, on a miss, a read-only diagnosis that
-- never fabricates a cause it did not establish (M116): `closed`, `no_cart`, `not_member`,
-- `no_host`, `is_host`, `paying`, `nothing_to_send`, `recent`, `taken` or `unknown`.
--
-- ## Whose stamp it is
-- Every answer that carries a stamp carries its SEAT (`nudge_seat`) beside its time, and the app
-- takes the seat from here, never from the phone that asked (the blind pass on #335). A second tap
-- inside the minute by the SAME seat is `recent`: the stamp stands, idempotently, and the guest's
-- line keeps showing. A tap inside the minute by ANOTHER seat — a tablemate, or two guests tapping
-- at once (the second waits on the first's cart lock, below, then reads its stamp) — is `taken`:
-- the host already knows the table is waiting, and that guest is told whose nudge it was. Past the
-- minute any member may stamp again.
--
-- ## A stamp is LIVE only while a dish that was waiting when it was written still waits
-- The stamp is cleared by the fire alone, so it outlives a dish taken off, voided or switched to
-- to-go — and a LATER, unrelated dine-in draft would otherwise read it as "Thiri is waiting on this
-- send." with nobody waiting (the last blind pass on #335). The rule, in both places that read it:
-- a stamp is live while at least one DINE-IN DRAFT on the cart was ADDED at or before it
-- (`qr_cart_items.created_at <= send_nudge_at`, both stamped by this database's `now()`). The app's
-- view reports only a live stamp (`nudgeLive`, lib/send-nudge-state.ts, read in `getCartView`), and
-- here a stale stamp neither blocks a new nudge nor is answered `recent` / `taken`.
--
-- ## Lock order: the cart row FIRST, in both functions
-- Both functions open with `perform 1 from qr_carts where id = … for no key update`: the cart row,
-- then (the fire) the lines — cart → line, the order every settlement function, the three line RPCs
-- (P2cy's `for share`), `mms_void_line` / `mms_request_approval`, the merge and both undos already
-- take. The first draft of this file cleared the stamp in a second CTE arm AFTER the lines'
-- `UPDATE … FROM qr_carts` (which locks the LINES, not the joined cart): a fire holding a line and
-- then wanting the cart, against `mms_cart_item_inc_qty` / `_set_qty_if_open` holding the cart
-- `for share` and then wanting the line — a wait cycle, 40P01 (the blind pass on #335; measured
-- with the mutant `pd1/fire-cart-lock-after-the-lines` in scripts/verify-fire-cart-race.mjs).
--   · Why NO KEY UPDATE: it is the lock the stamp's own UPDATE takes, so the fire gains no new
--     conflict, only an earlier one. It conflicts with the line RPCs' `for share` — an add holding
--     the cart finishes before the fire locks a line (and the fire's statement, a later snapshot,
--     fires what it added); a fire holding the cart makes the add wait before it locks a line (and
--     the add then meets P2dd's 'line already sent', which inserts a fresh draft — as designed). It
--     does NOT conflict with `for key share`, so a bare FK check (a line re-parented by a merge, a
--     line insert) is not serialized behind a Send. `for update` (m261's parity choice for the
--     undo) would add exactly that conflict and buys nothing here.
--   · What is PROVEN, with two sessions in both orders (scripts/verify-fire-cart-race.mjs and its
--     `--mutants`): an add (`mms_cart_item_inc_qty`), a qty change (`_set_qty_if_open`), a nudge and
--     the merge, each against the fire. Nothing else is proven by a second session.
--   · What is MEASURED, not proven (the last blind pass on #335 asked for every partner): a
--     statement-order scan of the LATEST definition of all 86 public functions in the migrations on
--     2026-10-11, following calls between them — 13 lock both tables, and every one takes its FIRST
--     conflicting `qr_carts` lock before any `qr_cart_items` lock and later re-locks only carts it
--     already holds (the merge locks both of its carts up front); every other function locks one
--     table only, so a lines-only writer (`mms_set_line_fulfillment`, `mms_fire_line`,
--     `mms_fire_pending_food`, `mms_line_transition`, `mms_bump_ticket`) never waits on a cart and
--     cannot close a cycle with a fire that holds one. The only triggers on `qr_cart_items` are
--     M87's two `added_by` row triggers, which write `new` and lock nothing. App writes through
--     PostgREST are one statement per transaction, so none holds a line while asking for a cart. A
--     scan of text, like m261's — a later function written line-then-cart would break this, and no
--     guard here would notice.
--   · This AMENDS two sentences that are the record of what ran and are not edited:
--     20260929000000_p2dd_p2cy_line_guards.sql's "the fire functions (`mms_fire_cart`, …) write lines
--     only and never lock the cart" and 20261006120000_m261_undo_fire_cart_lock.sql's "the fires lock
--     lines only": `mms_fire_cart` now locks the cart FIRST, which keeps both files' deadlock
--     argument whole.
--
-- ## The Send clears it in the SAME TRANSACTION as the fire, under the cart lock
-- `mms_fire_cart` is restated whole below: the cart lock, then one statement whose first CTE arm is
-- the lines' draft→fired UPDATE and whose second clears the stamp — only when a stamp stands (a Send
-- with nothing to clear writes no cart row, so it raises no `qr_carts` realtime event — the blind
-- pass's perf finding) and only when a line actually moved (a fire that moves NO line leaves a real
-- wait standing). Both commit together, so no reader ever sees the dishes fired and the stamp
-- still standing. A nudge racing the fire is ORDERED by the cart lock, which both take before they
-- decide: nudge first → the fire waits, then fires and clears it; fire first → the nudge waits,
-- and its UPDATE (a later statement, a fresh snapshot) finds no dine-in draft left and answers
-- `nothing_to_send`. Without the nudge's own lock it would wait on the cart row only when the fire
-- WROTE it, and then decide from the snapshot it took before the fire — a stamp landing on a cart
-- whose dishes had just gone (`pd1/nudge-cart-lock-dropped`). Same signature, same return shape
-- (`fired`, `batch`, `fire_deadline`), same grants. The staff Send (`staffFireCart`,
-- lib/staff-send.ts) calls this same function, so the console's Send answers the nudge too.
--
-- ## Deploy order: APPLY THIS FILE FIRST, then deploy the app
-- The build before PD1 calls `mms_fire_cart` with the same signature and the same return, so it runs
-- unchanged against this body (the cart lock only orders it; a Send with no stamp writes no cart
-- row). The PD1 build reads the two columns and calls `mms_nudge_host`; against an unmigrated
-- project its stamp read fails, and the Bill then never offers "Let {host} know" (`nudgeReady`,
-- lib/cart.ts) — but the order is still migration first, then the merge that deploys the app.
--
-- ## Applying to prod (the QR history is divergent — CLAUDE.md, M125)
-- On the OWNER's go (OWNER_RULINGS_2026-10-07 #5), ONE file at a time with the Supabase MCP
-- `apply_migration`, after confirming the MCP targets `fasnpdhtvqtzjlvruqcu`; then verify: the two
-- columns in `information_schema.columns`; `mms_nudge_host(uuid, uuid)` in pg_proc returning four
-- columns, with `has_function_privilege('service_role', …, 'execute')` true and false for `anon` /
-- `authenticated`; `mms_fire_cart(uuid)`'s body md5 against this file's. Never `db push`, never the
-- SQL editor.
--
-- Pinned by supabase/tests/pd1_send_nudge_test.sql, whose every behaviour case (PD1.2–PD1.17) is
-- falsified by a named mutant in scripts/verify-mode-authority.mjs (suite `pd1`) — PD1.1's columns
-- and PD1.18's grants are shape checks that runner cannot mutate (a grant leaves `prosrc` alone);
-- the locks' ORDER, which no single session can interleave, by scripts/verify-fire-cart-race.mjs
-- --mutants.
--
-- Guarded + idempotent: every statement re-applies cleanly.

-- ── 1 · the stamp: who is waiting, and since when ───────────────────────────────────────────────
alter table public.qr_carts add column if not exists send_nudge_seat uuid;
alter table public.qr_carts add column if not exists send_nudge_at timestamptz;
comment on column public.qr_carts.send_nudge_seat is
  'PD1 — the seat (auth.uid) of the guest who tapped "Let {host} know"; cleared by mms_fire_cart in the same transaction as the fire.';
comment on column public.qr_carts.send_nudge_at is
  'PD1 — when that guest tapped; another tap inside a minute is refused (recent / taken). Null = nobody waiting.';

-- ── 2 · the nudge, status-guarded IN the statement ──────────────────────────────────────────────
-- No `drop` (the prod apply path, the Supabase MCP `apply_migration`, stalls on a destructive
-- statement): no database this file reaches has ever had `mms_nudge_host`, so `create or replace`
-- creates it, and re-applying this file replaces it with the same signature and shape.
create or replace function public.mms_nudge_host(p_cart_id uuid, p_seat uuid)
  returns table(ok boolean, reason text, nudged_at timestamptz, nudge_seat uuid)
  language plpgsql set search_path = '' as $$
declare
  n integer;
  v_at timestamptz; v_by uuid;
  v_status text; v_sess_status text; v_mode text; v_host uuid;
  v_prev timestamptz; v_prev_seat uuid; v_member boolean; v_paying boolean; v_draft boolean;
begin
  -- The cart row FIRST (the header's lock order): a fire in flight finishes before this decides, and
  -- the UPDATE below is a later statement, so it reads the fire's committed lines.
  perform 1 from public.qr_carts where id = p_cart_id for no key update;
  update public.qr_carts c
    set send_nudge_seat = p_seat, send_nudge_at = now()
    from public.table_sessions s
    where c.id = p_cart_id
      and s.id = c.session_id
      and c.status = 'open'
      and s.status = 'active'
      and s.mode = 'dinein'
      and s.host_seat is not null
      and s.host_seat <> p_seat
      and exists (select 1 from public.session_members m
                   where m.session_id = s.id and m.seat_id = p_seat)
      and not (c.locked and c.locked_at is not null and c.locked_at > now() - interval '5 minutes')
      and (c.settle_at is null or c.settle_at <= now() - interval '10 minutes')
      and exists (select 1 from public.qr_cart_items ci
                   where ci.cart_id = c.id and ci.state = 'draft' and ci.fulfillment = 'dinein')
      and (c.send_nudge_at is null or c.send_nudge_at < now() - interval '1 minute'
           -- a STALE stamp (no dine-in draft that predates it) blocks nothing — see the header
           or not exists (select 1 from public.qr_cart_items w
                            where w.cart_id = c.id and w.state = 'draft' and w.fulfillment = 'dinein'
                              and w.created_at <= c.send_nudge_at))
    returning c.send_nudge_at, c.send_nudge_seat into v_at, v_by;
  get diagnostics n = row_count;
  if n = 1 then
    return query select true, 'ok'::text, v_at, v_by; return;
  end if;
  -- Zero rows: say which guard refused, from a read — never a guess. The cart row is still ours.
  select c.status, s.status, s.mode, s.host_seat, c.send_nudge_at, c.send_nudge_seat,
         exists (select 1 from public.session_members m where m.session_id = s.id and m.seat_id = p_seat),
         (c.locked and c.locked_at is not null and c.locked_at > now() - interval '5 minutes')
           or (c.settle_at is not null and c.settle_at > now() - interval '10 minutes'),
         exists (select 1 from public.qr_cart_items ci
                  where ci.cart_id = c.id and ci.state = 'draft' and ci.fulfillment = 'dinein')
    into v_status, v_sess_status, v_mode, v_host, v_prev, v_prev_seat, v_member, v_paying, v_draft
    from public.qr_carts c join public.table_sessions s on s.id = c.session_id
    where c.id = p_cart_id;
  if not found then return query select false, 'no_cart'::text, null::timestamptz, null::uuid; return; end if;
  if v_status <> 'open' or v_sess_status <> 'active' then
    return query select false, 'closed'::text, null::timestamptz, null::uuid; return;
  end if;
  if not v_member then return query select false, 'not_member'::text, null::timestamptz, null::uuid; return; end if;
  if v_host is null then return query select false, 'no_host'::text, null::timestamptz, null::uuid; return; end if;
  if v_host = p_seat then return query select false, 'is_host'::text, null::timestamptz, null::uuid; return; end if;
  if v_paying then return query select false, 'paying'::text, null::timestamptz, null::uuid; return; end if;
  if v_mode <> 'dinein' or not v_draft then
    return query select false, 'nothing_to_send'::text, null::timestamptz, null::uuid; return;
  end if;
  -- Reached only when the cadence term refused: the stamp is fresh AND live (a stale one passes it).
  if v_prev is not null and v_prev >= now() - interval '1 minute' then
    -- The stamp stands. THIS seat's → `recent` (idempotent: the guest's line keeps showing); another
    -- seat's → `taken`, carrying whose it is. Never the caller's seat on a stamp that is not theirs.
    if v_prev_seat = p_seat then
      return query select false, 'recent'::text, v_prev, v_prev_seat; return;
    end if;
    return query select false, 'taken'::text, v_prev, v_prev_seat; return;
  end if;
  return query select false, 'unknown'::text, null::timestamptz, null::uuid;
end $$;
revoke all on function public.mms_nudge_host(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mms_nudge_host(uuid, uuid) to service_role;

-- ── 3 · the Send clears the stamp in the same transaction as the fire ───────────────────────────
-- Restated WHOLE from 20260624030000_s4_money_remediation.sql:89-108 (the live definition): the
-- same single atomic draft→fired UPDATE, dine-in only, `v_deadline` captured ONCE so `fire_at` equals
-- the returned deadline exactly — now behind the cart row lock (cart → line, the header), and the
-- first arm of a CTE whose second arm clears a STANDING stamp whenever at least one line fired.
-- Same signature and return shape; `create or replace`.
create or replace function public.mms_fire_cart(p_cart_id uuid)
  returns table(fired integer, batch uuid, fire_deadline timestamptz)
  language plpgsql set search_path = '' as $$
declare n integer; v_batch uuid := gen_random_uuid(); v_deadline timestamptz := now() + interval '10 seconds';
begin
  perform 1 from public.qr_carts where id = p_cart_id for no key update;   -- PD1: the cart row first (cart → line)
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
    -- PD1 — the wait the stamp names is answered by THIS fire: cleared in the same transaction, only
    -- when a stamp stands (no stamp → no cart write, no realtime event) and only when a line moved.
    update public.qr_carts c
      set send_nudge_seat = null, send_nudge_at = null
      where c.id = p_cart_id
        and (c.send_nudge_at is not null or c.send_nudge_seat is not null)
        and exists (select 1 from fired_lines)
      returning c.id
  )
  select count(*) into n from fired_lines;
  return query select n, v_batch, v_deadline;   -- the caller ignores batch/deadline when n=0 (nothing sent)
end $$;
revoke all on function public.mms_fire_cart(uuid) from public, anon, authenticated;
grant execute on function public.mms_fire_cart(uuid) to service_role;
