-- 20260623010000_s3_tab_followups.sql — S3.1 post-merge adversarial follow-ups (docs/S3_DESIGN.md).
-- A1 [data-integrity]: mms_merge_table_orders ignored the new tab columns, so folding a table that had an
-- open trust tab into another silently dropped the tab (the floor stopped showing "Tab", and the S3.3
-- ceiling/nudge — which gate on tab_type — would no longer fire). Carry the tab forward on a fold.
-- (A2 — refuse open mid-payment — is enforced in the app layer (lib/tabs.ts), reusing the canonical
-- paymentInFlightReason mutex, to avoid a second copy of the lock TTLs drifting in SQL.)
-- CREATE OR REPLACE only; the merge signature is unchanged (no types drift).

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

  -- S3.1 follow-up [A1]: carry a trust tab forward. A tab opened on the SOURCE must not vanish when its
  -- lines move to the TARGET. Inherit only UP — never downgrade a target 'secure' tab (S3.2) — take the
  -- earliest open time, and keep an opener (prefer the target's) for provenance. Only when the source had
  -- a tab; a 'none' source leaves the target's own tab state untouched. Secure card tokens live on the
  -- source cart and don't transfer, so a (future) secure source folds in as a trust tab on the target.
  update public.qr_carts tgt
    set tab_type = case when tgt.tab_type = 'secure' then 'secure' else 'trust' end,
        tab_opened_at = least(coalesce(tgt.tab_opened_at, src.tab_opened_at), src.tab_opened_at),
        tab_opened_by = coalesce(tgt.tab_opened_by, src.tab_opened_by)
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
