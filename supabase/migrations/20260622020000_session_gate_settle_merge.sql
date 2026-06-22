-- 20260622020000_session_gate_settle_merge.sql — S1-audit S2.
-- Session-gate the two STAFF fulfillment paths so they can't record against a CLOSED table.
--
-- The gap: the background sweeper (mms_sweep_expired_sessions, 20260621000000) sets an idle session
-- status='closed' but does NOT cancel its open cart — so an 'open' cart can outlive its session.
-- clearTable cancels the cart before closing the session, but that invariant lived in CALLER ORDERING,
-- not the RPC; the sweeper bypasses it. Without a gate, a cash settle or a one-tap merge would happily
-- record an order / re-parent lines on a swept-closed table.
--
-- Fix: fold `exists(table_sessions where id=session_id and status<>'closed')` into the atomic claim of
-- mms_fulfill_cash_order and the open-count check of mms_merge_table_orders. The CARD path
-- (mms_fulfill_order) is deliberately NOT gated: a captured Stripe charge must fulfill regardless of
-- session lifecycle (refusing it would strand money) — its guard is the cart-status claim + the
-- cross-tender check, and clearTable refuses while a card lock is in flight.
--
-- Function SIGNATURES are unchanged (no types drift); bodies restated in full (create-or-replace is a
-- full-body replace — LEARNINGS) so the gate lands without dropping the promo-consume / atomic-claim
-- work from 20260622010000. Re-runnable; grants reasserted for parity.

-- ── mms_fulfill_cash_order — session-gated atomic claim ───────────────────────────────────────────────
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
    from public.qr_cart_items where cart_id = p_cart_id;
  if v_derived_subtotal <> p_subtotal_cents then
    raise exception 'cash settle subtotal mismatch: derived=% passed=%', v_derived_subtotal, p_subtotal_cents;
  end if;

  v_total := p_subtotal_cents - p_discount_cents + p_service_charge_cents + p_tax_cents + p_tip_cents;

  select promo_code into v_promo from public.qr_carts where id = p_cart_id;
  -- Atomic claim, SESSION-GATED (S2): settle only when the cart is open AND its table session isn't closed.
  update public.qr_carts c set status = 'paid'
    where c.id = p_cart_id and c.status = 'open'
      and exists (select 1 from public.table_sessions s where s.id = c.session_id and s.status <> 'closed')
    returning c.session_id into v_session;
  if v_session is null then
    select status into v_status from public.qr_carts where id = p_cart_id;
    raise exception 'cart % not settleable (cart status=%, or its table session is closed)',
      p_cart_id, coalesce(v_status, 'missing');
  end if;

  insert into public.qr_orders (session_id, subtotal_cents, discount_cents, service_charge_cents,
                         tax_cents, tip_cents, total_cents, status, tender, cart_id, settled_by)
    values (v_session, p_subtotal_cents, p_discount_cents, p_service_charge_cents,
            p_tax_cents, p_tip_cents, v_total, 'paid', 'cash', p_cart_id, p_settled_by)
    returning id into v_order;

  insert into public.qr_order_items (order_id, menu_item_id, name, qty, modifiers, unit_price_cents, tax_cents)
    select v_order, ci.menu_item_id, ci.name, ci.qty, ci.modifiers, ci.unit_price_cents, ci.tax_cents
    from public.qr_cart_items ci where ci.cart_id = p_cart_id;

  if v_promo is not null and p_discount_cents > 0 then
    perform public.mms_promo_consume(v_promo, v_session, v_order);
  end if;

  return v_order;
end; $$;

-- ── mms_merge_table_orders — require both tables' sessions still open ──────────────────────────────────
create or replace function public.mms_merge_table_orders(p_source_cart uuid, p_target_cart uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_src_session uuid;
  v_moved integer := 0;
  r record;
  v_match uuid;
  v_match_qty integer;
begin
  if p_source_cart = p_target_cart then
    raise exception 'merge requires two different carts';
  end if;

  perform 1 from public.qr_carts where id in (p_source_cart, p_target_cart) and status = 'open'
    order by id for update;
  -- Both carts must be open AND their table sessions not closed (S2 — a swept-closed session can still
  -- carry an open cart; don't merge into/out of a closed table).
  if (select count(*) from public.qr_carts c
        where c.id in (p_source_cart, p_target_cart) and c.status = 'open'
          and exists (select 1 from public.table_sessions s
                        where s.id = c.session_id and s.status <> 'closed')) <> 2 then
    raise exception 'both carts must be open and their tables active to merge (source=% target=%)',
      p_source_cart, p_target_cart;
  end if;

  select session_id into v_src_session from public.qr_carts where id = p_source_cart;

  for r in
    select id, menu_item_id, qty,
           coalesce((select jsonb_agg(e order by e) from jsonb_array_elements_text(modifiers) e),
                    '[]'::jsonb) as modkey
    from public.qr_cart_items where cart_id = p_source_cart
  loop
    select t.id, t.qty into v_match, v_match_qty
    from public.qr_cart_items t
    where t.cart_id = p_target_cart
      and t.menu_item_id = r.menu_item_id
      and coalesce((select jsonb_agg(e order by e) from jsonb_array_elements_text(t.modifiers) e),
                   '[]'::jsonb) = r.modkey
    limit 1;

    if v_match is not null and v_match_qty + r.qty <= 99 then
      update public.qr_cart_items set qty = v_match_qty + r.qty where id = v_match;
      delete from public.qr_cart_items where id = r.id;
    else
      update public.qr_cart_items set cart_id = p_target_cart, by_seat = null where id = r.id;
    end if;
    v_moved := v_moved + r.qty;
  end loop;

  update public.qr_carts set updated_at = now() where id = p_target_cart;
  update public.qr_carts set status = 'cancelled' where id = p_source_cart;
  update public.table_sessions set status = 'closed' where id = v_src_session and status <> 'closed';

  return v_moved;
end; $$;

-- SECURITY DEFINER lockdown reasserted (parity; create-or-replace keeps grants but be explicit).
revoke all on function public.mms_fulfill_cash_order(uuid, uuid, integer, integer, integer, integer, integer)
  from public, anon, authenticated;
revoke all on function public.mms_merge_table_orders(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mms_fulfill_cash_order(uuid, uuid, integer, integer, integer, integer, integer)
  to service_role;
grant execute on function public.mms_merge_table_orders(uuid, uuid) to service_role;
