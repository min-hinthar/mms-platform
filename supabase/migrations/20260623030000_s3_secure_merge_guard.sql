-- 20260623030000_s3_secure_merge_guard.sql — S3.2 follow-up [adversarial MAJOR 1]: refuse merging a
-- SECURE tab. The saved-card sidecar (mms_tab_secure) is keyed by cart_id, and a merge CANCELS the source
-- cart (no row delete → the `on delete cascade` never fires), so the card would be orphaned on a cancelled
-- cart while the target shows "no card on file" — yet the diner was told "secured." A secured tab must be
-- closed/settled on its own, never folded. Authoritative backstop; the app (mergeTables) + the floor UI
-- (hidden merge affordance + excluded secure candidates) prevent it earlier with a clean message.
-- CREATE OR REPLACE; signature unchanged (no types drift). Body = the S3.1-A1 merge + the new guard.

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
      -- No identical target line (or the merge would exceed the 99 cap) → re-parent as its own line.
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

revoke all on function mms_merge_table_orders(uuid, uuid) from public, anon, authenticated;
grant execute on function mms_merge_table_orders(uuid, uuid) to service_role;
