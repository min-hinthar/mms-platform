-- M109 — the table merge must refuse two tables of different KINDS, in the database.
--
-- Found by M100's adversarial pass, which is fitting: this is M100's exact defect shape one function
-- over. `mms_merge_table_orders` re-parents a source cart's lines into a target cart keeping
-- `fulfillment` VERBATIM, and its body contains no reference to `mode` at all (measured against the
-- live function: `prosrc` does not mention it). The rule that a pickup table cannot be merged into a
-- dine-in one lives at `floor.ts:666-667` — "Only tables of the same kind can be merged." — a
-- CLIENT-SIDE check in front of a service_role RPC.
--
-- ── What it costs today, stated at its real size ────────────────────────────────────────────────
--
-- Materiality is BELOW M100's, and that is why M109 was filed rather than folded into it.
-- `mergeTables` is staff-gated and service-role-only, so it is not a public POST a diner can forge,
-- and M97's fold predicate already refuses to fold two lines whose tags differ — a `togo` line
-- arriving from a pickup table cannot silently join a `dinein` line's qty.
--
-- What is NOT covered by that, and is the actual damage: the fold refusing simply means the line
-- RE-PARENTS instead (`if not v_folded then …`), landing on the target cart as its own row. So a
-- pickup order's lines end up on a dine-in table's tab, and the merge tail then CANCELS the source
-- cart and CLOSES the source session — a pickup guest's session is gone and their food is on
-- somebody's table. The tag survives the move, so `mms_set_line_fulfillment` will now accept a flip
-- to `dinein` (M100's gate reads the TARGET session, which really is dine-in) and re-tax the line;
-- and the to-go routing that `mms_init_togo_status` stamps no longer matches the table it sits on.
--
-- ── Why the fix is a gate and not a fold predicate ──────────────────────────────────────────────
--
-- M96, M97 and M98 each narrowed the FOLD's identity key, because each was about two lines that
-- should not have become one. This is not that. Two tables of different kinds should not be merged
-- AT ALL — there is no per-line outcome that is correct — so it belongs with the other whole-merge
-- preconditions (`both carts open and their tables active`, `no secured tab`), which raise and roll
-- the whole thing back. Nothing about the fold's predicate list changes here, so the anti-degeneracy
-- guard copied into `m96/m97/m98_*_test.sql` does NOT go stale with this migration.
--
-- ── `=`, and the nullability argument is a THIRD one ────────────────────────────────────────────
--
-- `mode text not null check (mode in ('dinein','scango','pickup'))` since `create table`
-- (`20260618000000_qr_platform_init.sql:117`) — no default, no ALTER in the tree has touched it —
-- and `qr_carts.session_id uuid not null references table_sessions(id)` (line 138), so a cart always
-- has exactly one session and that session always has a mode. Plain `=`.
--
-- Do not copy either neighbouring justification: `added_by` needs `is not distinct from` because it
-- IS nullable; `fulfillment` takes `=` because it is not-null WITH a default and a backfill (which
-- is what made it safe to add to a populated table); `unit_price_cents` takes `=` because it has
-- never admitted a null. This column is the fourth story — not-null from creation AND reached
-- through a not-null FK, so the null cannot enter from either side. Four adjacent predicates, four
-- different nullability arguments; that is the copy-paste hazard M97's and M98's headers each
-- flagged, and it does not get easier one row down.
--
-- ── The null branch below is belt, and it is deliberate that it fails CLOSED ────────────────────
--
-- `select … into` sets its target to NULL when no row matches — the plpgsql behaviour, not a value
-- read from the column. Both carts are proven to exist by the open/active gate directly above (its
-- count of 2 requires both), so neither read can miss today. The `is null` test is there so that if
-- that gate is ever reordered or relaxed, an unreadable mode REFUSES the merge rather than passing
-- it: `null <> null` is null, which `if` treats as false, so without the explicit test the guard
-- would silently admit exactly the case it cannot evaluate.
--
-- ── Why the modes are read WITHOUT a lock, which was the other way round first ─────────────────
--
-- No writer of `table_sessions.mode` exists. Every `.update()` on that table across `apps` +
-- `packages` assigns only `status`, `expires_at` or `host_seat` (measured), and no migration assigns
-- `mode` outside an INSERT; `qr_carts.session_id` is never reassigned either, so the row read here is
-- the row the cart had when the lock above was taken. An unlocked read is therefore exactly as good
-- as a locked one for this column. That is a caller CONVENTION rather than a database guarantee
-- (unlike `added_by`, which M96 could lean on because a trigger makes it immutable), so it is stated
-- here to be re-checked the day someone adds a `mode` writer.
--
-- This function first shipped with `perform 1 from public.table_sessions … order by s.id for update`
-- in front of these reads, and it was REMOVED before merge. The reasoning is worth keeping, because
-- the lock looked free:
--
--   · It bought nothing for `mode` (no writer), so its real justification was `status` one column
--     over — the open/active gate above reads `s.status <> 'closed'` UNLOCKED, and `closeTable`
--     (`floor.ts:493-494`) commits a bare `update table_sessions set status = 'closed'` as its own
--     autocommit statement, so a table cleared between that gate and the tail lands the merge on a
--     closed session. That is a real defect. It is also a DIFFERENT defect from the one M109 is about.
--   · And the lock is not free. `explain` on that statement is `LockRows → Sort (Sort Key: s.id)`,
--     while `mms_sweep_expired_sessions` (pg_cron, every 15 min) is `Update → Seq Scan` — physical
--     order. Two orders over the same rows is a deadlock path, and it does not exist today only
--     because the merge tail locks exactly ONE session row: a single-row lock cannot hold A while
--     waiting for B. Taking two would have introduced it.
--
-- So the `status` race keeps its own row (OPEN-ITEMS M118) rather than a half-fix here, and whoever
-- takes it inherits the constraint: any lock added must not oppose the sweeper's scan order, and it
-- needs M102's two-session harness to prove, because no single-session test can stage the interleave.
--
-- Restated from `20260822000000_m98_merge_matches_price.sql` — the FOURTEENTH definition of this
-- function (measured: `grep -rEoh "create or replace function[[:space:]]+(public\.)?mms_merge_table_orders" supabase/migrations/*.sql | wc -l`
-- → 13 before this one, counting the four that omit the `public.` prefix). Two declarations and one
-- block differ; the fold, its guarded delete, the re-parent and the tail are byte-identical. Diff the
-- bodies to confirm.

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
