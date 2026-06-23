-- 20260622100000_s2_polish.sql — S2 audit follow-ups (the deferred SQL set; docs/S2_AUDIT.md).
--   S7  give each fire-batch a discrete id so "one Undo = one Send" is STRUCTURAL, not max(fire_at)
--       clock-resolution-dependent.
--   S3  mms_now() — a DB-clock source so the KDS grace cutoff isn't read on the (skewable) app clock.
--   gate-reason — snapshot WHY a void/comp was server-solo vs manager-gated, so the audit ledger is
--       reconstructable even if mms_loss_config later changes (auth-lens N-1 / audit completeness).
-- Additive: 2 nullable columns + a new fn + create-or-replace on fire/undo/void/request. Idempotent.

alter table public.qr_cart_items add column if not exists fire_batch uuid;     -- one id per mms_fire_cart call
alter table public.mms_approvals add column if not exists gate_reason text;     -- 'comp'|'cooked'|'ceiling'|'solo'

-- ── S3: a DB-clock source (now()), so a Vercel/DB clock skew can't make the KDS show an undoable line ───
create or replace function mms_now() returns timestamptz
  language sql stable set search_path = '' as $$ select now() $$;
revoke all on function public.mms_now() from public, anon, authenticated;
grant execute on function public.mms_now() to service_role;

-- ── S7: mms_fire_cart stamps ONE batch id across the lines it fires ──────────────────────────────────────
create or replace function mms_fire_cart(p_cart_id uuid) returns integer
  language plpgsql set search_path = '' as $$
declare n integer; v_batch uuid := gen_random_uuid();   -- one id for THIS send (not per-row)
begin
  update public.qr_cart_items ci
    set state = 'fired', fire_at = now() + interval '10 seconds', fire_batch = v_batch
    from public.qr_carts c
    join public.table_sessions s on s.id = c.session_id
    where ci.cart_id = p_cart_id
      and c.id = ci.cart_id
      and c.status = 'open'
      and s.mode = 'dinein'
      and ci.state = 'draft';
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.mms_fire_cart(uuid) from public, anon, authenticated;
grant execute on function public.mms_fire_cart(uuid) to service_role;

-- ── S7: mms_undo_fire reverses exactly the LATEST batch (by id), not a max(fire_at) tie ──────────────────
create or replace function mms_undo_fire(p_cart_id uuid) returns integer
  language plpgsql set search_path = '' as $$
declare n integer;
begin
  update public.qr_cart_items ci
    set state = 'draft', fire_at = null, fire_batch = null
    from public.qr_carts c
    join public.table_sessions s on s.id = c.session_id
    where ci.cart_id = p_cart_id
      and c.id = ci.cart_id
      and c.status = 'open'
      and s.mode = 'dinein'
      and ci.state = 'fired'
      and not ci.comped                              -- a comped line is a committed loss (S2-audit S4)
      and ci.fire_at > now()                         -- still in grace
      and ci.fire_batch = (                          -- the single most-recent in-grace batch (structural)
        select ci2.fire_batch from public.qr_cart_items ci2
        where ci2.cart_id = p_cart_id and ci2.state = 'fired' and not ci2.comped and ci2.fire_at > now()
        order by ci2.fire_at desc limit 1
      );
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.mms_undo_fire(uuid) from public, anon, authenticated;
grant execute on function public.mms_undo_fire(uuid) to service_role;

-- ── gate-reason: mms_void_line records WHY it gated (restate the 090000 body + gate_reason) ──────────────
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
  v_locked boolean; v_locked_at timestamptz; v_settle_at timestamptz; v_gate text;
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

-- ── gate-reason: mms_request_approval records the gate too (restate the 080000 body + gate_reason) ───────
create or replace function mms_request_approval(
  p_line uuid,
  p_action text,
  p_reason text,
  p_initiator uuid
) returns text language plpgsql set search_path = '' as $$
declare
  v_cart uuid; v_session uuid; v_state text; v_qty integer; v_price integer; v_name text;
  v_comped boolean; v_status text; v_loss integer; v_cooked boolean; v_needs_approval boolean;
  v_max_loss integer; v_gate text;
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
