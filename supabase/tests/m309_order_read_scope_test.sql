-- supabase/tests/m309_order_read_scope_test.sql  (M309 — 20261018120000_m309_order_read_scope.sql)
--
-- Proves both halves of the M309 migration, which no vitest suite can see (they mock the database):
--
--   ① COLUMNS — a session member (the most-privileged diner there is) cannot select
--      `receipt_email` or `receipt_sent_at`, by name or through `select *`; `anon` holds no select at
--      all; and EVERY other column still reads (computed from the catalog, never transcribed — the
--      TS side, lib/track-order-grants.test.ts, proves the diner selects name only granted columns).
--   ② ROWS — a member reads an order only if their seat was taken no later than the order
--      (`session_members.created_at <= qr_orders.created_at`): the party at the table when it paid
--      reads it (the tie included), a party seated after it reads neither the order nor its lines,
--      and staff keep reading every order.
--
-- Plus the controls that keep the negatives honest: the same member DOES read their own order and its
-- lines with every granted column, so a broken role/claims setup cannot pass the refusals for the
-- wrong reason.
--
-- Run against any QR DB (rolls back — leaves NO data behind):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/m309_order_read_scope_test.sql

begin;
-- W8: without this GUC every ASSERT below compiles out and the file exits 0 having proved nothing.
set local plpgsql.check_asserts = on;

-- ── fixtures (privileged role — bypasses RLS) ──────────────────────────────────────────────────
-- One dine-in session the staff never cleared. Alice's party sat at 18:00 and paid at 18:30 (O1, with
-- an emailed receipt). Dave scanned at 18:30 exactly — the tie: he was at the table when it paid.
-- Carol is the NEXT party, seated 19:00 on the same sticker (m182), who paid at 19:30 (O2). Bob sits
-- at another table. Sam is staff.
insert into auth.users (id) values ('00000000-0000-0000-0000-000000309555');
insert into public.staff (user_id, role, display_name, active) values
  ('00000000-0000-0000-0000-000000309555', 'server', 'M309 Sam', true);
insert into public.table_sessions (id, qr_code, mode, status, host_seat) values
  ('00000000-0000-0000-0000-0000003090a0', 'M309TEST-A', 'dinein', 'active', '00000000-0000-0000-0000-000000309a1c'),
  ('00000000-0000-0000-0000-0000003090b0', 'M309TEST-B', 'dinein', 'active', '00000000-0000-0000-0000-000000309b0b');
insert into public.session_members (session_id, seat_id, display_name, role, created_at) values
  ('00000000-0000-0000-0000-0000003090a0', '00000000-0000-0000-0000-000000309a1c', 'Alice', 'host',  '2026-10-18T18:00:00Z'),
  ('00000000-0000-0000-0000-0000003090a0', '00000000-0000-0000-0000-000000309dae', 'Dave',  'guest', '2026-10-18T18:30:00Z'),
  ('00000000-0000-0000-0000-0000003090a0', '00000000-0000-0000-0000-000000309ca7', 'Carol', 'guest', '2026-10-18T19:00:00Z'),
  ('00000000-0000-0000-0000-0000003090b0', '00000000-0000-0000-0000-000000309b0b', 'Bob',   'host',  '2026-10-18T18:00:00Z');
insert into public.qr_orders (id, session_id, subtotal_cents, service_charge_cents, tax_cents, total_cents, status,
                              created_at, receipt_email, receipt_sent_at) values
  ('00000000-0000-0000-0000-0000003090d1', '00000000-0000-0000-0000-0000003090a0', 1000, 0, 105, 1105, 'paid',
   '2026-10-18T18:30:00Z', 'alice@example.com', '2026-10-18T18:31:00Z'),
  ('00000000-0000-0000-0000-0000003090d2', '00000000-0000-0000-0000-0000003090a0', 500, 0, 53, 553, 'paid',
   '2026-10-18T19:30:00Z', null, null);
insert into public.qr_order_items (order_id, menu_item_id, name, qty, unit_price_cents, tax_cents, fulfillment) values
  ('00000000-0000-0000-0000-0000003090d1', 'm309-test-mohinga', 'Mohinga', 1, 1000, 105, 'dinein'),
  ('00000000-0000-0000-0000-0000003090d2', 'm309-test-tea', 'Tea', 1, 500, 53, 'dinein');

-- ── ① the grant, read from the catalog ─────────────────────────────────────────────────────────
do $$
declare
  wrong text;
begin
  -- Exactly the two receipt columns are withheld from `authenticated`; every other column is granted.
  select string_agg(a.attname, ', ') into wrong
    from pg_attribute a
   where a.attrelid = 'public.qr_orders'::regclass and a.attnum > 0 and not a.attisdropped
     and has_column_privilege('authenticated', a.attrelid, a.attnum, 'SELECT')
         = (a.attname in ('receipt_email', 'receipt_sent_at'));
  assert wrong is null, format('authenticated column grant is wrong for: %s', wrong);
  -- No table-level select remains (a table-level grant would re-admit both columns).
  assert not has_table_privilege('authenticated', 'public.qr_orders', 'SELECT'),
    'authenticated still holds a TABLE-level select on qr_orders';
  -- `anon` reads nothing at all (20260618000100's lockdown, restated here).
  assert not exists (
    select 1 from pg_attribute a
     where a.attrelid = 'public.qr_orders'::regclass and a.attnum > 0 and not a.attisdropped
       and has_column_privilege('anon', a.attrelid, a.attnum, 'SELECT')),
    'anon holds select on a qr_orders column';
  -- The service role keeps every column (the receipt actions read and write the address with it).
  assert has_table_privilege('service_role', 'public.qr_orders', 'SELECT'),
    'service_role lost its select on qr_orders';
  -- The new predicate: SECURITY DEFINER with an empty search_path, not callable by PUBLIC or anon,
  -- executable by authenticated (the policy runs as the diner) and the service role.
  assert (select p.prosecdef and p.proconfig @> array['search_path=""']
            from pg_proc p where p.oid = 'public.is_member_seated_by(uuid, timestamptz)'::regprocedure),
    'is_member_seated_by is not SECURITY DEFINER with search_path=""';
  assert not exists (
    select 1 from pg_proc p, aclexplode(p.proacl) x
     where p.oid = 'public.is_member_seated_by(uuid, timestamptz)'::regprocedure and x.grantee = 0),
    'PUBLIC can execute is_member_seated_by';
  assert not has_function_privilege('anon', 'public.is_member_seated_by(uuid, timestamptz)', 'EXECUTE'),
    'anon can execute is_member_seated_by';
  assert has_function_privilege('authenticated', 'public.is_member_seated_by(uuid, timestamptz)', 'EXECUTE'),
    'authenticated cannot execute is_member_seated_by — the order policy would refuse every diner';
end $$;

-- ── ① as a diner: Alice, the payer's own party ─────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000309a1c","role":"authenticated"}';
do $$
declare
  cols text;
  got  text;
  probe text;
begin
  -- POSITIVE first: every column but the two reads — the list is the contract (all columns minus
  -- the two), built from the catalog, so a column wrongly withheld fails here by name.
  select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into cols
    from pg_attribute a
   where a.attrelid = 'public.qr_orders'::regclass and a.attnum > 0 and not a.attisdropped
     and a.attname not in ('receipt_email', 'receipt_sent_at');
  begin
    execute format('select id::text from (select %s from public.qr_orders where id = %L) t',
                   cols, '00000000-0000-0000-0000-0000003090d1') into got;
  exception when insufficient_privilege then
    assert false, format('BROKEN: a member is refused a column the diner must read (%s)', sqlerrm);
  end;
  assert got = '00000000-0000-0000-0000-0000003090d1',
    'BROKEN: a member cannot read their own order through the granted columns';
  assert (select count(*) from public.qr_order_items
           where order_id = '00000000-0000-0000-0000-0000003090d1') = 1,
    'BROKEN: a member cannot read their own order''s lines';

  -- REFUSALS: each shape that names a withheld column is a privilege error, not an empty answer.
  foreach probe in array array[
    'select receipt_email from public.qr_orders where id = ''00000000-0000-0000-0000-0000003090d1''',
    'select receipt_sent_at from public.qr_orders where id = ''00000000-0000-0000-0000-0000003090d1''',
    'select * from public.qr_orders where id = ''00000000-0000-0000-0000-0000003090d1''',
    'select count(*) from public.qr_orders where receipt_email is not null'
  ] loop
    begin
      execute probe;
      assert false, format('LEAK: a member ran %s', probe);
    exception when insufficient_privilege then
      null; -- 42501: refused, as it must be
    end;
  end loop;
end $$;
reset role;

-- ── ② the rows: who was at the table when it paid ──────────────────────────────────────────────
-- Alice (seated before both orders) reads both: the earlier party keeps reading the session's later
-- orders by construction (the migration header's "does NOT close").
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000309a1c","role":"authenticated"}';
do $$
begin
  assert (select count(*) from public.qr_orders
           where session_id = '00000000-0000-0000-0000-0000003090a0') = 2,
    'BROKEN: a member seated before both orders does not read both';
end $$;
reset role;

-- Dave sat at 18:30 exactly, the instant O1 settled: the tie is "at the table" (<=, the server arms' lte).
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000309dae","role":"authenticated"}';
do $$
begin
  assert (select count(*) from public.qr_orders where id = '00000000-0000-0000-0000-0000003090d1') = 1,
    'BROKEN: a member seated at the very instant of the settle cannot read the order';
end $$;
reset role;

-- Carol is the next party: O1 settled before she sat, so neither it nor its lines exist for her —
-- while her own party's O2 reads, so the refusal is the seat term and not a broken setup.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000309ca7","role":"authenticated"}';
do $$
begin
  assert (select count(*) from public.qr_orders where id = '00000000-0000-0000-0000-0000003090d1') = 0,
    'LEAK: a member seated AFTER the settle reads the earlier party''s order';
  assert (select count(*) from public.qr_order_items
           where order_id = '00000000-0000-0000-0000-0000003090d1') = 0,
    'LEAK: a member seated AFTER the settle reads the earlier party''s order lines';
  assert (select count(*) from public.qr_orders
           where session_id = '00000000-0000-0000-0000-0000003090a0') = 1,
    'a later-seated member should read exactly their own party''s order';
  assert (select count(*) from public.qr_orders where id = '00000000-0000-0000-0000-0000003090d2') = 1,
    'BROKEN: a member cannot read the order their own party paid';
  assert (select count(*) from public.qr_order_items
           where order_id = '00000000-0000-0000-0000-0000003090d2') = 1,
    'BROKEN: a member cannot read their own party''s order lines';
end $$;
reset role;

-- Bob sits elsewhere: nothing of session A (the membership half of the predicate still holds).
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000309b0b","role":"authenticated"}';
do $$
begin
  assert (select count(*) from public.qr_orders
           where session_id = '00000000-0000-0000-0000-0000003090a0') = 0,
    'LEAK: a non-member reads another table''s orders';
end $$;
reset role;

-- Sam is staff and no member: the is_staff() arm still reads every order of the session.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000309555","role":"authenticated"}';
do $$
begin
  assert (select count(*) from public.qr_orders
           where session_id = '00000000-0000-0000-0000-0000003090a0') = 2,
    'BROKEN: staff no longer read a session''s orders';
end $$;
reset role;

-- A CLOSED session ends every member's read, the tie-holder's included (is_member's status term).
update public.table_sessions set status = 'closed' where id = '00000000-0000-0000-0000-0000003090a0';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000309a1c","role":"authenticated"}';
do $$
begin
  assert (select count(*) from public.qr_orders
           where session_id = '00000000-0000-0000-0000-0000003090a0') = 0,
    'LEAK: a member reads orders of a closed session';
end $$;
reset role;

-- All assertions passed if we reach here. Roll back so the run is side-effect free + repeatable.
rollback;
