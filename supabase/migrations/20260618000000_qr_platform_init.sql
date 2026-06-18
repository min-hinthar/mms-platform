-- 20260618000000_qr_platform_init.sql
-- Clean initial schema for the MMS QR/Platform project (fasnpdhtvqtzjlvruqcu).
-- This project is OWNED by us (no longer bending around the live delivery DB), so:
--   • The catalog (menu_categories/menu_items/modifier_*) lives HERE and is seeded from
--     supabase/seed.sql (real Mandalay Morning Star menu, exact UUIDs, cents).
--   • tax_category is a first-class COLUMN on menu_items (no side tables / resolver fn).
--   • Diners are anonymous via Supabase Anonymous Auth; RLS authorizes off auth.uid()
--     joined against session_members (membership is data, not a JWT claim).
--   • Writes are service-role only (Server Actions); clients are default-deny (SELECT only).
--   • Day-1 hardened: every function pins search_path; SECURITY DEFINER fns revoke EXECUTE
--     from anon/authenticated where not needed; every FK has a covering index.
-- Money is integer CENTS end-to-end. See docs/BACKEND_ARCHITECTURE.md.

-- ============ category-aware tax engine (mirror of apps/qr/lib/tax.ts — keep in sync) ============
-- CA CDTFA Reg 1603 / 80-80: hot & prepared always taxable; cold food taxable only dine-in;
-- retail non-food always taxable; grocery staples exempt. Location rate is a single constant.
create function mms_tax_rate() returns numeric language sql immutable
set search_path = '' as $$
  select 0.0975::numeric;  -- Covina combined rate; update in this one place (+ lib/tax.ts)
$$;

create function mms_taxable(category text, dine_in boolean) returns boolean
language sql immutable set search_path = '' as $$
  select case category
    when 'hot_prepared'   then true
    when 'cold_food'      then coalesce(dine_in, false)
    when 'beverage_hot'   then true               -- prepared hot tea/coffee
    when 'beverage_cold'  then coalesce(dine_in, false)
    when 'retail_nonfood' then true               -- balms, umbrellas, brooms
    when 'grocery_food'   then false
    else true                                     -- safe default: taxable
  end;
$$;

create function mms_line_tax(amount_cents integer, category text, dine_in boolean)
returns integer language sql immutable set search_path = '' as $$
  select round(case when public.mms_taxable(category, dine_in)
                    then amount_cents * public.mms_tax_rate() else 0 end)::integer;
$$;

-- ============ catalog (owned here; seeded from supabase/seed.sql) ============
create table menu_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table menu_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references menu_categories(id) on delete restrict,
  slug text not null unique,
  name_en text not null,
  name_my text,
  description_en text,
  base_price_cents int not null check (base_price_cents >= 0),
  image_url text,
  image_updated_at timestamptz,
  is_active boolean not null default true,
  is_sold_out boolean not null default false,
  allergens text[] not null default '{}',
  tags text[] not null default '{}',
  -- tax classification as a first-class column (parity with lib/tax.ts TaxCategory)
  tax_category text not null default 'hot_prepared' check (tax_category in
    ('hot_prepared','cold_food','beverage_hot','beverage_cold','retail_nonfood','grocery_food')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table modifier_groups (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  selection_type text not null default 'single' check (selection_type in ('single','multiple')),
  min_select int not null default 0,
  max_select int not null default 1,
  created_at timestamptz not null default now()
);

create table modifier_options (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references modifier_groups(id) on delete cascade,
  slug text not null unique,
  name text not null,
  price_delta_cents int not null default 0,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table item_modifier_groups (
  item_id uuid not null references menu_items(id) on delete cascade,
  group_id uuid not null references modifier_groups(id) on delete cascade,
  primary key (item_id, group_id)
);

-- ============ grocery Scan & Go catalog (UPC-keyed; EBT eligibility) ============
create table grocery_items (
  barcode text primary key,                 -- UPC-A / EAN-13
  name text not null,
  name_my text,
  price_cents int not null check (price_cents >= 0),
  tax_category text not null check (tax_category in
    ('hot_prepared','cold_food','beverage_hot','beverage_cold','retail_nonfood','grocery_food')),
  ebt_eligible boolean not null default false,  -- SNAP food staples (fulfillment = 2027 / Forage)
  weighed boolean not null default false,       -- produce by weight (scale — deferred)
  image_url text,
  available boolean not null default true
);

-- ============ table sessions + membership (anonymous-auth identity) ============
create table table_sessions (
  id uuid primary key default gen_random_uuid(),
  qr_code text not null,                          -- physical table QR identifier
  mode text not null check (mode in ('dinein','scango','pickup')),
  status text not null default 'active' check (status in ('active','locked','closed')),
  host_seat uuid,
  pickup_slot text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '4 hours'
);

create table session_members (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references table_sessions(id) on delete cascade,
  seat_id uuid not null,                          -- == auth.uid() (the diner's anonymous-auth user)
  display_name text not null,
  role text not null default 'guest' check (role in ('host','guest')),
  created_at timestamptz not null default now(),
  unique (session_id, seat_id)
);

-- ============ carts + line items (server-priced snapshots, in cents) ============
create table qr_carts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references table_sessions(id) on delete cascade,
  locked boolean not null default false,
  promo_code text,
  status text not null default 'open' check (status in ('open','paid','cancelled')),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- `menu_item_id` is a SOFT ref (text): a menu_items.id (uuid as text) OR a grocery barcode —
-- heterogeneous, so no FK. The server snapshots name + derived unit_price_cents/tax_cents so an
-- order stays faithful even if the catalog later changes.
create table qr_cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references qr_carts(id) on delete cascade,
  menu_item_id text not null,
  name text not null,
  qty int not null check (qty > 0),
  modifiers jsonb not null default '[]',
  unit_price_cents int not null,
  tax_cents int not null default 0,
  by_seat uuid,                                   -- which guest added it (split)
  created_at timestamptz not null default now()
);

-- Promo: kind='pct' → value is a fraction (0.10 = 10% off); kind='flat' → value is CENTS off.
create table promo_codes (
  code text primary key,
  kind text not null check (kind in ('pct','flat')),
  value numeric not null,
  max_uses int,
  used int not null default 0,
  active boolean not null default true
);

create table qr_orders (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references table_sessions(id),
  subtotal_cents int not null,
  discount_cents int not null default 0,
  service_charge_cents int not null,
  tax_cents int not null,
  tip_cents int not null default 0,
  total_cents int not null,
  stripe_payment_intent_id text unique,
  status text not null default 'pending' check (status in ('pending','paid','failed','refunded')),
  created_at timestamptz not null default now()
);

create table qr_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references qr_orders(id) on delete cascade,
  menu_item_id text not null, name text not null, qty int not null,
  modifiers jsonb not null default '[]', unit_price_cents int not null, tax_cents int not null
);

-- ============ RLS helpers (anonymous-auth membership; SECURITY DEFINER breaks RLS recursion) ============
create function is_member(sess uuid) returns boolean
  language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.session_members m
    join public.table_sessions s on s.id = m.session_id
    where m.session_id = sess
      and m.seat_id = (select auth.uid())
      and s.status <> 'closed' and s.expires_at > now()
  );
$$;

create function is_host(sess uuid) returns boolean
  language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.session_members m
    where m.session_id = sess and m.seat_id = (select auth.uid()) and m.role = 'host'
  );
$$;

-- ============ RLS ============
alter table menu_categories     enable row level security;
alter table menu_items          enable row level security;
alter table modifier_groups     enable row level security;
alter table modifier_options    enable row level security;
alter table item_modifier_groups enable row level security;
alter table grocery_items       enable row level security;
alter table table_sessions      enable row level security;
alter table session_members     enable row level security;
alter table qr_carts            enable row level security;
alter table qr_cart_items       enable row level security;
alter table promo_codes         enable row level security;
alter table qr_orders           enable row level security;
alter table qr_order_items      enable row level security;

-- Catalog is public information (anon + authenticated may read; writes are service-role only).
create policy menu_categories_read     on menu_categories     for select using (true);
create policy menu_items_read          on menu_items          for select using (true);
create policy modifier_groups_read     on modifier_groups     for select using (true);
create policy modifier_options_read    on modifier_options    for select using (true);
create policy item_modifier_groups_read on item_modifier_groups for select using (true);
create policy grocery_items_read       on grocery_items       for select using (true);

-- Session-scoped reads: only members of an active session (by auth.uid()) can read its rows.
create policy sess_read     on table_sessions for select to authenticated using (is_member(id));
create policy mem_read      on session_members for select to authenticated using (is_member(session_id));
create policy qr_cart_read  on qr_carts       for select to authenticated using (is_member(session_id));
create policy qr_citem_read on qr_cart_items  for select to authenticated using (
  exists (select 1 from qr_carts c where c.id = qr_cart_items.cart_id and is_member(c.session_id)));
create policy qr_order_read on qr_orders      for select to authenticated using (is_member(session_id));
create policy qr_oitem_read on qr_order_items for select to authenticated using (
  exists (select 1 from qr_orders o where o.id = qr_order_items.order_id and is_member(o.session_id)));
-- promo_codes: NO client policy (default-deny). Only the service-role reads/validates it.
-- NO client WRITE policies anywhere: every mutation flows through service-role Server Actions.

-- ============ Realtime private-channel authorization (group cart) ============
-- Diners join `table:{session_id}` with { private: true }; presence + broadcast are gated to
-- members of that active session by RLS on realtime.messages.
create policy rt_member_read on realtime.messages for select to authenticated
  using ( realtime.topic() like 'table:%'
          and is_member( (split_part(realtime.topic(), ':', 2))::uuid ) );
create policy rt_member_send on realtime.messages for insert to authenticated
  with check ( realtime.topic() like 'table:%'
               and is_member( (split_part(realtime.topic(), ':', 2))::uuid ) );

-- ============ idempotent fulfillment (Stripe webhook on payment_intent.succeeded) ============
-- Snapshots the server-priced cart into a qr_order (+ items) in CENTS and reconciles the
-- breakdown against the PaymentIntent amount. Totals are computed once by getCartTotals and
-- passed in; SQL only re-derives the sum so it can't drift from the charge. Idempotent on the
-- PaymentIntent id (safe to run more than once — Stripe retries ≤72h).
create function mms_fulfill_order(
  p_cart_id uuid,
  p_payment_intent text,
  p_amount_cents integer,              -- the actual PaymentIntent amount (reconcile target)
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
  -- TODO(M4): award Burmese-gems once anonymous diners can link a permanent account (same auth.uid()).
  return v_order;
end; $$;

-- ============ covering indexes on every FK (advisor 0001_unindexed_foreign_keys) ============
create index menu_items_category_idx       on menu_items(category_id);
create index modifier_options_group_idx    on modifier_options(group_id);
create index item_modifier_groups_group_idx on item_modifier_groups(group_id);  -- item_id covered by PK
create index qr_carts_session_idx          on qr_carts(session_id);
create index qr_cart_items_cart_idx        on qr_cart_items(cart_id);
create index qr_orders_session_idx         on qr_orders(session_id);
create index qr_order_items_order_idx      on qr_order_items(order_id);
create index session_members_seat_idx      on session_members(seat_id);  -- hot is_member lookup

-- ============ EXECUTE lockdown (advisors 0028/0029) ============
-- Service-role-only functions: no client should call them via /rest/v1/rpc.
revoke all on function mms_tax_rate()                        from anon, authenticated;
revoke all on function mms_taxable(text, boolean)            from anon, authenticated;
revoke all on function mms_line_tax(integer, text, boolean)  from anon, authenticated;
revoke all on function mms_fulfill_order(uuid, text, integer, integer, integer, integer, integer, integer)
  from anon, authenticated;
-- is_member/is_host are SECURITY DEFINER and MUST stay executable by `authenticated` (RLS policy
-- evaluation calls them); revoke only from truly-unauthenticated `anon`.
revoke all on function is_member(uuid) from anon;
revoke all on function is_host(uuid)   from anon;
