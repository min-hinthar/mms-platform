-- supabase/tests/m97_merge_matches_fulfillment_test.sql  (M97)
--
-- `mms_merge_table_orders` folds a source line into a matching target line by bumping the target's
-- qty and DELETING the source row. The match tests state, notes, by_seat, added_by (M96), the menu
-- item and the modifier key — but NOT `fulfillment`, while `insertOrIncLine` refuses exactly that
-- fold client-side (`.eq("fulfillment", …)`: "a for-here add must NOT merge into a to-go line —
-- different routing/tax"). So a to-go line can fold into a dine-in line and the folded units silently
-- adopt the target's tag.
--
-- ── Why this is money, not just routing ─────────────────────────────────────────────────────────
-- `getCartTotals` reads a line's stored `tax_cents` ONLY as a boolean taxable-or-not flag and taxes
-- the full `unit_price_cents * qty` (`totals-math.ts`, and `tax.ts`'s own header says so). Cold food
-- and cold beverages are taxable dine-in and exempt to-go (CDTFA Reg 1603). So the fold moves units
-- across the taxable line in whichever direction the TARGET points:
--
--   · to-go folds into dine-in  → both units become taxable   → the guest is OVER-charged.
--   · dine-in folds into to-go  → neither unit is taxable     → sales tax is NEVER COLLECTED.
--
-- Nothing downstream notices: the intent amount and the webhook reconcile are both derived from the
-- same corrupted rows, so they agree, and the tag is copied verbatim into `qr_order_items`.
--
-- ── `=` and not `is not distinct from` ──────────────────────────────────────────────────────────
-- `fulfillment` is `not null default 'dinein'` with a backfill (`20260623100000_s4_unified_basket`),
-- so both operands are always present and the two operators are behaviourally IDENTICAL for every
-- state this database can hold. **No case below can distinguish them, and none pretends to.** The
-- line directly above it in the function needs `is not distinct from` for the opposite reason
-- (`added_by` is nullable and never backfilled), which is exactly the copy-paste hazard worth naming.
--
-- ── The two traps this file is built around ─────────────────────────────────────────────────────
--  1. Every case gives BOTH sides the same `added_by` (null = staff-added). Otherwise M96's predicate
--     already blocks the fold and every assert below passes for the wrong reason.
--  2. Never discriminate on the RPC's return value: `v_moved := v_moved + r.qty` runs in BOTH the
--     fold and the re-parent branch, so `moved` is identical either way. Count rows instead.
--     ⚠️ That rule is true HERE and false in `scripts/verify-merge-race.mjs` (M102): since M98 the
--     fold adds `r.qty` while the re-parent adds a value read BACK from the row, and the two diverge
--     exactly when qty changed under the cursor — which only a second session can arrange. Do not
--     carry this rule over there; the two-session harness asserts the return value deliberately.
--
-- Run against any QR DB (rolls back — leaves NO data behind):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/m97_merge_matches_fulfillment_test.sql

begin;
-- W8: without this GUC every ASSERT below compiles out and the file exits 0 having proved nothing.
set local plpgsql.check_asserts = on;

do $$
declare
  ana   uuid := '00000000-0000-0000-0000-0000009700a0';
  dish  text := 'cccccccc-0000-4000-8000-000000000d97';
  price integer := 1400;                    -- a cold-food line; the exact value never leaves this block
  tax_in  integer;                          -- what the ENGINE says a dine-in unit owes
  tax_out integer;                          -- …and a to-go one
  src_sess uuid; tgt_sess uuid; src_cart uuid; tgt_cart uuid;
  n integer; base integer;
begin
  -- The tax engine is the fixture, never the expectation: ask it, don't transcribe it. If a future
  -- rate or category change makes cold food stop separating the two tags, THIS fails with a clear
  -- message instead of the cases below failing for a reason nobody can read.
  tax_in  := public.mms_line_tax(price, 'cold_food', true);
  tax_out := public.mms_line_tax(price, 'cold_food', false);
  assert tax_in > 0 and tax_out = 0,
    format('M97 fixture drift: cold food no longer separates dine-in (%s) from to-go (%s) — this test '
           'has nothing left to measure', tax_in, tax_out);

  -- ══ 1. to-go folds into dine-in — the OVER-CHARGE direction ═══════════════════════════════════
  src_sess := gen_random_uuid(); tgt_sess := gen_random_uuid();
  src_cart := gen_random_uuid(); tgt_cart := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat) values
    (src_sess, 'M97S1', 'dinein', 'active', ana), (tgt_sess, 'M97T1', 'dinein', 'active', ana);
  insert into public.qr_carts (id, session_id) values (src_cart, src_sess), (tgt_cart, tgt_sess);
  -- Both staff-added (by_seat null → M87's seed trigger leaves added_by null), so M96's adder
  -- predicate matches and `fulfillment` is the ONLY thing standing between these two lines.
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (tgt_cart, dish, 'Pickled Tea Salad', 1, price, tax_in,  null, 'dinein'),
           (src_cart, dish, 'Pickled Tea Salad', 1, price, tax_out, null, 'togo');

  perform public.mms_merge_table_orders(src_cart, tgt_cart);
  select count(*) into n from public.qr_cart_items where cart_id = tgt_cart;
  assert n = 2, format('M97.1 THE DEFECT: a to-go line folded into a dine-in line, so both units are '
                       'now taxed as dine-in and the guest is over-charged (%s lines, expected 2)', n);
  select count(*) into n from public.qr_cart_items where cart_id = tgt_cart and fulfillment = 'togo';
  assert n = 1, 'M97.1 the to-go line did not survive as its own row';
  select count(*) into n from public.qr_cart_items where cart_id = tgt_cart and fulfillment = 'dinein';
  assert n = 1, 'M97.1 the dine-in line did not survive as its own row';
  -- …and the money, computed the way `getCartTotals` computes it: sum the units of every line whose
  -- stored tax_cents is non-zero. Exactly ONE unit may be taxable here.
  select coalesce(sum(unit_price_cents * qty), 0) into base
    from public.qr_cart_items where cart_id = tgt_cart and tax_cents > 0;
  assert base = price,
    format('M97.1 the taxable base is %s, expected %s — one unit, not two. This is the over-charge, '
           'in cents, before the rate is applied.', base, price);

  -- ══ 2. dine-in folds into to-go — the UNDER-COLLECTION direction ══════════════════════════════
  -- Not a mirror of case 1: the fold takes the TARGET's shape, so this one ends with a taxable base
  -- of ZERO rather than a doubled one. Tax that is never collected is not a refundable mistake.
  src_sess := gen_random_uuid(); tgt_sess := gen_random_uuid();
  src_cart := gen_random_uuid(); tgt_cart := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat) values
    (src_sess, 'M97S2', 'dinein', 'active', ana), (tgt_sess, 'M97T2', 'dinein', 'active', ana);
  insert into public.qr_carts (id, session_id) values (src_cart, src_sess), (tgt_cart, tgt_sess);
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (tgt_cart, dish, 'Pickled Tea Salad', 1, price, tax_out, null, 'togo'),
           (src_cart, dish, 'Pickled Tea Salad', 1, price, tax_in,  null, 'dinein');

  perform public.mms_merge_table_orders(src_cart, tgt_cart);
  select count(*) into n from public.qr_cart_items where cart_id = tgt_cart;
  assert n = 2, format('M97.2 THE DEFECT, other direction: a dine-in line folded into a to-go line, so '
                       'California sales tax on it is never collected (%s lines, expected 2)', n);
  select coalesce(sum(unit_price_cents * qty), 0) into base
    from public.qr_cart_items where cart_id = tgt_cart and tax_cents > 0;
  assert base = price,
    format('M97.2 the taxable base is %s, expected %s — the dine-in unit still owes tax after the '
           'merge. A base of 0 means the state was never charged.', base, price);

  -- ══ 3. grocery does not fold into dine-in — SYNTHETIC, and labelled ═══════════════════════════
  -- ⚠️ Unreachable in production, on ONE ground: a grocery line's `menu_item_id` is a BARCODE and a
  -- food line's is a `menu_items` uuid, so `t.menu_item_id = r.menu_item_id` already separates them.
  -- (A second ground was claimed and is FALSE — "a grocery line carries a real `by_seat` so it can
  -- never be a fold TARGET": the re-parent branch NULLS `by_seat`, so a re-parented grocery line is
  -- seatless and is a fine target. Adversarial review.) Kept anyway, because it pins the whole
  -- `fulfillment` CHECK enum rather than just the two tags that collide today.
  src_sess := gen_random_uuid(); tgt_sess := gen_random_uuid();
  src_cart := gen_random_uuid(); tgt_cart := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat) values
    (src_sess, 'M97S3', 'dinein', 'active', ana), (tgt_sess, 'M97T3', 'dinein', 'active', ana);
  insert into public.qr_carts (id, session_id) values (src_cart, src_sess), (tgt_cart, tgt_sess);
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (tgt_cart, dish, 'Pickled Tea Salad', 1, price, tax_in, null, 'dinein'),
           (src_cart, dish, 'Pickled Tea Salad', 1, price, 0,      null, 'grocery');

  perform public.mms_merge_table_orders(src_cart, tgt_cart);
  select count(*) into n from public.qr_cart_items where cart_id = tgt_cart;
  assert n = 2, format('M97.3 a grocery line folded into a dine-in line (%s lines, expected 2)', n);

  -- ══ 4. same tag on both sides — the narrowing must not cost the legitimate fold ════════════════
  -- Deliberately togo/togo: dinein/dinein is already covered by m96_merge_keeps_adder_test case 1,
  -- and a predicate mistakenly written as a CONSTANT (`t.fulfillment = 'dinein'`) would pass there
  -- and fail here. That is the mutation this case exists for.
  src_sess := gen_random_uuid(); tgt_sess := gen_random_uuid();
  src_cart := gen_random_uuid(); tgt_cart := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat) values
    (src_sess, 'M97S4', 'dinein', 'active', ana), (tgt_sess, 'M97T4', 'dinein', 'active', ana);
  insert into public.qr_carts (id, session_id) values (src_cart, src_sess), (tgt_cart, tgt_sess);
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (tgt_cart, dish, 'Pickled Tea Salad', 1, price, tax_out, null, 'togo'),
           (src_cart, dish, 'Pickled Tea Salad', 1, price, tax_out, null, 'togo');

  perform public.mms_merge_table_orders(src_cart, tgt_cart);
  select count(*) into n from public.qr_cart_items where cart_id = tgt_cart;
  assert n = 1, format('M97.4 two to-go lines stopped folding — the narrowing cost the legitimate '
                       'case (%s lines, expected 1)', n);
  select qty into n from public.qr_cart_items where cart_id = tgt_cart;
  assert n = 2, format('M97.4 the fold did not carry the qty: %s, expected 2', n);
  select count(*) into n from public.qr_cart_items where cart_id = tgt_cart and fulfillment = 'togo';
  assert n = 1, 'M97.4 the folded line did not keep its to-go tag';

  -- ══ 5. M96 and M97 compose — detects neither DELETION, but it is not idle ════════════════════
  -- Two narrowings on the same predicate list, both satisfied at once: same adder AND same tag. It
  -- passes with either predicate DELETED, and that is the point — it exists to prove that adding a
  -- second narrowing did not quietly cost the fold the first one already allowed.
  --
  -- It is NOT dead weight, and an earlier version of this comment ("detects nothing") undersold it
  -- badly enough to invite a future maintainer to delete it. It also kills a predicate mis-written as
  -- the constant `= 'togo'`, and it is the ONLY case here with a non-null `added_by` on both sides —
  -- so it also kills an M96 mutation to `t.added_by is null`, which case 4 (null on both sides)
  -- survives. Caught by adversarial review.
  src_sess := gen_random_uuid(); tgt_sess := gen_random_uuid();
  src_cart := gen_random_uuid(); tgt_cart := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat) values
    (src_sess, 'M97S5', 'dinein', 'active', ana), (tgt_sess, 'M97T5', 'dinein', 'active', ana);
  insert into public.qr_carts (id, session_id) values (src_cart, src_sess), (tgt_cart, tgt_sess);
  -- Built the way production builds a re-parented line: insert with the seat, then clear the seat —
  -- M87's keep-trigger holds `added_by` because the UPDATE never names that column.
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (tgt_cart, dish, 'Pickled Tea Salad', 1, price, tax_in, ana, 'dinein');
  update public.qr_cart_items set by_seat = null where cart_id = tgt_cart;
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (src_cart, dish, 'Pickled Tea Salad', 1, price, tax_in, ana, 'dinein');

  perform public.mms_merge_table_orders(src_cart, tgt_cart);
  select count(*) into n from public.qr_cart_items where cart_id = tgt_cart;
  assert n = 1, format('M97.5 same adder AND same tag stopped folding — the two narrowings do not '
                       'compose (%s lines, expected 1)', n);
  select qty into n from public.qr_cart_items where cart_id = tgt_cart;
  assert n = 2, format('M97.5 the fold did not carry the qty: %s, expected 2', n);
end $$;

select 'm97_merge_matches_fulfillment_test: ok' as result;

rollback;
