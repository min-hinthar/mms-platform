-- 0001_qr_ordering.sql — QR dine-in / Scan&Go / Pickup: tables, RLS, category-aware tax.
-- Additive to the existing delivery schema and RECONCILED against it (M1·P1.0):
--   • Session tables are namespaced `qr_*` so they can never shadow the delivery
--     `carts`/`orders`/`order_items` (which already exist with different shapes).
--   • The menu is OWNED BY THE DELIVERY APP. We do NOT create/seed `menu_items` here;
--     QR reads the live `menu_items` (uuid id, `base_price_cents`, `name_en`/`name_my`,
--     `category_id`) and its normalized modifiers (`item_modifier_groups` →
--     `modifier_groups` → `modifier_options.price_delta_cents`) at runtime.
--   • Money is integer CENTS end-to-end (parity with the delivery schema). The client
--     never sends a price — it sends an item id + chosen modifier option ids; the server
--     (service-role) re-derives every amount and writes the snapshot.
--   • Tax classification lives QR-side in `mms_menu_tax` / `mms_menu_category_tax`
--     (resolved by `mms_menu_tax_category`) so the delivery `menu_items` is untouched.
--   • Functions pin `search_path` + revoke EXECUTE from anon/authenticated (advisor-clean);
--     every FK has a covering index.
-- See docs/DATA_RECONCILIATION.md + docs/BACKEND_ARCHITECTURE.md. Apply on the staging project.
--
-- Diners are anonymous. NOTE: the is_member/is_host helpers below still read a custom `session_id`
-- JWT claim — that's the M0 sketch. P1.1 swaps them to the **Supabase Anonymous Auth membership**
-- model (seat_id = auth.uid(), joined against session_members) alongside the client/session wiring.
-- See docs/BACKEND_ARCHITECTURE.md §3.

-- ============ category-aware tax (replaces the flat 10.5% in the delivery app) ============
-- CA CDTFA Reg 1603 / 80-80: hot & prepared always taxable; cold food taxable only dine-in;
-- retail non-food always taxable; grocery staples exempt. Location rate is a single constant.
-- Amounts are integer CENTS; mirror of apps/qr/lib/tax.ts — keep the two in sync.
create or replace function mms_tax_rate() returns numeric language sql immutable
set search_path = '' as $$
  select 0.0975::numeric;  -- Covina combined rate; update in this one place (+ lib/tax.ts)
$$;

create or replace function mms_taxable(category text, dine_in boolean) returns boolean
language sql immutable set search_path = '' as $$
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

-- amount_cents → tax_cents (integer). Rounds to the nearest cent.
create or replace function mms_line_tax(amount_cents integer, category text, dine_in boolean)
returns integer language sql immutable set search_path = '' as $$
  select round(case when public.mms_taxable(category, dine_in)
                    then amount_cents * public.mms_tax_rate() else 0 end)::integer;
$$;

-- ============ tables ============
create table if not exists table_sessions (
  id uuid primary key default gen_random_uuid(),
  qr_code text not null,                          -- physical table QR identifier
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

create table if not exists qr_carts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references table_sessions(id) on delete cascade,
  locked boolean not null default false,
  promo_code text,
  status text not null default 'open' check (status in ('open','paid','cancelled')),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- One line per added item. `menu_item_id` is a SOFT reference (text) to the shared catalog:
-- a delivery `menu_items.id` (uuid, stored as text) for restaurant items, or a grocery UPC
-- (`grocery_items.barcode`) for Scan & Go — heterogeneous, so no FK. The server snapshots the
-- name + server-derived `unit_price_cents`/`tax_cents` so an order is faithful even if the
-- catalog later changes.
create table if not exists qr_cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references qr_carts(id) on delete cascade,
  menu_item_id text not null,
  name text not null,                             -- server-derived snapshot (name_en / grocery name)
  qty int not null check (qty > 0),
  modifiers jsonb not null default '[]',          -- chosen option labels (display + snapshot)
  unit_price_cents int not null,                  -- server-derived (base + chosen price_delta_cents)
  tax_cents int not null default 0,               -- server-derived (mms_line_tax)
  by_seat uuid,                                   -- which guest added it (split)
  created_at timestamptz not null default now()
);

-- Promo value semantics: kind='pct' → `value` is a fraction (0.10 = 10% off);
-- kind='flat' → `value` is CENTS off (500 = $5). Validated server-side (applyPromo / getCartTotals).
create table if not exists promo_codes (
  code text primary key,
  kind text not null check (kind in ('pct','flat')),
  value numeric not null,
  max_uses int,
  used int not null default 0,
  active boolean not null default true
);

create table if not exists qr_orders (
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

create table if not exists qr_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references qr_orders(id) on delete cascade,
  menu_item_id text not null, name text not null, qty int not null,
  modifiers jsonb not null default '[]', unit_price_cents int not null, tax_cents int not null
);

-- ============ QR-owned tax classification (delivery `menu_items` is untouched) ============
-- The live `menu_items` carries no `tax_category`. Resolve it from a per-item override,
-- else a per-category default, else a safe taxable fallback. uuid columns are SOFT refs
-- (no FK) so this migration applies cleanly regardless of order vs the delivery baseline.
create table if not exists mms_menu_category_tax (
  category_id uuid primary key,
  tax_category text not null
);
create table if not exists mms_menu_tax (
  menu_item_id uuid primary key,
  tax_category text not null
);

-- plpgsql so name resolution is deferred to call time (robust to apply order).
-- search_path pinned (advisor-safe); table refs schema-qualified accordingly.
create or replace function mms_menu_tax_category(p_item uuid)
returns text language plpgsql stable set search_path = '' as $$
declare v text; v_cat uuid;
begin
  select tax_category into v from public.mms_menu_tax where menu_item_id = p_item;
  if v is not null then return v; end if;
  select category_id into v_cat from public.menu_items where id = p_item;
  if v_cat is not null then
    select tax_category into v from public.mms_menu_category_tax where category_id = v_cat;
    if v is not null then return v; end if;
  end if;
  return 'hot_prepared';                          -- safe default: taxable prepared food
end; $$;

-- Seed per-category defaults from the live menu (guarded so a standalone QR DB still applies).
do $$
begin
  if to_regclass('public.menu_categories') is not null then
    insert into mms_menu_category_tax (category_id, tax_category)
    select c.id, m.tax
    from menu_categories c
    join (values
      ('all-day-breakfast','hot_prepared'),
      ('rice-noodles-soups','hot_prepared'),
      ('sides','hot_prepared'),
      ('curries-a-la-carte','hot_prepared'),
      ('vegetables','hot_prepared'),
      ('seafood-curries','hot_prepared'),
      ('appetizers-salads','cold_food'),
      ('drinks','beverage_cold')
    ) as m(slug, tax) on m.slug = c.slug
    on conflict (category_id) do nothing;
  end if;
end $$;

-- ============ RLS ============
alter table table_sessions enable row level security;
alter table session_members enable row level security;
alter table qr_carts enable row level security;
alter table qr_cart_items enable row level security;
alter table qr_orders enable row level security;
alter table qr_order_items enable row level security;
alter table mms_menu_category_tax enable row level security;
alter table mms_menu_tax enable row level security;
-- (No client policies on the tax maps: only the service-role reads them, via mms_menu_tax_category.)

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
create policy sess_read     on table_sessions for select using (is_member(id));
create policy mem_read      on session_members for select using (is_member(session_id));
create policy qr_cart_read  on qr_carts       for select using (is_member(session_id));
create policy qr_citem_read on qr_cart_items  for select using (
  exists (select 1 from qr_carts c where c.id = qr_cart_items.cart_id and is_member(c.session_id)));
create policy qr_order_read on qr_orders      for select using (is_member(session_id));
create policy qr_oitem_read on qr_order_items for select using (
  exists (select 1 from qr_orders o where o.id = qr_order_items.order_id and is_member(o.session_id)));
-- NO client write policies (default-deny): lock/unlock and every mutation flow through the
-- service-role Server Actions (server is authoritative), so no column can be set from a browser.

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

-- ============ idempotent fulfillment (called by the Stripe webhook on payment_intent.succeeded) ============
-- Snapshots the server-priced cart into a qr_order (+ items) in CENTS and reconciles the breakdown
-- against the PaymentIntent amount. Totals are computed once, authoritatively, by getCartTotals
-- (apps/qr/lib/cart.ts) and passed in — SQL only re-derives the sum so it can't drift from the
-- charge. Idempotent on the PaymentIntent id; safe to run more than once (Stripe retries ≤72h).
create or replace function mms_fulfill_order(
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
  -- idempotent: a retry returns the already-created order
  select id into v_order from public.qr_orders where stripe_payment_intent_id = p_payment_intent;
  if v_order is not null then return v_order; end if;

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
  -- TODO(M4): award Burmese-gems via the delivery loyalty ledger (loyalty_rewards).
  --   Blocked for anonymous QR diners: loyalty_rewards.user_id is NOT NULL — needs an account
  --   link (M4) before a QR order can earn gems. See docs/DATA_RECONCILIATION.md.
  return v_order;
end; $$;

-- ============ covering indexes on every FK (advisor 0001_unindexed_foreign_keys) ============
create index if not exists qr_carts_session_idx      on qr_carts(session_id);
create index if not exists qr_cart_items_cart_idx     on qr_cart_items(cart_id);
create index if not exists qr_orders_session_idx      on qr_orders(session_id);
create index if not exists qr_order_items_order_idx    on qr_order_items(order_id);
-- session_members(session_id) is already covered by the unique (session_id, seat_id) index;
-- seat_id alone backs the hot is_member lookup (= auth.uid()) added in P1.1.
create index if not exists session_members_seat_idx    on session_members(seat_id);

-- ============ EXECUTE lockdown (advisors 0028/0029) ============
-- These functions are service-role only (PostgREST/service bypasses these grants). No client should
-- be able to call them via /rest/v1/rpc. is_member/is_host are intentionally left executable by the
-- `authenticated` role — RLS policy evaluation needs it (see docs/BACKEND_ARCHITECTURE.md §3).
revoke all on function mms_tax_rate()                                          from anon, authenticated;
revoke all on function mms_taxable(text, boolean)                             from anon, authenticated;
revoke all on function mms_line_tax(integer, text, boolean)                   from anon, authenticated;
revoke all on function mms_menu_tax_category(uuid)                            from anon, authenticated;
revoke all on function mms_fulfill_order(uuid, text, integer, integer, integer, integer, integer, integer)
  from anon, authenticated;
