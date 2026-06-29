-- ── mms_cart_item_assign — atomic, price-matched reassign-or-coalesce (R5c) ──────────────────────────
-- Per-seat lines (R5c) make `by_seat` part of a draft line's identity. Reassigning a line to a seat that
-- ALREADY owns a matching draft line must COALESCE (fold the qty) — else the diner ends with two identical
-- owned lines and the menu quick-stepper's `items.find` shows/edits only one (partial qty / partial remove)
-- while they're charged for both. The TS caller (lib/cart.ts assignLine) does the authz (member, canMutate,
-- target is a session member, cart open); this function does the FOLD atomically so it's money-safe:
--
--   • Price/tax match (snapshot-safe): a twin must share `unit_price_cents` AND `tax_cents`, so a fold can
--     NEVER change the cart total just because ownership was assigned (two adds at different menu-price/tax
--     snapshots stay SEPARATE lines instead of one inheriting the other's price).
--   • Atomic (race-safe): the moving line and the twin are taken `for update`, so a concurrent add (the
--     atomic inc_qty RPC) can't slip a unit between a stale read and the write — no lost units.
--   • 99-cap preserved; no re-pricing (units keep their server-derived snapshots); `qty>0` CHECK preserved
--     (the moving row is deleted whole on a fold, never zeroed).
--
-- No twin (or the fold would exceed 99) → a plain re-own (update by_seat). Returns nothing.
create or replace function mms_cart_item_assign(p_id uuid, p_seat uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_cart uuid;
  v_item text;
  v_ful text;
  v_qty int;
  v_price int;
  v_tax int;
  v_modkey jsonb;
  v_twin uuid;
  v_twin_qty int;
begin
  -- Lock the moving line + read its priced identity; it must still be a draft line.
  select ci.cart_id, ci.menu_item_id, ci.fulfillment, ci.qty, ci.unit_price_cents, ci.tax_cents,
         coalesce((select jsonb_agg(e order by e) from jsonb_array_elements_text(ci.modifiers) e),
                  '[]'::jsonb)
    into v_cart, v_item, v_ful, v_qty, v_price, v_tax, v_modkey
  from public.qr_cart_items ci
  where ci.id = p_id and ci.state = 'draft'
  for update;
  if v_cart is null then
    raise exception 'line is not an assignable draft (id=%)', p_id;
  end if;
  -- Status-atomic guard (parity with the sibling cart writes): only while the parent cart is still open.
  if not exists (select 1 from public.qr_carts where id = v_cart and status = 'open') then
    raise exception 'Cart is no longer open';
  end if;

  -- A twin already owned by the target seat with the SAME priced identity (item + fulfillment + modifiers +
  -- price + tax). Locked so a concurrent add can't race the qty we fold into.
  select t.id, t.qty into v_twin, v_twin_qty
  from public.qr_cart_items t
  where t.cart_id = v_cart
    and t.id <> p_id
    and t.by_seat = p_seat
    and t.state = 'draft'
    and t.comped = false
    and t.menu_item_id = v_item
    and t.fulfillment = v_ful
    and t.unit_price_cents = v_price
    and t.tax_cents = v_tax
    and coalesce((select jsonb_agg(e order by e) from jsonb_array_elements_text(t.modifiers) e),
                 '[]'::jsonb) = v_modkey
  limit 1
  for update;

  if v_twin is not null and v_twin_qty + v_qty <= 99 then
    update public.qr_cart_items set qty = v_twin_qty + v_qty where id = v_twin;
    delete from public.qr_cart_items where id = p_id;
  else
    update public.qr_cart_items set by_seat = p_seat where id = p_id;
  end if;
end; $$;

-- SECURITY DEFINER lockdown (parity with the other mms_* cart fns): never callable by anon/authenticated.
revoke all on function mms_cart_item_assign(uuid, uuid) from public, anon, authenticated;
grant execute on function mms_cart_item_assign(uuid, uuid) to service_role;
