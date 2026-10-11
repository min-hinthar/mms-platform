-- supabase/tests/pd1_send_nudge_test.sql  (PD1 — "Let Aye know": the nudge stamp, from the database side)
--
-- `mms_nudge_host(p_cart_id, p_seat)` writes the guest's nudge as a durable stamp on the cart with
-- EVERY rule in the statement's WHERE (20261008123000_pd1_send_nudge.sql), and `mms_fire_cart`
-- clears it in the same transaction as the fire. Each case pins a refusal AND the legitimate write
-- beside it (an over-tight guard would block a real nudge, and a refusal-only test would never
-- notice). Every behaviour case (PD1.2–PD1.17) is falsified by a named mutant in
-- scripts/verify-mode-authority.mjs (suite `pd1`), which matches the `PD1.<n> ·` prefix of the
-- failing assert — so each message carries it. PD1.1 (the columns) and PD1.18 (the grants) are
-- shape checks that runner cannot mutate: a grant leaves `prosrc` unchanged, so it reads NO-OP.
--
--   PD1.1   the two columns exist, nullable, with the shapes the view reads;
--   PD1.2   a GUEST of a host table may nudge: the stamp lands with THEIR seat and `now()`, and the
--           answer carries that seat;
--   PD1.3   the same seat again inside the minute is `recent`: the stamp STANDS, and the answer
--           carries the standing stamp and its seat;
--   PD1.4   ANOTHER seat inside the minute is `taken`: the stamp stands, and the answer names the
--           seat that nudged — never the caller's (the blind pass on #335);
--   PD1.5   past the minute any member stamps again, in their own name;
--   PD1.6   the HOST may not (`is_host`) · PD1.7 a NON-member may not (`not_member`) · PD1.8 a
--           HOSTLESS table has nobody to nudge (`no_host`) · PD1.9 a closed cart, or a closed session
--           with its cart still open, refuses (`closed`) — none of them writes;
--   PD1.10  a FRESH pay lock refuses (`paying`) and a STALE one (past `CART_LOCK_TTL_MS`) does not;
--   PD1.11  a FRESH split freeze refuses (`paying`) and a STALE one (past `SETTLE_TTL_MS`) does not;
--   PD1.12  no DINE-IN DRAFT, nothing to nudge for (`nothing_to_send`): a to-go draft alone, and a
--           pickup-mode table, both refuse; a dine-in draft lands;
--   PD1.13  the fire clears a standing stamp (both halves) when it moves a line;
--   PD1.14  a fire that moves NOTHING leaves the stamp standing (the wait it names is still real);
--   PD1.15  a fire with NO stamp writes no cart row (its `ctid` is unchanged) — no `qr_carts`
--           realtime event per Send (the blind pass's perf finding);
--   PD1.16  the fire takes the cart row lock (a line-less cart's `xmax`), and PD1.17 so does the
--           nudge, even when it refuses — the lock is TAKEN. Its ORDER against an add, a qty change,
--           a nudge or a merge needs two sessions: scripts/verify-fire-cart-race.mjs;
--   PD1.18  the function is callable by service_role only, and the restated fire keeps its revoke;
--   PD1.19  a STALE stamp — no dine-in draft added at or before it — is no wait (the last blind pass
--           on #335): another seat's nudge inside the minute LANDS instead of being answered
--           `taken`; beside it, the same stamp with a draft that predates it is still `taken`.
--
-- ⚠️ `now()` is the TRANSACTION start time and this whole file is one transaction, so "a minute
-- later" (and a stale lock) is simulated by moving the stamp into the past directly.
--
-- ⚠️ WHY PD1.16/17 PROBE CARTS NO LINE HAS TOUCHED (M261.1's reason): a line write's FK check takes
-- `for key share` on the cart and stamps the very `xmax` the case reads.
--
-- First run red-first (2026-10-09) on LEARNINGS #95's throwaway Postgres 16 with every migration and
-- the seed applied; that run corrected one assert (`fired` counts LINES, not units).
--
-- Run against any QR DB (rolls back — leaves NO data behind):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/pd1_send_nudge_test.sql
begin;
-- Without this GUC every ASSERT below compiles out and the file exits 0 having proved nothing.
set local plpgsql.check_asserts = on;

-- ── PD1.1 · the columns exist with the shape the reads assume ──────────────────────────────────
do $$
declare v_type text; v_nullable text;
begin
  select data_type, is_nullable into v_type, v_nullable
    from information_schema.columns
   where table_schema = 'public' and table_name = 'qr_carts' and column_name = 'send_nudge_seat';
  assert v_type = 'uuid', format('PD1.1 · send_nudge_seat is %s, expected uuid', coalesce(v_type, 'missing'));
  assert v_nullable = 'YES', 'PD1.1 · send_nudge_seat must be nullable — null IS "nobody waiting"';
  select data_type, is_nullable into v_type, v_nullable
    from information_schema.columns
   where table_schema = 'public' and table_name = 'qr_carts' and column_name = 'send_nudge_at';
  assert v_type = 'timestamp with time zone', format('PD1.1 · send_nudge_at is %s, expected timestamptz', coalesce(v_type, 'missing'));
  assert v_nullable = 'YES', 'PD1.1 · send_nudge_at must be nullable';
end $$;

-- ── PD1.2–PD1.17 · the guards, each refusing AND the legitimate write beside it ────────────────
do $$
declare
  aye   uuid := '00000000-0000-0000-0000-00000000a4e1';   -- the host
  thiri uuid := '00000000-0000-0000-0000-00000000111b';   -- a guest
  mya   uuid := '00000000-0000-0000-0000-00000000a7a1';   -- another guest
  stranger uuid := '00000000-0000-0000-0000-0000000057a0'; -- not a member
  dish  text := 'cccccccc-0000-4000-8000-00000000d1d1';
  sess  uuid := gen_random_uuid();  cart  uuid := gen_random_uuid();
  hsess uuid := gen_random_uuid();  hcart uuid := gen_random_uuid();   -- a hostless (staff-started) table
  tsess uuid := gen_random_uuid();  tcart uuid := gen_random_uuid();   -- a to-go draft only
  psess uuid := gen_random_uuid();  pcart uuid := gen_random_uuid();   -- a pickup-mode session
  esess uuid := gen_random_uuid();  ecart uuid := gen_random_uuid();   -- no line, ever (the fire's xmax probe)
  nsess uuid := gen_random_uuid();  ncart uuid := gen_random_uuid();   -- no line, ever (the nudge's xmax probe)
  r record;
  v_seat uuid; v_at timestamptz; v_first timestamptz;
  v_fired integer; v_n integer; v_xmax text; v_ctid tid; v_ctid2 tid;
begin
  insert into public.table_sessions (id, qr_code, mode, status, host_seat) values
    (sess,  'PD1-NUDGE-1', 'dinein', 'active', aye),
    (hsess, 'PD1-NUDGE-H', 'dinein', 'active', null),
    (tsess, 'PD1-NUDGE-T', 'dinein', 'active', aye),
    (psess, 'PD1-NUDGE-P', 'dinein', 'active', aye),   -- flipped to pickup once seated, below
    (esess, 'PD1-NUDGE-E', 'dinein', 'active', aye),
    (nsess, 'PD1-NUDGE-N', 'dinein', 'active', aye);
  insert into public.session_members (session_id, seat_id, role, display_name) values
    (sess, aye, 'host', 'Aye'), (sess, thiri, 'guest', 'Thiri'), (sess, mya, 'guest', 'Mya'),
    (hsess, thiri, 'guest', 'Thiri'),
    (tsess, aye, 'host', 'Aye'), (tsess, thiri, 'guest', 'Thiri'),
    (psess, aye, 'host', 'Aye'), (psess, thiri, 'guest', 'Thiri'),
    (esess, aye, 'host', 'Aye'),
    (nsess, aye, 'host', 'Aye'), (nsess, thiri, 'guest', 'Thiri');
  -- A pickup session is SOLO since #339 (`mms_refuse_solo_join` refuses its second member), so the
  -- mode case seats two at a dine-in table and then turns it into a pickup one: the nudge's own
  -- `s.mode = 'dinein'` term is what must refuse (PD1.12), not the membership trigger.
  update public.table_sessions set mode = 'pickup' where id = psess;
  insert into public.qr_carts (id, session_id) values
    (cart, sess), (hcart, hsess), (tcart, tsess), (pcart, psess), (ecart, esess), (ncart, nsess);
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment) values
    (cart,  dish, 'Mohinga', 2, 1400, 147, thiri, 'dinein'),
    (hcart, dish, 'Mohinga', 1, 1400, 147, thiri, 'dinein'),
    (tcart, dish, 'Mohinga', 1, 1400, 147, thiri, 'togo'),
    (pcart, dish, 'Mohinga', 1, 1400, 147, thiri, 'dinein');

  -- ══ PD1.2 · the guest's nudge lands, in THEIR name ═══════════════════════════════════════════
  select * into r from public.mms_nudge_host(cart, thiri);
  assert r.ok, format('PD1.2 · a guest of a host table must be able to nudge — got %s', r.reason);
  select send_nudge_seat, send_nudge_at into v_seat, v_first from public.qr_carts where id = cart;
  assert v_seat = thiri, 'PD1.2 · the stamp names the nudger''s seat';
  assert v_first = now(), 'PD1.2 · the stamp is now()';
  assert r.nudged_at = v_first and r.nudge_seat = thiri, 'PD1.2 · the answer carries the stamp it wrote and its seat';

  -- ══ PD1.3 · the same seat inside the minute: recent, the stamp stands ════════════════════════
  select * into r from public.mms_nudge_host(cart, thiri);
  assert not r.ok and r.reason = 'recent', format('PD1.3 · the same seat inside a minute must be recent — got %s', r.reason);
  assert r.nudged_at = v_first and r.nudge_seat = thiri, 'PD1.3 · recent carries the standing stamp and its seat';
  select send_nudge_seat, send_nudge_at into v_seat, v_at from public.qr_carts where id = cart;
  assert v_at = v_first and v_seat = thiri, 'PD1.3 · a recent nudge must not move the stamp';

  -- ══ PD1.4 · ANOTHER seat inside the minute: taken, naming whose nudge it is ══════════════════
  select * into r from public.mms_nudge_host(cart, mya);
  assert not r.ok and r.reason = 'taken', format('PD1.4 · another seat inside a minute must be taken — got %s', r.reason);
  assert r.nudge_seat = thiri and r.nudged_at = v_first, format('PD1.4 · taken must name the seat that nudged (Thiri), never the caller — got %s', r.nudge_seat);
  select send_nudge_seat, send_nudge_at into v_seat, v_at from public.qr_carts where id = cart;
  assert v_seat = thiri and v_at = v_first, 'PD1.4 · a taken nudge must not move the stamp';

  -- ══ PD1.5 · past the minute, any member stamps again in their own name ═══════════════════════
  update public.qr_carts set send_nudge_at = now() - interval '2 minutes' where id = cart;
  select * into r from public.mms_nudge_host(cart, mya);
  assert r.ok and r.nudge_seat = mya, format('PD1.5 · a nudge past the minute lands again — got %s', r.reason);
  select send_nudge_seat, send_nudge_at into v_seat, v_at from public.qr_carts where id = cart;
  assert v_seat = mya and v_at = now(), 'PD1.5 · the replaced stamp is Mya''s, now()';

  -- ══ PD1.6–PD1.9 · the host, a stranger, a hostless table, a closed cart or session ═══════════
  update public.qr_carts set send_nudge_seat = null, send_nudge_at = null where id = cart;
  select * into r from public.mms_nudge_host(cart, aye);
  assert not r.ok and r.reason = 'is_host', format('PD1.6 · the host nudging themselves must be is_host — got %s', r.reason);
  select * into r from public.mms_nudge_host(cart, stranger);
  assert not r.ok and r.reason = 'not_member', format('PD1.7 · a non-member must be not_member — got %s', r.reason);
  select * into r from public.mms_nudge_host(hcart, thiri);
  assert not r.ok and r.reason = 'no_host', format('PD1.8 · a hostless table must be no_host — got %s', r.reason);
  select count(*) into v_n from public.qr_carts where id in (cart, hcart) and send_nudge_at is not null;
  assert v_n = 0, 'PD1.6 · no refused nudge may write (host · stranger · hostless)';
  update public.qr_carts set status = 'paid' where id = cart;
  select * into r from public.mms_nudge_host(cart, thiri);
  assert not r.ok and r.reason = 'closed', format('PD1.9 · a closed cart must be closed — got %s', r.reason);
  update public.qr_carts set status = 'open' where id = cart;
  update public.table_sessions set status = 'closed' where id = sess;
  select * into r from public.mms_nudge_host(cart, thiri);
  assert not r.ok and r.reason = 'closed', format('PD1.9 · a closed session must be closed — got %s', r.reason);
  update public.table_sessions set status = 'active' where id = sess;
  select send_nudge_at into v_at from public.qr_carts where id = cart;
  assert v_at is null, 'PD1.9 · a closed cart or session takes no stamp';

  -- ══ PD1.10 · a FRESH pay lock refuses; a STALE one does not ══════════════════════════════════
  update public.qr_carts set locked = true, locked_at = now() - interval '1 minute', locked_by = aye where id = cart;
  select * into r from public.mms_nudge_host(cart, thiri);
  assert not r.ok and r.reason = 'paying', format('PD1.10 · a fresh pay lock must refuse (paying) — got %s', r.reason);
  update public.qr_carts set locked_at = now() - interval '6 minutes' where id = cart;
  select * into r from public.mms_nudge_host(cart, thiri);
  assert r.ok, format('PD1.10 · a STALE pay lock (past 5 minutes) must not refuse — got %s', r.reason);
  update public.qr_carts set locked = false, locked_at = null, locked_by = null,
                             send_nudge_seat = null, send_nudge_at = null where id = cart;

  -- ══ PD1.11 · a FRESH split freeze refuses; a STALE one does not ══════════════════════════════
  update public.qr_carts set settle_at = now() - interval '1 minute', settle_by = aye where id = cart;
  select * into r from public.mms_nudge_host(cart, thiri);
  assert not r.ok and r.reason = 'paying', format('PD1.11 · a fresh split freeze must refuse (paying) — got %s', r.reason);
  update public.qr_carts set settle_at = now() - interval '11 minutes' where id = cart;
  select * into r from public.mms_nudge_host(cart, thiri);
  assert r.ok, format('PD1.11 · a STALE split freeze (past 10 minutes) must not refuse — got %s', r.reason);
  update public.qr_carts set settle_at = null, settle_by = null,
                             send_nudge_seat = null, send_nudge_at = null where id = cart;

  -- ══ PD1.12 · no dine-in draft, nothing to nudge for ══════════════════════════════════════════
  select * into r from public.mms_nudge_host(tcart, thiri);
  assert not r.ok and r.reason = 'nothing_to_send', format('PD1.12 · a to-go draft alone has nothing to send — got %s', r.reason);
  select * into r from public.mms_nudge_host(pcart, thiri);
  assert not r.ok and r.reason = 'nothing_to_send', format('PD1.12 · a pickup-mode table has no Send — got %s', r.reason);
  select count(*) into v_n from public.qr_carts where id in (tcart, pcart) and send_nudge_at is not null;
  assert v_n = 0, 'PD1.12 · a nudge with nothing to send must not write';
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (tcart, dish, 'Tea leaf salad', 1, 1200, 126, thiri, 'dinein');
  select * into r from public.mms_nudge_host(tcart, thiri);
  assert r.ok, format('PD1.12 · a dine-in draft beside the to-go one lands — got %s', r.reason);

  -- ══ PD1.13 · the Send clears a standing stamp when it moves a line ═══════════════════════════
  select * into r from public.mms_nudge_host(cart, thiri);
  assert r.ok, 'PD1.13 · fixture: the nudge before the send lands';
  select fired into v_fired from public.mms_fire_cart(cart);
  assert v_fired = 1, format('PD1.13 · fixture: the send fires the one draft LINE (`fired` counts lines) — got %s', v_fired);
  select send_nudge_seat, send_nudge_at into v_seat, v_at from public.qr_carts where id = cart;
  assert v_seat is null and v_at is null, 'PD1.13 · the fire clears the stamp, both halves';

  -- ══ PD1.14 · a Send that fires nothing leaves a standing wait ════════════════════════════════
  update public.qr_carts set send_nudge_seat = thiri, send_nudge_at = now() - interval '5 minutes' where id = cart;
  select fired into v_fired from public.mms_fire_cart(cart);
  assert v_fired = 0, 'PD1.14 · fixture: nothing left to fire';
  select send_nudge_at into v_at from public.qr_carts where id = cart;
  assert v_at is not null, 'PD1.14 · a send that fires nothing must not clear a standing wait';

  -- ══ PD1.15 · a Send with no stamp writes no cart row ═════════════════════════════════════════
  update public.qr_carts set send_nudge_seat = null, send_nudge_at = null where id = cart;
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (cart, dish, 'Shan noodles', 1, 1500, 158, thiri, 'dinein');
  select c.ctid into v_ctid from public.qr_carts c where c.id = cart;
  select fired into v_fired from public.mms_fire_cart(cart);
  assert v_fired = 1, format('PD1.15 · fixture: the send fires the new draft — got %s', v_fired);
  select c.ctid into v_ctid2 from public.qr_carts c where c.id = cart;
  assert v_ctid = v_ctid2, format('PD1.15 · a send with no stamp must not rewrite the cart row (ctid %s → %s) — every Send would push a qr_carts realtime event', v_ctid, v_ctid2);

  -- ══ PD1.16 · the fire locks the cart row (taken, even on a cart with nothing to fire) ════════
  select c.xmax::text into v_xmax from public.qr_carts c where c.id = ecart;
  assert v_xmax = '0', format('PD1.16 · fixture drift: the line-less cart is already locked (xmax %s)', v_xmax);
  select fired into v_fired from public.mms_fire_cart(ecart);
  assert v_fired = 0, 'PD1.16 · fixture: nothing to fire on a line-less cart';
  select c.xmax::text into v_xmax from public.qr_carts c where c.id = ecart;
  assert v_xmax <> '0', 'PD1.16 · mms_fire_cart did not lock the cart row — cart → line is the order every add, qty change, merge and undo takes';

  -- ══ PD1.17 · the nudge locks the cart row (taken, even when it refuses) ══════════════════════
  select c.xmax::text into v_xmax from public.qr_carts c where c.id = ncart;
  assert v_xmax = '0', format('PD1.17 · fixture drift: the line-less cart is already locked (xmax %s)', v_xmax);
  select * into r from public.mms_nudge_host(ncart, thiri);
  assert not r.ok and r.reason = 'nothing_to_send', format('PD1.17 · fixture: a line-less cart has nothing to send — got %s', r.reason);
  select c.xmax::text into v_xmax from public.qr_carts c where c.id = ncart;
  assert v_xmax <> '0', 'PD1.17 · mms_nudge_host did not lock the cart row before deciding — a nudge racing a fire decides from a snapshot older than the fire';
end $$;

-- ── PD1.19 · a stale stamp is no wait ─────────────────────────────────────────────────────────
do $$
declare
  aye   uuid := '00000000-0000-0000-0000-00000000a4e1';
  thiri uuid := '00000000-0000-0000-0000-00000000111b';
  mya   uuid := '00000000-0000-0000-0000-00000000a7a1';
  dish  text := 'cccccccc-0000-4000-8000-00000000d1d1';
  zsess uuid := gen_random_uuid();  zcart uuid := gen_random_uuid();
  r record; v_seat uuid;
begin
  insert into public.table_sessions (id, qr_code, mode, status, host_seat)
    values (zsess, 'PD1-NUDGE-Z', 'dinein', 'active', aye);
  insert into public.session_members (session_id, seat_id, role, display_name)
    values (zsess, aye, 'host', 'Aye'), (zsess, thiri, 'guest', 'Thiri'), (zsess, mya, 'guest', 'Mya');
  insert into public.qr_carts (id, session_id) values (zcart, zsess);
  -- Mya's dish, and Thiri's stamp 30 seconds old: inside the minute.
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment, created_at)
    values (zcart, dish, 'Mohinga', 1, 1400, 147, mya, 'dinein', now() - interval '60 seconds');
  update public.qr_carts set send_nudge_seat = thiri, send_nudge_at = now() - interval '30 seconds' where id = zcart;
  -- LIVE: the dish was added BEFORE the stamp, so Thiri's wait is real — Mya's tap is `taken`.
  select * into r from public.mms_nudge_host(zcart, mya);
  assert not r.ok and r.reason = 'taken' and r.nudge_seat = thiri,
    format('PD1.19 · a live stamp (a draft that predates it) must still be taken — got %s', r.reason);
  -- STALE: Thiri's dish went (the only draft now was added AFTER her stamp). Her stamp names no wait.
  update public.qr_cart_items set created_at = now() where cart_id = zcart;
  select * into r from public.mms_nudge_host(zcart, mya);
  assert r.ok and r.nudge_seat = mya,
    format('PD1.19 · a stale stamp must not block Mya''s nudge or be answered for Thiri — got %s', r.reason);
  select send_nudge_seat into v_seat from public.qr_carts where id = zcart;
  assert v_seat = mya, 'PD1.19 · the live stamp is now Mya''s';
end $$;

-- ── PD1.18 · service_role only ─────────────────────────────────────────────────────────────────
do $$
begin
  assert has_function_privilege('service_role', 'public.mms_nudge_host(uuid, uuid)', 'execute'),
    'PD1.18 · service_role must be able to call mms_nudge_host';
  assert not has_function_privilege('anon', 'public.mms_nudge_host(uuid, uuid)', 'execute'),
    'PD1.18 · anon must not call mms_nudge_host';
  assert not has_function_privilege('authenticated', 'public.mms_nudge_host(uuid, uuid)', 'execute'),
    'PD1.18 · authenticated must not call mms_nudge_host';
  assert not has_function_privilege('anon', 'public.mms_fire_cart(uuid)', 'execute'),
    'PD1.18 · the restated mms_fire_cart keeps its revoke';
end $$;

rollback;
