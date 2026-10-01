-- Phase 2f · P2v — a COUNTER order (phone / walk-up) may cook before it is paid.
--
-- OWNER DECISION 1 (2026-09-24): staff may Send a `reg-` counter order to the kitchen before payment;
-- the ticket, the lane, the floor card and the table page read "Unpaid — collect at pickup" until it
-- is settled. Decision 7 (2026-09-30): the arm is recorded (7a), a no-show writes off SENT food only
-- through the existing loss gate (7b), a name is required to send and locked once food is in (7c).
--
-- ## Why a NEW staff-only fire, not a widening of `mms_fire_cart`
-- `mms_fire_cart` is also the DINER's send (`sendToKitchen` in lib/cart.ts). /api/session refuses a
-- diner both CREATING a reserved code and JOINING an active `reg-` session (`reservedCodeRefusal`,
-- lib/session-code.ts — the join refusal since Codex r3 on #308), so no diner JWT should ever name a
-- counter cart; widening `mms_fire_cart` would still hand an unpaid fire to whichever diner path is
-- the next to reach one. So the rule stays out of the diner's send entirely, and — defence in depth
-- — the functions below are revoked from public/anon/authenticated and granted to service_role
-- only; their callers are staff Server Actions behind the staff gate.
--
-- ## The `reg-` authority chain
-- A `reg-` code is minted only by `openRegisterOrder` (service role, staff-gated); no insert policy
-- exists on `table_sessions`; /api/session refuses to create a reserved code, or to join a `reg-`
-- one. Every function below re-states the counter predicate IN its statement:
-- `s.mode = 'pickup' and s.qr_code like 'reg-%'`
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
-- `mms_resolve_approval` (approvals → line) and — restated in §9 (Codex r3 on #308) —
-- `mms_void_line` / `mms_request_approval` (cart FOR SHARE → line; they locked the line only).
-- Two-session PROOF exists for exactly two pairs, in scripts/verify-counter-fire-race.mjs (both
-- orders each, with the locks deleted as mutants): the fire against the name clear, and the fire
-- against the sweeper. The fire/undo/no-show/settle orderings on one cart rest on the same cart-row
-- lock by construction and are pinned single-session only (P2F.15e, P2F.18); the no-show's
-- approvals-before-lines order and the undo's cart lock are documented survivors in
-- scripts/verify-mode-authority.mjs with no two-session harness (filed). The no-show's LINES lock is
-- what orders it after a kitchen Start (`mms_line_transition` locks only the line) — the harness's (j).
-- `clearTable`'s counter refusal decides under the cart lock, the cart's pending approvals' locks AND
-- the lines' locks (§7, `mms_clear_counter_cart`); its orderings — against a kitchen fire, a settle,
-- and an approval being resolved (both ways) — are the harness's (e), (f), (i) and (i2).
-- Every statement that locks ALL of a cart's lines at once (the no-show, the Clear, the merge's
-- source) locks them `order by id`, and so does `mms_bump_ticket` (§6) before it serves several lines
-- of one ticket — the kitchen's bump holds no cart lock, so without one row order on both sides a
-- bump and a no-show/Clear/merge on the same cart could each hold a line the other wants (40P01).
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
-- holding ANY KITCHEN line — SENT without the comped filter (`counterKitchenLine` in
-- lib/counter-order.ts: a comped dish is still on the KDS and in the bag), in-grace included (it
-- will reach the KDS within seconds). The no-show writes off SENT lines PAST their grace
-- (`fire_at is null or fire_at <= now()`); an in-grace line is still the sender's to undo, and the
-- no-show returns it to draft. So every exempt session has an exit: a settle, a no-show that is
-- never 'nothing_sent' once the grace has run, or a Clear (a comped-only order — the Clear, like the
-- no-show, does not count a comp as sent).

-- ## M171
-- The sweeper restatement exempts an UNPAID counter order with kitchen food only; the dine-in half
-- of M171 (a 4h-expired dine-in session orphaning fired food) is unchanged and still open.
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
  -- The LINES, in id order (the header's lock order): what orders this after a kitchen Start, which
  -- locks only the line — without it a line started mid-decision is written off as uncooked.
  perform 1 from public.qr_cart_items where cart_id = p_cart_id order by id for update;
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

-- ── 5. the sweeper: an unpaid counter order with kitchen food is never swept ────────────────────
-- Restated from 20260621000000_abuse_limits.sql. A `reg-` session whose OPEN cart holds a KITCHEN line
-- (the header's definition: SENT with comps INCLUDED, in-grace included) stays active past its expiry
-- — otherwise the KDS drops a ticket mid-cook, the floor and the lane lose it, and Settle, No-show and
-- Clear all become unreachable over an open cart with food on it (the M171 shape). A comped dish is
-- kitchen food too (`counterKitchenLine`): an order whose only kitchen food is comped would otherwise
-- be swept with its cart left open — off the KDS and the lane, unreachable by the Clear that is its
-- exit. Such an order stays on the floor and the lane until it is paid, written off, or cleared.
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
               and ci.fulfillment <> 'grocery'));
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
-- clause is byte-identical, except that `mms_bump_ticket` now LOCKS its lines `order by id` before
-- its update (the header's lock order: the bump holds no cart lock, and the no-show, the counter
-- Clear and the merge lock a whole cart's lines in id order — one row order on both sides, so a bump
-- and any of them on one cart cannot deadlock). The draft→fired edge's missing MODE guard is M240
-- and is NOT changed here.
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
  perform 1 from public.qr_cart_items where id = any(p_lines) and cart_id = p_cart order by id for update;
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
-- (the fire's, the undo's and the no-show's lock order), then the cart's PENDING approvals, then the
-- cart's lines FOR UPDATE (in id order — the header's) — the
-- kitchen's own writers (`mms_line_transition`, `mms_bump_ticket`) lock only the line, so without
-- this a draft→fired edge committing mid-decision would still slip past the cart lock. `now()` is
-- fixed for the transaction, so no line crosses its grace between the check and the cancel.
-- SENT is `mms_counter_no_show`'s predicate EXACTLY (past its grace) — an in-grace line is still the
-- sender's to undo and never reached the KDS, so it clears, as before.
-- Returns 'ok' (cancelled) | 'sent' | 'not_found' | 'not_counter' | 'not_open'; every refusal returns
-- before any write. A payment in flight is NOT re-checked here: the caller refuses it first
-- (`paymentInFlightReason`, which also reads the split shares), exactly as for a table's clear.
--
-- Pending S2.4 requests (Phase 2f self-review): a cancelled cart's request can never resolve
-- honestly, so an 'ok' supersedes them — the no-show's and the merge's word — in the same write.
-- They are LOCKED before the lines, the no-show's cart → approvals → lines order: `mms_resolve_approval`
-- takes its approval row and then the line, reading the cart's status from its statement snapshot,
-- so a resolve that waited on this Clear's line lock would resume reading the cart 'open' and approve
-- a void on the cancelled cart. Holding the approval first makes it wait HERE instead, and re-read
-- its row as 'superseded' ('already_resolved'); and taking the approvals before the lines is what
-- keeps that pair deadlock-free (resolve: approval → line). The harness's (i) and (i2).
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
  perform 1 from public.mms_approvals where cart_id = p_cart_id and status = 'pending' order by id for update;
  perform 1 from public.qr_cart_items where cart_id = p_cart_id order by id for update;
  if exists (
       select 1 from public.qr_cart_items ci
        where ci.cart_id = p_cart_id
          and ci.state in ('fired', 'in_progress', 'served')
          and ci.fulfillment <> 'grocery'
          and not ci.comped
          and (ci.fire_at is null or ci.fire_at <= now())) then
    return 'sent';
  end if;
  update public.mms_approvals a set status = 'superseded', resolved_at = now()
    where a.cart_id = p_cart_id and a.status = 'pending';
  update public.qr_carts c set status = 'cancelled' where c.id = p_cart_id and c.status = 'open';
  return 'ok';
end $$;
revoke all on function public.mms_clear_counter_cart(uuid) from public, anon, authenticated;
grant execute on function public.mms_clear_counter_cart(uuid) to service_role;

-- ── 8. merging a counter order — the refusal decided under the merge's own locks ─────────────────
-- Codex r3 on #308 (P1): `mergeTables` refused a counter target, and a counter source with SENT food,
-- from a read of the lines it made BEFORE calling `mms_merge_table_orders` — and the RPC re-checked
-- neither. A Send (`mms_fire_counter_cart`) committing between that read and the RPC's cart lock was
-- re-parented as fired food onto a non-counter pickup cart: off the KDS (an open non-counter cart does
-- not cook — `kdsLineGate`), no longer flagged Unpaid on the lane, and cooked and charged to THAT
-- customer once they paid. The rule now lives in the RPC, after the cart lock (which a Send also takes
-- first, so a Send either committed before it — and is seen — or waits and then finds the source
-- cancelled), and after the source's pending approvals and its LINES are locked (the kitchen's
-- draft→fired edge locks only the line). Counter = `s.mode = 'pickup' and s.qr_code like 'reg-%'`;
-- SENT = `mms_counter_no_show`'s predicate exactly. Refusals are RETURN values, before any write:
--   -2 — the target is a counter order (one customer's bag, never a merge target);
--   -1 — the counter source holds SENT food.
-- `mergeTables` keeps its own read as the fast path (it names the refusal before the promo and
-- pay-guard reads) and maps both values to the same copy. The two-session proof — a Send, and a
-- kitchen fire, committing while the merge waits — is scripts/verify-counter-fire-race.mjs (g, g2).
--
-- Restated from 20260827000000_m109_merge_matches_mode.sql (M109 — the latest definition): two
-- declarations and the block after the S3.2 secured-tab check are new; everything else is
-- byte-identical, including the header comments M109 wrote. Same signature, SECURITY DEFINER,
-- search_path and grants. The M109 mutants in scripts/verify-mode-authority.mjs patch THIS file now.
create or replace function public.mms_merge_table_orders(p_source_cart uuid, p_target_cart uuid)
  returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_src_session uuid;
  v_moved integer := 0;
  r record;
  v_match uuid;
  v_match_qty integer;
  v_folded boolean;      -- did the fold actually land? (not "was a match found")
  v_moved_qty integer;   -- what a re-parent ACTUALLY moved, read back from the row
  v_src_mode text;       -- M109
  v_tgt_mode text;       -- M109
  v_src_is_counter boolean;   -- Phase 2f · Codex r3 on #308
  v_tgt_is_counter boolean;   -- Phase 2f · Codex r3 on #308
begin
  if p_source_cart = p_target_cart then
    raise exception 'merge requires two different carts';
  end if;

  -- Row-lock both carts, ordered by id to avoid a deadlock with a concurrent reverse-direction merge.
  perform 1 from public.qr_carts where id in (p_source_cart, p_target_cart) and status = 'open'
    order by id for update;

  -- S2-audit: both carts open AND both tables still active (a closed session can't accept a fold).
  if (select count(*) from public.qr_carts c
        where c.id in (p_source_cart, p_target_cart) and c.status = 'open'
          and exists (select 1 from public.table_sessions s
                        where s.id = c.session_id and s.status <> 'closed')) <> 2 then
    raise exception 'both carts must be open and their tables active to merge (source=% target=%)',
      p_source_cart, p_target_cart;
  end if;

  -- M109: …and both tables the same KIND. Until now this rule existed only at `floor.ts:666`, in
  -- front of a service_role RPC — the invariant asserted in one place and enforced in another, which
  -- is precisely what M100 cost one function over. Read unlocked: `mode` has no writer anywhere, and
  -- a lock here would oppose `mms_sweep_expired_sessions`'s scan order (see the header).
  select s.mode into v_src_mode from public.qr_carts c
    join public.table_sessions s on s.id = c.session_id where c.id = p_source_cart;
  select s.mode into v_tgt_mode from public.qr_carts c
    join public.table_sessions s on s.id = c.session_id where c.id = p_target_cart;
  -- The null test is BELT and fails closed on purpose — see the header. Without it `null <> null`
  -- is null, which `if` treats as false, and an unreadable mode would be admitted rather than refused.
  if v_src_mode is null or v_tgt_mode is null or v_src_mode <> v_tgt_mode then
    raise exception 'both tables must be the same kind to merge (source=% target=%)',
      p_source_cart, p_target_cart;
  end if;

  -- S3.2: never merge a secured tab (the card-on-file sidecar can't follow a cancelled source cart).
  if exists (select 1 from public.qr_carts
               where id in (p_source_cart, p_target_cart) and tab_type = 'secure') then
    raise exception 'cannot merge a secured tab (source=% target=%)', p_source_cart, p_target_cart;
  end if;

  -- Phase 2f · Codex r3 on #308 (P1): a COUNTER order in a merge, decided under this function's locks.
  -- `mergeTables` refused a counter target and a counter source with sent food from its OWN read of
  -- the lines, before this RPC — so a Send (`mms_fire_counter_cart`) committing between that read and
  -- the cart lock above re-parented unpaid, cooking food onto a non-counter cart: off the KDS (an open
  -- non-counter pickup cart does not cook) and onto another customer's bill. The rule lives HERE now.
  -- Counter = `mms_counter_no_show`'s predicate, read unlocked for the reason `mode` is above: neither
  -- column has a writer outside an INSERT, and a session lock would oppose the sweeper's order.
  -- Refusals are RETURN values, before any write: -2 = the target is a counter order (never a merge
  -- target — one customer's bag, not a table); -1 = the counter source holds SENT food.
  select s.mode = 'pickup' and s.qr_code like 'reg-%' into v_src_is_counter
    from public.qr_carts c join public.table_sessions s on s.id = c.session_id
    where c.id = p_source_cart;
  select s.mode = 'pickup' and s.qr_code like 'reg-%' into v_tgt_is_counter
    from public.qr_carts c join public.table_sessions s on s.id = c.session_id
    where c.id = p_target_cart;
  if v_tgt_is_counter then
    return -2;
  end if;
  if v_src_is_counter then
    -- Lock order: approvals before lines — `mms_counter_no_show`'s and `mms_resolve_approval`'s (the
    -- supersede below re-takes these rows). The LINES are locked too because the kitchen's own
    -- draft→fired edge (`mms_line_transition`) locks only the line: the cart lock above cannot order
    -- it, and without this a fire committing mid-decision would still re-parent due food. (One line
    -- each on purpose: verify-merge-race.mjs anchors a mutant on the fold's lone `for update;` line.)
    perform 1 from public.mms_approvals where cart_id = p_source_cart and status = 'pending' for update;
    perform 1 from public.qr_cart_items where cart_id = p_source_cart order by id for update;
    -- SENT = `mms_counter_no_show`'s exact predicate: past its grace. An in-grace line never reached
    -- the KDS and is still the sender's to undo; drafts, grocery and comped lines merge as before.
    if exists (
         select 1 from public.qr_cart_items src_ci
          where src_ci.cart_id = p_source_cart
            and src_ci.state in ('fired', 'in_progress', 'served')
            and src_ci.fulfillment <> 'grocery'
            and not src_ci.comped
            and (src_ci.fire_at is null or src_ci.fire_at <= now())) then
      return -1;
    end if;
    -- An IN-GRACE fired line passes the refusal (it never reached the KDS) — but it must not arrive on
    -- the target still 'fired' with the counter's deadline and batch: a pay-first target fires only
    -- DRAFTS once paid (`mms_fire_pending_food`), so it would skip that schedule and go live on the
    -- counter's clock — early on a slotted ticket. Back to draft, exactly as the no-show does (the
    -- undo's own edge); the lines are already locked above.
    update public.qr_cart_items set state = 'draft', fire_at = null, fire_batch = null
      where cart_id = p_source_cart and state = 'fired' and fire_at > now();
  end if;

  select session_id into v_src_session from public.qr_carts where id = p_source_cart;

  -- S5: supersede the source cart's pending approvals FIRST, so this fn and mms_resolve_approval both lock
  -- mms_approvals before qr_cart_items (same order → no deadlock). A moved line's request can't honestly
  -- resolve here; 'superseded' (not 'denied') keeps the audit truthful (re-request on the merged table).
  update public.mms_approvals
    set status = 'superseded', resolved_at = now()
    where cart_id = p_source_cart and status = 'pending';

  for r in
    select id, menu_item_id, qty, state, notes, added_by, fulfillment, unit_price_cents,
           coalesce((select jsonb_agg(e order by e) from jsonb_array_elements_text(modifiers) e),
                    '[]'::jsonb) as modkey
    from public.qr_cart_items
    where cart_id = p_source_cart
      and state <> 'voided' and not comped         -- S2.3: never move a $0'd line's qty into the target
  loop
    -- Fold ONLY into a chargeable, same-state, UNASSIGNED, NOTE-LESS target line: same kitchen state
    -- (S6), not voided/comped (S2.3), by_seat null (R5c), and neither side carries a kitchen note (W3b —
    -- a note is per-line identity; folding would apply/erase it on units it doesn't belong to).
    -- No match → re-parent as its own null line (assignable later).
    v_match := null;
    v_folded := false;
    if r.notes is null then
      select t.id, t.qty into v_match, v_match_qty
      from public.qr_cart_items t
      where t.cart_id = p_target_cart
        and t.by_seat is null
        -- M96: …and the SAME adder. `by_seat is null` no longer implies "nobody's": a line
        -- re-parented by an earlier merge is seatless but keeps its `added_by`, so without this a
        -- twice-merged table folds B's dish into A's line and deletes B's record of it.
        -- `is not distinct from` because two nulls must match — `null = null` is null, which would
        -- stop every staff-added line from folding.
        and t.added_by is not distinct from r.added_by
        -- M97: …and the same TAG. `insertOrIncLine` has always refused this fold; the merge path
        -- never learned it. Plain `=` — see the header: `fulfillment` is `not null`, unlike the
        -- `added_by` line directly above, which is why the two operators differ by one row.
        and t.fulfillment = r.fulfillment
        -- M98: …and the same PRICE. A line quoted at $3.00 must not be charged at $10.00 because a
        -- manager edited the menu between the two carts opening. Plain `=` — see the header: this
        -- column is `not null` with no default and never admitted a null, which is a DIFFERENT
        -- argument from the `fulfillment` line above and the opposite of the `added_by` line above
        -- that.
        and t.unit_price_cents = r.unit_price_cents
        and t.notes is null
        and t.state = r.state
        and t.state <> 'voided' and not t.comped
        and t.menu_item_id = r.menu_item_id
        and coalesce((select jsonb_agg(e order by e) from jsonb_array_elements_text(t.modifiers) e),
                     '[]'::jsonb) = r.modkey
      limit 1
      for update;   -- M97/Codex-P2: hold the row we are about to bump (see the note below)
    end if;

    if v_match is not null and v_match_qty + r.qty <= 99 then
      -- M97 (Codex round 1, P2 — real, and specific to THIS change). The cursor above runs on a READ
      -- COMMITTED snapshot taken when the loop opened, and `fulfillment` is MUTABLE: a diner can tap
      -- For-here/To-go mid-merge and `mms_set_line_fulfillment` will commit it, because that function
      -- takes no lock on `qr_carts` — it only READS `status` through an `exists`, and a reader never
      -- blocks against `for update`. So `r.fulfillment` can be stale by the time we act on it, and the
      -- fold would delete a now-dine-in row into a to-go target: exactly the wrong tax this migration
      -- exists to prevent, reintroduced through the back door.
      --
      -- M96 needed none of this because `added_by` is immutable by trigger — it CANNOT change under a
      -- cursor. Matching on a mutable column is a different problem and needs a different guarantee.
      --
      -- Both halves are closed, and neither widens the lock footprint beyond the row being written:
      --   · the TARGET is held by the `for update` on the match query above;
      --   · the SOURCE re-asserts its own identity IN THE DELETE, so a row that changed under us is
      --     simply not deleted. That is the same in-statement re-assertion `mms_set_line_fulfillment`
      --     does one function over ("Re-assert open + draft + food IN THE WRITE"), and the same rule
      --     CLAUDE.md states for every guarded mutation.
      --
      -- ⚠️ `qty` is in that list, and the first draft of this guard OMITTED it — caught by adversarial
      -- review, HIGH. It is the one re-asserted column the very next statement does ARITHMETIC on, and
      -- it is just as mutable as the tag: `mms_cart_item_inc_qty` updates `qr_cart_items` joined to
      -- `qr_carts` as a plain READER of `status`, so it too commits straight through the cart lock. A
      -- diner tapping `+` mid-merge leaves tag/state/notes/comped all unchanged, so the delete would
      -- have SUCCEEDED and the target been bumped by the stale `r.qty` — one unit silently destroyed:
      -- not charged, not cooked, no error, and the source session closes a few statements later. A
      -- guard that re-asserts four of five mutable columns is not a guard, it is a narrower race.
      --
      -- Delete FIRST and bump only if it landed: bumping first would double-count a source row the
      -- delete then refused. A refused delete falls through to the re-parent, which is always safe —
      -- the line survives as its own row and nobody's attribution or tag is lost.
      delete from public.qr_cart_items
        where id = r.id
          and fulfillment = r.fulfillment
          and state = r.state
          and qty = r.qty
          and unit_price_cents = r.unit_price_cents   -- M98; see the header for why this differs
                                                     -- from the `qty` case it sits beside
          and notes is null
          and not comped;
      if found then
        update public.qr_cart_items set qty = v_match_qty + r.qty where id = v_match;
        -- Exact, not optimistic: the delete just re-asserted `qty = r.qty`, so r.qty IS current.
        v_moved := v_moved + r.qty;
        v_folded := true;
      end if;
    end if;

    if not v_folded then
      -- Re-parent, losing the SEAT (a source seat is not a member of the target session) but NOT the
      -- adder: this update never names `added_by`, and M87's keep-trigger only fires when something
      -- tries to change it. The person who chose the dish is still that person after a merge.
      --
      -- ⚠️ ELIGIBILITY IS RE-ASSERTED HERE TOO (Codex round 2, P2). The loop selected only chargeable
      -- lines (`state <> 'voided' and not comped`, S2.3), but that was a snapshot: `mms_void_line` can
      -- void or comp this row afterwards, and an unconditional re-parent would then carry a $0'd line
      -- into the target — contradicting the very invariant the loop's WHERE states, and stranding the
      -- accepted void audit on a cart that is about to be cancelled. A row that became ineligible is
      -- LEFT ON THE SOURCE, where its own audit already lives. This branch is now reached both by a
      -- no-match and by a refused delete, so guarding it once covers both.
      --
      -- And `v_moved` counts what MOVED, not what the snapshot said (Codex round 2, P3): a concurrent
      -- `+` makes the guarded delete refuse, the row re-parents at its CURRENT qty of 2, and adding
      -- the stale 1 would hand `mergeTables` an audit number that never happened. Read it back.
      update public.qr_cart_items
        set cart_id = p_target_cart, by_seat = null
        where id = r.id and state <> 'voided' and not comped
        returning qty into v_moved_qty;
      if found then v_moved := v_moved + v_moved_qty; end if;
    end if;
  end loop;

  -- S3.1 [A1]: carry a trust tab forward (inherit up, earliest open time; a secure target is refused above).
  update public.qr_carts tgt
    set tab_type = case when tgt.tab_type = 'secure' then 'secure' else 'trust' end,
        tab_opened_at = least(coalesce(tgt.tab_opened_at, src.tab_opened_at), src.tab_opened_at)
    from public.qr_carts src
    where tgt.id = p_target_cart and src.id = p_source_cart and src.tab_type <> 'none';

  -- Bump the target so floor/realtime peers re-sync; cancel the now-empty source cart + close its session.
  update public.qr_carts set updated_at = now() where id = p_target_cart;
  update public.qr_carts set status = 'cancelled' where id = p_source_cart;
  update public.table_sessions set status = 'closed' where id = v_src_session and status <> 'closed';

  return v_moved;
end; $$;
revoke all on function public.mms_merge_table_orders(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mms_merge_table_orders(uuid, uuid) to service_role;

-- ── 9. a void or an approval request — the cart locked BEFORE the line ───────────────────────────
-- Codex r3 on #308 (P2): both locked only the LINE (`for update of ci`) and read `qr_carts.status`
-- through the join. A no-show (§4) holds the cart, the pending approvals and every line of the cart
-- FOR UPDATE; a void on one of its draft lines waited on the line lock, and when the no-show committed
-- it resumed with the cart row as its STATEMENT snapshot saw it — 'open' — and recorded an approved
-- void (a loss) or a pending request on the now-cancelled cart. A row lock on the line cannot fix
-- that: Postgres re-checks only the row it locked, never a joined row it merely read.
--
-- So each takes the line's cart row FOR SHARE first, then reads (and locks) the line in a NEW
-- statement — a fresh READ COMMITTED snapshot, taken while holding the cart, so the status it reads is
-- the committed one and cannot move until this transaction ends. FOR SHARE, not FOR UPDATE: it
-- conflicts with every writer that changes a cart's status (the no-show, the merge, a counter Clear
-- and the counter fire hold FOR UPDATE; a settle claim's UPDATE takes FOR NO KEY UPDATE), which is all
-- the ordering this needs, while two voids on one table still run side by side. It is the P2cy line
-- RPCs' shape (20260929000000: the parent cart FOR SHARE, then the line).
--
-- Lock order — cart → line — is the global one: the no-show (cart → approvals → lines), a counter
-- Clear (cart → approvals → lines), the merge (carts → approvals → lines) and the counter fire (cart → session
-- → lines) all take the cart before any line. `mms_resolve_approval` (approvals → line) is deliberately NOT restated to
-- take the cart: between its approvals row and the line it would take the cart, the reverse of the
-- no-show's cart → approvals, which is a deadlock cycle. It does not need it — the no-show, the counter
-- Clear (§7) and the merge all lock the pending approvals before touching a line and supersede them
-- when they write, so a resolve that waited re-reads its row as 'superseded' and answers
-- 'already_resolved'.
--
-- The line read is bound to the locked cart (`ci.cart_id = v_*_cart`): a merge moves lines under its
-- own cart lock, so a line re-parented while this waited is followed to its new cart, bounded at three.
-- The two-session proof is scripts/verify-counter-fire-race.mjs (h, h2).
--
-- Restated from 20260622100000_s2_polish.sql (the latest definitions): the declarations gain one
-- local each and the single locked read becomes the loop above; every other line is byte-identical.
-- Same signatures, SECURITY INVOKER (as before), search_path and grants.
create or replace function public.mms_void_line(
  p_line uuid,
  p_action text,
  p_reason text,
  p_initiator uuid,
  p_approver uuid default null
) returns text language plpgsql set search_path = '' as $$
declare
  v_cart uuid; v_session uuid; v_state text; v_qty integer; v_price integer; v_name text;
  v_comped boolean; v_status text; v_loss integer; v_cooked boolean; v_needs_approval boolean;
  v_max_loss integer; v_approver_role text; v_approver_active boolean;
  v_locked boolean; v_locked_at timestamptz; v_settle_at timestamptz; v_gate text;
  v_void_cart uuid;  -- Codex r3 on #308: the cart locked before the line
begin
  if p_action not in ('void','comp') then raise exception 'illegal void action %', p_action; end if;

  -- Codex r3 on #308 (P2): the line's CART first, FOR SHARE, then the line (see the section header).
  -- The line read is bound to the locked cart: a merge re-parents under its own cart lock, so a line
  -- that moved while this waited is followed to its new cart (bounded — a line re-parented three
  -- times in one void is gone from under it, and says so).
  for v_try in 1..3 loop
    select ci.cart_id into v_void_cart from public.qr_cart_items ci where ci.id = p_line;
    if v_void_cart is null then return 'not_found'; end if;
    perform 1 from public.qr_carts where id = v_void_cart for share;
    select ci.cart_id, c.session_id, ci.state, ci.qty, ci.unit_price_cents, ci.name, ci.comped, c.status,
           c.locked, c.locked_at, c.settle_at
      into v_cart, v_session, v_state, v_qty, v_price, v_name, v_comped, v_status,
           v_locked, v_locked_at, v_settle_at
      from public.qr_cart_items ci
      join public.qr_carts c on c.id = ci.cart_id
      where ci.id = p_line and ci.cart_id = v_void_cart
      for update of ci;
    exit when v_cart is not null;
  end loop;
  if v_cart is null then return 'not_found'; end if;
  if v_status <> 'open' then return 'not_open'; end if;
  if (v_locked and v_locked_at > now() - interval '5 minutes')
     or (v_settle_at is not null and v_settle_at > now() - interval '10 minutes') then
    return 'in_flight';
  end if;
  if v_state = 'voided' then return 'already_done'; end if;
  if p_action = 'comp' and v_comped then return 'already_done'; end if;

  v_cooked := v_state in ('in_progress','served');
  v_loss := v_price * v_qty;
  select max_loss_cents into v_max_loss from public.mms_loss_config where id;
  v_max_loss := coalesce(v_max_loss, 2000);
  v_needs_approval := (p_action = 'comp') or v_cooked or (v_loss > v_max_loss);
  v_gate := case when p_action = 'comp' then 'comp' when v_cooked then 'cooked'
                 when v_loss > v_max_loss then 'ceiling' else 'solo' end;

  if v_needs_approval then
    if p_approver is null then return 'needs_approval'; end if;
    if p_approver = p_initiator then return 'self_approve'; end if;
    select role, active into v_approver_role, v_approver_active
      from public.staff where user_id = p_approver;
    if not coalesce(v_approver_active, false) or v_approver_role not in ('manager','owner') then
      return 'bad_approver';
    end if;
  end if;

  if p_action = 'void' then
    update public.qr_cart_items set state = 'voided' where id = p_line;
  else
    update public.qr_cart_items set comped = true where id = p_line;
  end if;

  insert into public.mms_approvals
    (kind, status, cart_id, session_id, line_id, line_name, qty, amount_cents,
     reason_code, cooked, initiator_staff_id, approver_staff_id, gate_reason)
    values
    (p_action, 'approved', v_cart, v_session, p_line, v_name, v_qty, v_loss,
     p_reason, v_cooked, p_initiator, p_approver, v_gate);

  return 'ok';
end $$;
revoke all on function public.mms_void_line(uuid, text, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.mms_void_line(uuid, text, text, uuid, uuid) to service_role;

create or replace function public.mms_request_approval(
  p_line uuid,
  p_action text,
  p_reason text,
  p_initiator uuid
) returns text language plpgsql set search_path = '' as $$
declare
  v_cart uuid; v_session uuid; v_state text; v_qty integer; v_price integer; v_name text;
  v_comped boolean; v_status text; v_loss integer; v_cooked boolean; v_needs_approval boolean;
  v_max_loss integer; v_gate text;
  v_req_cart uuid;  -- Codex r3 on #308: the cart locked before the line
begin
  if p_action not in ('void','comp') then raise exception 'illegal action %', p_action; end if;

  -- Codex r3 on #308 (P2): the cart FOR SHARE, then the line — `mms_void_line`'s order, same reasons.
  for v_try in 1..3 loop
    select ci.cart_id into v_req_cart from public.qr_cart_items ci where ci.id = p_line;
    if v_req_cart is null then return 'not_found'; end if;
    perform 1 from public.qr_carts where id = v_req_cart for share;
    select ci.cart_id, c.session_id, ci.state, ci.qty, ci.unit_price_cents, ci.name, ci.comped, c.status
      into v_cart, v_session, v_state, v_qty, v_price, v_name, v_comped, v_status
      from public.qr_cart_items ci
      join public.qr_carts c on c.id = ci.cart_id
      where ci.id = p_line and ci.cart_id = v_req_cart
      for update of ci;
    exit when v_cart is not null;
  end loop;
  if v_cart is null then return 'not_found'; end if;
  if v_status <> 'open' then return 'not_open'; end if;
  if v_state = 'voided' or v_comped then return 'already_done'; end if;

  v_cooked := v_state in ('in_progress','served');
  v_loss := v_price * v_qty;
  select max_loss_cents into v_max_loss from public.mms_loss_config where id;
  v_max_loss := coalesce(v_max_loss, 2000);
  v_needs_approval := (p_action = 'comp') or v_cooked or (v_loss > v_max_loss);
  if not v_needs_approval then return 'no_approval_needed'; end if;
  v_gate := case when p_action = 'comp' then 'comp' when v_cooked then 'cooked' else 'ceiling' end;

  begin
    insert into public.mms_approvals
      (kind, status, cart_id, session_id, line_id, line_name, qty, amount_cents,
       reason_code, cooked, initiator_staff_id, approver_staff_id, gate_reason)
      values
      (p_action, 'pending', v_cart, v_session, p_line, v_name, v_qty, v_loss,
       p_reason, v_cooked, p_initiator, null, v_gate);
  exception when unique_violation then
    return 'already_pending';
  end;

  return 'ok';
end $$;
revoke all on function public.mms_request_approval(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.mms_request_approval(uuid, text, text, uuid) to service_role;
