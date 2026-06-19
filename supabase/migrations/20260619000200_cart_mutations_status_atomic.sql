-- 20260619000200_cart_mutations_status_atomic.sql
-- Two things (M1·P1.2 review): (a) carry the open-cart guard into the DB for the remaining
-- cart-mutation paths, and (b) close the EXECUTE-grant gap on all three cart RPCs.
--
-- (a) assertCartMember rejects a non-open cart at the app layer, but that check and the mutation are
--     separate round-trips — once P1.3 wires the Stripe webhook, a `status='paid'` flip can land in
--     the gap and a post-payment write would desync the fulfilled order from what Stripe captured.
--     mms_cart_item_inc_qty already folds `status='open'` into its UPDATE; these add the same guard
--     to the INSERT (new line) and the setQty UPDATE/DELETE, so every cart write is status-atomic.
--
-- (b) Postgres grants EXECUTE on a new function to PUBLIC by default, so an earlier
--     `revoke ... from anon, authenticated` is a NO-OP (the PUBLIC grant survives). Mirror the
--     established lockdown pattern (20260618000100): revoke from PUBLIC, re-grant only service_role —
--     applied here to inc_qty (created earlier with the ineffective revoke) and the two new fns. Kept
--     INVOKER, not DEFINER: the service-role caller already holds full rights, so DEFINER would only
--     widen the surface (advisor 0029 is exactly that anti-pattern).

-- Insert a new line only if the parent cart is still open. Returns the new id, or NULL when the
-- cart is not open (caller raises) — the qty(=1)/CHECK(1..99) invariants are unaffected.
create function mms_cart_item_insert_if_open(
  p_cart_id uuid, p_menu_item_id uuid, p_name text, p_modifiers jsonb,
  p_unit_price_cents integer, p_tax_cents integer, p_by_seat uuid
) returns uuid
  language sql set search_path = '' as $$
  insert into public.qr_cart_items
    (cart_id, menu_item_id, name, qty, modifiers, unit_price_cents, tax_cents, by_seat)
  select p_cart_id, p_menu_item_id, p_name, 1, p_modifiers, p_unit_price_cents, p_tax_cents, p_by_seat
  from public.qr_carts
  where id = p_cart_id and status = 'open'
  returning id;
$$;

-- Set a line's qty (or delete it when p_qty <= 0) only if the parent cart is open. Returns the
-- number of affected lines — 0 means the cart is no longer open (or the line is gone) and the
-- caller raises. p_qty is already bounded 0..99 by setQtyInput (Zod) + the column CHECK.
create function mms_cart_item_set_qty_if_open(p_id uuid, p_qty integer) returns integer
  language plpgsql set search_path = '' as $$
declare n integer;
begin
  if p_qty <= 0 then
    delete from public.qr_cart_items ci
      using public.qr_carts c
      where ci.id = p_id and c.id = ci.cart_id and c.status = 'open';
  else
    update public.qr_cart_items ci set qty = p_qty
      from public.qr_carts c
      where ci.id = p_id and c.id = ci.cart_id and c.status = 'open';
  end if;
  get diagnostics n = row_count;
  return n;
end $$;

-- Lock down EXECUTE: drop the implicit PUBLIC grant, re-grant only the service-role caller.
revoke all on function public.mms_cart_item_inc_qty(uuid) from public;
grant execute on function public.mms_cart_item_inc_qty(uuid) to service_role;

revoke all on function
  public.mms_cart_item_insert_if_open(uuid, uuid, text, jsonb, integer, integer, uuid) from public;
grant execute on function
  public.mms_cart_item_insert_if_open(uuid, uuid, text, jsonb, integer, integer, uuid) to service_role;

revoke all on function public.mms_cart_item_set_qty_if_open(uuid, integer) from public;
grant execute on function public.mms_cart_item_set_qty_if_open(uuid, integer) to service_role;
