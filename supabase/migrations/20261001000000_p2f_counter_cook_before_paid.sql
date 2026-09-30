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
-- hand an unpaid fire to a phone. The functions below are revoked from public/anon/authenticated
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
-- ## Lock order, and what is PROVEN about it (the Phase 2f blind review corrected an overstatement)
-- Every function below that takes a lock takes the qr_carts row FOR UPDATE first; then the fire takes
-- the table_sessions row FOR SHARE, the no-show takes pending mms_approvals then qr_cart_items, and
-- the sweeper takes the expired table_sessions rows it may close (FOR NO KEY UPDATE SKIP LOCKED) —
-- cart → session everywhere, compatible with `mms_merge_table_orders` (cart → approvals → lines),
-- `mms_resolve_approval` (approvals → line) and `mms_void_line` (line only).
-- Two-session PROOF exists for exactly two pairs, in scripts/verify-counter-fire-race.mjs (both
-- orders each, with the locks deleted as mutants): the fire against the name clear, and the fire
-- against the sweeper. The fire/undo/no-show/settle orderings on one cart rest on the same cart-row
-- lock by construction and are pinned single-session only (P2F.15e, P2F.18); the no-show's
-- approvals-before-lines order and the undo's cart lock are documented survivors in
-- scripts/verify-mode-authority.mjs with no two-session harness (filed). `clearTable`'s counter
-- refusal decides under the cart lock AND the lines' locks (§7, `mms_clear_counter_cart`); its two
-- orderings — against a kitchen fire and against a settle — are the harness's (e) and (f).
--
-- ## No freeze guard on the counter fire and undo — deliberately
-- Neither refuses a live pay lock or settle freeze. Moving a line between draft and fired changes no
-- amount (the settle charges every non-voided, non-comped line either way, and
-- `mms_fire_pending_food` fires what is still draft once paid), and a counter order may cook unpaid
-- by design, so a fire racing a settle is benign. The staff action refuses `paying` from its own
-- pre-read for honest copy; the SQL decides only what moves. `mms_counter_no_show`, which DOES write
-- money state, refuses a fresh freeze and a fresh pay lock in its statement (P2F.15e, P2F.15i).
--
-- ## SENT — one base definition, one refinement
-- SENT = state in ('fired','in_progress','served') ∧ fulfillment <> 'grocery' ∧ not comped. A fired
-- line with a NULL fire_at is SENT (`mms_line_transition`'s draft→fired edge stamped no deadline
-- until §6 below, so such rows exist; the KDS shows it, so it counts as fired at or before now, and
-- §6 makes the kitchen's Start/Ready/bump treat it the same way). The sweeper exempts a session
-- holding ANY SENT line (in-grace included — it will reach the KDS within seconds). The no-show writes
-- off SENT lines PAST their grace (`fire_at is null or fire_at <= now()`); an in-grace line is still
-- the sender's to undo, and the no-show returns it to draft. So every exempt session has an exit: a
-- settle, or a no-show that is never 'nothing_sent' once the grace has run.

-- ## M171
-- The sweeper restatement exempts a SENT, UNPAID counter order only; the dine-in half of M171 (a
-- 4h-expired dine-in session orphaning fired food) is unchanged and still open.
--
-- ## Applying to prod (the QR history is divergent — CLAUDE.md, M125)
-- Apply THIS ONE FILE with the Supabase MCP `apply_migration`, at the final Codex-reviewed head,
-- before merge; verify per docs/HANDOFF.md (signatures, grants, md5 of every body against the
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
-- One guarded UPDATE: open cart, active and UNEXPIRED session, a counter order, a non-blank name
-- (decision 7c — the name is the only pre-payment identity), draft to-go lines only (grocery never
-- fires; a dine-in tagged line on a counter cart is not this send's). The same 10s grace and batch
-- as `mms_fire_cart`, so 2a's undo, grace and stash work unchanged. `named` and `closed` are
-- INFORMATIONAL (the app names the refusal: 'closed' when the order is no longer live, 'noName' when
-- it is live but nameless); the GUARDS are the UPDATE's own conjuncts.
--
-- The session row is locked FOR SHARE after the cart (Phase 2f blind review, C1): the sweeper closes
-- a session under a row lock and decides its exemption only AFTER holding it, so a Send and the cron
-- sweep on one order are ordered by that row — a sweep that won first leaves this fire reading a
-- closed session (fired = 0, closed = true); a fire that won first makes the sweep skip the row, and
-- its committed lines exempt the session on every later sweep. `expires_at > now()` refuses the send
-- on an expired session the sweeper has not reached yet.
-- A return shape change (Phase 2f review: `closed`) needs a DROP — `create or replace` cannot change
-- OUT columns. Guarded so a second apply is a no-op; grants are restated below.
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'mms_fire_counter_cart'
                and pg_get_function_result(p.oid) not like '%closed boolean%') then
    drop function public.mms_fire_counter_cart(uuid);
  end if;
end $$;
create or replace function public.mms_fire_counter_cart(p_cart_id uuid)
  returns table(fired integer, batch uuid, fire_deadline timestamptz, named boolean, closed boolean)
  language plpgsql set search_path = '' as $$
declare
  n integer;
  v_batch uuid := gen_random_uuid();
  v_deadline timestamptz := now() + interval '10 seconds';
  v_named boolean;
  v_session uuid;
  v_cart_open boolean;
  v_live boolean;
begin
  -- The cart row first: serializes with mms_clear_cart_name, mms_counter_no_show and a settle claim.
  select nullif(btrim(c.customer_name), '') is not null, c.session_id, c.status = 'open'
    into v_named, v_session, v_cart_open
    from public.qr_carts c where c.id = p_cart_id
    for update;
  -- Then the session row: serializes with the sweeper (C1). Read AFTER the lock, so a sweep that
  -- committed while this waited is what `v_live` sees.
  select s.status = 'active' and s.expires_at > now() into v_live
    from public.table_sessions s where s.id = v_session
    for share;
  update public.qr_cart_items ci
    set state = 'fired', fire_at = v_deadline, fire_batch = v_batch
    from public.qr_carts c
    join public.table_sessions s on s.id = c.session_id
    where ci.cart_id = p_cart_id
      and c.id = ci.cart_id
      and c.status = 'open'
      and nullif(btrim(c.customer_name), '') is not null
      and s.status = 'active'
      and s.expires_at > now()
      and s.mode = 'pickup'
      and s.qr_code like 'reg-%'
      and ci.state = 'draft'
      and ci.fulfillment = 'togo';
  get diagnostics n = row_count;
  return query select n, v_batch, v_deadline, coalesce(v_named, false),
                      not (coalesce(v_cart_open, false) and coalesce(v_live, false));
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
-- SENT past its grace (the header's definition; the SQL twin of `counterSentLine`): fired / in
-- progress / served, not grocery, not comped (a comp is already an audited loss), and `fire_at` null
-- or at/before now() — an in-grace line never reached the KDS. The loss gate is `mms_void_line`'s rule
-- applied to the SENT total: a manager when any sent dish was started or served, or the sent value
-- exceeds `mms_loss_config.max_loss_cents`. Drafts and grocery are left on the cancelled cart with NO
-- row (Clear's precedent) and never count toward the ceiling. In-grace fired lines return to draft
-- (the undo's own edge), so nothing sits `fired` unaudited. No qr_orders row, no charge, no refund.
--
-- `p_expected_line_ids` is the SENT set the staff member (and the approving manager) SAW on the
-- sheet. The function derives its own under the locks and refuses 'changed' — writing nothing — when
-- the two differ as SETS (order and duplicates ignored; NULL or a NULL element never matches), so an
-- approval can never land on a write-off larger, smaller or different from the one approved.
-- Split shares: a counter cart cannot carry qr_cart_shares (openSettlement refuses a non-dine-in
-- session, lib/split.ts), so the freeze literals below are the whole in-flight test here.
-- Returns 'ok' | 'not_found' | 'not_counter' | 'not_open' | 'in_flight' | 'nothing_sent' |
-- 'changed' | 'needs_approval' | 'self_approve' | 'bad_approver'. Every refusal returns BEFORE any
-- write. The pre-review signature (uuid, uuid, uuid) is dropped: one overload, one shape.
drop function if exists public.mms_counter_no_show(uuid, uuid, uuid);
create or replace function public.mms_counter_no_show(
  p_cart_id uuid,
  p_initiator uuid,
  p_expected_line_ids uuid[],
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
  select array_agg(ci.id order by ci.id) into v_sent
    from public.qr_cart_items ci
    where ci.cart_id = p_cart_id
      and ci.state in ('fired', 'in_progress', 'served')
      and ci.fulfillment <> 'grocery'
      and not ci.comped
      and (ci.fire_at is null or ci.fire_at <= now());
  if v_sent is null then return 'nothing_sent'; end if;
  if (select array_agg(distinct e order by e) from unnest(p_expected_line_ids) e)
       is distinct from v_sent then
    return 'changed';
  end if;
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
revoke all on function public.mms_counter_no_show(uuid, uuid, uuid[], uuid) from public, anon, authenticated;
grant execute on function public.mms_counter_no_show(uuid, uuid, uuid[], uuid) to service_role;

-- ── 5. the sweeper: a sent, unpaid counter order is never swept ─────────────────────────────────
-- Restated from 20260621000000_abuse_limits.sql. A `reg-` session whose OPEN cart holds a SENT line
-- (the header's definition, in-grace included) stays active past its expiry — otherwise the KDS
-- drops a ticket mid-cook, the floor and the lane lose it, and Settle, No-show and Clear all become
-- unreachable over an open cart with food on it (the M171 shape). Such an order stays flagged on the
-- floor and the lane until it is paid or written off.
--
-- TWO statements, on purpose (Phase 2f blind review, C1): the candidates are LOCKED first, and the
-- exemption is decided by a SECOND statement — a fresh READ COMMITTED snapshot taken while holding
-- them. In one UPDATE the exemption's EXISTS is read from the statement's snapshot, and a row that
-- was merely share-locked (not updated) by a concurrent Send is not re-checked when the lock frees, so
-- a Send committing between the read and the write would leave fired food on a closed session.
-- The second statement does not restate `status = 'active' and expires_at <= now()`: a row this
-- transaction holds cannot change under it, and the lock re-checked both against the newest version.
-- SKIP LOCKED: a session a Send holds right now is left for the next run (its fired lines then
-- exempt it) — the cron never waits on a Send. FOR NO KEY UPDATE, not FOR UPDATE: a foreign-key check
-- (a cart insert) takes KEY SHARE, which must not make the sweep skip a row. `order by` keeps two
-- overlapping sweeps from deadlocking. The deletes, SECURITY DEFINER, search_path, grants and the
-- pg_cron job (which calls this by name) are unchanged.
create or replace function public.mms_sweep_expired_sessions() returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare v_closed integer; v_ids uuid[];
begin
  select array_agg(x.id) into v_ids from (
    select s.id from public.table_sessions s
     where s.status = 'active' and s.expires_at <= now()
     order by s.id
     for no key update skip locked) x;
  update public.table_sessions s set status = 'closed'
    where s.id = any(v_ids)
      and not (s.mode = 'pickup' and s.qr_code like 'reg-%' and exists (
            select 1 from public.qr_carts c
              join public.qr_cart_items ci on ci.cart_id = c.id
             where c.session_id = s.id and c.status = 'open'
               and ci.state in ('fired', 'in_progress', 'served')
               and ci.fulfillment <> 'grocery'
               and not ci.comped));
  get diagnostics v_closed = row_count;
  delete from public.rate_events     where created_at  < now() - interval '1 day';
  delete from public.promo_attempts  where attempted_at < now() - interval '1 day';
  return v_closed;
end; $$;
revoke all on function public.mms_sweep_expired_sessions() from public, anon, authenticated;
grant execute on function public.mms_sweep_expired_sessions() to service_role;

-- ── 6. a fired line with no fire_at is DUE — to the kitchen's writes as well as its read ─────────
-- Codex r1 on #308 (P2): the KDS read admits a fired line whose fire_at is NULL (it counts as SENT
-- above, and the no-show writes it off), but both kitchen writes refused it — `fire_at is not null`
-- in `mms_line_transition`'s Start/Ready guard and in `mms_bump_ticket` — so the ticket showed and
-- every bump answered "already updated": a card that could never leave the live queue.
-- The ONLY writer of that state is `mms_line_transition`'s own draft→fired edge (every other fire —
-- `mms_fire_cart`, `mms_fire_line`, `mms_fire_pending_food`, `mms_fire_counter_cart` — stamps a
-- deadline). So both halves:
--   a) the edge stops making it: draft→fired stamps fire_at = now(). Not coalesce — the only fire_at a
--      DRAFT can carry is the leftover of this same function's fired→draft edge (which keeps it), and
--      keeping it would back-date the ticket (instant red) or re-hold it on a deadline nobody set.
--   b) the two kitchen guards read a NULL fire_at as due (`fire_at is null or fire_at <= now()`), so a
--      row made before this migration is movable too. A HELD or in-grace line always carries a future
--      fire_at, so neither guard admits anything the board had not already shown as live.
-- Restated from 20260716000000_w3_kitchen.sql §4 and §7 (the latest definitions); every other
-- clause is byte-identical. The draft→fired edge's missing MODE guard is M240 and is NOT changed here.
create or replace function public.mms_line_transition(p_line uuid, p_to text) returns integer
  language plpgsql set search_path = '' as $$
declare n integer;
begin
  if p_to not in ('draft','fired','in_progress','served','voided') then
    raise exception 'illegal target line state %', p_to;
  end if;
  update public.qr_cart_items ci
    set state = p_to,
        fire_at    = case when p_to = 'fired' then now() else ci.fire_at end,
        started_at = case when p_to in ('in_progress','served') then coalesce(ci.started_at, now())
                          else ci.started_at end,
        bumped_at  = case when p_to = 'served' then now() else ci.bumped_at end
    from public.qr_carts c
    where ci.id = p_line and c.id = ci.cart_id
      and (c.status = 'open' or (c.status = 'paid' and p_to in ('in_progress','served')))
      and (p_to not in ('in_progress','served')
           or (ci.fire_at is null or ci.fire_at <= now()))
      and (
        (p_to = 'fired'       and ci.state = 'draft') or
        (p_to = 'in_progress' and ci.state = 'fired') or
        (p_to = 'served'      and ci.state in ('fired','in_progress')) or
        (p_to = 'draft'       and ci.state = 'fired') or
        (p_to = 'voided'      and ci.state in ('draft','fired','in_progress','served'))
      );
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.mms_line_transition(uuid, text) from public, anon, authenticated;
grant execute on function public.mms_line_transition(uuid, text) to service_role;

create or replace function public.mms_bump_ticket(p_cart uuid, p_lines uuid[]) returns integer
  language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.qr_cart_items ci
    set state = 'served',
        started_at = coalesce(ci.started_at, now()),
        bumped_at = now()
    from public.qr_carts c
    where ci.id = any(p_lines)
      and ci.cart_id = p_cart
      and c.id = ci.cart_id
      and c.status in ('open','paid')
      and ci.state in ('fired','in_progress')
      and (ci.fire_at is null or ci.fire_at <= now());
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.mms_bump_ticket(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.mms_bump_ticket(uuid, uuid[]) to service_role;

-- ── 7. clearing a counter order — the SENT check and the cancel, one locked decision ─────────────
-- Codex r2 on #308 (P2): `clearTable` read the lines + `mms_now` and cancelled the cart in a SEPARATE
-- write, so a Send committing, or a line crossing its grace, between the two cancelled a cart holding
-- due kitchen food — the KDS drops the ticket and the no-show (its only audited exit) is unreachable.
-- Here the refusal and the cancel are one transaction under the locks: the cart row FOR UPDATE first
-- (the fire's, the undo's and the no-show's lock order), then the cart's lines FOR UPDATE — the
-- kitchen's own writers (`mms_line_transition`, `mms_bump_ticket`) lock only the line, so without
-- this a draft→fired edge committing mid-decision would still slip past the cart lock. `now()` is
-- fixed for the transaction, so no line crosses its grace between the check and the cancel.
-- SENT is `mms_counter_no_show`'s predicate EXACTLY (past its grace) — an in-grace line is still the
-- sender's to undo and never reached the KDS, so it clears, as before.
-- Returns 'ok' (cancelled) | 'sent' | 'not_found' | 'not_counter' | 'not_open'; every refusal returns
-- before any write. A payment in flight is NOT re-checked here: the caller refuses it first
-- (`paymentInFlightReason`, which also reads the split shares), exactly as for a table's clear.
create or replace function public.mms_clear_counter_cart(p_cart_id uuid)
  returns text
  language plpgsql set search_path = '' as $$
declare v_sess uuid; v_cart_status text; v_qr text; v_sess_mode text;
begin
  -- Different local names from the no-show's on purpose: every line here is unique in this file,
  -- so each mutant in scripts/verify-mode-authority.mjs patches exactly one function.
  select c.session_id, c.status, s.qr_code, s.mode
    into v_sess, v_cart_status, v_qr, v_sess_mode
    from public.qr_carts c
    join public.table_sessions s on s.id = c.session_id
    where c.id = p_cart_id
    for update of c;
  if v_sess is null then return 'not_found'; end if;
  if v_sess_mode <> 'pickup' or v_qr not like 'reg-%' then return 'not_counter'; end if;
  if v_cart_status <> 'open' then return 'not_open'; end if;
  perform 1 from public.qr_cart_items where cart_id = p_cart_id for update;
  if exists (
       select 1 from public.qr_cart_items ci
        where ci.cart_id = p_cart_id
          and ci.state in ('fired', 'in_progress', 'served')
          and ci.fulfillment <> 'grocery'
          and not ci.comped
          and (ci.fire_at is null or ci.fire_at <= now())) then
    return 'sent';
  end if;
  update public.qr_carts c set status = 'cancelled' where c.id = p_cart_id and c.status = 'open';
  return 'ok';
end $$;
revoke all on function public.mms_clear_counter_cart(uuid) from public, anon, authenticated;
grant execute on function public.mms_clear_counter_cart(uuid) to service_role;
