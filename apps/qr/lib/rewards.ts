"use server";
import { cookies } from "next/headers";
import { serverClient, serviceClient } from "@mms/db/server";

// Morning Star Rewards — diner-facing reads (M4 P4.1). Server-authoritative + DERIVED: stars/spend/tier
// come from mms_rewards_summary over the caller's PAID orders (docs/M4_DESIGN R1); the client never sends
// a balance or tier. Identity is the SSR-verified auth.uid() (anon or upgraded — same uid), so a diner
// only ever reads their OWN rewards. Reads run service-role (the authorization decision is ours).

export type RewardCoupon = { code: string; amountCents: number; expiresAt: string };
export type RewardsState = {
  /** A confirmed (non-anonymous) account — gems/stars persist beyond this device. */
  isUpgraded: boolean;
  email: string | null;
  displayName: string | null;
  stars: number;
  spendCents: number;
  tierId: string;
  milestoneStep: number;
  /** Orders until the next reward coupon (1..milestoneStep). */
  ordersToNext: number;
  coupons: RewardCoupon[];
};

export async function getRewardsState(): Promise<RewardsState | null> {
  const supa = serverClient(await cookies());
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) return null; // no session (shouldn't happen behind AnonAuthGate) — caller renders a fallback
  const uid = user.id;
  const isUpgraded = user.is_anonymous === false;

  const db = serviceClient();
  const { data: summary } = await db.rpc("mms_rewards_summary", { p_user: uid });
  const s = (summary ?? {}) as {
    stars?: number;
    spend_cents?: number;
    tier_id?: string;
    milestone_step?: number;
    orders_to_next?: number;
  };

  // Active coupons = unredeemed AND unexpired (server-side expiry, not a client guess).
  const { data: rows } = await db
    .from("mms_rewards")
    .select("reward_code,amount_cents,expires_at")
    .eq("user_id", uid)
    .is("redeemed_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("issued_at", { ascending: false });

  let displayName: string | null = null;
  if (isUpgraded) {
    const { data: prof } = await db
      .from("mms_profiles")
      .select("display_name")
      .eq("id", uid)
      .maybeSingle();
    displayName = prof?.display_name ?? null;
  }

  return {
    isUpgraded,
    email: user.email ?? null,
    displayName,
    stars: Number(s.stars ?? 0),
    spendCents: Number(s.spend_cents ?? 0),
    tierId: s.tier_id ?? "new",
    milestoneStep: Number(s.milestone_step ?? 5),
    ordersToNext: Number(s.orders_to_next ?? 0),
    coupons: (rows ?? []).map((r) => ({
      code: r.reward_code,
      amountCents: r.amount_cents,
      expiresAt: r.expires_at,
    })),
  };
}

/**
 * Create the diner's profile row once their account upgrade has CONFIRMED (is_anonymous=false). Idempotent;
 * service-role write (mms_profiles is owner-read, service-role-write). No-op for an anonymous session — a
 * profile implies a real account (docs/M4_DESIGN R5). Called on the account page after an upgrade lands.
 */
export async function ensureProfile(): Promise<void> {
  const supa = serverClient(await cookies());
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user || user.is_anonymous !== false) return;
  const db = serviceClient();
  await db
    .from("mms_profiles")
    .upsert(
      { id: user.id, email: user.email ?? null },
      { onConflict: "id", ignoreDuplicates: true },
    );
}
