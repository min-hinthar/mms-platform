-- W23b — make a partial refund visible to the person it happened to.
--
-- S4.3b shipped line-level refunds and W1c shipped the FULL-refund diner surface, but a partial
-- refund left `qr_orders.status = 'paid'` and wrote nothing the diner could read. The consequence
-- got worse, not better, as the receipt got richer: W22r turned /track's slip into a full itemized
-- receipt, so a partially-refunded order now prints every line at full price under "Paid in full ·
-- Card". The app takes money back and then tells the guest, in writing, that they paid in full.
--
-- The ledger that knows the truth (`mms_refunds`) is manager-read by design: it carries reason
-- codes and staff ids, which are internal. Widening its RLS to reach the diner would expose the
-- whole audit trail to reach two numbers — so instead the two numbers land on the rows the diner
-- can ALREADY read (`qr_orders`, `qr_order_items`, both gated by `is_member(session_id)`).
--
-- Two columns, and they answer DIFFERENT questions — this is not one value stored twice:
--
--   • `qr_orders.refunded_cents`  — HOW MUCH came back, in total. Stripe is the authority here and
--     `charge.amount_refunded` is its cumulative answer, which is why the reconcile writes it. It
--     also covers refunds we did not issue (a manager refunding from the Stripe dashboard writes no
--     ledger row at all — that path was, and would have stayed, completely invisible).
--   • `qr_order_items.refunded_cents` — WHICH LINE it came back for. Stripe has no idea; only
--     `mms_record_refund` knows, because only the app maps a refund to a line.
--
-- Both are monotonic. The reconcile uses `greatest()` so an out-of-order webhook redelivery can
-- never walk the total backwards, and `mms_record_refund` bumps the order total optimistically so a
-- guest watching /track sees the money return on the tap rather than a webhook-beat later; the two
-- writers converge on Stripe's number and neither can double-count (the ledger insert's
-- `on conflict do nothing` gates the bump).
--
-- Deliberately NO `refunded_cents <= total_cents` table CHECK. The invariant is true today (Stripe
-- cannot refund more than the charge, and the charge IS total_cents), but the failure mode of the
-- bound is worse than the hole it closes: a refused write means money left the account with no
-- record of it, which is the exact condition `mms_refunds` exists to prevent. The display side is
-- already safe without it — `lib/refund-view.ts` floors the net at zero — so the bound would buy
-- nothing and could cost a ledger row during an incident. The `>= 0` column checks stay: a NEGATIVE
-- refund is not a rounding artifact, it is a corrupt row, and nothing legitimate produces one.

alter table public.qr_orders
  add column if not exists refunded_cents integer not null default 0;
alter table public.qr_order_items
  add column if not exists refunded_cents integer not null default 0;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'qr_orders_refunded_cents_nonneg') then
    alter table public.qr_orders
      add constraint qr_orders_refunded_cents_nonneg check (refunded_cents >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'qr_order_items_refunded_cents_nonneg') then
    alter table public.qr_order_items
      add constraint qr_order_items_refunded_cents_nonneg check (refunded_cents >= 0);
  end if;
end $$;

comment on column public.qr_orders.refunded_cents is
  'W23b — cumulative cents refunded on this order. Stripe-authoritative (charge.amount_refunded via '
  'mms_apply_refund_reconcile); also bumped by mms_record_refund so the diner sees it immediately. '
  'Monotonic. status stays ''paid'' for a PARTIAL refund — this column is the only diner-readable '
  'signal that money came back.';
comment on column public.qr_order_items.refunded_cents is
  'W23b — cents refunded against THIS line (mms_record_refund). Stripe knows the charge, not the '
  'line; this is the attribution, and it is what lets a receipt say which dish was returned.';

-- Back-fill from the ledger. Verified against prod before writing: mms_refunds holds 0 rows and no
-- order carries status='refunded', so this is a genuine no-op today — it exists so the columns are
-- correct in any environment that DOES have history (previews, a future restore), not as a guess
-- about production. Order-level rows (order_item_id null — dashboard reconciles) sum into the order
-- total and attribute to no line, which is exactly what they are.
update public.qr_orders o
   set refunded_cents = r.total
  from (select order_id, sum(amount_cents)::int as total from public.mms_refunds group by order_id) r
 where r.order_id = o.id and o.refunded_cents = 0;

update public.qr_order_items oi
   set refunded_cents = r.total
  from (select order_item_id, sum(amount_cents)::int as total from public.mms_refunds
         where order_item_id is not null group by order_item_id) r
 where r.order_item_id = oi.id and oi.refunded_cents = 0;

-- ── mms_record_refund — same signature, plus the two denormalized writes. ──────────────────────────
-- The bumps live INSIDE this function, after the `on conflict do nothing` guard, so they share the
-- ledger insert's transaction and its idempotency: a redelivered webhook backstop re-runs the insert,
-- finds the conflict, returns 'duplicate' before reaching them, and cannot double-count.
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
  -- W23b — the diner-readable projection, written in the SAME transaction as the ledger row it
  -- describes. A separate later write could fail on its own and leave the guest reading "Paid in
  -- full" over money that had already gone back.
  update public.qr_order_items set refunded_cents = refunded_cents + p_amount where id = p_order_item;
  update public.qr_orders set refunded_cents = refunded_cents + p_amount where id = v_order;
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

-- ── mms_apply_refund_reconcile — same signature, now also the Stripe-authoritative total. ──────────
-- `greatest()` rather than assignment: Stripe redelivers within a 72h window and delivery order is
-- not guaranteed, so a replayed EARLIER charge.refunded event carries a SMALLER amount_refunded. A
-- plain assignment would rewind the guest's receipt to a state that is no longer true.
create or replace function public.mms_apply_refund_reconcile(p_payment_intent text, p_amount_refunded integer)
  returns text language plpgsql security definer set search_path = '' as $$
declare v_order uuid; v_total integer; v_status text;
begin
  select id, total_cents, status into v_order, v_total, v_status
    from public.qr_orders where stripe_payment_intent_id = p_payment_intent;
  if v_order is null then return 'no_order'; end if;  -- a PI we don't own / split order (shares carry PIs)
  update public.qr_orders
     set refunded_cents = greatest(refunded_cents, p_amount_refunded)
   where id = v_order;
  if p_amount_refunded >= v_total and v_status = 'paid' then
    update public.qr_orders set status = 'refunded' where id = v_order and status = 'paid';
    return 'refunded';
  end if;
  return 'partial';  -- a single-line refund: order stays 'paid' (refunded_cents carries the amount)
end $$;
revoke all on function public.mms_apply_refund_reconcile(text, integer) from public, anon, authenticated;
grant execute on function public.mms_apply_refund_reconcile(text, integer) to service_role;
