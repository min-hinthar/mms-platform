-- 20260624010000_s4_line_refunds.sql — S4.3b: line-level refunds (money-OUT). docs/S4_DESIGN.md S4.3b.
-- S2.3 gates/audits a void on an OPEN cart; this adds the captured-line refund on a PAID order — the
-- explicit S4.3 seam. A manager (on /staff/orders) refunds a specific paid line: amount + PI are
-- SERVER-DERIVED here (never client), the Stripe refund is executed by the action, and charge.refunded is
-- the Stripe-authoritative status reconcile. Additive + idempotent.

-- ── B2: the executed-refund ledger (distinct from qr_refunds_needed, which is a stranded-charge TODO). ──
create table if not exists public.mms_refunds (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null references public.qr_orders(id),
  order_item_id      uuid references public.qr_order_items(id),  -- null = order-level (e.g. dashboard refund)
  amount_cents       integer not null check (amount_cents > 0),
  stripe_refund_id   text not null unique,                       -- idempotency: one ledger row per Stripe refund
  reason_code        text not null check (char_length(reason_code) between 1 and 40),
  initiator_staff_id uuid,                                       -- null = out-of-band (dashboard) reconcile
  approver_staff_id  uuid,
  created_at         timestamptz not null default now()
);
-- One in-app refund per line — the DB backstop to the Stripe idempotency key (order-level rows are exempt).
create unique index if not exists mms_refunds_one_per_line
  on public.mms_refunds(order_item_id) where order_item_id is not null;
alter table public.mms_refunds enable row level security;
revoke all on public.mms_refunds from anon, authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='mms_refunds'
                 and policyname='mms_refunds_staff_read') then
    create policy mms_refunds_staff_read on public.mms_refunds for select
      using (public.is_staff_at_least('manager'));   -- audit surface; service-role writes bypass RLS
  end if;
end $$;

-- ── mms_approvals.kind gains 'refund' (the two-party audit ledger is reused for the money-out record). ──
alter table public.mms_approvals drop constraint if exists mms_approvals_kind_check;
alter table public.mms_approvals add constraint mms_approvals_kind_check
  check (kind in ('void','comp','refund_request','refund'));

-- ── B1: authorize (read-only) — server-derive the refundable amount + PI; validate the gate. ────────────
create or replace function public.mms_refund_authorize(p_line_item uuid, p_initiator uuid)
  returns table(reason text, amount_cents integer, payment_intent text)
  language plpgsql security definer set search_path = '' as $$
declare v_order uuid; v_status text; v_pi text; v_amt integer; v_role text; v_active boolean; v_already integer;
begin
  -- Money-out authority: the initiator must be an ACTIVE manager/owner (re-checked here, not just the page).
  select role, active into v_role, v_active from public.staff where user_id = p_initiator;
  if not coalesce(v_active, false) or v_role not in ('manager','owner') then
    return query select 'not_manager'::text, 0, null::text; return;
  end if;
  -- The line → its order. Amount = the line's goods + its own tax (service/tip are order-level, not per-line).
  select oi.order_id, (oi.unit_price_cents * oi.qty + oi.tax_cents), o.status, o.stripe_payment_intent_id
    into v_order, v_amt, v_status, v_pi
    from public.qr_order_items oi join public.qr_orders o on o.id = oi.order_id
    where oi.id = p_line_item;
  if v_order is null then return query select 'not_found'::text, 0, null::text; return; end if;
  if v_status <> 'paid' then return query select 'not_paid'::text, 0, null::text; return; end if;
  if v_pi is null then return query select 'split_unsupported'::text, 0, null::text; return; end if;  -- split → deferred
  select count(*) into v_already from public.mms_refunds where order_item_id = p_line_item;
  if v_already > 0 then return query select 'already_refunded'::text, 0, null::text; return; end if;
  return query select 'ok'::text, v_amt, v_pi;
end $$;
revoke all on function public.mms_refund_authorize(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mms_refund_authorize(uuid, uuid) to service_role;

-- ── B2: record — write the ledger + audit AFTER the Stripe refund succeeds. Idempotent on the refund id. ─
create or replace function public.mms_record_refund(
  p_order_item uuid, p_amount integer, p_stripe_refund_id text, p_reason text, p_initiator uuid
) returns text language plpgsql security definer set search_path = '' as $$
declare v_order uuid; v_session uuid; v_name text; v_qty integer;
begin
  select oi.order_id, oi.name, oi.qty, o.session_id into v_order, v_name, v_qty, v_session
    from public.qr_order_items oi join public.qr_orders o on o.id = oi.order_id
    where oi.id = p_order_item;
  if v_order is null then return 'not_found'; end if;
  insert into public.mms_refunds
    (order_id, order_item_id, amount_cents, stripe_refund_id, reason_code, initiator_staff_id, approver_staff_id)
    values (v_order, p_order_item, p_amount, p_stripe_refund_id, p_reason, p_initiator, p_initiator)
    on conflict (stripe_refund_id) do nothing;
  if not found then return 'duplicate'; end if;  -- already recorded (retry / webhook echo) → don't double-audit
  -- Two-party audit row (kind='refund'): on the manager surface the initiator IS the authorizing manager.
  insert into public.mms_approvals
    (kind, status, session_id, line_id, line_name, qty, amount_cents, reason_code, cooked,
     initiator_staff_id, approver_staff_id)
    values ('refund','approved', v_session, p_order_item, v_name, v_qty, p_amount, p_reason, false,
            p_initiator, p_initiator);
  return 'ok';
end $$;
revoke all on function public.mms_record_refund(uuid, integer, text, text, uuid) from public, anon, authenticated;
grant execute on function public.mms_record_refund(uuid, integer, text, text, uuid) to service_role;

-- ── B3: charge.refunded reconcile — Stripe-authoritative status flip. Fully refunded ⇒ 'refunded'. ──────
create or replace function public.mms_apply_refund_reconcile(p_payment_intent text, p_amount_refunded integer)
  returns text language plpgsql security definer set search_path = '' as $$
declare v_order uuid; v_total integer; v_status text;
begin
  select id, total_cents, status into v_order, v_total, v_status
    from public.qr_orders where stripe_payment_intent_id = p_payment_intent;
  if v_order is null then return 'no_order'; end if;  -- a PI we don't own / split order (shares carry PIs)
  if p_amount_refunded >= v_total and v_status = 'paid' then
    update public.qr_orders set status = 'refunded' where id = v_order and status = 'paid';
    return 'refunded';
  end if;
  return 'partial';  -- a single-line refund: order stays 'paid' (mms_refunds carries the line detail)
end $$;
revoke all on function public.mms_apply_refund_reconcile(text, integer) from public, anon, authenticated;
grant execute on function public.mms_apply_refund_reconcile(text, integer) to service_role;
