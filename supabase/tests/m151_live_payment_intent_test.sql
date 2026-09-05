-- supabase/tests/m151_live_payment_intent_test.sql  (M151 · M152 · M124 — the cart→intent link)
--
-- A promo pin could be cleared while a CAPTURED PaymentIntent still depended on it, from three
-- mouths (M152 a/b/c), and two overlapping attempts could hold different pins with the older intent
-- still chargeable (M151). The fix is one fact — `qr_carts.live_payment_intent_id` — and one rule:
-- a pin is cleared only while no live intent names it.
--
-- ── What each case is for ───────────────────────────────────────────────────────────────────────
--   1. THE DEFECT (M152b/c) — `mms_release_promo_grant` under a MATCHING era, with a live intent
--      linked. Must NOT clear. Before this migration the era matched and the pin died.
--   2. The legitimate path — same call, link null. Must clear, or the fix has simply broken every
--      re-checkout (the successor's own release would no-op and a $30 grant would price a $20 basket).
--   3. The cart-wide arm — `locked_at is null` with a live link. Must NOT clear either; this is the
--      arm a stale decline reaches after a successor's cart-wide lock release (M152b's second route).
--   4. `mms_mark_settle_canceled` for THE linked intent — pin AND link cleared together.
--   5. `mms_mark_settle_canceled` for a DIFFERENT intent (a superseded predecessor, cancelled by the
--      cron after the successor linked) — the successor's pin and link are untouched, and the
--      cancellation row still lands.
--   6. Redelivery of 4 — the ledger's `on conflict do nothing` makes it a no-op; the pin stays gone
--      and nothing else moves (the M70 case 8 shape, carried forward).
--
-- Every case asserts the pin AND the link, because the migration writes both in one statement and a
-- half-fix would leave one of them wrong.
--
-- Run against any QR DB (rolls back — leaves NO data behind):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/m151_live_payment_intent_test.sql

begin;
-- W8: without this GUC every ASSERT below compiles out and the file exits 0 having proved nothing.
set local plpgsql.check_asserts = on;

do $$
declare
  ana   uuid := '00000000-0000-0000-0000-000000000151';
  dish  text := 'cccccccc-0000-4000-8000-000000000151';
  era   timestamptz := '2026-09-05T10:00:00Z';
  sess  uuid; cart uuid;
  pin integer; link text; n integer; ledger integer;
begin
  -- Column present: the whole file is vacuous without it.
  assert exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'qr_carts'
                    and column_name = 'live_payment_intent_id'),
    'M151.0 the column is missing — the migration did not apply';

  insert into public.promo_codes (code, kind, value, max_uses, used, active, per_session_limit, min_subtotal_cents)
    values ('M151TEN', 'flat', 1000, 999, 0, true, 99, 0)
    on conflict (code) do update set kind = 'flat', value = 1000, active = true, used = 0,
      per_session_limit = 99, min_subtotal_cents = 0, valid_from = null, valid_until = null;

  -- ══ 1. THE DEFECT — era matches, a live intent is linked: the release must be REFUSED ═════════
  sess := gen_random_uuid(); cart := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat)
    values (sess, 'M151C1', 'pickup', 'active', ana);
  insert into public.qr_carts (id, session_id, promo_code, locked, locked_at, locked_by)
    values (cart, sess, 'M151TEN', true, era, ana);
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (cart, dish, 'Mohinga', 1, 3000, 0, null, 'togo');
  pin := public.mms_pin_promo_grant(cart);
  assert pin = 1000, format('M151.1 fixture drift: pin should be 1000, got %s', pin);
  update public.qr_carts set live_payment_intent_id = 'pi_live_1' where id = cart;

  perform public.mms_release_promo_grant(cart, era);
  select promo_granted_cents, live_payment_intent_id into pin, link from public.qr_carts where id = cart;
  assert pin = 1000,
    format('M151.1 THE DEFECT: the era-scoped release cleared a pin a LIVE intent still reconciles '
           'against — pin=%s, want 1000. A delayed webhook now re-derives without it: charged card, no order.', pin);
  assert link = 'pi_live_1', format('M151.1 the release must not touch the link either, got %s', link);

  -- ══ 2. LEGITIMATE — same call, link null: the release must clear ═════════════════════════════
  update public.qr_carts set live_payment_intent_id = null where id = cart;
  perform public.mms_release_promo_grant(cart, era);
  select promo_granted_cents into pin from public.qr_carts where id = cart;
  assert pin is null,
    format('M151.2 OVER-BLOCKED: with no live intent the successor''s release must clear the pin, got %s. '
           'Every re-checkout would now charge the predecessor''s grant.', pin);

  -- ══ 3. THE CART-WIDE ARM — locked_at null, live link: still refused ═══════════════════════════
  pin := public.mms_pin_promo_grant(cart);
  assert pin = 1000, 'M151.3 fixture drift: re-pin should be 1000';
  update public.qr_carts set locked = false, locked_at = null, locked_by = null,
                             live_payment_intent_id = 'pi_live_3' where id = cart;
  perform public.mms_release_promo_grant(cart, era);
  select promo_granted_cents into pin from public.qr_carts where id = cart;
  assert pin = 1000,
    format('M151.3 the `locked_at is null` arm cleared a pin under a live intent, got %s', pin);

  -- ══ 4. THE CRON CANCELS THE LINKED INTENT — pin and link go together ═════════════════════════
  update public.qr_carts set locked = true, locked_at = era, locked_by = ana,
                             live_payment_intent_id = 'pi_hold_4' where id = cart;
  n := public.mms_mark_settle_canceled('pi_hold_4', cart, 'sold_out', ana, era);
  assert n = 1, format('M151.4 fixture drift: first cancellation should insert 1 row, got %s', n);
  select promo_granted_cents, live_payment_intent_id into pin, link from public.qr_carts where id = cart;
  assert pin is null, format('M151.4 the cancelled hold''s pin must be released, got %s', pin);
  assert link is null, format('M151.4 the cancelled hold''s LINK must be dropped, got %s', link);

  -- ══ 5. THE CRON CANCELS A PREDECESSOR — the successor's pin and link survive ═════════════════
  pin := public.mms_pin_promo_grant(cart);
  assert pin = 1000, 'M151.5 fixture drift: successor pin should be 1000';
  update public.qr_carts set live_payment_intent_id = 'pi_successor_5' where id = cart;
  n := public.mms_mark_settle_canceled('pi_predecessor_5', cart, 'superseded', ana, era);
  assert n = 1, format('M151.5 the predecessor''s cancellation row must still land, got %s', n);
  select promo_granted_cents, live_payment_intent_id into pin, link from public.qr_carts where id = cart;
  assert pin = 1000,
    format('M151.5 THE M151 CASE: cancelling the PREDECESSOR cleared the SUCCESSOR''s pin, got %s', pin);
  assert link = 'pi_successor_5',
    format('M151.5 cancelling the predecessor dropped the successor''s link, got %s', link);

  -- ══ 6. REDELIVERY of 4 — a no-op that moves nothing ══════════════════════════════════════════
  n := public.mms_mark_settle_canceled('pi_hold_4', cart, 'sold_out', ana, era);
  assert n = 0, format('M151.6 a redelivered cancellation must insert nothing, got %s', n);
  select promo_granted_cents, live_payment_intent_id into pin, link from public.qr_carts where id = cart;
  assert pin = 1000 and link = 'pi_successor_5',
    format('M151.6 a redelivery moved the cart: pin=%s link=%s', pin, link);
  select count(*) into ledger from public.qr_settlement_cancellations where cart_id = cart;
  assert ledger = 2, format('M151.6 ledger should hold exactly the two cancellations, got %s', ledger);
end $$;

rollback;
