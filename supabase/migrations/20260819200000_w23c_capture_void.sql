-- W23c — void the lines the kitchen ran out of, from inside the settlement that is holding the lock.
--
-- The manual-capture path (registry M69) gets one more look at the live catalog between a pickup
-- order's AUTHORIZATION and its capture. When a dish ran out in that window the line has to come off
-- the cart before the capture amount is derived, so the guest is charged for what they are actually
-- getting and no refund ever exists.
--
-- `mms_void_line` cannot do it. Its guard returns 'in_flight' whenever the cart is locked or
-- settling — which is exactly the state this path runs in, because `create-intent` acquired the pay
-- lock and never released it on the success route. That guard is correct for what it protects
-- against: a SECOND actor mutating a basket while money is moving on it. This caller is not a second
-- actor. It is the settlement itself, holding the lock, acting on its own basket, in the one moment
-- it is entitled to.
--
-- So this is a separate, deliberately narrow function rather than a widening of `mms_void_line`.
-- Loosening that guard would have opened the in-flight window to every void caller — the floor
-- console, the staff sheet, the approvals queue — to serve one path that already owns the lock.
--
-- Narrow means:
--   • DRAFT lines only. The same rule the availability gate itself uses (lib/availability.ts): a
--     fired line is already made, and nothing here should be able to un-sell food that exists. For a
--     pickup cart every line is draft until payment fires it, so this costs the path nothing.
--   • FOOD only. Grocery is self-scanned and already in the shopper's hands.
--   • Only the menu ids the caller names, which come from a live catalog read of THIS cart's lines.
--   • No comped lines: a comp is a committed $0 decision and voiding it would rewrite that decision.
--
-- Idempotent by construction: a redelivered webhook re-runs it, finds those lines already 'voided',
-- and voids nothing further. Returns the count so the caller can tell "voided 2" from "voided 0"
-- rather than assuming — a silent zero here would mean capturing the FULL amount for a basket the
-- kitchen cannot fill, which is the exact charge this slice exists to prevent.

create or replace function public.mms_void_unavailable_lines(
  p_cart uuid,
  p_menu_ids text[],
  p_initiator uuid default null
) returns integer language plpgsql security definer set search_path = '' as $$
declare v_session uuid; v_status text; v_count integer := 0; r record;
begin
  if p_menu_ids is null or array_length(p_menu_ids, 1) is null then return 0; end if;

  select c.session_id, c.status into v_session, v_status
    from public.qr_carts c where c.id = p_cart for update;
  if v_session is null then return 0; end if;
  -- The cart must still be OPEN. A settled/cancelled cart is not ours to edit, and reaching here on
  -- one means the authorization outlived its basket — the caller cancels rather than captures.
  if v_status <> 'open' then return -1; end if;

  for r in
    select ci.id, ci.name, ci.qty, ci.unit_price_cents
      from public.qr_cart_items ci
     where ci.cart_id = p_cart
       and ci.state = 'draft'
       and not ci.comped
       and ci.fulfillment in ('dinein','togo')
       and ci.menu_item_id = any(p_menu_ids)
  loop
    update public.qr_cart_items set state = 'voided' where id = r.id;
    -- The same two-party ledger every other void writes to, with W23a's `sold_out` reason code. The
    -- initiator is null: no human decided this, the catalog did — and inventing a staff id here
    -- would put a name against a decision nobody made.
    insert into public.mms_approvals
      (kind, status, session_id, line_id, line_name, qty, amount_cents, reason_code, cooked,
       initiator_staff_id, approver_staff_id)
      values ('void', 'approved', v_session, r.id, r.name, r.qty, r.unit_price_cents * r.qty,
              'sold_out', false, p_initiator, p_initiator);
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

revoke all on function public.mms_void_unavailable_lines(uuid, text[], uuid) from public, anon, authenticated;
grant execute on function public.mms_void_unavailable_lines(uuid, text[], uuid) to service_role;

comment on function public.mms_void_unavailable_lines(uuid, text[], uuid) is
  'W23c — drop the lines a pickup order can no longer be made from, called by the manual-capture '
  'path between authorization and capture while it holds the cart lock. Returns the number voided, '
  'or -1 when the cart is no longer open (the caller cancels the authorization instead).';
