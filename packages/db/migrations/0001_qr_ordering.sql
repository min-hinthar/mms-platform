-- 0001_qr_ordering.sql — QR dine-in/Scan&Go/Pickup: tables, RLS, category-aware tax.
-- Additive to the existing delivery schema. Server (service-role) writes prices/tax; clients never do.
--
-- ⚠️ DO NOT APPLY AS-IS to the shared delivery project. `carts`, `orders`, `order_items`, and
-- `menu_items` ALREADY EXIST there with different shapes, so the `create table if not exists`
-- statements below silently no-op and the QR code then runs against incompatible tables.
-- Reconcile first (namespace the session tables to qr_*, read the real menu, source tax_category):
-- see docs/DATA_RECONCILIATION.md. M1·P1.0. The session/tax/grocery objects here are collision-free.
-- Diners are anonymous: a server endpoint mints a short-lived JWT with a `session_id` claim
-- bound to the scanned table QR. RLS authorizes everything off that claim.

-- ============ category-aware tax (replaces the flat 10.5% in the delivery app) ============
-- CA CDTFA Reg 1603 / 80-80: hot & prepared always taxable; cold food taxable only dine-in;
-- retail non-food always taxable; grocery staples exempt. Location rate is a single constant.
create or replace function mms_tax_rate() returns numeric language sql immutable as $$
  select 0.0975::numeric;  -- Covina combined rate; update via one place
$$;

create or replace function mms_taxable(category text, dine_in boolean) returns boolean
language sql immutable as $$
  select case category
    when 'hot_prepared'  then true
    when 'cold_food'     then coalesce(dine_in, false)
    when 'beverage_hot'  then true              -- prepared hot tea/coffee
    when 'beverage_cold' then coalesce(dine_in, false)
    when 'retail_nonfood' then true             -- balms, umbrellas, brooms (caught in the tax map)
    when 'grocery_food'  then false
    else true                                   -- safe default: taxable
  end;
$$;

create or replace function mms_line_tax(amount numeric, category text, dine_in boolean)
returns numeric language sql immutable as $$
  select round(case when mms_taxable(category, dine_in) then amount * mms_tax_rate() else 0 end, 2);
$$;

-- ============ tables ============
create table if not exists table_sessions (
  id uuid primary key default gen_random_uuid(),
  qr_code text not null,                         -- physical table QR identifier
  mode text not null check (mode in ('dinein','scango','pickup')),
  status text not null default 'active' check (status in ('active','locked','closed')),
  host_seat uuid,
  pickup_slot text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '4 hours'
);

create table if not exists session_members (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references table_sessions(id) on delete cascade,
  seat_id uuid not null,                          -- == JWT `seat` claim
  display_name text not null,
  role text not null default 'guest' check (role in ('host','guest')),
  created_at timestamptz not null default now(),
  unique (session_id, seat_id)
);

create table if not exists carts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references table_sessions(id) on delete cascade,
  locked boolean not null default false,
  promo_code text,
  status text not null default 'open' check (status in ('open','paid','cancelled')),
  updated_at timestamptz not null default now()
);

create table if not exists cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references carts(id) on delete cascade,
  menu_item_id text not null,                     -- references the delivery app's menu
  qty int not null check (qty > 0),
  modifiers jsonb not null default '[]',
  unit_price numeric not null,                    -- server-derived snapshot
  tax numeric not null default 0,                 -- server-derived (mms_line_tax)
  by_seat uuid,                                   -- which guest added it (split)
  created_at timestamptz not null default now()
);

create table if not exists promo_codes (
  code text primary key,
  kind text not null check (kind in ('pct','flat')),
  value numeric not null,
  max_uses int,
  used int not null default 0,
  active boolean not null default true
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references table_sessions(id),
  subtotal numeric not null, discount numeric not null default 0,
  service_charge numeric not null, tax numeric not null, tip numeric not null default 0,
  total numeric not null,
  stripe_payment_intent_id text unique,
  status text not null default 'pending' check (status in ('pending','paid','failed','refunded')),
  created_at timestamptz not null default now()
);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  menu_item_id text not null, name text not null, qty int not null,
  modifiers jsonb not null default '[]', unit_price numeric not null, tax numeric not null
);

-- ============ RLS ============
alter table table_sessions enable row level security;
alter table session_members enable row level security;
alter table carts enable row level security;
alter table cart_items enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;

-- helper: is the JWT's session claim this session, and still active?
create or replace function is_member(sess uuid) returns boolean language sql stable as $$
  select exists (
    select 1 from table_sessions s
    where s.id = sess
      and s.status <> 'closed'
      and s.expires_at > now()
      and s.id::text = coalesce(auth.jwt() ->> 'session_id', '')
  );
$$;
create or replace function is_host() returns boolean language sql stable as $$
  -- use a custom claim: Supabase reserves the top-level `role` claim for the Postgres role
  select coalesce(auth.jwt() ->> 'app_role', 'guest') = 'host';
$$;

-- members can read their own session + cart; only service-role writes prices.
create policy sess_read   on table_sessions for select using (is_member(id));
create policy mem_read    on session_members for select using (is_member(session_id));
create policy cart_read   on carts        for select using (is_member(session_id));
create policy citem_read  on cart_items   for select using (
  exists (select 1 from carts c where c.id = cart_items.cart_id and is_member(c.session_id)));
create policy order_read  on orders       for select using (is_member(session_id));
create policy oitem_read  on order_items  for select using (
  exists (select 1 from orders o where o.id = order_items.order_id and is_member(o.session_id)));
-- NO client write policies (default-deny): lock/unlock and every mutation flow through the
-- service-role Server Actions (server is authoritative), so no column can be set from a browser.
-- (Removed the broad cart UPDATE policy — it would have let a host client write promo_code/session_id directly.)

-- ============ Realtime private-channel authorization (group cart) ============
-- Diners join `table:{session_id}` with { private: true }. RLS on realtime.messages gates
-- broadcast + presence to members of that active session only.
create policy rt_member_read on realtime.messages for select
  using ( realtime.topic() like 'table:%'
          and is_member( (split_part(realtime.topic(), ':', 2))::uuid ) );
create policy rt_member_send on realtime.messages for insert
  with check ( realtime.topic() like 'table:%'
               and is_member( (split_part(realtime.topic(), ':', 2))::uuid ) );

-- NOTE: cart/price/tax mutations happen via Server Actions using the service-role key,
-- which bypasses RLS by design (server is authoritative). Clients only ever SELECT.

-- ============ menu (shared w/ delivery app; created here so a standalone QR dev DB works) ============
create table if not exists menu_items (
  id text primary key, name text not null, name_my text, price numeric not null,
  category text not null, tax_category text not null default 'hot_prepared',
  modifiers jsonb not null default '[]', image_url text, diet text[] default '{}',
  available boolean not null default true
);
alter table menu_items enable row level security;
create policy menu_public_read on menu_items for select using (true);  -- public catalog
insert into menu_items (id,name,name_my,price,category,tax_category) values
 ('t1','Burmese Milk Tea','လက်ဖက်ရည်',3.75,'Tea & Drinks','beverage_hot'),
 ('n1','Mohinga','မုန့်ဟင်းခါး',11.5,'Noodles','hot_prepared'),
 ('n2','Nan Gyi Thoke','နန်းကြီးသုပ်',12.0,'Noodles','hot_prepared'),
 ('r1','Chicken Curry & Rice','ကြက်သားဟင်း',13.0,'Rice & Curry','hot_prepared'),
 ('s2','Laphet Thoke','လက်ဖက်သုပ်',9.5,'Snacks','cold_food'),
 ('d1','Shwe Yin Aye','ရွှေရင်အေး',6.5,'Sweets','cold_food')
on conflict (id) do nothing;

-- ============ idempotent fulfillment (called by the Stripe webhook on payment_intent.succeeded) ============
create or replace function mms_fulfill_order(p_cart_id uuid, p_payment_intent text)
returns void language plpgsql security definer as $$
declare v_order uuid; v_sub numeric; v_tax numeric;
begin
  if exists (select 1 from orders where stripe_payment_intent_id = p_payment_intent) then return; end if;  -- idempotent
  select coalesce(sum(ci.unit_price*ci.qty),0), coalesce(sum(ci.tax*ci.qty),0)
    into v_sub, v_tax from cart_items ci where ci.cart_id = p_cart_id;
  insert into orders (session_id, subtotal, service_charge, tax, total, stripe_payment_intent_id, status)
    select c.session_id, v_sub, round(v_sub*0.05,2), v_tax, round(v_sub*1.05 + v_tax,2), p_payment_intent, 'paid'
    from carts c where c.id = p_cart_id
    returning id into v_order;
  insert into order_items (order_id, menu_item_id, name, qty, modifiers, unit_price, tax)
    select v_order, ci.menu_item_id, ci.menu_item_id, ci.qty, ci.modifiers, ci.unit_price, ci.tax
    from cart_items ci where ci.cart_id = p_cart_id;
  update carts set status='paid' where id = p_cart_id;
  -- TODO(M5): award Burmese-gems via the delivery app's loyalty function.
  -- TODO(L2): reconcile v total against the PaymentIntent amount before marking paid.
end; $$;
