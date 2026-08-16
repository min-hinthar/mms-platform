-- 20260816060000_w20_reward_follows_owner.sql — W20 (owner: "Reward pick needs improvement and
-- That reward is already on another order error").
--
-- The 'in_use' refusal was built for a genuine conflict — the reward mid-payment on another cart —
-- but in practice it mostly fires on the owner's OWN abandoned cart: scan at lunch, apply the
-- reward, walk away; scan again at dinner and the reward is "already on another order" with no way
-- to reclaim it from a cart no phone has open any more. A reward belongs to its OWNER, not to the
-- first cart that touched it.
--
-- Fix: after validating the reward (still row-locked `for update`, so concurrent applies stay
-- serialized — invariant #2 of 20260623080000), RELEASE any hold from an IDLE cart before the
-- in_use check. "Idle" is EXACTLY mms_clear_reward's guard (open ∧ not locked ∧ settle_at null),
-- the established-safe release: a locked/settling holder is mid-payment with a PaymentIntent minted
-- against the discounted total, and stealing from IT would strand the webhook reconcile (invariant
-- #1 of the same migration). Those carts keep their hold and the caller still gets 'in_use' — now a
-- TRUE statement ("someone is paying with it right now") instead of a dead end.
--
-- CREATE OR REPLACE, signature unchanged → no types drift. Proven red-first by
-- supabase/tests/reward_follows_owner_test.sql (idle hold is released; a mid-payment hold still
-- refuses; the release touches ONLY this reward's holders).

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

  -- Lock the REWARD row so two carts can't pass the "in_use" check concurrently (20260623080000 #2).
  select id, amount_cents into v_reward, v_amount from public.mms_rewards
    where reward_code = p_code and user_id = p_user and redeemed_at is null and expires_at > now()
    for update;
  if v_reward is null then return 'invalid'; end if;

  select coalesce(sum(unit_price_cents * qty), 0) into v_subtotal
    from public.qr_cart_items where cart_id = p_cart and state <> 'voided' and not comped;
  select reward_min_redeem_cents into v_min from public.mms_rewards_config where id;
  if v_subtotal < coalesce(v_min, 0) then return 'min_not_met'; end if;

  -- W20: the reward follows its owner. Release holds from IDLE carts (the mms_clear_reward
  -- predicate — open, unlocked, not settling); a mid-payment holder is untouchable and falls
  -- through to the honest 'in_use' below. Two accepted edges (pre-merge review): ① `locked`/
  -- `settle_at` are trusted at face value — their staleness TTL lives in the app layer only, so a
  -- pay attempt abandoned mid-lock keeps its hold unstealable (OPEN-ITEMS M53; the app copy
  -- promises nothing time-based). ② this UPDATE takes other carts' row locks while p_cart's is
  -- held, so two near-simultaneous applies of the SAME reward from the stale holder + a new cart
  -- can deadlock (40P01) — Postgres aborts one, it surfaces as the generic failure, and a retry
  -- succeeds; rare enough to document rather than re-order locks around.
  update public.qr_carts set applied_reward_id = null, updated_at = now()
    where applied_reward_id = v_reward and id <> p_cart
      and status = 'open' and not locked and settle_at is null;

  if exists (select 1 from public.qr_carts
               where applied_reward_id = v_reward and id <> p_cart and status = 'open') then
    return 'in_use';
  end if;

  update public.qr_carts set applied_reward_id = v_reward, updated_at = now() where id = p_cart;
  return 'ok';
end $$;
revoke all on function public.mms_apply_reward(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.mms_apply_reward(uuid, text, uuid) to service_role;
