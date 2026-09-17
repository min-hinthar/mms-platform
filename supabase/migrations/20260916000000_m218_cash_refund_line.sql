-- M218 — a cash refund is TOLD, never recorded. This makes it real.
--
-- The hole, verified against source before this file was written: `mms_refund_authorize`
-- (20260624030000) answers `split_unsupported` for any order whose `stripe_payment_intent_id` is
-- null, and `mms_fulfill_cash_order` never writes one — the column is absent from its INSERT. So a
-- cash order could never be authorized, `refundLine` could never reach `mms_record_refund`, and
-- nothing else writes `mms_refunds` / `qr_orders.refunded_cents` / `qr_order_items.refunded_cents`
-- for cash. There is no processor webhook to reconcile it later either: cash has no processor. The
-- manager hands money back from the drawer and every surface keeps saying "Paid in full".
--
-- ── Why this is ONE function, where card is two ───────────────────────────────────────────────────
-- The card path is split — `mms_refund_authorize` (read-only; it writes NOTHING) → Stripe →
-- `mms_record_refund` — because a processor sits in the middle and the ledger row is keyed on the
-- refund id Stripe hands back. Cash has no middle: the money moves when the drawer opens. Splitting
-- it would invent a window where a refund is authorized and unrecorded, with nothing to reconcile
-- it. So `mms_refund_cash_line` authorizes and records in ONE transaction.
--
-- ── Idempotency, without a Stripe refund id ───────────────────────────────────────────────────────
-- `mms_record_refund` dedupes on `stripe_refund_id` (`on conflict do nothing`). A cash row has no
-- such id, so this path leans on the constraint that was already there for exactly this shape:
-- `mms_refunds_one_per_line`, the partial unique index on `order_item_id`. The function checks
-- already_refunded first and the index is the race backstop — a second concurrent call inserts
-- nothing and is told `already_refunded`, so a double-tap can never pay out twice.
--
-- ── The arithmetic is EXTRACTED, not copied ───────────────────────────────────────────────────────
-- The repo's first money rule is that a value computed in one place and quoted in another WILL
-- drift ("name it ONCE" — four W17 defects, three of them this exact shape). The cash path needs
-- the same per-line pro-rata and the same pool clamp the card path uses, so this migration lifts
-- that arithmetic out of `mms_refund_authorize` into `mms_refund_line_amount` and has BOTH callers
-- read it. `mms_refund_authorize` is re-created here with its signature, its guard ORDER and every
-- refusal string unchanged — only the arithmetic moves. A third mirror already exists in TypeScript
-- (`lib/refund-console.ts`, the console's before-the-tap figure); it is documented as a mirror and
-- keeps its own tests.

-- ── The ledger admits a non-processor row ────────────────────────────────────────────────────────
-- `stripe_refund_id` was `not null unique`: it cannot describe money that Stripe never touched.
-- Dropping NOT NULL keeps the unique index (Postgres allows many NULLs in a unique index), so card
-- rows keep their one-row-per-Stripe-refund guarantee and cash rows simply carry none.
alter table public.mms_refunds alter column stripe_refund_id drop not null;

-- Which tender the money went back AS — not the same question as the order's tender, and the one
-- the drawer must ask: a cash refund is cash OUT of the till today, a card refund never touches it.
alter table public.mms_refunds add column if not exists tender text not null default 'card';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'mms_refunds_tender_chk') then
    alter table public.mms_refunds
      add constraint mms_refunds_tender_chk check (tender in ('card', 'cash'));
  end if;
end $$;
comment on column public.mms_refunds.tender is
  'M218 — how the money went BACK. card = a Stripe refund (stripe_refund_id is set); cash = handed '
  'back from the drawer (stripe_refund_id is null). The drawer nets only the cash rows.';

-- ── The one arithmetic: what this line can give back, clamped to the order''s remaining pool ──────
-- Lifted VERBATIM from mms_refund_authorize (20260624030000). Returns the clamped cents, or 0 when
-- nothing can come back — which is the single `fully_refunded` condition both of that function''s
-- two checks expressed (remaining <= 0, and the clamp landing at <= 0). Callers map 0 to their own
-- refusal, so the reason vocabulary stays theirs.
--
-- Returns 0 for a line that does not exist; every caller checks not_found before asking.
create or replace function public.mms_refund_line_amount(p_line_item uuid)
  returns integer language plpgsql stable security definer set search_path = '' as $$
declare
  v_order uuid;
  v_unit integer; v_qty integer; v_line_tax_unit integer;
  v_subtotal integer; v_discount integer; v_order_tax integer; v_total integer;
  v_service integer; v_tip integer;
  v_line_gross integer; v_taxable_base integer; v_line_discount integer;
  v_goods integer; v_line_tax integer; v_amt integer;
  v_pool integer; v_refunded integer; v_remaining integer;
begin
  select oi.order_id, oi.unit_price_cents, oi.qty, oi.tax_cents,
         o.subtotal_cents, o.discount_cents, o.tax_cents, o.total_cents, o.service_charge_cents, o.tip_cents
    into v_order, v_unit, v_qty, v_line_tax_unit,
         v_subtotal, v_discount, v_order_tax, v_total, v_service, v_tip
    from public.qr_order_items oi join public.qr_orders o on o.id = oi.order_id
    where oi.id = p_line_item;
  if v_order is null then return 0; end if;

  -- Line's discounted goods: gross − its pro-rata share of the order discount (by gross, like totals.ts).
  v_line_gross := v_unit * v_qty;
  select coalesce(sum(unit_price_cents * qty), 0) into v_taxable_base
    from public.qr_order_items where order_id = v_order and tax_cents > 0;   -- the taxable subtotal base
  v_line_discount := case when v_subtotal > 0
                          then round(v_discount::numeric * v_line_gross / v_subtotal) else 0 end;
  v_goods := v_line_gross - v_line_discount;
  -- Line's share of the order's (already discount-adjusted) tax, pro-rata by taxable gross. P0-1: this is
  -- the per-line share of the ORDER tax_cents — it scales with qty because v_line_gross does. A
  -- non-taxable line (stored tax_cents = 0) gets 0.
  v_line_tax := case when v_line_tax_unit > 0 and v_taxable_base > 0
                     then round(v_order_tax::numeric * v_line_gross / v_taxable_base) else 0 end;
  v_amt := v_goods + v_line_tax;

  -- P1-1 over-refund cap: refundable pool = net + tax (= total − service − tip). Clamp to what is left
  -- after every prior refund on the order (incl. order-level/dashboard rows AND cash rows — the sum is
  -- by order_id, so a cash refund narrows a later card one and the reverse), so Σ refunds can never
  -- exceed what was collected for goods+tax.
  v_pool := v_total - v_service - v_tip;
  select coalesce(sum(amount_cents), 0) into v_refunded from public.mms_refunds where order_id = v_order;
  v_remaining := v_pool - v_refunded;
  if v_remaining <= 0 then return 0; end if;
  if v_amt > v_remaining then v_amt := v_remaining; end if;
  if v_amt <= 0 then return 0; end if;
  return v_amt;
end $$;
revoke all on function public.mms_refund_line_amount(uuid) from public, anon, authenticated;
grant execute on function public.mms_refund_line_amount(uuid) to service_role;

-- ── mms_refund_authorize — same signature, same guard ORDER, same refusal strings. ───────────────
-- The ONLY change is that the amount now comes from mms_refund_line_amount. Every reason code and
-- the order they are checked in is preserved deliberately: `lib/refunds.ts` maps these strings to
-- the manager''s copy, and a reordered guard would silently change which sentence a manager reads.
create or replace function public.mms_refund_authorize(p_line_item uuid, p_initiator uuid)
  returns table(reason text, amount_cents integer, payment_intent text)
  language plpgsql security definer set search_path = '' as $$
declare
  v_order uuid; v_status text; v_pi text; v_role text; v_active boolean; v_already integer;
  v_amt integer;
begin
  -- Money-out authority: the initiator must be an ACTIVE manager/owner (re-checked here, not just the page).
  select role, active into v_role, v_active from public.staff where user_id = p_initiator;
  if not coalesce(v_active, false) or v_role not in ('manager','owner') then
    return query select 'not_manager'::text, 0, null::text; return;
  end if;
  select oi.order_id, o.status, o.stripe_payment_intent_id
    into v_order, v_status, v_pi
    from public.qr_order_items oi join public.qr_orders o on o.id = oi.order_id
    where oi.id = p_line_item;
  if v_order is null then return query select 'not_found'::text, 0, null::text; return; end if;
  if v_status <> 'paid' then return query select 'not_paid'::text, 0, null::text; return; end if;
  if v_pi is null then return query select 'split_unsupported'::text, 0, null::text; return; end if;  -- split / cash → not this path
  select count(*) into v_already from public.mms_refunds where order_item_id = p_line_item;
  if v_already > 0 then return query select 'already_refunded'::text, 0, null::text; return; end if;

  v_amt := public.mms_refund_line_amount(p_line_item);
  if v_amt <= 0 then return query select 'fully_refunded'::text, 0, null::text; return; end if;
  return query select 'ok'::text, v_amt, v_pi;
end $$;
revoke all on function public.mms_refund_authorize(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mms_refund_authorize(uuid, uuid) to service_role;

-- ── mms_refund_cash_line — authorize AND record, in one transaction. ─────────────────────────────
-- Same authority floor as the card authorizer (an ACTIVE manager/owner, re-read here rather than
-- trusted from the page) and the same clamp. It refuses anything the card path owns, so the two can
-- never both pay out the same line: `not_cash` covers both a non-cash tender and a cash-tendered
-- order that somehow carries a PaymentIntent — if a processor can give the money back, a hand from
-- the drawer is the wrong instrument and would double-refund the guest.
create or replace function public.mms_refund_cash_line(
  p_line_item uuid, p_initiator uuid, p_reason text
) returns table(reason text, amount_cents integer)
  language plpgsql security definer set search_path = '' as $$
declare
  v_order uuid; v_status text; v_pi text; v_tender text; v_session uuid;
  v_name text; v_qty integer; v_role text; v_active boolean; v_already integer; v_amt integer;
  v_inserted uuid;
begin
  select role, active into v_role, v_active from public.staff where user_id = p_initiator;
  if not coalesce(v_active, false) or v_role not in ('manager','owner') then
    return query select 'not_manager'::text, 0; return;
  end if;
  select oi.order_id, oi.name, oi.qty, o.status, o.stripe_payment_intent_id, o.tender, o.session_id
    into v_order, v_name, v_qty, v_status, v_pi, v_tender, v_session
    from public.qr_order_items oi join public.qr_orders o on o.id = oi.order_id
    where oi.id = p_line_item;
  if v_order is null then return query select 'not_found'::text, 0; return; end if;
  if v_status <> 'paid' then return query select 'not_paid'::text, 0; return; end if;
  if v_tender <> 'cash' or v_pi is not null then return query select 'not_cash'::text, 0; return; end if;
  select count(*) into v_already from public.mms_refunds where order_item_id = p_line_item;
  if v_already > 0 then return query select 'already_refunded'::text, 0; return; end if;

  -- ⚠️ SERIALIZE ON THE ORDER BEFORE READING THE POOL (Codex round 1 on #286, P1).
  -- `mms_refunds_one_per_line` only conflicts for the SAME line, so two managers refunding two
  -- DIFFERENT lines of one cash order would each compute `mms_refund_line_amount` before either
  -- insert became visible, and each would clamp against the same remaining pool. With a prior
  -- order-level row already shrinking that pool — the dashboard shape case 7 builds — both are
  -- clamped to the SAME remainder and both pay it out: the drawer gives back more than the order
  -- collected for goods and tax. Taking the order row FOR UPDATE makes the second call wait for the
  -- first to commit, so it reads a pool that already includes it.
  --
  -- The card path does not need this: its authorizer only READS, and Stripe's idempotency key plus
  -- the per-line index carry it. Cash authorizes and pays in the same statement, so the lock is the
  -- only thing between two hands in one till.
  perform 1 from public.qr_orders where id = v_order for update;

  v_amt := public.mms_refund_line_amount(p_line_item);
  if v_amt <= 0 then return query select 'fully_refunded'::text, 0; return; end if;

  -- The ledger row: no processor id, tender 'cash'. `mms_refunds_one_per_line` (the partial unique
  -- index on order_item_id) is the race backstop behind the already_refunded check above — a second
  -- concurrent call inserts nothing, and is told what it would have been told a moment earlier.
  insert into public.mms_refunds
    (order_id, order_item_id, amount_cents, stripe_refund_id, reason_code, tender,
     initiator_staff_id, approver_staff_id)
    values (v_order, p_line_item, v_amt, null, p_reason, 'cash', p_initiator, p_initiator)
    on conflict (order_item_id) where order_item_id is not null do nothing
    returning id into v_inserted;
  if v_inserted is null then return query select 'already_refunded'::text, 0; return; end if;

  -- The diner-readable projection, in the SAME transaction as the ledger row it describes (W23b):
  -- a separate later write could fail on its own and leave the guest reading "Paid in full" over
  -- money that had already left the drawer — which is the whole defect this migration closes.
  update public.qr_order_items set refunded_cents = refunded_cents + v_amt where id = p_line_item;
  update public.qr_orders set refunded_cents = refunded_cents + v_amt where id = v_order;
  -- Two-party audit row (kind='refund'), the same shape mms_record_refund writes: on the manager
  -- surface the initiator IS the authorizing manager.
  insert into public.mms_approvals
    (kind, status, session_id, line_id, line_name, qty, amount_cents, reason_code, cooked,
     initiator_staff_id, approver_staff_id)
    values ('refund','approved', v_session, p_line_item, v_name, v_qty, v_amt, p_reason, false,
            p_initiator, p_initiator);
  return query select 'ok'::text, v_amt;
end $$;
revoke all on function public.mms_refund_cash_line(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.mms_refund_cash_line(uuid, uuid, text) to service_role;
