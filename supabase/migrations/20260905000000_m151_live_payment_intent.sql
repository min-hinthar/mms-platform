-- 20260905000000_m151_live_payment_intent.sql — M151 · M152 · M124: the cart→intent link.
--
-- Every pin-clearer in this schema decided "is the attempt that took the lock still the one that
-- owns it?" from `locked_at`, a wall-clock era. Nothing on the cart said which PaymentIntent, if any,
-- still DEPENDED on the pin — so a captured intent whose webhook was merely late could have its pin
-- nulled by a tablemate's code (M152a), by a successor's stale-grant release (M152b), or by
-- create-intent's own outer catch (M152c); two overlapping attempts could hold different pins with
-- the older intent still chargeable (M151); and two same-uid attempts inside one millisecond shared
-- an era (M124). All of it is one missing fact.
--
-- ── The column ────────────────────────────────────────────────────────────────────────────────
-- `qr_carts.live_payment_intent_id` names the ONE single-pay PaymentIntent that may still reconcile
-- against this cart's pin. Written by create-intent AFTER the mint, scoped to the era that minted it
-- (`locked_by = uid and locked_at = era`, and only where the link is null or already this intent —
-- Stripe idempotency can hand two same-era requests the same intent). Cleared when the intent is
-- terminal: the `payment_intent.canceled` webhook, the capture cron's cancellation
-- (`mms_mark_settle_canceled`, below), or a successor that cancelled it at Stripe first.
--
-- ── The rule ──────────────────────────────────────────────────────────────────────────────────
-- A pin may be cleared only while NO live intent depends on it: every pin-clearer carries
-- `and live_payment_intent_id is null`. A successor that wants the pin must first make the
-- predecessor UNUSABLE (cancel it; refuse if it captured) and drop the link — never the reverse.
-- The TypeScript half of that sequence lives in `apps/qr/lib/lock.ts` (`supersedeLiveIntent`) and
-- `create-intent`, guarded by `scripts/check-promo-grant-pin.mjs` rule 3.
--
-- ── What changes here, and what deliberately does not ────────────────────────────────────────
--   1. `qr_carts.live_payment_intent_id text` — nullable, no default, no FK (`qr_orders` gets the
--      intent only at fulfilment; before that it is Stripe's id alone).
--   2. `mms_release_promo_grant` — the era-scoped release gains the link gate. This is the RPC
--      create-intent's stale-grant release AND its outer catch both call, so both mouths close at
--      once (M152b, M152c).
--   3. `mms_mark_settle_canceled` — the capture cron's cancellation clears the pin only when the
--      link is null or THIS intent, and drops the link in the same statement. A cancellation of a
--      predecessor can no longer touch a successor's pin.
--   NOT changed: `mms_pin_promo_grant` (it pins only when null, unchanged), `mms_promo_discount`
--   (reads the pin), `mms_release_promo_grant_for_holder` (unreachable from code since #244 —
--   `check:pay-attempt` asserts the absence; left as-is rather than widening this file).
--   `applyPromo`'s freeze predicate and `releasePayAttempt` are PostgREST statements in TypeScript
--   and gain the same gate there (`lib/cart.ts`, `lib/lock.ts`), pinned by their own suites and
--   `verify:slice` mutants.
--
-- ── Deploy order ──────────────────────────────────────────────────────────────────────────────
-- Migration first, app second. Until the app writes the link the column is null everywhere, so the
-- new `is null` gates admit exactly what they admit today — the migration changes nothing on its
-- own. Guarded + idempotent; the SQL test asserts refusal AND the legitimate path.
--
-- Test: supabase/tests/m151_live_payment_intent_test.sql (registered in ci.yml).

alter table public.qr_carts
  add column if not exists live_payment_intent_id text;

comment on column public.qr_carts.live_payment_intent_id is
  'M151 — the ONE single-pay PaymentIntent that may still reconcile against promo_granted_cents. '
  'Written by create-intent after the mint, under the minting era; cleared when the intent is '
  'terminal (canceled webhook, capture-cron cancellation, or a successor that cancelled it first). '
  'Every pin-clearer carries `and live_payment_intent_id is null`.';

-- 2. The era-scoped release: create-intent's stale-grant release and its outer catch.
create or replace function public.mms_release_promo_grant(p_cart_id uuid, p_attempt timestamptz)
returns void language sql security definer set search_path = '' as $$
  update public.qr_carts
     set promo_granted_cents = null
   where id = p_cart_id
     and (locked_at is null or locked_at is not distinct from p_attempt)
     -- M151/M152: a pin a live intent still reconciles against is not this caller's to clear. The
     -- successor drops the link only after cancelling that intent at Stripe (or refuses if it
     -- captured); until then the pin outlives the lock, which is M70's rule stated precisely.
     and live_payment_intent_id is null;
$$;

revoke all on function public.mms_release_promo_grant(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.mms_release_promo_grant(uuid, timestamptz) to service_role;

-- 3. The capture cron's cancellation: pin AND link, for THIS intent only.
create or replace function public.mms_mark_settle_canceled(
  p_intent text,
  p_cart uuid,
  p_reason text,
  p_payer uuid,
  p_attempt timestamptz
) returns integer language plpgsql security definer set search_path = '' as $$
declare v_rows integer;
begin
  insert into public.qr_settlement_cancellations (payment_intent, cart_id, reason, payer_uid, attempt)
  values (p_intent, p_cart, p_reason, p_payer, p_attempt)
  on conflict (payment_intent) do nothing;
  get diagnostics v_rows = row_count;

  -- M70 — the hold is gone, so the grant it authorized is gone. M151 — but ONLY if the cart still
  -- names THIS intent (or none): a successor that already linked its own intent keeps its pin, and
  -- this cancellation of the predecessor must not reach it. The link is dropped in the same
  -- statement, so "pin cleared, link still set" is unreachable.
  if v_rows > 0 then
    update public.qr_carts
       set promo_granted_cents = null,
           live_payment_intent_id = null
     where id = p_cart
       and status = 'open'
       and (locked_at is null or locked_at is not distinct from p_attempt)
       and (live_payment_intent_id is null or live_payment_intent_id = p_intent);
  end if;

  return v_rows;
end $$;

revoke all on function public.mms_mark_settle_canceled(text, uuid, text, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.mms_mark_settle_canceled(text, uuid, text, uuid, timestamptz) to service_role;
