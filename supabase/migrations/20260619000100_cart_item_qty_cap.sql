-- 20260619000100_cart_item_qty_cap.sql
-- Bound per-line qty AND make the increment status-atomic (M1·P1.2 adversarial + review findings).
--
--  • mms_cart_item_inc_qty was unbounded: a group-cart member could loop addItem to push qty
--    arbitrarily high, and at P1.3 that qty × unit_price_cents becomes the Stripe amount. setQty
--    already caps at 99 (Zod setQtyInput); this closes the increment path with `ci.qty < 99` inside
--    the same atomic UPDATE.
--  • The increment also now JOINs the parent cart and requires `c.status = 'open'`. assertCartMember
--    already rejects non-open carts at the app layer, but that guard and the RPC are separate DB
--    round-trips — once P1.3 wires the Stripe webhook, a `status = 'paid'` flip arriving between them
--    could bump qty on an already-fulfilled line. Folding the check into the UPDATE makes it fully
--    atomic (one statement, no new round-trip).
--  • A column CHECK (qty between 1 and 99) is the backstop for EVERY write path (insert / setQty /
--    inc), so the invariant is enforced by the DB regardless of which code path writes.

create or replace function mms_cart_item_inc_qty(p_id uuid) returns void
  language sql set search_path = '' as $$
  update public.qr_cart_items ci
    set qty = ci.qty + 1
    from public.qr_carts c
    where ci.id = p_id and c.id = ci.cart_id and c.status = 'open' and ci.qty < 99;
$$;
revoke all on function mms_cart_item_inc_qty(uuid) from anon, authenticated;

-- Clamp any pre-existing out-of-range rows (dev data) so the constraint applies cleanly.
update public.qr_cart_items set qty = 99 where qty > 99;
update public.qr_cart_items set qty = 1 where qty < 1;

alter table public.qr_cart_items
  add constraint qr_cart_items_qty_range check (qty between 1 and 99);
