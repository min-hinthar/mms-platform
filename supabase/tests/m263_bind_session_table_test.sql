-- supabase/tests/m263_bind_session_table_test.sql  (M263 · J41 · J40 — the table bind decided once, under locks)
--
-- Pins supabase/migrations/20261006120100_m263_bind_session_table.sql:
-- `mms_bind_session_table(p_session, p_table, p_shell)` — the binder's freeze read under its cart's
-- lock (M263), a sticker session bound only to its own table (J41), an UNTOUCHED staff shell adopted
-- in the same subtransaction as the CAS (J40), and the CAS itself (D21). Every refusal sits beside
-- the legitimate case it must not over-block (W17):
--
--   M263.1–.7   the freshness legs and their edges: a fresh lock (0 min, 4 min) refuses, a stale
--               one (6 min) and a NULL stamp land; a fresh split freeze (0, 9 min) refuses, a stale
--               one (11 min) lands;
--   M263.8      a BOUND binder is never re-tabled (the CAS's `table_number is null`);
--   M263.9      the freeze read is the OPEN cart's — a paid cart's leftover lock does not refuse;
--   M263.10–.12 a closed, a pickup and an expired binder are `unmoved`;
--   M263.13     the bind writes the NUMBER only: `qr_code`, `expires_at` and `host_seat` unchanged;
--   M263.14–.15 a seated number raises 23505 and an unregistered one 23503 — both PROPAGATE;
--   M263.16     privileges, SECURITY DEFINER, the empty search_path, exactly one definition;
--   J41.1–.4    an unbound row on table T's ACTIVE sticker binds to T only (`sticker:T`), lands on T,
--               a bound one is the CAS's (`unmoved`), and an INACTIVE registration does not refuse;
--   J40.1       an untouched shell is adopted: closed, its empty cart cancelled, the binder at N with
--               its own cart and draft untouched;
--   J40.2–.10   `held` — a member, an earlier cart, a line (voided), a name, a promo, a tab, a pay
--               attempt with no stamp, a split a day old; each leaves the shell, its cart and the
--               binder exactly as they were;
--   J40.3 · .11–.14  `gone` — a claimed shell, no open cart, another number, a pickup row, a closed
--               row: the row is not what the caller saw;
--   J40.15      a CAS that moves no row takes the adopt back (the subtransaction);
--   J40.16–.17  the sticker rule and the freeze are decided BEFORE the adopt — the shell survives.
--
-- Red-team #10 on the design: every session carries its OWN code (the token index is unique among
-- active rows, so a reused literal turns one `held` into the next case's 23505 and aborts the block),
-- and every case closes what it opened.
--
-- ⚠️ `now()` is the TRANSACTION start and this file is ONE transaction: every freshness edge below
-- is relative to that same instant, which is the point.
--
-- CI-only: it needs the local stack (Docker). In the authoring environment it was run against a
-- throwaway Supabase-shaped Postgres 16 with every repo migration applied — red on M263.1 (`raised:
-- 42883`, no such function) before the migration file was applied, green after — and each case was
-- falsified by name with scripts/verify-mode-authority.mjs (suite `m263`) against an isolated copy.
--
-- Run against any QR DB (rolls back — leaves NO data behind):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/m263_bind_session_table_test.sql

begin;
-- W8: without this GUC every ASSERT below compiles out and the file exits 0 having proved nothing.
set local plpgsql.check_asserts = on;

-- The call, as DATA: a raise comes back as `raised:<sqlstate>` (and rolls the call back), so one
-- `do` block can assert a refusal and keep going.
create function pg_temp.m263_bind(p_s uuid, p_t integer, p_sh uuid default null) returns text
  language plpgsql as $$
declare r record;
begin
  select * into r from public.mms_bind_session_table(p_s, p_t, p_sh);
  if not found then return 'no-row'; end if;
  return r.outcome || ':' || coalesce(r.at_table::text, '');
exception when others then
  return 'raised:' || sqlstate;
end $$;

-- A live session with ONE open cart (the shape both the mint and the register's Start leave).
create function pg_temp.m263_session(
  p_code text,
  p_table integer,
  p_host uuid,
  p_mode text default 'dinein'
) returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into public.table_sessions (id, qr_code, mode, status, host_seat, table_number, expires_at)
    values (v, p_code, p_mode, 'active', p_host, p_table, now() + interval '1 hour');
  insert into public.qr_carts (session_id) values (v);
  return v;
end $$;

create function pg_temp.m263_cart(p_s uuid) returns uuid language sql as $$
  select id from public.qr_carts where session_id = p_s and status = 'open'
$$;

-- Close whatever a case left live, so the next case's number and code are free.
create function pg_temp.m263_close(variadic p_ids uuid[]) returns void language sql as $$
  update public.table_sessions set status = 'closed' where id = any(p_ids)
$$;

do $$
declare
  ana  uuid := '00000000-0000-0000-0000-000000026300';
  bo   uuid := '00000000-0000-0000-0000-000000026301';
  dish text := 'cccccccc-0000-4000-8000-000000000263';
  s1 uuid; s3 uuid; s4 uuid; s5 uuid; s6 uuid; s7 uuid; s8 uuid; s9 uuid; s10 uuid; s11 uuid;
  b uuid; sh uuid; c uuid;
  v_got text;
  v_line uuid;
  v_before record;
  v_after record;
  n integer;
begin
  -- ── the registry: numbers the seed (1–10) and p3c2's test (98, 99) never claim; 95 INACTIVE ──
  insert into public.qr_tables (table_number, qr_code, active)
    values (92, 'M263-T92', true), (93, 'M263-T93', true), (94, 'M263-T94', true),
           (95, 'M263-T95', false), (96, 'M263-T96', true), (97, 'M263-T97', true);

  -- ══ M263 — the freeze, read under the binder's cart lock ══════════════════════════════════════
  s1 := pg_temp.m263_session('M263-G1', null, ana);

  update public.qr_carts set locked = true, locked_at = now(), locked_by = bo
   where id = pg_temp.m263_cart(s1);
  v_got := pg_temp.m263_bind(s1, 96);
  assert v_got = 'locked:', format('M263.1 · a bind under a FRESH pay lock answered %s — the number lands while a tablemate''s charge is live, and fulfillment snapshots it onto the order', v_got);
  select count(*) into n from public.table_sessions where id = s1 and table_number is null;
  assert n = 1, 'M263.1 · the refused bind still moved the session';

  update public.qr_carts set locked_at = now() - interval '4 minutes' where id = pg_temp.m263_cart(s1);
  v_got := pg_temp.m263_bind(s1, 96);
  assert v_got = 'locked:', format('M263.2 · a 4-minute-old lock (inside CART_LOCK_TTL_MS) answered %s', v_got);

  update public.qr_carts set locked_at = now() - interval '6 minutes' where id = pg_temp.m263_cart(s1);
  v_got := pg_temp.m263_bind(s1, 96);
  assert v_got = 'bound:96', format('M263.3 · a STALE lock (6 min) answered %s — `locked` is sticky, so a bare `locked` refuses every bind after an abandoned pay tab (W17)', v_got);
  update public.table_sessions set table_number = null where id = s1;

  update public.qr_carts set locked = true, locked_at = null where id = pg_temp.m263_cart(s1);
  v_got := pg_temp.m263_bind(s1, 96);
  assert v_got = 'bound:96', format('M263.4 · locked=true with a NULL stamp answered %s — a NULL stamp is not fresh (authz.ts)', v_got);
  update public.table_sessions set table_number = null where id = s1;

  update public.qr_carts set locked = false, locked_at = null, locked_by = null, settle_at = now()
   where id = pg_temp.m263_cart(s1);
  v_got := pg_temp.m263_bind(s1, 96);
  assert v_got = 'settling:', format('M263.5 · a bind under a FRESH split freeze answered %s', v_got);

  update public.qr_carts set settle_at = now() - interval '9 minutes' where id = pg_temp.m263_cart(s1);
  v_got := pg_temp.m263_bind(s1, 96);
  assert v_got = 'settling:', format('M263.6 · a 9-minute-old settlement (inside SETTLE_TTL_MS) answered %s', v_got);

  update public.qr_carts set settle_at = now() - interval '11 minutes' where id = pg_temp.m263_cart(s1);
  v_got := pg_temp.m263_bind(s1, 96);
  assert v_got = 'bound:96', format('M263.7 · a STALE settlement (11 min) answered %s', v_got);
  update public.qr_carts set settle_at = null where id = pg_temp.m263_cart(s1);

  -- s1 is at 96 now: a second bind never re-tables it.
  v_got := pg_temp.m263_bind(s1, 94);
  assert v_got = 'unmoved:', format('M263.8 · a bind of a BOUND session answered %s — the fulfill RPCs snapshot the number, so a re-bind moves a paid order', v_got);
  select count(*) into n from public.table_sessions where id = s1 and table_number = 96;
  assert n = 1, 'M263.8 · the bound session left table 96';

  -- The freeze read is the OPEN cart's: a paid cart's leftover lock is history, not a charge.
  s5 := pg_temp.m263_session('M263-G5', null, ana);
  update public.qr_carts set status = 'paid', locked = true, locked_at = now() where session_id = s5;
  v_got := pg_temp.m263_bind(s5, 97);
  assert v_got = 'bound:97', format('M263.9 · a session whose only cart is PAID (with a fresh lock on it) answered %s', v_got);
  perform pg_temp.m263_close(s5);

  s6 := pg_temp.m263_session('M263-G6', null, ana);
  update public.table_sessions set status = 'closed' where id = s6;
  v_got := pg_temp.m263_bind(s6, 97);
  assert v_got = 'unmoved:', format('M263.10 · a CLOSED session answered %s', v_got);

  s7 := pg_temp.m263_session('M263-G7', null, ana, 'pickup');
  v_got := pg_temp.m263_bind(s7, 97);
  assert v_got = 'unmoved:', format('M263.11 · a PICKUP session answered %s — a to-go order seated on the floor', v_got);
  perform pg_temp.m263_close(s7);

  s8 := pg_temp.m263_session('M263-G8', null, ana);
  update public.table_sessions set expires_at = now() - interval '1 minute' where id = s8;
  v_got := pg_temp.m263_bind(s8, 97);
  assert v_got = 'unmoved:', format('M263.12 · an EXPIRED session answered %s — a bind must not revive a session every cart write already refuses', v_got);
  perform pg_temp.m263_close(s8);

  s10 := pg_temp.m263_session('M263-G10', null, ana);
  select qr_code, expires_at, host_seat into v_before from public.table_sessions where id = s10;
  v_got := pg_temp.m263_bind(s10, 97);
  assert v_got = 'bound:97', format('M263.13 · a plain bind answered %s', v_got);
  select qr_code, expires_at, host_seat into v_after from public.table_sessions where id = s10;
  assert v_after.qr_code = v_before.qr_code, format('M263.13 · the bind rewrote qr_code to %s — every phone''s persisted key, the stripped URL and the invite name the old one (D21)', v_after.qr_code);
  assert v_after.expires_at = v_before.expires_at, 'M263.13 · the bind slid expires_at — a second writer of the expiry beside assertCartMember''s renewal';
  assert v_after.host_seat = v_before.host_seat, 'M263.13 · the bind changed host_seat';
  perform pg_temp.m263_close(s10);

  -- 96 is s1's: a second session's bind there is the index's to refuse, and the refusal propagates.
  s9 := pg_temp.m263_session('M263-G9', null, ana);
  v_got := pg_temp.m263_bind(s9, 96);
  assert v_got = 'raised:23505', format('M263.14 · a bind onto a SEATED number answered %s — the caller reads 23505 by code and re-reads the holder', v_got);
  select count(*) into n from public.table_sessions where id = s9 and table_number is null;
  assert n = 1, 'M263.14 · the collided session moved';
  v_got := pg_temp.m263_bind(s9, 91);
  assert v_got = 'raised:23503', format('M263.15 · a bind onto an UNREGISTERED number answered %s — the registry FK must propagate', v_got);
  perform pg_temp.m263_close(s1, s6, s9);

  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'mms_bind_session_table';
  assert n = 1, format('M263.16 · %s definitions of mms_bind_session_table — an overload landed', n);
  assert not has_function_privilege('anon', 'public.mms_bind_session_table(uuid, integer, uuid)', 'execute'),
    'M263.16 · anon can EXECUTE mms_bind_session_table';
  assert not has_function_privilege('authenticated', 'public.mms_bind_session_table(uuid, integer, uuid)', 'execute'),
    'M263.16 · authenticated can EXECUTE mms_bind_session_table — a diner could bind any session';
  assert has_function_privilege('service_role', 'public.mms_bind_session_table(uuid, integer, uuid)', 'execute'),
    'M263.16 · service_role cannot EXECUTE mms_bind_session_table — every bind would fail';
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'mms_bind_session_table'
     and p.prosecdef and 'search_path=""' = any(p.proconfig);
  assert n = 1, 'M263.16 · not SECURITY DEFINER with an empty search_path';

  -- ══ J41 — a sticker session binds only to its own table ═══════════════════════════════════════
  s3 := pg_temp.m263_session('M263-T93', null, ana);
  v_got := pg_temp.m263_bind(s3, 97);
  assert v_got = 'sticker:93', format('J41.1 · a session on table 93''s ACTIVE sticker, bound to 97, answered %s — 93 is then wedged on the token index', v_got);
  select count(*) into n from public.table_sessions where id = s3 and table_number is null;
  assert n = 1, 'J41.1 · the refused bind moved the session';

  v_got := pg_temp.m263_bind(s3, 93);
  assert v_got = 'bound:93', format('J41.2 · the sticker session bound to its OWN table answered %s', v_got);

  v_got := pg_temp.m263_bind(s3, 97);
  assert v_got = 'unmoved:', format('J41.3 · a BOUND sticker session answered %s — the sticker rule is for unbound rows; a bound one is the CAS''s', v_got);
  select count(*) into n from public.table_sessions where id = s3 and table_number = 93;
  assert n = 1, 'J41.3 · the bound sticker session left 93';
  perform pg_temp.m263_close(s3);

  s4 := pg_temp.m263_session('M263-T95', null, ana);
  v_got := pg_temp.m263_bind(s4, 97);
  assert v_got = 'bound:97', format('J41.4 · a session on an INACTIVE registration answered %s — the sticker arm resolves active stickers only', v_got);
  perform pg_temp.m263_close(s4);

  -- ══ J40 — an untouched staff shell yields to the Send-time host ═══════════════════════════════
  -- J40.1 — the realistic shape: the register's Start stamps the table's STICKER code (register.ts).
  b := pg_temp.m263_session('M263-B1', null, ana);
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (pg_temp.m263_cart(b), dish, 'Mohinga', 2, 1400, 147, ana, 'dinein') returning id into v_line;
  sh := pg_temp.m263_session('M263-T94', 94, null);
  c := pg_temp.m263_cart(sh);
  v_got := pg_temp.m263_bind(b, 94, sh);
  assert v_got = 'adopted:94', format('J40.1 · an UNTOUCHED shell answered %s — the party staff just seated cannot bind its own table', v_got);
  select count(*) into n from public.table_sessions where id = sh and status = 'closed';
  assert n = 1, 'J40.1 · the adopted shell is still live';
  select count(*) into n from public.qr_carts where id = c and status = 'cancelled';
  assert n = 1, 'J40.1 · the adopted shell''s empty cart is still open — a staff pad write lands on a table nobody holds';
  select count(*) into n from public.table_sessions where id = b and table_number = 94 and status = 'active';
  assert n = 1, 'J40.1 · the binder is not at 94';
  select count(*) into n from public.qr_cart_items ci join public.qr_carts ct on ct.id = ci.cart_id
   where ci.id = v_line and ct.session_id = b and ct.status = 'open' and ci.state = 'draft';
  assert n = 1, 'J40.1 · the binder''s own draft did not survive the adopt';
  perform pg_temp.m263_close(b);

  b := pg_temp.m263_session('M263-B2', null, ana);
  sh := pg_temp.m263_session('M263-S2', 94, null);
  insert into public.session_members (session_id, seat_id, display_name, role) values (sh, bo, 'Bo', 'guest');
  v_got := pg_temp.m263_bind(b, 94, sh);
  assert v_got = 'held:', format('J40.2 · a shell someone JOINED answered %s — the adopt closes a session a diner is a member of', v_got);
  select count(*) into n from public.table_sessions where id = sh and status = 'active';
  assert n = 1, 'J40.2 · the held shell was closed';
  select count(*) into n from public.qr_carts where session_id = sh and status = 'open';
  assert n = 1, 'J40.2 · the held shell''s cart was cancelled';
  select count(*) into n from public.table_sessions where id = b and table_number is null;
  assert n = 1, 'J40.2 · the binder moved on a held shell';
  perform pg_temp.m263_close(b, sh);

  b := pg_temp.m263_session('M263-B3', null, ana);
  sh := pg_temp.m263_session('M263-S3', 94, bo);
  v_got := pg_temp.m263_bind(b, 94, sh);
  assert v_got = 'gone:', format('J40.3 · a shell a diner has CLAIMED (host_seat set) answered %s — that is a party, not a shell', v_got);
  select count(*) into n from public.table_sessions where id = sh and status = 'active';
  assert n = 1, 'J40.3 · the claimed shell was closed';
  perform pg_temp.m263_close(b, sh);

  b := pg_temp.m263_session('M263-B4', null, ana);
  sh := pg_temp.m263_session('M263-S4', 94, null);
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment, state)
    values (pg_temp.m263_cart(sh), dish, 'Mohinga', 1, 1400, 147, null, 'dinein', 'voided');
  v_got := pg_temp.m263_bind(b, 94, sh);
  assert v_got = 'held:', format('J40.4 · a shell with a (voided) LINE answered %s — the void record is the kitchen''s, cancelled with the cart', v_got);
  perform pg_temp.m263_close(b, sh);

  b := pg_temp.m263_session('M263-B5', null, ana);
  sh := pg_temp.m263_session('M263-S5', 94, null);
  insert into public.qr_carts (session_id, status) values (sh, 'paid');
  v_got := pg_temp.m263_bind(b, 94, sh);
  assert v_got = 'held:', format('J40.5 · a shell with an EARLIER (paid) order answered %s — closing it hides a paid order''s table', v_got);
  perform pg_temp.m263_close(b, sh);

  b := pg_temp.m263_session('M263-B6', null, ana);
  sh := pg_temp.m263_session('M263-S6', 94, null);
  update public.qr_carts set customer_name = 'Ana' where id = pg_temp.m263_cart(sh);
  v_got := pg_temp.m263_bind(b, 94, sh);
  assert v_got = 'held:', format('J40.6 · a shell staff NAMED answered %s', v_got);
  perform pg_temp.m263_close(b, sh);

  b := pg_temp.m263_session('M263-B7', null, ana);
  sh := pg_temp.m263_session('M263-S7', 94, null);
  update public.qr_carts set promo_code = 'M263' where id = pg_temp.m263_cart(sh);
  v_got := pg_temp.m263_bind(b, 94, sh);
  assert v_got = 'held:', format('J40.7 · a shell with a PROMO answered %s', v_got);
  perform pg_temp.m263_close(b, sh);

  b := pg_temp.m263_session('M263-B8', null, ana);
  sh := pg_temp.m263_session('M263-S8', 94, null);
  update public.qr_carts set tab_type = 'trust', tab_opened_at = now() where id = pg_temp.m263_cart(sh);
  v_got := pg_temp.m263_bind(b, 94, sh);
  assert v_got = 'held:', format('J40.8 · a shell with an open TAB answered %s', v_got);
  perform pg_temp.m263_close(b, sh);

  b := pg_temp.m263_session('M263-B9', null, ana);
  sh := pg_temp.m263_session('M263-S9', 94, null);
  update public.qr_carts set locked = true where id = pg_temp.m263_cart(sh);
  v_got := pg_temp.m263_bind(b, 94, sh);
  assert v_got = 'held:', format('J40.9 · a shell with a PAY ATTEMPT (locked, no stamp) answered %s', v_got);
  perform pg_temp.m263_close(b, sh);

  b := pg_temp.m263_session('M263-B10', null, ana);
  sh := pg_temp.m263_session('M263-S10', 94, null);
  update public.qr_carts set settle_at = now() - interval '1 day' where id = pg_temp.m263_cart(sh);
  v_got := pg_temp.m263_bind(b, 94, sh);
  assert v_got = 'held:', format('J40.10 · a shell with a SPLIT (a day old) answered %s — any settlement is history, never a stale freshness', v_got);
  perform pg_temp.m263_close(b, sh);

  b := pg_temp.m263_session('M263-B11', null, ana);
  sh := pg_temp.m263_session('M263-S11', 94, null);
  update public.qr_carts set status = 'cancelled' where session_id = sh;
  v_got := pg_temp.m263_bind(b, 94, sh);
  assert v_got = 'gone:', format('J40.11 · a shell with NO open cart answered %s — mid-Start, mid-clear, or adopted under us', v_got);
  select count(*) into n from public.table_sessions where id = sh and status = 'active';
  assert n = 1, 'J40.11 · the cartless shell was closed';
  perform pg_temp.m263_close(b, sh);

  b := pg_temp.m263_session('M263-B12', null, ana);
  sh := pg_temp.m263_session('M263-S12', 94, null);
  v_got := pg_temp.m263_bind(b, 97, sh);
  assert v_got = 'gone:', format('J40.12 · a shell at 94 handed to a bind of 97 answered %s — the adopt closes a table the diner never picked', v_got);
  select count(*) into n from public.table_sessions where id = sh and status = 'active';
  assert n = 1, 'J40.12 · the other table''s shell was closed';
  select count(*) into n from public.qr_carts where session_id = sh and status = 'open';
  assert n = 1, 'J40.12 · the other table''s cart was cancelled';
  perform pg_temp.m263_close(b, sh);

  b := pg_temp.m263_session('M263-B13', null, ana);
  sh := pg_temp.m263_session('M263-S13', 94, null, 'pickup');
  v_got := pg_temp.m263_bind(b, 94, sh);
  assert v_got = 'gone:', format('J40.13 · a hostless PICKUP row answered %s — a counter order is never a shell', v_got);
  select count(*) into n from public.table_sessions where id = sh and status = 'active';
  assert n = 1, 'J40.13 · the pickup row was closed';
  perform pg_temp.m263_close(b, sh);

  b := pg_temp.m263_session('M263-B14', null, ana);
  sh := pg_temp.m263_session('M263-S14', 94, null);
  update public.table_sessions set status = 'closed' where id = sh;   -- the cron-swept shape: its cart left open
  v_got := pg_temp.m263_bind(b, 94, sh);
  assert v_got = 'gone:', format('J40.14 · a CLOSED shell answered %s', v_got);
  select count(*) into n from public.qr_carts where session_id = sh and status = 'open';
  assert n = 1, 'J40.14 · the closed shell''s cart was cancelled';
  perform pg_temp.m263_close(b);

  -- J40.15 — the CAS moves no row (the binder is already at 92): the adopt is taken back with it.
  b := pg_temp.m263_session('M263-B15', 92, ana);
  sh := pg_temp.m263_session('M263-S15', 94, null);
  v_got := pg_temp.m263_bind(b, 94, sh);
  assert v_got = 'unmoved:', format('J40.15 · an adopt whose CAS moved no row answered %s', v_got);
  select count(*) into n from public.table_sessions where id = sh and status = 'active';
  assert n = 1, 'J40.15 · a shell was closed by a bind that never landed — the table reads empty while nobody holds it';
  select count(*) into n from public.qr_carts where session_id = sh and status = 'open';
  assert n = 1, 'J40.15 · the shell''s cart was cancelled by a bind that never landed';
  select count(*) into n from public.table_sessions where id = b and table_number = 92;
  assert n = 1, 'J40.15 · the bound binder left 92';
  perform pg_temp.m263_close(b, sh);

  s11 := pg_temp.m263_session('M263-T93', null, ana);
  sh := pg_temp.m263_session('M263-S16', 94, null);
  v_got := pg_temp.m263_bind(s11, 94, sh);
  assert v_got = 'sticker:93', format('J40.16 · a sticker session adopting another table''s shell answered %s', v_got);
  select count(*) into n from public.table_sessions where id = sh and status = 'active';
  assert n = 1, 'J40.16 · the sticker refusal still closed the shell';
  perform pg_temp.m263_close(s11, sh);

  b := pg_temp.m263_session('M263-B17', null, ana);
  update public.qr_carts set locked = true, locked_at = now() where id = pg_temp.m263_cart(b);
  sh := pg_temp.m263_session('M263-S17', 94, null);
  v_got := pg_temp.m263_bind(b, 94, sh);
  assert v_got = 'locked:', format('J40.17 · an adopt under the binder''s FRESH pay lock answered %s', v_got);
  select count(*) into n from public.table_sessions where id = sh and status = 'active';
  assert n = 1, 'J40.17 · the frozen bind still closed the shell';
  perform pg_temp.m263_close(b, sh);
end $$;

rollback;
