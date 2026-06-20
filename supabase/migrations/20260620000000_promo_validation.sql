-- 20260620000000_promo_validation.sql  (M2·P2.1)
-- Server-validated promo codes: real semantics (validity window + min-subtotal), redemption caps
-- (global `max_uses` + `per_session_limit`), and an apply rate-limit (anti-enumeration). ALL promo
-- logic lives in SECURITY DEFINER functions, service-role only — the client can never price, validate,
-- or redeem a code itself. Money path: the discount stays server-authoritative end-to-end.

-- ============ promo_codes gains real semantics + bounds ============
alter table public.promo_codes
  add column if not exists valid_from         timestamptz,
  add column if not exists valid_until         timestamptz,
  add column if not exists min_subtotal_cents  integer not null default 0,
  add column if not exists per_session_limit   integer not null default 1;

-- Bound every input at the DB too (Zod caps the client; these cap a service-role/SQL writer).
alter table public.promo_codes
  add constraint promo_value_nonneg        check (value >= 0),
  add constraint promo_pct_max_100         check (kind <> 'pct' or value <= 1),
  add constraint promo_min_subtotal_nonneg check (min_subtotal_cents >= 0),
  add constraint promo_per_session_pos     check (per_session_limit >= 1),
  add constraint promo_used_nonneg         check (used >= 0);

-- ============ redemption ledger (audit + per-session cap) ============
create table public.promo_redemptions (
  id          uuid primary key default gen_random_uuid(),
  code        text not null references public.promo_codes(code),
  session_id  uuid not null references public.table_sessions(id),
  order_id    uuid references public.qr_orders(id),
  redeemed_at timestamptz not null default now()
);
create index promo_redemptions_code_idx    on public.promo_redemptions(code);
create index promo_redemptions_session_idx on public.promo_redemptions(session_id);
create index promo_redemptions_order_idx   on public.promo_redemptions(order_id);  -- cover the FK (advisor 0001)
alter table public.promo_redemptions enable row level security;  -- default-deny; service-role only

-- ============ apply-attempt ledger (rate-limit / anti-enumeration) ============
create table public.promo_attempts (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.table_sessions(id),
  attempted_at timestamptz not null default now()
);
create index promo_attempts_session_time_idx on public.promo_attempts(session_id, attempted_at);
alter table public.promo_attempts enable row level security;  -- default-deny; service-role only

-- ============ validate: the SINGLE apply-time gate (active + window + min + caps) ============
-- One row out: (valid, reason, kind, value, discount_cents). `reason` is a stable enum the client maps
-- to copy (Next redacts thrown Server Action errors in prod, so we RETURN the reason, never throw it).
-- discount_cents is the would-be discount for THIS cart's current subtotal.
create function public.mms_promo_check(p_code text, p_cart_id uuid)
returns table(valid boolean, reason text, kind text, value numeric, discount_cents integer)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_code     text := upper(p_code);
  v_promo    public.promo_codes%rowtype;
  v_session  uuid;
  v_subtotal integer;
  v_redeemed integer;
begin
  select c.session_id into v_session from public.qr_carts c where c.id = p_cart_id and c.status = 'open';
  if v_session is null then
    return query select false, 'cart_closed', null::text, null::numeric, 0; return;
  end if;

  select * into v_promo from public.promo_codes p where p.code = v_code;
  if not found            then return query select false, 'invalid',     null::text, null::numeric, 0; return; end if;
  if not v_promo.active   then return query select false, 'inactive',    null::text, null::numeric, 0; return; end if;
  if v_promo.valid_from  is not null and now() < v_promo.valid_from  then
    return query select false, 'not_started', null::text, null::numeric, 0; return; end if;
  if v_promo.valid_until is not null and now() > v_promo.valid_until then
    return query select false, 'expired',     null::text, null::numeric, 0; return; end if;

  select coalesce(sum(ci.unit_price_cents * ci.qty), 0) into v_subtotal
    from public.qr_cart_items ci where ci.cart_id = p_cart_id;
  if v_subtotal < v_promo.min_subtotal_cents then
    return query select false, 'min_not_met', null::text, null::numeric, 0; return; end if;

  if v_promo.max_uses is not null and v_promo.used >= v_promo.max_uses then
    return query select false, 'exhausted', null::text, null::numeric, 0; return; end if;

  select count(*) into v_redeemed from public.promo_redemptions r
    where r.code = v_code and r.session_id = v_session;
  if v_redeemed >= v_promo.per_session_limit then
    return query select false, 'session_limit', null::text, null::numeric, 0; return; end if;

  return query select true, 'ok', v_promo.kind, v_promo.value,
    (case when v_promo.kind = 'pct'
          then round(v_subtotal * v_promo.value)::integer
          else least(round(v_promo.value)::integer, v_subtotal) end);
end; $$;

-- ============ discount: pricing-time (active + window + min only; NOT caps) ============
-- getCartTotals uses this so the displayed/charged discount stays stable through checkout. Caps are a
-- redemption BUDGET (enforced at apply, consumed at fulfillment), not a pricing concern. 0 if no/invalid
-- code — so an expired code or a cart that drops below min_subtotal silently loses the discount.
create function public.mms_promo_discount(p_cart_id uuid)
returns integer language plpgsql stable security definer set search_path = '' as $$
declare v_code text; v_promo public.promo_codes%rowtype; v_subtotal integer;
begin
  select c.promo_code into v_code from public.qr_carts c where c.id = p_cart_id;
  if v_code is null then return 0; end if;
  select * into v_promo from public.promo_codes p where p.code = v_code;
  if not found or not v_promo.active then return 0; end if;
  if v_promo.valid_from  is not null and now() < v_promo.valid_from  then return 0; end if;
  if v_promo.valid_until is not null and now() > v_promo.valid_until then return 0; end if;
  select coalesce(sum(ci.unit_price_cents * ci.qty), 0) into v_subtotal
    from public.qr_cart_items ci where ci.cart_id = p_cart_id;
  if v_subtotal < v_promo.min_subtotal_cents then return 0; end if;
  return case when v_promo.kind = 'pct'
              then round(v_subtotal * v_promo.value)::integer
              else least(round(v_promo.value)::integer, v_subtotal) end;
end; $$;

-- ============ rate-limit: gate an apply attempt (anti-enumeration). Returns whether it's ALLOWED. ============
-- Count FIRST, then record — a session already at the cap is rejected WITHOUT adding a row, so the
-- trailing window can actually drain (a noisy attacker can't keep a legit diner locked out forever).
-- Also GCs its own out-of-window rows for the session, so the ledger stays bounded per active session.
-- Exactly p_max applies are allowed per window (the p_max-th passes; the next is rejected).
create function public.mms_promo_attempt(
  p_session_id uuid, p_max integer default 10, p_window_seconds integer default 300
) returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare v_count integer;
begin
  delete from public.promo_attempts
    where session_id = p_session_id and attempted_at < now() - make_interval(secs => p_window_seconds);
  select count(*) into v_count from public.promo_attempts a
    where a.session_id = p_session_id and a.attempted_at > now() - make_interval(secs => p_window_seconds);
  if v_count >= p_max then return false; end if;  -- at the cap: reject, don't record (let the window drain)
  insert into public.promo_attempts(session_id) values (p_session_id);
  return true;
end; $$;

-- ============ consume: at fulfillment, record the redemption + bump the counter ============
-- Soft GLOBAL cap (max_uses): `used` is bumped at fulfillment, so the overrun ceiling is every cart
-- that APPLIED while under the cap but hasn't fulfilled yet (potentially many during a promo blast — not
-- "a few"). Accepted: each is a legitimately-paid order, and the apply gate is the budget's front door.
-- HARD PER-SESSION cap: re-counted here under a row lock so it's a DB invariant, not just the app-layer
-- apply gate — any future path that sets qr_carts.promo_code outside applyPromo still can't overrun it.
create function public.mms_promo_consume(p_code text, p_session_id uuid, p_order_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_limit integer; v_count integer;
begin
  select per_session_limit into v_limit from public.promo_codes where code = p_code for update;
  if not found then return; end if;
  select count(*) into v_count from public.promo_redemptions
    where code = p_code and session_id = p_session_id;
  if v_count >= v_limit then return; end if;  -- per-session budget already spent: don't double-record
  update public.promo_codes set used = used + 1 where code = p_code;
  insert into public.promo_redemptions(code, session_id, order_id) values (p_code, p_session_id, p_order_id);
end; $$;

-- ============ fulfillment now consumes the promo (idempotent on the PI id) ============
-- Re-defines mms_fulfill_order to record the redemption when an order is first written. The early
-- return on a duplicate PaymentIntent keeps consumption exactly-once under Stripe's ≤72h retries.
-- (CREATE OR REPLACE preserves the existing service_role EXECUTE grant from 20260618000100.)
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
declare v_order uuid; v_total integer; v_session uuid; v_promo text;
begin
  select id into v_order from public.qr_orders where stripe_payment_intent_id = p_payment_intent;
  if v_order is not null then return v_order; end if;  -- idempotent: retry returns the order

  v_total := p_subtotal_cents - p_discount_cents + p_service_charge_cents + p_tax_cents + p_tip_cents;
  if v_total <> p_amount_cents then
    raise exception 'fulfillment amount mismatch: breakdown=% intent=%', v_total, p_amount_cents;
  end if;

  select c.session_id, c.promo_code into v_session, v_promo from public.qr_carts c where c.id = p_cart_id;

  insert into public.qr_orders (session_id, subtotal_cents, discount_cents, service_charge_cents,
                         tax_cents, tip_cents, total_cents, stripe_payment_intent_id, status)
    values (v_session, p_subtotal_cents, p_discount_cents, p_service_charge_cents,
            p_tax_cents, p_tip_cents, v_total, p_payment_intent, 'paid')
    returning id into v_order;

  insert into public.qr_order_items (order_id, menu_item_id, name, qty, modifiers, unit_price_cents, tax_cents)
    select v_order, ci.menu_item_id, ci.name, ci.qty, ci.modifiers, ci.unit_price_cents, ci.tax_cents
    from public.qr_cart_items ci where ci.cart_id = p_cart_id;

  -- Only consume a redemption when the breakdown actually carried a discount for this code.
  if v_promo is not null and p_discount_cents > 0 then
    perform public.mms_promo_consume(v_promo, v_session, v_order);
  end if;

  update public.qr_carts set status = 'paid' where id = p_cart_id;
  -- TODO(M4): award Burmese-gems once anonymous diners can link a permanent account (same auth.uid()).
  return v_order;
end; $$;

-- ============ EXECUTE lockdown: every promo fn is service-role only (advisors 0028/0029) ============
-- Supabase grants new public-schema functions to PUBLIC *and* explicitly to anon + authenticated, so
-- locking one needs all three revoked (verified live: `from public` alone left anon/authenticated able
-- to call mms_promo_consume → exhaust a code's budget). mms_fulfill_order (SECURITY DEFINER, owner) can
-- still call mms_promo_consume — ownership implies execute regardless of grants.
revoke all on function public.mms_promo_check(text, uuid)         from public, anon, authenticated;
revoke all on function public.mms_promo_discount(uuid)            from public, anon, authenticated;
revoke all on function public.mms_promo_attempt(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.mms_promo_consume(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.mms_promo_check(text, uuid)      to service_role;
grant execute on function public.mms_promo_discount(uuid)         to service_role;
grant execute on function public.mms_promo_attempt(uuid, integer, integer) to service_role;
grant execute on function public.mms_promo_consume(text, uuid, uuid) to service_role;

-- new ledgers: service-role only (RLS on + revoke SELECT clears anon/authenticated read + pg_graphql).
revoke select on public.promo_redemptions, public.promo_attempts from anon, authenticated;

-- ============ seed: test promo codes (idempotent) ============
insert into public.promo_codes (code, kind, value, max_uses, per_session_limit, min_subtotal_cents)
values
  ('WELCOME10', 'pct',  0.10, 1000, 1, 0),     -- 10% off, first use per table session
  ('TEAHOUSE5', 'flat', 500,  500,  1, 2000)   -- $5 off orders ≥ $20
on conflict (code) do nothing;
