-- M17 — the line keeps its own tax category, so a pruned menu item cannot erase it.
--
-- ── What the first attempt got wrong, and how ──────────────────────────────────────────────────
-- `mms_set_line_fulfillment` recomputed a line's tax from `menu_items.tax_category` and coalesced a
-- MISS to 'hot_prepared'. `menu_item_id` is a soft text ref with no FK, so a pruned catalog row left
-- a live draft line pointing at nothing. The obvious fix — refuse when the category will not resolve
-- — was written, measured against the wrong quantity, and REJECTED by review. Recording why, because
-- the mistake is more instructive than the fix:
--
--   `getCartTotals` reads `tax_cents` only as a BOOLEAN (`totals-math.ts`: a line joins the taxable
--   base when `taxCents > 0`). Comparing the stored NUMBER before and after therefore says nothing
--   about what the guest pays. Measured properly, on a real Postgres, catalog row pruned:
--
--     dine-in → to-go   correct: exempt    before: TAXABLE    refusing: TAXABLE  ← identical charge
--     to-go → dine-in   correct: TAXABLE   before: TAXABLE    refusing: exempt   ← NEW under-collect
--
--   So refusing bought nothing in the direction M17 was filed for (the line keeps the tax it already
--   carried), broke routing in that direction (the line stays tagged `dinein`, so
--   `mms_init_togo_status` never stamps and the box never reaches expo), and introduced an
--   under-collection in the other — the direction M97 calls the legally worse one. It was strictly
--   worse than the code it replaced.
--
-- ── Why no rule over the row can recover the category ──────────────────────────────────────────
-- The owner states the CDTFA rule as: cold to-go is exempt, hot to-go is taxable, dine-in is all
-- taxable, except groceries. `mms_taxable` implements exactly that. Reading it as a truth table over
-- what a line still knows — its tag and whether it was taxable under that tag — only TWO of the four
-- transitions are determined:
--
--     (dinein, tax = 0)  ⇒ grocery_food (dine-in is otherwise all taxable)  → to-go: exempt.   KNOWN
--     (togo,   tax > 0)  ⇒ hot or retail (cold is exempt to-go)             → dine-in: taxable. KNOWN
--     (dinein, tax > 0)  ⇒ hot or cold                                      → AMBIGUOUS
--     (togo,   tax = 0)  ⇒ cold or grocery                                  → AMBIGUOUS
--
-- An earlier draft of this header claimed three were derivable, on the reasoning that "every category
-- exempt to-go is taxable dine-in". `grocery_food` falsifies it — exempt in BOTH directions — and
-- both reviewers caught it independently. The two ambiguous quadrants are the ones that actually
-- occur, so the derivation is not merely complex, it is unavailable.
--
-- ── So stop losing the fact ────────────────────────────────────────────────────────────────────
-- `qr_cart_items` already snapshots everything else the line needs after the fact — `name`,
-- `modifiers`, `unit_price_cents` — and left `tax_category` as a live lookup. That is the whole
-- defect: a catalog row can take back a fact the line had in hand. This migration adds the column,
-- backfills every resolvable row, and stamps it at INSERT, where the item is guaranteed present
-- because the caller has just priced off that very row. `mms_set_line_fulfillment` then reads the
-- LINE, and both directions are exactly right for the entire lifetime of every line minted after
-- this applies.
--
-- There is exactly one insert path to change: `20260716000000`, `20260624040000` and this one are
-- successive definitions of the same `mms_cart_item_insert_if_open`, not three functions (measured).
-- Its SIGNATURE is unchanged, so there is no deploy-order window and no caller edit — the category is
-- derived inside the RPC from the id it is already given, rather than added as a parameter every
-- caller would have to thread.
--
-- ── What is left ambiguous, and why that is the honest answer ──────────────────────────────────
-- A row that was ALREADY orphaned when this applied gets no backfill and no stamp: the item is gone,
-- so its category is unrecoverable and the fallback below still calls it 'hot_prepared' — taxable,
-- the legally safer of the two wrong answers (under-collection is the worse direction, M97). That set
-- cannot grow, only drain: it is draft lines on open carts, and every new line carries its category.
-- Refusing those instead was the rejected first attempt; it does not restore a cent.

-- ── 1. the column ────────────────────────────────────────────────────────────────────────────────
-- Nullable on purpose: existing rows have no category yet, and grocery lines never will (their
-- `menu_item_id` is a barcode, and the toggle refuses them at `is_grocery` regardless). The CHECK
-- mirrors `menu_items.tax_category`'s so a line can never carry a value the tax engine cannot read.
alter table public.qr_cart_items add column if not exists tax_category text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'qr_cart_items_tax_category_check') then
    alter table public.qr_cart_items add constraint qr_cart_items_tax_category_check
      check (tax_category is null or tax_category in
        ('hot_prepared','cold_food','beverage_hot','beverage_cold','retail_nonfood','grocery_food'));
  end if;
end $$;

-- ── 2. backfill every row whose item still resolves ──────────────────────────────────────────────
-- uuid-guarded: `menu_item_id` holds a grocery BARCODE for scan lines, and a bare `::uuid` on one
-- raises 22P02 (measured). Idempotent — `tax_category is null` means a re-run is a no-op.
update public.qr_cart_items ci
   set tax_category = mi.tax_category
  from public.menu_items mi
 where ci.tax_category is null
   and ci.menu_item_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   and mi.id = ci.menu_item_id::uuid;

-- ── 3. the insert stamps it ──────────────────────────────────────────────────────────────────────
-- Restated from `20260815100000_m3_modifier_option_ids.sql:34-72`, the live definition. Signature
-- identical; ONE column added to the INSERT and one expression to the SELECT. Nothing else moves.
drop function if exists public.mms_cart_item_insert_if_open(uuid, text, text, jsonb, integer, integer, uuid, text, text, integer, uuid, jsonb);
create function public.mms_cart_item_insert_if_open(
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
declare v_id uuid;
begin
  if p_scan_id is not null then
    insert into public.mms_scan_events (scan_id, cart_id) values (p_scan_id, p_cart_id)
      on conflict (scan_id) do nothing;
    if not found then
      return '00000000-0000-0000-0000-000000000000'::uuid; -- duplicate replay: no write, idempotent OK
    end if;
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

-- ── 4. the toggle reads the LINE ─────────────────────────────────────────────────────────────────
-- Restated from `20260823000000_m100_mode_authority.sql:110-176`, the live definition and the FOURTH
-- of this function. Signature unchanged. M100's mode gate, the 25¢/500000¢ bound, the open/draft/
-- grocery predicates and the load-bearing parentheses are untouched — diff the bodies to confirm.
-- TWO things differ: `ci.tax_category` joins the SELECT that already reads the row, and the catalog
-- lookup becomes a uuid-guarded fallback for rows that predate the stamp.
create or replace function public.mms_set_line_fulfillment(
  p_line uuid,
  p_fulfillment text,
  p_unit_price_cents integer default null
) returns text
  language plpgsql security definer set search_path = '' as $$
declare v_cart uuid; v_status text; v_state text; v_cur text; v_mid text; v_price integer; v_cat text;
        v_new_price integer; v_mode text;
begin
  if p_fulfillment not in ('dinein','togo') then return 'bad_fulfillment'; end if;
  -- Bound the server-derived price (belt: the caller is service-role TS, never the client, but a
  -- corrupted value must not become a charged amount). Null = legacy tax-only behavior. The 25¢
  -- floor is belt-only against today's catalog (min base $2.00, no negative deltas): a genuinely
  -- sub-25¢ food line would refuse its toggle with 'bad_price' — if a ~$0 item is ever added,
  -- widen this to allow 0 explicitly rather than relaxing the floor.
  if p_unit_price_cents is not null and (p_unit_price_cents < 25 or p_unit_price_cents > 500000) then
    return 'bad_price';
  end if;
  select ci.cart_id, c.status, ci.state, ci.fulfillment, ci.menu_item_id, ci.unit_price_cents, s.mode,
         ci.tax_category
    into v_cart, v_status, v_state, v_cur, v_mid, v_price, v_mode, v_cat
    from public.qr_cart_items ci
    join public.qr_carts c on c.id = ci.cart_id
    join public.table_sessions s on s.id = c.session_id
    where ci.id = p_line;
  if v_cart is null then return 'not_found'; end if;
  if v_status <> 'open' then return 'not_open'; end if;
  if v_state <> 'draft' then return 'not_draft'; end if;   -- can't re-route a line the kitchen has
  if v_cur = 'grocery' then return 'is_grocery'; end if;   -- grocery routing + exemption are fixed
  -- M100 — the client gate, re-derived. Placed with the other authorization checks and BEFORE the
  -- no-op return below, so the verdict never depends on whether the write happens to be a no-op.
  if p_fulfillment = 'dinein' and v_mode <> 'dinein' then return 'not_dinein_session'; end if;
  if v_cur = p_fulfillment then return 'ok'; end if;       -- no-op flip: never rewrite the price
  v_new_price := coalesce(p_unit_price_cents, v_price);
  -- Per-line tax from the food item's category + the new fulfillment, on the NEW price (the
  -- taxable-base flag getCartTotals reads).
  --
  -- M17 — the category comes off the LINE first. It is stamped at insert (above) and backfilled for
  -- every resolvable row by this migration, so the catalog lookup below is now only a bridge for
  -- rows that predate both. It is uuid-guarded because `menu_item_id` is a soft text ref: a grocery
  -- barcode made the bare cast raise 22P02, which reached the diner as a 500 rather than an answer.
  if v_cat is null and v_mid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select tax_category into v_cat from public.menu_items where id = v_mid::uuid;
  end if;
  -- Re-assert open + draft + food IN THE WRITE (not just the if-checks above): a concurrent
  -- mms_fire_cart (draft→fired) or webhook open→paid flip landing between the SELECT and this
  -- UPDATE must NOT re-route + re-price a line the kitchen/payment already owns. The mode term is
  -- the exception noted in this file's header: it cannot diverge from the pre-check at runtime, and
  -- earns its place by refusing the write (as 'stale') if the pre-check above is ever edited away.
  update public.qr_cart_items ci
    set fulfillment = p_fulfillment,
        unit_price_cents = v_new_price,
        tax_cents = public.mms_line_tax(v_new_price, coalesce(v_cat, 'hot_prepared'), p_fulfillment = 'dinein')
    where ci.id = p_line
      and ci.state = 'draft'
      and ci.fulfillment <> 'grocery'
      and exists (
        select 1 from public.qr_carts c
        join public.table_sessions s on s.id = c.session_id
        where c.id = ci.cart_id and c.status = 'open'
          -- ⚠️ THE PARENTHESES ARE LOAD-BEARING. This is the first OR ever introduced into this
          -- EXISTS; before M100 it was a single conjunct with no grouping hazard. Drop them and
          -- `AND` binds tighter, so the predicate becomes
          -- `(c.id = … and c.status = 'open' and p_fulfillment <> 'dinein') or s.mode = 'dinein'`
          -- — which is TRUE for any dine-in session regardless of cart status, and a cart that
          -- raced open→paid between the SELECT above and this UPDATE would be re-routed and
          -- re-taxed after settlement. Measured, on the mis-parenthesized form: `ok`, row moved to
          -- dinein, tax 0 → 147 on a PAID cart; correctly parenthesized it answers `stale` and the
          -- row does not move. No case in the SQL test reaches this — every one is short-circuited
          -- by the `not_open` pre-check, which is what OPEN-ITEMS M110 is for.
          and (p_fulfillment <> 'dinein' or s.mode = 'dinein')
      );
  if not found then return 'stale'; end if;   -- raced a fire / pay between the read and the write
  return 'ok';
end $$;

revoke all on function public.mms_cart_item_insert_if_open(uuid, text, text, jsonb, integer, integer, uuid, text, text, integer, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.mms_cart_item_insert_if_open(uuid, text, text, jsonb, integer, integer, uuid, text, text, integer, uuid, jsonb)
  to service_role;
revoke all on function public.mms_set_line_fulfillment(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.mms_set_line_fulfillment(uuid, text, integer) to service_role;
