-- 20260622080000_approvals_primitive.sql — S2.4: generalize the loss-audit into a request → approve/deny
-- → audit primitive, with DEFAULT-SAFE pending states (D1–D4).
--
-- S2.3 only does the MANAGER-PRESENT path: mms_void_line applies the void/comp and writes an 'approved'
-- mms_approvals row in one shot (the manager is right there, PIN in hand). S2.4 adds the DEFERRED path —
-- a server REQUESTS when no manager is at hand:
--   • mms_request_approval creates a 'pending' row and DOES NOT TOUCH THE LINE (still charged, food not
--     un-fired) — the default-safe state (D2). It never auto-resolves.
--   • mms_resolve_approval is the manager's decision: APPROVE applies the recorded action (void→'voided',
--     comp→comped) + flips the row to 'approved'; DENY flips to 'denied' and leaves the line live. The
--     approver must be an ACTIVE manager/owner AND not the initiator (D3), and a row resolves only ONCE
--     (idempotent on status='pending' — D4).
-- The in-person path reuses the SAME pending→approved/denied states so the deferred owner-remote/SMS path
-- (out of scope) is a later notify-channel add, not a refactor.
--
-- Realtime: mms_approvals stays OFF the publication (its RLS is owner-read; realtime would only reach
-- owners). The approvals queue polls (low-frequency manager surface) — no RLS broadening.
-- Additive/idempotent: a new column, a guarded unique index, two new fns. (mms_void_line is unchanged.)

-- When the request was decided (approved/denied); null while pending. Completes the two-party audit.
alter table public.mms_approvals add column if not exists resolved_at timestamptz;

-- At most ONE open request per line (D4 — a double-tap / two servers can't stack pending voids on a line).
-- Partial: only 'pending' rows are constrained; the many historical 'approved'/'denied' rows are free.
create unique index if not exists mms_approvals_one_pending_per_line
  on public.mms_approvals(line_id) where status = 'pending';

-- ── mms_request_approval — create a PENDING request, leave the line untouched (default-safe) ─────────────
-- Mirrors mms_void_line's server-derived gate, but instead of applying the action it records a pending row.
-- Refuses when the action wouldn't need approval anyway (the caller should just do it solo) or the line is
-- already voided/comped (nothing to request). INVOKER + service-role-only (the cart-RPC precedent).
create or replace function mms_request_approval(
  p_line uuid,
  p_action text,                  -- 'void' | 'comp'
  p_reason text,
  p_initiator uuid
) returns text language plpgsql set search_path = '' as $$
declare
  v_cart uuid; v_session uuid; v_state text; v_qty integer; v_price integer; v_name text;
  v_comped boolean; v_status text; v_loss integer; v_cooked boolean; v_needs_approval boolean;
  v_max_loss integer;
begin
  if p_action not in ('void','comp') then raise exception 'illegal action %', p_action; end if;

  select ci.cart_id, c.session_id, ci.state, ci.qty, ci.unit_price_cents, ci.name, ci.comped, c.status
    into v_cart, v_session, v_state, v_qty, v_price, v_name, v_comped, v_status
    from public.qr_cart_items ci
    join public.qr_carts c on c.id = ci.cart_id
    where ci.id = p_line
    for update of ci;
  if v_cart is null then return 'not_found'; end if;
  if v_status <> 'open' then return 'not_open'; end if;
  if v_state = 'voided' or v_comped then return 'already_done'; end if;  -- nothing to request

  -- Same SERVER-derived gate as mms_void_line: if it wouldn't need a manager, there's nothing to request.
  v_cooked := v_state in ('in_progress','served');
  v_loss := v_price * v_qty;
  select max_loss_cents into v_max_loss from public.mms_loss_config where id;
  v_max_loss := coalesce(v_max_loss, 2000);
  v_needs_approval := (p_action = 'comp') or v_cooked or (v_loss > v_max_loss);
  if not v_needs_approval then return 'no_approval_needed'; end if;

  -- Default-safe: record the pending request; the line is NOT changed (still charged, food not un-fired).
  -- The partial unique index makes a second pending request for the line a constraint violation → caught
  -- as 'already_pending' so the app surfaces it cleanly rather than 500ing.
  begin
    insert into public.mms_approvals
      (kind, status, cart_id, session_id, line_id, line_name, qty, amount_cents,
       reason_code, cooked, initiator_staff_id, approver_staff_id)
      values
      (p_action, 'pending', v_cart, v_session, p_line, v_name, v_qty, v_loss,
       p_reason, v_cooked, p_initiator, null);
  exception when unique_violation then
    return 'already_pending';
  end;

  return 'ok';
end $$;

revoke all on function public.mms_request_approval(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.mms_request_approval(uuid, text, text, uuid) to service_role;

-- ── mms_resolve_approval — the manager's decision on a pending request ───────────────────────────────────
-- APPROVE applies the recorded action (void→'voided' / comp→comped) and flips the row 'approved'; DENY
-- flips 'denied' and leaves the line live. Resolves ONLY a still-'pending' row (idempotent on a re-tap /
-- replay — D4). The approver must be an ACTIVE manager/owner (re-checked in SQL, not just a PIN) AND not
-- the initiator (D3). APPROVE requires the line still present + cart still open (a void on a settled line
-- is the S4.3 refund seam) — if it's already in the target state (someone did it inline), that's a benign
-- idempotent 'ok'. INVOKER + service-role-only.
create or replace function mms_resolve_approval(
  p_id uuid,
  p_approver uuid,
  p_decision text                 -- 'approve' | 'deny'
) returns text language plpgsql set search_path = '' as $$
declare
  v_kind text; v_status text; v_line uuid; v_initiator uuid;
  v_approver_role text; v_approver_active boolean;
  v_line_state text; v_line_comped boolean; v_cart_status text;
begin
  if p_decision not in ('approve','deny') then raise exception 'illegal decision %', p_decision; end if;

  -- Lock the request row; resolve only a still-pending one (idempotent).
  select kind, status, line_id, initiator_staff_id
    into v_kind, v_status, v_line, v_initiator
    from public.mms_approvals where id = p_id for update;
  if v_kind is null then return 'not_found'; end if;
  if v_status <> 'pending' then return 'already_resolved'; end if;

  -- The decision authorizes a HIGHER ROLE, not merely a correct PIN (the PIN was verified app-side):
  -- the approver must be an ACTIVE manager/owner and cannot be the requester (D3).
  if p_approver = v_initiator then return 'self_approve'; end if;
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

  -- APPROVE: apply the recorded action. Re-check the line is still actionable on the open cart (the
  -- request may be stale — settled / cleared). Already-in-target-state ⇒ benign idempotent close.
  select ci.state, ci.comped, c.status
    into v_line_state, v_line_comped, v_cart_status
    from public.qr_cart_items ci join public.qr_carts c on c.id = ci.cart_id
    where ci.id = v_line for update of ci;
  if v_line_state is null then return 'stale'; end if;        -- line gone (e.g. merged away)
  if v_cart_status <> 'open' then return 'not_open'; end if;  -- settled/closed → S4.3 refund, not here

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
    set status = 'approved', approver_staff_id = p_approver, resolved_at = now()
    where id = p_id;
  return 'ok';
end $$;

revoke all on function public.mms_resolve_approval(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.mms_resolve_approval(uuid, uuid, text) to service_role;
