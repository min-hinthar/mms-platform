-- supabase/tests/staff_fire_undo_test.sql  (Phase 2a · padserver — the staff Send and its Undo)
--
-- Phase 2a gives the staff console a Send and a 10-second Undo over the EXISTING
-- `mms_fire_cart(p_cart_id)` / `mms_undo_fire(p_cart_id, p_batch)` (20260624030000_s4_money_remediation
-- — the live definitions; no migration in this phase). Staff Send fires DINER-added drafts too
-- (`mms_fire_cart` is per cart), and two tablets can send the same table seconds apart, so the one
-- property the staff Undo leans on is BATCH ISOLATION: an Undo reverses exactly the lines ITS send
-- stamped and never a line another send (or another cart) stamped. This file pins that property and
-- its neighbours from the database side:
--
--   1. a fire stamps ONE batch on every dine-in draft of a dine-in table (a to-go draft waits), with
--      `fire_at` equal to the deadline the function returns;
--   2. a draft added AFTER the fire is still a draft and is not in that batch;
--   3. a second send fires only the new draft, under a NEW batch; a send with nothing draft fires 0;
--   4. Undo(A) reverses only batch A — batch B stays fired; a replayed Undo(A) reverses 0;
--   5. an Undo carrying ANOTHER cart's batch reverses nothing on either cart;
--   6. an Undo after the deadline reverses 0 — the kitchen may already be cooking;
--   7. a pickup session fires 0, even for a line tagged dine-in (the mode guard, not the tag).
--
-- ⚠️ `now()` is the TRANSACTION start time and this whole file is one transaction, so every fire's
-- deadline is the same instant and `fire_at > now()` is always true in here. Case 6 therefore moves
-- the batch's `fire_at` into the past directly rather than waiting ten seconds.
--
-- CI-only: it needs the local stack (Docker). Written against the migrations' signatures and never
-- run in the authoring environment — the first CI run is its first run.
--
-- Run against any QR DB (rolls back — leaves NO data behind):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/staff_fire_undo_test.sql

begin;
-- W8: without this GUC every ASSERT below compiles out and the file exits 0 having proved nothing.
set local plpgsql.check_asserts = on;

do $$
declare
  ana   uuid := '00000000-0000-0000-0000-0000002a00a0';
  dish  text := 'cccccccc-0000-4000-8000-0000000002a1';
  sess  uuid := gen_random_uuid();
  cart  uuid := gen_random_uuid();
  sess2 uuid := gen_random_uuid();
  cart2 uuid := gen_random_uuid();
  psess uuid := gen_random_uuid();
  pcart uuid := gen_random_uuid();
  l1 uuid; l2 uuid; l3 uuid; t1 uuid; o1 uuid; p1 uuid;
  v_fired integer; v_batch_a uuid; v_batch_b uuid; v_batch_c uuid; v_batch_d uuid; v_batch_x uuid;
  v_deadline timestamptz;
  n integer;
begin
  -- ── fixtures: a dine-in table, a second dine-in table, a pickup order ────────────────────────
  insert into public.table_sessions (id, qr_code, mode, status, host_seat) values
    (sess,  'P2AFU-1', 'dinein', 'active', ana),
    (sess2, 'P2AFU-2', 'dinein', 'active', ana),
    (psess, 'P2AFU-P', 'pickup', 'active', ana);
  insert into public.qr_carts (id, session_id) values (cart, sess), (cart2, sess2), (pcart, psess);

  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (cart, dish, 'Mohinga', 1, 1400, 147, null, 'dinein') returning id into l1;
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (cart, dish, 'Mohinga', 2, 1400, 147, ana, 'dinein') returning id into l2;   -- a diner's own draft
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (cart, dish, 'Mohinga', 1, 1400, 147, null, 'togo') returning id into t1;    -- to-go waits
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (cart2, dish, 'Mohinga', 1, 1400, 147, null, 'dinein') returning id into o1;
  -- Tagged dine-in on purpose: only the session's MODE may stop this line firing (case 7).
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (pcart, dish, 'Mohinga', 1, 1400, 147, null, 'dinein') returning id into p1;

  select count(*) into n from public.qr_cart_items
    where cart_id in (cart, cart2, pcart) and state = 'draft' and fire_batch is null and fire_at is null;
  assert n = 5, format('fixture drift: expected 5 unfired drafts, found %s', n);

  -- ══ 1. the first send stamps ONE batch on the dine-in drafts ══════════════════════════════════
  select f.fired, f.batch, f.fire_deadline into v_fired, v_batch_a, v_deadline
    from public.mms_fire_cart(cart) f;
  assert v_fired = 2, format('1 · the first send fired %s lines, expected the 2 dine-in drafts', v_fired);
  assert v_batch_a is not null, '1 · the send returned no batch — the Undo would have nothing to key on';
  assert v_deadline = now() + interval '10 seconds',
    format('1 · the send''s deadline is %s, expected now() + 10s', v_deadline);
  select count(*) into n from public.qr_cart_items
    where id in (l1, l2) and state = 'fired' and fire_batch = v_batch_a and fire_at = v_deadline;
  assert n = 2, format('1 · %s of the 2 dine-in drafts carry batch A at the returned deadline', n);
  select count(*) into n from public.qr_cart_items
    where id = t1 and state = 'draft' and fire_batch is null and fire_at is null;
  assert n = 1, '1 · the to-go draft fired with the table''s send — it waits for checkout';
  select count(*) into n from public.qr_cart_items where id = o1 and state = 'draft';
  assert n = 1, '1 · a send on one table fired a line on ANOTHER table';

  -- ══ 2. a draft added after the send is not in its batch ═══════════════════════════════════════
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (cart, dish, 'Mohinga', 1, 1400, 147, null, 'dinein') returning id into l3;
  select count(*) into n from public.qr_cart_items where id = l3 and state = 'draft' and fire_batch is null;
  assert n = 1, '2 · the post-send draft is not a plain draft';
  select count(*) into n from public.qr_cart_items where fire_batch = v_batch_a;
  assert n = 2, format('2 · batch A holds %s lines, expected exactly the 2 it stamped', n);

  -- ══ 3. a second send (another tablet) fires only the new draft, under a NEW batch ═════════════
  select f.fired, f.batch into v_fired, v_batch_b from public.mms_fire_cart(cart) f;
  assert v_fired = 1, format('3 · the second send fired %s lines, expected only the new draft', v_fired);
  assert v_batch_b is not null and v_batch_b <> v_batch_a, '3 · the second send reused batch A';
  select count(*) into n from public.qr_cart_items where id = l3 and state = 'fired' and fire_batch = v_batch_b;
  assert n = 1, '3 · the new draft is not in batch B';
  select count(*) into n from public.qr_cart_items where fire_batch = v_batch_a;
  assert n = 2, format('3 · the second send re-stamped batch A''s lines (%s left in A)', n);

  -- …and a send with nothing draft fires nothing (the to-go draft still does not count).
  select f.fired, f.batch into v_fired, v_batch_x from public.mms_fire_cart(cart) f;
  assert v_fired = 0, format('3 · a send with nothing dine-in draft fired %s lines', v_fired);
  select count(*) into n from public.qr_cart_items where fire_batch = v_batch_x;
  assert n = 0, format('3 · an empty send stamped its batch on %s lines', n);

  -- ══ 4. Undo(A) reverses ONLY batch A ══════════════════════════════════════════════════════════
  n := public.mms_undo_fire(cart, v_batch_a);
  assert n = 2, format('4 · Undo(A) reversed %s lines, expected the 2 batch A stamped', n);
  select count(*) into n from public.qr_cart_items
    where id in (l1, l2) and state = 'draft' and fire_batch is null and fire_at is null;
  assert n = 2, format('4 · %s of batch A''s lines are clean drafts again (fire_at/fire_batch cleared)', n);
  select count(*) into n from public.qr_cart_items where id = l3 and state = 'fired' and fire_batch = v_batch_b;
  assert n = 1, '4 · THE DEFECT: Undo(A) reversed the OTHER tablet''s batch B';
  -- A replayed Undo (a double tap, a retried request) reverses nothing more.
  n := public.mms_undo_fire(cart, v_batch_a);
  assert n = 0, format('4 · a replayed Undo(A) reversed %s lines', n);
  n := public.mms_undo_fire(cart, v_batch_b);
  assert n = 1, format('4 · Undo(B) reversed %s lines, expected its 1', n);
  select count(*) into n from public.qr_cart_items where id = l3 and state = 'draft' and fire_batch is null;
  assert n = 1, '4 · batch B''s line is not a clean draft after Undo(B)';

  -- ══ 5. an Undo carrying another cart's batch reverses nothing ═════════════════════════════════
  select f.fired, f.batch into v_fired, v_batch_c from public.mms_fire_cart(cart2) f;
  assert v_fired = 1, format('5 · fixture: the second table''s send fired %s lines', v_fired);
  n := public.mms_undo_fire(cart, v_batch_c);
  assert n = 0, format('5 · an Undo on table 1 with table 2''s batch reversed %s lines', n);
  select count(*) into n from public.qr_cart_items where id = o1 and state = 'fired' and fire_batch = v_batch_c;
  assert n = 1, '5 · table 2''s line was reversed by an Undo addressed to table 1';

  -- ══ 6. an Undo after the deadline reverses nothing ════════════════════════════════════════════
  select f.fired, f.batch into v_fired, v_batch_d from public.mms_fire_cart(cart) f;
  assert v_fired = 3, format('6 · fixture: the re-send fired %s lines, expected l1, l2, l3', v_fired);
  update public.qr_cart_items set fire_at = now() - interval '1 second' where fire_batch = v_batch_d;
  get diagnostics n = row_count;
  assert n = 3, format('6 · fixture: moved %s lines past the deadline, expected 3', n);
  n := public.mms_undo_fire(cart, v_batch_d);
  assert n = 0, format('6 · an Undo AFTER the deadline reversed %s lines the kitchen may be cooking', n);
  select count(*) into n from public.qr_cart_items where fire_batch = v_batch_d and state = 'fired';
  assert n = 3, format('6 · %s of 3 late lines are still fired', n);

  -- ══ 7. a pickup session fires nothing, even a dine-in-tagged line ═════════════════════════════
  -- PRE-CONDITION: open cart, draft line tagged dine-in — only the MODE differs from case 1.
  select count(*) into n from public.qr_cart_items ci join public.qr_carts c on c.id = ci.cart_id
    where ci.id = p1 and c.status = 'open' and ci.state = 'draft' and ci.fulfillment = 'dinein';
  assert n = 1, '7 · DEGENERATE FIXTURE: something other than the session mode would stop this fire';
  select f.fired into v_fired from public.mms_fire_cart(pcart) f;
  assert v_fired = 0, format('7 · a PICKUP session fired %s lines — pickup is pay-first', v_fired);
  select count(*) into n from public.qr_cart_items where id = p1 and state = 'draft' and fire_batch is null;
  assert n = 1, '7 · the pickup line is no longer a plain draft';

  raise notice 'staff_fire_undo_test: all cases passed';
end $$;

rollback;
