-- 20260622060000_voids_comps.sql — S2.3: loss-gated voids/comps + the first durable audit ledger.
--
-- A line moves to a TERMINAL loss state, gated by who-may-do-it (ORDER-MODEL "voids/comps"):
--   • VOID  (cancel + don't make it) → state = 'voided'. A fired-but-uncooked line is ~zero loss → the
--     server does it SOLO with a reason. A cooked line (in_progress|served), or any line over the loss
--     ceiling, needs a manager-PIN step-up.
--   • COMP  (free, but the kitchen STILL makes it) → comped = true; the line keeps its state so the KDS
--     is NOT told to cancel it (C5). A comp is always a giveaway → always manager-PIN.
-- The gate is SERVER-derived from the line's state + value (C1) — never a client-asserted "cooked:false".
-- The manager step-up reuses mms_staff_verify_pin verbatim (the PIN check runs in the app, lockout-counted);
-- this RPC re-checks the approver is an ACTIVE manager/owner AND not the initiator (no self-approval, D3),
-- and writes the audit row in the SAME transaction as the state flip — no audit ⇒ no void (C3).
--
-- A voided OR comped line contributes $0 to EVERY charge derivation. That's required for the void itself
-- (else a voided line would still be charged) and shared by comp — so this migration also redefines the
-- five functions that sum the cart's chargeable base (getCartTotals' promo + the cash reconcile + all three
-- order-snapshot copies) to exclude `state = 'voided' OR comped`. The redefinitions are the LATEST bodies
-- (20260622010000 / 20260620000000 / 20260620001000) restated verbatim + that one predicate.
--
-- Additive/idempotent: new tables (if-not-exists-style via create), a new column with a default, a new fn,
-- and create-or-replace on the five (which preserves their existing service_role grants).

-- ── mms_loss_config — the tunable loss ceiling (single row, parity with pickup_config) ──────────────────
-- 20% of the line OR $20 absolute, whichever trips first (Min's S2 decision 3). S2.3's void/comp gate uses
-- the ABSOLUTE ceiling (a full void/comp is 100% of the line, so the percentage is for the partial
-- discount/override path S2.4 adds — kept here so that lands as a config tweak, not a migration).
create table if not exists public.mms_loss_config (
  id               boolean primary key default true check (id),  -- single-row guard
  max_loss_cents   integer not null default 2000 check (max_loss_cents > 0),       -- $20 absolute
  max_loss_percent integer not null default 20   check (max_loss_percent between 1 and 100), -- for S2.4 overrides
  updated_at       timestamptz not null default now()
);
insert into public.mms_loss_config (id) values (true) on conflict do nothing;
alter table public.mms_loss_config enable row level security;  -- default-deny; read via mms_void_line (service-role)
revoke all on public.mms_loss_config from anon, authenticated;

-- ── mms_approvals — the first DURABLE, append-only loss-audit ledger (C3; the S2.4 primitive, consumer #1) ─
-- A two-party record: the initiating server + (when gated) the authorizing manager, the line + reason +
-- amount + cooked flag + cart/session. Non-PII (staff ids + a menu line name, no diner identity). RLS
-- default-deny with an OWNER-read policy (the audit-review surface); service-role writes (bypasses RLS).
-- No update/delete policy → append-only to everyone but service_role. `status` is 'approved' for every
-- in-person S2.3 action; 'pending'/'denied' exist for S2.4's deferred remote-approve state machine.
create table if not exists public.mms_approvals (
  id                 uuid primary key default gen_random_uuid(),
  kind               text not null check (kind in ('void','comp','refund_request')),
  status             text not null default 'approved' check (status in ('pending','approved','denied')),
  cart_id            uuid,
  session_id         uuid,
  line_id            uuid,
  line_name          text,                     -- snapshot so the audit is legible after the line is gone
  qty                integer,
  amount_cents       integer not null default 0,  -- the loss / value at risk (unit_price * qty)
  reason_code        text not null check (char_length(reason_code) between 1 and 40),
  cooked             boolean not null default false,
  initiator_staff_id uuid not null,            -- staff.user_id of the server who initiated
  approver_staff_id  uuid,                     -- staff.user_id of the manager (null = within solo authority)
  created_at         timestamptz not null default now()
);
create index if not exists mms_approvals_session_idx on public.mms_approvals(session_id, created_at);
alter table public.mms_approvals enable row level security;
revoke all on public.mms_approvals from anon, authenticated;
do $$ begin
  -- Owner-read (forward-looking audit surface). Guarded create so a re-run is idempotent.
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='mms_approvals'
                 and policyname='mms_approvals_owner_read') then
    create policy mms_approvals_owner_read on public.mms_approvals for select
      using (public.is_staff_at_least('owner'));
  end if;
end $$;

-- ── qr_cart_items.comped — the comp flag (a kept line charged at $0) ────────────────────────────────────
alter table public.qr_cart_items add column if not exists comped boolean not null default false;

-- ── mms_void_line — the loss-gated void/comp, server-derived gate + in-txn audit ────────────────────────
create function mms_void_line(
  p_line uuid,
  p_action text,                  -- 'void' | 'comp'
  p_reason text,                  -- a reason code (app enum + the audit CHECK bound it)
  p_initiator uuid,               -- staff.user_id of the initiating server (caller.staffId)
  p_approver uuid default null     -- staff.user_id of the PIN-verified manager; null = solo attempt
) returns text language plpgsql set search_path = '' as $$
declare
  v_cart uuid; v_session uuid; v_state text; v_qty integer; v_price integer; v_name text;
  v_comped boolean; v_status text; v_loss integer; v_cooked boolean; v_needs_approval boolean;
  v_max_loss integer; v_approver_role text; v_approver_active boolean;
begin
  if p_action not in ('void','comp') then raise exception 'illegal void action %', p_action; end if;

  -- Lock the line (FOR UPDATE serializes concurrent void attempts) and require the parent cart OPEN — a
  -- captured-line refund on a settled order is the S4.3 seam, not this path. A closed/paid cart ⇒ not_open.
  select ci.cart_id, c.session_id, ci.state, ci.qty, ci.unit_price_cents, ci.name, ci.comped, c.status
    into v_cart, v_session, v_state, v_qty, v_price, v_name, v_comped, v_status
    from public.qr_cart_items ci
    join public.qr_carts c on c.id = ci.cart_id
    where ci.id = p_line
    for update of ci;
  if v_cart is null then return 'not_found'; end if;
  if v_status <> 'open' then return 'not_open'; end if;
  if v_state = 'voided' then return 'already_done'; end if;
  if p_action = 'comp' and v_comped then return 'already_done'; end if;

  -- SERVER-derived loss gate (C1) — never client-asserted. cooked = the kitchen has started/finished it;
  -- loss = the value at risk (a comp gives the whole line away; a cooked void wastes made food). A manager
  -- PIN is required for: a comp (giveaway), a cooked-food void, OR a value over the absolute ceiling.
  v_cooked := v_state in ('in_progress','served');
  v_loss := v_price * v_qty;
  select max_loss_cents into v_max_loss from public.mms_loss_config where id;
  v_max_loss := coalesce(v_max_loss, 2000);
  v_needs_approval := (p_action = 'comp') or v_cooked or (v_loss > v_max_loss);

  if v_needs_approval then
    if p_approver is null then return 'needs_approval'; end if;     -- app must collect a manager PIN
    if p_approver = p_initiator then return 'self_approve'; end if; -- D3: can't approve your own loss
    -- The step-up authorizes a HIGHER ROLE, not merely "a correct PIN" (the PIN was already verified by the
    -- app, lockout-counted): the approver must be an ACTIVE manager/owner — a server-role PIN is rejected.
    select role, active into v_approver_role, v_approver_active
      from public.staff where user_id = p_approver;
    if not coalesce(v_approver_active, false) or v_approver_role not in ('manager','owner') then
      return 'bad_approver';
    end if;
  end if;

  -- Apply the terminal change + write the audit in ONE transaction (no audit ⇒ no void).
  if p_action = 'void' then
    update public.qr_cart_items set state = 'voided' where id = p_line;
  else
    update public.qr_cart_items set comped = true where id = p_line;  -- keep state: the KDS still makes it
  end if;

  insert into public.mms_approvals
    (kind, status, cart_id, session_id, line_id, line_name, qty, amount_cents,
     reason_code, cooked, initiator_staff_id, approver_staff_id)
    values
    (p_action, 'approved', v_cart, v_session, p_line, v_name, v_qty, v_loss,
     p_reason, v_cooked, p_initiator, p_approver);

  return 'ok';
end $$;

revoke all on function public.mms_void_line(uuid, text, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.mms_void_line(uuid, text, text, uuid, uuid) to service_role;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════
-- CHARGEABLE-BASE EXCLUSION — a voided OR comped line sums to $0 everywhere the charge is derived.
-- Each function below is the LATEST body restated verbatim with `and ci.state <> 'voided' and not ci.comped`
-- added to its qr_cart_items scan. (create-or-replace preserves the existing service_role grants.)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════

-- mms_promo_check (20260620000000) — the apply-time gate's subtotal now excludes voided/comped lines.
create or replace function public.mms_promo_check(p_code text, p_cart_id uuid)
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
    from public.qr_cart_items ci
    where ci.cart_id = p_cart_id and ci.state <> 'voided' and not ci.comped;
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

-- mms_promo_discount (20260620000000) — pricing-time discount on the same chargeable base.
create or replace function public.mms_promo_discount(p_cart_id uuid)
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
    from public.qr_cart_items ci
    where ci.cart_id = p_cart_id and ci.state <> 'voided' and not ci.comped;
  if v_subtotal < v_promo.min_subtotal_cents then return 0; end if;
  return case when v_promo.kind = 'pct'
              then round(v_subtotal * v_promo.value)::integer
              else least(round(v_promo.value)::integer, v_subtotal) end;
end; $$;

-- mms_fulfill_order (20260622010000, card) — the order-snapshot copy excludes voided/comped lines.
-- (Amount reconcile is unchanged — it trusts the getCartTotals breakdown, which already excludes them.)
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
  if v_order is not null then return v_order; end if;  -- idempotent: a retry returns the same order

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

  insert into public.qr_orders (session_id, subtotal_cents, discount_cents, service_charge_cents,
                         tax_cents, tip_cents, total_cents, stripe_payment_intent_id, status,
                         pickup_slot, fire_at)
    values (v_session, p_subtotal_cents, p_discount_cents, p_service_charge_cents,
            p_tax_cents, p_tip_cents, v_total, p_payment_intent, 'paid', v_slot, v_fire)
    returning id into v_order;

  insert into public.qr_order_items (order_id, menu_item_id, name, qty, modifiers, unit_price_cents, tax_cents)
    select v_order, ci.menu_item_id, ci.name, ci.qty, ci.modifiers, ci.unit_price_cents, ci.tax_cents
    from public.qr_cart_items ci
    where ci.cart_id = p_cart_id and ci.state <> 'voided' and not ci.comped;

  if v_promo is not null and p_discount_cents > 0 then
    perform public.mms_promo_consume(v_promo, v_session, v_order);
  end if;

  return v_order;
end; $$;

-- mms_fulfill_cash_order (20260622010000, cash) — the subtotal RECONCILE and the snapshot copy both
-- exclude voided/comped lines, so the SQL-derived subtotal matches the getCartTotals breakdown.
create or replace function public.mms_fulfill_cash_order(
  p_cart_id uuid,
  p_settled_by uuid,
  p_subtotal_cents integer,
  p_discount_cents integer,
  p_service_charge_cents integer,
  p_tax_cents integer,
  p_tip_cents integer default 0
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_order uuid; v_total integer; v_derived_subtotal integer; v_session uuid; v_status text; v_promo text;
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

  insert into public.qr_orders (session_id, subtotal_cents, discount_cents, service_charge_cents,
                         tax_cents, tip_cents, total_cents, status, tender, cart_id, settled_by)
    values (v_session, p_subtotal_cents, p_discount_cents, p_service_charge_cents,
            p_tax_cents, p_tip_cents, v_total, 'paid', 'cash', p_cart_id, p_settled_by)
    returning id into v_order;

  insert into public.qr_order_items (order_id, menu_item_id, name, qty, modifiers, unit_price_cents, tax_cents)
    select v_order, ci.menu_item_id, ci.name, ci.qty, ci.modifiers, ci.unit_price_cents, ci.tax_cents
    from public.qr_cart_items ci
    where ci.cart_id = p_cart_id and ci.state <> 'voided' and not ci.comped;

  if v_promo is not null and p_discount_cents > 0 then
    perform public.mms_promo_consume(v_promo, v_session, v_order);
  end if;

  return v_order;
end; $$;

-- mms_fulfill_split_order (20260620001000) — the snapshot copy excludes voided/comped lines. (The order
-- totals come from the captured SHARES, which were derived from the same chargeable base in lib/split.ts.)
create or replace function mms_fulfill_split_order(p_cart_id uuid, p_expected_total_cents integer)
  returns uuid language plpgsql security definer set search_path = '' as $$
declare v_order uuid; v_session uuid; v_sum integer; v_open integer;
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

  insert into public.qr_orders (session_id, subtotal_cents, discount_cents, service_charge_cents,
                         tax_cents, tip_cents, total_cents, stripe_payment_intent_id, status)
    select v_session, sum(subtotal_cents), sum(discount_cents), sum(service_charge_cents),
           sum(tax_cents), sum(tip_cents), sum(amount_cents), null, 'paid'
    from public.qr_cart_shares where cart_id = p_cart_id and status = 'captured'
    returning id into v_order;

  insert into public.qr_order_items (order_id, menu_item_id, name, qty, modifiers, unit_price_cents, tax_cents)
    select v_order, ci.menu_item_id, ci.name, ci.qty, ci.modifiers, ci.unit_price_cents, ci.tax_cents
    from public.qr_cart_items ci
    where ci.cart_id = p_cart_id and ci.state <> 'voided' and not ci.comped;

  update public.qr_cart_shares set order_id = v_order, updated_at = now()
    where cart_id = p_cart_id and status = 'captured';
  return v_order;
end; $$;
