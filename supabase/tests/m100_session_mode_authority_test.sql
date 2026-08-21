-- supabase/tests/m100_session_mode_authority_test.sql  (M100 · M107)
--
-- Two cart RPCs took a client gate at its word. `Checkout.tsx` renders BOTH the For-here/To-go pills
-- and the "Make it now" button behind `isDineIn &&` (`:1243`, `:1283`) — and its own comment says why
-- the gate is written to fail closed on an unknown mode: "a missing control costs a tap, a wrong one
-- costs the order". But a Server Action is a public POST. Neither `mms_set_line_fulfillment` nor
-- `mms_fire_line` ever read `table_sessions.mode`, so nothing between the browser and the row
-- re-derived the one fact the control was gated on.
--
-- ── M100 — a pickup/scango line can be tagged `dinein`, and that is not only a mis-tax ──────────
-- Measured on a migrated database, single cold-food line at $14.00 on a `pickup` session:
--
--     mms_set_line_fulfillment(line,'dinein') -> ok    fulfillment=dinein   tax_cents 0 -> 147
--     …settle it, then mms_init_togo_status  -> NULL   expo-visible lines: 0
--
--   · MONEY: `getCartTotals` reads a line's stored `tax_cents` only as a boolean taxable-or-not flag
--     and taxes the whole `unit_price_cents * qty` (`tax.ts`'s own header, `totals-math.ts`), so the
--     tag moves the ENTIRE line across the taxable base. CDTFA Reg 1603 exempts cold food to-go, so
--     this is 147¢ of tax charged on a transaction that does not owe it — the guest over-pays and the
--     restaurant over-collects. The webhook re-derives from the same corrupted rows, so the reconcile
--     agrees and nothing downstream notices; the tag is then frozen into `qr_order_items`.
--   · WORSE, AND NOT ABOUT MONEY: `mms_init_togo_status` stamps `togo_status='preparing'` only if the
--     cart holds a `togo`/`grocery` line, and `expo.ts` reads `.in("fulfillment",["togo","grocery"])`.
--     A single-line pickup order whose one line reads `dinein` therefore settles with `togo_status`
--     NULL and ZERO expo lines: /track never leaves "Order placed", the counter never sees a bag, and
--     nobody calls the customer. The food is still COOKED — `mms_fire_pending_food` lost its mode gate
--     in W3 — so it reaches the pass with no destination. A paid order that no staff surface shows.
--
-- ── M107 — "Make it now" fires an UNPAID pickup/scango line to the kitchen ──────────────────────
-- `mms_fire_line` requires an open cart and a `togo` line, which every pickup cart satisfies before
-- payment. Measured: `mms_fire_line(line) -> ok`, `state=fired`, cart `status=open`. `kitchen.ts`
-- reads carts `in ('open','paid')`, so the line lands on the KDS. Its own comment states the
-- invariant that nothing enforced: "pickup/scango only ever fire paid". Dine-in fires before payment
-- BY DESIGN (you are at a table and settle at the end); pickup and scan-and-go are pay-first, and the
-- settlement-time `mms_fire_pending_food` is the path that is supposed to reach the kitchen there.
--
-- ── The pattern both were missing already existed in this schema ────────────────────────────────
-- `mms_fire_cart` and `mms_fire_pending_food` both `join public.table_sessions s on s.id =
-- c.session_id` inside the write. These two RPCs simply never adopted it. Nothing here is a new idea;
-- it is two functions catching up with their three siblings.
--
-- ── Why a real `menu_items` row, and not m97's fabricated uuid ──────────────────────────────────
-- `mms_set_line_fulfillment` resolves the line's `tax_category` from `menu_items` and coalesces a
-- MISS to 'hot_prepared' — which is taxable both ways. A fabricated dish id would therefore make
-- every case below tax identically and the file would prove nothing about the one thing it measures.
-- (That coalesce is OPEN-ITEMS M17, filed and deliberately untouched here.) The fixture inserts its
-- own category + dish so it depends on no seed content, and rolls both back.
--
-- Run against any QR DB (rolls back — leaves NO data behind):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/m100_session_mode_authority_test.sql

begin;
-- W8: without this GUC every ASSERT below compiles out and the file exits 0 having proved nothing.
set local plpgsql.check_asserts = on;

do $$
declare
  ana   uuid := '00000000-0000-0000-0000-000001000a0a';
  cat   uuid := '00000000-0000-0000-0000-000001000ca7';
  dish  uuid := '00000000-0000-0000-0000-000001000d15';
  price integer := 1400;                    -- a cold-food line; the exact value never leaves this block
  tax_in  integer;                          -- what the ENGINE says a dine-in unit owes
  tax_out integer;                          -- …and a to-go one
  sess uuid; cart uuid; line uuid; ordid uuid;
  r text; v_ful text; v_tax integer; v_state text; n integer;
begin
  -- The tax engine is the fixture, never the expectation: ask it, don't transcribe it. If a future
  -- rate or category change makes cold food stop separating the two tags, THIS fails with a clear
  -- message instead of the cases below failing for a reason nobody can read.
  tax_in  := public.mms_line_tax(price, 'cold_food', true);
  tax_out := public.mms_line_tax(price, 'cold_food', false);
  assert tax_in > 0 and tax_out = 0,
    format('M100 fixture drift: cold food no longer separates dine-in (%s) from to-go (%s) — this '
           'test has nothing left to measure', tax_in, tax_out);

  insert into public.menu_categories (id, slug, name) values (cat, 'm100-fixture', 'M100 fixture');
  insert into public.menu_items (id, category_id, slug, name_en, base_price_cents, tax_category)
    values (dish, cat, 'm100-cold-dish', 'Pickled Tea Salad', price, 'cold_food');

  -- ══ 1. pickup session — the forged flip to dine-in is REFUSED ═════════════════════════════════
  sess := gen_random_uuid(); cart := gen_random_uuid(); line := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat)
    values (sess, 'M100S1', 'pickup', 'active', ana);
  insert into public.qr_carts (id, session_id) values (cart, sess);
  insert into public.qr_cart_items (id, cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (line, cart, dish::text, 'Pickled Tea Salad', 1, price, tax_out, ana, 'togo');

  r := public.mms_set_line_fulfillment(line, 'dinein');
  assert r = 'not_dinein_session',
    format('M100.1 THE DEFECT: a PICKUP session tagged a line dine-in and the RPC answered %L. The '
           'guest is charged tax CDTFA does not levy to-go, and the order leaves the pickup pipeline '
           'entirely — togo_status never stamps and the expo never sees a bag.', r);
  -- The refusal is only half of it: assert the ROW, because a function can refuse in its return value
  -- and still have written. (`.update()` returning no row count is this repo's most expensive lesson.)
  select fulfillment, tax_cents into v_ful, v_tax from public.qr_cart_items where id = line;
  assert v_ful = 'togo',
    format('M100.1 the RPC refused but the row moved anyway: fulfillment=%L', v_ful);
  assert v_tax = tax_out,
    format('M100.1 the RPC refused but re-taxed the line anyway: tax_cents=%s, expected %s. That is '
           'the whole over-charge, in cents, on one $%s unit.', v_tax, tax_out, price / 100.0);

  -- ══ 2. scango session — REFUSED too ══════════════════════════════════════════════════════════
  -- Not redundant with case 1: a guard mis-written as `mode = 'pickup'` (naming the mode it was found
  -- on instead of the one it must ALLOW) passes case 1 and fails here. This is the case that pins the
  -- predicate's polarity to `<> 'dinein'`.
  sess := gen_random_uuid(); cart := gen_random_uuid(); line := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat)
    values (sess, 'M100S2', 'scango', 'active', ana);
  insert into public.qr_carts (id, session_id) values (cart, sess);
  insert into public.qr_cart_items (id, cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (line, cart, dish::text, 'Pickled Tea Salad', 1, price, tax_out, ana, 'togo');

  r := public.mms_set_line_fulfillment(line, 'dinein');
  assert r = 'not_dinein_session',
    format('M100.2 a SCAN-AND-GO session tagged a line dine-in: %L', r);
  select fulfillment into v_ful from public.qr_cart_items where id = line;
  assert v_ful = 'togo', format('M100.2 the row moved on a refusal: %L', v_ful);

  -- ══ 3. dine-in session — the real toggle still WORKS, to-go → for-here ════════════════════════
  -- Over-blocking is as bad as under-blocking. This is the case a guard written as an unconditional
  -- refusal passes nowhere else: the actual product feature the two pills exist to drive.
  sess := gen_random_uuid(); cart := gen_random_uuid(); line := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat)
    values (sess, 'M100S3', 'dinein', 'active', ana);
  insert into public.qr_carts (id, session_id) values (cart, sess);
  insert into public.qr_cart_items (id, cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (line, cart, dish::text, 'Pickled Tea Salad', 1, price, tax_out, ana, 'togo');

  r := public.mms_set_line_fulfillment(line, 'dinein');
  assert r = 'ok',
    format('M100.3 the narrowing cost the legitimate toggle — a diner AT A TABLE can no longer move '
           'their own line to For here: %L', r);
  select fulfillment, tax_cents into v_ful, v_tax from public.qr_cart_items where id = line;
  assert v_ful = 'dinein', format('M100.3 the allowed flip did not land: fulfillment=%L', v_ful);
  assert v_tax = tax_in,
    format('M100.3 the allowed flip did not re-tax the line: tax_cents=%s, expected %s', v_tax, tax_in);

  -- ══ 4. dine-in session — and back the other way, for-here → to-go ═════════════════════════════
  r := public.mms_set_line_fulfillment(line, 'togo');
  assert r = 'ok', format('M100.4 the dine-in line could not go back to To go: %L', r);
  select fulfillment, tax_cents into v_ful, v_tax from public.qr_cart_items where id = line;
  assert v_ful = 'togo' and v_tax = tax_out,
    format('M100.4 the reverse flip left fulfillment=%L tax_cents=%s (expected togo / %s)',
           v_ful, v_tax, tax_out);

  -- ══ 5. pickup session — a line ALREADY dine-in can still be corrected to to-go ════════════════
  -- The guard is ONE-DIRECTIONAL on purpose. `dinein` is the value a non-dine-in session may not
  -- reach; `togo` is the value that repairs one. A guard written as "no toggling at all off a
  -- dine-in session" passes cases 1-4 and traps every already-mis-tagged line as permanently
  -- taxable, which is the exact damage this file exists to undo. Rows in this shape are reachable
  -- today (every line tagged before this migration applies) — this is not a synthetic case.
  sess := gen_random_uuid(); cart := gen_random_uuid(); line := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat)
    values (sess, 'M100S5', 'pickup', 'active', ana);
  insert into public.qr_carts (id, session_id) values (cart, sess);
  insert into public.qr_cart_items (id, cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (line, cart, dish::text, 'Pickled Tea Salad', 1, price, tax_in, ana, 'dinein');

  r := public.mms_set_line_fulfillment(line, 'togo');
  assert r = 'ok',
    format('M100.5 a pickup line already tagged dine-in cannot be corrected — the guard blocks the '
           'repair direction as well as the damage one: %L', r);
  select fulfillment, tax_cents into v_ful, v_tax from public.qr_cart_items where id = line;
  assert v_ful = 'togo' and v_tax = tax_out,
    format('M100.5 the correction did not land: fulfillment=%L tax_cents=%s', v_ful, v_tax);

  -- ══ 6. the consequence, end to end — the pickup order still reaches the counter ═══════════════
  -- Cases 1-2 pin the predicate; this one pins what the predicate is FOR. A single-line pickup cart
  -- is the sharp edge: `mms_init_togo_status` needs SOME togo/grocery line, so one mis-tagged line on
  -- a one-line order takes the whole order out of the expo pipeline. With the flip refused, the same
  -- settlement stamps `preparing` and the counter sees exactly one bag line.
  sess := gen_random_uuid(); cart := gen_random_uuid(); line := gen_random_uuid(); ordid := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat, pickup_slot)
    values (sess, 'M100S6', 'pickup', 'active', ana, '2099-01-01T18:00');
  insert into public.qr_carts (id, session_id, pickup_slot) values (cart, sess, '2099-01-01T18:00');
  insert into public.qr_cart_items (id, cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (line, cart, dish::text, 'Pickled Tea Salad', 1, price, tax_out, ana, 'togo');

  -- The forged flip happens while the cart is still OPEN (a `paid` cart would be refused by
  -- `not_open` before the mode gate was ever consulted, which would make this case prove nothing
  -- about the mode gate). Settlement is stamped below, in that order, exactly as production does it.
  perform public.mms_set_line_fulfillment(line, 'dinein');   -- refused; case 1 already asserted that
  -- The order row is inserted directly rather than via mms_fulfill_order: this case is about what the
  -- expo pipeline SEES, and routing through a ten-argument money RPC would couple the assertion to a
  -- signature that has nothing to do with it.
  --
  -- ⚠️ `status` is named EXPLICITLY, and that is the whole point of this line. `qr_orders.status`
  -- defaults to `'pending'`, and `mms_init_togo_status` never checks it — so the first version of
  -- this case asserted the PAID pickup pipeline against an UNPAID order and passed, exercising a
  -- state real settlement never produces. A fixture that reaches the right answer through a state
  -- the system cannot be in is not evidence (Codex round 1 on #220). The cart is stamped `paid` for
  -- the same reason: that is what settlement leaves behind, and `kitchen.ts` reads carts in
  -- ('open','paid').
  update public.qr_carts set status = 'paid' where id = cart;
  insert into public.qr_orders (id, cart_id, status, subtotal_cents, service_charge_cents, tax_cents, total_cents)
    values (ordid, cart, 'paid', price, 0, tax_out, price + tax_out);
  insert into public.qr_order_items (order_id, menu_item_id, name, qty, unit_price_cents, tax_cents, fulfillment)
    select ordid, ci.menu_item_id, ci.name, ci.qty, ci.unit_price_cents, ci.tax_cents, ci.fulfillment
      from public.qr_cart_items ci where ci.id = line;

  r := public.mms_init_togo_status(ordid, cart);
  assert r = 'preparing',
    format('M100.6 a PAID pickup order did not enter the pickup pipeline: togo_status=%L. NULL here '
           'means /track never leaves "Order placed" and the expo never shows a bag.', coalesce(r, 'NULL'));
  select count(*) into n from public.qr_order_items
    where order_id = ordid and fulfillment in ('togo','grocery');
  assert n = 1,
    format('M100.6 the expo sees %s line(s) on this paid pickup order, expected 1 — expo.ts reads '
           '.in("fulfillment",["togo","grocery"]), so 0 means nobody bags it and nobody calls the '
           'customer.', n);

  -- ══ 7. M107 — "Make it now" is REFUSED on an unpaid pickup cart ══════════════════════════════
  sess := gen_random_uuid(); cart := gen_random_uuid(); line := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat)
    values (sess, 'M100S7', 'pickup', 'active', ana);
  insert into public.qr_carts (id, session_id) values (cart, sess);
  insert into public.qr_cart_items (id, cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (line, cart, dish::text, 'Pickled Tea Salad', 1, price, tax_out, ana, 'togo');

  r := public.mms_fire_line(line);
  assert r = 'not_dinein_session',
    format('M107 THE DEFECT: an UNPAID pickup cart fired a line to the kitchen (%L). The cart is '
           'still open, and kitchen.ts reads carts in (open,paid) — so the food is cooked before '
           'anyone has paid for it, on a channel whose whole model is pay-first.', r);
  select state into v_state from public.qr_cart_items where id = line;
  assert v_state = 'draft',
    format('M107 the RPC refused but the line fired anyway: state=%L', v_state);

  -- ══ 8. M107 — scango too, and dine-in still fires ════════════════════════════════════════════
  -- Same polarity argument as case 2, and the same over-block argument as case 3: "Make it now" is a
  -- real dine-in affordance and must survive its own guard.
  sess := gen_random_uuid(); cart := gen_random_uuid(); line := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat)
    values (sess, 'M100S8', 'scango', 'active', ana);
  insert into public.qr_carts (id, session_id) values (cart, sess);
  insert into public.qr_cart_items (id, cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (line, cart, dish::text, 'Pickled Tea Salad', 1, price, tax_out, ana, 'togo');
  r := public.mms_fire_line(line);
  assert r = 'not_dinein_session', format('M107.2 a scan-and-go cart fired an unpaid line: %L', r);

  sess := gen_random_uuid(); cart := gen_random_uuid(); line := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat)
    values (sess, 'M100S9', 'dinein', 'active', ana);
  insert into public.qr_carts (id, session_id) values (cart, sess);
  insert into public.qr_cart_items (id, cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (line, cart, dish::text, 'Pickled Tea Salad', 1, price, tax_out, ana, 'togo');
  r := public.mms_fire_line(line);
  assert r = 'ok',
    format('M107.3 the narrowing cost "Make it now" at a real table — the to-go line a seated diner '
           'wants early can no longer be fired: %L', r);
  select state into v_state from public.qr_cart_items where id = line;
  assert v_state = 'fired', format('M107.3 the allowed fire did not land: state=%L', v_state);
  select count(*) into n from public.qr_cart_items where id = line and fire_at is not null;
  assert n = 1, 'M107.3 the allowed fire landed without a fire_at, so the KDS would never show it';
end $$;

select 'm100_session_mode_authority_test: ok' as result;

rollback;
