-- M98 — the table-merge fold must match on `unit_price_cents` too.
--
-- The PRICE hole in the fold's identity key, the one M97's registry row explicitly left open.
-- `mms_merge_table_orders` matches on seat, adder (M96), tag (M97), state, notes, item and modifiers
-- — but not on PRICE.
--
-- ⚠️ An earlier draft of this header called it the LAST hole. That is refuted twice over (adversarial
-- review): `modifier_option_ids` is still unmatched — the fold keys on the display-LABEL array, which
-- is exactly the lossiness M3 was created to fix and which M3's own header names ("the SQL fold key
-- rides display text") — and the same price hole exists on the ordinary ADD path, where it needs one
-- cart and one diner rather than two active sessions. Filed as M103 and M104 rather than claimed
-- closed. Closing one hole is not closing the last one, and saying so invites the next reader to
-- stop looking. It bumps the target's qty and DELETES the source row, so the source's units
-- silently adopt the TARGET's price snapshot.
--
-- ── Why two carts hold the same dish at two prices ──────────────────────────────────────────────
--
-- `setMenuPrice` writes `menu_items.base_price_cents` LIVE, and its own header says what that means:
-- "Lines ALREADY in a cart keep the price they were quoted … nothing here touches `qr_cart_items`."
-- A cart line is an insert-time snapshot. Two carts open across a price edit therefore hold the same
-- dish at two prices, and the merge charges every unit at whichever one the server happened to pick
-- as the target. The price editor is a floor surface, sitting beside the 86 button.
--
-- ── This is worse than M97, and the registry understated it ─────────────────────────────────────
--
-- Error = srcQty × (targetPrice − sourcePrice) on the SUBTOTAL, plus 10.5% tax on that, plus the tip
-- rate riding the corrupted net. M97 was capped at 10.5% of one line and only bit `cold_food` /
-- `beverage_cold` — a hot dish's tag flip cost nothing. This is uncapped, multiplies by qty (to 98),
-- and applies to every category. On the real applied Balachaung change ($3.00 → $10.00), one unit
-- each side is +773¢ or −774¢ — and WHICH depends only on which cart the server picked as the
-- target, so there is no safe merge ordering. Break-even against M97's worst case is a price edit of
-- about $1.33.
--
-- Nothing downstream notices, for the reason M97's header already gives: `create-intent` and the
-- webhook reconcile both call `getCartTotals` on the same corrupted rows, so they agree, and
-- `mms_fulfill_order`'s assert checks a passed breakdown's internal consistency, never re-deriving.
-- The wrong price then freezes into `qr_order_items` verbatim.
--
-- ── `=` and NOT `is not distinct from` — right operator, DIFFERENT reason ────────────────────────
--
-- `unit_price_cents int not null` since `create table` (`20260618000000_qr_platform_init.sql`), with
-- NO default and no `alter` in the tree has ever touched it. Both operands always exist.
--
-- Do not copy M97's justification one row down: `fulfillment` is not-null WITH a default AND a
-- backfill, which is what made it safe to add to a populated table. This column has never admitted a
-- null at all. Same operator, different argument — and two rows above sits `added_by`, which needs
-- `is not distinct from` precisely because it IS nullable. Three adjacent predicates, three
-- different nullability stories; that is the copy-paste hazard this block exists to defuse.
--
-- ── Reachability, stated honestly ───────────────────────────────────────────────────────────────
--
-- Nothing in production can hit this today: a probe found 0 `table_sessions` that are not closed, so
-- every merge raises at the "both tables still active" gate before reaching the loop. That is a
-- pre-launch fact, not a safety property — both preconditions are by-construction (staff-rung lines
-- are seatless by design; the price editor guarantees divergence by design), and prod already holds
-- the SHAPE: several menu items sit at two distinct `unit_price_cents` across existing cart lines.
-- This is a correctness tightening on a path nothing currently reaches, not an incident.
--
-- ── The guarded delete gets it too, and the reason is NOT the `qty` reason ───────────────────────
--
-- M97's guard shipped missing `qty` and that was a HIGH, so this is answered rather than assumed.
-- `unit_price_cents` is mutable in principle: exactly one UPDATE in the whole schema assigns it
-- (`mms_set_line_fulfillment`, in `20260815200000_w16a_mode_prices_tax.sql`), and it is closed today
-- only by two accidents — that function returns early on a no-op flip, and its sole live caller
-- (`cart.ts`) omits the price argument entirely. Both are CALLER CONVENTIONS, not database
-- guarantees; the parameter still exists and is still granted to `service_role`.
--
-- The counter-argument, stated because it is the honest one: unlike `qty`, the fold does no
-- ARITHMETIC on price — the target's price simply wins — so omitting it yields "the fold decided
-- eligibility on a stale price", the same class as `fulfillment`, not the unit-destroying class
-- `qty` was in. It is included anyway because a guard that re-asserts five of six mutable columns is
-- the same shape of mistake, and because leaning on `fulfillment` to cover it transitively is
-- right-answer-wrong-reason — exactly what M97 spent a header block retracting.
--
-- ⚠️ Reasoned-correct, UNPROVEN: no single-session SQL test can make that branch fail (M102).
--
-- Restated from `20260821000000_m97_merge_matches_fulfillment.sql` — the THIRTEENTH definition of
-- this function (measured: `grep -rEc "create or replace function[[:space:]]+(public\.)?mms_merge_table_orders"`,
-- counting the four that omit the `public.` prefix — the miscount M97's header corrected). Three
-- lines differ: `unit_price_cents` added to the loop's select, the match predicate, and the delete's
-- re-assertion. Diff the bodies to confirm.

create or replace function public.mms_merge_table_orders(p_source_cart uuid, p_target_cart uuid)
  returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_src_session uuid;
  v_moved integer := 0;
  r record;
  v_match uuid;
  v_match_qty integer;
  v_folded boolean;      -- did the fold actually land? (not "was a match found")
  v_moved_qty integer;   -- what a re-parent ACTUALLY moved, read back from the row
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
    select id, menu_item_id, qty, state, notes, added_by, fulfillment, unit_price_cents,
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
    v_folded := false;
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
        -- M98: …and the same PRICE. A line quoted at $3.00 must not be charged at $10.00 because a
        -- manager edited the menu between the two carts opening. Plain `=` — see the header: this
        -- column is `not null` with no default and never admitted a null, which is a DIFFERENT
        -- argument from the `fulfillment` line above and the opposite of the `added_by` line above
        -- that.
        and t.unit_price_cents = r.unit_price_cents
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
          and unit_price_cents = r.unit_price_cents   -- M98; see the header for why this differs
                                                     -- from the `qty` case it sits beside
          and notes is null
          and not comped;
      if found then
        update public.qr_cart_items set qty = v_match_qty + r.qty where id = v_match;
        -- Exact, not optimistic: the delete just re-asserted `qty = r.qty`, so r.qty IS current.
        v_moved := v_moved + r.qty;
        v_folded := true;
      end if;
    end if;

    if not v_folded then
      -- Re-parent, losing the SEAT (a source seat is not a member of the target session) but NOT the
      -- adder: this update never names `added_by`, and M87's keep-trigger only fires when something
      -- tries to change it. The person who chose the dish is still that person after a merge.
      --
      -- ⚠️ ELIGIBILITY IS RE-ASSERTED HERE TOO (Codex round 2, P2). The loop selected only chargeable
      -- lines (`state <> 'voided' and not comped`, S2.3), but that was a snapshot: `mms_void_line` can
      -- void or comp this row afterwards, and an unconditional re-parent would then carry a $0'd line
      -- into the target — contradicting the very invariant the loop's WHERE states, and stranding the
      -- accepted void audit on a cart that is about to be cancelled. A row that became ineligible is
      -- LEFT ON THE SOURCE, where its own audit already lives. This branch is now reached both by a
      -- no-match and by a refused delete, so guarding it once covers both.
      --
      -- And `v_moved` counts what MOVED, not what the snapshot said (Codex round 2, P3): a concurrent
      -- `+` makes the guarded delete refuse, the row re-parents at its CURRENT qty of 2, and adding
      -- the stale 1 would hand `mergeTables` an audit number that never happened. Read it back.
      update public.qr_cart_items
        set cart_id = p_target_cart, by_seat = null
        where id = r.id and state <> 'voided' and not comped
        returning qty into v_moved_qty;
      if found then v_moved := v_moved + v_moved_qty; end if;
    end if;
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
