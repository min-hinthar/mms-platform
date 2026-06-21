-- supabase/tests/rls_membership_test.sql  (M3·P3.4 — RLS membership negative tests)
-- Proves the session-scoped RLS that gates the group-cart + split-tender surface: a NON-member of a
-- table session cannot read another table's session / members / cart / cart items / shares / order rows,
-- and (positive control) a real member CAN read their own. The policies have existed since the init +
-- split-tender migrations; this PROVES them and keeps them proven (RED-TEAM #4 "trust boundaries are real").
--
-- Run against any QR DB (rolls back — leaves NO data behind):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_membership_test.sql
-- CI runs it against the local stack on every push (.github/workflows/ci.yml). Each check is a
-- `do $$ … assert … $$` that ABORTS the run on failure (psql ON_ERROR_STOP → non-zero exit → red CI).
--
-- How it impersonates a diner: Supabase `auth.uid()` reads `request.jwt.claims->>'sub'`, and RLS applies
-- to the non-superuser `authenticated` role — so `set local role authenticated` + `set local
-- request.jwt.claims` makes the very same policies a real anon-auth diner hits evaluate here.

begin;

-- ── fixtures (inserted as the privileged role, which bypasses RLS) ──────────────────────────────────
-- Two unrelated tables. Alice hosts A; Bob hosts B. Bob is the "attacker" probing table A he's not in.
insert into public.table_sessions (id, qr_code, mode, status, host_seat) values
  ('00000000-0000-0000-0000-0000000000a0', 'RLSTEST-A', 'dinein', 'active', '00000000-0000-0000-0000-00000000a1ce'),
  ('00000000-0000-0000-0000-0000000000b0', 'RLSTEST-B', 'dinein', 'active', '00000000-0000-0000-0000-0000000b0b00');
insert into public.session_members (session_id, seat_id, display_name, role) values
  ('00000000-0000-0000-0000-0000000000a0', '00000000-0000-0000-0000-00000000a1ce', 'Alice', 'host'),
  ('00000000-0000-0000-0000-0000000000b0', '00000000-0000-0000-0000-0000000b0b00', 'Bob',   'host');
insert into public.qr_carts (id, session_id) values
  ('00000000-0000-0000-0000-00000000ca70', '00000000-0000-0000-0000-0000000000a0');
insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents) values
  ('00000000-0000-0000-0000-00000000ca70', 'test-tea', 'Test Tea', 1, 500);
insert into public.qr_cart_shares (cart_id, seat_id, subtotal_cents, amount_cents) values
  ('00000000-0000-0000-0000-00000000ca70', '00000000-0000-0000-0000-00000000a1ce', 500, 500);
insert into public.qr_orders (id, session_id, subtotal_cents, service_charge_cents, tax_cents, total_cents, status) values
  ('00000000-0000-0000-0000-0000000000d0', '00000000-0000-0000-0000-0000000000a0', 500, 0, 49, 549, 'paid');

-- ── NEGATIVE: Bob is NOT a member of session A → RLS must hide EVERY A row from him ─────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000b0b00","role":"authenticated"}';
do $$
begin
  assert (select count(*) from public.table_sessions  where id         = '00000000-0000-0000-0000-0000000000a0') = 0, 'LEAK: non-member read table_sessions A';
  assert (select count(*) from public.session_members where session_id = '00000000-0000-0000-0000-0000000000a0') = 0, 'LEAK: non-member read session_members A';
  assert (select count(*) from public.qr_carts        where id         = '00000000-0000-0000-0000-00000000ca70') = 0, 'LEAK: non-member read qr_carts A';
  assert (select count(*) from public.qr_cart_items   where cart_id    = '00000000-0000-0000-0000-00000000ca70') = 0, 'LEAK: non-member read qr_cart_items A';
  assert (select count(*) from public.qr_cart_shares  where cart_id    = '00000000-0000-0000-0000-00000000ca70') = 0, 'LEAK: non-member read qr_cart_shares A';
  assert (select count(*) from public.qr_orders       where id         = '00000000-0000-0000-0000-0000000000d0') = 0, 'LEAK: non-member read qr_orders A';
end $$;
reset role;

-- ── POSITIVE control: Alice IS a member of A → she must read her own rows. Without this, a silently
--    broken role/claims setup (auth.uid() = null → everything hidden) would make the negatives pass for
--    the WRONG reason. ──────────────────────────────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a1ce","role":"authenticated"}';
do $$
begin
  assert (select count(*) from public.table_sessions  where id         = '00000000-0000-0000-0000-0000000000a0') = 1, 'BROKEN: member cannot read own table_sessions';
  assert (select count(*) from public.qr_carts        where id         = '00000000-0000-0000-0000-00000000ca70') = 1, 'BROKEN: member cannot read own qr_carts';
  assert (select count(*) from public.qr_cart_items   where cart_id    = '00000000-0000-0000-0000-00000000ca70') = 1, 'BROKEN: member cannot read own qr_cart_items';
  assert (select count(*) from public.qr_cart_shares  where cart_id    = '00000000-0000-0000-0000-00000000ca70') = 1, 'BROKEN: member cannot read own qr_cart_shares';
  assert (select count(*) from public.qr_orders       where id         = '00000000-0000-0000-0000-0000000000d0') = 1, 'BROKEN: member cannot read own qr_orders';
end $$;
reset role;

-- All assertions passed if we reach here. Roll back so the run is side-effect free + repeatable.
rollback;
