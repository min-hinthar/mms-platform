-- supabase/tests/pd3_solo_session_refuses_join_test.sql  (PD3 follow-up — a SOLO session refuses a second member)
--
-- Pins supabase/migrations/20261009120200_pd3_solo_session_refuses_join.sql: the BEFORE INSERT OR
-- UPDATE OF session_id trigger `session_members_solo_guard` (`mms_refuse_solo_join`). A pickup or
-- scan-and-go session is ONE device's own order: `/api/session`'s `findActive` filters on the code,
-- `status` and expiry, never the mode, so a `?j=<code>` join used to land a second member — and a
-- member passes `stampArrival`'s session arm and every `is_member` read. The refusal sits where the
-- membership is WRITTEN, so every writer is covered (the route, `lib/kiosk.ts`'s own first row, and
-- any future one), the way `session_members_party_cap` covers the party size.
--
--   1. the FIRST member of a fresh pickup session lands (the mint; the kiosk's own row);
--   2. a SECOND seat on that pickup session is refused — `solo_session` (P0001, the string the
--      route reads) — and no row landed;
--   3. the same for scan-and-go (every mode but dine-in is solo — not "pickup" by name);
--   4. the minting seat's own re-insert is the unique key's 23505 (the route's idempotent rejoin),
--      never `solo_session`;
--   5. a dine-in party still takes a second and a third member;
--   6. an UPDATE that moves a member INTO a held pickup session is refused too;
--   7. the trigger function is not callable by a client role (EXECUTE revoked, as the party cap's).
--   8. the migration's FIRST statement, `mms_assert_solo_sessions_single()` (Codex P1 on #339): it
--      is silent while only a dine-in party holds several members, and RAISES
--      `solo_sessions_with_members` (P0001) on a scan-and-go session that already holds two — the
--      fixture is built with the trigger disabled inside this rolled-back transaction, the only way
--      that state can now exist. It is the guard that aborts the apply instead of grandfathering a
--      second member.
--   9. the apply-time guard is not callable by a client role either (EXECUTE revoked — the blind pass
--      on #339, 6; induced red by deleting the revoke).
--
-- Every case names itself (`SOLO.<n> ·`) so `scripts/verify-mode-authority.mjs` can require the
-- NAMED case to be the one its mutant turns red (suite `pd3s`). Cases 6 and 7 pin the trigger's
-- events and the grants — DDL no function-body mutant can reach — and were induced red by hand: the
-- trigger re-created INSERT-only, and EXECUTE granted to `authenticated`. Case 8's two legs are each
-- killed by a mutant of the guard's body.
--
-- Run against any QR DB (rolls back — leaves NO data behind):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/pd3_solo_session_refuses_join_test.sql

begin;
-- W8: without this GUC every ASSERT below compiles out and the file exits 0 having proved nothing.
set local plpgsql.check_asserts = on;

do $$
declare
  p uuid := gen_random_uuid();   -- a pickup session
  g uuid := gen_random_uuid();   -- a scan-and-go session
  d uuid := gen_random_uuid();   -- a dine-in party
  a uuid := gen_random_uuid();   -- the minting seat
  b uuid := gen_random_uuid();   -- a second phone
  c uuid := gen_random_uuid();   -- a third phone
  v_state text;
  n integer;
begin
  insert into public.table_sessions (id, qr_code, mode, status, host_seat) values
    (p, 'pickup-' || p, 'pickup', 'active', a),
    (g, 'scango-' || g, 'scango', 'active', a),
    (d, 'SOLO-D', 'dinein', 'active', a);

  -- ══ 1. the FIRST member of a fresh pickup session lands ══════════════════════════════════════
  begin
    insert into public.session_members (session_id, seat_id, display_name, role)
      values (p, a, 'Guest', 'host');
    v_state := 'landed';
  exception when others then
    v_state := sqlerrm;
  end;
  assert v_state = 'landed',
    format('SOLO.1 · the FIRST member of a pickup session was refused (%s) — the mint and the kiosk could never hold one', v_state);

  -- ══ 2. a SECOND seat on that pickup session is refused, and nothing lands ════════════════════
  begin
    insert into public.session_members (session_id, seat_id, display_name, role)
      values (p, b, 'Guest', 'guest');
    v_state := 'landed';
  exception when others then
    v_state := sqlstate || ':' || sqlerrm;
  end;
  select count(*) into n from public.session_members where session_id = p;
  assert v_state = 'P0001:solo_session' and n = 1,
    format('SOLO.2 · a second phone joined a PICKUP session (%s, %s members) — a ?j= join passes stampArrival''s session arm', v_state, n);

  -- ══ 3. scan-and-go is solo too ════════════════════════════════════════════════════════════════
  insert into public.session_members (session_id, seat_id, display_name, role)
    values (g, a, 'Guest', 'host');
  begin
    insert into public.session_members (session_id, seat_id, display_name, role)
      values (g, b, 'Guest', 'guest');
    v_state := 'landed';
  exception when others then
    v_state := sqlstate || ':' || sqlerrm;
  end;
  assert v_state = 'P0001:solo_session',
    format('SOLO.3 · a second phone joined a SCAN-AND-GO session (%s) — every mode but dine-in is solo', v_state);

  -- ══ 4. the minting seat's own re-insert is the unique key's 23505, never solo_session ═════════
  begin
    insert into public.session_members (session_id, seat_id, display_name, role)
      values (p, a, 'Guest', 'host');
    v_state := 'landed';
  exception when others then
    v_state := sqlstate;
  end;
  assert v_state = '23505',
    format('SOLO.4 · the minting seat''s own rejoin answered %s, not the unique key''s 23505 — the route reads 23505 as "already a member" and anything else as a failed join', v_state);

  -- ══ 5. a dine-in party still takes a second and a third member ═══════════════════════════════
  begin
    insert into public.session_members (session_id, seat_id, display_name, role) values
      (d, a, 'Host', 'host'), (d, b, 'Guest', 'guest'), (d, c, 'Guest', 'guest');
    v_state := 'landed';
  exception when others then
    v_state := sqlerrm;
  end;
  select count(*) into n from public.session_members where session_id = d;
  assert v_state = 'landed' and n = 3,
    format('SOLO.5 · a DINE-IN party was refused a member (%s, %s members) — the group cart is the whole point of dine-in', v_state, n);

  -- ══ 6. an UPDATE that moves a member INTO a held pickup session is refused ═══════════════════
  begin
    update public.session_members set session_id = p where session_id = d and seat_id = c;
    v_state := 'landed';
  exception when others then
    v_state := sqlstate || ':' || sqlerrm;
  end;
  select count(*) into n from public.session_members where session_id = p;
  assert v_state = 'P0001:solo_session' and n = 1,
    format('SOLO.6 · an UPDATE moved a second member INTO a pickup session (%s, %s members) — the trigger must fire on UPDATE OF session_id too', v_state, n);

  -- ══ 7. the trigger function is not callable by a client role ═════════════════════════════════
  assert not has_function_privilege('anon', 'public.mms_refuse_solo_join()', 'execute')
     and not has_function_privilege('authenticated', 'public.mms_refuse_solo_join()', 'execute'),
    'SOLO.7 · a client role can EXECUTE mms_refuse_solo_join — revoke it from public, anon and authenticated';
end $$;

-- ══ 8. the apply-time guard: silent on a dine-in party, raises on a solo session with two members ═
-- The only way a second member can now reach a solo session is with the trigger off — so the
-- fixture turns it off, inside this transaction (rolled back below).
alter table public.session_members disable trigger session_members_solo_guard;

do $$
declare
  g uuid := gen_random_uuid();
  v_state text;
begin
  -- (a) case 5's dine-in party holds three members: not this guard's business.
  begin
    perform public.mms_assert_solo_sessions_single();
    v_state := 'silent';
  exception when others then
    v_state := sqlerrm;
  end;
  assert v_state = 'silent',
    format('SOLO.8a · the apply-time guard refused a DINE-IN party (%s) — the migration would abort on every live table', v_state);

  -- (b) a scan-and-go session that already holds two members aborts the apply.
  insert into public.table_sessions (id, qr_code, mode, status, host_seat)
    values (g, 'scango-' || g, 'scango', 'active', null);
  insert into public.session_members (session_id, seat_id, display_name, role) values
    (g, gen_random_uuid(), 'Guest', 'host'), (g, gen_random_uuid(), 'Guest', 'guest');
  begin
    perform public.mms_assert_solo_sessions_single();
    v_state := 'silent';
  exception when others then
    v_state := sqlstate || ':' || split_part(sqlerrm, ':', 1);
  end;
  assert v_state = 'P0001:solo_sessions_with_members',
    format('SOLO.8b · a solo session already holding two members passed the apply-time guard (%s) — the migration would grandfather the second member', v_state);

  -- ══ 9. the apply-time guard is not callable by a client role ═════════════════════════════════
  assert not has_function_privilege('anon', 'public.mms_assert_solo_sessions_single()', 'execute')
     and not has_function_privilege('authenticated', 'public.mms_assert_solo_sessions_single()', 'execute'),
    'SOLO.9 · a client role can EXECUTE mms_assert_solo_sessions_single — revoke it from public, anon and authenticated';
end $$;

rollback;
