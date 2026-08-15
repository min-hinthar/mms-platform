-- M3 — modifier OPTION IDS ride the line (faithful reorder).
-- The cart/order lines have always stored modifiers as LABELS (jsonb of display strings): enough
-- to print a receipt, lossy for everything else — reorder re-guesses options by label, a renamed
-- option silently un-links history, and the SQL fold key rides display text. This migration adds
-- the STABLE ids alongside the labels (never replacing them — labels stay the receipt artifact):
--   • qr_cart_items.modifier_option_ids  jsonb not null default '[]'
--   • qr_order_items.modifier_option_ids jsonb not null default '[]'
-- Legacy rows keep '[]' = exactly today's behavior (reorder falls back to the label guess).
-- NO backfill: label→id is lossy (labels are not unique across groups/time) — never attempt it.
--
-- One RPC re-signs (+p_option_ids, appended LAST, default '[]'): mms_cart_item_insert_if_open —
-- restated from the 20260813210000 (w7b) baseline. The three fulfill RPCs need NO signature
-- change: the column rides their INSERT…SELECT copy from qr_cart_items → qr_order_items — each
-- is restated from its newest baseline (mms_fulfill_order ← w6c 20260806100000,
-- mms_fulfill_cash_order ← w3 20260716000000, mms_fulfill_split_order ← w11 20260805210000)
-- with modifier_option_ids added to the column list + select list.

-- ── columns (guarded + idempotent) ────────────────────────────────────────────────────────────────
alter table public.qr_cart_items
  add column if not exists modifier_option_ids jsonb not null default '[]'::jsonb;
alter table public.qr_order_items
  add column if not exists modifier_option_ids jsonb not null default '[]'::jsonb;
comment on column public.qr_cart_items.modifier_option_ids is
  'M3 — stable modifier_options.id list for the line (labels in `modifiers` stay the receipt artifact). ''[]'' = legacy/no options.';
comment on column public.qr_order_items.modifier_option_ids is
  'M3 — copied verbatim from the cart line at fulfillment; powers faithful reorder.';

-- ── mms_cart_item_insert_if_open re-signed: + p_option_ids ────────────────────────────────────────
-- Restated from the 20260813210000 (w7b) baseline; p_option_ids appended LAST (spread-only-when-
-- set deploy order: old code calling the old signature keeps working until the new code deploys,
-- then the default covers any straggler call).
drop function if exists public.mms_cart_item_insert_if_open(uuid, text, text, jsonb, integer, integer, uuid, text, text, integer, uuid);
drop function if exists public.mms_cart_item_insert_if_open(uuid, text, text, jsonb, integer, integer, uuid, text, text, integer, uuid, jsonb);
create function public.mms_cart_item_insert_if_open(
  p_cart_id uuid,
  p_menu_item_id text,
  p_name text,
  p_modifiers jsonb,
  p_unit_price_cents integer,
  p_tax_cents integer,
  p_by_seat uuid,
  p_fulfillment text,
  p_notes text default null,
  p_qty integer default 1,
  p_scan_id uuid default null,
  p_option_ids jsonb default '[]'::jsonb
) returns uuid
  language plpgsql set search_path = '' as $$
declare v_id uuid;
begin
  if p_scan_id is not null then
    insert into public.mms_scan_events (scan_id, cart_id) values (p_scan_id, p_cart_id)
      on conflict (scan_id) do nothing;
    if not found then
      return '00000000-0000-0000-0000-000000000000'::uuid; -- duplicate replay: no write, idempotent OK
    end if;
  end if;
  insert into public.qr_cart_items
    (cart_id, menu_item_id, name, qty, modifiers, modifier_option_ids, unit_price_cents, tax_cents, by_seat, fulfillment, notes)
  select p_cart_id, p_menu_item_id, p_name, p_qty, p_modifiers, coalesce(p_option_ids, '[]'::jsonb),
         p_unit_price_cents, p_tax_cents, p_by_seat, p_fulfillment, p_notes
  from public.qr_carts
  where id = p_cart_id and status = 'open' and p_qty between 1 and 99
  returning id into v_id;
  if v_id is null and p_scan_id is not null then
    -- The claim above wrote in THIS transaction but the guarded insert refused (cart no longer
    -- open / qty out of range): raise so the claim ROLLS BACK. A committed claim with no write
    -- burns the id — its replay would conflict into the NIL sentinel and report "delivered" for
    -- a scan that never landed. The live path (p_scan_id null) keeps returning null — the
    -- caller's closed-cart contract is unchanged.
    raise exception 'cart is no longer open' using errcode = 'P0001';
  end if;
  return v_id;
end $$;
revoke all on function public.mms_cart_item_insert_if_open(uuid, text, text, jsonb, integer, integer, uuid, text, text, integer, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.mms_cart_item_insert_if_open(uuid, text, text, jsonb, integer, integer, uuid, text, text, integer, uuid, jsonb)
  to service_role;

-- ── mms_fulfill_order restated (w6c baseline; SAME signature — only the item-copy widens) ─────────
create or replace function public.mms_fulfill_order(
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

  insert into public.qr_order_items (order_id, menu_item_id, name, qty, modifiers, modifier_option_ids, unit_price_cents, tax_cents, fulfillment, notes)
    select v_order, ci.menu_item_id, ci.name, ci.qty, ci.modifiers, ci.modifier_option_ids, ci.unit_price_cents, ci.tax_cents, ci.fulfillment, ci.notes
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

-- ── mms_fulfill_cash_order restated (w3 baseline; SAME signature — only the item-copy widens) ─────
create or replace function public.mms_fulfill_cash_order(
  p_cart_id uuid, p_settled_by uuid, p_subtotal_cents integer, p_discount_cents integer,
  p_service_charge_cents integer, p_tax_cents integer, p_tip_cents integer default 0
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

  insert into public.qr_order_items (order_id, menu_item_id, name, qty, modifiers, modifier_option_ids, unit_price_cents, tax_cents, fulfillment, notes)
    select v_order, ci.menu_item_id, ci.name, ci.qty, ci.modifiers, ci.modifier_option_ids, ci.unit_price_cents, ci.tax_cents, ci.fulfillment, ci.notes
    from public.qr_cart_items ci
    where ci.cart_id = p_cart_id and ci.state <> 'voided' and not ci.comped;

  if v_promo is not null and p_discount_cents > 0 then
    perform public.mms_promo_consume(v_promo, v_session, v_order);
  end if;

  return v_order;
end; $$;
revoke all on function public.mms_fulfill_cash_order(uuid, uuid, integer, integer, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.mms_fulfill_cash_order(uuid, uuid, integer, integer, integer, integer, integer)
  to service_role;

-- ── mms_fulfill_split_order restated (w11 baseline; SAME signature — only the item-copy widens) ───
create or replace function public.mms_fulfill_split_order(p_cart_id uuid)
  returns uuid language plpgsql security definer set search_path = '' as $$
declare v_order uuid; v_session uuid; v_base_sum integer; v_captured_sum integer;
        v_open integer; v_pin integer; v_table integer; v_name text;
begin
  select session_id, customer_name, settle_expected_cents into v_session, v_name, v_pin
    from public.qr_carts where id = p_cart_id;

  -- IDEMPOTENT BRANCH FIRST. A redelivered `succeeded` event for an already-fulfilled settlement must
  -- return the stamped order before ANY guard can raise.
  if not exists (select 1 from public.qr_carts where id = p_cart_id and status = 'open') then
    select order_id into v_order from public.qr_cart_shares
      where cart_id = p_cart_id and order_id is not null limit 1;
    if v_order is null then
      raise exception 'split fulfillment: cart % not open and no order stamped (status conflict)', p_cart_id;
    end if;
    return v_order;
  end if;

  select count(*) into v_open from public.qr_cart_shares
    where cart_id = p_cart_id and status <> 'captured';
  if v_open > 0 then
    raise exception 'split fulfillment blocked: % share(s) not captured', v_open;
  end if;

  -- The REAL reconcile (M1/M25): captured BASE (amount − tip) against the pinned constant. A NULL pin
  -- is a settlement opened before W11 deployed — degrade to the old behaviour for that one window.
  -- The durable qr_refunds_needed record for a mismatch is written by the CALLER (split-settle.ts).
  select coalesce(sum(amount_cents - tip_cents), 0), coalesce(sum(amount_cents), 0)
    into v_base_sum, v_captured_sum
    from public.qr_cart_shares where cart_id = p_cart_id and status = 'captured';
  if v_pin is not null and v_base_sum <> v_pin then
    raise exception 'split fulfillment mismatch: captured base=% pinned=%', v_base_sum, v_pin;
  end if;

  update public.qr_carts set status = 'paid' where id = p_cart_id and status = 'open';
  if not found then
    -- Raced by a concurrent delivery between the branch above and this write — defer to the winner.
    select order_id into v_order from public.qr_cart_shares
      where cart_id = p_cart_id and order_id is not null limit 1;
    if v_order is null then
      raise exception 'split fulfillment: cart % not open and no order stamped (status conflict)', p_cart_id;
    end if;
    return v_order;
  end if;

  select table_number into v_table from public.table_sessions where id = v_session; -- K2 snapshot

  insert into public.qr_orders (session_id, subtotal_cents, discount_cents, service_charge_cents,
                         tax_cents, tip_cents, total_cents, stripe_payment_intent_id, status, cart_id, table_number, customer_name)
    select v_session, sum(subtotal_cents), sum(discount_cents), sum(service_charge_cents),
           sum(tax_cents), sum(tip_cents), sum(amount_cents), null, 'paid', p_cart_id, v_table, v_name
    from public.qr_cart_shares where cart_id = p_cart_id and status = 'captured'
    returning id into v_order;

  insert into public.qr_order_items (order_id, menu_item_id, name, qty, modifiers, modifier_option_ids, unit_price_cents, tax_cents, fulfillment, notes)
    select v_order, ci.menu_item_id, ci.name, ci.qty, ci.modifiers, ci.modifier_option_ids, ci.unit_price_cents, ci.tax_cents, ci.fulfillment, ci.notes
    from public.qr_cart_items ci
    where ci.cart_id = p_cart_id and ci.state <> 'voided' and not ci.comped;

  update public.qr_cart_shares set order_id = v_order, updated_at = now()
    where cart_id = p_cart_id and status = 'captured';

  -- M29: persist WHO paid, beyond the shares' lifetime. Only real payers; `on conflict` because a
  -- raced sibling delivery of the same settlement must stay a no-op.
  insert into public.qr_order_payers (order_id, payer_uid)
    select v_order, seat_id from public.qr_cart_shares
      where cart_id = p_cart_id and status = 'captured' and stripe_payment_intent_id is not null
    on conflict (order_id, payer_uid) do nothing;

  return v_order;
end; $$;
revoke all on function public.mms_fulfill_split_order(uuid) from public, anon, authenticated;
grant execute on function public.mms_fulfill_split_order(uuid) to service_role;
