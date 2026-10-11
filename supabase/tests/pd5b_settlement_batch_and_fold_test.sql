-- supabase/tests/pd5b_settlement_batch_and_fold_test.sql  (PD5b — settlement food marked; a merge keeps each Send whole)
--
-- Pins supabase/migrations/20261009120300_pd5b_settlement_batch_and_fold.sql:
--
--   PD5B.1. `mms_fire_pending_food` fires a paid cart's drafts under ONE batch minted as a version-8
--           UUID — character 15 is '8', and the RFC variant (character 20) is kept. The kitchen read
--           (`isSettlementBatch`, apps/qr/lib/kitchen-rounds.ts) tells settlement food from a Send by
--           exactly this, so the mark must be there for every line it fires, dine-in and to-go.
--   PD5B.2. a Send never carries the mark: the batch `mms_fire_cart` returns, and make-it-now's
--           (`mms_fire_line`), are version 4. The classification is positive only if no Send can wear it.
--   PD5B.3. THE GRACE RACE, in order: a Send fires (its deadline 10 s out), then the guest's payment is
--           recorded and the settlement fires the drafts that are left. The Send's line keeps its OWN
--           unmarked batch — still fired, still inside its grace — and only the settlement's line is
--           marked. Before PD5b the kitchen read numbered by WHEN a batch fired, and this Send (fired
--           after the order) lost its number. The two-session version — the settlement fire WAITING on
--           the Send's line lock, and the reverse — is scripts/verify-counter-fire-race.mjs (s · s2).
--   PD5B.4. a merge never folds a FIRED portion onto another Send's line: same dish, price, adder and
--           state, two different batches — the source line re-parents as its own row and keeps its
--           batch, and the target line's quantity is unchanged.
--   PD5B.5. …nor an IN-PROGRESS one (the term names both cooking states).
--   PD5B.6. the term COMPARES batches; it does not refuse every cooking fold: two fired lines of the
--           SAME batch still fold.
--   PD5B.7. served lines fold exactly as before, whatever their batches — no card is cooking them.
--   PD5B.8. two BATCHLESS fired lines (fired before S2 stamped batches) still fold — `is not distinct
--           from`, not `=`.
--   PD5B.9. drafts fold exactly as before — including two drafts that each carry a STALE batch (a fired
--           line Mom brought back to draft keeps its `fire_batch`; `mms_line_transition` never clears
--           it). The coordinator's rule: "a draft fold must still work exactly as today".
--
-- ⚠️ `now()` is the TRANSACTION start and this file is ONE transaction, so a Send's deadline is now()+10s
-- and `fire_at > now()` holds throughout — exactly the window PD5B.3 needs.
--
-- Run against the throwaway Postgres 16 carrying every repo migration before CI: PD5B.1 red against the
-- w3 body (before the migration), PD5B.4 red against the p2f merge, all cases green after, and each
-- verify-mode-authority row (suite `pd5b`) red on its NAMED case. Rolls back — leaves NO data behind:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/pd5b_settlement_batch_and_fold_test.sql

begin;
-- W8: without this GUC every ASSERT below compiles out and the file exits 0 having proved nothing.
set local plpgsql.check_asserts = on;

do $$
declare
  ana   uuid := '00000000-0000-0000-0000-0000000005b0';
  dish  text := 'cccccccc-0000-4000-8000-0000000005b0';
  sess  uuid := gen_random_uuid();
  cart  uuid := gen_random_uuid();
  ssess uuid := gen_random_uuid();
  scart uuid := gen_random_uuid();
  l1 uuid; l2 uuid; l3 uuid;
  v_fired integer; v_batch uuid; v_b1 uuid; v_b2 uuid; v_b3 uuid;
  v_state text; v_fire_at timestamptz;
  n integer;
begin
  -- ══ PD5B.1. the settlement batch is ONE batch, version 8, RFC variant kept ═════════════════════
  insert into public.table_sessions (id, qr_code, mode, status, host_seat) values (sess, 'PD5B-1', 'dinein', 'active', ana);
  insert into public.qr_carts (id, session_id) values (cart, sess);
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (cart, dish, 'Mohinga', 1, 1400, 147, ana, 'dinein') returning id into l1;
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (cart, dish, 'Tea leaf salad', 1, 1200, 126, ana, 'togo') returning id into l2;
  update public.qr_carts set status = 'paid' where id = cart;
  n := public.mms_fire_pending_food(cart);
  assert n = 2, format('fixture: the settlement fired %s lines, expected 2', n);
  select count(distinct fire_batch), min(fire_batch::text)::uuid into n, v_batch
    from public.qr_cart_items where cart_id = cart and state = 'fired';
  assert n = 1, format('PD5B.1 · the settlement fired its lines under %s batches, expected ONE', n);
  assert substr(v_batch::text, 15, 1) = '8',
    format('PD5B.1 · the settlement batch %s is not version 8 — the kitchen read cannot tell settlement food from a Send, so a hostless table paid at the counter with drafts numbers its next Send "Round 3"', v_batch);
  assert substr(v_batch::text, 20, 1) in ('8', '9', 'a', 'b'),
    format('PD5B.1 · the settlement batch %s lost the RFC variant', v_batch);

  -- ══ PD5B.2. a Send never wears the mark: mms_fire_cart and make-it-now are version 4 ═════════════
  insert into public.table_sessions (id, qr_code, mode, status, host_seat) values (ssess, 'PD5B-2', 'dinein', 'active', ana);
  insert into public.qr_carts (id, session_id) values (scart, ssess);
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (scart, dish, 'Mohinga', 1, 1400, 147, ana, 'dinein') returning id into l1;
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (scart, dish, 'Tea leaf salad', 1, 1200, 126, ana, 'togo') returning id into l2;
  select f.fired, f.batch into v_fired, v_batch from public.mms_fire_cart(scart) f;
  assert v_fired = 1, format('fixture: the Send fired %s lines, expected 1 (dine-in only)', v_fired);
  assert substr(v_batch::text, 15, 1) = '4',
    format('PD5B.2 · a Send''s batch %s is not version 4 — it would read as settlement food and lose its number', v_batch);
  assert public.mms_fire_line(l2) = 'ok', 'fixture: make-it-now did not fire the to-go line';
  select fire_batch into v_batch from public.qr_cart_items where id = l2;
  assert substr(v_batch::text, 15, 1) = '4',
    format('PD5B.2 · make-it-now''s batch %s is not version 4', v_batch);

  -- ══ PD5B.3. the grace race: Send, then the payment lands inside its grace, then the settlement ══
  -- (`scart` from PD5B.2: l1 was Sent with a deadline 10 s out, l2 fired by make-it-now; a new
  -- dine-in draft is the food the table had not sent when the guest paid.)
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (scart, dish, 'Shan noodles', 1, 1300, 137, ana, 'dinein') returning id into l3;
  select fire_batch into v_b1 from public.qr_cart_items where id = l1;
  update public.qr_carts set status = 'paid' where id = scart;   -- the guest's payment, recorded in the grace
  n := public.mms_fire_pending_food(scart);
  assert n = 1, format('fixture: the settlement fired %s lines, expected 1 (only the unsent draft)', n);
  select state, fire_at, fire_batch into v_state, v_fire_at, v_b2 from public.qr_cart_items where id = l1;
  assert v_state = 'fired' and v_fire_at > now() and v_b2 = v_b1,
    format('PD5B.3 · the Send''s line changed under the settlement (state %s, in grace %s, same batch %s)', v_state, v_fire_at > now(), v_b2 = v_b1);
  assert substr(v_b2::text, 15, 1) = '4',
    'PD5B.3 · the Send fired inside the grace before the payment reads as settlement food — it loses its number and the visit''s later Sends count one fewer';
  select fire_batch into v_b3 from public.qr_cart_items where id = l3;
  assert v_b3 <> v_b1 and substr(v_b3::text, 15, 1) = '8',
    format('PD5B.3 · the food the table had not sent fired under %s, not its own marked settlement batch', v_b3);
end $$;

-- ── the fold cases: two dine-in tables, both open, one Mohinga line each (no seat, no note) ─────────
create function pg_temp.pd5b_merge(p_src_state text, p_src_batch uuid, p_tgt_state text, p_tgt_batch uuid)
  returns table(target_rows integer, target_qty integer, moved_batch uuid)
  language plpgsql as $f$
declare
  dish text := 'cccccccc-0000-4000-8000-0000000005b0';
  s1 uuid := gen_random_uuid(); c1 uuid := gen_random_uuid();
  s2 uuid := gen_random_uuid(); c2 uuid := gen_random_uuid();
  fa timestamptz := case when p_src_state = 'draft' then null else now() - interval '1 minute' end;
  fb timestamptz := case when p_tgt_state = 'draft' then null else now() - interval '1 minute' end;
begin
  insert into public.table_sessions (id, qr_code, mode, status) values
    (s1, 'PD5B-S-' || s1, 'dinein', 'active'), (s2, 'PD5B-T-' || s2, 'dinein', 'active');
  insert into public.qr_carts (id, session_id) values (c1, s1), (c2, s2);
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, fulfillment,
                                    state, fire_at, fire_batch, started_at, bumped_at)
    values (c1, dish, 'Mohinga', 1, 1400, 147, 'dinein', p_src_state, fa, p_src_batch,
            case when p_src_state in ('in_progress', 'served') then fa end,
            case when p_src_state = 'served' then fa end),
           (c2, dish, 'Mohinga', 1, 1400, 147, 'dinein', p_tgt_state, fb, p_tgt_batch,
            case when p_tgt_state in ('in_progress', 'served') then fb end,
            case when p_tgt_state = 'served' then fb end);
  perform public.mms_merge_table_orders(c1, c2);
  return query
    select count(*)::integer, sum(qty)::integer,
           (select ci.fire_batch from public.qr_cart_items ci
             where ci.cart_id = c2 and ci.fire_batch is not distinct from p_src_batch
               and ci.fire_batch is distinct from p_tgt_batch limit 1)
      from public.qr_cart_items where cart_id = c2;
end $f$;

do $$
declare
  b1 uuid := gen_random_uuid();
  b2 uuid := gen_random_uuid();
  r record;
begin
  -- ══ PD5B.4. a FIRED portion never folds onto another Send's line ═══════════════════════════════
  select * into r from pg_temp.pd5b_merge('fired', b1, 'fired', b2);
  assert r.target_rows = 2 and r.target_qty = 2 and r.moved_batch = b1,
    format('PD5B.4 · the merge folded a fired portion of one Send onto another Send''s line (target rows %s, moved batch kept %s) — it cooks on the other card with no bump, and its own card shrinks', r.target_rows, r.moved_batch = b1);

  -- ══ PD5B.5. …nor an IN-PROGRESS one ═════════════════════════════════════════════════════════════
  select * into r from pg_temp.pd5b_merge('in_progress', b1, 'in_progress', b2);
  assert r.target_rows = 2 and r.moved_batch = b1,
    format('PD5B.5 · the merge folded an in-progress portion of one Send onto another Send''s line (target rows %s)', r.target_rows);

  -- ══ PD5B.6. the same Send's cooking portions still fold — the term compares, it does not refuse ═
  select * into r from pg_temp.pd5b_merge('fired', b1, 'fired', b1);
  assert r.target_rows = 1 and r.target_qty = 2,
    format('PD5B.6 · two fired lines of the SAME batch no longer fold (target rows %s) — the term refuses every cooking fold instead of comparing the Send', r.target_rows);

  -- ══ PD5B.7. served lines fold exactly as before, whatever their batches ════════════════════════
  select * into r from pg_temp.pd5b_merge('served', b1, 'served', b2);
  assert r.target_rows = 1 and r.target_qty = 2,
    format('PD5B.7 · served lines of two Sends no longer fold (target rows %s) — the batch term reached a state no card is cooking', r.target_rows);

  -- ══ PD5B.8. two BATCHLESS fired lines still fold (`is not distinct from`, never `=`) ═══════════
  select * into r from pg_temp.pd5b_merge('fired', null, 'fired', null);
  assert r.target_rows = 1 and r.target_qty = 2,
    format('PD5B.8 · two batchless fired lines no longer fold (target rows %s) — null = null is null, so the match refused them', r.target_rows);

  -- ══ PD5B.9. drafts fold exactly as before — even two that each carry a STALE batch ════════════
  select * into r from pg_temp.pd5b_merge('draft', null, 'draft', null);
  assert r.target_rows = 1 and r.target_qty = 2,
    format('PD5B.9 · two plain drafts no longer fold (target rows %s)', r.target_rows);
  select * into r from pg_temp.pd5b_merge('draft', b1, 'draft', b2);
  assert r.target_rows = 1 and r.target_qty = 2,
    format('PD5B.9 · two drafts carrying stale batches no longer fold (target rows %s) — a dish Mom brought back to draft keeps its batch, and a draft fold must work exactly as before', r.target_rows);
end $$;

rollback;
