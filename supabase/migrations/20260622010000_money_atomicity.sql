-- 20260622010000_money_atomicity.sql
-- S1-audit B2 / S1 / S3 — money atomicity + fulfillment completeness.
--
-- THREE things, all in the card/cash settlement family:
--  (S1) mms_fulfill_order's cross-tender guard was a NON-atomic `exists(open)` check + a SEPARATE trailing
--       `update set paid` — a concurrent cash settle committing between them let the card path record a
--       SECOND order (double-record). Replace with the ATOMIC claim its cash twin already uses:
--       `update … set status='paid' where status='open' returning session_id` (0 rows ⇒ another tender won).
--  (REGRESSION fix) S1.3 (20260621150000) redefined mms_fulfill_order for the cross-tender guard and, in
--       doing so, DROPPED two behaviors the pickup-era version (20260620000100) had: copying the cart's
--       `pickup_slot`/`fire_at` onto the order, and calling `mms_promo_consume` at fulfillment. The first
--       broke /track's pickup ETA + the S2 KDS `fire_at` seam for card orders; the second meant promo
--       redemptions weren't recorded, so per-session/global caps (P2.1) under-counted. Restore BOTH here,
--       and add promo-consume to the CASH twin too (same fulfillment semantics — a cash-settled promo cart
--       must consume its redemption for cap integrity).
--  (S3) A durable `qr_refunds_needed` ledger for the cross-tender stranded charge: when a late card PI lands
--       on an already-settled cart, the card was CAPTURED but no order is recorded — today that's only a log
--       + PostHog event (no recovery surface). Record it durably so an operator (or S4.3's auto-refund) can
--       act. Service-role-only; the webhook writes it on the graceful cross-tender branch.
--
-- Additive/idempotent: create-or-replace fns + create-table-if-not-exists + idempotent grants.

-- ── mms_fulfill_order — atomic claim + restored pickup/promo (card path) ──────────────────────────────
create or replace function public.mms_fulfill_order(
  p_cart_id uuid,
  p_payment_intent text,
  p_amount_cents integer,
  p_subtotal_cents integer,
  p_discount_cents integer,
  p_service_charge_cents integer,
  p_tax_cents integer,
  p_tip_cents integer default 0
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_order uuid; v_total integer; v_session uuid; v_promo text;
  v_slot timestamptz; v_fire timestamptz;
begin
  select id into v_order from public.qr_orders where stripe_payment_intent_id = p_payment_intent;
  if v_order is not null then return v_order; end if;  -- idempotent: a retry returns the same order

  -- Pure amount reconcile BEFORE the claim (no state touched; a mismatch rolls back having changed nothing).
  v_total := p_subtotal_cents - p_discount_cents + p_service_charge_cents + p_tax_cents + p_tip_cents;
  if v_total <> p_amount_cents then
    raise exception 'fulfillment amount mismatch: breakdown=% intent=%', v_total, p_amount_cents;
  end if;

  -- Read the cart's settlement metadata, then ATOMICALLY claim it: flip open→paid only if STILL open.
  -- 0 rows ⇒ another tender (cash) settled it first → raise so the orphan card charge surfaces for a
  -- refund (the webhook also records it durably in qr_refunds_needed). This single conditional UPDATE
  -- replaces the old exists-check + trailing update (closing the TOCTOU) — parity with the cash twin.
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

  insert into public.qr_order_items (order_id, menu_item_id, name, qty, modifiers, unit_price_cents, tax_cents)
    select v_order, ci.menu_item_id, ci.name, ci.qty, ci.modifiers, ci.unit_price_cents, ci.tax_cents
    from public.qr_cart_items ci where ci.cart_id = p_cart_id;

  -- Consume the promo redemption at fulfillment (restored — S1.3 dropped this): records the redemption so
  -- per-session/global caps stay honest. Only when a promo was actually applied (discount > 0).
  if v_promo is not null and p_discount_cents > 0 then
    perform public.mms_promo_consume(v_promo, v_session, v_order);
  end if;

  return v_order;
end; $$;

-- ── mms_fulfill_cash_order — add promo-consume parity (cash path) ──────────────────────────────────────
-- Same shape as the card twin's restore: a cash-settled cart that carried a promo must consume its
-- redemption too, or the cap under-counts. The rest of the cash RPC (atomic open→paid flip, subtotal
-- reconcile, cart_id idempotency, settled_by) is UNCHANGED from 20260621150000 — restated in full so the
-- promo step lands inside the same transaction as the order insert.
create or replace function public.mms_fulfill_cash_order(
  p_cart_id uuid,
  p_settled_by uuid,
  p_subtotal_cents integer,
  p_discount_cents integer,
  p_service_charge_cents integer,
  p_tax_cents integer,
  p_tip_cents integer default 0
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_order uuid; v_total integer; v_derived_subtotal integer; v_session uuid; v_status text; v_promo text;
begin
  select id into v_order from public.qr_orders where cart_id = p_cart_id and tender = 'cash';
  if v_order is not null then return v_order; end if;

  select coalesce(sum(unit_price_cents * qty), 0) into v_derived_subtotal
    from public.qr_cart_items where cart_id = p_cart_id;
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

  insert into public.qr_order_items (order_id, menu_item_id, name, qty, modifiers, unit_price_cents, tax_cents)
    select v_order, ci.menu_item_id, ci.name, ci.qty, ci.modifiers, ci.unit_price_cents, ci.tax_cents
    from public.qr_cart_items ci where ci.cart_id = p_cart_id;

  if v_promo is not null and p_discount_cents > 0 then
    perform public.mms_promo_consume(v_promo, v_session, v_order);
  end if;

  return v_order;
end; $$;

-- ── qr_refunds_needed — durable recovery ledger for a stranded cross-tender charge (S3) ───────────────
create table if not exists public.qr_refunds_needed (
  id                 uuid primary key default gen_random_uuid(),
  payment_intent     text not null unique,           -- the captured Stripe PI with no recorded order
  cart_id            uuid references public.qr_carts(id),
  amount_cents       integer,                          -- the captured amount (from the PI), for the operator
  reason             text not null,                    -- e.g. 'card_after_settle'
  resolved           boolean not null default false,   -- flipped when the refund is issued (S4.3 / manual)
  created_at         timestamptz not null default now()
);
alter table public.qr_refunds_needed enable row level security;  -- default-deny: service-role only
revoke all on public.qr_refunds_needed from anon, authenticated;
