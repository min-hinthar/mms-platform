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

-- When the request was decided (approved/denied/superseded); null while pending. Completes the audit.
alter table public.mms_approvals add column if not exists resolved_at timestamptz;

-- 'superseded' = a pending request auto-closed because the table MERGED out from under it (the line moved
-- to another cart, so the original request can't honestly resolve — re-request on the merged table). A
-- distinct terminal status keeps the audit honest (it was NOT a manager's denial). Re-add the named CHECK.
alter table public.mms_approvals drop constraint if exists mms_approvals_status_check;
alter table public.mms_approvals add constraint mms_approvals_status_check
  check (status in ('pending','approved','denied','superseded'));

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
  if v_line_state is null then return 'stale'; end if;        -- line genuinely gone (defensive; merge
                                                              -- supersedes pending rows, so this is rare)
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

-- ── mms_merge_table_orders — supersede the SOURCE cart's pending approval requests on merge ──────────────
-- S2.4 interaction (caught in pre-PR review): a one-tap merge re-parents the source cart's still-active
-- lines to the target (and the source session closes). A void/comp request that was PENDING on a source
-- line is default-safe (the line wasn't changed), so without this the line would move and a later approve
-- would apply the loss to the WRONG (target) table + write a misleading audit. Fix: terminally
-- 'superseded' every pending request on the source cart, IN THE SAME TRANSACTION as the re-parent, so the
-- queue clears and the loss can be cleanly re-requested on the merged table. Body otherwise identical to
-- 20260622070000 (the void/comp-skip guards on both scans are preserved). Re-runnable; grant reasserted.
create or replace function public.mms_merge_table_orders(p_source_cart uuid, p_target_cart uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_src_session uuid;
  v_moved integer := 0;
  r record;
  v_match uuid;
  v_match_qty integer;
begin
  if p_source_cart = p_target_cart then
    raise exception 'merge requires two different carts';
  end if;

  perform 1 from public.qr_carts where id in (p_source_cart, p_target_cart) and status = 'open'
    order by id for update;
  if (select count(*) from public.qr_carts c
        where c.id in (p_source_cart, p_target_cart) and c.status = 'open'
          and exists (select 1 from public.table_sessions s
                        where s.id = c.session_id and s.status <> 'closed')) <> 2 then
    raise exception 'both carts must be open and their tables active to merge (source=% target=%)',
      p_source_cart, p_target_cart;
  end if;

  select session_id into v_src_session from public.qr_carts where id = p_source_cart;

  for r in
    select id, menu_item_id, qty,
           coalesce((select jsonb_agg(e order by e) from jsonb_array_elements_text(modifiers) e),
                    '[]'::jsonb) as modkey
    from public.qr_cart_items
    where cart_id = p_source_cart and state <> 'voided' and not comped
  loop
    select t.id, t.qty into v_match, v_match_qty
    from public.qr_cart_items t
    where t.cart_id = p_target_cart
      and t.menu_item_id = r.menu_item_id
      and t.state <> 'voided' and not t.comped
      and coalesce((select jsonb_agg(e order by e) from jsonb_array_elements_text(t.modifiers) e),
                   '[]'::jsonb) = r.modkey
    limit 1;

    if v_match is not null and v_match_qty + r.qty <= 99 then
      update public.qr_cart_items set qty = v_match_qty + r.qty where id = v_match;
      delete from public.qr_cart_items where id = r.id;
    else
      update public.qr_cart_items set cart_id = p_target_cart, by_seat = null where id = r.id;
    end if;
    v_moved := v_moved + r.qty;
  end loop;

  -- S2.4: close any pending approval request on the source cart — its line just moved tables, so the
  -- request can't honestly resolve here. 'superseded' (not 'denied') keeps the audit truthful.
  update public.mms_approvals
    set status = 'superseded', resolved_at = now()
    where cart_id = p_source_cart and status = 'pending';

  update public.qr_carts set updated_at = now() where id = p_target_cart;
  update public.qr_carts set status = 'cancelled' where id = p_source_cart;
  update public.table_sessions set status = 'closed' where id = v_src_session and status <> 'closed';

  return v_moved;
end; $$;

revoke all on function public.mms_merge_table_orders(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mms_merge_table_orders(uuid, uuid) to service_role;
