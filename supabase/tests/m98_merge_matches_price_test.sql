-- supabase/tests/m98_merge_matches_price_test.sql  (M98)
--
-- `mms_merge_table_orders`'s fold matches on seat, adder (M96), tag (M97), state, notes, item and
-- modifiers — but NOT on `unit_price_cents`. The fold bumps the target's qty and DELETES the source
-- row, so the source's units silently adopt the TARGET's price snapshot.
--
-- ── Why two open carts can hold the same dish at different prices ────────────────────────────────
-- `setMenuPrice` writes `menu_items.base_price_cents` LIVE, and says so: "Lines ALREADY in a cart
-- keep the price they were quoted … nothing here touches `qr_cart_items`." Cart lines hold an
-- insert-time snapshot. So two carts straddling a price edit hold the same dish at two prices, and
-- the merge charges every unit at whichever one the server happened to pick as the TARGET.
--
-- ── The money, and why it is worse than M97 ──────────────────────────────────────────────────────
-- Error = srcQty × (targetPrice − sourcePrice) on the SUBTOTAL, +10.5% tax on top, plus the tip
-- rate riding the corrupted net. M97's damage was capped at 10.5% of one line's value and only on
-- cold categories; this is uncapped, multiplies by qty, and applies to every category. On the real
-- applied Balachaung change ($3.00 → $10.00) one unit each side is ±773¢ depending on which cart the
-- server picked. Direction is set by the merge direction, not by which way the price moved — there
-- is no safe ordering.
--
-- Nothing downstream notices, the same structural reason M97's header gives: the intent amount and
-- the webhook reconcile both call `getCartTotals` on the same corrupted rows and agree.
--
-- ── `=` and not `is not distinct from` ──────────────────────────────────────────────────────────
-- `unit_price_cents int not null` since table creation, NO default and no ALTER has ever touched it
-- (`20260618000000_qr_platform_init.sql`). Both operands always exist, so the two operators are
-- behaviourally identical and NO case below can separate them. Note the reason differs from M97's:
-- `fulfillment` is not-null-with-a-default-plus-backfill (which is what made it safe to ADD to a
-- populated table); this column has never admitted a null at all. Right operator, different reason —
-- do not copy the justification, and do not copy the `is not distinct from` from the `added_by` line
-- two rows above it in the function.
--
-- ── The anti-degeneracy guard, and its known cost ───────────────────────────────────────────────
-- Every case below first asserts that its two lines are foldable on EVERY OTHER predicate and differ
-- only on price. Without it a fixture that accidentally violates some unrelated predicate (a seat, a
-- tag, an adder) passes for the wrong reason — which has now happened twice in this repo's merge
-- tests and was caught by review both times, not by the suite.
--
-- ⚠️ That guard is a deliberate COPY of the fold's predicate list and WILL go stale if the fold gains
-- a predicate. Update it in the same commit that adds one. A stale guard here fails safe (it would
-- assert 0 and go red) rather than silently passing, which is why the copy is acceptable.
--
-- Run against any QR DB (rolls back — leaves NO data behind):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/m98_merge_matches_price_test.sql

begin;
-- W8: without this GUC every ASSERT below compiles out and the file exits 0 having proved nothing.
set local plpgsql.check_asserts = on;

do $$
declare
  ana  uuid := '00000000-0000-0000-0000-0000009800a0';
  dish text := 'cccccccc-0000-4000-8000-000000000d98';
  pa   integer := 1600;    -- the cheaper snapshot
  pb   integer := 1800;    -- the dearer one; deliberately NOT a value used elsewhere in this file,
                           -- so a predicate mis-written as a constant cannot accidentally match it
  src_sess uuid; tgt_sess uuid; src_cart uuid; tgt_cart uuid;
  n integer; total integer;
begin
  assert pa <> pb, 'M98 fixture drift: the two prices must differ or nothing here measures anything';

  -- ══ 1. cheap source folds into a DEAR target — the OVER-CHARGE direction ══════════════════════
  src_sess := gen_random_uuid(); tgt_sess := gen_random_uuid();
  src_cart := gen_random_uuid(); tgt_cart := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat) values
    (src_sess, 'M98S1', 'dinein', 'active', ana), (tgt_sess, 'M98T1', 'dinein', 'active', ana);
  insert into public.qr_carts (id, session_id) values (src_cart, src_sess), (tgt_cart, tgt_sess);
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (tgt_cart, dish, 'Balachaung', 1, pb, 189, null, 'dinein'),
           (src_cart, dish, 'Balachaung', 1, pa, 168, null, 'dinein');

  -- ANTI-DEGENERACY: these two must be foldable on everything except price.
  select count(*) into n
    from public.qr_cart_items t, public.qr_cart_items s
    where t.cart_id = tgt_cart and s.cart_id = src_cart
      and t.by_seat is null
      and t.added_by is not distinct from s.added_by
      and t.fulfillment = s.fulfillment
      and t.notes is null and s.notes is null
      and t.state = s.state and t.state <> 'voided' and not t.comped
      and s.state <> 'voided' and not s.comped
      and t.menu_item_id = s.menu_item_id
      and coalesce((select jsonb_agg(e order by e) from jsonb_array_elements_text(t.modifiers) e), '[]'::jsonb)
        = coalesce((select jsonb_agg(e order by e) from jsonb_array_elements_text(s.modifiers) e), '[]'::jsonb)
      and t.unit_price_cents <> s.unit_price_cents;
  assert n = 1, 'M98.1 DEGENERATE FIXTURE: the two lines are not foldable-but-for-price, so whatever '
                'this case asserts next, it is not measuring the price predicate';

  perform public.mms_merge_table_orders(src_cart, tgt_cart);
  select count(*) into n from public.qr_cart_items where cart_id = tgt_cart;
  assert n = 2, format('M98.1 THE DEFECT: a line quoted at the cheaper price folded into a dearer one, '
                       'so every unit is now charged at the target snapshot and the guest is '
                       'over-charged (%s lines, expected 2)', n);
  -- The money, exactly as `getCartTotals` sums it: unit price × qty across the surviving lines.
  select coalesce(sum(unit_price_cents * qty), 0) into total from public.qr_cart_items where cart_id = tgt_cart;
  assert total = pa + pb,
    format('M98.1 the subtotal is %s, expected %s — each unit must keep the price it was quoted. '
           'A value of %s means both units were charged at the target price.', total, pa + pb, pb * 2);
  select count(*) into n from public.qr_cart_items where cart_id = tgt_cart and unit_price_cents = pa;
  assert n = 1, 'M98.1 the cheaper line did not survive as its own row';

  -- ══ 2. dear source folds into a CHEAP target — the UNDER-COLLECTION direction ═════════════════
  -- Deliberately NOT a mirror of case 1: an inequality mis-write (`>=` / `<=`) survives one
  -- direction and dies in the other, so both are needed to kill that family.
  src_sess := gen_random_uuid(); tgt_sess := gen_random_uuid();
  src_cart := gen_random_uuid(); tgt_cart := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat) values
    (src_sess, 'M98S2', 'dinein', 'active', ana), (tgt_sess, 'M98T2', 'dinein', 'active', ana);
  insert into public.qr_carts (id, session_id) values (src_cart, src_sess), (tgt_cart, tgt_sess);
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (tgt_cart, dish, 'Balachaung', 1, pa, 168, null, 'dinein'),
           (src_cart, dish, 'Balachaung', 1, pb, 189, null, 'dinein');

  perform public.mms_merge_table_orders(src_cart, tgt_cart);
  select count(*) into n from public.qr_cart_items where cart_id = tgt_cart;
  assert n = 2, format('M98.2 THE DEFECT, other direction: a dearer line folded into a cheaper one, so '
                       'the restaurant under-collects on every moved unit (%s lines, expected 2)', n);
  select coalesce(sum(unit_price_cents * qty), 0) into total from public.qr_cart_items where cart_id = tgt_cart;
  assert total = pa + pb,
    format('M98.2 the subtotal is %s, expected %s. A value of %s means both units were charged at the '
           'cheaper target price and the difference is simply never billed.', total, pa + pb, pa * 2);

  -- ══ 3. same price — the narrowing must not cost the legitimate fold ═══════════════════════════
  -- Both sides at `pb`, a value used nowhere else, so a predicate mis-written as a CONSTANT cannot
  -- pass here by coincidence.
  src_sess := gen_random_uuid(); tgt_sess := gen_random_uuid();
  src_cart := gen_random_uuid(); tgt_cart := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat) values
    (src_sess, 'M98S3', 'dinein', 'active', ana), (tgt_sess, 'M98T3', 'dinein', 'active', ana);
  insert into public.qr_carts (id, session_id) values (src_cart, src_sess), (tgt_cart, tgt_sess);
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (tgt_cart, dish, 'Balachaung', 1, pb, 189, null, 'dinein'),
           (src_cart, dish, 'Balachaung', 1, pb, 189, null, 'dinein');

  perform public.mms_merge_table_orders(src_cart, tgt_cart);
  select count(*) into n from public.qr_cart_items where cart_id = tgt_cart;
  assert n = 1, format('M98.3 two identically-priced lines stopped folding — the narrowing cost the '
                       'legitimate case (%s lines, expected 1)', n);
  select qty into n from public.qr_cart_items where cart_id = tgt_cart;
  assert n = 2, format('M98.3 the fold did not carry the qty: %s, expected 2', n);
  select unit_price_cents into n from public.qr_cart_items where cart_id = tgt_cart;
  assert n = pb, format('M98.3 the folded line changed price: %s, expected %s', n, pb);

  -- ══ 4. all THREE narrowings compose — passes with any one of them deleted ═════════════════════
  -- Same adder AND same tag AND same price. Labelled honestly: this kills a constant mis-write of
  -- any of the three, and proves the third narrowing did not cost the two already allowed — but it
  -- detects none of the three DELETIONS on its own.
  src_sess := gen_random_uuid(); tgt_sess := gen_random_uuid();
  src_cart := gen_random_uuid(); tgt_cart := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat) values
    (src_sess, 'M98S4', 'dinein', 'active', ana), (tgt_sess, 'M98T4', 'dinein', 'active', ana);
  insert into public.qr_carts (id, session_id) values (src_cart, src_sess), (tgt_cart, tgt_sess);
  -- Built the way production builds a re-parented line: insert with the seat, then clear it. M87's
  -- keep-trigger holds `added_by` because the UPDATE never names that column.
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (tgt_cart, dish, 'Balachaung', 1, pb, 0, ana, 'togo');
  update public.qr_cart_items set by_seat = null where cart_id = tgt_cart;
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (src_cart, dish, 'Balachaung', 1, pb, 0, ana, 'togo');

  perform public.mms_merge_table_orders(src_cart, tgt_cart);
  select count(*) into n from public.qr_cart_items where cart_id = tgt_cart;
  assert n = 1, format('M98.4 same adder, same tag AND same price stopped folding — the three '
                       'narrowings do not compose (%s lines, expected 1)', n);
  select qty into n from public.qr_cart_items where cart_id = tgt_cart;
  assert n = 2, format('M98.4 the fold did not carry the qty: %s, expected 2', n);
  select count(*) into n from public.qr_cart_items
    where cart_id = tgt_cart and added_by = ana and fulfillment = 'togo' and unit_price_cents = pb;
  assert n = 1, 'M98.4 the folded line lost its adder, its tag or its price';

  -- ══ 5. the predicate SELECTS, it does not merely block — ⚠️ ORDER-DEPENDENT ═══════════════════
  -- Two candidate targets, one at each price; the source must find the matching one. This is the
  -- only case that proves selection rather than refusal.
  --
  -- ⚠️ The fold's match query carries `limit 1` with NO `order by`, so which candidate it finds is
  -- scan-order dependent. That makes this case flaky-GREEN, never flaky-red: it can pass without
  -- proving anything, but it cannot fail unless something is genuinely wrong. It is therefore
  -- deliberately never the only case that catches a mutation — 1 and 2 carry that weight.
  src_sess := gen_random_uuid(); tgt_sess := gen_random_uuid();
  src_cart := gen_random_uuid(); tgt_cart := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat) values
    (src_sess, 'M98S5', 'dinein', 'active', ana), (tgt_sess, 'M98T5', 'dinein', 'active', ana);
  insert into public.qr_carts (id, session_id) values (src_cart, src_sess), (tgt_cart, tgt_sess);
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (tgt_cart, dish, 'Balachaung', 1, pa, 168, null, 'dinein'),
           (tgt_cart, dish, 'Balachaung', 1, pb, 189, null, 'dinein'),
           (src_cart, dish, 'Balachaung', 1, pb, 189, null, 'dinein');

  perform public.mms_merge_table_orders(src_cart, tgt_cart);
  select count(*) into n from public.qr_cart_items where cart_id = tgt_cart;
  assert n = 2, format('M98.5 expected the source to fold into the SAME-priced candidate and leave '
                       'two lines, got %s', n);
  select qty into n from public.qr_cart_items where cart_id = tgt_cart and unit_price_cents = pb;
  assert n = 2, format('M98.5 the source folded into the WRONG-priced candidate: the %s line is at '
                       'qty %s, expected 2', pb, n);
  select qty into n from public.qr_cart_items where cart_id = tgt_cart and unit_price_cents = pa;
  assert n = 1, format('M98.5 the cheaper candidate was disturbed: qty %s, expected 1', n);
  select coalesce(sum(unit_price_cents * qty), 0) into total from public.qr_cart_items where cart_id = tgt_cart;
  assert total = pa + pb + pb,
    format('M98.5 the subtotal is %s, expected %s — three units, each at the price it was quoted',
           total, pa + pb + pb);
end $$;

select 'm98_merge_matches_price_test: ok' as result;

rollback;
