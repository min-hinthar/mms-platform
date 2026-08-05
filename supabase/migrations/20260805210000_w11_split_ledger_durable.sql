-- ── W11 — the split ledger becomes durable (M1/M25 · M45 · M43 · M29) ────────────────────────────────
--
-- Four changes, one theme: every number the settlement decides with is PINNED and PERSISTED, never
-- re-derived from something live.
--
--  1. `qr_carts.settle_expected_cents` — the expected settlement BASE, written once at `openSettlement`.
--     W10d proved the live alternative wrong twice: the cart total legitimately moves mid-settlement
--     (the webhook burns the applied reward right after fulfilling; a promo can expire), so comparing a
--     pinned ledger against a live derivation turned a self-healing no-op into a permanent 72h failure
--     loop. The pin is written when the shares are derived FROM it, so the two cannot diverge except by
--     a real fault — which is exactly what the reconcile below exists to catch.
--  2. `qr_cart_shares.capture_started_at` — M45's serialization stamp, written BEFORE each
--     `paymentIntents.capture`. Abort/re-open treat a stamped share as money in motion (their deletes
--     exclude it), so the "release payer A's hold, then meet payer B's already-captured one" race
--     closes at the only point that orders both sides: a row write.
--  3. `mms_fulfill_split_order(p_cart_id)` — the tautological `p_expected_total_cents` parameter is
--     GONE. The fn reads the pin and compares Σ(amount − tip) over the captured shares against it; a
--     mismatch writes a durable `qr_refunds_needed` row (M43) BEFORE raising, and the idempotent
--     already-fulfilled branch runs FIRST so a redelivery of a completed settlement can never re-enter
--     the guard (the precise ordering the reverted W10d attempt got wrong).
--  4. `qr_order_payers` — M29's durable payer↔order link. `qr_cart_shares.order_id` already proves who
--     paid, but shares die with the cart at clear-table; this table survives, so every split payer can
--     find their paid order in /account for as long as the order exists. (Whether non-host payers also
--     EARN a Star is a product decision — deliberately not made here; `earned_by` is unchanged.)

-- 1 ─ the pin ──────────────────────────────────────────────────────────────────────────────────────────
alter table public.qr_carts
  add column if not exists settle_expected_cents integer
  check (settle_expected_cents is null or settle_expected_cents >= 0);

-- 2 ─ the capture-claim stamp ─────────────────────────────────────────────────────────────────────────
alter table public.qr_cart_shares
  add column if not exists capture_started_at timestamptz;

-- 3 ─ the durable payer link ──────────────────────────────────────────────────────────────────────────
create table if not exists public.qr_order_payers (
  order_id   uuid not null references public.qr_orders(id) on delete cascade,
  payer_uid  uuid not null,
  created_at timestamptz not null default now(),
  primary key (order_id, payer_uid)
);
alter table public.qr_order_payers enable row level security;  -- default-deny: service-role only
revoke all on public.qr_order_payers from anon, authenticated;

-- 4 ─ the fulfillment fn, re-grounded ─────────────────────────────────────────────────────────────────
-- Both signatures dropped so the migration is re-runnable (a `drop … if exists` that misses the NEW
-- signature makes the second apply die at "already exists" and silently skip everything after it).
drop function if exists public.mms_fulfill_split_order(uuid, integer);
drop function if exists public.mms_fulfill_split_order(uuid);

create function public.mms_fulfill_split_order(p_cart_id uuid)
  returns uuid language plpgsql security definer set search_path = '' as $$
declare v_order uuid; v_session uuid; v_base_sum integer; v_captured_sum integer;
        v_open integer; v_pin integer;
begin
  select session_id, settle_expected_cents into v_session, v_pin
    from public.qr_carts where id = p_cart_id;

  -- IDEMPOTENT BRANCH FIRST. A redelivered `succeeded` event for an already-fulfilled settlement must
  -- return the stamped order before ANY guard can raise — the reverted W10d reconcile raised before
  -- this branch, which converted every redelivery into a 500 and the settlement into a 72h loop.
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

  -- The REAL reconcile (M1/M25): the captured ledger's BASE (amount − tip, tips are per-payer additions
  -- the pin never included) against the constant persisted when these very shares were derived. A NULL
  -- pin is a settlement opened before this migration deployed — for that one window, degrade to the
  -- old behaviour (no second opinion) rather than dead-ending a live table mid-deploy.
  select coalesce(sum(amount_cents - tip_cents), 0), coalesce(sum(amount_cents), 0)
    into v_base_sum, v_captured_sum
    from public.qr_cart_shares where cart_id = p_cart_id and status = 'captured';
  if v_pin is not null and v_base_sum <> v_pin then
    -- Durable record BEFORE the raise (M43): the raise makes Stripe redeliver for 72h, and each
    -- redelivery lands back here — the ledger row is what turns that loop into an operator surface.
    -- Idempotent on the synthetic key, so the redeliveries don't multiply rows.
    insert into public.qr_refunds_needed (payment_intent, cart_id, amount_cents, reason)
      values ('split:' || p_cart_id::text, p_cart_id, v_captured_sum, 'split_reconcile_mismatch')
      on conflict (payment_intent) do nothing;
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

  -- M29: persist WHO paid, beyond the shares' lifetime. Only real payers (a $0 auto-settled seat has no
  -- PaymentIntent and nothing to find in an account). `on conflict` because a raced sibling delivery of
  -- the same settlement must stay a no-op.
  insert into public.qr_order_payers (order_id, payer_uid)
    select v_order, seat_id from public.qr_cart_shares
      where cart_id = p_cart_id and status = 'captured' and stripe_payment_intent_id is not null
    on conflict (order_id, payer_uid) do nothing;

  return v_order;
end; $$;
revoke all on function public.mms_fulfill_split_order(uuid) from public, anon, authenticated;
grant execute on function public.mms_fulfill_split_order(uuid) to service_role;
