-- W5e — to-go ASAP↔scheduled choice at checkout.
--
-- Pickup scheduling (M2·P2.2) offered ONLY discrete capacity slots, and the menu forced a slot before
-- ordering. W5e adds an explicit "ASAP · make it now" choice alongside "Schedule a time". ASAP fires the
-- order immediately at settlement — `mms_fire_pending_food` (w3_kitchen) fires a to-go line at
-- `greatest(coalesce(cart.fire_at, now()), now())`, so a cart with fire_at NULL fires now.
--
-- But ASAP must NOT bypass the two gates the slot system exists for: (1) OPEN HOURS — a paid ASAP order
-- into a closed kitchen strands the diner; (2) CAPACITY — an unmetered ASAP lane defeats the per-slot
-- load smoothing (unlimited ASAP could flood the kitchen while scheduled slots stay capped). So ASAP is
-- NOT "no slot": it SNAPS the earliest bookable slot (consuming that slot's capacity, only within open
-- hours / while capacity remains — all via mms_pickup_slots) yet fires immediately (fire_at = null). The
-- snapped pickup_slot also gives /track a safe "ready by" (the food is actually ready ~prep from now,
-- sooner than the slot — a safe under-promise). The gate is enforced at the CHARGE boundary so a client
-- can't dodge it.
--
-- Money-invariant: pickup_slot/fire_at are fulfillment metadata, never price — getCartTotals reads
-- neither, so choosing ASAP vs scheduled moves no amount.

-- ── Clear the cart's slot back to "pending ASAP" (null). The checkout control uses this when a diner
-- toggles from a scheduled slot back to ASAP; the actual capacity+hours SNAP happens at the pay boundary
-- (mms_pickup_asap), so a stale scheduled slot must first be cleared to null. Status-atomic, service-only.
create or replace function public.mms_clear_pickup_slot(p_cart_id uuid)
returns table(ok boolean, reason text)
language plpgsql volatile security definer set search_path = '' as $$
begin
  update public.qr_carts
     set pickup_slot = null,
         fire_at     = null,
         updated_at  = now()
   where id = p_cart_id and status = 'open';
  if not found then return query select false, 'cart_closed'; return; end if;
  return query select true, 'ok';
end; $$;
revoke all on function public.mms_clear_pickup_slot(uuid) from public, anon, authenticated;
grant execute on function public.mms_clear_pickup_slot(uuid) to service_role;

-- ── ASAP snap (the charge-boundary gate). Only honest while the kitchen is OPEN NOW; snaps the soonest
-- bookable slot (mms_pickup_slots already encodes lead + capacity, excluding this cart's own hold) so ASAP
-- consumes real capacity; fires immediately (fire_at = null). A per-slot advisory lock serializes the pick
-- so concurrent ASAP callers can't overbook the last seat. Status-atomic. Reasons: 'closed' (kitchen not
-- open now), 'full' (open but no capacity left today), 'cart_closed', 'unavailable' (no config).
create or replace function public.mms_pickup_asap(p_cart_id uuid)
returns table(ok boolean, reason text)
language plpgsql volatile security definer set search_path = '' as $$
declare
  cfg     public.pickup_config%rowtype;
  v_now   timestamptz := now();
  v_today date;
  v_open  timestamptz;
  v_close timestamptz;
  v_slot  timestamptz;
begin
  select * into cfg from public.pickup_config where id;
  if not found then return query select false, 'unavailable'; return; end if;
  v_today := (v_now at time zone cfg.tz)::date;
  v_open  := (v_today + cfg.open_time)  at time zone cfg.tz;   -- local wall time → instant
  v_close := (v_today + cfg.close_time) at time zone cfg.tz;
  -- ASAP means "cook it now" — refuse outside open hours (the food would fire into a closed kitchen).
  if v_now < v_open or v_now > v_close then
    return query select false, 'closed'; return;
  end if;
  -- Snap the soonest bookable slot (excludes this cart's own hold via p_exclude_cart).
  select s.slot_time into v_slot
    from public.mms_pickup_slots(p_cart_id) s order by s.slot_time limit 1;
  if v_slot is null then
    return query select false, 'full'; return;   -- open, but every remaining slot today is full
  end if;
  -- Serialize the pick of THIS slot so two concurrent ASAP callers can't overbook its last seat.
  perform pg_advisory_xact_lock(hashtext(v_slot::text));
  -- Re-verify under the lock (a concurrent pick may have taken the last seat between select and lock).
  if not exists (select 1 from public.mms_pickup_slots(p_cart_id) s where s.slot_time = v_slot) then
    return query select false, 'full'; return;
  end if;
  update public.qr_carts
     set pickup_slot = v_slot,   -- consume the slot's capacity + give /track a safe "ready by"
         fire_at     = null,     -- fire NOW: mms_fire_pending_food fires a null-fire_at line at settlement
         updated_at  = now()
   where id = p_cart_id and status = 'open';
  if not found then return query select false, 'cart_closed'; return; end if;
  return query select true, 'ok';
end; $$;
revoke all on function public.mms_pickup_asap(uuid) from public, anon, authenticated;
grant execute on function public.mms_pickup_asap(uuid) to service_role;

-- ── Read-only "can a diner choose ASAP right now?" for the checkout control's pre-warning: open NOW and
-- at least one slot has room. Same tz/hours math as the snap, so the pill never offers an ASAP that the
-- pay boundary would reject.
create or replace function public.mms_pickup_asap_ok()
returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  cfg     public.pickup_config%rowtype;
  v_now   timestamptz := now();
  v_today date;
  v_open  timestamptz;
  v_close timestamptz;
begin
  select * into cfg from public.pickup_config where id;
  if not found then return false; end if;
  v_today := (v_now at time zone cfg.tz)::date;
  v_open  := (v_today + cfg.open_time)  at time zone cfg.tz;
  v_close := (v_today + cfg.close_time) at time zone cfg.tz;
  if v_now < v_open or v_now > v_close then return false; end if;
  return exists (select 1 from public.mms_pickup_slots(null) s);
end; $$;
revoke all on function public.mms_pickup_asap_ok() from public, anon, authenticated;
grant execute on function public.mms_pickup_asap_ok() to service_role;
