-- 20260702000000_merge_void_guard_restore.sql — restore the merge fold guards lost across two rebases.
--
-- REGRESSION (money): mms_merge_table_orders silently dropped its S2.3 void/comp fold guards.
--   • 20260622070000_merge_void_guard.sql + 20260622090000_s2_audit_fixes.sql (S5/S6) added, on BOTH scans,
--     the chargeable predicate `state <> 'voided' and not comped`, the S6 same-state fold match, the
--     both-sessions-active check, and the S5 pending-approval supersede-before-loop.
--   • 20260623030000_s3_secure_merge_guard.sql restated the body to add the secure-tab refusal + trust
--     carry-forward but WITHOUT re-including those predicates.
--   • 20260629120000_merge_per_seat_fold.sql (R5c) rebased on that weakened body, adding only the
--     `by_seat is null` fold match — so the guards were never restored.
-- Net effect on the LIVE function: a merge folds a VOIDED/COMPED source line's qty into an active target
-- line (`update ... set qty = v_match_qty + r.qty` then `delete`), re-charging diners at the target for a
-- $0'd line while the mms_approvals audit row's line_id dangles; symmetrically an active source can fold
-- into a voided/comped by_seat-null target (silent giveaway), and a draft line can fold into a fired line
-- (kitchen state erased / cook qty grows). CHANGELOG 2026-06-22 documents these guards as shipped — this is
-- a doc-claims-fixed / code-lacks regression, untracked until the 2026-07 holistic audit.
--
-- FIX: restate mms_merge_table_orders as the UNION of every prior guard —
--   S3.2 secure-tab refusal + S3.1 trust carry-forward (from 20260629120000),
--   S2-audit both-sessions-active check + S5 supersede + S6 same-state fold + void/comp predicates
--   (from 20260622090000), and the R5c per-seat `by_seat is null` fold match (from 20260629120000).
-- Signature unchanged (returns integer) → no generated-types drift; pure `create or replace`.
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

  -- Row-lock both carts, ordered by id to avoid a deadlock with a concurrent reverse-direction merge.
  perform 1 from public.qr_carts where id in (p_source_cart, p_target_cart) and status = 'open'
    order by id for update;

  -- S2-audit: both carts open AND both tables still active (a closed session can't accept a fold).
  if (select count(*) from public.qr_carts c
        where c.id in (p_source_cart, p_target_cart) and c.status = 'open'
          and exists (select 1 from public.table_sessions s
                        where s.id = c.session_id and s.status <> 'closed')) <> 2 then
    raise exception 'both carts must be open and their tables active to merge (source=% target=%)',
      p_source_cart, p_target_cart;
  end if;

  -- S3.2: never merge a secured tab (the card-on-file sidecar can't follow a cancelled source cart).
  if exists (select 1 from public.qr_carts
               where id in (p_source_cart, p_target_cart) and tab_type = 'secure') then
    raise exception 'cannot merge a secured tab (source=% target=%)', p_source_cart, p_target_cart;
  end if;

  select session_id into v_src_session from public.qr_carts where id = p_source_cart;

  -- S5: supersede the source cart's pending approvals FIRST, so this fn and mms_resolve_approval both lock
  -- mms_approvals before qr_cart_items (same order → no deadlock). A moved line's request can't honestly
  -- resolve here; 'superseded' (not 'denied') keeps the audit truthful (re-request on the merged table).
  update public.mms_approvals
    set status = 'superseded', resolved_at = now()
    where cart_id = p_source_cart and status = 'pending';

  for r in
    select id, menu_item_id, qty, state,
           coalesce((select jsonb_agg(e order by e) from jsonb_array_elements_text(modifiers) e),
                    '[]'::jsonb) as modkey
    from public.qr_cart_items
    where cart_id = p_source_cart
      and state <> 'voided' and not comped         -- S2.3: never move a $0'd line's qty into the target
  loop
    -- Fold ONLY into a chargeable, same-state, UNASSIGNED target line: same kitchen state (S6, so a draft
    -- never folds into a fired line and vice-versa), not voided/comped (S2.3, so units never inherit a $0
    -- line's identity), and by_seat null (R5c, so moved units stay unattributed and never inherit a target
    -- diner's seat). No match → re-parent as its own null line (assignable later).
    select t.id, t.qty into v_match, v_match_qty
    from public.qr_cart_items t
    where t.cart_id = p_target_cart
      and t.by_seat is null
      and t.state = r.state
      and t.state <> 'voided' and not t.comped
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

  -- S3.1 [A1]: carry a trust tab forward (inherit up, earliest open time; a secure target is refused above).
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
revoke all on function public.mms_merge_table_orders(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mms_merge_table_orders(uuid, uuid) to service_role;
