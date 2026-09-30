-- Phase 2f · P2v — a COUNTER order (phone / walk-up) may cook before it is paid.
--
-- OWNER DECISION 1 (2026-09-24): staff may Send a `reg-` counter order to the kitchen before payment;
-- the ticket, the lane, the floor card and the table page read "Unpaid — collect at pickup" until it
-- is settled. Decision 7 (2026-09-30): the arm is recorded (7a), a no-show writes off SENT food only
-- through the existing loss gate (7b), a name is required to send and locked once food is in (7c).
--
-- ## Why a NEW staff-only fire, not a widening of `mms_fire_cart`
-- `mms_fire_cart` is also the DINER's send (`sendToKitchen` in lib/cart.ts), and a diner may JOIN a
-- `reg-` session by its code (/api/session refuses only to CREATE a reserved code). Widening it would
-- hand an unpaid fire to a phone. The four functions below are revoked from public/anon/authenticated
-- and granted to service_role only; their callers are staff Server Actions behind the staff gate.
--
-- ## The `reg-` authority chain
-- A `reg-` code is minted only by `openRegisterOrder` (service role, staff-gated); no insert policy
-- exists on `table_sessions`; /api/session refuses to create a reserved code. Every function below
-- re-states the counter predicate IN its statement: `s.mode = 'pickup' and s.qr_code like 'reg-%'`
-- — the SQL twin of `isCounterOrder` (lib/counter-order.ts). A future writer minting `reg-` codes
-- anywhere else inherits fire-before-pay; this header and DESIGN-LANGUAGE §17 say so.
--
-- ## Pay-first, stated precisely (the Phase 2f critique corrected an overstatement)
-- For pickup/scan-and-go carts pay-first is SQL-enforced in `mms_fire_line` (M107) and
-- `mms_fire_cart` (dine-in only). It is only TYPESCRIPT-bounded for `mms_line_transition`, whose
-- draft→fired edge has no mode guard — `bumpLineInput.to` (`z.enum(["in_progress","served"])`) is
-- what keeps that edge unreachable. Filed (OPEN-ITEMS, beside M107); not changed here.
--
-- ## Lock order (all four new functions)
-- The qr_carts row FOR UPDATE first, then mms_approvals (no-show only), then qr_cart_items — the
-- order `mms_merge_table_orders` and every settlement already take (cart → approvals → lines), and
-- compatible with `mms_resolve_approval` (approvals → line) and `mms_void_line` (line only). Under
-- READ COMMITTED each statement after the lock sees the committed row, so a name clear, a fire, a
-- no-show and a settle claim on one cart are totally ordered by the cart row.
--
-- ## M171
-- The sweeper restatement exempts a SENT, UNPAID counter order only; the dine-in half of M171 (a
-- 4h-expired dine-in session orphaning fired food) is unchanged and still open.
--
-- ## Applying to prod (the QR history is divergent — CLAUDE.md, M125)
-- Apply THIS ONE FILE with the Supabase MCP `apply_migration`, at the final Codex-reviewed head,
-- before merge; verify per docs/HANDOFF.md (signatures, grants, md5 of the five bodies against the
-- committed file). `db push` is unusable here. Idempotent: every statement re-runs as a no-op.

-- ── 0. the counter arm (decision 7a) ─────────────────────────────────────────────────────────────
-- Written once at mint by `openRegisterOrder`. NULL reads as walk-up (pay-first) — every row that
-- predates this column, and every non-counter cart. No backfill, no policy change (qr_carts has
-- SELECT policies only; every write is service-role).
alter table public.qr_carts add column if not exists counter_arm text;
do $$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'qr_carts_counter_arm_check'
                    and conrelid = 'public.qr_carts'::regclass) then
    alter table public.qr_carts add constraint qr_carts_counter_arm_check
      check (counter_arm is null or counter_arm in ('walkup', 'phone'));
  end if;
end $$;

-- ── 1. the staff-only unpaid fire ────────────────────────────────────────────────────────────────
-- One guarded UPDATE: open cart, active session, a counter order, a non-blank name (decision 7c —
-- the name is the only pre-payment identity), draft to-go lines only (grocery never fires; a dine-in
-- tagged line on a counter cart is not this send's). The same 10s grace and batch as `mms_fire_cart`,
-- so 2a's undo, grace and stash work unchanged. `named` is INFORMATIONAL (the app names the refusal
-- 'noName' when fired = 0); the name GUARD is the UPDATE's own conjunct.
create or replace function public.mms_fire_counter_cart(p_cart_id uuid)
  returns table(fired integer, batch uuid, fire_deadline timestamptz, named boolean)
  language plpgsql set search_path = '' as $$
declare
  n integer;
  v_batch uuid := gen_random_uuid();
  v_deadline timestamptz := now() + interval '10 seconds';
  v_named boolean;
begin
  -- The cart row first: serializes with mms_clear_cart_name, mms_counter_no_show and a settle claim.
  select nullif(btrim(c.customer_name), '') is not null into v_named
    from public.qr_carts c where c.id = p_cart_id
    for update;
  update public.qr_cart_items ci
    set state = 'fired', fire_at = v_deadline, fire_batch = v_batch
    from public.qr_carts c
    join public.table_sessions s on s.id = c.session_id
    where ci.cart_id = p_cart_id
      and c.id = ci.cart_id
      and c.status = 'open'
      and nullif(btrim(c.customer_name), '') is not null
      and s.status = 'active'
      and s.mode = 'pickup'
      and s.qr_code like 'reg-%'
      and ci.state = 'draft'
      and ci.fulfillment = 'togo';
  get diagnostics n = row_count;
  return query select n, v_batch, v_deadline, coalesce(v_named, false);
end $$;
revoke all on function public.mms_fire_counter_cart(uuid) from public, anon, authenticated;
grant execute on function public.mms_fire_counter_cart(uuid) to service_role;

-- ── 2. its undo (this batch, inside the grace) ───────────────────────────────────────────────────
create or replace function public.mms_undo_counter_fire(p_cart_id uuid, p_batch uuid)
  returns integer
  language plpgsql set search_path = '' as $$
declare n integer;
begin
  perform 1 from public.qr_carts where id = p_cart_id for update;
  update public.qr_cart_items ci
    set state = 'draft', fire_at = null, fire_batch = null
    from public.qr_carts c
    join public.table_sessions s on s.id = c.session_id
    where ci.cart_id = p_cart_id
      and c.id = ci.cart_id
      and c.status = 'open'
      and s.mode = 'pickup'
      and s.qr_code like 'reg-%'
      and ci.state = 'fired'
      and not ci.comped
      and ci.fire_at > now()
      and ci.fire_batch = p_batch;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.mms_undo_counter_fire(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mms_undo_counter_fire(uuid, uuid) to service_role;

-- ── 3. clearing a name — refused once a counter order has food in the kitchen (decision 7c) ──────
-- 'ok' | 'not_open' | 'keep_name'. STATE-based on purpose (an in-grace line may still cook — undo
-- it first). A non-empty RENAME is not this function's: it stays the app's guarded update.
create or replace function public.mms_clear_cart_name(p_session_id uuid)
  returns text
  language plpgsql set search_path = '' as $$
declare v_cart uuid; v_mode text; v_code text;
begin
  select c.id, s.mode, s.qr_code into v_cart, v_mode, v_code
    from public.qr_carts c
    join public.table_sessions s on s.id = c.session_id
    where c.session_id = p_session_id and c.status = 'open'
    for update of c;
  if v_cart is null then return 'not_open'; end if;
  if v_mode = 'pickup' and v_code like 'reg-%' and exists (
       select 1 from public.qr_cart_items ci
        where ci.cart_id = v_cart and ci.state in ('fired', 'in_progress', 'served')) then
    return 'keep_name';
  end if;
  update public.qr_carts set customer_name = null where id = v_cart and status = 'open';
  return 'ok';
end $$;
revoke all on function public.mms_clear_cart_name(uuid) from public, anon, authenticated;
grant execute on function public.mms_clear_cart_name(uuid) to service_role;

-- ── 4. a no-show — write off only what the kitchen got, invent no money (decision 7b) ──────────
-- SENT, named once (the SQL twin of `counterSentLine`): fired / in progress / served, not grocery,
-- not comped (a comp is already an audited loss), and PAST its grace (`fire_at <= now()` — an
-- in-grace line never reached the KDS). The loss gate is `mms_void_line`'s rule applied to the SENT
-- total: a manager when any sent dish was started or served, or the sent value exceeds
-- `mms_loss_config.max_loss_cents`. Drafts and grocery are left on the cancelled cart with NO row
-- (Clear's precedent) and never count toward the ceiling. In-grace fired lines return to draft (the
-- undo's own edge), so nothing sits `fired` unaudited. No qr_orders row, no charge, no refund.
-- Returns 'ok' | 'not_found' | 'not_counter' | 'not_open' | 'in_flight' | 'nothing_sent' |
-- 'needs_approval' | 'self_approve' | 'bad_approver'. Every refusal returns BEFORE any write.
create or replace function public.mms_counter_no_show(
  p_cart_id uuid,
  p_initiator uuid,
  p_approver uuid default null
) returns text
  language plpgsql set search_path = '' as $$
declare
  v_session uuid; v_status text; v_code text; v_mode text;
  v_locked boolean; v_locked_at timestamptz; v_settle_at timestamptz;
  v_sent uuid[]; v_loss integer; v_cooked boolean; v_max_loss integer; v_gate text;
  v_role text; v_active boolean;
begin
  select c.session_id, c.status, s.qr_code, s.mode, c.locked, c.locked_at, c.settle_at
    into v_session, v_status, v_code, v_mode, v_locked, v_locked_at, v_settle_at
    from public.qr_carts c
    join public.table_sessions s on s.id = c.session_id
    where c.id = p_cart_id
    for update of c;
  if v_session is null then return 'not_found'; end if;
  if v_mode <> 'pickup' or v_code not like 'reg-%' then return 'not_counter'; end if;
  if v_status <> 'open' then return 'not_open'; end if;
  -- `mms_void_line`'s two literals: a fresh pay lock, or a fresh settle freeze.
  if (v_locked and v_locked_at > now() - interval '5 minutes')
     or (v_settle_at is not null and v_settle_at > now() - interval '10 minutes') then
    return 'in_flight';
  end if;
  -- Lock order: approvals before lines (mms_resolve_approval's and the merge's order).
  perform 1 from public.mms_approvals
    where cart_id = p_cart_id and status = 'pending'
    for update;
  perform 1 from public.qr_cart_items where cart_id = p_cart_id for update;
  select array_agg(ci.id) into v_sent
    from public.qr_cart_items ci
    where ci.cart_id = p_cart_id
      and ci.state in ('fired', 'in_progress', 'served')
      and ci.fulfillment <> 'grocery'
      and not ci.comped
      and ci.fire_at is not null
      and ci.fire_at <= now();
  if v_sent is null then return 'nothing_sent'; end if;
  select sum(ci.unit_price_cents * ci.qty), bool_or(ci.state in ('in_progress', 'served'))
    into v_loss, v_cooked
    from public.qr_cart_items ci where ci.id = any(v_sent);
  select max_loss_cents into v_max_loss from public.mms_loss_config where id;
  v_max_loss := coalesce(v_max_loss, 2000);
  v_gate := case when v_cooked then 'cooked' when v_loss > v_max_loss then 'ceiling' else 'solo' end;
  if v_gate <> 'solo' then
    if p_approver is null then return 'needs_approval'; end if;
    if p_approver = p_initiator then return 'self_approve'; end if;
    select role, active into v_role, v_active from public.staff where user_id = p_approver;
    if not coalesce(v_active, false) or v_role not in ('manager', 'owner') then
      return 'bad_approver';
    end if;
  end if;
  -- ── writes (nothing above this line wrote) ──
  -- Pending S2.4 requests on this cart can no longer resolve honestly: 'superseded' (the merge's word).
  update public.mms_approvals set status = 'superseded', resolved_at = now()
    where cart_id = p_cart_id and status = 'pending';
  insert into public.mms_approvals
    (kind, status, cart_id, session_id, line_id, line_name, qty, amount_cents,
     reason_code, cooked, initiator_staff_id, approver_staff_id, gate_reason)
    select 'void', 'approved', p_cart_id, v_session, ci.id, ci.name, ci.qty,
           ci.unit_price_cents * ci.qty, 'no_show', ci.state in ('in_progress', 'served'),
           p_initiator, p_approver, v_gate
      from public.qr_cart_items ci where ci.id = any(v_sent);
  update public.qr_cart_items set state = 'voided' where id = any(v_sent);
  update public.qr_cart_items set state = 'draft', fire_at = null, fire_batch = null
    where cart_id = p_cart_id and state = 'fired' and fire_at > now();
  update public.qr_carts set status = 'cancelled' where id = p_cart_id and status = 'open';
  update public.table_sessions set status = 'closed' where id = v_session and status = 'active';
  return 'ok';
end $$;
revoke all on function public.mms_counter_no_show(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.mms_counter_no_show(uuid, uuid, uuid) to service_role;

-- ── 5. the sweeper: a sent, unpaid counter order is never swept ─────────────────────────────────
-- Restated from 20260621000000_abuse_limits.sql. The ONLY change is the `and not (…)` conjunct: a
-- `reg-` session whose OPEN cart holds a fired / in-progress / served line stays active past its
-- expiry — otherwise the KDS drops a ticket mid-cook, the floor and the lane lose it, and Settle,
-- No-show and Clear all become unreachable over an open cart with food on it (the M171 shape). Such
-- an order stays flagged on the floor and the lane until it is paid or written off. The deletes,
-- SECURITY DEFINER, search_path, grants and the pg_cron job (which calls this by name) are unchanged.
create or replace function public.mms_sweep_expired_sessions() returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare v_closed integer;
begin
  update public.table_sessions s set status = 'closed'
    where s.status = 'active' and s.expires_at <= now()
      and not (s.mode = 'pickup' and s.qr_code like 'reg-%' and exists (
            select 1 from public.qr_carts c
              join public.qr_cart_items ci on ci.cart_id = c.id
             where c.session_id = s.id and c.status = 'open'
               and ci.state in ('fired', 'in_progress', 'served')));
  get diagnostics v_closed = row_count;
  delete from public.rate_events     where created_at  < now() - interval '1 day';
  delete from public.promo_attempts  where attempted_at < now() - interval '1 day';
  return v_closed;
end; $$;
revoke all on function public.mms_sweep_expired_sessions() from public, anon, authenticated;
grant execute on function public.mms_sweep_expired_sessions() to service_role;
