-- 20261008120000_m184_approval_refuses_when_changed.sql — M184 (owner ruling #5): an approval applies
-- ONLY to the line as it was asked about; and round 3 D2's `close` arm.
--
-- ⚠️ PROD: applied ONE FILE AT A TIME through the Supabase MCP `apply_migration` on the owner's go
-- (OWNER_RULINGS_2026-10-07 #5), never `db push` (M125). Verify after: ONE definition of
-- `public.mms_resolve_approval(uuid, uuid, text)`, `has_function_privilege('service_role', …)` true
-- and anon / authenticated false, `prosrc` carrying the three decisions.
--
-- THE DEFECT (M184, OPEN-ITEMS; #275's six-lens audit). `mms_request_approval` snapshots `qty` and
-- `amount_cents` at the ask and locks neither; `staffSetQty` carries no state restriction. So a manager
-- read "1× Mohinga · $14.00" on the queue, typed a PIN, and the S1 resolve applied the void/comp to the
-- line AS IT STOOD THEN — a $12 comp on screen took $36 off the bill. S1 made the LEDGER honest
-- (`amount_cents` re-derived at resolve), which is exactly what made the divergence invisible.
--
-- THE FIX. APPROVE compares the live line against the request's own snapshot — the qty AND the amount
-- (qty × unit price; a re-price at the same qty is a change too) — and returns 'changed' with the line
-- UNTOUCHED when they differ. Nothing is taken off; the asker asks again at the new figure. The queue
-- card draws the same compare (`lib/approval-state.ts`) so the manager sees "Changed after Thiri asked"
-- before any PIN is typed; this is the write's own guard, under the line's lock.
--
-- THE `close` ARM (round 3, D2 — carried here as PATH_DESIGN_2026-10-07.md records it: "same function,
-- signature and grants; no CHECK change", disclosed on M184's merge-window line). A request whose table
-- has already PAID — or whose cart was cancelled by a clear outside M182's RPC, or whose line changed
-- after the ask — cannot honestly be approved, and recording it 'denied' told the owner's loss list the
-- manager said no. `p_decision = 'close'` writes 'superseded' (the status 20260622080000 already
-- declared for "the original request can't honestly resolve"), records the PIN-proven closer in
-- `approver_staff_id` and `resolved_at`, and never touches the line, which stays charged (a later
-- refund is its own record). It is ADMITTED only once the cart has left 'open' OR the line is no longer
-- the one asked about ('still_open' otherwise), and the request's OWN asker may close it (the self rule
-- is approve/deny's). Deny is unchanged. No backfill: existing 'denied' rows are history.
--
-- THE BLIND PASS ON #333 (2026-10-09, before any apply) widened two rules, both in this one file:
--   · A line REMOVED OR MADE FREE since the ask (a manager's own PIN void or comp — `mms_request_approval`
--     refuses a line that already was) is not the line asked about either: APPROVE returns 'changed'
--     (approving it would record the loss a second time) and CLOSE admits it.
--   · `mms_request_approval` is restated to refuse 'in_flight' while the cart is pay-locked or settling
--     (the SAME fresh windows as `mms_void_line` and the approve arm). A staff settle door reads the
--     pending requests AFTER taking the settlement freeze; under the cart's FOR SHARE lock a request
--     either commits before the freeze (and that read sees it) or sees the freeze and refuses — so no
--     request can land between a door's acknowledgement and its write. The TS action already refused
--     this from its own read; the RPC now refuses it atomically.
--
-- Pinned by supabase/tests/m184_approval_refuses_when_changed_test.sql (named in ci.yml) and
-- scripts/verify-mode-authority.mjs (suite `m184`). Idempotent: `create or replace` + restated grants,
-- for both functions; neither signature changes (no generated-types drift).

create or replace function public.mms_resolve_approval(
  p_id uuid,
  p_approver uuid,
  p_decision text
) returns text language plpgsql set search_path = '' as $$
declare
  v_kind text; v_status text; v_line uuid; v_initiator uuid;
  v_req_qty integer; v_req_amount integer;
  v_approver_role text; v_approver_active boolean;
  v_line_state text; v_line_comped boolean; v_cart_status text;
  v_qty integer; v_price integer; v_amount integer;
  v_locked boolean; v_locked_at timestamptz; v_settle_at timestamptz;
  v_changed boolean;
begin
  if p_decision not in ('approve','deny','close') then raise exception 'illegal decision %', p_decision; end if;

  select kind, status, line_id, initiator_staff_id, qty, amount_cents
    into v_kind, v_status, v_line, v_initiator, v_req_qty, v_req_amount
    from public.mms_approvals where id = p_id for update;
  if v_kind is null then return 'not_found'; end if;
  if v_status <> 'pending' then return 'already_resolved'; end if;

  -- D2: the request's own asker may CLOSE it (nothing about food is decided); approve and deny keep
  -- the self rule — nobody approves or refuses their own request.
  if p_decision <> 'close' and p_approver = v_initiator then return 'self_approve'; end if;
  select role, active into v_approver_role, v_approver_active
    from public.staff where user_id = p_approver;
  if not coalesce(v_approver_active, false) or v_approver_role not in ('manager','owner') then
    return 'bad_approver';
  end if;

  if p_decision = 'deny' then
    update public.mms_approvals
      set status = 'denied', approver_staff_id = p_approver, resolved_at = now()
      where id = p_id;
    return 'ok';
  end if;

  if p_decision = 'close' then
    -- M184 · D2: admitted only once the cart has left 'open' (paid, or cancelled by a clear) OR the
    -- line is no longer the one asked about (gone, or its qty / amount moved) — never on a live,
    -- unchanged request, which still has a real decision to make. No lock: the line is untouched.
    select ci.state, ci.comped, c.status, ci.qty, ci.unit_price_cents
      into v_line_state, v_line_comped, v_cart_status, v_qty, v_price
      from public.qr_cart_items ci join public.qr_carts c on c.id = ci.cart_id
      where ci.id = v_line;
    v_changed := v_line_state is null
      or v_line_state = 'voided' or coalesce(v_line_comped, false)
      or v_qty is distinct from v_req_qty
      or (v_price * v_qty) is distinct from v_req_amount;
    if coalesce(v_cart_status, 'gone') = 'open' and not v_changed then return 'still_open'; end if;
    update public.mms_approvals
      set status = 'superseded', approver_staff_id = p_approver, resolved_at = now()
      where id = p_id;
    return 'ok';
  end if;

  -- APPROVE: lock the line + cart; re-check actionable, NOT mid-payment, and that the line is STILL
  -- the one the manager read (M184) before applying anything.
  select ci.state, ci.comped, c.status, ci.qty, ci.unit_price_cents, c.locked, c.locked_at, c.settle_at
    into v_line_state, v_line_comped, v_cart_status, v_qty, v_price, v_locked, v_locked_at, v_settle_at
    from public.qr_cart_items ci join public.qr_carts c on c.id = ci.cart_id
    where ci.id = v_line for update of ci;
  if v_line_state is null then return 'stale'; end if;
  if v_cart_status <> 'open' then return 'not_open'; end if;
  if (v_locked and v_locked_at > now() - interval '5 minutes')
     or (v_settle_at is not null and v_settle_at > now() - interval '10 minutes') then
    return 'in_flight';                            -- B2: don't drop a line from a capturing PI's base
  end if;
  -- M184: a line already removed or made free since the ask (its loss is already recorded) is not
  -- the line asked about; nothing is applied, the request closes instead.
  if v_line_state = 'voided' or v_line_comped then
    return 'changed';
  end if;
  -- M184: the qty AND the amount, against the request's snapshot. A match leaves `v_amount` equal to
  -- the snapshot by construction; the S1 re-derive below stays so the audit row is the line's own.
  if v_qty is distinct from v_req_qty or (v_price * v_qty) is distinct from v_req_amount then
    return 'changed';
  end if;
  v_amount := v_price * v_qty;

  if v_kind = 'void' then
    if v_line_state <> 'voided' then
      update public.qr_cart_items set state = 'voided' where id = v_line;
    end if;
  elsif v_kind = 'comp' then
    if not v_line_comped then
      update public.qr_cart_items set comped = true where id = v_line;
    end if;
  end if;

  update public.mms_approvals
    set status = 'approved', approver_staff_id = p_approver, resolved_at = now(),
        amount_cents = v_amount                    -- S1: honest loss, re-derived at resolve
    where id = p_id;
  return 'ok';
end $$;
revoke all on function public.mms_resolve_approval(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.mms_resolve_approval(uuid, uuid, text) to service_role;

-- ── mms_request_approval, restated (the blind pass on #333): refused while the cart pays or settles ──
-- The body is 20261001000000_p2f_counter_cook_before_paid.sql's, verbatim, plus the freeze read and the
-- 'in_flight' refusal (the windows are mms_void_line's). Same signature, same grants.
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
  v_locked boolean; v_locked_at timestamptz; v_settle_at timestamptz;
begin
  if p_action not in ('void','comp') then raise exception 'illegal action %', p_action; end if;

  -- Codex r3 on #308 (P2): the cart FOR SHARE, then the line — `mms_void_line`'s order, same reasons.
  for v_try in 1..3 loop
    select ci.cart_id into v_req_cart from public.qr_cart_items ci where ci.id = p_line;
    if v_req_cart is null then return 'not_found'; end if;
    perform 1 from public.qr_carts where id = v_req_cart for share;
    select ci.cart_id, c.session_id, ci.state, ci.qty, ci.unit_price_cents, ci.name, ci.comped, c.status,
           c.locked, c.locked_at, c.settle_at
      into v_cart, v_session, v_state, v_qty, v_price, v_name, v_comped, v_status,
           v_locked, v_locked_at, v_settle_at
      from public.qr_cart_items ci
      join public.qr_carts c on c.id = ci.cart_id
      where ci.id = p_line and ci.cart_id = v_req_cart
      for update of ci;
    exit when v_cart is not null;
  end loop;
  if v_cart is null then return 'not_found'; end if;
  if v_status <> 'open' then return 'not_open'; end if;
  -- M184 (the blind pass on #333): never between a settle door's acknowledgement and its write.
  if (v_locked and v_locked_at > now() - interval '5 minutes')
     or (v_settle_at is not null and v_settle_at > now() - interval '10 minutes') then
    return 'in_flight';
  end if;
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
