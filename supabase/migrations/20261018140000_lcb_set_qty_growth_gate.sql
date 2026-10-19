-- 20261018140000_lcb_set_qty_growth_gate.sql  (#362 · Codex P2 at lib/cart.ts:240)
--
-- `mms_cart_item_set_qty_if_open` ASSIGNS an absolute quantity. The diner's `setQty` decides whether
-- that is a GROWTH (and so whether to ask the catalog — "never grow a line whose dish the kitchen can
-- no longer make", lifecycle audit out-of-stock 1) from `lineQty`, read by `assertCartItemMember`
-- BEFORE this call. A concurrent decrease in between defeats that: the line reads 5, a tablemate's
-- host steps it to 3, the diner's "−" asks for 4 — not a growth against 5, so no catalog read — and
-- this function sets 4, growing a line of a sold-out dish from 3 to 4.
--
-- The comparison has to be made against the quantity UNDER THE WRITE'S ROW LOCK. So the line is read
-- `FOR UPDATE` (after the cart's `FOR SHARE`, the lock order every settlement function uses), and
-- the decision and the write both come from that ONE locked row version: a concurrent writer has
-- either committed before the read (and its quantity is the one compared) or waits for this
-- transaction. (The first draft put the gate in the UPDATE's predicate and named the refusal from a
-- second SELECT — two READ COMMITTED snapshots: a restock or a quantity rise committing while the
-- UPDATE waited left that SELECT with nothing to name, and the function answered a silent 0, which
-- both callers read as "no longer open". The capped blind pass on #362; the two-session case is
-- scripts/verify-line-guard-race.mjs's growth races.) A growth of a dish whose catalog row is 86'd
-- or delisted is refused BEFORE any write: 'dish unavailable' (P0001), DETAIL `sold_out` | `gone` (the
-- app's `dishUnavailable` precedence: inactive is `gone`, else sold out is `sold_out`), HINT the
-- refusal's stamp — `now()`, the transaction start, so it precedes the catalog read it reports
-- (Codex P2 on #362: a sold-out mark is weighed against the cart view's `dbNow` on /menu, and a stamp
-- later than the read could outvote a fresher "available"). No extra round trip for the app.
--
-- ## What it does NOT gate
--
--   · A shrink, a removal or an unchanged quantity — they are the way OUT of a sold-out line.
--   · A line with NO catalog row (a grocery barcode, or a dish id the catalog never had): the gate
--     reads an existing `menu_items` row that says no, and nothing else. The app's own pre-read still
--     names a dish gone from the catalog on an ordinary growth; this closes only the race, and an
--     unreadable fact stays fail-open exactly as every availability pre-read is.
--   · A grocery line (`fulfillment = 'grocery'`): never a dish.
--
-- Staff share this RPC (`staffSetQty`). The staff stepper already refuses "+" on a sold-out line
-- (`StaffLineEditor`'s `soldOut`), so this makes the server agree with the control staff see; the
-- app maps the raise for both callers (lib/line-rpc-refusal.ts).
--
-- Signature, return type, grants and every existing predicate are unchanged — `create or replace`,
-- no drop — so the generated types do not move, and an app that predates this reads the new raise
-- the way it reads any unnamed RPC error (a thrown write it re-reads). The cart lock, the freeze,
-- the delete and update statements and the 'line already sent' branch are 20260929000000's,
-- verbatim; the new line lock and gate sit between the freeze and the write. A 0 is still only a
-- comped draft or a vanished line — never a refusal this function could have named.
--
-- Chained into scripts/verify-mode-authority.mjs as the LAST definition of this function (suite
-- `lcbq`; P2dd's set_qty mutants patch THIS file now), with its own suite:
-- supabase/tests/lcb_set_qty_growth_gate_test.sql. Idempotent: re-running it is a no-op.
--
-- ⚠️ OWNER-GATED: not applied to prod. One file, through the Supabase MCP `apply_migration`, on the
-- owner's go (OWNER_RULINGS_2026-10-07 #5).

create or replace function public.mms_cart_item_set_qty_if_open(p_id uuid, p_qty integer) returns integer
  language plpgsql set search_path = '' as $$
declare n integer; v_status text; v_settle_at timestamptz; v_state text; v_qty integer;
  v_comped boolean; v_why text;
begin
  -- The parent cart, locked FOR SHARE (see the header). A vanished line finds no cart: 0, as ever.
  select c.status, c.settle_at into v_status, v_settle_at
    from public.qr_carts c
    where c.id = (select ci.cart_id from public.qr_cart_items ci where ci.id = p_id)
    for share;
  if v_status is distinct from 'open' then
    return 0;  -- closed / paid / gone: the existing "no longer open" contract
  end if;
  if v_settle_at is not null and v_settle_at > now() - interval '10 minutes' then
    raise exception 'cart is being paid' using errcode = 'P0001';
  end if;
  -- The growth gate. The LINE, locked FOR UPDATE (cart → line, the lock order every settlement
  -- function uses): the decision and the write below read ONE row version, so a concurrent writer
  -- has either committed before this read (and is seen) or waits for this transaction.
  select ci.state, ci.qty, ci.comped,
         case when not mi.is_active then 'gone' when mi.is_sold_out then 'sold_out' end
    into v_state, v_qty, v_comped, v_why
    from public.qr_cart_items ci
    left join public.menu_items mi
      on mi.id::text = ci.menu_item_id and ci.fulfillment in ('dinein','togo')
    where ci.id = p_id
    for update of ci;
  if p_qty > 0 and v_state = 'draft' and not v_comped and p_qty > v_qty and v_why is not null then
    raise exception 'dish unavailable' using errcode = 'P0001', detail = v_why,
      hint = to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  end if;
  if p_qty <= 0 then
    delete from public.qr_cart_items ci
      using public.qr_carts c
      where ci.id = p_id and c.id = ci.cart_id and c.status = 'open' and not ci.comped
        and ci.state = 'draft';
  else
    update public.qr_cart_items ci set qty = p_qty
      from public.qr_carts c
      where ci.id = p_id and c.id = ci.cart_id and c.status = 'open' and not ci.comped
        and ci.state = 'draft';
  end if;
  get diagnostics n = row_count;
  if n = 0 then
    select ci.state into v_state from public.qr_cart_items ci where ci.id = p_id;
    if v_state is not null and v_state <> 'draft' then
      raise exception 'line already sent' using errcode = 'P0001';
    end if;
  end if;
  return n;  -- 0 here: a comped draft, or the line vanished between the lock and the write
end $$;
revoke all on function public.mms_cart_item_set_qty_if_open(uuid, integer) from public, anon, authenticated;
grant execute on function public.mms_cart_item_set_qty_if_open(uuid, integer) to service_role;
