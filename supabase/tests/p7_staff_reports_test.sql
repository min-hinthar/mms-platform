-- supabase/tests/p7_staff_reports_test.sql  (P7·4 — the "Something's wrong" row)
--
-- Proves what `20260907000000_p7_staff_reports.sql` promises and nothing in the app can prove (every
-- vitest suite mocks the database):
--   1. A legitimate report is accepted with the defaults the code relies on (status open, an empty
--      device, no delivery recorded) — an over-tight bound blocks real service and a refusal-only
--      test would never notice.
--   2. The bounds REFUSE, red-first: a 2001-character message, an empty one, an unknown screen, an
--      unknown connection, an unknown status, an issue URL that is not GitHub's, an over-long name.
--   3. A diner cannot read it — even a signed-in one. Two mechanisms hold that (no grant to
--      `authenticated`; a manager-only policy behind it); either refusal passes, as in W23d.
--
-- Run against any QR DB (rolls back — leaves NO data behind):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/p7_staff_reports_test.sql

begin;
-- Without this GUC every ASSERT below compiles out and the file exits 0 having proved nothing.
set local plpgsql.check_asserts = on;

-- ── 1 · a legitimate row, with the defaults ─────────────────────────────────────────────────────
do $$
declare v_id uuid;
begin
  insert into public.qr_staff_reports (staff_id, staff_name, screen, path, message, lang, connection)
    values ('00000000-0000-0000-0000-000000007a01'::uuid, 'Daw Aye', 'kitchen', '/staff/kitchen',
            'ခလုတ်နှိပ်တာ ဘာမှ မဖြစ်ဘူး', 'my', 'live')
    returning id into v_id;
  assert (select status from public.qr_staff_reports where id = v_id) = 'open',
    'a new report must default to open';
  assert (select device from public.qr_staff_reports where id = v_id) = '{}'::jsonb,
    'a report written without device facts must carry an empty object, not null';
  assert (select issue_url is null and emailed_at is null from public.qr_staff_reports where id = v_id),
    'no delivery may be recorded before one happened';
  -- and a 2000-character message — the sheet's cap — still passes.
  insert into public.qr_staff_reports (staff_id, staff_name, screen, path, message, lang, connection)
    values ('00000000-0000-0000-0000-000000007a01'::uuid, 'Daw Aye', 'expo', '/staff/expo',
            repeat('x', 2000), 'en', 'not_updating');
end $$;

-- ── 2 · the bounds refuse ───────────────────────────────────────────────────────────────────────
do $$
declare v_refused boolean;
begin
  -- 2001 characters
  v_refused := false;
  begin
    insert into public.qr_staff_reports (staff_id, staff_name, screen, path, message, lang, connection)
      values ('00000000-0000-0000-0000-000000007a01'::uuid, 'Daw Aye', 'kitchen', '/staff/kitchen',
              repeat('x', 2001), 'en', 'live');
  exception when check_violation then v_refused := true;
  end;
  assert v_refused, 'a 2001-character message was accepted';

  -- empty message
  v_refused := false;
  begin
    insert into public.qr_staff_reports (staff_id, staff_name, screen, path, message, lang, connection)
      values ('00000000-0000-0000-0000-000000007a01'::uuid, 'Daw Aye', 'kitchen', '/staff/kitchen',
              '', 'en', 'live');
  exception when check_violation then v_refused := true;
  end;
  assert v_refused, 'an empty message was accepted';

  -- unknown screen
  v_refused := false;
  begin
    insert into public.qr_staff_reports (staff_id, staff_name, screen, path, message, lang, connection)
      values ('00000000-0000-0000-0000-000000007a01'::uuid, 'Daw Aye', 'board', '/board',
              'x', 'en', 'live');
  exception when check_violation then v_refused := true;
  end;
  assert v_refused, 'an unknown screen was accepted';

  -- unknown connection
  v_refused := false;
  begin
    insert into public.qr_staff_reports (staff_id, staff_name, screen, path, message, lang, connection)
      values ('00000000-0000-0000-0000-000000007a01'::uuid, 'Daw Aye', 'kitchen', '/staff/kitchen',
              'x', 'en', 'offline');
  exception when check_violation then v_refused := true;
  end;
  assert v_refused, 'an unknown connection state was accepted';

  -- unknown status
  v_refused := false;
  begin
    insert into public.qr_staff_reports (staff_id, staff_name, screen, path, message, lang, connection, status)
      values ('00000000-0000-0000-0000-000000007a01'::uuid, 'Daw Aye', 'kitchen', '/staff/kitchen',
              'x', 'en', 'live', 'done');
  exception when check_violation then v_refused := true;
  end;
  assert v_refused, 'an unknown status was accepted';

  -- an issue URL that is not GitHub's
  v_refused := false;
  begin
    insert into public.qr_staff_reports (staff_id, staff_name, screen, path, message, lang, connection, issue_url)
      values ('00000000-0000-0000-0000-000000007a01'::uuid, 'Daw Aye', 'kitchen', '/staff/kitchen',
              'x', 'en', 'live', 'https://example.com/issues/1');
  exception when check_violation then v_refused := true;
  end;
  assert v_refused, 'a non-GitHub issue URL was accepted';

  -- an over-long name
  v_refused := false;
  begin
    insert into public.qr_staff_reports (staff_id, staff_name, screen, path, message, lang, connection)
      values ('00000000-0000-0000-0000-000000007a01'::uuid, repeat('n', 81), 'kitchen', '/staff/kitchen',
              'x', 'en', 'live');
  exception when check_violation then v_refused := true;
  end;
  assert v_refused, 'an 81-character name was accepted';
end $$;

-- ── 3 · a diner cannot read it ──────────────────────────────────────────────────────────────────
-- `set local role authenticated` + a jwt sub makes the very same grant and policy a real signed-in
-- diner hits evaluate here. Fail-closed either way (W23d): no grant refuses the read outright;
-- RLS filters it to zero if a grant is ever added. Both pass; neither is assumed.
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"00000000-0000-0000-0000-000000007d1e","role":"authenticated"}';
do $$
declare v_n integer;
begin
  begin
    select count(*) into v_n from public.qr_staff_reports;
    assert v_n = 0, 'LEAK: a diner read qr_staff_reports directly';
  exception when insufficient_privilege then null;  -- refused before RLS: stronger, also correct
  end;
end $$;
reset role;

rollback;
