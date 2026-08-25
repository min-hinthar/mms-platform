-- 20260828000000_m22_promo_consumed_on_its_own_contribution.sql — M22 (Codex round 1, P2).
--
-- Fulfillment consumed a promo redemption whenever the COMBINED discount was positive. That is not a
-- fact about the promo: `p_discount_cents` folds the promo and the reward coupon together, so a promo
-- that delivered 0 still incremented `promo_codes.used` and inserted a `promo_redemptions` row —
-- global and per-session budget spent for no discount.
--
-- Two ways in, one old and one new:
--   * PRE-EXISTING - an attached code that has expired or fallen under its min-subtotal makes
--     `mms_promo_discount` return 0, while an applied reward keeps the combined discount positive.
--   * NEW (M22) - the reward now clamps FIRST, so a coupon covering the whole basket leaves the
--     promo at 0. M22 widened a hole it did not dig; this closes both.
--
-- `p_promo_cents` is added LAST and DEFAULTED, and the predicate coalesces to the old value, so a
-- not-yet-updated caller keeps exactly today's behaviour and this is safe to land ahead of the app
-- deploy. Adding a parameter makes a NEW signature rather than replacing the old one (Postgres keys
-- functions by argument types), so each old signature is dropped first - which also drops its grants,
-- hence the re-grants below.
--
-- `mms_fulfill_split_order` takes no promo and consumes none; it is untouched.

-- 1. mms_fulfill_order (card)
drop function if exists public.mms_fulfill_order(uuid, text, integer, integer, integer, integer, integer, integer, uuid, text);
create function public.mms_fulfill_order(
  p_cart_id uuid, p_payment_intent text, p_amount_cents integer, p_subtotal_cents integer,
  p_discount_cents integer, p_service_charge_cents integer, p_tax_cents integer, p_tip_cents integer default 0,
  p_settled_by uuid default null, p_tender text default 'card',
  p_promo_cents integer default null
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
                         tender, settled_by, dropped_lines)
    values (v_session, p_subtotal_cents, p_discount_cents, p_service_charge_cents,
            p_tax_cents, p_tip_cents, v_total, p_payment_intent, 'paid', v_slot, v_fire, p_cart_id,
            v_table, v_name, p_tender, p_settled_by,
            public.mms_dropped_snapshot(p_cart_id, p_payment_intent))
    returning id into v_order;

  -- M87: `ci.added_by` is the ONLY change in this function.
  insert into public.qr_order_items (order_id, menu_item_id, name, qty, modifiers, modifier_option_ids, unit_price_cents, tax_cents, fulfillment, notes, added_by)
    select v_order, ci.menu_item_id, ci.name, ci.qty, ci.modifiers, ci.modifier_option_ids, ci.unit_price_cents, ci.tax_cents, ci.fulfillment, ci.notes, ci.added_by
    from public.qr_cart_items ci
    where ci.cart_id = p_cart_id and ci.state <> 'voided' and not ci.comped;

  -- Only consume a redemption when the PROMO ITSELF delivered something (M22, Codex round 1 P2).
  -- This read `p_discount_cents > 0` — the COMBINED discount — which is not a fact about the promo.
  -- A reward large enough to cover the basket clamps the promo to 0 while keeping the combined value
  -- positive, so the code was consumed having delivered nothing. The same hole was already reachable
  -- with no reward-clamp interaction: an attached code that has expired or fallen under its
  -- min-subtotal makes `mms_promo_discount` return 0, and a reward alone kept the sum positive.
  -- The coalesce keeps the OLD behaviour for a caller that has not been updated yet.
  if v_promo is not null and coalesce(p_promo_cents, p_discount_cents) > 0 then
    perform public.mms_promo_consume(v_promo, v_session, v_order);
  end if;

  return v_order;
end; $$;
revoke all on function public.mms_fulfill_order(uuid, text, integer, integer, integer, integer, integer, integer, uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.mms_fulfill_order(uuid, text, integer, integer, integer, integer, integer, integer, uuid, text, integer)
  to service_role;

-- 2. mms_fulfill_cash_order
drop function if exists public.mms_fulfill_cash_order(uuid, uuid, integer, integer, integer, integer, integer);
create function public.mms_fulfill_cash_order(
  p_cart_id uuid, p_settled_by uuid, p_subtotal_cents integer, p_discount_cents integer,
  p_service_charge_cents integer, p_tax_cents integer, p_tip_cents integer default 0,
  p_promo_cents integer default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_order uuid; v_total integer; v_derived_subtotal integer; v_session uuid; v_status text; v_promo text; v_table integer; v_name text;
begin
  select id into v_order from public.qr_orders where cart_id = p_cart_id and tender = 'cash';
  if v_order is not null then return v_order; end if;

  select coalesce(sum(unit_price_cents * qty), 0) into v_derived_subtotal
    from public.qr_cart_items where cart_id = p_cart_id and state <> 'voided' and not comped;
  if v_derived_subtotal <> p_subtotal_cents then
    raise exception 'cash settle subtotal mismatch: derived=% passed=%', v_derived_subtotal, p_subtotal_cents;
  end if;

  v_total := p_subtotal_cents - p_discount_cents + p_service_charge_cents + p_tax_cents + p_tip_cents;

  select promo_code, customer_name into v_promo, v_name from public.qr_carts where id = p_cart_id;
  update public.qr_carts set status = 'paid'
    where id = p_cart_id and status = 'open'
    returning session_id into v_session;
  if v_session is null then
    select status into v_status from public.qr_carts where id = p_cart_id;
    raise exception 'cart % is not open for cash settlement (status=%)', p_cart_id, coalesce(v_status, 'missing');
  end if;

  select table_number into v_table from public.table_sessions where id = v_session; -- K2 snapshot

  insert into public.qr_orders (session_id, subtotal_cents, discount_cents, service_charge_cents,
                         tax_cents, tip_cents, total_cents, status, tender, cart_id, settled_by, table_number, customer_name)
    values (v_session, p_subtotal_cents, p_discount_cents, p_service_charge_cents,
            p_tax_cents, p_tip_cents, v_total, 'paid', 'cash', p_cart_id, p_settled_by, v_table, v_name)
    returning id into v_order;

  -- M87: `ci.added_by` is the ONLY change in this function.
  insert into public.qr_order_items (order_id, menu_item_id, name, qty, modifiers, modifier_option_ids, unit_price_cents, tax_cents, fulfillment, notes, added_by)
    select v_order, ci.menu_item_id, ci.name, ci.qty, ci.modifiers, ci.modifier_option_ids, ci.unit_price_cents, ci.tax_cents, ci.fulfillment, ci.notes, ci.added_by
    from public.qr_cart_items ci
    where ci.cart_id = p_cart_id and ci.state <> 'voided' and not ci.comped;

  -- Only consume a redemption when the PROMO ITSELF delivered something (M22, Codex round 1 P2).
  -- This read `p_discount_cents > 0` — the COMBINED discount — which is not a fact about the promo.
  -- A reward large enough to cover the basket clamps the promo to 0 while keeping the combined value
  -- positive, so the code was consumed having delivered nothing. The same hole was already reachable
  -- with no reward-clamp interaction: an attached code that has expired or fallen under its
  -- min-subtotal makes `mms_promo_discount` return 0, and a reward alone kept the sum positive.
  -- The coalesce keeps the OLD behaviour for a caller that has not been updated yet.
  if v_promo is not null and coalesce(p_promo_cents, p_discount_cents) > 0 then
    perform public.mms_promo_consume(v_promo, v_session, v_order);
  end if;

  return v_order;
end; $$;
revoke all on function public.mms_fulfill_cash_order(uuid, uuid, integer, integer, integer, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.mms_fulfill_cash_order(uuid, uuid, integer, integer, integer, integer, integer, integer)
  to service_role;
