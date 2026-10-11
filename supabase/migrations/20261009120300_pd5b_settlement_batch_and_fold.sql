-- PD5b — settlement food carries its own mark, and a merge never folds a cooking portion onto another
-- Send's card (`docs/path-design-2026-10-07/m5-kitchen-round-two.md` §H.4; OPEN-ITEMS PD5's owner
-- items, decided under the owner's delegation, 2026-10-09).
--
-- ── 1 · The settlement batch is marked (closes the guest-pay grace race and §H.3 C3) ─────────────
-- PD5 numbers a table's Sends ("Round 2") and must never number SETTLEMENT food: the unsent drafts
-- `mms_fire_pending_food` fires when a cart is paid. Until now no row said which function made a
-- batch, so the kitchen read guessed from WHEN it fired: on a guest-paid cart, a batch fired at or
-- after the order was settlement food. Two real Sends fell to that guess and lost their numbers — a
-- Send landing in the 10 s before a guest's own card payment is recorded (its `fire_at` is the grace
-- deadline, after the order), and the same before a staff SECURE-TAB close, which the webhook records
-- with `settled_by` null like a guest's payment. `settled_by` stays UNCHANGED (it drives /staff/tips
-- attribution).
--
-- The mark is the batch itself: `mms_fire_pending_food` mints its batch as a version-8 UUID, and
-- every Send path mints `gen_random_uuid()`, version 4. Why the batch, not a column:
--   · a COLUMN on `qr_cart_items` (`fired_at_settlement`) would sit beside a batch that seven other
--     writers set or clear (the Send, make-it-now, the counter fire, two undos, the merge's and the
--     no-show's reverts to draft) — every one would have to reset it, and the next fire path written
--     would have to know to. A mark that IS the batch id cannot disagree with the batch: it is minted
--     once, and every path that copies a batch (a merge re-parent, a fold, a recall) carries it;
--   · a TABLE of settlement batches would add a read to a five-second poll and a new RLS surface.
-- The version nibble of `gen_random_uuid()` is fixed at '4', so no Send can ever carry the mark: the
-- classification is positive, never a guess. The TS mirror is `isSettlementBatch`
-- (`apps/qr/lib/kitchen-rounds.ts`); `supabase/tests/pd5b_settlement_batch_and_fold_test.sql` pins this
-- half (PD5B.1–3) and `kitchen-rounds.test.ts` that one, as `tax.ts` ↔ `mms_line_tax` are pinned.
-- Batches fired before this migration carry no mark, so a table live across the deploy that had
-- settlement food earlier can read one round high until its session ends; nothing else changes.
--
-- Restated from 20260716000000_w3_kitchen.sql (the latest definition) with ONE change, the batch's
-- mint. Same signature, SECURITY DEFINER, search_path and grants.
--
-- ── 2 · The fold keeps each Send whole (§H.3 item 8) ──────────────────────────────────────────────
-- `mms_merge_table_orders` folds a source line into a matching target line (same dish, modifiers,
-- state, price, fulfillment and adder; no note, no seat). Fired and in-progress lines were included
-- and the batch was not compared, so a cooking portion moved onto ANOTHER Send's card with no bump.
-- The match now also requires the same `fire_batch` for fired and in-progress lines. Two carts never
-- share a batch, so in practice a cooking line re-parents as its own row and keeps its batch — its
-- card follows it to the target table. Drafts and served lines fold exactly as before.
--
-- Restated from 20261001000000_p2f_counter_cook_before_paid.sql (the latest definition) with TWO
-- changes: the cursor selects `fire_batch`, and the fold's match gains the PD5b term. Everything else
-- is byte-identical, including the comments M96, M97, M98, M109 and Phase 2f wrote. Same signature,
-- SECURITY DEFINER, search_path and grants. The merge mutants in scripts/verify-mode-authority.mjs
-- (M109's and Phase 2f's) and scripts/verify-counter-fire-race.mjs patch THIS file now.
--
-- No table, column, index or policy changes; no generated-types change.

-- ── 1 · mms_fire_pending_food ─────────────────────────────────────────────────────────────────
create or replace function public.mms_fire_pending_food(p_cart_id uuid) returns integer
  language plpgsql security definer set search_path = '' as $$
declare n integer;
  -- PD5b: the SETTLEMENT batch is minted as a version-8 UUID (RFC 9562's custom version): a random
  -- v4 with its version nibble (character 15) set to '8'. Every Send path mints `gen_random_uuid()`
  -- (version 4), so the kitchen read tells settlement food from a Send by the batch itself — the
  -- TS mirror is `isSettlementBatch` in `apps/qr/lib/kitchen-rounds.ts` (the header says why a mark
  -- on the batch rather than a column).
  v_batch uuid := overlay(gen_random_uuid()::text placing '8' from 15 for 1)::uuid;
begin
  update public.qr_cart_items ci
    set state = 'fired',
        fire_at = case when s.mode = 'dinein' then now()
                       else greatest(coalesce(c.fire_at, now()), now()) end,
        fire_batch = v_batch
    from public.qr_carts c
    join public.table_sessions s on s.id = c.session_id
    where ci.cart_id = p_cart_id
      and c.id = ci.cart_id
      and c.status = 'paid'                       -- fire BECAUSE settled (no-charge-no-fire)
      and ci.state = 'draft'
      and ci.fulfillment in ('dinein','togo');     -- all food; grocery is bagged, never cooked. A comped
                                                    -- line stays included — comped = $0 but still MADE.
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.mms_fire_pending_food(uuid) from public, anon, authenticated;
grant execute on function public.mms_fire_pending_food(uuid) to service_role;

-- ── 2 · mms_merge_table_orders ────────────────────────────────────────────────────────────────
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
  v_src_mode text;       -- M109
  v_tgt_mode text;       -- M109
  v_src_is_counter boolean;   -- Phase 2f · Codex r3 on #308
  v_tgt_is_counter boolean;   -- Phase 2f · Codex r3 on #308
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

  -- M109: …and both tables the same KIND. Until now this rule existed only at `floor.ts:666`, in
  -- front of a service_role RPC — the invariant asserted in one place and enforced in another, which
  -- is precisely what M100 cost one function over. Read unlocked: `mode` has no writer anywhere, and
  -- a lock here would oppose `mms_sweep_expired_sessions`'s scan order (see the header).
  select s.mode into v_src_mode from public.qr_carts c
    join public.table_sessions s on s.id = c.session_id where c.id = p_source_cart;
  select s.mode into v_tgt_mode from public.qr_carts c
    join public.table_sessions s on s.id = c.session_id where c.id = p_target_cart;
  -- The null test is BELT and fails closed on purpose — see the header. Without it `null <> null`
  -- is null, which `if` treats as false, and an unreadable mode would be admitted rather than refused.
  if v_src_mode is null or v_tgt_mode is null or v_src_mode <> v_tgt_mode then
    raise exception 'both tables must be the same kind to merge (source=% target=%)',
      p_source_cart, p_target_cart;
  end if;

  -- S3.2: never merge a secured tab (the card-on-file sidecar can't follow a cancelled source cart).
  if exists (select 1 from public.qr_carts
               where id in (p_source_cart, p_target_cart) and tab_type = 'secure') then
    raise exception 'cannot merge a secured tab (source=% target=%)', p_source_cart, p_target_cart;
  end if;

  -- Phase 2f · Codex r3 on #308 (P1): a COUNTER order in a merge, decided under this function's locks.
  -- `mergeTables` refused a counter target and a counter source with sent food from its OWN read of
  -- the lines, before this RPC — so a Send (`mms_fire_counter_cart`) committing between that read and
  -- the cart lock above re-parented unpaid, cooking food onto a non-counter cart: off the KDS (an open
  -- non-counter pickup cart does not cook) and onto another customer's bill. The rule lives HERE now.
  -- Counter = `mms_counter_no_show`'s predicate, read unlocked for the reason `mode` is above: neither
  -- column has a writer outside an INSERT, and a session lock would oppose the sweeper's order.
  -- Refusals are RETURN values, before any write: -2 = the target is a counter order (never a merge
  -- target — one customer's bag, not a table); -1 = the counter source holds SENT food.
  select s.mode = 'pickup' and s.qr_code like 'reg-%' into v_src_is_counter
    from public.qr_carts c join public.table_sessions s on s.id = c.session_id
    where c.id = p_source_cart;
  select s.mode = 'pickup' and s.qr_code like 'reg-%' into v_tgt_is_counter
    from public.qr_carts c join public.table_sessions s on s.id = c.session_id
    where c.id = p_target_cart;
  if v_tgt_is_counter then
    return -2;
  end if;
  if v_src_is_counter then
    -- Lock order: approvals before lines — `mms_counter_no_show`'s and `mms_resolve_approval`'s (the
    -- supersede below re-takes these rows). The LINES are locked too because the kitchen's own
    -- draft→fired edge (`mms_line_transition`) locks only the line: the cart lock above cannot order
    -- it, and without this a fire committing mid-decision would still re-parent due food. (One line
    -- each on purpose: verify-merge-race.mjs anchors a mutant on the fold's lone `for update;` line.)
    perform 1 from public.mms_approvals where cart_id = p_source_cart and status = 'pending' for update;
    perform 1 from public.qr_cart_items where cart_id = p_source_cart order by id for update;
    -- SENT = `mms_counter_no_show`'s exact predicate: past its grace. An in-grace line never reached
    -- the KDS and is still the sender's to undo; drafts, grocery and comped lines merge as before.
    if exists (
         select 1 from public.qr_cart_items src_ci
          where src_ci.cart_id = p_source_cart
            and src_ci.state in ('fired', 'in_progress', 'served')
            and src_ci.fulfillment <> 'grocery'
            and not src_ci.comped
            and (src_ci.fire_at is null or src_ci.fire_at <= now())) then
      return -1;
    end if;
    -- An IN-GRACE fired line passes the refusal (it never reached the KDS) — but it must not arrive on
    -- the target still 'fired' with the counter's deadline and batch: a pay-first target fires only
    -- DRAFTS once paid (`mms_fire_pending_food`), so it would skip that schedule and go live on the
    -- counter's clock — early on a slotted ticket. Back to draft, exactly as the no-show does (the
    -- undo's own edge); the lines are already locked above.
    update public.qr_cart_items set state = 'draft', fire_at = null, fire_batch = null
      where cart_id = p_source_cart and state = 'fired' and fire_at > now();
  end if;

  select session_id into v_src_session from public.qr_carts where id = p_source_cart;

  -- S5: supersede the source cart's pending approvals FIRST, so this fn and mms_resolve_approval both lock
  -- mms_approvals before qr_cart_items (same order → no deadlock). A moved line's request can't honestly
  -- resolve here; 'superseded' (not 'denied') keeps the audit truthful (re-request on the merged table).
  update public.mms_approvals
    set status = 'superseded', resolved_at = now()
    where cart_id = p_source_cart and status = 'pending';

  for r in
    select id, menu_item_id, qty, state, notes, added_by, fulfillment, unit_price_cents, fire_batch,
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
        -- PD5b: …and, for food the kitchen is COOKING, the same SEND. One Send is one kitchen card
        -- (PD5, keyed by `fire_batch`), so a fired or in-progress portion folded into another
        -- Send's line would move onto that card and cook there with no bump, and its own card would
        -- shrink or leave the board. `is not distinct from` so a batchless fired line (one fired
        -- before S2 stamped batches) still folds with another batchless one, exactly as before.
        -- Drafts and served lines fold exactly as before: no card is cooking them.
        and (r.state not in ('fired', 'in_progress') or t.fire_batch is not distinct from r.fire_batch)
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
