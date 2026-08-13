-- 20260806100000_w6c_terminal.sql
-- W6c (M6·P6.2 pulled forward): Stripe Terminal — in-person card at the register.
--
-- Two changes, both additive + guarded/idempotent:
--   1) qr_orders.tender learns 'terminal' (counter card-present vs 'card' online) so the Z-report
--      can tell the reader's takings from online card, and the order row is auditable.
--   2) mms_fulfill_order re-signs with p_settled_by (staff attribution — the reader is staff-driven,
--      unlike online card) + p_tender. BOTH default to the online path's exact behavior (null /
--      'card'), so the deployed webhook's existing 8-arg named call resolves unchanged.
--
-- Signature-change discipline (the W11 lesson): adding a defaulted param creates a NEW overload —
-- drop BOTH signatures before create, restate the FULL LIVE body (20260716000000_w3_kitchen.sql —
-- the one carrying customer_name/notes/table_number; restating from an older baseline silently
-- drops them), and re-issue revoke+grant for the new signature (grants do not survive a drop).

-- ── 1) tender CHECK: ('card','cash') → ('card','cash','terminal') ────────────────────────────────
-- Existing rows are all 'card'/'cash' — the widened CHECK validates them trivially.
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'qr_orders_tender_chk') then
    alter table public.qr_orders drop constraint qr_orders_tender_chk;
  end if;
  alter table public.qr_orders add constraint qr_orders_tender_chk
    check (tender in ('card', 'cash', 'terminal'));
end $$;

-- ── 2) mms_fulfill_order re-signed: + p_settled_by, + p_tender ───────────────────────────────────
drop function if exists public.mms_fulfill_order(uuid, text, integer, integer, integer, integer, integer, integer);
drop function if exists public.mms_fulfill_order(uuid, text, integer, integer, integer, integer, integer, integer, uuid, text);

create function public.mms_fulfill_order(
  p_cart_id uuid, p_payment_intent text, p_amount_cents integer, p_subtotal_cents integer,
  p_discount_cents integer, p_service_charge_cents integer, p_tax_cents integer, p_tip_cents integer default 0,
  p_settled_by uuid default null, p_tender text default 'card'
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_order uuid; v_total integer; v_session uuid; v_promo text;
  v_slot timestamptz; v_fire timestamptz; v_table integer; v_name text;
begin
  -- Idempotent branch FIRST (the ordering discipline): the PI id is the card-family key.
  select id into v_order from public.qr_orders where stripe_payment_intent_id = p_payment_intent;
  if v_order is not null then return v_order; end if;

  v_total := p_subtotal_cents - p_discount_cents + p_service_charge_cents + p_tax_cents + p_tip_cents;
  if v_total <> p_amount_cents then
    raise exception 'fulfillment amount mismatch: breakdown=% intent=%', v_total, p_amount_cents;
  end if;

  select c.promo_code, c.pickup_slot, c.fire_at, c.customer_name into v_promo, v_slot, v_fire, v_name
    from public.qr_carts c where c.id = p_cart_id;
  update public.qr_carts set status = 'paid'
    where id = p_cart_id and status = 'open'
    returning session_id into v_session;
  if v_session is null then
    raise exception 'cart % is not open (already settled by another tender) — refund PI %',
      p_cart_id, p_payment_intent;
  end if;

  -- K2: snapshot the session's registered table number onto the order (null for pickup/scango or an
  -- unregistered sticker) so /track + the receipt show it after the session read has expired.
  select table_number into v_table from public.table_sessions where id = v_session;

  insert into public.qr_orders (session_id, subtotal_cents, discount_cents, service_charge_cents,
                         tax_cents, tip_cents, total_cents, stripe_payment_intent_id, status,
                         pickup_slot, fire_at, cart_id, table_number, customer_name,
                         tender, settled_by)
    values (v_session, p_subtotal_cents, p_discount_cents, p_service_charge_cents,
            p_tax_cents, p_tip_cents, v_total, p_payment_intent, 'paid', v_slot, v_fire, p_cart_id,
            v_table, v_name, p_tender, p_settled_by)
    returning id into v_order;

  insert into public.qr_order_items (order_id, menu_item_id, name, qty, modifiers, unit_price_cents, tax_cents, fulfillment, notes)
    select v_order, ci.menu_item_id, ci.name, ci.qty, ci.modifiers, ci.unit_price_cents, ci.tax_cents, ci.fulfillment, ci.notes
    from public.qr_cart_items ci
    where ci.cart_id = p_cart_id and ci.state <> 'voided' and not ci.comped;

  if v_promo is not null and p_discount_cents > 0 then
    perform public.mms_promo_consume(v_promo, v_session, v_order);
  end if;

  return v_order;
end; $$;
revoke all on function public.mms_fulfill_order(uuid, text, integer, integer, integer, integer, integer, integer, uuid, text)
  from public, anon, authenticated;
grant execute on function public.mms_fulfill_order(uuid, text, integer, integer, integer, integer, integer, integer, uuid, text)
  to service_role;
