-- P2dd · P2cy — the cart's three line RPCs learn the two rules the app already enforces with a READ.
--
-- P2cy (blind review R7 on #305): `mms_cart_item_insert_if_open` / `mms_cart_item_inc_qty` guarded
-- only `status = 'open'`, never the table-wide SETTLE freeze (`qr_carts.settle_at`). Every caller
-- reads the freeze before writing (`assertCartMember().settling`, the staff `paymentInFlightReason`),
-- but a read is not a guard: an add that passed its read a millisecond before a settle claimed the
-- freeze still landed, rode the Terminal PaymentIntent (settleCard has no compare-and-swap) and was
-- fired after pay by `mms_fire_pending_food`. Cash and the running-bill close only survived it
-- through their own quote CAS.
--
-- P2dd (Codex round 3 on #305): `mms_cart_item_set_qty_if_open` guarded the open cart and `comped`,
-- never the line's STATE. `staffSetQty` and the diner's `setQty` both refuse a non-draft line with a
-- read first — but a Send from another device between that read and the RPC changed the quantity of
-- a line the kitchen had just been handed, so the cook's ticket and the bill disagreed.
-- `mms_cart_item_inc_qty` has the same hole on the merge branch of `insertOrIncLine`, whose sibling
-- query filters `state = 'draft'` with a read.
--
-- ## The mechanism, and why a plain predicate is not enough for the freeze
--
-- Each function now opens by taking the parent cart row `FOR SHARE`. That lock CONFLICTS with the
-- `UPDATE qr_carts SET settle_at …` every settlement claim issues (`acquireSettlement`,
-- `claimStaleSettlement`, the split door), so the two orders are total:
--   · the claim committed first → our lock waits for it, READ COMMITTED re-fetches the row, and we
--     see the fresh `settle_at` and refuse;
--   · we locked first → the claim waits until our line has COMMITTED, and the settlement's own reads
--     (the unsent gate, `getCartTotals`) run afterwards, in later statements, and see it.
-- A predicate on the INSERT's own `select … from qr_carts` would read a snapshot and lock nothing —
-- the claim could commit between our read and our commit, and the settlement's reads would miss a
-- line that then appears. `FOR SHARE` is compatible with itself, so concurrent adds to one table
-- never serialize against each other; only a settlement waits (for the length of one insert).
-- Measured, both orders and the mutant without the lock: the test file's header.
--
-- Lock ORDER is cart → line, the same order every settlement function uses (`… from qr_carts where
-- id = p_cart for update` first). The fire functions (`mms_fire_cart`, `mms_fire_pending_food`,
-- `mms_undo_fire`) write lines only and never lock the cart, so a bump waiting on a fire's line lock
-- cannot deadlock with it: the fire commits, our UPDATE re-evaluates `state = 'draft'` against the
-- new row, and the line-already-sent branch answers (below). Measured on prod 2026-09-29: the only
-- triggers on these tables are M87's two `added_by` row triggers, which write `new` only.
--
-- The freeze predicate is the app's, restated: fresh = `settle_at > now() - 10 minutes`
-- (`SETTLE_TTL_MS`, lib/lock-ttl.ts; the same interval `mms_split_*` already use in SQL). A stale
-- `settle_at` is an abandoned settlement and does not refuse — exactly as `assertCartMember` reads it.
--
-- ## What each refusal says, and why the words matter
--
--   'cart is being paid' — P0001. Raised by all three on a FRESH freeze of an OPEN cart. A raise, not
--     a null, because insert's null already means "not open" (`CartClosedError`) and set_qty's 0 is
--     read the same way; the app classifies this one as its own outcome (`CartPayingError`).
--   'line already sent' — P0001. inc_qty: the merge target stopped being a draft (a Send won the
--     race); the app falls through to INSERT a fresh draft, which is what an add after a Send is in
--     the order model. set_qty: the line is fired / in progress / served; the app says so.
-- Both raise AFTER the scan claim in the scan paths, so the claim ROLLS BACK with them — a burned
-- claim would make the offline queue's replay answer "delivered" for a scan that never landed (the
-- W7b rule). A DUPLICATE replay still returns its idempotent answer before any refusal: that scan
-- already landed on a prior attempt, and saying "being paid" would tell the queue it did not.
--
-- Signatures, return types, grants and every existing predicate are unchanged — `create or replace`,
-- no drop — so the generated types do not move and an app that predates this reads every refusal it
-- could already produce the same way it always did (the two new raises reach it only in the race
-- window its own read already closes). The insert body below the new block is M17's, verbatim.
--
-- Chained into scripts/verify-mode-authority.mjs as its LAST definition of
-- `mms_cart_item_insert_if_open` (M17's insert mutants now patch THIS file), with its own suite:
-- supabase/tests/p2dd_p2cy_line_guards_test.sql. Idempotent: re-running it is a no-op.

-- ── 1. set_qty — the draft-only guard (P2dd) and the freeze (P2cy) ─────────────────────────────
create or replace function public.mms_cart_item_set_qty_if_open(p_id uuid, p_qty integer) returns integer
  language plpgsql set search_path = '' as $$
declare n integer; v_status text; v_settle_at timestamptz; v_state text;
begin
  -- The parent cart, locked FOR SHARE (see the header). A vanished line finds no cart: 0, as ever.
  select c.status, c.settle_at into v_status, v_settle_at
    from public.qr_carts c
    where c.id = (select ci.cart_id from public.qr_cart_items ci where ci.id = p_id)
    for share;
  if v_status is distinct from 'open' then
    return 0;  -- closed / paid / gone: the existing "no longer open" contract
  end if;
  if v_settle_at is not null and v_settle_at > now() - interval '10 minutes' then
    raise exception 'cart is being paid' using errcode = 'P0001';
  end if;
  if p_qty <= 0 then
    delete from public.qr_cart_items ci
      using public.qr_carts c
      where ci.id = p_id and c.id = ci.cart_id and c.status = 'open' and not ci.comped
        and ci.state = 'draft';
  else
    update public.qr_cart_items ci set qty = p_qty
      from public.qr_carts c
      where ci.id = p_id and c.id = ci.cart_id and c.status = 'open' and not ci.comped
        and ci.state = 'draft';
  end if;
  get diagnostics n = row_count;
  if n = 0 then
    select ci.state into v_state from public.qr_cart_items ci where ci.id = p_id;
    if v_state is not null and v_state <> 'draft' then
      raise exception 'line already sent' using errcode = 'P0001';
    end if;
  end if;
  return n;  -- 0 here: a comped draft, or the line vanished between the lock and the write
end $$;
revoke all on function public.mms_cart_item_set_qty_if_open(uuid, integer) from public, anon, authenticated;
grant execute on function public.mms_cart_item_set_qty_if_open(uuid, integer) to service_role;

-- ── 2. inc_qty — the freeze (P2cy) and the draft-only merge (P2dd) ─────────────────────────────
-- Restated from 20260813210000_w7b_scan_events.sql (the live body). The bound and the claim block are
-- unchanged; the cart lock opens the function, the freeze check follows the claim, the UPDATE gains
-- `ci.state = 'draft'`, and the not-found branch names a sent line instead of passing it silently.
create or replace function public.mms_cart_item_inc_qty(p_id uuid, p_by integer default 1, p_scan_id uuid default null) returns void
  language plpgsql set search_path = '' as $$
declare v_status text; v_settle_at timestamptz; v_state text;
begin
  -- Bound the bump IN the statement (doctrine: the guard lives in SQL, not just the caller's Zod).
  if p_by is null or p_by < 1 or p_by > 99 then
    raise exception 'invalid quantity' using errcode = 'P0001';
  end if;
  -- P2cy: the parent cart, locked FOR SHARE before anything is written (see the header).
  select c.status, c.settle_at into v_status, v_settle_at
    from public.qr_carts c
    where c.id = (select ci.cart_id from public.qr_cart_items ci where ci.id = p_id)
    for share;
  -- W7b: the scan-event claim, atomic with the bump (same transaction). A duplicate replay claims
  -- nothing and returns silently — the caller reads the current lines and reports idempotent OK.
  -- NOT FOUND is ambiguous (conflict = duplicate, OR the LINE vanished = 0 source rows, nothing
  -- claimed): a vanished line must NOT read as success — the drain would dequeue a scan that never
  -- landed as "delivered" (review LOW). Distinguish and raise the same refusal the live path gives.
  if p_scan_id is not null then
    insert into public.mms_scan_events (scan_id, cart_id)
      select p_scan_id, ci.cart_id from public.qr_cart_items ci where ci.id = p_id
      on conflict (scan_id) do nothing;
    if not found then
      if exists (select 1 from public.mms_scan_events e where e.scan_id = p_scan_id) then
        return; -- duplicate replay: the write already landed on a prior attempt — idempotent no-op
      end if;
      raise exception 'cart is no longer open' using errcode = 'P0001'; -- line vanished: honest refusal
    end if;
  end if;
  -- P2cy: a fresh settlement freezes the table. AFTER the claim so a duplicate replay above still
  -- answers idempotently; the raise rolls a fresh claim back.
  if v_status = 'open' and v_settle_at is not null and v_settle_at > now() - interval '10 minutes' then
    raise exception 'cart is being paid' using errcode = 'P0001';
  end if;
  update public.qr_cart_items ci
    set qty = least(ci.qty + p_by, 99)
    from public.qr_carts c
    where ci.id = p_id and c.id = ci.cart_id and c.status = 'open' and ci.qty < 99 and not ci.comped
      and ci.state = 'draft';
  if not found then
    -- 0 rows: cart closed/gone, OR the line left 'draft' (a Send won the race), OR open-but-at-the-
    -- 99-cap, OR the line is comped (immutable). The status cannot have moved since the lock above.
    if v_status is distinct from 'open' then
      raise exception 'cart is no longer open' using errcode = 'P0001';
    end if;
    -- P2dd: a sent line is never grown. Named, so the caller inserts a fresh draft instead of
    -- reporting an add that went nowhere. A capped or comped DRAFT stays the silent no-op it was.
    select ci.state into v_state from public.qr_cart_items ci where ci.id = p_id;
    if v_state is distinct from 'draft' then
      raise exception 'line already sent' using errcode = 'P0001';
    end if;
  end if;
end $$;
revoke all on function public.mms_cart_item_inc_qty(uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.mms_cart_item_inc_qty(uuid, integer, uuid) to service_role;

-- ── 3. insert — the freeze (P2cy) ──────────────────────────────────────────────────────────────
-- Restated from 20260826000000_m17_line_tax_category.sql (the live body). Signature identical; the
-- cart lock opens it and the freeze check follows the claim. The INSERT and its M17 stamp are
-- byte-identical (scripts/verify-mode-authority.mjs patches them by exact text).
create or replace function public.mms_cart_item_insert_if_open(
  p_cart_id uuid,
  p_menu_item_id text,
  p_name text,
  p_modifiers jsonb,
  p_unit_price_cents integer,
  p_tax_cents integer,
  p_by_seat uuid,
  p_fulfillment text,
  p_notes text default null,
  p_qty integer default 1,
  p_scan_id uuid default null,
  p_option_ids jsonb default '[]'::jsonb
) returns uuid
  language plpgsql set search_path = '' as $$
declare v_id uuid; v_status text; v_settle_at timestamptz;
begin
  -- P2cy: the cart, locked FOR SHARE before anything is written (see the header).
  select c.status, c.settle_at into v_status, v_settle_at
    from public.qr_carts c where c.id = p_cart_id
    for share;
  if p_scan_id is not null then
    insert into public.mms_scan_events (scan_id, cart_id) values (p_scan_id, p_cart_id)
      on conflict (scan_id) do nothing;
    if not found then
      return '00000000-0000-0000-0000-000000000000'::uuid; -- duplicate replay: no write, idempotent OK
    end if;
  end if;
  -- P2cy: a fresh settlement freezes the table. AFTER the claim so a duplicate replay above still
  -- answers idempotently; the raise rolls a fresh claim back. Only an OPEN cart: a closed one keeps
  -- its null / raise below.
  if v_status = 'open' and v_settle_at is not null and v_settle_at > now() - interval '10 minutes' then
    raise exception 'cart is being paid' using errcode = 'P0001';
  end if;
  insert into public.qr_cart_items
    (cart_id, menu_item_id, name, qty, modifiers, modifier_option_ids, unit_price_cents, tax_cents, by_seat, fulfillment, notes,
     tax_category)
  select p_cart_id, p_menu_item_id, p_name, p_qty, p_modifiers, coalesce(p_option_ids, '[]'::jsonb),
         p_unit_price_cents, p_tax_cents, p_by_seat, p_fulfillment, p_notes,
         -- M17 — freeze the item's tax category onto the LINE, here, at the one moment it is
         -- guaranteed to exist: the caller has just priced this item off that very row. Every other
         -- fact the line needs later is already snapshotted (name, modifiers, unit_price_cents); the
         -- category was the one that stayed a live lookup, which is how a pruned catalog row could
         -- erase it. CASE, not a WHERE inside the subquery, so the ::uuid cast is never evaluated
         -- for a grocery barcode (measured: it raises 22P02).
         case when p_menu_item_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then (select mi.tax_category from public.menu_items mi where mi.id = p_menu_item_id::uuid)
              else null end
  from public.qr_carts
  where id = p_cart_id and status = 'open' and p_qty between 1 and 99
  returning id into v_id;
  if v_id is null and p_scan_id is not null then
    -- The claim above wrote in THIS transaction but the guarded insert refused (cart no longer
    -- open / qty out of range): raise so the claim ROLLS BACK. A committed claim with no write
    -- burns the id — its replay would conflict into the NIL sentinel and report "delivered" for
    -- a scan that never landed. The live path (p_scan_id null) keeps returning null — the
    -- caller's closed-cart contract is unchanged.
    raise exception 'cart is no longer open' using errcode = 'P0001';
  end if;
  return v_id;
end $$;
revoke all on function public.mms_cart_item_insert_if_open(uuid, text, text, jsonb, integer, integer, uuid, text, text, integer, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.mms_cart_item_insert_if_open(uuid, text, text, jsonb, integer, integer, uuid, text, text, integer, uuid, jsonb)
  to service_role;
