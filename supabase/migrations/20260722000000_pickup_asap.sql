-- W5e — to-go ASAP↔scheduled choice at checkout.
--
-- Pickup scheduling (M2·P2.2) offered ONLY discrete capacity slots, and the menu forced a slot before
-- ordering. W5e adds an explicit "ASAP · make it now" choice alongside "Schedule a time". ASAP needs no
-- new fire primitive: `mms_fire_pending_food` (w3_kitchen) already fires a to-go line at
-- `greatest(coalesce(cart.fire_at, now()), now())`, so a cart with NO slot (fire_at NULL) fires
-- immediately at settlement. ASAP is therefore just "no slot" — and this RPC is how the checkout control
-- CLEARS a previously-chosen slot back to ASAP (the existing `mms_set_pickup_slot` only ever SETS one).
--
-- Money-invariant: pickup_slot/fire_at are fulfillment metadata, never price — getCartTotals reads
-- neither, so clearing a slot cannot move any amount.

-- Clear the cart's pickup slot (→ ASAP). Status-atomic (open carts only, guard IN the statement),
-- service-role-only. Returns a result discriminant mirroring mms_set_pickup_slot so the TS edge maps it.
create or replace function public.mms_clear_pickup_slot(p_cart_id uuid)
returns table(ok boolean, reason text)
language plpgsql volatile security definer set search_path = '' as $$
begin
  update public.qr_carts
     set pickup_slot = null,
         fire_at     = null,
         updated_at  = now()
   where id = p_cart_id and status = 'open';
  if not found then return query select false, 'cart_closed'; return; end if;
  return query select true, 'ok';
end; $$;
revoke all on function public.mms_clear_pickup_slot(uuid) from public, anon, authenticated;
grant execute on function public.mms_clear_pickup_slot(uuid) to service_role;
