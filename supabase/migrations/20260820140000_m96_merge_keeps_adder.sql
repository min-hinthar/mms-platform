-- M96 — a table merge must not fold away one diner's attribution.
--
-- `mms_merge_table_orders` folds a source line into a matching target line by bumping the target's
-- qty and DELETING the source row. The match requires `t.by_seat is null` (R5c: never fold into a
-- diner's own line), and before M87 that was enough — a seatless line belonged to nobody.
--
-- M87 changed what "seatless" means: a line can now be seatless and still belong to someone. Two
-- ways in, and the FIRST is the common one:
--
--   · a STAFF-added target line (`by_seat` null from the start, so `added_by` null too) is a valid
--     fold target for a line a DINER added — on the very first merge. B's dish folds into it and B's
--     row is deleted. This one needed no prior merge at all.
--   · a line re-parented by an EARLIER merge has `by_seat = null` (the re-parent branch clears it)
--     but KEEPS its `added_by`, because the immutability trigger pins that column against every
--     update. So a twice-merged table can fold a line B added into a line A added.
--
-- Either way the source diner's row is gone and they have no record of a dish they really chose.
--
-- The fix is one predicate: fold only when the two lines share an adder. Three cases, and only the
-- middle one changes:
--
--   · both null (a staff-added line on each side) — folds, exactly as today. NOT kiosk: a kiosk
--     order carries the device's own verified anon uid as its seat (`openKioskOrder`), which the M87
--     seed trigger copies into `added_by`, so a kiosk line has an adder like any diner's.
--   · different adders — no longer folds; the source re-parents as its own line, which is what the
--     `else` branch already does for every other non-match and which the cart, the split and the
--     totals all sum per line anyway.
--   · same adder — folds, and is now provably the same person rather than coincidentally seatless.
--
-- `is not distinct from` and not `=`: two nulls must MATCH here, and `null = null` is null, which
-- would silently stop every staff line from folding and quietly double the register's line count.
--
-- ⚠️ This was filed (M96) as "justified, not fixed" on #214, on the grounds that reworking the fold
-- was a disproportionate blast radius for a silent under-count. That estimate was wrong: it is one
-- narrowing predicate, the same shape as the `by_seat is null` and `notes is null` narrowings beside
-- it, and it needs none of the surgery the deferral assumed. Recording the correction because the
-- deferral reasoning is in the registry where someone would otherwise trust it.
--
-- The function is restated from `20260716000000_w3_kitchen.sql` — its seventh definition. Two lines
-- of it differ: the predicate, and `added_by` added to the loop's `select`, without which `r.added_by`
-- would not resolve. Everything else, comments aside, is byte-identical (diff it).

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
    select id, menu_item_id, qty, state, notes, added_by,
           coalesce((select jsonb_agg(e order by e) from jsonb_array_elements_text(modifiers) e),
                    '[]'::jsonb) as modkey
    from public.qr_cart_items
    where cart_id = p_source_cart
      and state <> 'voided' and not comped         -- S2.3: never move a $0'd line's qty into the target
  loop
    -- Fold ONLY into a chargeable, same-state, UNASSIGNED, NOTE-LESS target line: same kitchen state
    -- (S6), not voided/comped (S2.3), by_seat null (R5c), and neither side carries a kitchen note (W3b —
    -- a note is per-line identity; folding would apply/erase it on units it doesn't belong to).
    -- No match → re-parent as its own null line (assignable later).
    v_match := null;
    if r.notes is null then
      select t.id, t.qty into v_match, v_match_qty
      from public.qr_cart_items t
      where t.cart_id = p_target_cart
        and t.by_seat is null
        -- M96: …and the SAME adder. `by_seat is null` no longer implies "nobody's": a line
        -- re-parented by an earlier merge is seatless but keeps its `added_by`, so without this a
        -- twice-merged table folds B's dish into A's line and deletes B's record of it.
        -- `is not distinct from` because two nulls must match — `null = null` is null, which would
        -- stop every staff-added line from folding.
        and t.added_by is not distinct from r.added_by
        and t.notes is null
        and t.state = r.state
        and t.state <> 'voided' and not t.comped
        and t.menu_item_id = r.menu_item_id
        and coalesce((select jsonb_agg(e order by e) from jsonb_array_elements_text(t.modifiers) e),
                     '[]'::jsonb) = r.modkey
      limit 1;
    end if;

    if v_match is not null and v_match_qty + r.qty <= 99 then
      update public.qr_cart_items set qty = v_match_qty + r.qty where id = v_match;
      delete from public.qr_cart_items where id = r.id;
    else
      -- Re-parent, losing the SEAT (a source seat is not a member of the target session) but NOT the
      -- adder: this update never names `added_by`, and M87's keep-trigger only fires when something
      -- tries to change it. The person who chose the dish is still that person after a merge.
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
revoke all on function public.mms_merge_table_orders(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mms_merge_table_orders(uuid, uuid) to service_role;
