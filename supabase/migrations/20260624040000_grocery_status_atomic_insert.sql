-- Grocery barcodes are stored in qr_cart_items.menu_item_id alongside menu UUIDs, so the
-- status-atomic insert primitive must accept text (not uuid). This lets Scan & Go reuse the
-- same open-cart guarded merge-or-insert path as restaurant adds.
drop function if exists public.mms_cart_item_insert_if_open(uuid, uuid, text, jsonb, integer, integer, uuid, text);

create function public.mms_cart_item_insert_if_open(
  p_cart_id uuid,
  p_menu_item_id text,
  p_name text,
  p_modifiers jsonb,
  p_unit_price_cents integer,
  p_tax_cents integer,
  p_by_seat uuid,
  p_fulfillment text
) returns uuid
  language sql set search_path = '' as $$
  insert into public.qr_cart_items
    (cart_id, menu_item_id, name, qty, modifiers, unit_price_cents, tax_cents, by_seat, fulfillment)
  select p_cart_id, p_menu_item_id, p_name, 1, p_modifiers, p_unit_price_cents, p_tax_cents, p_by_seat,
         p_fulfillment
  from public.qr_carts
  where id = p_cart_id and status = 'open'
  returning id;
$$;

revoke all on function public.mms_cart_item_insert_if_open(uuid, text, text, jsonb, integer, integer, uuid, text)
  from anon, authenticated;
grant execute on function public.mms_cart_item_insert_if_open(uuid, text, text, jsonb, integer, integer, uuid, text)
  to service_role;
