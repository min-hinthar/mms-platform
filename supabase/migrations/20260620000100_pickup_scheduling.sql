-- 20260620000100_pickup_scheduling.sql  (M2·P2.2)
-- Honest pickup scheduling: capacity-limited time slots + a server-computed fire-time. The diner picks
-- a real slot (full slots are unavailable), and /track's ETA echoes that slot — never a fabricated
-- countdown. `fire_at` is computed + stored now as the seam S2's KDS will consume; M2 has no kitchen
-- actor, so nothing fires yet. All slot logic is service-role-only SECURITY DEFINER (the client can't
-- mint a slot or dodge capacity).

-- ============ tunable pickup config (single row) ============
create table public.pickup_config (
  id                boolean primary key default true check (id),  -- single-row guard
  tz                text    not null default 'America/Los_Angeles',
  open_time         time    not null default '10:30',
  close_time        time    not null default '18:30',  -- last bookable slot start
  slot_minutes      integer not null default 15 check (slot_minutes between 5 and 60),
  capacity_per_slot integer not null default 6  check (capacity_per_slot >= 1),
  lead_minutes      integer not null default 20 check (lead_minutes >= 0),   -- earliest slot = now + lead
  prep_minutes      integer not null default 12 check (prep_minutes >= 0),   -- fire_at = slot - prep
  hold_minutes      integer not null default 30 check (hold_minutes >= 1)    -- an open cart "holds" its slot this long since last activity
);
insert into public.pickup_config (id) values (true) on conflict do nothing;
alter table public.pickup_config enable row level security;  -- default-deny; read only via the fns below

-- ============ slot + fire-time on the cart, carried to the order ============
alter table public.qr_carts
  add column if not exists pickup_slot timestamptz,
  add column if not exists fire_at     timestamptz;
alter table public.qr_orders
  add column if not exists pickup_slot timestamptz,
  add column if not exists fire_at     timestamptz;
-- the capacity count filters paid orders by slot
create index qr_orders_pickup_slot_idx on public.qr_orders(pickup_slot) where pickup_slot is not null;

-- ============ available slots for today (tz-aware) + remaining capacity ============
-- Bookable, non-full slots: from max(open, now+lead) to close in the restaurant tz. `booked` counts
-- BOTH committed (paid) orders AND live HOLDS — an open cart that picked this slot and is still active
-- (touched within hold_minutes, session unexpired) — so capacity is honest DURING ordering, not only
-- after pay (else N diners all see the last seat free before any has a paid row → overbook). The
-- `p_exclude_cart` arg drops the CALLER's own hold so a diner sees true availability for their slot.
-- Empty (e.g. after close, or every slot full) ⇒ the UI says so honestly.
create function public.mms_pickup_slots(p_exclude_cart uuid default null)
returns table(slot_time timestamptz, remaining integer)
language plpgsql stable security definer set search_path = '' as $$
declare
  cfg     public.pickup_config%rowtype;
  v_now   timestamptz := now();
  v_today date;
  v_open  timestamptz;
  v_close timestamptz;
  v_first timestamptz;
begin
  select * into cfg from public.pickup_config where id;
  if not found then return; end if;
  v_today := (v_now at time zone cfg.tz)::date;
  v_open  := (v_today + cfg.open_time)  at time zone cfg.tz;   -- local wall time → instant
  v_close := (v_today + cfg.close_time) at time zone cfg.tz;
  v_first := greatest(v_open, v_now + make_interval(mins => cfg.lead_minutes));
  return query
    select g.slot, (cfg.capacity_per_slot - g.booked)::integer
    from (
      select s as slot,
             (select count(*) from public.qr_orders o
                where o.pickup_slot = s and o.status = 'paid')
           + (select count(*) from public.qr_carts c
                join public.table_sessions ts on ts.id = c.session_id
                where c.pickup_slot = s and c.status = 'open'
                  and ts.status = 'active' and ts.expires_at > v_now
                  and c.updated_at > v_now - make_interval(mins => cfg.hold_minutes)
                  and c.id is distinct from p_exclude_cart) as booked
      from generate_series(v_open, v_close, make_interval(mins => cfg.slot_minutes)) s
      where s >= v_first
    ) g
    where cfg.capacity_per_slot - g.booked > 0
    order by g.slot;
end; $$;

-- ============ set the cart's slot (validated against live availability, race-safe) ============
-- A per-slot advisory lock serializes concurrent picks of the SAME slot, so the check-then-set can't
-- overbook the last seat. The slot must be currently bookable WITH room excluding this cart's own hold —
-- mms_pickup_slots(p_cart_id) returns exactly those. Status-atomic (only an open cart). Residual: a hold
-- that ages past hold_minutes mid-payment could free a seat (rare given the lead time) — accepted soft-cap.
create function public.mms_set_pickup_slot(p_cart_id uuid, p_slot timestamptz)
returns table(ok boolean, reason text)
language plpgsql volatile security definer set search_path = '' as $$
declare cfg public.pickup_config%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext(p_slot::text));
  select * into cfg from public.pickup_config where id;
  if not found then return query select false, 'unavailable'; return; end if;
  if not exists (select 1 from public.mms_pickup_slots(p_cart_id) s where s.slot_time = p_slot) then
    return query select false, 'unavailable'; return;
  end if;
  update public.qr_carts
     set pickup_slot = p_slot,
         fire_at     = p_slot - make_interval(mins => cfg.prep_minutes),
         updated_at  = now()
   where id = p_cart_id and status = 'open';
  if not found then return query select false, 'cart_closed'; return; end if;
  return query select true, 'ok';
end; $$;

-- ============ fulfillment carries the slot + fire-time onto the order ============
-- Re-defines mms_fulfill_order (still idempotent on the PI id, still consumes the promo) to snapshot the
-- cart's pickup_slot + fire_at onto qr_orders, so the slot counts toward capacity and /track can echo it.
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
  if v_order is not null then return v_order; end if;  -- idempotent: retry returns the order

  v_total := p_subtotal_cents - p_discount_cents + p_service_charge_cents + p_tax_cents + p_tip_cents;
  if v_total <> p_amount_cents then
    raise exception 'fulfillment amount mismatch: breakdown=% intent=%', v_total, p_amount_cents;
  end if;

  select c.session_id, c.promo_code, c.pickup_slot, c.fire_at
    into v_session, v_promo, v_slot, v_fire
    from public.qr_carts c where c.id = p_cart_id;

  insert into public.qr_orders (session_id, subtotal_cents, discount_cents, service_charge_cents,
                         tax_cents, tip_cents, total_cents, stripe_payment_intent_id, status,
                         pickup_slot, fire_at)
    values (v_session, p_subtotal_cents, p_discount_cents, p_service_charge_cents,
            p_tax_cents, p_tip_cents, v_total, p_payment_intent, 'paid', v_slot, v_fire)
    returning id into v_order;

  insert into public.qr_order_items (order_id, menu_item_id, name, qty, modifiers, unit_price_cents, tax_cents)
    select v_order, ci.menu_item_id, ci.name, ci.qty, ci.modifiers, ci.unit_price_cents, ci.tax_cents
    from public.qr_cart_items ci where ci.cart_id = p_cart_id;

  if v_promo is not null and p_discount_cents > 0 then
    perform public.mms_promo_consume(v_promo, v_session, v_order);
  end if;

  update public.qr_carts set status = 'paid' where id = p_cart_id;
  return v_order;
end; $$;

-- ============ EXECUTE lockdown: slot fns are service-role only ============
-- revoke from public AND anon AND authenticated (verified live in P2.1: `from public` alone leaves the
-- explicit anon/authenticated grants Supabase adds → the fn stays callable via /rest/v1/rpc).
revoke all on function public.mms_pickup_slots(uuid)                 from public, anon, authenticated;
revoke all on function public.mms_set_pickup_slot(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.mms_pickup_slots(uuid)              to service_role;
grant execute on function public.mms_set_pickup_slot(uuid, timestamptz) to service_role;
revoke select on public.pickup_config from anon, authenticated;
