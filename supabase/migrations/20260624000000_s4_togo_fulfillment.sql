-- 20260624000000_s4_togo_fulfillment.sql — S4.3a: the to-go fulfillment loop. docs/S4_DESIGN.md S4.3a.
-- Completes order → route → fire → cook → BAG → READY → hand off, with a diner "to-go ready" signal so
-- nobody pays and walks out without their bag. Adds (1) qr_orders.togo_status (the ready signal /track
-- reads), (2) qr_order_items.fulfillment (so the expo sees only the takeaway subset), (3) the init +
-- staff-bump RPCs. The 3 fulfill RPCs are restated ONLY to copy ci.fulfillment into the snapshot — a
-- purely additive column copy, no money logic changed. Additive + idempotent.

-- ── A1: the ready signal on the order (nullable: null = pure dine-in eat-in, no bag) ─────────────────────
alter table public.qr_orders
  add column if not exists togo_status text
    check (togo_status is null or togo_status in ('preparing','ready','picked_up'));

-- ── A2: snapshot the per-line fulfillment tag onto the order item (default 'dinein'; historical rows are
-- pre-routing so 'dinein' is the honest backfill). The expo + slice C read takeaway lines from here. ─────
alter table public.qr_order_items
  add column if not exists fulfillment text not null default 'dinein'
    check (fulfillment in ('dinein','togo','grocery'));

-- ── Restate the 3 fulfill RPCs: snapshot insert now carries fulfillment. CREATE OR REPLACE preserves the
-- existing grants (unchanged signatures). The ONLY change vs live is `, fulfillment` / `, ci.fulfillment`
-- in the qr_order_items insert — verified against the live definitions; no money logic touched. ──────────
create or replace function public.mms_fulfill_order(
  p_cart_id uuid, p_payment_intent text, p_amount_cents integer, p_subtotal_cents integer,
  p_discount_cents integer, p_service_charge_cents integer, p_tax_cents integer, p_tip_cents integer default 0
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_order uuid; v_total integer; v_session uuid; v_promo text;
  v_slot timestamptz; v_fire timestamptz;
begin
  select id into v_order from public.qr_orders where stripe_payment_intent_id = p_payment_intent;
  if v_order is not null then return v_order; end if;

  v_total := p_subtotal_cents - p_discount_cents + p_service_charge_cents + p_tax_cents + p_tip_cents;
  if v_total <> p_amount_cents then
    raise exception 'fulfillment amount mismatch: breakdown=% intent=%', v_total, p_amount_cents;
  end if;

  select c.promo_code, c.pickup_slot, c.fire_at into v_promo, v_slot, v_fire
    from public.qr_carts c where c.id = p_cart_id;
  update public.qr_carts set status = 'paid'
    where id = p_cart_id and status = 'open'
    returning session_id into v_session;
  if v_session is null then
    raise exception 'cart % is not open (already settled by another tender) — refund PI %',
      p_cart_id, p_payment_intent;
  end if;

  insert into public.qr_orders (session_id, subtotal_cents, discount_cents, service_charge_cents,
                         tax_cents, tip_cents, total_cents, stripe_payment_intent_id, status,
                         pickup_slot, fire_at)
    values (v_session, p_subtotal_cents, p_discount_cents, p_service_charge_cents,
            p_tax_cents, p_tip_cents, v_total, p_payment_intent, 'paid', v_slot, v_fire)
    returning id into v_order;

  insert into public.qr_order_items (order_id, menu_item_id, name, qty, modifiers, unit_price_cents, tax_cents, fulfillment)
    select v_order, ci.menu_item_id, ci.name, ci.qty, ci.modifiers, ci.unit_price_cents, ci.tax_cents, ci.fulfillment
    from public.qr_cart_items ci
    where ci.cart_id = p_cart_id and ci.state <> 'voided' and not ci.comped;

  if v_promo is not null and p_discount_cents > 0 then
    perform public.mms_promo_consume(v_promo, v_session, v_order);
  end if;

  return v_order;
end; $$;

create or replace function public.mms_fulfill_cash_order(
  p_cart_id uuid, p_settled_by uuid, p_subtotal_cents integer, p_discount_cents integer,
  p_service_charge_cents integer, p_tax_cents integer, p_tip_cents integer default 0
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_order uuid; v_total integer; v_derived_subtotal integer; v_session uuid; v_status text; v_promo text;
begin
  select id into v_order from public.qr_orders where cart_id = p_cart_id and tender = 'cash';
  if v_order is not null then return v_order; end if;

  select coalesce(sum(unit_price_cents * qty), 0) into v_derived_subtotal
    from public.qr_cart_items where cart_id = p_cart_id and state <> 'voided' and not comped;
  if v_derived_subtotal <> p_subtotal_cents then
    raise exception 'cash settle subtotal mismatch: derived=% passed=%', v_derived_subtotal, p_subtotal_cents;
  end if;

  v_total := p_subtotal_cents - p_discount_cents + p_service_charge_cents + p_tax_cents + p_tip_cents;

  select promo_code into v_promo from public.qr_carts where id = p_cart_id;
  update public.qr_carts set status = 'paid'
    where id = p_cart_id and status = 'open'
    returning session_id into v_session;
  if v_session is null then
    select status into v_status from public.qr_carts where id = p_cart_id;
    raise exception 'cart % is not open for cash settlement (status=%)', p_cart_id, coalesce(v_status, 'missing');
  end if;

  insert into public.qr_orders (session_id, subtotal_cents, discount_cents, service_charge_cents,
                         tax_cents, tip_cents, total_cents, status, tender, cart_id, settled_by)
    values (v_session, p_subtotal_cents, p_discount_cents, p_service_charge_cents,
            p_tax_cents, p_tip_cents, v_total, 'paid', 'cash', p_cart_id, p_settled_by)
    returning id into v_order;

  insert into public.qr_order_items (order_id, menu_item_id, name, qty, modifiers, unit_price_cents, tax_cents, fulfillment)
    select v_order, ci.menu_item_id, ci.name, ci.qty, ci.modifiers, ci.unit_price_cents, ci.tax_cents, ci.fulfillment
    from public.qr_cart_items ci
    where ci.cart_id = p_cart_id and ci.state <> 'voided' and not ci.comped;

  if v_promo is not null and p_discount_cents > 0 then
    perform public.mms_promo_consume(v_promo, v_session, v_order);
  end if;

  return v_order;
end; $$;

create or replace function public.mms_fulfill_split_order(p_cart_id uuid, p_expected_total_cents integer)
  returns uuid language plpgsql security definer set search_path = '' as $$
declare v_order uuid; v_session uuid; v_sum integer; v_open integer;
begin
  select session_id into v_session from public.qr_carts where id = p_cart_id;

  select count(*) into v_open from public.qr_cart_shares
    where cart_id = p_cart_id and status <> 'captured';
  if v_open > 0 then
    raise exception 'split fulfillment blocked: % share(s) not captured', v_open;
  end if;

  select coalesce(sum(amount_cents), 0) into v_sum from public.qr_cart_shares
    where cart_id = p_cart_id and status = 'captured';
  if v_sum <> p_expected_total_cents then
    raise exception 'split fulfillment mismatch: captured=% expected=%', v_sum, p_expected_total_cents;
  end if;

  update public.qr_carts set status = 'paid' where id = p_cart_id and status = 'open';
  if not found then
    select order_id into v_order from public.qr_cart_shares
      where cart_id = p_cart_id and order_id is not null limit 1;
    if v_order is null then
      raise exception 'split fulfillment: cart % not open and no order stamped (status conflict)', p_cart_id;
    end if;
    return v_order;
  end if;

  insert into public.qr_orders (session_id, subtotal_cents, discount_cents, service_charge_cents,
                         tax_cents, tip_cents, total_cents, stripe_payment_intent_id, status)
    select v_session, sum(subtotal_cents), sum(discount_cents), sum(service_charge_cents),
           sum(tax_cents), sum(tip_cents), sum(amount_cents), null, 'paid'
    from public.qr_cart_shares where cart_id = p_cart_id and status = 'captured'
    returning id into v_order;

  insert into public.qr_order_items (order_id, menu_item_id, name, qty, modifiers, unit_price_cents, tax_cents, fulfillment)
    select v_order, ci.menu_item_id, ci.name, ci.qty, ci.modifiers, ci.unit_price_cents, ci.tax_cents, ci.fulfillment
    from public.qr_cart_items ci
    where ci.cart_id = p_cart_id and ci.state <> 'voided' and not ci.comped;

  update public.qr_cart_shares set order_id = v_order, updated_at = now()
    where cart_id = p_cart_id and status = 'captured';
  return v_order;
end; $$;

-- ── A3: init 'preparing' — set iff the cart has a real takeaway (togo/grocery) line. Idempotent (only when
-- currently null). Called BEST-EFFORT in the settlement after() side-effects (never inside the money RPCs),
-- so an expo/init hiccup can't roll back a payment. Returns the resulting status (or null = no bag). ──────
create or replace function public.mms_init_togo_status(p_order uuid, p_cart uuid) returns text
  language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
  update public.qr_orders o set togo_status = 'preparing'
    where o.id = p_order and o.togo_status is null
      and exists (
        select 1 from public.qr_cart_items ci
        where ci.cart_id = p_cart and ci.fulfillment in ('togo','grocery')
          and ci.state <> 'voided' and not ci.comped
      );
  select togo_status into v_status from public.qr_orders where id = p_order;
  return v_status;  -- 'preparing' if a bag exists, else whatever it already was (null for pure dine-in)
end $$;
revoke all on function public.mms_init_togo_status(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mms_init_togo_status(uuid, uuid) to service_role;

-- ── A4: the expo's bump — staff-gated (in the action layer) + legal-edge re-asserted IN the write here.
-- preparing → ready → picked_up only; 'stale' on a raced/illegal edge. ───────────────────────────────────
create or replace function public.mms_set_togo_status(p_order uuid, p_to text) returns text
  language plpgsql security definer set search_path = '' as $$
begin
  if p_to not in ('ready','picked_up') then return 'bad_status'; end if;
  update public.qr_orders o set togo_status = p_to
    where o.id = p_order
      and (
        (p_to = 'ready'     and o.togo_status = 'preparing') or
        (p_to = 'picked_up' and o.togo_status = 'ready')
      );
  if not found then return 'stale'; end if;  -- already advanced, illegal edge, or no such order
  return 'ok';
end $$;
revoke all on function public.mms_set_togo_status(uuid, text) from public, anon, authenticated;
grant execute on function public.mms_set_togo_status(uuid, text) to service_role;
