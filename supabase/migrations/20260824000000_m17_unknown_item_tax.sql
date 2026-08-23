-- M17 — a line whose menu item is gone must not be TAXED AS IF it were hot food.
--
-- `mms_set_line_fulfillment` resolves the line's tax category from `menu_items` and, until now,
-- coalesced a MISS to 'hot_prepared'. `menu_item_id` is a SOFT text ref with no FK
-- (`20260618000000_qr_platform_init.sql:146-157`), so a pruned catalog row leaves a live draft line
-- pointing at nothing — and 'hot_prepared' is taxable BOTH ways, while the categories that actually
-- separate the two tags (`cold_food`, `beverage_cold`) are exempt to-go under CDTFA Reg 1603.
--
-- ── Measured, not reasoned ─────────────────────────────────────────────────────────────────────
-- Against a real Postgres 16 running this function's PREVIOUS body verbatim (extracted from
-- `20260823000000_m100_mode_authority.sql`, not retyped), one $14.00 `cold_food` line on a dine-in
-- session, toggled dine-in → to-go:
--
--     item present   mms_set_line_fulfillment(line,'togo') -> ok    tax_cents 147 -> 0     ← correct
--     item DELETED   mms_set_line_fulfillment(line,'togo') -> ok    tax_cents 147 -> 147   ← M17
--
-- Same line, same call, same answer word. 147¢ charged on a transaction that owes nothing, and
-- `getCartTotals` then folds the whole `unit_price_cents * qty` into the taxable base off that
-- boolean flag (`tax.ts`'s own header), so nothing downstream disagrees. **Over-collection.**
--
-- A SECOND unresolvable shape sat next to it and was not filed: `v_mid::uuid` on a non-uuid id (a
-- grocery barcode on a line whose `fulfillment` is not 'grocery') raises 22P02 — measured, the same
-- harness — so the diner got a 500 rather than a reason. Both are the same question with two
-- symptoms: *what is this line's tax category?* Both are refused here, by one rule.
--
-- ── Refuse, do not derive ──────────────────────────────────────────────────────────────────────
-- Three of the four transitions are in fact derivable from the row alone: `togo → dinein` is taxable
-- whatever the lost category was (every category that is exempt to-go is taxable dine-in), and a
-- dine-in line already storing `tax_cents = 0` can only have been `grocery_food`. Only
-- `dinein → togo` with `tax_cents > 0` is genuinely ambiguous — hot and cold both store a positive
-- dine-in tax and part company only to-go.
--
-- That derivation is deliberately NOT implemented. It would infer a tax CATEGORY from a previously
-- computed TAX — a second derivation of a money fact whose first derivation is gone, which is the
-- exact "a value computed in one place and quoted in another WILL drift" shape this repo has paid
-- for (CLAUDE.md, W17). The honest answer to "what category is this?" is that we no longer know, and
-- this repo already has a rule for that: refuse, name the reason, never guess a charged amount.
--
-- ── Over-blocking, checked ─────────────────────────────────────────────────────────────────────
-- The cost of refusing is that a deleted-item line can no longer be re-routed at all. Measured on
-- the same harness: every case with a REAL menu item is byte-for-byte unchanged — cold food toggles
-- 147 ⇄ 0 in both directions, hot food stays 147 both ways. Nothing an ordinary diner does is
-- touched, because nothing in `apps/` ever DELETEs a `menu_items` row (availability is `is_active` /
-- `is_sold_out`); reaching this needs a catalog pruned out from under a live draft line. A refusal
-- there leaves the line at the tax it was already quoted, which is the conservative direction.
--
-- ── One home for the predicate, on purpose ─────────────────────────────────────────────────────
-- Unlike the open/draft/grocery/mode predicates above it, this check is NOT re-asserted inside the
-- UPDATE. Those guard against a concurrent write flipping the row's own state; this one asks a
-- question about a DIFFERENT table, and the answer it gets is the last true one. If the catalog row
-- is deleted between the SELECT and the UPDATE, `v_cat` still holds the category the item genuinely
-- had, and re-asserting existence would refuse a toggle whose tax we computed correctly — a guard
-- that damages the case it exists to protect. The pre-check is pinned by
-- `supabase/tests/m17_unknown_item_tax_test.sql` and by the `toggle/unknown-item-*` mutants in
-- `scripts/verify-mode-authority.mjs` instead.
--
-- ── What differs from 20260823000000 ───────────────────────────────────────────────────────────
-- Restated from `20260823000000_m100_mode_authority.sql:110-176`, the live definition and the FOURTH
-- of this function. Signature unchanged, so `create or replace` is enough and the grants below are a
-- restatement, not a repair. THREE lines differ: the uuid-shape guard, the `v_cat is null` refusal,
-- and the coalesce dropped from the UPDATE's `mms_line_tax` call. M100's mode gate, the 25¢/500000¢
-- price bound, the open/draft/grocery predicates and the load-bearing parentheses are untouched —
-- diff the bodies to confirm.

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
  select ci.cart_id, c.status, ci.state, ci.fulfillment, ci.menu_item_id, ci.unit_price_cents, s.mode
    into v_cart, v_status, v_state, v_cur, v_mid, v_price, v_mode
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
  -- taxable-base flag getCartTotals reads). menu_item_id is a uuid for food (grocery filtered out).
  --
  -- M17 — the category must be READ, never assumed. `menu_item_id` is a SOFT text ref with no FK
  -- (`…init.sql:146-157`), so a pruned catalog row leaves a live draft line pointing at nothing, and
  -- both ways of failing to resolve it are refused here rather than guessed at:
  --   · a non-uuid id (a grocery barcode on a line whose fulfillment is not 'grocery') used to make
  --     `v_mid::uuid` raise 22P02 — measured — so the diner got a 500 instead of a reason;
  --   · a uuid with no row left `v_cat` null, and the coalesce below called it 'hot_prepared'.
  -- Neither is reachable through today's app (nothing DELETEs menu_items; scanAdd tags grocery), but
  -- the second is what M17 is: hot_prepared is taxable BOTH ways, so a $14.00 cold line toggled to
  -- to-go rang 147¢ of tax on a transaction CDTFA Reg 1603 exempts. Measured on a real postgres
  -- against this exact body: 0¢ with the item present, 147¢ with it deleted, `ok` both times.
  if v_mid !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return 'unknown_item';
  end if;
  select tax_category into v_cat from public.menu_items where id = v_mid::uuid;
  if v_cat is null then return 'unknown_item'; end if;
  -- Re-assert open + draft + food IN THE WRITE (not just the if-checks above): a concurrent
  -- mms_fire_cart (draft→fired) or webhook open→paid flip landing between the SELECT and this
  -- UPDATE must NOT re-route + re-price a line the kitchen/payment already owns. The mode term is
  -- the exception noted in this file's header: it cannot diverge from the pre-check at runtime, and
  -- earns its place by refusing the write (as 'stale') if the pre-check above is ever edited away.
  update public.qr_cart_items ci
    set fulfillment = p_fulfillment,
        unit_price_cents = v_new_price,
        tax_cents = public.mms_line_tax(v_new_price, v_cat, p_fulfillment = 'dinein')
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

revoke all on function public.mms_set_line_fulfillment(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.mms_set_line_fulfillment(uuid, text, integer) to service_role;
