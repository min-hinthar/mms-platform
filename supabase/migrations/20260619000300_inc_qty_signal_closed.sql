-- 20260619000300_inc_qty_signal_closed.sql
-- Make mms_cart_item_inc_qty RAISE when the parent cart is no longer open, instead of silently
-- no-op'ing (M1·P1.2 review). The increment was the one mutation path whose 0-row result the caller
-- couldn't see: on a closed-cart status flip it returned success, so addItem announced "Added to
-- your order" and fired analytics for an item that wasn't added. Now it's symmetric with the
-- insert/setQty RPCs (which signal a closed cart). The 99-cap stays a *silent* no-op on an OPEN
-- cart — that's intended (you can't add a 100th), and is distinguished from the closed case here.
-- Signature is unchanged (returns void) so the generated types don't drift; only the body changes.

create or replace function mms_cart_item_inc_qty(p_id uuid) returns void
  language plpgsql set search_path = '' as $$
declare v_open boolean;
begin
  update public.qr_cart_items ci
    set qty = ci.qty + 1
    from public.qr_carts c
    where ci.id = p_id and c.id = ci.cart_id and c.status = 'open' and ci.qty < 99;
  if not found then
    -- 0 rows: the cart is closed/gone, OR it's open but the line is already at the 99 cap.
    select (c.status = 'open') into v_open
      from public.qr_cart_items ci
      join public.qr_carts c on c.id = ci.cart_id
      where ci.id = p_id;
    if v_open is distinct from true then
      raise exception 'cart is no longer open' using errcode = 'P0001';
    end if;
    -- else: open cart at the per-line cap → intentional silent no-op
  end if;
end $$;
revoke all on function public.mms_cart_item_inc_qty(uuid) from public;
grant execute on function public.mms_cart_item_inc_qty(uuid) to service_role;
