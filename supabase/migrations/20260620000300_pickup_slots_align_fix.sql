-- 20260620000300_pickup_slots_align_fix.sql  (M2·P2.2 fix)
-- Fix a regression in 0200: the multiday rewrite moved `now+lead` INTO the per-day generate_series lower
-- bound, so TODAY's grid got anchored at now+lead — a non-aligned instant that drifts every second. Two
-- real breakages across the whole normal operating window (any time now+lead > open, i.e. after ~10:10
-- local with the default 10:30 open / 20 m lead):
--   (1) same-day slots render off the :00/:15/:30/:45 grid the diner expects (e.g. 11:18, 11:33); and
--   (2) the grid instants drift between selection and re-validation — and BOTH mms_set_pickup_slot
--       (0100) and create-intent re-call this fn — so a validly-chosen same-day slot matches NOTHING on
--       the freshly regenerated grid → set returns 'unavailable' and checkout 409s "that slot just
--       filled", false-rejecting every same-day pickup.
-- Restore 0100's pattern: anchor each day's series at that day's OPEN (stable, aligned to the slot grid)
-- and FILTER `slot >= now+lead` to drop today's past/too-soon slots. Future days keep all their slots
-- (their open is already later than now+lead). Idempotent create-or-replace; signature/return unchanged
-- (no generated-types drift). Multiday rollover + capacity/hold accounting from 0200 are preserved as-is.
create or replace function public.mms_pickup_slots(p_exclude_cart uuid default null)
returns table(slot_time timestamptz, remaining integer)
language plpgsql stable security definer set search_path = '' as $$
declare
  cfg     public.pickup_config%rowtype;
  v_now   timestamptz := now();
  v_today date;
  v_first timestamptz;
begin
  select * into cfg from public.pickup_config where id;
  if not found then return; end if;
  v_today := (v_now at time zone cfg.tz)::date;
  v_first := v_now + make_interval(mins => cfg.lead_minutes);  -- earliest bookable instant (now + lead)
  -- For each day [today .. today+horizon], generate that day's grid ANCHORED at the day's open so every
  -- slot lands on the aligned wall-clock (:00/:15/...), then drop any slot before now+lead. Anchoring at
  -- a STABLE open — not at now+lead — is what keeps the grid instants identical between a diner's pick
  -- and the pay-boundary re-check, so a valid same-day slot still matches itself seconds later.
  return query
    select s.slot, (cfg.capacity_per_slot - b.booked)::integer
    from generate_series(0, cfg.horizon_days) as d(off)
    cross join lateral generate_series(
      ((v_today + d.off) + cfg.open_time)  at time zone cfg.tz,   -- anchor at the day's OPEN (aligned)
      ((v_today + d.off) + cfg.close_time) at time zone cfg.tz,
      make_interval(mins => cfg.slot_minutes)
    ) as s(slot)
    cross join lateral (
      select (select count(*) from public.qr_orders o
                where o.pickup_slot = s.slot and o.status = 'paid')
           + (select count(*) from public.qr_carts c
                join public.table_sessions ts on ts.id = c.session_id
                where c.pickup_slot = s.slot and c.status = 'open'
                  and ts.status = 'active' and ts.expires_at > v_now
                  and c.updated_at > v_now - make_interval(mins => cfg.hold_minutes)
                  and c.id is distinct from p_exclude_cart) as booked
    ) b
    where s.slot >= v_first                            -- drop today's past / too-soon slots
      and cfg.capacity_per_slot - b.booked > 0
    order by s.slot;
end; $$;

-- CREATE OR REPLACE preserves the ACL, but re-assert the lockdown (idempotent) for the record.
revoke all on function public.mms_pickup_slots(uuid) from public, anon, authenticated;
grant execute on function public.mms_pickup_slots(uuid) to service_role;
