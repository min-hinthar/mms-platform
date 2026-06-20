-- 20260620001000_split_tender.sql
-- M3·P3.3b — Option-A split-tender (authorize-all → capture-together). A dine-in table splits ONE
-- order across N cards: each payer authorizes their OWN share on their OWN PaymentIntent
-- (capture_method=manual); when the LAST share authorizes the webhook captures them all together and
-- fulfills the single order. This is the pay-then-fulfill spine — no money is captured until the whole
-- table is covered, so there is never a charged-with-no-order. Abandon/timeout cancels the holds.
--
-- Schema only here (ledger + settlement freeze + the split fulfillment fn). The N-PaymentIntent
-- orchestration (create / capture-all / cancel-on-abandon) lives in the route + webhook (TS), which
-- own the Stripe calls; SQL only stores the server-derived breakdown and does the idempotent fulfill.

-- ============ settlement freeze on the cart ============
-- During a split settlement the cart must freeze for the WHOLE table (the P3.2 pay-lock is single-
-- holder; split needs a table-wide freeze). settle_at = when settlement opened → a TTL backstop so an
-- abandoned settlement auto-clears (mirrors the pay-lock TTL); settle_by = the member who opened it
-- (provenance + so the opener can re-open/abort). Both nullable (a cart starts un-settling).
alter table public.qr_carts add column if not exists settle_at timestamptz;
alter table public.qr_carts add column if not exists settle_by uuid;

-- ============ per-payer share ledger ============
-- One row per payer per cart. The breakdown is SERVER-derived (deriveShares): by-person weights each
-- seat by its assigned-line subtotal, with TAX on each seat's own taxable base and service on each
-- seat's net (NOT a pro-rata of the aggregate — LEARNINGS), reconciled by largest-remainder so the
-- shares sum EXACTLY to the cart grand total. tip is per-payer, chosen at THAT payer's pay step, so
-- tip_cents/tip_rate + the PaymentIntent (amount = base + tip) are set when the payer pays, not upfront.
create table if not exists public.qr_cart_shares (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.qr_carts(id) on delete cascade,
  seat_id uuid not null,                               -- the payer (a session member)
  -- server-derived BASE breakdown (cents) — set at settlement open; Σ across shares == cart grand total
  subtotal_cents int not null check (subtotal_cents >= 0),
  discount_cents int not null default 0 check (discount_cents >= 0),
  service_charge_cents int not null default 0 check (service_charge_cents >= 0),
  tax_cents int not null default 0 check (tax_cents >= 0),
  -- per-payer tip + the resulting PaymentIntent target (base + tip); set at the payer's pay step
  tip_cents int not null default 0 check (tip_cents >= 0),
  tip_rate numeric not null default 0 check (tip_rate >= 0 and tip_rate <= 0.5),
  -- The PI amount for this payer (base, then + tip). `>= 0` (not `> 0`): deriveShareBreakdowns can
  -- legitimately produce a $0 base — more seats than lines, a seat who owns nothing in by-person, or a
  -- tiny subtotal fully consumed by its pro-rata discount. A $0 share gets NO PaymentIntent; the
  -- orchestration auto-settles it ('captured') so it never blocks the all-captured fulfillment gate.
  amount_cents int not null check (amount_cents >= 0),
  stripe_payment_intent_id text unique,               -- set when the payer's PI is created
  order_id uuid references public.qr_orders(id),       -- stamped at fulfillment (links share → order)
  status text not null default 'pending'
    check (status in ('pending', 'authorized', 'captured', 'canceled', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cart_id, seat_id)                            -- one share per payer per cart
);
create index if not exists qr_cart_shares_cart_idx on public.qr_cart_shares(cart_id);
create index if not exists qr_cart_shares_order_idx on public.qr_cart_shares(order_id); -- FK cover (advisor 0001)

alter table public.qr_cart_shares enable row level security;
-- Members of the cart's session may READ the shares (the live "X of $Y paid" board); ALL writes flow
-- through service-role Server Actions / the webhook (no client write policy — default-deny).
create policy qr_share_read on public.qr_cart_shares for select to authenticated using (
  exists (select 1 from public.qr_carts c where c.id = qr_cart_shares.cart_id and public.is_member(c.session_id)));
-- Match the sibling lockdown (qr_carts/qr_cart_items): keep the table out of the ANON GraphQL schema
-- (advisor 0026). RLS already denies anon every row (the policy is `to authenticated`), but revoking the
-- default anon SELECT also makes the table undiscoverable before sign-in — diners are `authenticated`
-- (anonymous-auth), so the board read is unaffected.
revoke select on public.qr_cart_shares from anon;

-- ============ realtime (live settlement board) ============
-- Members watch each share flip pending→authorized→captured live, like the cart lines (P3.2). Auth is
-- the member-gated SELECT RLS above (Realtime enforces it per-subscriber). FULL replica identity so a
-- `cart_id=eq.<id>` filter matches UPDATEs/DELETEs carrying the old row. (Publication membership +
-- replica identity don't appear in the generated types → no types-fresh drift.)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'qr_cart_shares'
    ) then
      alter publication supabase_realtime add table public.qr_cart_shares;
    end if;
  end if;
end $$;
alter table public.qr_cart_shares replica identity full;

-- ============ idempotent split fulfillment ============
-- Called by the webhook ONCE all shares are captured. Reconciles Σ(captured share amounts) against the
-- expected grand total (= cart total + Σ tips), snapshots the single order from the SUMMED share
-- breakdown, stamps order_id onto the shares, and flips the cart paid. Idempotent: the cart open→paid
-- flip is the claim — a redelivery finds the cart already paid and returns the existing order. Refuses
-- to fulfill a PARTIAL settlement (any share not 'captured') — defense in depth behind the webhook's
-- all-authorized gate, so a bug can't snapshot a half-paid order.
--
-- INVARIANT the webhook MUST honor: `amount_cents` on each captured share equals the amount actually
-- captured. Our flow captures the FULL authorized amount per PI (no partial capture), so target ==
-- captured; if a partial-capture path is ever added, the webhook must update `amount_cents` to the
-- captured value BEFORE calling this, or the order total/tax breakdown would reflect intent, not money.
create function mms_fulfill_split_order(p_cart_id uuid, p_expected_total_cents integer)
  returns uuid language plpgsql security definer set search_path = '' as $$
declare v_order uuid; v_session uuid; v_sum integer; v_open integer;
begin
  select session_id into v_session from public.qr_carts where id = p_cart_id;

  -- Every share must be captured (none pending/authorized/failed) before the order can exist.
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

  -- Atomic idempotency claim: only the first call flips the cart; a redelivery returns the prior order.
  -- (Race-safe: Postgres row-locks the cart, so a concurrent redelivery blocks then re-evaluates against
  -- the committed 'paid' row, finds 0 rows, and takes the branch below.)
  update public.qr_carts set status = 'paid' where id = p_cart_id and status = 'open';
  if not found then
    -- Couldn't claim the cart. Either already fulfilled (return the stamped order — idempotent) OR the
    -- cart is in a non-payable state (e.g. 'cancelled' after an abandon). Returning NULL silently would
    -- HIDE a captured-but-no-order (money taken, settlement aborted), so fail loudly when no order
    -- exists. (The cancel/abandon chunk must make capture-after-cancel impossible in the first place.)
    select order_id into v_order from public.qr_cart_shares
      where cart_id = p_cart_id and order_id is not null limit 1;
    if v_order is null then
      raise exception 'split fulfillment: cart % not open and no order stamped (status conflict)', p_cart_id;
    end if;
    return v_order;
  end if;

  -- One order from the SUMMED share breakdown (the parts reconcile to the cart grand total by
  -- construction). No single stripe_payment_intent_id — the N PIs live on the shares (order_id links).
  insert into public.qr_orders (session_id, subtotal_cents, discount_cents, service_charge_cents,
                         tax_cents, tip_cents, total_cents, stripe_payment_intent_id, status)
    select v_session, sum(subtotal_cents), sum(discount_cents), sum(service_charge_cents),
           sum(tax_cents), sum(tip_cents), sum(amount_cents), null, 'paid'
    from public.qr_cart_shares where cart_id = p_cart_id and status = 'captured'
    returning id into v_order;

  insert into public.qr_order_items (order_id, menu_item_id, name, qty, modifiers, unit_price_cents, tax_cents)
    select v_order, ci.menu_item_id, ci.name, ci.qty, ci.modifiers, ci.unit_price_cents, ci.tax_cents
    from public.qr_cart_items ci where ci.cart_id = p_cart_id;

  update public.qr_cart_shares set order_id = v_order, updated_at = now()
    where cart_id = p_cart_id and status = 'captured';
  return v_order;
end; $$;

-- EXECUTE lockdown (advisors 0028/0029): service-role only — no client calls it via /rest/v1/rpc.
revoke all on function mms_fulfill_split_order(uuid, integer) from public, anon, authenticated;
grant execute on function mms_fulfill_split_order(uuid, integer) to service_role;
