-- 20260623070000_m4_reward_redeem.sql — M4 P4.2: redeem a Morning Star reward at checkout. docs/M4_DESIGN.md.
-- A reward coupon is applied to the cart and rides the EXISTING discount rail (getCartTotals →
-- mms_reward_discount, parallel to mms_promo_discount), so the create-intent amount, the webhook reconcile,
-- and every order snapshot stay server-authoritative with no new money math. The reward is HELD by one
-- cart at a time (qr_carts.applied_reward_id) and the discount is STABLE across the pay window (expiry is
-- gated at APPLY time, not totals time) so create-intent ↔ webhook agree; it flips to redeemed exactly at
-- fulfillment (atomic, conditional, idempotent). Additive + idempotent. (R4 in the design's threat model.)

alter table public.qr_carts
  add column if not exists applied_reward_id uuid references public.mms_rewards(id);

-- ── mms_reward_discount(cart): the unredeemed applied reward's amount (0 if none/redeemed). Parallels
-- mms_promo_discount. Deliberately does NOT re-check expiry — expiry is an APPLY-time gate, so once a
-- reward is applied the discount can't shift mid-pay-window and break the reconcile. ────────────────────
create or replace function mms_reward_discount(p_cart_id uuid) returns integer
  language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select r.amount_cents
       from public.mms_rewards r
       join public.qr_carts c on c.applied_reward_id = r.id
      where c.id = p_cart_id and r.redeemed_at is null),
    0);
$$;
revoke all on function public.mms_reward_discount(uuid) from public, anon, authenticated;
grant execute on function public.mms_reward_discount(uuid) to service_role;

-- ── mms_apply_reward(cart, code, user): attach a reward to an OPEN, unlocked cart. The reward must belong
-- to the caller, be unredeemed + unexpired, meet the redemption minimum, and not be held by another open
-- cart. Refused mid-pay (locked/settling) so a reward never changes a total a peer is settling. ─────────
create or replace function mms_apply_reward(p_cart uuid, p_code text, p_user uuid) returns text
  language plpgsql security definer set search_path = '' as $$
declare v_reward uuid; v_amount integer; v_status text; v_locked boolean; v_settle timestamptz;
        v_subtotal integer; v_min integer;
begin
  select status, locked, settle_at into v_status, v_locked, v_settle
    from public.qr_carts where id = p_cart for update;
  if v_status is null then return 'not_found'; end if;
  if v_status <> 'open' then return 'not_open'; end if;
  if v_locked or v_settle is not null then return 'busy'; end if;

  select id, amount_cents into v_reward, v_amount from public.mms_rewards
    where reward_code = p_code and user_id = p_user and redeemed_at is null and expires_at > now();
  if v_reward is null then return 'invalid'; end if;

  -- Redemption minimum (delivery parity) — the chargeable subtotal (voided/comped excluded) must clear it.
  select coalesce(sum(unit_price_cents * qty), 0) into v_subtotal
    from public.qr_cart_items where cart_id = p_cart and state <> 'voided' and not comped;
  select reward_min_redeem_cents into v_min from public.mms_rewards_config where id;
  if v_subtotal < coalesce(v_min, 0) then return 'min_not_met'; end if;

  -- Held by one cart at a time (a reward applied to another OPEN cart can't be double-applied here).
  if exists (select 1 from public.qr_carts
               where applied_reward_id = v_reward and id <> p_cart and status = 'open') then
    return 'in_use';
  end if;

  update public.qr_carts set applied_reward_id = v_reward, updated_at = now() where id = p_cart;
  return 'ok';
end $$;
revoke all on function public.mms_apply_reward(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.mms_apply_reward(uuid, text, uuid) to service_role;

-- ── mms_clear_reward(cart): remove the applied reward (open cart only; never touches a paying cart). ────
create or replace function mms_clear_reward(p_cart uuid) returns void
  language sql security definer set search_path = '' as $$
  update public.qr_carts set applied_reward_id = null, updated_at = now()
    where id = p_cart and status = 'open';
$$;
revoke all on function public.mms_clear_reward(uuid) from public, anon, authenticated;
grant execute on function public.mms_clear_reward(uuid) to service_role;

-- ── mms_redeem_cart_reward(cart, order): flip the cart's applied reward to redeemed at fulfillment. Atomic
-- + conditional (redeemed_at IS NULL) → idempotent across a Stripe redelivery; single-use enforced. ─────
create or replace function mms_redeem_cart_reward(p_cart uuid, p_order uuid) returns void
  language plpgsql security definer set search_path = '' as $$
declare v_reward uuid;
begin
  select applied_reward_id into v_reward from public.qr_carts where id = p_cart;
  if v_reward is null then return; end if;
  update public.mms_rewards set redeemed_at = now(), redeemed_order_id = p_order
    where id = v_reward and redeemed_at is null;
end $$;
revoke all on function public.mms_redeem_cart_reward(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mms_redeem_cart_reward(uuid, uuid) to service_role;
