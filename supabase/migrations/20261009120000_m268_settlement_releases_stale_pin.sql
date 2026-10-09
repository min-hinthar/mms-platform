-- 20261009120000_m268_settlement_releases_stale_pin.sql — M268: the register's settle releases a
-- promo pin no live attempt owns, before it reads a total.
--
-- `mms_promo_discount` honours any non-null `promo_granted_cents` outright (m70 §2: "a granted pin
-- wins outright" — no link check), and before this only create-intent released a predecessor's pin
-- (era-scoped, after it cancelled and unlinked that predecessor). A pin left by a card attempt whose
-- client exits both failed (M124), or by an attempt from before the cart→intent link existed (M151),
-- therefore survived to the counter, whose settle (`getCartTotals`) charged the old basket's
-- discount. While phone pay is parked (PD2) the counter is a dine-in table's only door.
--
-- ── Why a second release RPC, and not the era one ─────────────────────────────────────────────
-- The settle holds a SETTLEMENT freeze (`settle_at` / `settle_by`, a request-unique owner since
-- A3 · M201), not a pay-lock era. `mms_release_promo_grant` proves ownership by the era
-- (`locked_at is null or locked_at is not distinct from p_attempt`); the settle has no era to pass,
-- and on an unlocked cart any era would match — the cart-wide clear that rule exists to refuse. The
-- settlement's own proof is its owner, so this RPC is keyed on it. The TypeScript binding is ONE:
-- `releasePromoGrantFor(cart, holder)` in apps/qr/lib/lock.ts takes either proof.
--
-- ── Every guard is in the WHERE ───────────────────────────────────────────────────────────────
--   · `status = 'open'`        — a paid or cancelled cart's pin is its order's history, not ours;
--   · `settle_by = p_owner`    — THIS request's freeze holds the cart. That freeze is what excludes
--                                every pay attempt (`acquireCartLock` refuses under a fresh
--                                `settle_at`), so under it no successor can be wiped;
--   · `live_payment_intent_id is null` — M151's rule, unchanged: a pin a live intent still
--                                reconciles against is not this caller's to clear. The settle
--                                supersedes that intent first (cancel at Stripe, `releaseByIntent`).
-- The pin is set to null whether or not it was set, so ONE row is the whole postcondition — "this
-- freeze holds the open, unlinked cart and its pin is null now" — and ZERO is a blocked write. The
-- function RETURNS that count and the caller refuses on anything but 1 (CLAUDE.md: a blocked write
-- must not answer ok).
--
-- `promo_code` is untouched: a promo applied at the register still discounts, re-derived live by
-- `mms_promo_discount` once the pin is gone.
--
-- Guarded + idempotent (create or replace; re-running releases nothing new). SECURITY DEFINER,
-- revoked from public / anon / authenticated, granted to service_role only.
--
-- Test: supabase/tests/m268_settlement_releases_stale_pin_test.sql (registered in ci.yml).

create or replace function public.mms_release_promo_grant_for_settlement(
  p_cart_id uuid,
  p_owner uuid
) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_rows integer;
begin
  update public.qr_carts
     set promo_granted_cents = null
   where id = p_cart_id
     and status = 'open'
     and settle_by = p_owner
     and live_payment_intent_id is null;
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

revoke all on function public.mms_release_promo_grant_for_settlement(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.mms_release_promo_grant_for_settlement(uuid, uuid)
  to service_role;

comment on function public.mms_release_promo_grant_for_settlement(uuid, uuid) is
  'M268 — the settlement doors'' release of a stale promo pin, under THIS request''s freeze '
  '(settle_by = p_owner) on an OPEN cart naming NO live intent. Returns the rows written: 1 is the '
  'release, 0 a blocked write the caller must refuse on.';
