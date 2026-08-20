-- supabase/tests/m87_order_item_seat_test.sql  (M87 — registry M87)
--
-- Proves the attribution rule "your usual" is built on, none of which any vitest suite can see
-- (they all mock the database) and none of which `tsc` or the drift guard can reach:
--
--   1. The three fulfill RPCs CARRY the seat. Driven by the real functions, never by a hand-written
--      INSERT — W23d's sharpest review finding was a guard fed by a fixture, which proves the
--      fixture. Deleting `ci.by_seat` from any of the three must fail here and nowhere else.
--   2. A dine-in HOST does not inherit their guests' dishes. This is the whole reason W22e excluded
--      dine-in, and the reason M87 exists: the host pays, so `earned_by` is theirs, and before M87
--      that made every guest's dish theirs too. Two visits and the card would hand a stranger's
--      diet, religion or allergy back to them as their own taste.
--   3. A SPLIT order is attributable at all. Its `qr_orders` row has no payer (each share carries
--      its own PaymentIntent), so before M87 nobody could be recognised from a split table.
--   4. The pre-M87 fallback still counts. An order fulfilled before this migration has a null seat,
--      and the to-go habits a diner already had must not vanish on deploy day.
--   5. …but the fallback NEVER re-attributes a line whose seat is known to be somebody else's, and
--      never reaches dine-in — the two conditions that keep arm B from undoing arm A.
--   6. Voided, comped and refunded lines stay out.
--   7. `mms_usual_lines` is not reachable by a diner. It takes a uid, so an `authenticated` grant
--      would make it an endpoint for reading any stranger's eating habits.
--
-- Run against any QR DB (rolls back — leaves NO data behind):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/m87_order_item_seat_test.sql

begin;
-- W8: without this GUC every ASSERT below compiles out and the file exits 0 having proved nothing.
set local plpgsql.check_asserts = on;

-- ── fixtures ────────────────────────────────────────────────────────────────────────────────────
-- Two diners at one table: ANA hosts and pays, BEN is her guest. A third, CAI, eats alone.
insert into public.table_sessions (id, qr_code, mode, status, host_seat) values
  ('00000000-0000-0000-0000-000000887000'::uuid, 'M87DINE', 'dinein', 'active',
   '00000000-0000-0000-0000-0000008870a0'::uuid),
  ('00000000-0000-0000-0000-000000887001'::uuid, 'M87SOLO', 'dinein', 'active',
   '00000000-0000-0000-0000-0000008870c0'::uuid),
  ('00000000-0000-0000-0000-000000887002'::uuid, 'M87TOGO', 'pickup', 'active',
   '00000000-0000-0000-0000-0000008870a0'::uuid);
insert into public.session_members (session_id, seat_id, display_name, role) values
  ('00000000-0000-0000-0000-000000887000'::uuid, '00000000-0000-0000-0000-0000008870a0'::uuid, 'Ana', 'host'),
  ('00000000-0000-0000-0000-000000887000'::uuid, '00000000-0000-0000-0000-0000008870b0'::uuid, 'Ben', 'guest'),
  ('00000000-0000-0000-0000-000000887001'::uuid, '00000000-0000-0000-0000-0000008870c0'::uuid, 'Cai', 'host'),
  ('00000000-0000-0000-0000-000000887002'::uuid, '00000000-0000-0000-0000-0000008870a0'::uuid, 'Ana', 'host');

do $$
declare
  ana  uuid := '00000000-0000-0000-0000-0000008870a0';
  ben  uuid := '00000000-0000-0000-0000-0000008870b0';
  cai  uuid := '00000000-0000-0000-0000-0000008870c0';
  dish_a text := 'aaaaaaaa-0000-4000-8000-000000000d01';
  dish_b text := 'bbbbbbbb-0000-4000-8000-000000000d02';
  cart uuid; ord uuid; n integer; seat uuid;
begin
  -- ══ 1 + 2. dine-in: Ana hosts, pays, and orders dish A; Ben orders dish B ══════════════════════
  cart := gen_random_uuid();
  insert into public.qr_carts (id, session_id) values (cart, '00000000-0000-0000-0000-000000887000');
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (cart, dish_a, 'Mohinga', 1, 1000, 105, ana, 'dinein'),
           (cart, dish_b, 'Tea Leaf Salad', 1, 900, 95, ben, 'dinein');

  -- THE REAL WRITER. Not an INSERT into qr_order_items.
  --
  -- `p_settled_by` is NULL, and that is the realistic shape as well as the only legal one here:
  -- `qr_orders.settled_by` carries an FK to `staff`, so it is a STAFF id — the member who rang the
  -- order in — and a diner paying on their own phone leaves it null. (CI caught this: the first
  -- version passed a diner uid and the fulfill RPC raised on the foreign key.) It is also exactly
  -- the state `/staff/tips` reasons about when it refuses to split an unattributable bucket.
  ord := public.mms_fulfill_order(cart, 'pi_m87_dinein', 2100, 1900, 0, 0, 200, 0, null, 'card');
  update public.qr_orders set earned_by = ana where id = ord;  -- the webhook stamps the payer

  select count(*) into n from public.qr_order_items where order_id = ord and by_seat is not null;
  assert n = 2, format('M87.1 fulfill_order dropped the seat: %s of 2 lines carry by_seat', n);

  select by_seat into seat from public.qr_order_items where order_id = ord and menu_item_id = dish_b;
  assert seat = ben, 'M87.1 the seat on Ben''s line is not Ben''s';

  -- Ana chose dish A only. Before M87 she owned both, because she paid.
  select count(*) into n from public.mms_usual_lines(ana, now() - interval '90 days');
  assert n = 1, format('M87.2 the host owns %s dine-in lines; she chose 1', n);
  select count(*) into n from public.mms_usual_lines(ana, now() - interval '90 days')
    where menu_item_id = dish_b;
  assert n = 0, 'M87.2 THE defect: the host inherited her guest''s dish';

  -- …and Ben is recognised for his own dish although he paid nothing at all.
  select count(*) into n from public.mms_usual_lines(ben, now() - interval '90 days')
    where menu_item_id = dish_b;
  assert n = 1, 'M87.2 the guest who chose the dish is not credited with it';

  -- ══ 3. split: an order with NO payer on the row ════════════════════════════════════════════════
  cart := gen_random_uuid();
  insert into public.qr_carts (id, session_id, settle_expected_cents)
    values (cart, '00000000-0000-0000-0000-000000887001', 1000);
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (cart, dish_a, 'Mohinga', 1, 1000, 105, cai, 'dinein');
  insert into public.qr_cart_shares (cart_id, seat_id, status, amount_cents, subtotal_cents,
                                     discount_cents, service_charge_cents, tax_cents, tip_cents,
                                     stripe_payment_intent_id)
    values (cart, cai, 'captured', 1105, 1000, 0, 0, 105, 0, 'pi_m87_share');

  ord := public.mms_fulfill_split_order(cart);
  select by_seat into seat from public.qr_order_items where order_id = ord limit 1;
  assert seat = cai, 'M87.3 fulfill_split_order dropped the seat';
  select earned_by into seat from public.qr_orders where id = ord;
  assert seat is null, 'M87.3 fixture drift: a split order should carry no earner';
  select count(*) into n from public.mms_usual_lines(cai, now() - interval '90 days');
  assert n = 1, format('M87.3 a split diner is attributable %s times; expected 1', n);

  -- ══ 4 + 5. the pre-M87 fallback ═══════════════════════════════════════════════════════════════
  -- A to-go order fulfilled BEFORE this migration: seat null, payer Ana. Simulated by nulling the
  -- seat after the real writer ran — which is exactly the shape those rows have on disk.
  cart := gen_random_uuid();
  insert into public.qr_carts (id, session_id) values (cart, '00000000-0000-0000-0000-000000887002');
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (cart, dish_b, 'Tea Leaf Salad', 1, 900, 95, ana, 'togo');
  ord := public.mms_fulfill_order(cart, 'pi_m87_legacy', 995, 900, 0, 0, 95, 0, null, 'card');
  update public.qr_orders set earned_by = ana where id = ord;
  update public.qr_order_items set by_seat = null where order_id = ord;

  select count(*) into n from public.mms_usual_lines(ana, now() - interval '90 days')
    where order_id = ord;
  assert n = 1, 'M87.4 a pre-M87 to-go habit stopped counting — every regular loses their card on deploy day';

  -- 5a. the same legacy row, but DINE-IN: the payer must NOT be credited. This is the arm that stops
  -- the fallback from quietly undoing the fix for every order older than the migration.
  update public.qr_order_items set fulfillment = 'dinein' where order_id = ord;
  select count(*) into n from public.mms_usual_lines(ana, now() - interval '90 days')
    where order_id = ord;
  assert n = 0, 'M87.5a the fallback credited a DINE-IN line to the payer';
  update public.qr_order_items set fulfillment = 'togo' where order_id = ord;

  -- 5b. a to-go line whose seat is known to be BEN'S is never re-attributed to the payer.
  update public.qr_order_items set by_seat = ben where order_id = ord;
  select count(*) into n from public.mms_usual_lines(ana, now() - interval '90 days')
    where order_id = ord;
  assert n = 0, 'M87.5b a line we KNOW is Ben''s was credited to Ana because she paid';
  -- Scoped to THIS order: Ben already owns a dish_b line from the dine-in table above, so a
  -- menu_item_id filter here would count two and pass for the wrong reason.
  select count(*) into n from public.mms_usual_lines(ben, now() - interval '90 days')
    where order_id = ord;
  assert n = 1, 'M87.5b …and Ben lost the line that is his';

  -- ══ 6. voided / comped / refunded ═════════════════════════════════════════════════════════════
  -- Voided and comped never reach qr_order_items (the fulfill WHERE excludes them); refunded does,
  -- and W23b keeps the ORDER at status='paid', so the line's own ledger is the only signal.
  cart := gen_random_uuid();
  insert into public.qr_carts (id, session_id) values (cart, '00000000-0000-0000-0000-000000887002');
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment, state)
    values (cart, dish_a, 'Mohinga', 1, 1000, 105, cai, 'togo', 'voided');
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment, comped)
    values (cart, dish_a, 'Mohinga', 1, 1000, 105, cai, 'togo', true);
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (cart, dish_a, 'Mohinga', 1, 1000, 105, cai, 'togo');
  ord := public.mms_fulfill_order(cart, 'pi_m87_states', 1105, 1000, 0, 0, 105, 0, null, 'card');

  select count(*) into n from public.qr_order_items where order_id = ord;
  assert n = 1, format('M87.6 a voided or comped line was fulfilled: %s lines', n);

  update public.qr_order_items set refunded_cents = 1000 where order_id = ord;
  select count(*) into n from public.mms_usual_lines(cai, now() - interval '90 days')
    where order_id = ord;
  assert n = 0, 'M87.6 a refunded line still counts as a habit';

  -- ══ the window ════════════════════════════════════════════════════════════════════════════════
  select count(*) into n from public.mms_usual_lines(ben, now() + interval '1 day');
  assert n = 0, 'M87 the since-bound does not bound';
end $$;

-- ── 7. not diner-callable ───────────────────────────────────────────────────────────────────────
do $$
declare v_anon boolean; v_auth boolean;
begin
  select has_function_privilege('anon', 'public.mms_usual_lines(uuid, timestamptz)', 'execute')
    into v_anon;
  select has_function_privilege('authenticated', 'public.mms_usual_lines(uuid, timestamptz)', 'execute')
    into v_auth;
  assert not v_anon, 'M87.7 anon can execute mms_usual_lines — any stranger''s history is one POST away';
  assert not v_auth, 'M87.7 authenticated can execute mms_usual_lines — it takes a uid, so that is an endpoint for reading anyone';
end $$;

-- ── 8. the mutation this file exists to catch ───────────────────────────────────────────────────
-- Every assertion above rides `by_seat` reaching qr_order_items through the production writers. If a
-- future edit drops `ci.by_seat` from one of the three inserts, §1 fails for that writer and §2/§3
-- collapse with it. Named here so the next reader knows what to break to check this file still bites.
select 'm87_order_item_seat_test: ok' as result;

rollback;
