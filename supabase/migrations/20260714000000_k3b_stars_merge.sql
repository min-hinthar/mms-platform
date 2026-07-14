-- 20260714000000_k3b_stars_merge.sql — Journey II K3b: merge an anonymous device's Stars onto the
-- account a diner signs into. Today, signing into a PRE-EXISTING account (the email_exists /
-- identity_already_exists recovery paths) ABANDONS the anon device's orders + Stars + coupons; this
-- moves them. The upgrade-IN-PLACE path (updateUser email_change / linkIdentity to a fresh account)
-- keeps the same uid and needs NO merge.
--
-- This is the track's most money-adjacent phase (it moves earned Stars + issues real coupon value), so
-- it was design-critiqued against the live schema BEFORE this migration. The load-bearing invariants
-- (documented inline, proven by a BEGIN/ROLLBACK scenario test before shipping):
--   • The COUPON ROWS ARE THE WATERMARK — no separate watermark column. Moving the anon's coupons and
--     RE-INDEXING them contiguously ABOVE the target's max (max-offset + row_number) means every earned
--     milestone index is OCCUPIED, so mms_reward_on_fulfill's `on conflict (user_id,milestone_index) do
--     nothing` can never re-mint one. Three properties make this hold and MUST NOT be "simplified":
--       (1) offset = MAX(milestone_index) (never count — a gap would collide),
--       (2) re-index by row_number() (dense 1..n — collision-proof for non-contiguous/orphaned indices),
--       (3) REDEEMED coupons move too (as index-occupiers — else their milestone re-mints a spent reward).
--   • BOUNDARY milestone: floor(A)+floor(B) ≤ floor(A+B) ≤ +1, so combining two partial progressions can
--     cross exactly ONE new milestone. It's legitimately earned (net paid orders justify it), not a
--     double-mint, so the merge MINTS it (a final mms_reward_on_fulfill(target) — exactly-once: it either
--     no-ops on an occupied index or mints the single carry).
--   • WEBHOOK RACE (P0-1): a payment that lands AFTER the merge (Stripe metadata baked earnerUid=anon at
--     intent-create) would credit the orphan anon uid. A durable mms_identity_merges redirect, resolved
--     at both webhook earn sites via mms_earn_on_fulfill, makes the merge permanent for late orders.
--   • STALE-TOKEN SAFETY (P0-2): the merge asserts the source is STILL anonymous + the target is a real
--     account, so a lingering token can never strip a real account or merge into an anon.
-- All additive; the only money-path change is the webhook earn sites switching to mms_earn_on_fulfill
-- (identical when no merge exists — coalesce falls through to the passed earner).

-- ── Durable identity redirect (P0-1) + one-merge-per-anon (PK) ─────────────────────────────────────
create table if not exists public.mms_identity_merges (
  anon_uid uuid primary key, -- an anon device merges at most once (idempotency + the late-order redirect)
  target_uid uuid not null,
  merged_at timestamptz not null default now()
);
alter table public.mms_identity_merges enable row level security;
revoke all on public.mms_identity_merges from public, anon, authenticated;
grant select, insert on public.mms_identity_merges to service_role;

-- ── Single-use merge token (the auth proof: minted while anon, redeemed after sign-in) ─────────────
create table if not exists public.mms_merge_tokens (
  token text primary key, -- ≥256-bit random; the bearer proof of having held the anon session
  anon_uid uuid not null, -- bound to the MINTER's own anon uid (can't carry another uid)
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  redeemed_at timestamptz
);
alter table public.mms_merge_tokens enable row level security;
revoke all on public.mms_merge_tokens from public, anon, authenticated;
grant select, insert, update, delete on public.mms_merge_tokens to service_role;

-- ── Webhook earn, redirect-aware (P0-1) — replaces the webhook's 2-step update()+rpc() at both sites ──
create or replace function public.mms_earn_on_fulfill(p_order uuid, p_earner uuid)
  returns void language plpgsql security definer set search_path = '' as $$
declare v_eff uuid;
begin
  if p_order is null or p_earner is null then return; end if;
  -- Resolve the earner through any identity merge: a paid order that lands AFTER the diner merged still
  -- credits the signed-in account, never the orphaned anon uid.
  v_eff := coalesce(
    (select target_uid from public.mms_identity_merges where anon_uid = p_earner),
    p_earner);
  update public.qr_orders set earned_by = v_eff where id = p_order;
  perform public.mms_reward_on_fulfill(v_eff);
end $$;
revoke all on function public.mms_earn_on_fulfill(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mms_earn_on_fulfill(uuid, uuid) to service_role;

-- ── The merge ──────────────────────────────────────────────────────────────────────────────────────
create or replace function public.mms_merge_anon_rewards(p_anon uuid, p_target uuid)
  returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_orders int := 0; v_stars int := 0; v_coupons int := 0; v_offset int;
begin
  -- Never self-merge (upgrade-in-place). P0-2: source must STILL be anonymous (a stale token can't
  -- cannibalize a real account); target must be a real (non-anon) account (never merge into a guest).
  if p_anon is null or p_target is null or p_anon = p_target then
    return jsonb_build_object('orders', 0, 'stars', 0, 'coupons', 0);
  end if;
  if not exists (select 1 from auth.users where id = p_anon and is_anonymous) then
    return jsonb_build_object('orders', 0, 'stars', 0, 'coupons', 0);
  end if;
  if not exists (select 1 from auth.users where id = p_target and is_anonymous = false) then
    return jsonb_build_object('orders', 0, 'stars', 0, 'coupons', 0);
  end if;

  -- Durable redirect + one-merge-per-anon: the PK conflict makes a re-run a no-op (idempotent).
  -- Insert FIRST so any late webhook (P0-1) resolves through it from the moment the merge begins.
  insert into public.mms_identity_merges (anon_uid, target_uid) values (p_anon, p_target)
    on conflict (anon_uid) do nothing;
  if not found then
    return jsonb_build_object('orders', 0, 'stars', 0, 'coupons', 0);
  end if;

  -- Honest paid-Star count BEFORE the re-stamp (for the UI); re-stamp ALL statuses (no trigger fires).
  select count(*) into v_stars from public.qr_orders where earned_by = p_anon and status = 'paid';
  update public.qr_orders set earned_by = p_target where earned_by = p_anon;
  get diagnostics v_orders = row_count;

  -- Move + RE-INDEX coupons (invariants (1)(2)(3) above): MAX offset, dense row_number, redeemed move too.
  v_offset := coalesce((select max(milestone_index) from public.mms_rewards where user_id = p_target), 0);
  with moved as (
    select id, row_number() over (order by milestone_index, issued_at) as rn
    from public.mms_rewards where user_id = p_anon
  )
  update public.mms_rewards r
    set user_id = p_target, milestone_index = v_offset + m.rn
    from moved m where r.id = m.id;
  get diagnostics v_coupons = row_count;

  -- Favorites (dedup on the composite PK) + feedback.
  insert into public.qr_favorites (user_id, menu_item_id, created_at)
    select p_target, menu_item_id, created_at from public.qr_favorites where user_id = p_anon
    on conflict (user_id, menu_item_id) do nothing;
  delete from public.qr_favorites where user_id = p_anon;
  update public.mms_feedback set user_id = p_target where user_id = p_anon;

  -- Boundary milestone (Ruling 2): mint the single carry the combined orders now justify. Exactly-once —
  -- the re-indexed coupons occupy every already-earned index, so this either conflicts (no-op) or mints
  -- the one new milestone. Sees the just-re-stamped orders (same transaction).
  perform public.mms_reward_on_fulfill(p_target);

  return jsonb_build_object('orders', v_orders, 'stars', v_stars, 'coupons', v_coupons);
end $$;
revoke all on function public.mms_merge_anon_rewards(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mms_merge_anon_rewards(uuid, uuid) to service_role;
