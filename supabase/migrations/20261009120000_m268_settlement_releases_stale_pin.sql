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
--   · `settle_by = p_owner`    — the freeze on the row is THIS request's;
--   · `settle_at > now() - interval '10 minutes'` — and it is still FRESH (SETTLE_TTL_MS,
--                                lib/lock-ttl.ts; the interval every `mms_split_*` guard uses). Only a
--                                fresh freeze excludes pay attempts: `acquireCartLock` accepts a STALE
--                                `settle_at` and writes only the pay-lock columns, leaving `settle_by`
--                                in place. So `settle_by` alone is not ownership — a settle request
--                                stalled past the TTL would still match it, and in a successor
--                                diner's pin-before-link window clear that diner's freshly pinned
--                                grant (Codex on #338 @ 56a4fd1, P2);
--   · `live_payment_intent_id is null` — M151's rule, unchanged: a pin a live intent still
--                                reconciles against is not this caller's to clear. The settle
--                                supersedes that intent first (cancel at Stripe, `releaseByIntent`).
-- The pin is set to null whether or not it was set, so ONE written row is the whole postcondition —
-- "this fresh freeze holds the open, unlinked cart and its pin is null now".
--
-- ── Three answers, because a refusal has two meanings ────────────────────────────────────────
--    1 — released.
--    0 — refused, and THIS fresh freeze still holds the open cart: only a live link stood in the
--        way. The one answer under which the caller may supersede that link (it holds the mutex).
--   -1 — refused, and this request does NOT hold the cart: another freeze, none, a stale one, or a
--        cart no longer open. The caller stands down. Before this split a refusal was one number,
--        and the caller's supersede branch would cancel whatever intent the cart named — after a
--        stall, a SUCCESSOR's live checkout — and then answer `acquired` on a freeze it had lost.
-- The UPDATE carries every guard and decides the write; the probe after it only says which refusal
-- it was, and writes nothing. The caller refuses on anything but 1 (CLAUDE.md: a blocked write
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
     and settle_at > now() - interval '10 minutes'
     and live_payment_intent_id is null;
  get diagnostics v_rows = row_count;
  if v_rows = 1 then
    return 1;
  end if;
  -- Refused. Which refusal: does THIS fresh freeze still hold the open cart (a live link in the way)?
  perform 1
     from public.qr_carts c
    where c.id = p_cart_id
      and c.status = 'open'
      and c.settle_by = p_owner
      and c.settle_at > now() - interval '10 minutes';
  if found then
    return 0;
  end if;
  return -1;
end;
$$;

revoke all on function public.mms_release_promo_grant_for_settlement(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.mms_release_promo_grant_for_settlement(uuid, uuid)
  to service_role;

comment on function public.mms_release_promo_grant_for_settlement(uuid, uuid) is
  'M268 — the settlement doors'' release of a stale promo pin, under THIS request''s FRESH freeze '
  '(settle_by = p_owner, settle_at inside the 10-minute settle TTL) on an OPEN cart naming NO live '
  'intent. Returns 1 for the release; 0 when that freeze still holds the cart but a live intent is '
  'linked; -1 when this request does not hold the cart. Anything but 1 is a refusal.';
