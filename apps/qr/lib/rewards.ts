"use server";
import { cookies } from "next/headers";
import { serverClient, serviceClient } from "@mms/db/server";
import { getStaffAuth } from "./staff";

/**
 * Server-authoritative session kind for AnonAuthGate (M4): is the caller an anonymous diner, an UPGRADED
 * diner, or STAFF? The gate keeps a diner (anon or upgraded) and swaps only staff on a diner route — and
 * it must NOT trust a client-writable signal for that (a staff user could otherwise self-mark to dodge the
 * swap). getStaffAuth resolves the SSR-verified uid + the service-role staff lookup, so this is the real
 * authority: 'anon' (anonymous / no session) · 'staff' (active staff row) · 'diner' (any other real user).
 */
export async function getSessionKind(): Promise<"anon" | "diner" | "staff"> {
  const staff = await getStaffAuth();
  if (staff.kind === "staff") return "staff";
  if (staff.kind === "anon") return "anon";
  return "diner"; // not_staff = a confirmed (non-anonymous) user that isn't staff → an upgraded diner
}

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

export type RewardsProgress = {
  stars: number;
  milestoneStep: number;
  /** Orders until the next reward coupon (1..milestoneStep — strictly above, never 0). */
  ordersToNext: number;
  tierId: string;
  /** Did the passed order earn THIS viewer a Star? (false when no orderId, or the viewer isn't its earner.) */
  earnedThisOrder: boolean;
};

/**
 * A lean rewards-progress read for the /track success moment (R8) — just the milestone numbers, NO coupon
 * or profile reads (unlike getRewardsState). Resolves the SSR-verified uid (anon or upgraded — the SAME
 * uid the webhook stamped as `earned_by`) and reads the server-derived summary service-role, so a diner
 * only ever reads their OWN progress. Called from /track once the order has landed (the webhook has
 * fulfilled → this order is counted in `stars`). Returns null when there's no session on the /track
 * request (e.g. opened on another device / without the diner's cookie) — the caller then shows just the
 * "Paid — thank you!" success with no Star claim. Never trust a client-sent stars/tier value.
 *
 * `earnedThisOrder`: when an `orderId` is passed, this server-checks whether THAT order is attributed to
 * the viewer (`earned_by === auth.uid()`). Split-tender stamps only the HOST as earner, so a non-host
 * share-payer earned nothing — gating the "+1 Star earned" pill on this never claims a Star they didn't
 * get. The check returns only a boolean about the viewer's OWN attribution, so it leaks no other diner's data.
 */
export async function getRewardsProgress(
  orderId?: string | null,
): Promise<RewardsProgress | null> {
  const supa = serverClient(await cookies());
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) return null;
  const db = serviceClient();
  // Read the order's attribution FIRST, then the summary. The webhook stamps `earned_by` and its Star count
  // (mms_rewards_summary counts qr_orders by earned_by) off the SAME update — so ordering the summary AFTER a
  // true `earnedThisOrder` guarantees the count already includes this order (no stale stars / lagging
  // "N to next reward" / missed "Reward unlocked" the moment attribution lands).
  let earnedThisOrder = false;
  if (orderId) {
    const { data: row } = await db
      .from("qr_orders")
      .select("earned_by")
      .eq("id", orderId)
      .maybeSingle();
    earnedThisOrder = row?.earned_by === user.id;
  }
  const { data: summary } = await db.rpc("mms_rewards_summary", { p_user: user.id });
  const s = (summary ?? {}) as {
    stars?: number;
    tier_id?: string;
    milestone_step?: number;
    orders_to_next?: number;
  };
  return {
    stars: Number(s.stars ?? 0),
    milestoneStep: Number(s.milestone_step ?? 5),
    ordersToNext: Number(s.orders_to_next ?? 0),
    tierId: s.tier_id ?? "new",
    earnedThisOrder,
  };
}

/**
 * The caller's active (unredeemed, unexpired) reward coupons — for the checkout redeem field (M4 P4.2).
 * Resolves the SSR-verified uid (anon or upgraded — the same uid that earned them) and reads service-role,
 * so a diner only ever sees their OWN coupons. Returns [] when there are none / no session.
 */
export async function getMyRewardCoupons(): Promise<RewardCoupon[]> {
  const supa = serverClient(await cookies());
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) return [];
  const { data: rows } = await serviceClient()
    .from("mms_rewards")
    .select("reward_code,amount_cents,expires_at")
    .eq("user_id", user.id)
    .is("redeemed_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("issued_at", { ascending: false });
  return (rows ?? []).map((r) => ({
    code: r.reward_code,
    amountCents: r.amount_cents,
    expiresAt: r.expires_at,
  }));
}

/**
 * The caller's own order history (M4 P4.2) — their PAID orders (the ones they paid for: earned_by = the
 * SSR-verified uid, anon or upgraded), newest first, with a short line summary. Service-role read scoped
 * to the uid, so a diner only ever sees their OWN orders. Cash/staff-closed orders have no earner, so they
 * don't appear here (honest — "orders you placed", not the whole table's).
 */
export type OrderHistoryLine = { name: string; qty: number };
export type OrderHistoryEntry = {
  id: string;
  createdAt: string;
  totalCents: number;
  tender: string;
  lines: OrderHistoryLine[];
};

export async function getOrderHistory(limit = 20): Promise<OrderHistoryEntry[]> {
  const supa = serverClient(await cookies());
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) return [];
  const lim = Math.min(Math.max(Math.trunc(limit), 1), 50); // bound a server-action arg (own data only)
  const db = serviceClient();
  // Deliberate read-only swallow ({ data } only): a transient read error degrades to "no orders" rather
  // than stranding /account — the page stays renderable and the empty/"—" fallbacks read honestly.
  const { data: orders } = await db
    .from("qr_orders")
    .select("id,created_at,total_cents,tender")
    .eq("earned_by", user.id)
    .eq("status", "paid")
    .order("created_at", { ascending: false })
    .limit(lim);
  if (!orders || orders.length === 0) return [];

  const ids = orders.map((o) => o.id);
  const { data: items } = await db
    .from("qr_order_items")
    .select("order_id,name,qty")
    .in("order_id", ids);
  const byOrder = new Map<string, OrderHistoryLine[]>();
  for (const it of items ?? []) {
    const arr = byOrder.get(it.order_id) ?? [];
    arr.push({ name: it.name, qty: it.qty });
    byOrder.set(it.order_id, arr);
  }
  return orders.map((o) => ({
    id: o.id,
    createdAt: o.created_at,
    totalCents: o.total_cents,
    tender: o.tender,
    lines: byOrder.get(o.id) ?? [],
  }));
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
