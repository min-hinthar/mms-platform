-- 20260713000000_k2_table_registry.sql — Journey II K2: the table registry.
--
-- Dine-in sessions have carried no human table label (the floor board, KDS, expo, /track, receipt all
-- show the opaque qr_code sticker token). This adds a real 1–10 table identity:
--   1) qr_tables — the sticker↔number registry (the mapping is DATA, so re-stickering a table is an
--      UPDATE, not a deploy). RLS-locked, service-role only: the tokens are join keys, never exposed
--      via the anon key. The session mint + picker RSC + floor board all read it via the service client.
--   2) table_sessions.table_number — the registered table a dine-in session is seated at (null for a
--      host-mint join code or an unregistered/legacy sticker — NEVER brick those). FK to the registry.
--   3) qr_orders.table_number — a DENORMALIZED snapshot stamped at fulfillment from the session, so the
--      table survives on surfaces the live session read can't reach: the anon /track embed of
--      table_sessions is gated by is_member (status<>'closed' AND expires_at>now()), so it goes null
--      after the ~4h session TTL; a receipt read days later hits a closed session. Plain int (a
--      historical label — NO FK: a re-numbered/retired table must never cascade to or block a paid
--      order). Null for pickup/scango orders. Matches the existing pickup_slot/fire_at copy pattern.
--
-- SAFETY: purely additive. The three fulfill RPCs are restated in full (create-or-replace) with the
-- ONLY change being the table_number snapshot (a scalar select off the already-loaded v_session + one
-- insert column) — no signature change, no logic change to the money math, idempotency preserved.

-- ── 1) The registry ───────────────────────────────────────────────────────────────────────────────
create table if not exists public.qr_tables (
  table_number int primary key check (table_number between 1 and 99),
  qr_code text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.qr_tables enable row level security;
-- No policies → no anon/authenticated access under RLS. The tokens are session join keys; the picker
-- RSC + mint resolve number→token server-side (service client) and never hand the token to the client
-- until an authorized mint returns it as the joinCode.
revoke all on public.qr_tables from public, anon, authenticated;
grant select on public.qr_tables to service_role;

-- Seed tables 1–10 with opaque, unguessable 8-char UPPERCASE tokens (so a registered table is the
-- source of truth, not a guessable "table-3"). The token IS the session join code — it's shown in the
-- invite sheet + typed in the join fallback, which upper-cases input — so an 8-char uppercase code
-- matches the generateJoinCode UX (a 33-char hex blob would be untypable and mis-case on the join).
-- gen_random_uuid() is volatile → evaluated per row, so each table gets a DISTINCT token. Idempotent:
-- re-running never rewrites an existing row (physical stickers, once printed, stay stable;
-- re-stickering is a deliberate UPDATE).
insert into public.qr_tables (table_number, qr_code)
select n, upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
from generate_series(1, 10) as n
on conflict (table_number) do nothing;

-- ── 2) Session table identity ─────────────────────────────────────────────────────────────────────
alter table public.table_sessions
  add column if not exists table_number int references public.qr_tables(table_number);

-- ── 3) Order table snapshot (denormalized, expiry/RLS-safe) ────────────────────────────────────────
alter table public.qr_orders
  add column if not exists table_number int;

-- ── Fulfill RPCs restated with the table_number stamp ───────────────────────────────────────────────
-- CARD path (restated from 20260702000100; only add: v_table declare + lookup + insert column/value).
create or replace function public.mms_fulfill_order(
  p_cart_id uuid, p_payment_intent text, p_amount_cents integer, p_subtotal_cents integer,
  p_discount_cents integer, p_service_charge_cents integer, p_tax_cents integer, p_tip_cents integer default 0
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_order uuid; v_total integer; v_session uuid; v_promo text;
  v_slot timestamptz; v_fire timestamptz; v_table integer;
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

  -- K2: snapshot the session's registered table number onto the order (null for pickup/scango or an
  -- unregistered sticker) so /track + the receipt show it after the session read has expired.
  select table_number into v_table from public.table_sessions where id = v_session;

  insert into public.qr_orders (session_id, subtotal_cents, discount_cents, service_charge_cents,
                         tax_cents, tip_cents, total_cents, stripe_payment_intent_id, status,
                         pickup_slot, fire_at, cart_id, table_number)
    values (v_session, p_subtotal_cents, p_discount_cents, p_service_charge_cents,
            p_tax_cents, p_tip_cents, v_total, p_payment_intent, 'paid', v_slot, v_fire, p_cart_id, v_table)
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

-- CASH path (restated from 20260624000000; only add: v_table declare + lookup + insert column/value).
create or replace function public.mms_fulfill_cash_order(
  p_cart_id uuid, p_settled_by uuid, p_subtotal_cents integer, p_discount_cents integer,
  p_service_charge_cents integer, p_tax_cents integer, p_tip_cents integer default 0
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_order uuid; v_total integer; v_derived_subtotal integer; v_session uuid; v_status text; v_promo text; v_table integer;
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

  select table_number into v_table from public.table_sessions where id = v_session; -- K2 snapshot

  insert into public.qr_orders (session_id, subtotal_cents, discount_cents, service_charge_cents,
                         tax_cents, tip_cents, total_cents, status, tender, cart_id, settled_by, table_number)
    values (v_session, p_subtotal_cents, p_discount_cents, p_service_charge_cents,
            p_tax_cents, p_tip_cents, v_total, 'paid', 'cash', p_cart_id, p_settled_by, v_table)
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
revoke all on function public.mms_fulfill_cash_order(uuid, uuid, integer, integer, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.mms_fulfill_cash_order(uuid, uuid, integer, integer, integer, integer, integer)
  to service_role;

-- SPLIT path (restated from 20260702000100; only add: v_table declare + lookup + insert column/value).
create or replace function public.mms_fulfill_split_order(p_cart_id uuid, p_expected_total_cents integer)
  returns uuid language plpgsql security definer set search_path = '' as $$
declare v_order uuid; v_session uuid; v_sum integer; v_open integer; v_table integer;
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

  select table_number into v_table from public.table_sessions where id = v_session; -- K2 snapshot

  insert into public.qr_orders (session_id, subtotal_cents, discount_cents, service_charge_cents,
                         tax_cents, tip_cents, total_cents, stripe_payment_intent_id, status, cart_id, table_number)
    select v_session, sum(subtotal_cents), sum(discount_cents), sum(service_charge_cents),
           sum(tax_cents), sum(tip_cents), sum(amount_cents), null, 'paid', p_cart_id, v_table
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
