-- M87 — who CHOSE the dish, not who paid for it.
--
-- Every fulfill RPC dropped the diner's identity when copying the cart into `qr_order_items`, so once
-- an order existed the only person attached to a dish was `qr_orders.earned_by` — **who PAID**.
--
-- W22e's "your usual" is built on that history, and the gap forced it to exclude dine-in entirely
-- (`.neq("fulfillment", "dinein")`): on a dine-in table the host who picks up the tab owns every
-- guest's dish, so two such visits would name a dish they never ordered — and hand a stranger's diet,
-- religion or allergy back to them as their own taste. Honest, and it cost the archetype: a solo
-- dine-in regular is exactly who the card is for, and they never saw it.
--
-- ⚠️ **`qr_cart_items.by_seat` IS NOT THE ANSWER, AND THE FIRST DRAFT OF THIS MIGRATION USED IT.**
-- It starts life as the adder's uid, but `assignLine` (`apps/qr/lib/cart.ts`) REWRITES it: the
-- split-the-bill UI on /cart assigns a line to the seat that will PAY for it. So the column carries
-- two meanings — "who added this" until someone splits, "who owes for this" afterwards — and
-- snapshotting it would credit a host who generously took a guest's dish onto her own share with that
-- guest's taste. Precisely the false-preference defect this migration exists to prevent, wearing a
-- more precise-looking label. (Codex found this on the draft; the repo's own comment calls `by_seat`
-- "provenance-only", which stopped being true when the split UI shipped.)
--
-- So M87 adds an ADDER identity that nothing may rewrite, and enforces the immutability in the
-- database rather than by convention:
--
--   · `qr_cart_items.added_by` — frozen at INSERT from whatever the inserting path put in `by_seat`,
--     and pinned against every later UPDATE by a trigger. A reassign moves `by_seat` and cannot move
--     this. A trigger rather than three restated insert RPCs because it covers EVERY insert path,
--     including the staff, kiosk and grocery ones, and any path added later.
--   · `qr_order_items.added_by` — the fulfillment snapshot of it, carried by all three fulfill RPCs.
--
-- SAFE ON EXISTING DATA. Both columns are nullable with no default and **no backfill**. Backfilling
-- `added_by := by_seat` on open carts would copy exactly the bill-allocation this is trying to avoid,
-- and an order fulfilled before this migration has no adder to recover. A null adder falls back to
-- the payer only where the pre-M87 assumption was already accepted — see `mms_usual_lines`.

-- ── 1. the columns, and the trigger that makes the adder immutable ─────────────────────────────
alter table public.qr_cart_items  add column if not exists added_by uuid;
alter table public.qr_order_items add column if not exists added_by uuid;

comment on column public.qr_cart_items.added_by is
  'M87 — the diner uid that ADDED this line, frozen at insert and immutable thereafter (see '
  'mms_freeze_added_by). Distinct from by_seat, which the split-the-bill UI rewrites to whoever will '
  'PAY for the line. Attribution reads this one; settlement reads by_seat.';
comment on column public.qr_order_items.added_by is
  'M87 — the fulfillment snapshot of qr_cart_items.added_by. Null for staff/kiosk lines with no seat '
  'and for every order fulfilled before M87. Never backfilled: a guessed adder is worse than none. '
  'Provenance only — it authorizes nothing.';

-- BEFORE INSERT: seed the adder from whatever the inserting path supplied as the seat.
-- BEFORE UPDATE: refuse to move it, silently and unconditionally. `assignLine` updates `by_seat` and
-- must not be able to drag attribution along with the bill.
create or replace function public.mms_freeze_added_by() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.added_by := coalesce(new.added_by, new.by_seat);
  else
    new.added_by := old.added_by;
  end if;
  return new;
end; $$;

drop trigger if exists qr_cart_items_freeze_added_by on public.qr_cart_items;
create trigger qr_cart_items_freeze_added_by
  before insert or update on public.qr_cart_items
  for each row execute function public.mms_freeze_added_by();

-- Supports the per-diner history read. Partial: null adders are the majority of old rows and are
-- never the target of an equality lookup.
create index if not exists qr_order_items_added_by_idx
  on public.qr_order_items(added_by) where added_by is not null;

-- ── 2. mms_fulfill_order — restated from W23d (20260819300000) ──────────────────────────────────
create or replace function public.mms_fulfill_order(
  p_cart_id uuid, p_payment_intent text, p_amount_cents integer, p_subtotal_cents integer,
  p_discount_cents integer, p_service_charge_cents integer, p_tax_cents integer, p_tip_cents integer default 0,
  p_settled_by uuid default null, p_tender text default 'card'
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_order uuid; v_total integer; v_session uuid; v_promo text;
  v_slot timestamptz; v_fire timestamptz; v_table integer; v_name text;
begin
  -- Idempotent branch FIRST (the ordering discipline): the PI id is the card-family key.
  select id into v_order from public.qr_orders where stripe_payment_intent_id = p_payment_intent;
  if v_order is not null then return v_order; end if;

  v_total := p_subtotal_cents - p_discount_cents + p_service_charge_cents + p_tax_cents + p_tip_cents;
  if v_total <> p_amount_cents then
    raise exception 'fulfillment amount mismatch: breakdown=% intent=%', v_total, p_amount_cents;
  end if;

  select c.promo_code, c.pickup_slot, c.fire_at, c.customer_name into v_promo, v_slot, v_fire, v_name
    from public.qr_carts c where c.id = p_cart_id;
  update public.qr_carts set status = 'paid'
    where id = p_cart_id and status = 'open'
    returning session_id into v_session;
  if v_session is null then
    raise exception 'cart % is not open (already settled by another tender) — refund PI %',
      p_cart_id, p_payment_intent;
  end if;

  -- K2: snapshot the session's registered table number onto the order (null for pickup/scango or an
  -- unregistered sticker) so /track + the receipt show it after the session read has expired.
  select table_number into v_table from public.table_sessions where id = v_session;

  insert into public.qr_orders (session_id, subtotal_cents, discount_cents, service_charge_cents,
                         tax_cents, tip_cents, total_cents, stripe_payment_intent_id, status,
                         pickup_slot, fire_at, cart_id, table_number, customer_name,
                         tender, settled_by, dropped_lines)
    values (v_session, p_subtotal_cents, p_discount_cents, p_service_charge_cents,
            p_tax_cents, p_tip_cents, v_total, p_payment_intent, 'paid', v_slot, v_fire, p_cart_id,
            v_table, v_name, p_tender, p_settled_by,
            public.mms_dropped_snapshot(p_cart_id, p_payment_intent))
    returning id into v_order;

  -- M87: `ci.added_by` is the ONLY change in this function.
  insert into public.qr_order_items (order_id, menu_item_id, name, qty, modifiers, modifier_option_ids, unit_price_cents, tax_cents, fulfillment, notes, added_by)
    select v_order, ci.menu_item_id, ci.name, ci.qty, ci.modifiers, ci.modifier_option_ids, ci.unit_price_cents, ci.tax_cents, ci.fulfillment, ci.notes, ci.added_by
    from public.qr_cart_items ci
    where ci.cart_id = p_cart_id and ci.state <> 'voided' and not ci.comped;

  if v_promo is not null and p_discount_cents > 0 then
    perform public.mms_promo_consume(v_promo, v_session, v_order);
  end if;

  return v_order;
end; $$;
revoke all on function public.mms_fulfill_order(uuid, text, integer, integer, integer, integer, integer, integer, uuid, text)
  from public, anon, authenticated;
grant execute on function public.mms_fulfill_order(uuid, text, integer, integer, integer, integer, integer, integer, uuid, text)
  to service_role;

-- ── 3. mms_fulfill_cash_order — restated from M3 (20260815100000) ───────────────────────────────
create or replace function public.mms_fulfill_cash_order(
  p_cart_id uuid, p_settled_by uuid, p_subtotal_cents integer, p_discount_cents integer,
  p_service_charge_cents integer, p_tax_cents integer, p_tip_cents integer default 0
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_order uuid; v_total integer; v_derived_subtotal integer; v_session uuid; v_status text; v_promo text; v_table integer; v_name text;
begin
  select id into v_order from public.qr_orders where cart_id = p_cart_id and tender = 'cash';
  if v_order is not null then return v_order; end if;

  select coalesce(sum(unit_price_cents * qty), 0) into v_derived_subtotal
    from public.qr_cart_items where cart_id = p_cart_id and state <> 'voided' and not comped;
  if v_derived_subtotal <> p_subtotal_cents then
    raise exception 'cash settle subtotal mismatch: derived=% passed=%', v_derived_subtotal, p_subtotal_cents;
  end if;

  v_total := p_subtotal_cents - p_discount_cents + p_service_charge_cents + p_tax_cents + p_tip_cents;

  select promo_code, customer_name into v_promo, v_name from public.qr_carts where id = p_cart_id;
  update public.qr_carts set status = 'paid'
    where id = p_cart_id and status = 'open'
    returning session_id into v_session;
  if v_session is null then
    select status into v_status from public.qr_carts where id = p_cart_id;
    raise exception 'cart % is not open for cash settlement (status=%)', p_cart_id, coalesce(v_status, 'missing');
  end if;

  select table_number into v_table from public.table_sessions where id = v_session; -- K2 snapshot

  insert into public.qr_orders (session_id, subtotal_cents, discount_cents, service_charge_cents,
                         tax_cents, tip_cents, total_cents, status, tender, cart_id, settled_by, table_number, customer_name)
    values (v_session, p_subtotal_cents, p_discount_cents, p_service_charge_cents,
            p_tax_cents, p_tip_cents, v_total, 'paid', 'cash', p_cart_id, p_settled_by, v_table, v_name)
    returning id into v_order;

  -- M87: `ci.added_by` is the ONLY change in this function.
  insert into public.qr_order_items (order_id, menu_item_id, name, qty, modifiers, modifier_option_ids, unit_price_cents, tax_cents, fulfillment, notes, added_by)
    select v_order, ci.menu_item_id, ci.name, ci.qty, ci.modifiers, ci.modifier_option_ids, ci.unit_price_cents, ci.tax_cents, ci.fulfillment, ci.notes, ci.added_by
    from public.qr_cart_items ci
    where ci.cart_id = p_cart_id and ci.state <> 'voided' and not ci.comped;

  if v_promo is not null and p_discount_cents > 0 then
    perform public.mms_promo_consume(v_promo, v_session, v_order);
  end if;

  return v_order;
end; $$;
revoke all on function public.mms_fulfill_cash_order(uuid, uuid, integer, integer, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.mms_fulfill_cash_order(uuid, uuid, integer, integer, integer, integer, integer)
  to service_role;

-- ── 4. mms_fulfill_split_order — restated from M3 (20260815100000) ──────────────────────────────
-- The one where the seat matters MOST: a split table is by definition several people, and the order
-- row it produces carries no single payer at all (`stripe_payment_intent_id` is null — each share has
-- its own). Before M87 a split order's dishes were attributable to nobody.
create or replace function public.mms_fulfill_split_order(p_cart_id uuid)
  returns uuid language plpgsql security definer set search_path = '' as $$
declare v_order uuid; v_session uuid; v_base_sum integer; v_captured_sum integer;
        v_open integer; v_pin integer; v_table integer; v_name text;
begin
  select session_id, customer_name, settle_expected_cents into v_session, v_name, v_pin
    from public.qr_carts where id = p_cart_id;

  -- IDEMPOTENT BRANCH FIRST. A redelivered `succeeded` event for an already-fulfilled settlement must
  -- return the stamped order before ANY guard can raise.
  if not exists (select 1 from public.qr_carts where id = p_cart_id and status = 'open') then
    select order_id into v_order from public.qr_cart_shares
      where cart_id = p_cart_id and order_id is not null limit 1;
    if v_order is null then
      raise exception 'split fulfillment: cart % not open and no order stamped (status conflict)', p_cart_id;
    end if;
    return v_order;
  end if;

  select count(*) into v_open from public.qr_cart_shares
    where cart_id = p_cart_id and status <> 'captured';
  if v_open > 0 then
    raise exception 'split fulfillment blocked: % share(s) not captured', v_open;
  end if;

  -- The REAL reconcile (M1/M25): captured BASE (amount − tip) against the pinned constant. A NULL pin
  -- is a settlement opened before W11 deployed — degrade to the old behaviour for that one window.
  -- The durable qr_refunds_needed record for a mismatch is written by the CALLER (split-settle.ts).
  select coalesce(sum(amount_cents - tip_cents), 0), coalesce(sum(amount_cents), 0)
    into v_base_sum, v_captured_sum
    from public.qr_cart_shares where cart_id = p_cart_id and status = 'captured';
  if v_pin is not null and v_base_sum <> v_pin then
    raise exception 'split fulfillment mismatch: captured base=% pinned=%', v_base_sum, v_pin;
  end if;

  update public.qr_carts set status = 'paid' where id = p_cart_id and status = 'open';
  if not found then
    -- Raced by a concurrent delivery between the branch above and this write — defer to the winner.
    select order_id into v_order from public.qr_cart_shares
      where cart_id = p_cart_id and order_id is not null limit 1;
    if v_order is null then
      raise exception 'split fulfillment: cart % not open and no order stamped (status conflict)', p_cart_id;
    end if;
    return v_order;
  end if;

  select table_number into v_table from public.table_sessions where id = v_session; -- K2 snapshot

  insert into public.qr_orders (session_id, subtotal_cents, discount_cents, service_charge_cents,
                         tax_cents, tip_cents, total_cents, stripe_payment_intent_id, status, cart_id, table_number, customer_name)
    select v_session, sum(subtotal_cents), sum(discount_cents), sum(service_charge_cents),
           sum(tax_cents), sum(tip_cents), sum(amount_cents), null, 'paid', p_cart_id, v_table, v_name
    from public.qr_cart_shares where cart_id = p_cart_id and status = 'captured'
    returning id into v_order;

  -- M87: `ci.added_by` is the ONLY change in this function.
  insert into public.qr_order_items (order_id, menu_item_id, name, qty, modifiers, modifier_option_ids, unit_price_cents, tax_cents, fulfillment, notes, added_by)
    select v_order, ci.menu_item_id, ci.name, ci.qty, ci.modifiers, ci.modifier_option_ids, ci.unit_price_cents, ci.tax_cents, ci.fulfillment, ci.notes, ci.added_by
    from public.qr_cart_items ci
    where ci.cart_id = p_cart_id and ci.state <> 'voided' and not ci.comped;

  update public.qr_cart_shares set order_id = v_order, updated_at = now()
    where cart_id = p_cart_id and status = 'captured';

  -- M29: persist WHO paid, beyond the shares' lifetime. Only real payers; `on conflict` because a
  -- raced sibling delivery of the same settlement must stay a no-op.
  insert into public.qr_order_payers (order_id, payer_uid)
    select v_order, seat_id from public.qr_cart_shares
      where cart_id = p_cart_id and status = 'captured' and stripe_payment_intent_id is not null
    on conflict (order_id, payer_uid) do nothing;

  return v_order;
end; $$;
revoke all on function public.mms_fulfill_split_order(uuid) from public, anon, authenticated;
grant execute on function public.mms_fulfill_split_order(uuid) to service_role;

-- ── 5. mms_usual_lines — the attribution predicate, stated ONCE ─────────────────────────────────
--
-- This lives in SQL rather than in the PostgREST query because the rule is a union that PostgREST
-- cannot express across an embedded table, and because a rule split across a `.or()` string and a
-- comment is a rule nobody can test. `supabase/tests/m87_order_item_seat_test.sql` pins it against a
-- real database, driven by the REAL fulfill RPCs.
--
-- The union, and why each arm is honest:
--
--   A. `oi.added_by = p_uid` — the diner ADDED this line, and nothing since could move that (the
--      cart-side trigger pins it against every UPDATE). True regardless of who paid, who the bill was
--      split onto, or how the order settled — which is what finally lets a dine-in regular be
--      recognised, and what makes a split table attributable at all (its order row has no payer).
--
--   B. `oi.added_by is null and o.earned_by = p_uid and oi.fulfillment <> 'dinein'` — the pre-M87
--      fallback, unchanged in meaning from what W22e shipped, so no existing habit stops counting on
--      the day this deploys. Both extra conditions are load-bearing: `added_by is null` because a
--      line we KNOW somebody else added must never be re-attributed to the payer, and the dine-in
--      exclusion because that is precisely the case where paying and choosing come apart.
--
-- Deliberately NOT here: the threshold, the window arithmetic, the pairing rule and the tie-break.
-- They live in `apps/qr/lib/menu/your-usual.ts`, which is pure and carries eight mutants. This
-- function is a scoped read, and its only job is to answer "which lines are honestly this person's".
create or replace function public.mms_usual_lines(p_uid uuid, p_since timestamptz)
  returns table (menu_item_id text, order_id uuid, ordered_at timestamptz)
  language sql stable security definer set search_path = '' as $$
  select oi.menu_item_id, oi.order_id, o.created_at
  from public.qr_order_items oi
  join public.qr_orders o on o.id = oi.order_id
  where o.status = 'paid'
    and o.created_at >= p_since
    -- W23b: status stays 'paid' for a PARTIAL refund, so a dish sent back is excluded by the line's
    -- own ledger, never by the order's status.
    and coalesce(oi.refunded_cents, 0) = 0
    and (
      oi.added_by = p_uid
      or (oi.added_by is null and o.earned_by = p_uid and oi.fulfillment <> 'dinein')
    )
  -- ORDER + LIMIT because PostgREST truncates a stored-procedure result at `max_rows` (1000 in
  -- `supabase/config.toml`) and would otherwise hand back an ARBITRARY subset — which would make the
  -- caller's counts, recency tie-break and pair detection unstable rather than merely capped. Newest
  -- first, so a truncated answer is the most recent 500 days-worth rather than a random slice, and the
  -- bound sits BELOW max_rows so the truncation is ours and deterministic. One diner's 90 days is
  -- nowhere near this; it is a ceiling, not a working limit. (Codex round 1, P2.)
  order by o.created_at desc
  limit 500
$$;
-- Not diner-callable: it takes a uid, so an `authenticated` grant would make it an endpoint for
-- reading any stranger's history. The caller is an internal server module that passes the
-- SSR-verified uid and never accepts one from a request.
revoke all on function public.mms_usual_lines(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.mms_usual_lines(uuid, timestamptz) to service_role;
