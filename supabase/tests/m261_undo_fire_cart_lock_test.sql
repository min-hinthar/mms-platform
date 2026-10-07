-- supabase/tests/m261_undo_fire_cart_lock_test.sql  (M261 · J37 — the undo locks the cart first; un-fire clears the batch)
--
-- Pins supabase/migrations/20261006120000_m261_undo_fire_cart_lock.sql: `mms_undo_fire(cart, batch)` takes
-- the cart row lock (`perform 1 … for update`) BEFORE it decides, as `mms_undo_counter_fire` does — and the
-- two facts `lib/undo-miss.ts` reads after a 0-row answer, which J37 now leans on for the DINER's undo too:
--
--   M261.1. an undo that matches NOTHING still stamps the cart row's `xmax` — the lock is taken first,
--           whatever the statement then decides. This proves the lock is TAKEN, never its ORDER against
--           a concurrent pay-lock or settle claim: that needs two sessions (OPEN-ITEMS P2fj). It cannot
--           tell `for update` from `for share` either.
--   J37.1.  an undo that lands leaves NO line carrying the batch (un-fire clears `fire_batch`) — so a
--           re-ask after a lost answer reads `gone` ("brought back"), never `expired`; and the re-ask
--           itself reverses 0 (the integer contract the live `if (!unfired)` reads is unchanged).
--   J37.2.  an undo AFTER the grace reverses 0 and the late lines KEEP the batch — so `undoMissReason`
--           reads `expired` ("the kitchen has it"), never `gone`, over dishes being cooked.
--   J37.3.  an in-grace undo SKIPS a comped line: it stays `fired`, comped, carrying the batch — the
--           kitchen is cooking it, and `undoMissReason` counts it (any state but `voided`).
--   J37.4.  an in-grace undo SKIPS a voided line: it stays `voided` and KEEPS the batch — the reason
--           `undoMissReason` filters `state <> 'voided'` (blind pass on #315): counted, a batch whose
--           undo landed beside a void re-asked as `expired` forever.
--
-- ⚠️ WHY M261.1 PROBES A CART NO LINE HAS TOUCHED. A line write runs the `qr_cart_items.cart_id` FK
-- check, which takes `FOR KEY SHARE` on the cart and stamps the very `xmax` this case reads — measured
-- for the fixtures' inserts (and on an UPDATE Postgres re-runs that check whenever the old row was
-- written by the CURRENT transaction, keys equal or not, so the fire and the undo stamp it too). Worse,
-- a later UPDATE of the cart CARRIES the self-held key-share lock onto its new tuple version (measured:
-- the same xid after `update qr_carts set updated_at = now()`), so "touch the cart, then probe" never
-- starts from 0 either. On a cart with no lines nothing but the function's own `perform` can lock the
-- row, so the probe goes red exactly when that line is deleted.
--
-- ⚠️ `now()` is the TRANSACTION start and this file is ONE transaction, so every fire's deadline is
-- now()+10s and `fire_at > now()` holds throughout; J37.2 moves `fire_at` into the past directly.
--
-- CI-only on the real schema: it needs the local stack (Docker). In the authoring environment it was run
-- against a throwaway Postgres 16 carrying every repo migration — M261.1 red against the M258 body (before
-- this migration was applied), all cases green after, and each verify-mode-authority row red on its
-- NAMED case by hand. Every case is falsified by name in scripts/verify-mode-authority.mjs (suite `m261`).
--
-- Run against any QR DB (rolls back — leaves NO data behind):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/m261_undo_fire_cart_lock_test.sql

begin;
-- W8: without this GUC every ASSERT below compiles out and the file exits 0 having proved nothing.
set local plpgsql.check_asserts = on;

do $$
declare
  ana    uuid := '00000000-0000-0000-0000-000000026100';
  dish   text := 'cccccccc-0000-4000-8000-000000000261';
  sess   uuid := gen_random_uuid();
  cart   uuid := gen_random_uuid();
  esess  uuid := gen_random_uuid();
  ecart  uuid := gen_random_uuid();
  l1 uuid; l2 uuid; l3 uuid; l4 uuid;
  v_state text; v_lbatch uuid; v_comped boolean;
  v_fired integer; v_batch uuid;
  v_xmax text;
  n integer;
begin
  -- ── fixtures: a dine-in table with two drafts (m258's shape), and a second table with NO lines ──
  insert into public.table_sessions (id, qr_code, mode, status, host_seat) values
    (sess,  'M261-1', 'dinein', 'active', ana),
    (esess, 'M261-2', 'dinein', 'active', ana);
  insert into public.qr_carts (id, session_id) values (cart, sess), (ecart, esess);
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (cart, dish, 'Mohinga', 1, 1400, 147, ana, 'dinein') returning id into l1;
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (cart, dish, 'Mohinga', 2, 1400, 147, ana, 'dinein') returning id into l2;

  -- ══ M261.1. the cart row lock is taken FIRST — even by an undo that reverses nothing ═══════════
  select c.xmax::text into v_xmax from public.qr_carts c where c.id = ecart;
  assert v_xmax = '0', format('fixture drift: the line-less cart is already locked (xmax %s) — nothing in this file may have touched it', v_xmax);
  n := public.mms_undo_fire(ecart, gen_random_uuid());
  assert n = 0, format('fixture: an undo on a cart with no lines reversed %s', n);
  select c.xmax::text into v_xmax from public.qr_carts c where c.id = ecart;
  assert v_xmax <> '0', 'M261.1 · mms_undo_fire did not lock the cart row before deciding — the M258 freshness legs read a snapshot one statement wide, so a pay lock committing after it is invisible and the undo flips a batch back under a create-intent that read zero drafts';

  -- ══ J37.1. a landed undo leaves no line carrying the batch; the re-ask reverses 0 ═════════════
  select f.fired, f.batch into v_fired, v_batch from public.mms_fire_cart(cart) f;
  assert v_fired = 2, format('fixture: the send fired %s lines, expected 2', v_fired);
  n := public.mms_undo_fire(cart, v_batch);
  assert n = 2, format('fixture: the in-grace undo reversed %s lines, expected 2', n);
  select count(*) into n from public.qr_cart_items where cart_id = cart and fire_batch = v_batch;
  assert n = 0, format('J37.1 · %s lines still carry the undone batch — undoMissReason reads that as `expired`, so every re-ask after a LOST answer says "already with the kitchen" over dishes that are drafts', n);
  n := public.mms_undo_fire(cart, v_batch);
  assert n = 0, format('J37.1 · a replayed undo of a batch already brought back reversed %s lines', n);

  -- ══ J37.2. an undo AFTER the grace reverses 0 and the late lines KEEP the batch ════════════════
  select f.fired, f.batch into v_fired, v_batch from public.mms_fire_cart(cart) f;
  assert v_fired = 2, format('fixture: the re-send fired %s lines, expected 2', v_fired);
  update public.qr_cart_items set fire_at = now() - interval '1 second' where fire_batch = v_batch;
  n := public.mms_undo_fire(cart, v_batch);
  assert n = 0, format('J37.2 · an undo AFTER the grace reversed %s lines the kitchen may be cooking', n);
  select count(*) into n from public.qr_cart_items
    where id in (l1, l2) and fire_batch = v_batch and state = 'fired';
  assert n = 2, format('J37.2 · %s of the 2 late lines still carry the batch, fired — without it undoMissReason answers `gone` ("brought back") over dishes being cooked', n);

  -- ══ J37.3 · J37.4. an in-grace undo skips a comped line and a voided one; both keep the batch ════
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (cart, dish, 'Mohinga', 1, 1400, 147, ana, 'dinein') returning id into l3;
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (cart, dish, 'Mohinga', 3, 1400, 147, ana, 'dinein') returning id into l4;
  select f.fired, f.batch into v_fired, v_batch from public.mms_fire_cart(cart) f;
  assert v_fired = 2, format('fixture: the third send fired %s lines, expected 2 (l3, l4)', v_fired);
  -- Staff comp l3 and void l4 inside the grace (the fixture writes the row facts the comp and the void
  -- leave; the undo reads nothing else).
  update public.qr_cart_items set comped = true where id = l3;
  update public.qr_cart_items set state = 'voided' where id = l4;
  n := public.mms_undo_fire(cart, v_batch);
  select ci.state, ci.fire_batch, ci.comped into v_state, v_lbatch, v_comped from public.qr_cart_items ci where ci.id = l3;
  assert v_state = 'fired' and v_lbatch = v_batch and v_comped,
    format('J37.3 · the in-grace undo turned a COMPED line into %s (batch %s) — the comped dish pulled off the KDS as an unsent draft, its comp row describing a line no longer fired, and undoMissReason loses the dish the kitchen is cooking', v_state, coalesce(v_lbatch::text, 'cleared'));
  select ci.state, ci.fire_batch into v_state, v_lbatch from public.qr_cart_items ci where ci.id = l4;
  assert v_state = 'voided' and v_lbatch = v_batch,
    format('J37.4 · the in-grace undo turned a VOIDED line into %s (batch %s) — a voided dish back on the order as a draft', v_state, coalesce(v_lbatch::text, 'cleared'));
  assert n = 0, format('fixture: the undo over a comped and a voided line reversed %s, expected 0', n);

  raise notice 'm261_undo_fire_cart_lock_test: all cases passed';
end $$;

rollback;
