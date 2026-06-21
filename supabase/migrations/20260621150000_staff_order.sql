-- 20260621150000_staff_order.sql
-- S1.3 (staff write + cash settle). "Pay a human" / cash / tab are ONE deferred-settlement capability
-- (ORDER-MODEL): an unpaid table order settled later, by any channel and any tender. This migration
-- adds the CASH settlement path alongside the proven card path — same order ledger, same idempotent
-- snapshot shape as mms_fulfill_order, no Stripe.
--
-- All additive + guarded/idempotent (re-runnable; no DDL on a non-empty path that rewrites). The new
-- qr_orders columns DO change the generated types → types regenerated in the same commit (no drift).

-- ── qr_orders: tender + cart linkage + who settled ───────────────────────────────────────────────
-- tender: card (Stripe, the existing path) vs cash (a cashier took payment). Default 'card' backfills
-- every existing row correctly (they're all Stripe), so the NOT NULL is safe; the CHECK validates the
-- all-'card' existing rows trivially. The card fulfillment RPC is UNTOUCHED — it relies on this default.
alter table public.qr_orders add column if not exists tender text not null default 'card';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'qr_orders_tender_chk') then
    alter table public.qr_orders add constraint qr_orders_tender_chk check (tender in ('card', 'cash'));
  end if;
end $$;
-- cart_id: the cart this order settled. NULL on legacy/card rows (card idempotency keys off the unique
-- stripe_payment_intent_id); populated on CASH rows so a partial-unique index gives cash its own
-- idempotency key (a cart settles to cash at most once). FK = traceability.
alter table public.qr_orders add column if not exists cart_id uuid references public.qr_carts(id);
-- settled_by: the staff member who took the cash (turnover/audit attribution). NULL on card/legacy.
-- staff's PK is user_id (the auth user), which is what StaffCaller.staffId resolves to.
alter table public.qr_orders add column if not exists settled_by uuid references public.staff(user_id);

-- Cash idempotency: at most ONE cash order per cart. Partial (tender='cash') so it never constrains the
-- many card rows with NULL cart_id. The RPC's existence check + this index + the atomic open→paid flip
-- are three independent backstops against a double-settle.
create unique index if not exists qr_orders_cash_cart_uniq
  on public.qr_orders(cart_id) where tender = 'cash';

-- ── mms_fulfill_cash_order — the cash twin of mms_fulfill_order ───────────────────────────────────
-- Snapshots the server-priced cart into a qr_order (+ items) in CENTS, tender='cash'. Mirrors the card
-- RPC's discipline: totals are computed ONCE by getCartTotals (TS, the single tax engine) and passed
-- in; SQL re-derives only the SUBTOTAL SUM from the live line rows and reconciles it against the passed
-- subtotal, so a cart mutated between the totals read and this call (a diner racing the settle) raises
-- instead of recording a stale total. IDEMPOTENT on cart_id (a retry returns the same order). The
-- open→paid flip is conditional + atomic, so a card payment can't also fulfill this cart (and the
-- caller refuses cash while a single-pay lock / split freeze is live — see lib/pay-guard.ts).
create or replace function mms_fulfill_cash_order(
  p_cart_id uuid,
  p_settled_by uuid,
  p_subtotal_cents integer,
  p_discount_cents integer,
  p_service_charge_cents integer,
  p_tax_cents integer,
  p_tip_cents integer default 0
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_order uuid; v_total integer; v_derived_subtotal integer; v_session uuid; v_status text;
begin
  -- Idempotent: a prior cash settlement of this cart returns the same order (retry / double-tap safe).
  select id into v_order from public.qr_orders where cart_id = p_cart_id and tender = 'cash';
  if v_order is not null then return v_order; end if;

  -- Re-derive the subtotal from the live lines and reconcile against the passed breakdown — the cash
  -- analog of the card RPC's `v_total <> p_amount_cents` charge reconcile. Catches a cart that changed
  -- under the settle. (Tax/service/discount stay TS-derived — the single tax engine — same as card.)
  select coalesce(sum(unit_price_cents * qty), 0) into v_derived_subtotal
    from public.qr_cart_items where cart_id = p_cart_id;
  if v_derived_subtotal <> p_subtotal_cents then
    raise exception 'cash settle subtotal mismatch: derived=% passed=%', v_derived_subtotal, p_subtotal_cents;
  end if;

  v_total := p_subtotal_cents - p_discount_cents + p_service_charge_cents + p_tax_cents + p_tip_cents;

  -- Atomic claim: flip the cart open→paid only if it's still open. 0 rows ⇒ the cart was already
  -- settled (by card), cancelled, or closed — never double-settle. (The idempotent return above already
  -- handled a prior CASH settle, so reaching here with no row means a non-cash terminal state.)
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

  return v_order;
end; $$;

-- NOTE on the reconcile scope: we re-derive only the SUBTOTAL in SQL (the realistic race is a diner
-- adding/removing/qty-ing a line, which moves the subtotal). Tax/service/discount are pure functions of
-- the same line rows via the single TS engine (getCartTotals), so we don't mirror that rule in SQL
-- (SQL/TS drift is the bigger risk); a subtotal-preserving tax change (e.g. an admin flipping a line's
-- tax_category mid-settle) is not a realistic in-flight event. Same posture as the card twin, which
-- reconciles only the total against the external charge.

-- SECURITY DEFINER lockdown (parity with the other mms_* fns): never callable by anon/authenticated —
-- only the service-role server action (settleCash, after requireStaff) invokes it.
revoke all on function mms_fulfill_cash_order(uuid, uuid, integer, integer, integer, integer, integer) from public;
grant execute on function mms_fulfill_cash_order(uuid, uuid, integer, integer, integer, integer, integer) to service_role;

-- ── Cross-tender backstop on the CARD path (mms_fulfill_order) ────────────────────────────────────
-- The cash RPC's atomic open→paid flip stops cash from settling a card-paid cart; this adds the MIRROR
-- so a late card webhook can't fulfill a CASH-settled cart (a single-pay PI whose pay-lock went stale,
-- then staff settled cash, then the PI succeeds late → without this, mms_fulfill_order would insert a
-- SECOND, card order = double charge). After the PI-idempotency return (a legit card retry returns its
-- own order, cart already 'paid' by THAT order — never reaches here), require the cart still be OPEN;
-- if another tender settled it, RAISE so the orphan charge is visible for a manual refund rather than
-- silently double-recorded. The webhook ALSO guards this gracefully (acks + alerts) so Stripe doesn't
-- retry-storm; this is the hard DB invariant. Restated verbatim from 20260618000000 + the one guard.
create or replace function mms_fulfill_order(
  p_cart_id uuid,
  p_payment_intent text,
  p_amount_cents integer,
  p_subtotal_cents integer,
  p_discount_cents integer,
  p_service_charge_cents integer,
  p_tax_cents integer,
  p_tip_cents integer default 0
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_order uuid; v_total integer;
begin
  select id into v_order from public.qr_orders where stripe_payment_intent_id = p_payment_intent;
  if v_order is not null then return v_order; end if;  -- idempotent: retry returns the order

  -- Cross-tender guard (S1.3): the cart must still be OPEN. If another tender (cash) already settled it,
  -- don't record a duplicate order — raise so the charge surfaces for a refund.
  if not exists (select 1 from public.qr_carts where id = p_cart_id and status = 'open') then
    raise exception 'cart % is not open (already settled by another tender) — refund PI %',
      p_cart_id, p_payment_intent;
  end if;

  v_total := p_subtotal_cents - p_discount_cents + p_service_charge_cents + p_tax_cents + p_tip_cents;
  if v_total <> p_amount_cents then
    raise exception 'fulfillment amount mismatch: breakdown=% intent=%', v_total, p_amount_cents;
  end if;

  insert into public.qr_orders (session_id, subtotal_cents, discount_cents, service_charge_cents,
                         tax_cents, tip_cents, total_cents, stripe_payment_intent_id, status)
    select c.session_id, p_subtotal_cents, p_discount_cents, p_service_charge_cents,
           p_tax_cents, p_tip_cents, v_total, p_payment_intent, 'paid'
    from public.qr_carts c where c.id = p_cart_id
    returning id into v_order;

  insert into public.qr_order_items (order_id, menu_item_id, name, qty, modifiers, unit_price_cents, tax_cents)
    select v_order, ci.menu_item_id, ci.name, ci.qty, ci.modifiers, ci.unit_price_cents, ci.tax_cents
    from public.qr_cart_items ci where ci.cart_id = p_cart_id;

  update public.qr_carts set status = 'paid' where id = p_cart_id;
  return v_order;
end; $$;
