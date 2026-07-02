-- 20260702000100_fulfill_stamp_cart_id.sql — stamp qr_orders.cart_id on the CARD + SPLIT fulfill paths so
-- the S4-audit P1-2 durable fire-at-checkout backstop actually covers them.
--
-- BUG: mms_reconcile_settled_fulfillment (20260624030000) scans `where o.status='paid' and o.cart_id is
-- not null` and joins its draft-food / togo-init / EBT-snapshot checks through o.cart_id. But only
-- mms_fulfill_cash_order stamps cart_id; mms_fulfill_order (card) and mms_fulfill_split_order insert with
-- cart_id NULL. Those are exactly the two tenders whose settlement side-effects run in the Stripe webhook's
-- after() drain — the serverless cold-stop case P1-2 exists for — so the pg_cron reconciler scans ZERO of
-- them: a card/split-paid dine-in cart with draft food is never fired (guest paid, food never cooks),
-- togo_status never initializes (expo/track never see the bag), and the EBT snapshot is never taken.
-- S4_AUDIT.md marks P1-2 FIXED; it was fixed for cash only (whose after() runs in a server action).
--
-- SAFETY: stamping is additive and non-conflicting —
--   • the only unique index on qr_orders.cart_id is PARTIAL (`where tender = 'cash'`, 20260621150000), so a
--     card row (tender null/default) or split row can't collide with it;
--   • the card path is idempotent on stripe_payment_intent_id (returns the existing order before any insert)
--     AND on the atomic open→paid flip, so its qr_orders insert runs exactly ONCE per PI;
--   • the split path flips open→paid once and returns the stamped order on re-entry.
-- Restated in full (create or replace replaces the whole body); the ONLY change vs 20260624000000 is
-- `, cart_id` / `, p_cart_id` in the qr_orders insert. No signature change → no generated-types drift.

-- ── CARD path ────────────────────────────────────────────────────────────────────────────────────────────
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
                         pickup_slot, fire_at, cart_id)
    values (v_session, p_subtotal_cents, p_discount_cents, p_service_charge_cents,
            p_tax_cents, p_tip_cents, v_total, p_payment_intent, 'paid', v_slot, v_fire, p_cart_id)
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
revoke all on function public.mms_fulfill_order(uuid, text, integer, integer, integer, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.mms_fulfill_order(uuid, text, integer, integer, integer, integer, integer, integer)
  to service_role;

-- ── SPLIT path ───────────────────────────────────────────────────────────────────────────────────────────
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
                         tax_cents, tip_cents, total_cents, stripe_payment_intent_id, status, cart_id)
    select v_session, sum(subtotal_cents), sum(discount_cents), sum(service_charge_cents),
           sum(tax_cents), sum(tip_cents), sum(amount_cents), null, 'paid', p_cart_id
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
revoke all on function public.mms_fulfill_split_order(uuid, integer) from public, anon, authenticated;
grant execute on function public.mms_fulfill_split_order(uuid, integer) to service_role;
