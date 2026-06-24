-- 20260624030000_s4_money_remediation.sql — S4 audit remediation (docs/S4_AUDIT.md P0-1, P1-1, P1-2, P1-3).
-- The fast S4 build left four defects this migration closes (all additive / idempotent; no new tables):
--   P0-1  per-unit tax under-refund — mms_refund_authorize added the line's PER-UNIT tax once, not ×qty.
--   P1-1  no discount-awareness / over-refund cap — it refunded UNDISCOUNTED goods+tax (the diner paid the
--         discounted net) and had no aggregate Σ-refunds ≤ collected guard.
--   P1-2  fire-at-checkout had no durable backstop — if the settlement after() drain cold-stops, paid draft
--         food is never fired and nothing reconciles. Add a pg_cron reconciler (the QBO-drain pattern).
--   P1-3  mms_undo_fire keyed on max(fire_at), so a host's grace-Undo could claw back a guest's make-it-now
--         (S4.2) line. Key it on a specific fire_batch instead (the send hands the client its batch id).

-- ── P0-1 + P1-1: discount-aware, qty-correct refund amount + an order-level over-refund cap ──────────────
-- The refundable amount for ONE paid line = its DISCOUNTED goods + its share of the order's (discounted)
-- tax — mirrors getCartTotals/apps/qr/lib/totals.ts (tax on the discounted taxable base; service/tip are
-- order-level, excluded). Then clamp to the remaining refundable pool (net + tax = total − service − tip)
-- minus everything already refunded on the order, so cumulative refunds can never exceed what was collected
-- (Stripe caps a single refund at the charge; this caps the in-app authorization across lines + dashboard
-- refunds). Same (uuid,uuid) signature → create-or-replace preserves the grant; the revoke/grant re-asserts.
create or replace function public.mms_refund_authorize(p_line_item uuid, p_initiator uuid)
  returns table(reason text, amount_cents integer, payment_intent text)
  language plpgsql security definer set search_path = '' as $$
declare
  v_order uuid; v_status text; v_pi text; v_role text; v_active boolean; v_already integer;
  v_unit integer; v_qty integer; v_line_tax_unit integer;
  v_subtotal integer; v_discount integer; v_order_tax integer; v_total integer;
  v_service integer; v_tip integer;
  v_line_gross integer; v_taxable_base integer; v_line_discount integer;
  v_goods integer; v_line_tax integer; v_amt integer;
  v_pool integer; v_refunded integer; v_remaining integer;
begin
  -- Money-out authority: the initiator must be an ACTIVE manager/owner (re-checked here, not just the page).
  select role, active into v_role, v_active from public.staff where user_id = p_initiator;
  if not coalesce(v_active, false) or v_role not in ('manager','owner') then
    return query select 'not_manager'::text, 0, null::text; return;
  end if;
  -- The line + its order's money snapshot (all server-derived; the client never sends a figure).
  select oi.order_id, oi.unit_price_cents, oi.qty, oi.tax_cents,
         o.status, o.stripe_payment_intent_id,
         o.subtotal_cents, o.discount_cents, o.tax_cents, o.total_cents, o.service_charge_cents, o.tip_cents
    into v_order, v_unit, v_qty, v_line_tax_unit,
         v_status, v_pi,
         v_subtotal, v_discount, v_order_tax, v_total, v_service, v_tip
    from public.qr_order_items oi join public.qr_orders o on o.id = oi.order_id
    where oi.id = p_line_item;
  if v_order is null then return query select 'not_found'::text, 0, null::text; return; end if;
  if v_status <> 'paid' then return query select 'not_paid'::text, 0, null::text; return; end if;
  if v_pi is null then return query select 'split_unsupported'::text, 0, null::text; return; end if;  -- split → deferred
  select count(*) into v_already from public.mms_refunds where order_item_id = p_line_item;
  if v_already > 0 then return query select 'already_refunded'::text, 0, null::text; return; end if;

  -- Line's discounted goods: gross − its pro-rata share of the order discount (by gross, like totals.ts).
  v_line_gross := v_unit * v_qty;
  select coalesce(sum(unit_price_cents * qty), 0) into v_taxable_base
    from public.qr_order_items where order_id = v_order and tax_cents > 0;   -- the taxable subtotal base
  v_line_discount := case when v_subtotal > 0
                          then round(v_discount::numeric * v_line_gross / v_subtotal) else 0 end;
  v_goods := v_line_gross - v_line_discount;
  -- Line's share of the order's (already discount-adjusted) tax, pro-rata by taxable gross. P0-1: this is
  -- the per-line share of the ORDER tax_cents — it scales with qty because v_line_gross does, fixing the
  -- old `+ oi.tax_cents` (per-unit, added once). A non-taxable line (stored tax_cents = 0) gets 0.
  v_line_tax := case when v_line_tax_unit > 0 and v_taxable_base > 0
                     then round(v_order_tax::numeric * v_line_gross / v_taxable_base) else 0 end;
  v_amt := v_goods + v_line_tax;

  -- P1-1 over-refund cap: refundable pool = net + tax (= total − service − tip). Clamp this line's refund to
  -- what's left after every prior refund on the order (incl. order-level/dashboard rows), so Σ refunds can
  -- never exceed what was collected for goods+tax. In the common single-line refund case the cap never binds.
  v_pool := v_total - v_service - v_tip;
  select coalesce(sum(amount_cents), 0) into v_refunded from public.mms_refunds where order_id = v_order;
  v_remaining := v_pool - v_refunded;
  if v_remaining <= 0 then return query select 'fully_refunded'::text, 0, null::text; return; end if;
  if v_amt > v_remaining then v_amt := v_remaining; end if;   -- never authorize more than the charge can give back
  if v_amt <= 0 then return query select 'fully_refunded'::text, 0, null::text; return; end if;

  return query select 'ok'::text, v_amt, v_pi;
end $$;
revoke all on function public.mms_refund_authorize(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mms_refund_authorize(uuid, uuid) to service_role;

-- ── P1-3: mms_undo_fire now keys on a specific fire_batch (not max(fire_at)) ─────────────────────────────
-- The bug: S4.2's mms_fire_line ("make it now") stamps the same now()+10s grace as a host's batch send, so
-- "undo the latest by fire_at" could revert a GUEST's deliberate make-it-now togo line instead of the host's
-- batch. Each send already stamps a unique fire_batch; the send action now hands the client THAT batch id
-- and Undo passes it back, so undo reverses exactly the batch the button represents — never another actor's.
-- New signature (uuid, uuid) ⇒ drop the old (uuid) overload first. Still grace-gated (fire_at > now()) +
-- dine-in + cart-open, so a passed-grace (kitchen-pulled) line is never silently un-sent. Atomic, one statement.
drop function if exists public.mms_undo_fire(uuid);
create function public.mms_undo_fire(p_cart_id uuid, p_batch uuid) returns integer
  language plpgsql set search_path = '' as $$
declare n integer;
begin
  update public.qr_cart_items ci
    set state = 'draft', fire_at = null
    from public.qr_carts c
    join public.table_sessions s on s.id = c.session_id
    where ci.cart_id = p_cart_id
      and c.id = ci.cart_id
      and c.status = 'open'
      and s.mode = 'dinein'
      and ci.state = 'fired'
      and ci.fire_at > now()           -- still in grace; the kitchen has NOT pulled it (else removal → void)
      and ci.fire_batch = p_batch;     -- ONLY this send's batch (the UI's Undo corresponds to one send)
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.mms_undo_fire(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mms_undo_fire(uuid, uuid) to service_role;

-- ── P1-2: durable fire-at-checkout backstop — a pg_cron reconciler (the QBO-drain pattern) ───────────────
-- The settlement after() drain (webhook single + split; cash) fires pending food / inits togo_status /
-- snapshots EBT off the money path. If after() never runs (a serverless cold-stop after the 200 ack), that
-- work is lost AND nothing re-runs it — Stripe redelivery is idempotent on the PI so it never re-reaches the
-- fulfill block. This reconciler is the durable backstop: it scans recently-PAID orders that still have
-- un-done settlement work and runs the SAME idempotent RPCs. In steady state the pre-filter returns 0 rows
-- (after() already did the work), so it's cheap; the rare cold-stop straggler is recovered within the cron
-- interval. Bounded to the last 24h so it never scans all history. SECURITY DEFINER, service-role only.
create or replace function public.mms_reconcile_settled_fulfillment() returns integer
  language plpgsql security definer set search_path = '' as $$
declare r record; n integer; total integer := 0;
begin
  for r in
    select o.id as order_id, o.cart_id
      from public.qr_orders o
      where o.status = 'paid' and o.cart_id is not null
        and o.created_at > now() - interval '24 hours'
        and (
          -- a paid dine-in cart with still-DRAFT food (never fired — the load-bearing case: uncooked food)
          exists (
            select 1 from public.qr_cart_items ci
              join public.qr_carts c on c.id = ci.cart_id
              join public.table_sessions s on s.id = c.session_id
              where c.id = o.cart_id and c.status = 'paid' and s.mode = 'dinein'
                and ci.state = 'draft' and ci.fulfillment in ('dinein','togo'))
          -- a takeaway order whose ready-signal was never initialized
          or (o.togo_status is null and exists (
                select 1 from public.qr_order_items oi
                  where oi.order_id = o.id and oi.fulfillment in ('togo','grocery')))
          -- a grocery line whose EBT eligibility-at-sale was never snapshotted
          or exists (
            select 1 from public.qr_order_items oi
              join public.grocery_items g on g.barcode = oi.menu_item_id
              where oi.order_id = o.id and oi.fulfillment = 'grocery'
                and g.ebt_eligible = true and oi.ebt_eligible = false)
        )
  loop
    select public.mms_fire_pending_food(r.cart_id) into n;   -- idempotent: fires 0 if no draft food remains
    total := total + coalesce(n, 0);
    perform public.mms_init_togo_status(r.order_id, r.cart_id);
    perform public.mms_snapshot_ebt_eligibility(r.order_id);
  end loop;
  return total;   -- lines fired this run (for logging / observability)
end $$;
revoke all on function public.mms_reconcile_settled_fulfillment() from public, anon, authenticated;
grant execute on function public.mms_reconcile_settled_fulfillment() to service_role;

-- Schedule every 5 min via pg_cron. Guarded exactly like mms_sweep_expired_sessions: live has pg_cron, a
-- local CI stack may not — the fn works whether or not it's scheduled, so skipping is harmless. Upserts by
-- jobname → idempotent on re-apply. 5 min balances straggler-fire latency against the per-run scan cost.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('mms-reconcile-settled-fulfillment', '*/5 * * * *',
      'select public.mms_reconcile_settled_fulfillment();');
  end if;
exception when others then
  raise notice 'pg_cron schedule skipped (extension unavailable here): %', sqlerrm;
end $$;
