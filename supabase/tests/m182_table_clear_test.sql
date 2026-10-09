-- supabase/tests/m182_table_clear_test.sql  (M182 · P2hf · M198 · PD7 — the table-clear RPC)
--
-- Pins supabase/migrations/20261009120400_m182_table_clear.sql: privileges; every refusal (a counter
-- order, a closed table, money in flight, a live card attempt, a join after the look, a dish added
-- after it, a SENT set or a figure that is not the one shown, the PIN seam's three refusals) AND, for
-- each, the legitimate clear it must NOT over-block; ruling #6's loss rows (every SENT dish, void /
-- table_cleared, gate 'unapproved' unless a manager approved); the kitchen lines voided, the in-grace
-- ones back to draft (M198's clear half); the pending requests superseded (D2); the durable stop record
-- and its acknowledgement (Codex correction 12). Every refusal is checked to have WRITTEN NOTHING.
--
-- ⚠️ `now()` is the TRANSACTION start and this file is ONE transaction: a row inserted here has
-- `created_at = now()`. "The look" is `p_seen_at`; a look BEFORE a row is `now() - 1 minute`, a look
-- AT it is `now()` (a row is newer than the look only when strictly after it). A line past its grace
-- is made so by setting `fire_at` into the past, never by waiting.
--
-- Red-first: plpgsql ASSERT stops at the FIRST failure, so a red-then-green run proves one case.
--
-- Run against any QR DB (rolls back — leaves NO data behind):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/m182_table_clear_test.sql

begin;
-- W8: without this GUC every ASSERT below compiles out and the file exits 0 having proved nothing.
set local plpgsql.check_asserts = on;

-- ── fixtures: a manager, two servers ──────────────────────────────────────────────────────────
insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000182a00'),
  ('00000000-0000-0000-0000-000000182b00'),
  ('00000000-0000-0000-0000-000000182c00');
insert into public.staff (user_id, role, display_name, active) values
  ('00000000-0000-0000-0000-000000182a00', 'manager', 'M182 Manager', true),
  ('00000000-0000-0000-0000-000000182b00', 'server',  'M182 Server',  true),
  ('00000000-0000-0000-0000-000000182c00', 'server',  'M182 Other',   true);

-- A dine-in table with an open cart (or none). Returns the SESSION; its open cart is found by it.
create or replace function pg_temp.m182_table(p_code text, p_with_cart boolean default true,
                                              p_mode text default 'dinein')
  returns uuid language plpgsql as $$
declare v_sess uuid;
begin
  insert into public.table_sessions (qr_code, mode, status, expires_at)
    values (p_code, p_mode, 'active', now() + interval '4 hours') returning id into v_sess;
  if p_with_cart then
    insert into public.qr_carts (session_id) values (v_sess);
  end if;
  return v_sess;
end $$;

create or replace function pg_temp.m182_cart(p_sess uuid) returns uuid language sql as $$
  select id from public.qr_carts where session_id = p_sess and status = 'open'
$$;

create or replace function pg_temp.m182_line(p_sess uuid, p_price integer, p_qty integer default 1,
                                             p_state text default 'draft',
                                             p_fire_at timestamptz default null,
                                             p_comped boolean default false,
                                             p_fulfillment text default 'dinein')
  returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents,
                                    fulfillment, state, fire_at, comped)
    values (pg_temp.m182_cart(p_sess), 'cccccccc-0000-4000-8000-000000000182', 'Mohinga', p_qty,
            p_price, 0, p_fulfillment, p_state, p_fire_at, p_comped)
    returning id into v_id;
  return v_id;
end $$;

-- The clear, as the server writes it: the server cleared, the look at `p_seen_at`.
create or replace function pg_temp.m182_clear(p_sess uuid, p_expected uuid[], p_loss integer,
                                              p_seen timestamptz default now(),
                                              p_approver uuid default null,
                                              p_by uuid default '00000000-0000-0000-0000-000000182b00')
  returns jsonb language sql as $$
  select public.mms_clear_table(p_sess, p_by, p_seen, p_expected, p_loss, p_approver)
$$;

-- Nothing was written: the session active, its cart open, no clear row, no loss row.
create or replace function pg_temp.m182_untouched(p_sess uuid) returns boolean language sql as $$
  select (select status from public.table_sessions where id = p_sess) = 'active'
     and not exists (select 1 from public.qr_carts where session_id = p_sess and status <> 'open')
     and not exists (select 1 from public.qr_table_clears where session_id = p_sess)
     and not exists (select 1 from public.mms_approvals
                      where session_id = p_sess and reason_code = 'table_cleared')
$$;

-- ══ M182.0 · privileges, RLS, and the seam's default ═════════════════════════════════════════
do $$
declare r record; seen integer := 0;
        want text[] := array['mms_clear_table', 'mms_ack_table_clear_stop'];
begin
  for r in select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = any(want) loop
    seen := seen + 1;
    assert not has_function_privilege('anon', r.oid, 'execute')
       and not has_function_privilege('authenticated', r.oid, 'execute')
       and has_function_privilege('service_role', r.oid, 'execute'),
      format('M182.0 · %s must be service_role-only', r.proname);
  end loop;
  assert seen = cardinality(want),
    format('M182.0 · checked %s functions, want exactly %s (one per name)', seen, cardinality(want));
  assert (select relrowsecurity from pg_class where oid = 'public.qr_table_clears'::regclass),
    'M182.0 · qr_table_clears has RLS on';
  assert not has_table_privilege('anon', 'public.qr_table_clears', 'select')
     and not has_table_privilege('authenticated', 'public.qr_table_clears', 'select')
     and not has_table_privilege('authenticated', 'public.qr_table_clears', 'insert'),
    'M182.0 · diners can neither read nor write the clear record';
  assert (select clear_requires_pin from public.mms_loss_config where id) is false,
    'M182.0 · the PIN seam ships OFF (ruling #6: a clear never waits)';
end $$;

-- ══ M182.1 · a table that is not there, already closed, or a counter order ══════════════════
do $$
declare s uuid; j jsonb;
begin
  j := pg_temp.m182_clear(gen_random_uuid(), '{}', 0);
  assert j->>'status' = 'not_found', format('M182.1 · an unknown session is not_found (%s)', j);

  s := pg_temp.m182_table('M182-1-CLOSED', false);
  update public.table_sessions set status = 'closed' where id = s;
  j := pg_temp.m182_clear(s, '{}', 0);
  assert j->>'status' = 'closed', format('M182.1 · a closed table answers closed (%s)', j);
  assert not exists (select 1 from public.qr_table_clears where session_id = s),
    'M182.1 · a closed table writes no clear row';

  -- A counter order keeps its own exits (mms_clear_counter_cart, mms_counter_no_show).
  s := pg_temp.m182_table('reg-M1821CTR', true, 'pickup');
  j := pg_temp.m182_clear(s, '{}', 0);
  assert j->>'status' = 'counter', format('M182.1 · a reg- pickup order is refused (%s)', j);
  assert pg_temp.m182_untouched(s), 'M182.1 · the counter refusal wrote nothing';
  -- …but a DINER pickup session (not reg-) is a plain table to this function.
  s := pg_temp.m182_table('M1821PICKUP', true, 'pickup');
  j := pg_temp.m182_clear(s, '{}', 0);
  assert j->>'status' = 'ok', format('M182.1 · a diner pickup session clears (%s)', j);
end $$;

-- ══ M182.2 · money in flight, a live card attempt — and their stale halves pass ═════════════════
do $$
declare s uuid; j jsonb;
begin
  s := pg_temp.m182_table('M182-2-LOCK');
  update public.qr_carts set locked = true, locked_at = now() - interval '1 minute'
    where id = pg_temp.m182_cart(s);
  j := pg_temp.m182_clear(s, '{}', 0);
  assert j->>'status' = 'in_flight', format('M182.2 · a fresh pay lock refuses (%s)', j);
  assert pg_temp.m182_untouched(s), 'M182.2 · the in-flight refusal wrote nothing';
  -- A lock past its TTL is no payment: it clears.
  update public.qr_carts set locked_at = now() - interval '6 minutes' where id = pg_temp.m182_cart(s);
  j := pg_temp.m182_clear(s, '{}', 0);
  assert j->>'status' = 'ok', format('M182.2 · a stale pay lock clears (%s)', j);

  s := pg_temp.m182_table('M182-2-FREEZE');
  update public.qr_carts set settle_at = now() - interval '1 minute' where id = pg_temp.m182_cart(s);
  j := pg_temp.m182_clear(s, '{}', 0);
  assert j->>'status' = 'in_flight', format('M182.2 · a fresh settle freeze refuses (%s)', j);
  update public.qr_carts set settle_at = now() - interval '11 minutes' where id = pg_temp.m182_cart(s);
  j := pg_temp.m182_clear(s, '{}', 0);
  assert j->>'status' = 'ok', format('M182.2 · a stale freeze clears (%s)', j);

  s := pg_temp.m182_table('M182-2-CARD');
  update public.qr_carts set live_payment_intent_id = 'pi_m182_live' where id = pg_temp.m182_cart(s);
  j := pg_temp.m182_clear(s, '{}', 0);
  assert j->>'status' = 'card_live', format('M182.2 · a live card attempt refuses (%s)', j);
  assert pg_temp.m182_untouched(s), 'M182.2 · the card_live refusal wrote nothing';
end $$;

-- ══ M182.3 · someone joined after the look — and a member who was already there passes ═════════
do $$
declare s uuid; j jsonb;
begin
  s := pg_temp.m182_table('M182-3-JOIN');
  insert into public.session_members (session_id, seat_id, display_name, role)
    values (s, gen_random_uuid(), 'Aye', 'host');
  j := pg_temp.m182_clear(s, '{}', 0, now() - interval '1 minute');
  assert j->>'status' = 'joined', format('M182.3 · a member newer than the look refuses (%s)', j);
  assert pg_temp.m182_untouched(s), 'M182.3 · the joined refusal wrote nothing';
  j := pg_temp.m182_clear(s, '{}', 0, now());
  assert j->>'status' = 'ok', format('M182.3 · a member the look already saw does not block (%s)', j);
end $$;

-- ══ M182.4 · the order changed after the look: a dish added, a SENT set or a figure not shown ════
do $$
declare s uuid; a uuid; b uuid; j jsonb; past timestamptz := now() - interval '1 minute';
begin
  s := pg_temp.m182_table('M182-4-ADD');
  perform pg_temp.m182_line(s, 1400);                    -- a DRAFT, added after the look
  j := pg_temp.m182_clear(s, '{}', 0, now() - interval '1 minute');
  assert j->>'status' = 'changed', format('M182.4 · a dish added after the look refuses (%s)', j);
  assert pg_temp.m182_untouched(s), 'M182.4 · the added-dish refusal wrote nothing';

  s := pg_temp.m182_table('M182-4-SET');
  a := pg_temp.m182_line(s, 1400, 1, 'fired', past);
  b := pg_temp.m182_line(s, 1300, 1, 'in_progress', past);
  -- At the TABLE's whole figure (1400 + 1300 = 2700), so only the set can refuse it.
  j := pg_temp.m182_clear(s, array[a], 2700);
  assert j->>'status' = 'changed', format('M182.4 · a sent set missing a dish refuses (%s)', j);
  j := pg_temp.m182_clear(s, array[a, b, gen_random_uuid()], 2700);
  assert j->>'status' = 'changed', format('M182.4 · a sent set with an extra dish refuses (%s)', j);
  j := pg_temp.m182_clear(s, array[a, b, null], 2700);
  assert j->>'status' = 'changed', format('M182.4 · a NULL element never matches (%s)', j);
  j := pg_temp.m182_clear(s, null, 0);
  assert j->>'status' = 'changed', format('M182.4 · a look that showed nothing, over sent food (%s)', j);
  j := pg_temp.m182_clear(s, array[b, a], 2600);
  assert j->>'status' = 'changed', format('M182.4 · the right set at the wrong figure refuses (%s)', j);
  assert pg_temp.m182_untouched(s), 'M182.4 · every changed refusal wrote nothing';
  -- The same set in another order, twice over, at its own figure: the look IS the table.
  j := pg_temp.m182_clear(s, array[b, a, b], 2700);
  assert j->>'status' = 'ok', format('M182.4 · order and duplicates are ignored (%s)', j);

  -- A look that showed dishes, over a table that PAID since: no open cart, nothing sent — a change.
  s := pg_temp.m182_table('M182-4-PAID');
  a := pg_temp.m182_line(s, 1400, 1, 'fired', past);
  update public.qr_carts set status = 'paid' where id = pg_temp.m182_cart(s);
  j := pg_temp.m182_clear(s, array[a], 1400);
  assert j->>'status' = 'changed', format('M182.4 · a loss look over a paid table refuses (%s)', j);
end $$;

-- ══ M182.5 · the no-loss clears: an empty table, a seated table with no cart, a paid table ══════
do $$
declare s uuid; c uuid; j jsonb; r record;
begin
  s := pg_temp.m182_table('M182-5-EMPTY');
  c := pg_temp.m182_cart(s);
  j := pg_temp.m182_clear(s, '{}', 0);
  assert j->>'status' = 'ok' and (j->>'dishes')::int = 0 and (j->>'loss_cents')::int = 0,
    format('M182.5 · an empty open cart clears with no loss (%s)', j);
  assert (select status from public.qr_carts where id = c) = 'cancelled'
     and (select status from public.table_sessions where id = s) = 'closed',
    'M182.5 · the cart is cancelled and the session closed';
  select * into r from public.qr_table_clears where session_id = s;
  assert r.id = (j->>'clear_id')::uuid and r.cart_id = c and r.dishes = 0 and r.loss_cents = 0
     and r.cleared_by = '00000000-0000-0000-0000-000000182b00' and r.approver_staff_id is null
     and cardinality(r.stop_line_ids) = 0,
    'M182.5 · ONE clear row names who cleared it, with no loss and nothing to stop';
  assert not exists (select 1 from public.mms_approvals where session_id = s),
    'M182.5 · a no-loss clear writes no loss row';

  s := pg_temp.m182_table('M182-5-SEATED', false);
  j := pg_temp.m182_clear(s, '{}', 0);
  assert j->>'status' = 'ok', format('M182.5 · a seated table with no cart clears (%s)', j);
  assert (select cart_id from public.qr_table_clears where session_id = s) is null,
    'M182.5 · its clear row has no cart';

  -- A PAID table: the settled cart rests; its food is paid for, so nothing is a loss.
  s := pg_temp.m182_table('M182-5-PAID');
  c := pg_temp.m182_cart(s);
  perform pg_temp.m182_line(s, 1400, 2, 'served', now() - interval '20 minutes');
  update public.qr_carts set status = 'paid' where id = c;
  j := pg_temp.m182_clear(s, '{}', 0);
  assert j->>'status' = 'ok' and (j->>'dishes')::int = 0, format('M182.5 · a paid table clears free (%s)', j);
  assert (select status from public.qr_carts where id = c) = 'paid',
    'M182.5 · a paid cart is never cancelled by a clear';
  assert not exists (select 1 from public.mms_approvals where session_id = s),
    'M182.5 · a paid table''s served food is no loss';
end $$;

-- ══ M182.6 · the loss clear (ruling #6) — every SENT dish, unapproved; the kitchen told ═════════
do $$
declare s uuid; c uuid; j jsonb; past timestamptz := now() - interval '3 minutes';
        fired uuid; cooking uuid; served uuid; draft uuid; ingrace uuid; comp_line uuid; grocery uuid;
        req uuid; n integer; r record;
begin
  s := pg_temp.m182_table('M182-6-LOSS');
  c := pg_temp.m182_cart(s);
  fired   := pg_temp.m182_line(s, 1400, 1, 'fired', past);              -- SENT · on the KDS
  cooking := pg_temp.m182_line(s, 1400, 2, 'in_progress', past);        -- SENT · cooking
  served  := pg_temp.m182_line(s, 1300, 1, 'served', past);             -- SENT · eaten
  draft   := pg_temp.m182_line(s, 900);                                 -- never sent
  ingrace := pg_temp.m182_line(s, 800, 1, 'fired', now() + interval '8 seconds'); -- in its grace
  comp_line  := pg_temp.m182_line(s, 700, 1, 'in_progress', past, true);   -- comped, still cooking
  grocery := pg_temp.m182_line(s, 500, 1, 'fired', past, false, 'grocery');
  -- A pending request on the cart (a server asked to void the served dish).
  insert into public.mms_approvals (kind, status, cart_id, session_id, line_id, line_name, qty,
                                    amount_cents, reason_code, cooked, initiator_staff_id)
    values ('void', 'pending', c, s, served, 'Mohinga', 1, 1300, 'wrong_dish', true,
            '00000000-0000-0000-0000-000000182c00')
    returning id into req;

  -- 1400 + 2×1400 + 1300 = 5500 over 1 + 2 + 1 = 4 dishes.
  j := pg_temp.m182_clear(s, array[fired, cooking, served], 5500);
  assert j->>'status' = 'ok' and (j->>'dishes')::int = 4 and (j->>'loss_cents')::int = 5500,
    format('M182.6 · the loss clear answers ok with the RPC''s own count and figure (%s)', j);

  select count(*) into n from public.mms_approvals
    where session_id = s and reason_code = 'table_cleared' and kind = 'void' and status = 'approved'
      and gate_reason = 'unapproved' and approver_staff_id is null
      and initiator_staff_id = '00000000-0000-0000-0000-000000182b00';
  assert n = 3, format('M182.6 · one unapproved table_cleared void per SENT line, want 3 (%s)', n);
  for r in select line_id, amount_cents, qty, cooked from public.mms_approvals
            where session_id = s and reason_code = 'table_cleared' loop
    assert (r.line_id = fired and r.amount_cents = 1400 and r.qty = 1 and not r.cooked)
        or (r.line_id = cooking and r.amount_cents = 2800 and r.qty = 2 and r.cooked)
        or (r.line_id = served and r.amount_cents = 1300 and r.qty = 1 and r.cooked),
      format('M182.6 · each row is unit × qty with its cooked flag (%s)', r);
  end loop;
  assert not exists (select 1 from public.mms_approvals
                      where session_id = s and reason_code = 'table_cleared'
                        and line_id in (draft, ingrace, comp_line, grocery)),
    'M182.6 · a draft, an in-grace line, a comp and grocery are never written off';

  assert (select status from public.mms_approvals where id = req) = 'superseded',
    'M182.6 · the cart''s pending request is superseded (D2)';

  select count(*) into n from public.qr_cart_items
    where id in (fired, cooking, served, comp_line) and state = 'voided';
  assert n = 4, 'M182.6 · the SENT lines and the comped dish still cooking are voided (M198)';
  assert (select state from public.qr_cart_items where id = ingrace) = 'draft'
     and (select fire_at from public.qr_cart_items where id = ingrace) is null,
    'M182.6 · a line still inside its grace never reached the KDS: back to draft';
  assert (select state from public.qr_cart_items where id = draft) = 'draft',
    'M182.6 · a draft is left as it was';
  assert (select state from public.qr_cart_items where id = grocery) = 'fired',
    'M182.6 · grocery is never the kitchen''s';

  select * into r from public.qr_table_clears where session_id = s;
  assert r.dishes = 4 and r.loss_cents = 5500 and r.approver_staff_id is null,
    'M182.6 · the clear row carries the dishes and the loss';
  assert (select array_agg(x order by x) from unnest(r.stop_line_ids) x)
         = (select array_agg(x order by x) from unnest(array[fired, cooking, comp_line]) x),
    format('M182.6 · the stop record is the KDS''s lines: fired + cooking + the comp cooking (%s)',
           r.stop_line_ids);
  assert r.stop_acknowledged_at is null, 'M182.6 · the stop waits for "Got it"';
  assert (select status from public.qr_carts where id = c) = 'cancelled'
     and (select status from public.table_sessions where id = s) = 'closed',
    'M182.6 · the cart is cancelled and the session closed';
end $$;

-- ══ M182.7 · a manager approved the clear (the optional stamp) — the gate it met, the approver ═══
do $$
declare s uuid; a uuid; b uuid; j jsonb; n integer; past timestamptz := now() - interval '3 minutes';
begin
  s := pg_temp.m182_table('M182-7-STAMP');
  a := pg_temp.m182_line(s, 1400, 1, 'fired', past);
  j := pg_temp.m182_clear(s, array[a], 1400, now(), '00000000-0000-0000-0000-000000182b00');
  assert j->>'status' = 'self_approve', format('M182.7 · nobody approves their own clear (%s)', j);
  j := pg_temp.m182_clear(s, array[a], 1400, now(), '00000000-0000-0000-0000-000000182c00');
  assert j->>'status' = 'bad_approver', format('M182.7 · a server cannot approve (%s)', j);
  assert pg_temp.m182_untouched(s), 'M182.7 · an approver refusal wrote nothing';
  j := pg_temp.m182_clear(s, array[a], 1400, now(), '00000000-0000-0000-0000-000000182a00');
  assert j->>'status' = 'ok', format('M182.7 · a manager''s stamp clears (%s)', j);
  select count(*) into n from public.mms_approvals
    where line_id = a and reason_code = 'table_cleared' and gate_reason = 'solo'
      and approver_staff_id = '00000000-0000-0000-0000-000000182a00';
  assert n = 1, 'M182.7 · an approved clear records the gate it met (solo) and the approver';
  assert (select approver_staff_id from public.qr_table_clears where session_id = s)
         = '00000000-0000-0000-0000-000000182a00',
    'M182.7 · the clear row names the approver';

  -- A cooked dish under a stamp records 'cooked'.
  s := pg_temp.m182_table('M182-7-COOKED');
  b := pg_temp.m182_line(s, 1400, 1, 'in_progress', past);
  j := pg_temp.m182_clear(s, array[b], 1400, now(), '00000000-0000-0000-0000-000000182a00');
  assert j->>'status' = 'ok'
     and (select gate_reason from public.mms_approvals where line_id = b and reason_code = 'table_cleared')
         = 'cooked',
    format('M182.7 · a stamped cooked dish records cooked (%s)', j);
end $$;

-- ══ M182.8 · THE SEAM switched on: a clear with sent food needs a manager; a free clear never ═══
do $$
declare s uuid; a uuid; j jsonb; past timestamptz := now() - interval '3 minutes';
begin
  update public.mms_loss_config set clear_requires_pin = true where id;
  s := pg_temp.m182_table('M182-8-SEAM');
  a := pg_temp.m182_line(s, 1400, 1, 'served', past);
  j := pg_temp.m182_clear(s, array[a], 1400);
  assert j->>'status' = 'needs_approval', format('M182.8 · the seam on: sent food needs a manager (%s)', j);
  assert pg_temp.m182_untouched(s), 'M182.8 · needs_approval wrote nothing';
  j := pg_temp.m182_clear(s, array[a], 1400, now(), '00000000-0000-0000-0000-000000182a00');
  assert j->>'status' = 'ok', format('M182.8 · …and clears with one (%s)', j);
  -- A table with nothing sent never waits, seam or not.
  s := pg_temp.m182_table('M182-8-FREE');
  j := pg_temp.m182_clear(s, '{}', 0);
  assert j->>'status' = 'ok', format('M182.8 · the seam never holds a free clear (%s)', j);
  update public.mms_loss_config set clear_requires_pin = false where id;
end $$;

-- ══ M182.9 · "Got it" — the kitchen's acknowledgement, once ═══════════════════════════════════
do $$
declare s uuid; a uuid; j jsonb; clr uuid; v text; ok boolean;
begin
  s := pg_temp.m182_table('M182-9-ACK');
  a := pg_temp.m182_line(s, 1400, 1, 'in_progress', now() - interval '3 minutes');
  j := pg_temp.m182_clear(s, array[a], 1400);
  clr := (j->>'clear_id')::uuid;
  v := public.mms_ack_table_clear_stop(clr, '00000000-0000-0000-0000-000000182c00');
  assert v = 'ok', format('M182.9 · the first Got it acknowledges (%s)', v);
  assert (select stop_acknowledged_at is not null
                 and stop_acknowledged_by = '00000000-0000-0000-0000-000000182c00'
            from public.qr_table_clears where id = clr),
    'M182.9 · the acknowledgement names who and when';
  v := public.mms_ack_table_clear_stop(clr, '00000000-0000-0000-0000-000000182b00');
  assert v = 'already', format('M182.9 · a second Got it is already, never a second write (%s)', v);
  assert (select stop_acknowledged_by from public.qr_table_clears where id = clr)
         = '00000000-0000-0000-0000-000000182c00',
    'M182.9 · the second Got it did not overwrite the first';
  -- A clear that stopped nothing has nothing to acknowledge.
  s := pg_temp.m182_table('M182-9-NONE');
  j := pg_temp.m182_clear(s, '{}', 0);
  v := public.mms_ack_table_clear_stop((j->>'clear_id')::uuid, '00000000-0000-0000-0000-000000182c00');
  assert v = 'nothing_to_stop', format('M182.9 · a free clear has nothing to stop (%s)', v);
  v := public.mms_ack_table_clear_stop(gen_random_uuid(), '00000000-0000-0000-0000-000000182c00');
  assert v = 'not_found', format('M182.9 · an unknown clear is not_found (%s)', v);
  -- The constraint: no acknowledgement on a clear that stopped nothing, even written by hand.
  ok := false;
  begin
    update public.qr_table_clears set stop_acknowledged_at = now(),
                                      stop_acknowledged_by = '00000000-0000-0000-0000-000000182c00'
      where id = (j->>'clear_id')::uuid;
  exception when check_violation then ok := true;
  end;
  assert ok, 'M182.9 · qr_table_clears refuses an acknowledgement with nothing stopped';
end $$;

-- ══ M182.10 · the record's own bounds ══════════════════════════════════════════════════════════
do $$
declare s uuid; ok boolean;
begin
  s := pg_temp.m182_table('M182-10-BOUND', false);
  ok := false;
  begin
    insert into public.qr_table_clears (session_id, cleared_by, dishes, loss_cents)
      values (s, '00000000-0000-0000-0000-000000182b00', 0, 100);
  exception when check_violation then ok := true;
  end;
  assert ok, 'M182.10 · a loss with no dishes is refused';
  ok := false;
  begin
    insert into public.qr_table_clears (session_id, cleared_by, dishes, loss_cents)
      values (s, '00000000-0000-0000-0000-000000182b00', -1, 0);
  exception when check_violation then ok := true;
  end;
  assert ok, 'M182.10 · negative dishes are refused';
  -- …and the legitimate shape still inserts.
  insert into public.qr_table_clears (session_id, cleared_by, dishes, loss_cents)
    values (s, '00000000-0000-0000-0000-000000182b00', 2, 2800);
end $$;

rollback;
