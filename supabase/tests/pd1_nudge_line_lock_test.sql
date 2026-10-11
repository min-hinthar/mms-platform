-- supabase/tests/pd1_nudge_line_lock_test.sql  (PD1 follow-up — the nudge locks the dine-in drafts it decides on)
--
-- `mms_nudge_host` (restated in 20261011123000_pd1_nudge_line_lock.sql; Codex's post-merge review
-- of #335) takes its cart's DINE-IN DRAFTS `for share` after the cart lock and before its decision,
-- so a fulfillment change it races commits first or waits for it. One session cannot interleave
-- anything, so this file proves what one session CAN see — that the lock is TAKEN, on which lines —
-- and leaves its ORDER, STRENGTH and id order to scripts/verify-fire-cart-race.mjs (orders i–l and
-- their `--mutants`). Every behaviour case of the nudge itself is pd1_send_nudge_test.sql's, which
-- runs against this same body.
--
--   PD1N.1  a nudge locks every dine-in draft on its cart — when it lands, and when it refuses (the
--           lock comes before the decision, like the cart lock PD1.17 pins);
--   PD1N.2  it never locks a TO-GO draft or a SENT line: only the lines the UPDATE's `exists` reads;
--   PD1N.3  it never locks lines on a cart that is not OPEN — it refuses that cart anyway (`closed`),
--           and the post-pay kitchen writers work a paid cart's drafts;
--   PD1N.4  the restated function is callable by service_role only — and service_role holds UPDATE
--           on `qr_cart_items`, which `for share` needs: the nudge is SECURITY INVOKER, so its line
--           lock runs with the caller's privileges (the blind pass on #342; this file runs as
--           postgres, which never needs the grant).
--
-- Each case PD1N.1–3 is falsified by a named mutant in scripts/verify-mode-authority.mjs (suite
-- `pd1n`), which matches the `PD1N.<n> ·` prefix of the failing assert. PD1N.4 is a shape check that
-- runner cannot mutate (a grant leaves `prosrc` unchanged).
--
-- ⚠️ HOW A LOCK IS SEEN FROM ONE SESSION: a row lock writes the locker's xid into the row's `xmax`
-- (with the lock-only bits), and the nudge never UPDATEs a line — so a line's `xmax` moves off '0'
-- only if the nudge locked it. Every line here is inserted in this transaction and never written
-- again before it is read (an FK check on insert locks the CART, never the line).
--
-- First run red-first (2026-10-11) on LEARNINGS #95's throwaway Postgres 16 with every migration and
-- the seed applied: PD1N.1 red against PD1's body (20261008123000, which took no line lock), green
-- once the follow-up applied.
--
-- Run against any QR DB (rolls back — leaves NO data behind):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/pd1_nudge_line_lock_test.sql
begin;
-- Without this GUC every ASSERT below compiles out and the file exits 0 having proved nothing.
set local plpgsql.check_asserts = on;

do $$
declare
  aye   uuid := '00000000-0000-0000-0000-00000000a4e1';   -- the host
  thiri uuid := '00000000-0000-0000-0000-00000000111b';   -- a guest
  dish  text := 'cccccccc-0000-4000-8000-00000000d1d1';
  sess  uuid := gen_random_uuid();  cart  uuid := gen_random_uuid();   -- the table: drafts, a to-go draft, a sent line
  rsess uuid := gen_random_uuid();  rcart uuid := gen_random_uuid();   -- a dine-in draft the HOST nudges for (refused)
  psess uuid := gen_random_uuid();  pcart uuid := gen_random_uuid();   -- a PAID cart with a dine-in draft
  d1 uuid := gen_random_uuid();  d2 uuid := gen_random_uuid();         -- two dine-in drafts
  tg uuid := gen_random_uuid();                                        -- a to-go draft
  sent uuid := gen_random_uuid();                                      -- a dine-in line already sent
  rd uuid := gen_random_uuid();                                        -- the refused nudge's draft
  pd uuid := gen_random_uuid();                                        -- the paid cart's draft
  r record;
  v_xmax text;
begin
  insert into public.table_sessions (id, qr_code, mode, status, host_seat) values
    (sess,  'PD1N-LOCK-1', 'dinein', 'active', aye),
    (rsess, 'PD1N-LOCK-R', 'dinein', 'active', aye),
    (psess, 'PD1N-LOCK-P', 'dinein', 'active', aye);
  insert into public.session_members (session_id, seat_id, role, display_name) values
    (sess, aye, 'host', 'Aye'), (sess, thiri, 'guest', 'Thiri'),
    (rsess, aye, 'host', 'Aye'), (rsess, thiri, 'guest', 'Thiri'),
    (psess, aye, 'host', 'Aye'), (psess, thiri, 'guest', 'Thiri');
  insert into public.qr_carts (id, session_id) values (cart, sess), (rcart, rsess), (pcart, psess);
  insert into public.qr_cart_items (id, cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment) values
    (d1,  cart,  dish, 'Mohinga', 1, 1400, 147, thiri, 'dinein'),
    (d2,  cart,  dish, 'Mohinga', 2, 1400, 147, thiri, 'dinein'),
    (tg,  cart,  dish, 'Mohinga', 1, 1400, 0,   thiri, 'togo'),
    (rd,  rcart, dish, 'Mohinga', 1, 1400, 147, thiri, 'dinein'),
    (pd,  pcart, dish, 'Mohinga', 1, 1400, 147, thiri, 'dinein');
  insert into public.qr_cart_items (id, cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment, state, fire_at) values
    (sent, cart, dish, 'Mohinga', 1, 1400, 147, thiri, 'dinein', 'fired', now() - interval '1 minute');
  -- The paid cart: closed AFTER its line went in, so nothing but the nudge could lock that line.
  update public.qr_carts set status = 'paid' where id = pcart;

  -- Fixture drift: nothing has locked a line yet.
  select string_agg(xmax::text, ',') into v_xmax from public.qr_cart_items
   where id in (d1, d2, tg, sent, rd, pd) and xmax::text <> '0';
  assert v_xmax is null, format('PD1N · fixture drift: a line is already locked (xmax %s)', v_xmax);

  -- ══ PD1N.1 · the nudge locks every dine-in draft on its cart ══════════════════════════════════
  select * into r from public.mms_nudge_host(cart, thiri);
  assert r.ok, format('PD1N.1 · fixture: Thiri''s nudge must land — got %s', r.reason);
  select xmax::text into v_xmax from public.qr_cart_items where id = d1;
  assert v_xmax <> '0', 'PD1N.1 · mms_nudge_host did not lock a dine-in draft before deciding — a fulfillment change racing it is read from a snapshot older than its commit (Codex''s post-merge review of #335)';
  select xmax::text into v_xmax from public.qr_cart_items where id = d2;
  assert v_xmax <> '0', 'PD1N.1 · mms_nudge_host locked one dine-in draft and not the other';
  -- …and when it refuses: the lock comes before the decision (the host nudging their own table).
  select * into r from public.mms_nudge_host(rcart, aye);
  assert not r.ok and r.reason = 'is_host', format('PD1N.1 · fixture: the host''s nudge must be is_host — got %s', r.reason);
  select xmax::text into v_xmax from public.qr_cart_items where id = rd;
  assert v_xmax <> '0', 'PD1N.1 · mms_nudge_host took no line lock on a nudge it refused — the lock must come before the decision';

  -- ══ PD1N.2 · never a to-go draft or a sent line ═══════════════════════════════════════════════
  select xmax::text into v_xmax from public.qr_cart_items where id = tg;
  assert v_xmax = '0', 'PD1N.2 · a to-go draft was locked — the nudge locks only what its decision reads (dine-in drafts)';
  select xmax::text into v_xmax from public.qr_cart_items where id = sent;
  assert v_xmax = '0', 'PD1N.2 · a sent line was locked — the nudge locks only what its decision reads (dine-in DRAFTS)';

  -- ══ PD1N.3 · never on a cart that is not open ═════════════════════════════════════════════════
  select * into r from public.mms_nudge_host(pcart, thiri);
  assert not r.ok and r.reason = 'closed', format('PD1N.3 · fixture: a paid cart must be closed — got %s', r.reason);
  select xmax::text into v_xmax from public.qr_cart_items where id = pd;
  assert v_xmax = '0', 'PD1N.3 · a PAID cart''s draft was locked — the nudge refuses that cart anyway, and must not meet the post-pay kitchen writers there';
end $$;

-- ── PD1N.4 · service_role only ─────────────────────────────────────────────────────────────────
do $$
begin
  assert has_function_privilege('service_role', 'public.mms_nudge_host(uuid, uuid)', 'execute'),
    'PD1N.4 · service_role must be able to call the restated mms_nudge_host';
  assert not has_function_privilege('anon', 'public.mms_nudge_host(uuid, uuid)', 'execute'),
    'PD1N.4 · anon must not call the restated mms_nudge_host';
  assert not has_function_privilege('authenticated', 'public.mms_nudge_host(uuid, uuid)', 'execute'),
    'PD1N.4 · authenticated must not call the restated mms_nudge_host';
  assert has_table_privilege('service_role', 'public.qr_cart_items', 'update'),
    'PD1N.4 · service_role lacks UPDATE on qr_cart_items — the invoker nudge''s `for share` line lock would fail with 42501 for its only caller';
end $$;

rollback;
