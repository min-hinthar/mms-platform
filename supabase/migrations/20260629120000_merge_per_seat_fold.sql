-- ── mms_merge_table_orders — per-seat fold (R5c) ─────────────────────────────────────────────────────
-- Context: the cart line model is now PER-SEAT (apps/qr/lib/order-lines.ts insertOrIncLine merges by
-- by_seat), so `by_seat` is part of a line's identity, not just provenance. The table-merge fold must
-- respect that boundary or it corrupts by-person settlement.
--
-- Bug before this migration: the source→target fold matched a target line by (menu_item_id + modifiers)
-- ONLY and bumped the FIRST match (`limit 1`). That first match could be a TARGET DINER's own `by_seat`
-- line, so a source diner's units would silently inherit the target diner's seat — wrong split shares.
--
-- Fix: a fold may bump ONLY an UNASSIGNED (`by_seat is null`) target line. Moved lines are already meant to
-- lose seat attribution (the re-parent branch sets `by_seat = null`), so folding only into a null target
-- keeps all moved units unassigned — never attributed to a target diner. If the only same-item/modifier
-- target line is owned by a seat, there's no null match → the source line re-parents as its own null line
-- (separate + unassigned), which the host can assign later via assignLine. Pure re-parent, no re-pricing.
--
-- This `create or replace` is rebased on the LATEST body (20260623030000_s3_secure_merge_guard) so it keeps
-- the S3.2 secure-tab refusal AND the S3.1 trust-tab carry-forward; the ONLY change is the fold-match
-- adding `and t.by_seat is null`. Function signature unchanged (returns integer) → no generated-types drift.
create or replace function mms_merge_table_orders(p_source_cart uuid, p_target_cart uuid)
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

  -- Row-lock both carts and require BOTH still open (orders by id to avoid a deadlock with a concurrent
  -- merge of the same pair in the other direction).
  perform 1 from public.qr_carts where id in (p_source_cart, p_target_cart) and status = 'open'
    order by id for update;
  if (select count(*) from public.qr_carts
        where id in (p_source_cart, p_target_cart) and status = 'open') <> 2 then
    raise exception 'both carts must be open to merge (source=% target=%)', p_source_cart, p_target_cart;
  end if;

  -- S3.2: never merge a secured tab (the card-on-file sidecar can't follow a cancelled source cart).
  if exists (select 1 from public.qr_carts
               where id in (p_source_cart, p_target_cart) and tab_type = 'secure') then
    raise exception 'cannot merge a secured tab (source=% target=%)', p_source_cart, p_target_cart;
  end if;

  select session_id into v_src_session from public.qr_carts where id = p_source_cart;

  for r in
    select id, menu_item_id, qty,
           coalesce((select jsonb_agg(e order by e) from jsonb_array_elements_text(modifiers) e),
                    '[]'::jsonb) as modkey
    from public.qr_cart_items where cart_id = p_source_cart
  loop
    -- Per-seat fold (R5c): only bump an UNASSIGNED target line so moved units stay unattributed and never
    -- inherit a target diner's by_seat (which would corrupt by-person settlement).
    select t.id, t.qty into v_match, v_match_qty
    from public.qr_cart_items t
    where t.cart_id = p_target_cart
      and t.by_seat is null
      and t.menu_item_id = r.menu_item_id
      and coalesce((select jsonb_agg(e order by e) from jsonb_array_elements_text(t.modifiers) e),
                   '[]'::jsonb) = r.modkey
    limit 1;

    if v_match is not null and v_match_qty + r.qty <= 99 then
      update public.qr_cart_items set qty = v_match_qty + r.qty where id = v_match;
      delete from public.qr_cart_items where id = r.id;
    else
      -- No identical UNASSIGNED target line (or the merge would exceed the 99 cap) → re-parent as its own
      -- line. Moved lines lose seat attribution (by_seat = null): a source seat doesn't exist in the target.
      update public.qr_cart_items set cart_id = p_target_cart, by_seat = null where id = r.id;
    end if;
    v_moved := v_moved + r.qty;
  end loop;

  -- S3.1 [A1]: carry a trust tab forward (inherit up, earliest open time; never downgrade a secure target,
  -- though a secure target is now refused above). Only when the source had a tab.
  update public.qr_carts tgt
    set tab_type = case when tgt.tab_type = 'secure' then 'secure' else 'trust' end,
        tab_opened_at = least(coalesce(tgt.tab_opened_at, src.tab_opened_at), src.tab_opened_at)
    from public.qr_carts src
    where tgt.id = p_target_cart and src.id = p_source_cart and src.tab_type <> 'none';

  -- Bump the target so floor/realtime peers re-sync; cancel the now-empty source cart + close its session.
  update public.qr_carts set updated_at = now() where id = p_target_cart;
  update public.qr_carts set status = 'cancelled' where id = p_source_cart;
  update public.table_sessions set status = 'closed' where id = v_src_session and status <> 'closed';

  return v_moved;
end; $$;

-- SECURITY DEFINER lockdown (parity with the other mms_* fns): never callable by anon/authenticated.
revoke all on function mms_merge_table_orders(uuid, uuid) from public, anon, authenticated;
grant execute on function mms_merge_table_orders(uuid, uuid) to service_role;
