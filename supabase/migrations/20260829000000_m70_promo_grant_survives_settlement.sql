-- 20260829000000_m70_promo_grant_survives_settlement.sql — M70.
--
-- A promo that lapses BETWEEN authorization and capture raises the live total above the hold, and
-- W23c's `planCapture` cancels the whole order: `liveTotalCents > authorizedCents` →
-- `over_authorized` (apps/qr/lib/manual-capture.ts:85). Safe — the guest is never charged a number
-- they did not agree to — but one small shortage cancels everything.
--
-- ⚠️ The registry filed this as the min-subtotal case. It is FOUR cases, and three of them need no
-- cart change at all. `mms_promo_discount` (20260622060000_voids_comps.sql:199) returns 0 when:
--
--     (1) the code row is gone, or `active` was flipped false      ← no cart change
--     (2) now() < valid_from                                       ← no cart change
--     (3) now() > valid_until                                      ← pure wall clock
--     (4) subtotal < min_subtotal_cents                            ← the filed case
--
-- A hold taken at 23:58 under a promo expiring at midnight, captured at 00:01, cancels for exactly
-- the same reason as the sold-out shortage. Owner's call (2026-08-25) was to honour all four.
--
-- Note the total can ONLY rise when the discount drops to ZERO: for `pct`, total = S·(1−p), and for
-- a partial `flat`, total = S − v; both are monotone increasing in the subtotal, so shrinking the
-- basket lowers them. These four drops are the whole surface.
--
-- ── The shape: one derivation, one reader ──────────────────────────────────────────────────────
-- The repo's rule is that a value computed in one place and quoted in another WILL drift, so the
-- live arithmetic is NOT duplicated. `mms_promo_discount_live` is the existing body, renamed and
-- otherwise byte-for-byte; `mms_promo_discount` keeps its signature (no caller changes anywhere) and
-- becomes "the pin if there is one, else the live value". The pin is written by
-- `mms_pin_promo_grant`, which reads `_live` — so there is exactly one place the arithmetic lives.
--
-- ── Lifecycle, and why it is NOT the lock's ────────────────────────────────────────────────────
-- SET at authorization, if null (`mms_pin_promo_grant`). Idempotent on purpose: create-intent's
-- Stripe idempotency key embeds the amount, so a retry that re-derived a DIFFERENT grant would mint
-- a second PaymentIntent. First grant wins for as long as the hold does.
--
-- CLEARED in exactly two places, both of which end the grant's meaning:
--   · a new promo code is applied (the grant was for the old code) — done in the same UPDATE
--     statement as the code write in `applyPromo`, so the two cannot drift apart;
--   · the settlement is CANCELLED (`mms_mark_settle_canceled`) — the hold is gone, so a later
--     checkout must re-derive honestly rather than inherit an abandoned attempt's discount.
--
-- ⚠️ Deliberately NOT cleared on lock release or on capture. Fulfillment re-derives the breakdown
-- (`getCartTotals` in the webhook) and reconciles it against the captured amount; clearing the pin
-- before that read would make the derived total disagree with what was captured and raise
-- `reconcile_mismatch`. The pin has to outlive the lock for the charge to reconcile at all.

alter table public.qr_carts
  add column if not exists promo_granted_cents integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'qr_carts_promo_granted_nonneg') then
    alter table public.qr_carts
      add constraint qr_carts_promo_granted_nonneg
      check (promo_granted_cents is null or promo_granted_cents >= 0);
  end if;
end $$;

comment on column public.qr_carts.promo_granted_cents is
  'M70 — the promo discount GRANTED at authorization, in cents. Null until a hold is taken. Once set '
  'it is what mms_promo_discount returns, so a promo lapsing between authorize and capture (shortage, '
  'expiry, deactivation) can no longer raise the live total above the hold and cancel the order.';

-- ── 1. the LIVE derivation — the existing mms_promo_discount body, renamed, arithmetic untouched ──
create or replace function public.mms_promo_discount_live(p_cart_id uuid)
returns integer language plpgsql stable security definer set search_path = '' as $$
declare v_code text; v_promo public.promo_codes%rowtype; v_subtotal integer;
begin
  select c.promo_code into v_code from public.qr_carts c where c.id = p_cart_id;
  if v_code is null then return 0; end if;
  select * into v_promo from public.promo_codes p where p.code = v_code;
  if not found or not v_promo.active then return 0; end if;
  if v_promo.valid_from  is not null and now() < v_promo.valid_from  then return 0; end if;
  if v_promo.valid_until is not null and now() > v_promo.valid_until then return 0; end if;
  select coalesce(sum(ci.unit_price_cents * ci.qty), 0) into v_subtotal
    from public.qr_cart_items ci
    where ci.cart_id = p_cart_id and ci.state <> 'voided' and not ci.comped;
  if v_subtotal < v_promo.min_subtotal_cents then return 0; end if;
  return case when v_promo.kind = 'pct'
              then round(v_subtotal * v_promo.value)::integer
              else least(round(v_promo.value)::integer, v_subtotal) end;
end; $$;
revoke all on function public.mms_promo_discount_live(uuid) from public, anon, authenticated;
grant execute on function public.mms_promo_discount_live(uuid) to service_role;

-- ── 2. the public reader — SAME SIGNATURE, so every existing caller is untouched ─────────────────
create or replace function public.mms_promo_discount(p_cart_id uuid)
returns integer language plpgsql stable security definer set search_path = '' as $$
declare v_pin integer;
begin
  select c.promo_granted_cents into v_pin from public.qr_carts c where c.id = p_cart_id;
  -- A granted pin wins outright. `is not null` and NOT `> 0`: a grant of 0 is a real answer (the
  -- cart had no valid promo when the hold was taken) and must stay 0, or a promo becoming valid
  -- mid-settlement would LOWER the total below the reconcile's expectation.
  if v_pin is not null then return v_pin; end if;
  return public.mms_promo_discount_live(p_cart_id);
end; $$;
revoke all on function public.mms_promo_discount(uuid) from public, anon, authenticated;
grant execute on function public.mms_promo_discount(uuid) to service_role;

-- ── 3. the pin, taken at authorization ───────────────────────────────────────────────────────────
create or replace function public.mms_pin_promo_grant(p_cart_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_pin integer;
begin
  -- `is null` makes this idempotent, which is load-bearing rather than tidy: create-intent's Stripe
  -- idempotency key embeds the derived amount, so a retry that re-pinned a different grant would
  -- mint a SECOND PaymentIntent for the same cart. The first grant governs the whole hold.
  update public.qr_carts
     set promo_granted_cents = public.mms_promo_discount_live(p_cart_id)
   where id = p_cart_id
     and status = 'open'
     and promo_granted_cents is null;

  select promo_granted_cents into v_pin from public.qr_carts where id = p_cart_id;
  -- Null here means the cart was NOT open (the update matched nothing and no earlier pin exists) —
  -- the caller's own status gate owns that case; answer with the live value rather than inventing a
  -- grant for a cart that cannot be paid.
  return coalesce(v_pin, public.mms_promo_discount_live(p_cart_id));
end; $$;
revoke all on function public.mms_pin_promo_grant(uuid) from public, anon, authenticated;
grant execute on function public.mms_pin_promo_grant(uuid) to service_role;

-- ── 4. a cancelled settlement releases the grant with the hold ───────────────────────────────────
-- Restated from 20260819300000_w23d_dropped_visibility.sql:232. The insert and its `on conflict do
-- nothing` are unchanged; the clear rides in the same function so the grant cannot outlive the
-- verdict that ended it. Guarded on the row count for exactly that reason: a REDELIVERED cancel
-- (conflict, 0 rows) must not clear a pin belonging to a newer hold taken since.
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

  -- M70 — the hold is gone, so the grant it authorized is gone. A later checkout on this cart must
  -- re-derive honestly rather than inherit an abandoned attempt's discount.
  if v_rows > 0 then
    update public.qr_carts set promo_granted_cents = null where id = p_cart;
  end if;

  return v_rows;
end $$;
revoke all on function public.mms_mark_settle_canceled(text, uuid, text, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.mms_mark_settle_canceled(text, uuid, text, uuid, timestamptz) to service_role;
