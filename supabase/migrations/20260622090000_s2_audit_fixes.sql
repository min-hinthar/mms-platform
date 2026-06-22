-- 20260622090000_s2_audit_fixes.sql — remediation of the S2 retrospective audit (docs/S2_AUDIT.md).
--
-- Fixes the SQL half of the three blockers + the SQL-clustered should-fixes:
--   B1  a comped line must be diner-IMMUTABLE → `and not comped` on the qty RPCs (the load-bearing layer;
--       the isomorphic gate is the client half).
--   B2  void/comp/RESOLVE must refuse while a diner card pay / split settle is in flight → an atomic
--       in-SQL pay-lock freshness check in mms_void_line + mms_resolve_approval (mirrors acquireCartLock;
--       5-min lock / 10-min settle TTLs, DB-clocked). Returns 'in_flight'.
--   S1  mms_resolve_approval re-derives amount_cents from the live line so the audit reflects what was
--       actually voided/comped, not the request-time snapshot.
--   S4  mms_undo_fire must not reverse a COMPED fired line (audit/state divergence + the main reachability
--       of B1) → `and not comped` in the UPDATE and the latest-batch subquery.
--   S5  reorder the merge's pending-approval supersede BEFORE the item re-parent loop, so merge and
--       mms_resolve_approval both acquire mms_approvals→qr_cart_items in the same order (kills the deadlock).
--   S6  the merge fold must match on `state` too, so a fired/in-progress line never folds into a draft
--       target (erasing kitchen state) and vice-versa.
--   S15 scope the mms_approvals owner-read policy `to authenticated` (silences advisor-0012; no behaviour
--       change — the predicate already denies all non-owners).
-- All create-or-replace / idempotent; grants reasserted. (UI + app-layer fixes ride the same PR, not SQL.)

-- ── B1: the qty RPCs become comped-aware (a comped line is a committed $0 decision — diner-immutable) ────
create or replace function mms_cart_item_set_qty_if_open(p_id uuid, p_qty integer) returns integer
  language plpgsql set search_path = '' as $$
declare n integer;
begin
  if p_qty <= 0 then
    delete from public.qr_cart_items ci
      using public.qr_carts c
      where ci.id = p_id and c.id = ci.cart_id and c.status = 'open' and not ci.comped;
  else
    update public.qr_cart_items ci set qty = p_qty
      from public.qr_carts c
      where ci.id = p_id and c.id = ci.cart_id and c.status = 'open' and not ci.comped;
  end if;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function mms_cart_item_inc_qty(p_id uuid) returns void
  language plpgsql set search_path = '' as $$
declare v_open boolean;
begin
  update public.qr_cart_items ci
    set qty = ci.qty + 1
    from public.qr_carts c
    where ci.id = p_id and c.id = ci.cart_id and c.status = 'open' and ci.qty < 99 and not ci.comped;
  if not found then
    -- 0 rows: cart closed/gone, OR open-but-at-the-99-cap, OR the line is comped (immutable). Only the
    -- closed-cart case signals; a capped or comped line is an intentional silent no-op.
    select (c.status = 'open') into v_open
      from public.qr_cart_items ci
      join public.qr_carts c on c.id = ci.cart_id
      where ci.id = p_id;
    if v_open is distinct from true then
      raise exception 'cart is no longer open' using errcode = 'P0001';
    end if;
  end if;
end $$;

-- ── S4: mms_undo_fire never reverses a comped line ──────────────────────────────────────────────────────
create or replace function mms_undo_fire(p_cart_id uuid) returns integer
  language plpgsql set search_path = '' as $$
declare n integer;
begin
  update public.qr_cart_items ci
    set state = 'draft', fire_at = null
    from public.qr_carts c
    join public.table_sessions s on s.id = c.session_id
    where ci.cart_id = p_cart_id
      and c.id = ci.cart_id
      and c.status = 'open'
      and s.mode = 'dinein'
      and ci.state = 'fired'
      and not ci.comped                            -- a comped line is a committed loss; undo must skip it
      and ci.fire_at > now()
      and ci.fire_at = (
        select max(ci2.fire_at) from public.qr_cart_items ci2
        where ci2.cart_id = p_cart_id and ci2.state = 'fired' and not ci2.comped and ci2.fire_at > now()
      );
  get diagnostics n = row_count;
  return n;
end $$;

-- ── B2: mms_void_line refuses while a diner pay / split settle is in flight (atomic, DB-clocked) ─────────
create or replace function mms_void_line(
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
  v_locked boolean; v_locked_at timestamptz; v_settle_at timestamptz;
begin
  if p_action not in ('void','comp') then raise exception 'illegal void action %', p_action; end if;

  select ci.cart_id, c.session_id, ci.state, ci.qty, ci.unit_price_cents, ci.name, ci.comped, c.status,
         c.locked, c.locked_at, c.settle_at
    into v_cart, v_session, v_state, v_qty, v_price, v_name, v_comped, v_status,
         v_locked, v_locked_at, v_settle_at
    from public.qr_cart_items ci
    join public.qr_carts c on c.id = ci.cart_id
    where ci.id = p_line
    for update of ci;
  if v_cart is null then return 'not_found'; end if;
  if v_status <> 'open' then return 'not_open'; end if;
  -- B2: a fresh single-pay lock (5m) or split-settle freeze (10m) means a PaymentIntent is being captured
  -- against the CURRENT base — changing it now would strand that charge. Refuse atomically (DB-clocked).
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
     reason_code, cooked, initiator_staff_id, approver_staff_id)
    values
    (p_action, 'approved', v_cart, v_session, p_line, v_name, v_qty, v_loss,
     p_reason, v_cooked, p_initiator, p_approver);

  return 'ok';
end $$;
revoke all on function public.mms_void_line(uuid, text, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.mms_void_line(uuid, text, text, uuid, uuid) to service_role;

-- ── B2 + S1: mms_resolve_approval gains the pay-lock guard AND re-derives the audited amount ────────────
create or replace function mms_resolve_approval(
  p_id uuid,
  p_approver uuid,
  p_decision text
) returns text language plpgsql set search_path = '' as $$
declare
  v_kind text; v_status text; v_line uuid; v_initiator uuid;
  v_approver_role text; v_approver_active boolean;
  v_line_state text; v_line_comped boolean; v_cart_status text;
  v_qty integer; v_price integer; v_amount integer;
  v_locked boolean; v_locked_at timestamptz; v_settle_at timestamptz;
begin
  if p_decision not in ('approve','deny') then raise exception 'illegal decision %', p_decision; end if;

  select kind, status, line_id, initiator_staff_id
    into v_kind, v_status, v_line, v_initiator
    from public.mms_approvals where id = p_id for update;
  if v_kind is null then return 'not_found'; end if;
  if v_status <> 'pending' then return 'already_resolved'; end if;

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

  -- APPROVE: lock the line + cart; re-check actionable, NOT mid-payment, and re-derive the amount so the
  -- durable audit reflects the line as it stands now (qty may have changed since the request — S1).
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

-- ── S5 + S6: merge supersedes pending approvals BEFORE re-parenting, and folds only same-state lines ────
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

  -- S5: supersede the source cart's pending approval requests FIRST, so this fn and mms_resolve_approval
  -- both lock mms_approvals before qr_cart_items (same order → no deadlock cycle). A moved line's request
  -- can't honestly resolve here; 'superseded' (not 'denied') keeps the audit truthful (re-request on the
  -- merged table).
  update public.mms_approvals
    set status = 'superseded', resolved_at = now()
    where cart_id = p_source_cart and status = 'pending';

  for r in
    select id, menu_item_id, qty, state,
           coalesce((select jsonb_agg(e order by e) from jsonb_array_elements_text(modifiers) e),
                    '[]'::jsonb) as modkey
    from public.qr_cart_items
    where cart_id = p_source_cart and state <> 'voided' and not comped
  loop
    select t.id, t.qty into v_match, v_match_qty
    from public.qr_cart_items t
    where t.cart_id = p_target_cart
      and t.menu_item_id = r.menu_item_id
      and t.state = r.state                        -- S6: only fold lines in the SAME kitchen state
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

  update public.qr_carts set updated_at = now() where id = p_target_cart;
  update public.qr_carts set status = 'cancelled' where id = p_source_cart;
  update public.table_sessions set status = 'closed' where id = v_src_session and status <> 'closed';

  return v_moved;
end; $$;
revoke all on function public.mms_merge_table_orders(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mms_merge_table_orders(uuid, uuid) to service_role;

-- ── S15: scope the owner-read policy to `authenticated` (advisor-0012 hygiene; predicate unchanged) ─────
drop policy if exists mms_approvals_owner_read on public.mms_approvals;
create policy mms_approvals_owner_read on public.mms_approvals for select to authenticated
  using (public.is_staff_at_least('owner'));
