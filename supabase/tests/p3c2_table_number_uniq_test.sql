-- supabase/tests/p3c2_table_number_uniq_test.sql  (Phase 3c-ii · D22 — one active dine-in session per table NUMBER)
--
-- Pins supabase/migrations/20261005120000_p3c2_table_number_uniq.sql: the partial unique index
-- `table_sessions_active_table_uniq` on `(table_number) where status = 'active' and mode = 'dinein'`.
-- The index has no function body for scripts/verify-mode-authority.mjs to mutate, so the proof is
-- RED-FIRST BY CONSTRUCTION: case 1 is the collision itself and comes FIRST, so a run against the
-- un-migrated stack fails there (a second active dine-in row on 98 simply lands), and only the
-- migrated stack reaches cases 2–6. The other cases pin the SCOPE — every leg of the WHERE that
-- a narrower or wider index would get wrong:
--
--   1. two ACTIVE dine-in rows on 98 → unique_violation (SQLSTATE 23505, the code every writer
--      reads — lib/seated.ts, lib/bind-table.ts, the mint, the register, the kiosk);
--   2. a CLOSED row and an active one coexist on 98 (a turned-over table reuses its number);
--   3. two active dine-in rows with a NULL number coexist (a numberless host-mint code never
--      collides — NULLs are distinct);
--   4. an active PICKUP row carrying 98 beside the dine-in one is ACCEPTED (the mode scope: only a
--      dine-in session is a seat — P2's status-only index is refused here, by a fixture);
--   5. an UPDATE of a second session's NULL → 98 raises 23505 (the bind path, `bindSessionTable`);
--   6. `pg_indexes.indexdef` carries the PREDICATE — pinned by its text, not by the index's name,
--      so a same-named index with a narrower WHERE cannot pass.
--
-- CI-only: it needs the local stack (Docker). In the authoring environment it was run against a
-- throwaway Postgres 16 cluster carrying the `table_sessions` / `qr_tables` DDL (init + k2) — red on
-- case 1 before the migration file was applied, green after — not against the Supabase stack; the
-- first CI run is its first run on the real schema.
--
-- Run against any QR DB (rolls back — leaves NO data behind):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/p3c2_table_number_uniq_test.sql

begin;
-- W8: without this GUC every ASSERT below compiles out and the file exits 0 having proved nothing.
set local plpgsql.check_asserts = on;

do $$
declare
  s1 uuid := gen_random_uuid();
  s2 uuid := gen_random_uuid();
  v_state text;
  v_def text;
  n integer;
begin
  -- ── fixtures: two registry rows the seed (1–10) never claims; FK targets for the number ──────
  insert into public.qr_tables (table_number, qr_code) values (98, 'P3C2-T98'), (99, 'P3C2-T99')
    on conflict (table_number) do nothing;

  -- ══ 1. FIRST: two active dine-in rows on one number collide ═══════════════════════════════════
  insert into public.table_sessions (id, qr_code, mode, status, host_seat, table_number)
    values (s1, 'P3C2-A', 'dinein', 'active', null, 98);
  begin
    insert into public.table_sessions (qr_code, mode, status, table_number)
      values ('P3C2-B', 'dinein', 'active', 98);
    v_state := 'landed';
  exception when unique_violation then
    v_state := sqlstate;
  end;
  assert v_state = '23505',
    format('P3C2.1 · a second ACTIVE dine-in session on table 98 %s — table_sessions_active_table_uniq is missing', v_state);

  -- ══ 2. a closed row and an active one coexist (turnover reuses the number) ════════════════════
  insert into public.table_sessions (qr_code, mode, status, table_number)
    values ('P3C2-C', 'dinein', 'closed', 98);
  select count(*) into n from public.table_sessions where table_number = 98;
  assert n = 2, format('P3C2.2 · a CLOSED session on 98 was refused beside the active one (%s rows)', n);

  -- ══ 3. two active dine-in rows with NO number coexist (NULLs are distinct) ════════════════════
  insert into public.table_sessions (qr_code, mode, status, table_number)
    values ('P3C2-N1', 'dinein', 'active', null), ('P3C2-N2', 'dinein', 'active', null);
  select count(*) into n from public.table_sessions
    where qr_code in ('P3C2-N1', 'P3C2-N2') and status = 'active' and table_number is null;
  assert n = 2, format('P3C2.3 · two numberless host-mint sessions collided (%s landed)', n);

  -- ══ 4. the MODE scope: an active PICKUP row carrying 98 is accepted beside the dine-in one ════
  begin
    insert into public.table_sessions (qr_code, mode, status, table_number)
      values ('P3C2-P', 'pickup', 'active', 98);
    v_state := 'landed';
  exception when unique_violation then
    v_state := sqlstate;
  end;
  assert v_state = 'landed',
    'P3C2.4 · an active PICKUP row carrying 98 was refused — the index is status-only; only a dine-in session is a seat';

  -- ══ 5. the bind path: UPDATE of a second session's NULL → 98 raises 23505 ═════════════════════
  insert into public.table_sessions (id, qr_code, mode, status, host_seat, table_number)
    values (s2, 'P3C2-U', 'dinein', 'active', null, null);
  begin
    update public.table_sessions set table_number = 98 where id = s2 and table_number is null;
    v_state := 'landed';
  exception when unique_violation then
    v_state := sqlstate;
  end;
  assert v_state = '23505',
    format('P3C2.5 · binding a second session to the seated table 98 %s — the bind path is unguarded', v_state);
  select count(*) into n from public.table_sessions where id = s2 and table_number is null;
  assert n = 1, 'P3C2.5 · the refused bind changed the row';
  -- …and the same UPDATE onto a FREE number lands (the index must not refuse a legitimate bind).
  update public.table_sessions set table_number = 99 where id = s2 and table_number is null;
  get diagnostics n = row_count;
  assert n = 1, format('P3C2.5 · a legitimate bind to the free table 99 moved %s rows', n);

  -- ══ 6. the predicate itself, pinned by text ═══════════════════════════════════════════════════
  select indexdef into v_def from pg_indexes
    where schemaname = 'public' and tablename = 'table_sessions'
      and indexname = 'table_sessions_active_table_uniq';
  assert v_def is not null, 'P3C2.6 · table_sessions_active_table_uniq does not exist';
  assert v_def like 'CREATE UNIQUE INDEX %', format('P3C2.6 · the index is not UNIQUE: %s', v_def);
  assert v_def like '%(table_number)%', format('P3C2.6 · the index is not on table_number: %s', v_def);
  assert v_def like '%WHERE ((status = ''active''::text) AND (mode = ''dinein''::text))%',
    format('P3C2.6 · the predicate is not status=active AND mode=dinein: %s', v_def);

  raise notice 'p3c2_table_number_uniq_test: all cases passed';
end $$;

rollback;
