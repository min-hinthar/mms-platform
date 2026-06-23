-- 20260623080000_m4_reward_redeem_fixes.sql — M4 P4.2 pre-PR adversarial fixes (reconcile-strand vectors).
-- Both CREATE OR REPLACE (signatures unchanged → no types drift).
--
-- [#1] mms_clear_reward must NOT clear a reward while the cart is mid-pay: create-intent locked the cart
--      and minted the PI for a total INCLUDING the reward discount; clearing it would make the webhook
--      re-derive a higher total → 409 reconcile strand (charged-no-order). Guard locked/settle_at in the
--      statement (the load-bearing defense; the app guards too). Honours the migration's stated invariant.
-- [#2] mms_apply_reward's "held by one open cart" check was racy — the `for update` was on the CART row,
--      not the REWARD, so two carts could apply the same reward concurrently (→ one strands at the webhook
--      when the other redeems it first). Lock the REWARD row (`for update`) so concurrent applies serialize
--      and the second sees the first's cart-hold → 'in_use'.

create or replace function mms_clear_reward(p_cart uuid) returns void
  language sql security definer set search_path = '' as $$
  update public.qr_carts set applied_reward_id = null, updated_at = now()
    where id = p_cart and status = 'open' and not locked and settle_at is null;
$$;
revoke all on function public.mms_clear_reward(uuid) from public, anon, authenticated;
grant execute on function public.mms_clear_reward(uuid) to service_role;

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

  -- Lock the REWARD row so two carts can't pass the "in_use" check concurrently (#2). A re-appliable
  -- reward (after clear / redeem-elsewhere) is fine: redeemed/expired rows fail the predicate below.
  select id, amount_cents into v_reward, v_amount from public.mms_rewards
    where reward_code = p_code and user_id = p_user and redeemed_at is null and expires_at > now()
    for update;
  if v_reward is null then return 'invalid'; end if;

  select coalesce(sum(unit_price_cents * qty), 0) into v_subtotal
    from public.qr_cart_items where cart_id = p_cart and state <> 'voided' and not comped;
  select reward_min_redeem_cents into v_min from public.mms_rewards_config where id;
  if v_subtotal < coalesce(v_min, 0) then return 'min_not_met'; end if;

  -- Now serialized on the reward row: a concurrent apply for the same reward blocked here until we commit,
  -- then sees this cart's hold → 'in_use'.
  if exists (select 1 from public.qr_carts
               where applied_reward_id = v_reward and id <> p_cart and status = 'open') then
    return 'in_use';
  end if;

  update public.qr_carts set applied_reward_id = v_reward, updated_at = now() where id = p_cart;
  return 'ok';
end $$;
revoke all on function public.mms_apply_reward(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.mms_apply_reward(uuid, text, uuid) to service_role;
