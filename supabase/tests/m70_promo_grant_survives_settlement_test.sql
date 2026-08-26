-- supabase/tests/m70_promo_grant_survives_settlement_test.sql  (M70)
--
-- A promo that lapses between authorization and capture raises the live total above the hold, and
-- `planCapture` cancels the whole order (`liveTotalCents > authorizedCents` → `over_authorized`,
-- apps/qr/lib/manual-capture.ts:85). The grant is now PINNED at authorization, so it cannot lapse
-- mid-settlement.
--
-- ⚠️ FOUR triggers, not one. The registry filed only the min-subtotal shortage, but
-- `mms_promo_discount_live` returns 0 on any of: a deleted or deactivated code, `now() <
-- valid_from`, `now() > valid_until`, or `subtotal < min_subtotal_cents`. Three need NO cart change
-- — a hold taken at 23:58 under a promo expiring at midnight cancels at 00:01 with the basket
-- untouched. Cases 2–5 are one per trigger; a fix that only taught the subtotal path would pass
-- case 2 and fail the rest, which is the whole reason they are separate.
--
-- ── What each case is for ───────────────────────────────────────────────────────────────────────
--   1. CONTROL — no pin: the live derivation still governs, and still drops. Without this the file
--      could not tell "the pin works" from "the promo never drops any more".
--   2. shortage      — subtotal falls under min_subtotal_cents after the pin.
--   3. wall clock    — valid_until passes after the pin.
--   4. deactivation  — `active` flipped false after the pin.
--   5. code deleted  — the promo_codes row is gone after the pin.
--   6. A PIN OF ZERO STICKS. `is not null`, not `> 0`: a cart with no valid promo at authorization
--      pins 0, and a promo becoming valid mid-settlement must NOT lower the total below what the
--      reconcile expects. This is the case a `coalesce(nullif(pin,0), live)` "tidy-up" would break.
--   7. IDEMPOTENCE — a second pin call does not move the grant. create-intent's Stripe idempotency
--      key embeds the derived amount, so a re-pin that moved would mint a SECOND PaymentIntent.
--   8. A CANCELLED SETTLEMENT RELEASES THE GRANT, and a REDELIVERED cancel does not. The clear is
--      guarded on the insert's row count; without that guard a duplicate webhook delivery would
--      wipe a pin belonging to a newer hold. Note this cart is UNLOCKED — see 12.
--   9. A NEW CODE VOIDS THE OLD GRANT — the app clears it in the same UPDATE as the code write;
--      this asserts the column actually allows that and the reader then re-derives.
--  10. AN ABANDONED ATTEMPT releases its grant — a pin with no PaymentIntent behind it authorizes
--      nothing, and cancellation cannot cover it (that records the end of a hold that EXISTED).
--  11. A SUPERSEDED CANCEL must not clear the SUCCESSOR's grant. The row count only rules out
--      redelivery of the same intent; a first-time cancel for a stale attempt still inserts.
--  12. …and the OVER-TIGHTENING that guards, which CI caught: a cancel whose lock has already been
--      released by its TTL must STILL release the grant. 11 and 12 pull in opposite directions on
--      purpose, so neither can be "fixed" alone.
--  13. A stale cancel whose verdict is NOT `superseded` must not clear either — the verdict describes
--      what the precheck saw, and a successor can acquire between that check and the write.
--  14. The abandon release is ERA-scoped: same uid, two overlapping attempts, and only the era
--      separates them.
--  15. The holder-scoped release behind "Edit order" and the unload beacon — a client that never saw
--      an era proves ownership the way `releaseCartLock` does, with `locked_by`.
--
-- Cases 8 · 11 · 12 · 13 pull against each other by design, and ONE predicate satisfies all four:
--     (locked_at is null or locked_at is not distinct from p_attempt)
-- i.e. clear unless a DIFFERENT live attempt currently owns the cart, asked at write time rather
-- than inherited from a verdict computed earlier.
--
-- Run against any QR DB (rolls back — leaves NO data behind):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/m70_promo_grant_survives_settlement_test.sql

begin;
-- W8: without this GUC every ASSERT below compiles out and the file exits 0 having proved nothing.
set local plpgsql.check_asserts = on;

do $$
declare
  ana   uuid := '00000000-0000-0000-0000-0000000070a0';
  dish  text := 'cccccccc-0000-4000-8000-000000000070';
  sess  uuid; cart uuid;
  d integer; pinned integer; rows_first integer; rows_again integer; pinned_at timestamptz;
begin
  -- $10 off, needs a $25 basket. Every case below builds a $30 basket and shrinks or lapses it.
  insert into public.promo_codes (code, kind, value, max_uses, used, active, per_session_limit,
                                  min_subtotal_cents, valid_from, valid_until)
    values ('M70TEN', 'flat', 1000, 999, 0, true, 99, 2500, null, null)
    on conflict (code) do update set kind = 'flat', value = 1000, active = true, used = 0,
      per_session_limit = 99, min_subtotal_cents = 2500, valid_from = null, valid_until = null;

  -- ══ 1. CONTROL — with NO pin, a shortage still drops the promo (the defect, unfixed) ══════════
  sess := gen_random_uuid(); cart := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat)
    values (sess, 'M70C1', 'pickup', 'active', ana);
  insert into public.qr_carts (id, session_id, promo_code) values (cart, sess, 'M70TEN');
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (cart, dish, 'Mohinga', 1, 3000, 0, null, 'togo');

  d := public.mms_promo_discount(cart);
  assert d = 1000, format('M70.1 fixture drift: a $30 basket must earn the $10 promo, got %s', d);

  update public.qr_cart_items set state = 'voided' where cart_id = cart;
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (cart, dish, 'Mohinga', 1, 2400, 0, null, 'togo');
  d := public.mms_promo_discount(cart);
  assert d = 0,
    format('M70.1 CONTROL LOST: with no pin a $24 basket must still drop the $25-min promo, got %s. '
           'If this is non-zero the pin is being applied where none was taken, and every case '
           'below proves nothing.', d);

  -- ══ 2. SHORTAGE — pinned at $30, then voided down to $24: the grant survives ══════════════════
  sess := gen_random_uuid(); cart := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat)
    values (sess, 'M70C2', 'pickup', 'active', ana);
  insert into public.qr_carts (id, session_id, promo_code) values (cart, sess, 'M70TEN');
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (cart, dish, 'Mohinga', 1, 3000, 0, null, 'togo');

  pinned := public.mms_pin_promo_grant(cart);
  assert pinned = 1000, format('M70.2 fixture drift: the pin should capture $10, got %s', pinned);

  update public.qr_cart_items set state = 'voided' where cart_id = cart;
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (cart, dish, 'Mohinga', 1, 2400, 0, null, 'togo');
  d := public.mms_promo_discount(cart);
  assert d = 1000,
    format('M70.2 THE DEFECT (shortage): a sold-out void dropped the granted promo — got %s, want '
           '1000. The live total then exceeds the hold and planCapture cancels the whole order.', d);
  -- …and the live derivation still says 0, which is what makes the pin the thing being tested.
  d := public.mms_promo_discount_live(cart);
  assert d = 0, format('M70.2 DEGENERATE: the live value should be 0 here, got %s — if it is 1000 '
                       'the shortage never happened and the case is vacuous', d);

  -- ══ 3. WALL CLOCK — the promo expires after the pin. No cart change at all. ═══════════════════
  sess := gen_random_uuid(); cart := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat)
    values (sess, 'M70C3', 'pickup', 'active', ana);
  insert into public.qr_carts (id, session_id, promo_code) values (cart, sess, 'M70TEN');
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (cart, dish, 'Mohinga', 1, 3000, 0, null, 'togo');
  pinned := public.mms_pin_promo_grant(cart);
  assert pinned = 1000, format('M70.3 fixture drift: pin should be 1000, got %s', pinned);

  update public.promo_codes set valid_until = now() - interval '1 minute' where code = 'M70TEN';
  assert public.mms_promo_discount_live(cart) = 0, 'M70.3 DEGENERATE: the promo should have expired';
  d := public.mms_promo_discount(cart);
  assert d = 1000,
    format('M70.3 THE DEFECT (wall clock): a hold taken before valid_until must still be honoured '
           'at capture — got %s, want 1000. Nothing about the basket changed.', d);
  update public.promo_codes set valid_until = null where code = 'M70TEN';

  -- ══ 4. DEACTIVATION — an admin flips `active` false after the pin ═════════════════════════════
  sess := gen_random_uuid(); cart := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat)
    values (sess, 'M70C4', 'pickup', 'active', ana);
  insert into public.qr_carts (id, session_id, promo_code) values (cart, sess, 'M70TEN');
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (cart, dish, 'Mohinga', 1, 3000, 0, null, 'togo');
  pinned := public.mms_pin_promo_grant(cart);
  assert pinned = 1000, format('M70.4 fixture drift: pin should be 1000, got %s', pinned);

  update public.promo_codes set active = false where code = 'M70TEN';
  assert public.mms_promo_discount_live(cart) = 0, 'M70.4 DEGENERATE: deactivation should drop it';
  d := public.mms_promo_discount(cart);
  assert d = 1000,
    format('M70.4 THE DEFECT (deactivation): a code switched off mid-settlement must not cancel a '
           'hold already taken under it — got %s, want 1000', d);
  update public.promo_codes set active = true where code = 'M70TEN';

  -- ══ 5. CODE DELETED — the promo_codes row is gone after the pin ═══════════════════════════════
  -- Uses its OWN code so the delete cannot disturb the cases above.
  insert into public.promo_codes (code, kind, value, max_uses, used, active, per_session_limit, min_subtotal_cents)
    values ('M70GONE', 'flat', 1000, 999, 0, true, 99, 2500)
    on conflict (code) do update set active = true, used = 0;
  sess := gen_random_uuid(); cart := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat)
    values (sess, 'M70C5', 'pickup', 'active', ana);
  insert into public.qr_carts (id, session_id, promo_code) values (cart, sess, 'M70GONE');
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (cart, dish, 'Mohinga', 1, 3000, 0, null, 'togo');
  pinned := public.mms_pin_promo_grant(cart);
  assert pinned = 1000, format('M70.5 fixture drift: pin should be 1000, got %s', pinned);

  delete from public.promo_codes where code = 'M70GONE';
  assert public.mms_promo_discount_live(cart) = 0, 'M70.5 DEGENERATE: a deleted code should drop it';
  d := public.mms_promo_discount(cart);
  assert d = 1000,
    format('M70.5 THE DEFECT (deleted code): got %s, want 1000', d);

  -- ══ 6. A PIN OF ZERO STICKS — `is not null`, never `> 0` ══════════════════════════════════════
  -- A $20 basket does not clear the $25 minimum, so the grant is a real 0. If the promo then becomes
  -- reachable (the diner's own earlier lines restored, say), the total must NOT drop below what the
  -- hold reconciles against. This is the case a `coalesce(nullif(pin, 0), live)` refactor breaks.
  sess := gen_random_uuid(); cart := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat)
    values (sess, 'M70C6', 'pickup', 'active', ana);
  insert into public.qr_carts (id, session_id, promo_code) values (cart, sess, 'M70TEN');
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (cart, dish, 'Mohinga', 1, 2000, 0, null, 'togo');
  pinned := public.mms_pin_promo_grant(cart);
  assert pinned = 0, format('M70.6 fixture drift: a $20 basket should grant 0, got %s', pinned);

  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (cart, dish, 'Mohinga', 1, 1000, 0, null, 'togo');
  assert public.mms_promo_discount_live(cart) = 1000,
    'M70.6 DEGENERATE: the enlarged basket should now clear the minimum live';
  d := public.mms_promo_discount(cart);
  assert d = 0,
    format('M70.6 ZERO PIN LOST: a granted 0 must stay 0 — got %s. Treating 0 as "unpinned" lets a '
           'promo become valid mid-settlement and lowers the total below the reconcile.', d);

  -- ══ 7. IDEMPOTENCE — a second pin does not move the grant ═════════════════════════════════════
  sess := gen_random_uuid(); cart := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat)
    values (sess, 'M70C7', 'pickup', 'active', ana);
  insert into public.qr_carts (id, session_id, promo_code) values (cart, sess, 'M70TEN');
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (cart, dish, 'Mohinga', 1, 3000, 0, null, 'togo');
  assert public.mms_pin_promo_grant(cart) = 1000, 'M70.7 fixture drift: first pin should be 1000';

  update public.qr_cart_items set state = 'voided' where cart_id = cart;
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (cart, dish, 'Mohinga', 1, 2400, 0, null, 'togo');
  pinned := public.mms_pin_promo_grant(cart);
  assert pinned = 1000,
    format('M70.7 NOT IDEMPOTENT: a re-pin moved the grant to %s. create-intent embeds the derived '
           'amount in its Stripe idempotency key, so a moved grant mints a SECOND PaymentIntent.',
           pinned);

  -- ══ 8. A CANCELLED SETTLEMENT RELEASES THE GRANT — and a REDELIVERY does not ══════════════════
  sess := gen_random_uuid(); cart := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat)
    values (sess, 'M70C8', 'pickup', 'active', ana);
  insert into public.qr_carts (id, session_id, promo_code) values (cart, sess, 'M70TEN');
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (cart, dish, 'Mohinga', 1, 3000, 0, null, 'togo');
  assert public.mms_pin_promo_grant(cart) = 1000, 'M70.8 fixture drift: pin should be 1000';

  rows_first := public.mms_mark_settle_canceled('pi_m70_c8', cart, 'over_authorized', ana, now());
  assert rows_first = 1, format('M70.8 fixture drift: first cancel should insert 1 row, got %s', rows_first);
  select promo_granted_cents into d from public.qr_carts where id = cart;
  assert d is null,
    'M70.8 GRANT OUTLIVED THE HOLD: a cancelled settlement must release the pin, or a later '
    'checkout on this cart inherits an abandoned attempt''s discount';

  -- Re-pin, then redeliver the SAME cancel: the conflict inserts 0 rows and must clear nothing.
  assert public.mms_pin_promo_grant(cart) = 1000, 'M70.8 fixture drift: re-pin should be 1000';
  rows_again := public.mms_mark_settle_canceled('pi_m70_c8', cart, 'over_authorized', ana, now());
  assert rows_again = 0, format('M70.8 fixture drift: redelivery should insert 0 rows, got %s', rows_again);
  select promo_granted_cents into d from public.qr_carts where id = cart;
  assert d = 1000,
    format('M70.8 REDELIVERY WIPED A LIVE GRANT: got %s, want 1000. The clear must be guarded on '
           'the insert row count, or a duplicate webhook delivery cancels a NEWER hold''s promo.', d);

  -- ══ 9. A NEW CODE VOIDS THE OLD GRANT ═════════════════════════════════════════════════════════
  -- `applyPromo` clears the pin in the same UPDATE as the code write; this pins the column's ability
  -- to be cleared and the reader's return to the live path once it is.
  update public.qr_carts set promo_code = 'M70TEN', promo_granted_cents = null where id = cart;
  d := public.mms_promo_discount(cart);
  assert d = public.mms_promo_discount_live(cart),
    format('M70.9 STALE GRANT: after a code change the reader must fall back to the live value — '
           'got %s vs live %s', d, public.mms_promo_discount_live(cart));

  -- ══ 10. AN ABANDONED ATTEMPT RELEASES ITS GRANT (Codex round 1, P1) ══════════════════════════
  -- `mms_pin_promo_grant` runs BEFORE the amount is derived, so every create-intent exit between the
  -- pin and a live PaymentIntent leaves a grant authorizing nothing. Cancellation cannot cover it —
  -- that records the end of a hold that EXISTED. Without the release, the diner edits the unlocked
  -- cart, re-checks-out, and the pin is a no-op (not null), so the abandoned grant prices the NEW
  -- basket: a $10 grant onto a basket that no longer clears the minimum, or a 0 grant onto one that
  -- has become eligible.
  sess := gen_random_uuid(); cart := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat)
    values (sess, 'M70C10', 'pickup', 'active', ana);
  insert into public.qr_carts (id, session_id, promo_code) values (cart, sess, 'M70TEN');
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (cart, dish, 'Mohinga', 1, 3000, 0, null, 'togo');
  assert public.mms_pin_promo_grant(cart) = 1000, 'M70.10 fixture drift: pin should be 1000';

  perform public.mms_release_promo_grant(cart);
  select promo_granted_cents into d from public.qr_carts where id = cart;
  assert d is null,
    format('M70.10 ABANDONED GRANT SURVIVED: got %s, want null. A pin with no PaymentIntent behind '
           'it must not price the next checkout.', d);

  -- …and the reader is back on the live path, which is the point of releasing it.
  update public.qr_cart_items set state = 'voided' where cart_id = cart;
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (cart, dish, 'Mohinga', 1, 2400, 0, null, 'togo');
  d := public.mms_promo_discount(cart);
  assert d = 0,
    format('M70.10 STALE GRANT STILL APPLIED: a $24 basket must not earn the $25-min promo after '
           'the attempt was abandoned — got %s', d);

  -- ══ 11. A SUPERSEDED CANCEL MUST NOT CLEAR THE SUCCESSOR'S GRANT (Codex round 1, P1) ══════════
  -- The row-count guard alone is not enough. A row count of 1 proves only that THIS PaymentIntent
  -- had not been recorded before — not that it is the cart's current attempt. A late webhook for a
  -- superseded intent is recorded for the FIRST time (v_rows = 1) while a successor hold is already
  -- live; a cart-scoped clear would wipe the successor's grant and its webhook would then re-derive
  -- the live promo and hit the reconciliation mismatch this migration exists to prevent.
  --
  -- `manual-capture-run.ts:159-161` states the invariant: the cancellation ledger is per-INTENT
  -- precisely so a superseded attempt "cannot paint over the successor's".
  --
  -- The gate is the REASON, not the era. `superseded` is what the caller writes when
  -- `mms_settle_precheck_and_void` answers -2, i.e. exactly when `v_locked_at is distinct from
  -- p_attempt` (w23d:188) — so the era test is already computed, and the grant follows the LOCK's
  -- own rule (`if (prior.reason !== "superseded") await releaseOurLock(…)`). Case 12 is why this
  -- must not be re-derived from `locked_at` here.
  sess := gen_random_uuid(); cart := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat)
    values (sess, 'M70C11', 'pickup', 'active', ana);
  insert into public.qr_carts (id, session_id, promo_code, locked, locked_at, locked_by)
    values (cart, sess, 'M70TEN', true, now(), ana);
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (cart, dish, 'Mohinga', 1, 3000, 0, null, 'togo');
  assert public.mms_pin_promo_grant(cart) = 1000, 'M70.11 fixture drift: pin should be 1000';

  -- A late cancel for an OLDER attempt: never recorded before (so v_rows = 1), but its era is not
  -- the cart's. `now() - 10 minutes` stands in for the superseded attempt's `locked_at`.
  rows_first := public.mms_mark_settle_canceled(
    'pi_m70_c11_old', cart, 'superseded', ana, now() - interval '10 minutes');
  assert rows_first = 1,
    format('M70.11 DEGENERATE: the stale cancel must insert (v_rows=1) or this case proves nothing '
           'about the era predicate — got %s', rows_first);
  select promo_granted_cents into d from public.qr_carts where id = cart;
  assert d = 1000,
    format('M70.11 SUCCESSOR GRANT WIPED: a first-time cancel for a SUPERSEDED attempt cleared the '
           'live hold''s grant — got %s, want 1000. The clear must skip the superseded verdict; the '
           'row count only rules out REDELIVERY of the same intent.', d);

  -- …and the CURRENT attempt's cancel, matching the era, still releases it.
  select locked_at into pinned_at from public.qr_carts where id = cart;
  rows_first := public.mms_mark_settle_canceled('pi_m70_c11_now', cart, 'over_authorized', ana, pinned_at);
  assert rows_first = 1, format('M70.11 fixture drift: current-era cancel should insert, got %s', rows_first);
  select promo_granted_cents into d from public.qr_carts where id = cart;
  assert d is null,
    'M70.11 OVER-TIGHTENED: the attempt that OWNS the cart''s era must still release its grant';

  -- ══ 12. A CANCEL WHOSE LOCK IS ALREADY RELEASED STILL RELEASES THE GRANT ══════════════════════
  -- The over-tightening case, and CI caught it: the second draft of the clear re-derived the era as
  -- `locked_at is not distinct from p_attempt`. Two things break under that predicate, and both are
  -- ordinary production, not corners.
  --
  --   · `qr_settlement_cancellations.attempt` is declared "forensics only, never read by the diner
  --     path" (w23d:105), and `markCanceled` nulls an unparseable one deliberately — "losing the era
  --     is survivable, losing the verdict is not". A predicate must not make that field authoritative.
  --   · The cart lock has a TTL (`lib/lock.ts CART_LOCK_TTL`) that auto-releases an abandoned pay
  --     screen, nulling `locked_at`. The authorization outlives it, so a perfectly ordinary cancel
  --     naming a REAL era arrives at a cart whose `locked_at` is null — no match, grant leaks, and
  --     the next checkout on that cart inherits an abandoned attempt's discount.
  --
  -- Over-blocking is as bad as under-blocking: a guard tightened until the VALID case fails is not
  -- safer, it just moves the defect. This case is the valid case.
  sess := gen_random_uuid(); cart := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat)
    values (sess, 'M70C12', 'pickup', 'active', ana);
  insert into public.qr_carts (id, session_id, promo_code) values (cart, sess, 'M70TEN');
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (cart, dish, 'Mohinga', 1, 3000, 0, null, 'togo');
  assert public.mms_pin_promo_grant(cart) = 1000, 'M70.12 fixture drift: pin should be 1000';

  -- The hold was minted under a real era; the TTL then released the lock, so `locked_at` is null.
  select locked_at into pinned_at from public.qr_carts where id = cart;
  assert pinned_at is null,
    'M70.12 fixture drift: this case needs an UNLOCKED cart to stand for the TTL-released lock';
  rows_first := public.mms_mark_settle_canceled(
    'pi_m70_c12', cart, 'over_authorized', ana, now() - interval '6 minutes');
  assert rows_first = 1, format('M70.12 fixture drift: the cancel should insert, got %s', rows_first);
  select promo_granted_cents into d from public.qr_carts where id = cart;
  assert d is null,
    format('M70.12 OVER-TIGHTENED: a cancel naming a real era must still release the grant when the '
           'lock has already been released — got %s, want null. Keying the clear on `locked_at` '
           'instead of the verdict reopens the leak for every TTL-expired pay screen.', d);


  -- ══ 13. A STALE CANCEL WITH A NON-SUPERSEDED VERDICT MUST NOT CLEAR EITHER (Codex round 3, P1) ══
  -- Case 11 holds BOTH a stale era and the `superseded` reason, so it cannot tell which one did the
  -- work. This one separates them: the verdict says `over_authorized` — an outcome the third draft
  -- of this clear treated as "mine, clear it" — while the era is stale.
  --
  -- It is reachable, not theoretical. `superseded` describes what the PRECHECK observed, and between
  -- that check (`manual-capture-run.ts:123-144`) and the verdict write (`:192`) the same payer can
  -- start another checkout: `acquireCartLock` refreshes `locked_at`, the successor pins and derives
  -- its amount, and the older attempt's verdict — computed before any of that — still reads
  -- `over_authorized`. A verdict-keyed clear fires and wipes the era that is now current.
  sess := gen_random_uuid(); cart := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat)
    values (sess, 'M70C13', 'pickup', 'active', ana);
  insert into public.qr_carts (id, session_id, promo_code, locked, locked_at, locked_by)
    values (cart, sess, 'M70TEN', true, now(), ana);
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (cart, dish, 'Mohinga', 1, 3000, 0, null, 'togo');
  assert public.mms_pin_promo_grant(cart) = 1000, 'M70.13 fixture drift: pin should be 1000';

  rows_first := public.mms_mark_settle_canceled(
    'pi_m70_c13_old', cart, 'over_authorized', ana, now() - interval '10 minutes');
  assert rows_first = 1,
    format('M70.13 DEGENERATE: the stale cancel must insert (v_rows=1) or this proves nothing — got %s',
           rows_first);
  select promo_granted_cents into d from public.qr_carts where id = cart;
  assert d = 1000,
    format('M70.13 STALE VERDICT WIPED A LIVE ERA: got %s, want 1000. `superseded` describes what the '
           'PRECHECK saw, not what is true when the verdict is written — the era must be read from '
           'the cart at write time.', d);

  -- ══ 14. THE ABANDON RELEASE IS ERA-SCOPED (Codex round 2, P1) ════════════════════════════════
  -- `acquireCartLock` lets the SAME diner re-acquire and REFRESHES `locked_at` (lock.ts:60,65), so
  -- two overlapping create-intent requests are two eras on one cart sharing one uid — which is why
  -- `locked_by` cannot separate them and the era must. If the second pins, derives and succeeds
  -- while the first later fails, a cart-wide release from the first's catch wipes the grant the
  -- SECOND's PaymentIntent was minted under.
  sess := gen_random_uuid(); cart := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat)
    values (sess, 'M70C14', 'pickup', 'active', ana);
  insert into public.qr_carts (id, session_id, promo_code, locked, locked_at, locked_by)
    values (cart, sess, 'M70TEN', true, now() - interval '2 minutes', ana);
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (cart, dish, 'Mohinga', 1, 3000, 0, null, 'togo');
  select locked_at into pinned_at from public.qr_carts where id = cart;  -- attempt ONE's era
  assert public.mms_pin_promo_grant(cart) = 1000, 'M70.14 fixture drift: pin should be 1000';

  -- Attempt TWO re-acquires: same seat, new era. Its pin is a no-op (not null) — it inherits and
  -- depends on the grant attempt one took.
  update public.qr_carts set locked_at = now() where id = cart;
  perform public.mms_release_promo_grant(cart, pinned_at);   -- attempt ONE abandons, late
  select promo_granted_cents into d from public.qr_carts where id = cart;
  assert d = 1000,
    format('M70.14 SUCCESSOR GRANT WIPED: an abandoned attempt released a grant belonging to the era '
           'that superseded it — got %s, want 1000. Same uid, different era: only the era separates '
           'them.', d);

  -- …and the era that DOES own the cart still releases its own grant.
  select locked_at into pinned_at from public.qr_carts where id = cart;
  perform public.mms_release_promo_grant(cart, pinned_at);
  select promo_granted_cents into d from public.qr_carts where id = cart;
  assert d is null,
    'M70.14 OVER-TIGHTENED: the era that owns the cart must still be able to release its own grant';

  -- ══ 15. THE HOLDER-SCOPED RELEASE — "Edit order" and the unload beacon (Codex round 2, P1) ════
  -- Returning a client secret mints NO authorization, so the two exits that unlock a cart after a
  -- SUCCESSFUL create-intent leave a pinned grant with nothing behind it. Those callers are clients:
  -- they never saw a `locked_at`, so they prove ownership the same way `releaseCartLock` does —
  -- `locked_by = p_uid` — and the grant is released on exactly the authority that releases the lock.
  sess := gen_random_uuid(); cart := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat)
    values (sess, 'M70C15', 'pickup', 'active', ana);
  insert into public.qr_carts (id, session_id, promo_code, locked, locked_at, locked_by)
    values (cart, sess, 'M70TEN', true, now(), ana);
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (cart, dish, 'Mohinga', 1, 3000, 0, null, 'togo');
  assert public.mms_pin_promo_grant(cart) = 1000, 'M70.15 fixture drift: pin should be 1000';

  -- A DIFFERENT seat cannot drop this grant, exactly as it cannot drop the lock.
  perform public.mms_release_promo_grant_for_holder(cart, gen_random_uuid());
  select promo_granted_cents into d from public.qr_carts where id = cart;
  assert d = 1000,
    format('M70.15 UNSCOPED: a member who does not hold the lock released another diner''s grant — '
           'got %s, want 1000', d);

  -- The holder can, and must: this is the Edit-order leak.
  perform public.mms_release_promo_grant_for_holder(cart, ana);
  select promo_granted_cents into d from public.qr_carts where id = cart;
  assert d is null,
    'M70.15 EDIT-ORDER LEAK: the lock holder abandoned a reversible attempt and the grant survived — '
    'the re-checkout''s pin is a no-op, so it would price the NEW basket at the OLD basket''s discount';

  raise notice 'M70 promo-grant pin: all 15 cases passed';
end $$;

rollback;
