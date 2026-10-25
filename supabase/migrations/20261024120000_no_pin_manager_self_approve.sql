-- No-PIN (owner, 2026-10-24: "Remove PIN for all requests").
--
-- The manager PIN step-up is gone from every request — a void or comp that needs a manager, a counter
-- no-show, an approval from the queue and a refund. A manager or owner now acts on their OWN sign-in:
-- the app passes the signed-in caller as the approver when their role is manager or owner, and a
-- server's ask goes to the approvals queue as before.
--
-- So the two functions a manager initiates AND approves in one write drop their `p_approver =
-- p_initiator` refusal ('self_approve'). Everything else is restated byte for byte from
-- `20261001000000_p2f_counter_cook_before_paid.sql` (the latest definition of each): the approver must
-- still be an ACTIVE manager or owner ('bad_approver' otherwise), and the audit row still records both
-- the initiator and the approver.
--
-- `mms_resolve_approval` is unchanged: a request is a SERVER's ask (a manager now acts directly), and
-- the asker still cannot approve their own request — they may only close it.
--
-- ⚠️ APPLY THIS BEFORE THE APP THAT DROPS THE PIN DEPLOYS. Until it applies, the old function answers
-- a manager acting on their own sign-in with 'self_approve', which the app reads as "ask another
-- manager": a void or comp then needs a SECOND manager to approve the request (the asker cannot), and a
-- gated no-show has no request queue at all, so nobody on the shift can write one off. (The blind
-- review on #373 caught an earlier copy of this header claiming either order was safe.)
--
-- Verify after apply: `has_function_privilege('service_role', …, 'execute')` true and anon /
-- authenticated false for both signatures, and neither `prosrc` contains `self_approve`.

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
    -- No-PIN (owner, 2026-10-24): a signed-in manager or owner approves their OWN write-off — the
    -- role check below is the whole rule now; the initiator = approver refusal is gone.
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
    -- No-PIN (owner, 2026-10-24): a signed-in manager or owner approves their OWN void or comp — the
    -- role check below is the whole rule now; the initiator = approver refusal is gone.
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
