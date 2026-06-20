-- 20260620000200_pickup_multiday.sql  (M2·P2.2 follow-up)
-- Roll pickup slots over to the next open day(s). "Today only" stranded after-hours browsers on "no
-- times left" with no way to pre-order — a 9pm visitor should be able to book tomorrow morning. Same
-- capacity / hold / tz rules per slot; `horizon_days` bounds how far ahead we offer; the UI groups by day.
alter table public.pickup_config
  add column if not exists horizon_days integer not null default 2 check (horizon_days between 0 and 14);

create or replace function public.mms_pickup_slots(p_exclude_cart uuid default null)
returns table(slot_time timestamptz, remaining integer)
language plpgsql stable security definer set search_path = '' as $$
declare
  cfg   public.pickup_config%rowtype;
  v_now timestamptz := now();
  v_today date;
begin
  select * into cfg from public.pickup_config where id;
  if not found then return; end if;
  v_today := (v_now at time zone cfg.tz)::date;
  -- For each day [today .. today+horizon], generate its slots in the shop tz from max(open, now+lead)
  -- to close; today's past slots fall away (lower bound > close ⇒ empty), future days fill in. `booked`
  -- = paid orders + live holds for that exact instant (see 0100), excluding the caller's own hold.
  return query
    select s.slot, (cfg.capacity_per_slot - b.booked)::integer
    from generate_series(0, cfg.horizon_days) as d(off)
    cross join lateral generate_series(
      greatest(((v_today + d.off) + cfg.open_time)  at time zone cfg.tz,
               v_now + make_interval(mins => cfg.lead_minutes)),
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
    where cfg.capacity_per_slot - b.booked > 0
    order by s.slot;
end; $$;

-- CREATE OR REPLACE preserves the ACL, but re-assert the lockdown (idempotent) for the record.
revoke all on function public.mms_pickup_slots(uuid) from public, anon, authenticated;
grant execute on function public.mms_pickup_slots(uuid) to service_role;
