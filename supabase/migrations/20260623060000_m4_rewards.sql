-- 20260623060000_m4_rewards.sql — M4 P4.1: account + Morning Star Rewards (QR-local). docs/M4_DESIGN.md.
-- A durable account = the anonymous auth.users row UPGRADED IN PLACE (email OTP / Google; same uid), so a
-- diner's past paid qr_orders carry over. Rewards are SERVER-AUTHORITATIVE + DERIVED from paid orders:
--   • Stars   = count of the diner's qualifying PAID orders → every milestone_step → a reward coupon.
--   • Tier    = lifetime NET spend (Σ subtotal − discount, excl tax/tip/voided/comped), server-derived.
-- Only issued COUPONS are materialized (they must persist, expire, and redeem exactly once). Earn rules
-- mirror the delivery app (min-hinthar/mandalay-morning-star-delivery-app src/lib/loyalty) so M5 unifies
-- without a rename: tier ids new/jade/ruby/gold are STABLE (display name/emoji live in TS). QR-LOCAL only —
-- no cross-project write (that's M5). Additive + idempotent.

-- ── Account ───────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.mms_profiles (
  id           uuid primary key references auth.users(id) on delete cascade,  -- == auth.uid(), stable from anon
  email        text,
  display_name text check (display_name is null or char_length(display_name) between 1 and 80),
  locale       text not null default 'en' check (locale in ('en','my')),
  theme        text not null default 'system' check (theme in ('system','light','dark')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
-- Owner-read RLS (parity with mms_approvals); writes are service-role only (the upgrade server action
-- resolves auth.uid()). PII (email/name) — never on the realtime publication, never fanned to a session.
alter table public.mms_profiles enable row level security;
revoke all on public.mms_profiles from anon, authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='mms_profiles'
                 and policyname='mms_profiles_owner_read') then
    create policy mms_profiles_owner_read on public.mms_profiles for select to authenticated
      using (auth.uid() = id);
  end if;
end $$;

-- ── Tunable policy (singleton; parity with mms_tab_config) ──────────────────────────────────────────────
create table if not exists public.mms_rewards_config (
  id                      boolean primary key default true check (id),
  milestone_step          integer not null default 5    check (milestone_step > 0),      -- Stars per reward
  reward_base_cents       integer not null default 500  check (reward_base_cents > 0),   -- $5 Kyay-Zu-Par!
  reward_min_redeem_cents integer not null default 5000 check (reward_min_redeem_cents >= 0), -- $50 min (delivery)
  reward_expiry_days      integer not null default 60   check (reward_expiry_days > 0),  -- 60-day expiry
  updated_at              timestamptz not null default now()
);
insert into public.mms_rewards_config (id) values (true) on conflict (id) do nothing;
alter table public.mms_rewards_config enable row level security;
revoke all on public.mms_rewards_config from anon, authenticated;

-- ── Tier thresholds (ids STABLE — display name/emoji live in TS, mirroring delivery's hard-won rule) ─────
create table if not exists public.mms_reward_tiers (
  id              text primary key check (id in ('new','jade','ruby','gold')),
  min_spend_cents integer not null check (min_spend_cents >= 0),
  sort            integer not null
);
insert into public.mms_reward_tiers (id, min_spend_cents, sort) values
  ('new', 0, 0), ('jade', 25000, 1), ('ruby', 75000, 2), ('gold', 150000, 3)
  on conflict (id) do nothing;
alter table public.mms_reward_tiers enable row level security;
revoke all on public.mms_reward_tiers from anon, authenticated;

-- ── Issued reward coupons (materialized; persist + expire + redeem-once) ────────────────────────────────
create table if not exists public.mms_rewards (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  reward_code       text not null unique,
  amount_cents      integer not null check (amount_cents > 0),
  kind              text not null default 'milestone' check (kind in ('milestone')),
  milestone_index   integer not null check (milestone_index >= 1),
  issued_at         timestamptz not null default now(),
  expires_at        timestamptz not null,
  redeemed_at       timestamptz,
  redeemed_order_id uuid,
  unique (user_id, milestone_index)   -- idempotent issue: one coupon per milestone crossed
);
create index if not exists mms_rewards_user_idx on public.mms_rewards(user_id, issued_at desc);
alter table public.mms_rewards enable row level security;
revoke all on public.mms_rewards from anon, authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='mms_rewards'
                 and policyname='mms_rewards_owner_read') then
    create policy mms_rewards_owner_read on public.mms_rewards for select to authenticated
      using (auth.uid() = user_id);
  end if;
end $$;

-- ── Earner attribution on the settled order (service-role write at fulfillment; nullable = cash/staff) ──
alter table public.qr_orders add column if not exists earned_by uuid;
create index if not exists qr_orders_earned_by_idx on public.qr_orders(earned_by) where earned_by is not null;

-- ── mms_reward_on_fulfill: recompute Stars for the earner, issue the milestone coupon idempotently. Never
-- charges, never on a non-earner. Called by the webhook AFTER earned_by is stamped + the order is paid. ──
create or replace function mms_reward_on_fulfill(p_user uuid) returns void
  language plpgsql security definer set search_path = '' as $$
declare v_stars integer; v_step integer; v_amount integer; v_days integer; v_idx integer;
begin
  if p_user is null then return; end if;
  select milestone_step, reward_base_cents, reward_expiry_days
    into v_step, v_amount, v_days from public.mms_rewards_config where id;
  if v_step is null or v_step <= 0 then return; end if;
  -- Stars = the earner's qualifying PAID orders (server truth; voided/comped already excluded from snapshots).
  select count(*) into v_stars from public.qr_orders where earned_by = p_user and status = 'paid';
  v_idx := v_stars / v_step;                 -- integer division → full milestones reached
  if v_idx < 1 then return; end if;          -- not at a reward yet
  -- One coupon per milestone index (idempotent: a Stripe redelivery / recompute can't mint a second).
  insert into public.mms_rewards (user_id, reward_code, amount_cents, milestone_index, expires_at)
    values (p_user,
            'MS-' || upper(left(replace(gen_random_uuid()::text, '-', ''), 10)),
            v_amount, v_idx, now() + make_interval(days => v_days))
    on conflict (user_id, milestone_index) do nothing;
end $$;
revoke all on function public.mms_reward_on_fulfill(uuid) from public, anon, authenticated;
grant execute on function public.mms_reward_on_fulfill(uuid) to service_role;

-- ── mms_rewards_summary: the diner's server-derived rewards state (stars/spend/tier/progress). Read via a
-- member-gated server action that resolves auth.uid(), so a diner only ever sees their OWN summary. ──────
create or replace function mms_rewards_summary(p_user uuid) returns jsonb
  language plpgsql security definer set search_path = '' as $$
declare v_stars integer; v_spend bigint; v_step integer; v_tier text; v_to_next integer;
begin
  select milestone_step into v_step from public.mms_rewards_config where id;
  select count(*), coalesce(sum(greatest(subtotal_cents - discount_cents, 0)), 0)
    into v_stars, v_spend
    from public.qr_orders where earned_by = p_user and status = 'paid';
  select id into v_tier from public.mms_reward_tiers
    where min_spend_cents <= v_spend order by min_spend_cents desc limit 1;
  v_to_next := case when v_step > 0 then v_step - (v_stars % v_step) else null end;
  return jsonb_build_object(
    'stars', v_stars,
    'spend_cents', v_spend,
    'tier_id', coalesce(v_tier, 'new'),
    'milestone_step', v_step,
    'orders_to_next', v_to_next
  );
end $$;
revoke all on function public.mms_rewards_summary(uuid) from public, anon, authenticated;
grant execute on function public.mms_rewards_summary(uuid) to service_role;
