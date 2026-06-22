-- 20260622070000_merge_void_guard.sql — S2.3 follow-on: don't let a one-tap merge re-charge a voided
-- line or give away an active one.
--
-- The gap (surfaced by S2.3's pre-merge review): mms_merge_table_orders consolidates source→target lines
-- by (menu_item_id, modifier set) IGNORING state/comped. Before S2.3 no open-cart line was ever
-- voided/comped, so this was inert; now it's reachable:
--   • a VOIDED source line folding its qty into an ACTIVE target line resurrects the voided value as a
--     charge (the target stays active → settle charges the merged qty);
--   • an ACTIVE source line folding into a COMPED/VOIDED target inherits the $0/removed flag → a giveaway.
-- Fix: the chargeable predicate (`state <> 'voided' and not comped`) on BOTH scans — skip voided/comped
-- SOURCE lines (they stay on the source cart, which this fn cancels, so they're abandoned with the closed
-- table; the mms_approvals audit persists), and never MATCH into a voided/comped TARGET (an active source
-- line re-parents as its own active line instead of folding into a $0/removed one).
--
-- Signature unchanged (no types drift); body restated in full from 20260622020000 + the two predicates.
-- Re-runnable (create-or-replace); grant reasserted for parity.
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
    from public.qr_cart_items
    where cart_id = p_source_cart and state <> 'voided' and not comped  -- S2.3: skip removed/comped lines
  loop
    select t.id, t.qty into v_match, v_match_qty
    from public.qr_cart_items t
    where t.cart_id = p_target_cart
      and t.menu_item_id = r.menu_item_id
      and t.state <> 'voided' and not t.comped                          -- S2.3: never fold into a $0 line
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

revoke all on function public.mms_merge_table_orders(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mms_merge_table_orders(uuid, uuid) to service_role;
