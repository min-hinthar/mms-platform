-- M97 — the table-merge fold must match on `fulfillment` too.
--
-- `mms_merge_table_orders` folds a source line into a matching target line by bumping the target's
-- qty and DELETING the source row. The match tests state, notes, `by_seat`, `added_by` (M96), the
-- menu item and the modifier key — but NOT `fulfillment`, while `insertOrIncLine` refuses exactly
-- that fold on the client side (`.eq("fulfillment", …)`: "a for-here add must NOT merge into a to-go
-- line (different routing/tax)"). `mergeTables` blocks cross-SESSION-mode merges, which is a
-- different thing entirely: two dine-in tables are always eligible, and either one's lines may
-- carry any tag.
--
-- ── This is a wrong charged amount, not only a wrong kitchen route ──────────────────────────────
--
-- `getCartTotals` reads a line's stored `tax_cents` ONLY as a boolean taxable-or-not flag and taxes
-- the full `unit_price_cents * qty` — `apps/qr/lib/tax.ts` says so in its own header, and
-- `totals-math.ts` sums `unit_price_cents * qty where tax_cents > 0`. Cold food and cold beverages
-- are taxable dine-in and exempt to-go (CDTFA Reg 1603). The fold deletes the source row, so its
-- units inherit the TARGET's tag and the TARGET's tax_cents wholesale, and nothing recomputes:
--
--   · to-go folds into dine-in  → both units taxable   → the guest is OVER-CHARGED.
--   · dine-in folds into to-go  → neither taxable      → sales tax is NEVER COLLECTED.
--
-- On a $14.00 cold-food line that is 147¢ in each direction. Nothing downstream notices, because the
-- PaymentIntent amount and the webhook reconcile are both derived from the same corrupted rows and
-- therefore agree — `mms_fulfill_order`'s amount-mismatch assert never fires — and the tag is then
-- copied verbatim into `qr_order_items`, so the mis-tag is permanent through receipt, email and
-- /track. Routing goes with it: a to-go unit re-tagged dine-in fires on the table's next send
-- instead of at checkout and loses its bagging chip, so nobody bags it and nobody calls it.
--
-- ── `=` and NOT `is not distinct from` ──────────────────────────────────────────────────────────
--
-- `fulfillment` is `not null default 'dinein' check (fulfillment in ('dinein','togo','grocery'))`
-- with a backfill (`20260623100000_s4_unified_basket.sql`), so both operands always exist and plain
-- equality is right — matching `t.state = r.state` and `t.menu_item_id = r.menu_item_id` beside it.
-- The line directly ABOVE it needs `is not distinct from` for the opposite reason (`added_by` is
-- nullable and was never backfilled, so two staff lines must match as two nulls). Reading the two
-- together invites copying the operator down; they are different on purpose. No test can tell the
-- two operators apart here, and `m97_merge_matches_fulfillment_test.sql` says so rather than
-- shipping a case that pretends otherwise.
--
-- ── Scope, stated honestly ──────────────────────────────────────────────────────────────────────
--
-- The live collision is `dinein ⇄ togo` only. A grocery line cannot reach the fold at all, on ONE
-- ground: its `menu_item_id` is a BARCODE and a food line's is a `menu_items` uuid, so
-- `t.menu_item_id = r.menu_item_id` already separates them. (An earlier draft offered a second
-- ground — "a grocery line carries a real `by_seat` so it can never be a fold target" — which is
-- FALSE, and adversarial review caught it: the re-parent branch below NULLS `by_seat`, so an
-- already-re-parented grocery line is seatless and is a perfectly good target. The conclusion stands
-- on the item-id half alone; the discarded half is recorded because a wrong reason for a right
-- answer is how the answer later gets overturned.) The predicate covers all three tags anyway,
-- because naming the column is cheaper than a comment explaining which values matter this quarter.
--
-- ⚠️ CORRECTION to a merged migration. `20260820140000_m96_merge_keeps_adder.sql` calls itself "its
-- seventh definition". That count was measured with a grep requiring the `public.` prefix, and FOUR
-- of the definitions omit it (`20260621160000`, `20260623010000`, `20260623030000`, `20260629120000`)
-- — the real count there was eleven, and this is the TWELFTH. The M96 adversarial review "verified"
-- the seven by re-running the same pattern out of the same file, so two independent measurements
-- shared one blind spot. The applied migration is left untouched; the correction lives here and in
-- docs/OPEN-ITEMS.md.
--
-- Restated from `20260820140000_m96_merge_keeps_adder.sql`. Three things differ: `fulfillment` added
-- to the loop's `select` (without which `r.fulfillment` will not resolve), the predicate itself, and
-- the concurrency guard described above (a `for update` on the match query plus a guarded delete).
-- Diff the two bodies to confirm — the guard was added in review, not in the first draft.

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
    select id, menu_item_id, qty, state, notes, added_by, fulfillment,
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
        -- M97: …and the same TAG. `insertOrIncLine` has always refused this fold; the merge path
        -- never learned it. Plain `=` — see the header: `fulfillment` is `not null`, unlike the
        -- `added_by` line directly above, which is why the two operators differ by one row.
        and t.fulfillment = r.fulfillment
        and t.notes is null
        and t.state = r.state
        and t.state <> 'voided' and not t.comped
        and t.menu_item_id = r.menu_item_id
        and coalesce((select jsonb_agg(e order by e) from jsonb_array_elements_text(t.modifiers) e),
                     '[]'::jsonb) = r.modkey
      limit 1
      for update;   -- M97/Codex-P2: hold the row we are about to bump (see the note below)
    end if;

    if v_match is not null and v_match_qty + r.qty <= 99 then
      -- M97 (Codex round 1, P2 — real, and specific to THIS change). The cursor above runs on a READ
      -- COMMITTED snapshot taken when the loop opened, and `fulfillment` is MUTABLE: a diner can tap
      -- For-here/To-go mid-merge and `mms_set_line_fulfillment` will commit it, because that function
      -- takes no lock on `qr_carts` — it only READS `status` through an `exists`, and a reader never
      -- blocks against `for update`. So `r.fulfillment` can be stale by the time we act on it, and the
      -- fold would delete a now-dine-in row into a to-go target: exactly the wrong tax this migration
      -- exists to prevent, reintroduced through the back door.
      --
      -- M96 needed none of this because `added_by` is immutable by trigger — it CANNOT change under a
      -- cursor. Matching on a mutable column is a different problem and needs a different guarantee.
      --
      -- Both halves are closed, and neither widens the lock footprint beyond the row being written:
      --   · the TARGET is held by the `for update` on the match query above;
      --   · the SOURCE re-asserts its own identity IN THE DELETE, so a row that changed under us is
      --     simply not deleted. That is the same in-statement re-assertion `mms_set_line_fulfillment`
      --     does one function over ("Re-assert open + draft + food IN THE WRITE"), and the same rule
      --     CLAUDE.md states for every guarded mutation.
      --
      -- ⚠️ `qty` is in that list, and the first draft of this guard OMITTED it — caught by adversarial
      -- review, HIGH. It is the one re-asserted column the very next statement does ARITHMETIC on, and
      -- it is just as mutable as the tag: `mms_cart_item_inc_qty` updates `qr_cart_items` joined to
      -- `qr_carts` as a plain READER of `status`, so it too commits straight through the cart lock. A
      -- diner tapping `+` mid-merge leaves tag/state/notes/comped all unchanged, so the delete would
      -- have SUCCEEDED and the target been bumped by the stale `r.qty` — one unit silently destroyed:
      -- not charged, not cooked, no error, and the source session closes a few statements later. A
      -- guard that re-asserts four of five mutable columns is not a guard, it is a narrower race.
      --
      -- Delete FIRST and bump only if it landed: bumping first would double-count a source row the
      -- delete then refused. A refused delete falls through to the re-parent, which is always safe —
      -- the line survives as its own row and nobody's attribution or tag is lost.
      delete from public.qr_cart_items
        where id = r.id
          and fulfillment = r.fulfillment
          and state = r.state
          and qty = r.qty
          and notes is null
          and not comped;
      if found then
        update public.qr_cart_items set qty = v_match_qty + r.qty where id = v_match;
      else
        update public.qr_cart_items set cart_id = p_target_cart, by_seat = null where id = r.id;
      end if;
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
