-- supabase/tests/reward_follows_owner_test.sql  (W20 — the reward follows its owner)
--
-- `mms_apply_reward` refuses 'in_use' when another OPEN cart holds the reward. Before W20 that
-- fired on the owner's own ABANDONED cart (apply at lunch, walk away, scan again at dinner → "that
-- reward is already on another order" with no way back). The 20260816060000 migration makes the
-- apply RELEASE holds from IDLE carts (open ∧ not locked ∧ settle_at null — exactly the
-- mms_clear_reward predicate) before the check, while a MID-PAYMENT holder (locked / settling)
-- still refuses — stealing from it would strand the webhook reconcile against the PI it minted.
--
-- Three assertions, each of which fails against the pre-W20 function or a botched predicate:
--   1. an IDLE holder's reward moves to the new cart ('ok', hold transferred);
--   2. a LOCKED holder still refuses ('in_use', hold kept) — the release must not over-reach;
--   3. the release touches ONLY this reward's holders — an unrelated reward's idle hold survives.
--
-- Run against any QR DB (rolls back — leaves NO data behind):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/reward_follows_owner_test.sql
--
-- ⚠️ `set local plpgsql.check_asserts = on` is NOT optional — with the GUC off every ASSERT
-- compiles out and the file exits 0 having proved nothing.

begin;
set local plpgsql.check_asserts = on;

-- ── fixtures (privileged role bypasses RLS; the reward FK needs a real auth.users row) ───────────
insert into auth.users (id) values ('00000000-0000-0000-0000-00000000f00d');
insert into public.mms_rewards (id, user_id, reward_code, amount_cents, milestone_index, expires_at) values
  ('00000000-0000-0000-0000-0000000e0a01', '00000000-0000-0000-0000-00000000f00d', 'W20-FOLLOW', 500, 901, now() + interval '30 days'),
  ('00000000-0000-0000-0000-0000000e0a02', '00000000-0000-0000-0000-00000000f00d', 'W20-OTHER',  500, 902, now() + interval '30 days');
insert into public.table_sessions (id, qr_code, mode, status, host_seat) values
  ('00000000-0000-0000-0000-000000005e01', 'W20TEST-1', 'dinein', 'active', '00000000-0000-0000-0000-000000000ea1'),
  ('00000000-0000-0000-0000-000000005e02', 'W20TEST-2', 'dinein', 'active', '00000000-0000-0000-0000-000000000ea2'),
  ('00000000-0000-0000-0000-000000005e03', 'W20TEST-3', 'dinein', 'active', '00000000-0000-0000-0000-000000000ea3');
-- C1 = the STALE holder (idle). C2 = the cart applying. C3 = an idle holder of the OTHER reward.
insert into public.qr_carts (id, session_id, applied_reward_id) values
  ('00000000-0000-0000-0000-00000000cc01', '00000000-0000-0000-0000-000000005e01', '00000000-0000-0000-0000-0000000e0a01'),
  ('00000000-0000-0000-0000-00000000cc02', '00000000-0000-0000-0000-000000005e02', null),
  ('00000000-0000-0000-0000-00000000cc03', '00000000-0000-0000-0000-000000005e03', '00000000-0000-0000-0000-0000000e0a02');
-- C2 clears the $50 min-redeem floor (config default 5000¢).
insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents) values
  ('00000000-0000-0000-0000-00000000cc02', 'w20-test-feast', 'W20 Test Feast', 1, 6000);

-- ── 1 · an IDLE holder releases: the apply succeeds and the hold MOVES ───────────────────────────
do $$
declare v text;
begin
  select public.mms_apply_reward('00000000-0000-0000-0000-00000000cc02', 'W20-FOLLOW',
                                 '00000000-0000-0000-0000-00000000f00d') into v;
  assert v = 'ok', format('apply against an IDLE holder returned %s — the reward did not follow its owner', v);
  assert (select applied_reward_id from public.qr_carts where id = '00000000-0000-0000-0000-00000000cc01') is null,
    'the stale idle cart still holds the reward';
  assert (select applied_reward_id from public.qr_carts where id = '00000000-0000-0000-0000-00000000cc02')
         = '00000000-0000-0000-0000-0000000e0a01',
    'the applying cart did not receive the reward';
end $$;

-- ── 2 · a LOCKED (mid-payment) holder still refuses, and KEEPS its hold ──────────────────────────
do $$
declare v text;
begin
  -- Move the hold back to C1 and lock it (create-intent's mid-payment state); free C2.
  update public.qr_carts set applied_reward_id = null where id = '00000000-0000-0000-0000-00000000cc02';
  update public.qr_carts set applied_reward_id = '00000000-0000-0000-0000-0000000e0a01', locked = true
    where id = '00000000-0000-0000-0000-00000000cc01';

  select public.mms_apply_reward('00000000-0000-0000-0000-00000000cc02', 'W20-FOLLOW',
                                 '00000000-0000-0000-0000-00000000f00d') into v;
  assert v = 'in_use', format('apply against a LOCKED holder returned %s — the release over-reached into a mid-payment cart', v);
  assert (select applied_reward_id from public.qr_carts where id = '00000000-0000-0000-0000-00000000cc01')
         = '00000000-0000-0000-0000-0000000e0a01',
    'the locked mid-payment cart LOST its reward hold — webhook reconcile would strand';
end $$;

-- ── 3 · the release is scoped to THIS reward — an unrelated idle hold survives both applies ──────
do $$
begin
  assert (select applied_reward_id from public.qr_carts where id = '00000000-0000-0000-0000-00000000cc03')
         = '00000000-0000-0000-0000-0000000e0a02',
    'an UNRELATED reward''s idle hold was released — the steal is not scoped to the applied reward';
end $$;

-- All assertions passed if we reach here. Roll back so the run is side-effect free + repeatable.
rollback;
