"use server";
import { cookies } from "next/headers";
import { serverClient, serviceClient } from "@mms/db/server";
import { getStaffAuth } from "./staff";
import { withinMutationRate } from "./rate";
import { safeImageUrl } from "./media-url";
import { summarizeRefund, type RefundSummary } from "./refund-view";

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
  /** W14: the profile row's created_at (ISO) — the card's "since Jun 2026" tenure line. Null for
   *  anon (no profile row) or a missing row; the card omits the line rather than fabricating. */
  memberSince: string | null;
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
  // "Upgraded" = a REAL (non-anonymous) account. Test `!== true`, NOT `=== false`: an anonymous session
  // always carries `is_anonymous: true`, but a real account can surface it as `false` OR omit it
  // (undefined) depending on the GoTrue/session shape — and `undefined === false` would wrongly drop a
  // signed-in diner back to the "save your Stars" guest pitch. `!== true` treats anything not-explicitly-
  // anonymous as the real account it is.
  const isUpgraded = user.is_anonymous !== true;

  const db = serviceClient();
  const { data: summary, error: summaryErr } = await db.rpc("mms_rewards_summary", { p_user: uid });
  // W9c — a FAILED read is not "you have nothing". Swallowing it left `summary` null, `s` an empty
  // object, and the `?? 0` fallbacks below rendered an authoritative-looking **zeroed hub**: 0 Stars,
  // $0 lifetime, tier `new` — to a diner who may be sitting on Gold. Worse, `TierUpCelebration` writes
  // that fabricated rank to localStorage as its baseline, so the NEXT healthy visit fires a full-screen
  // "Tier unlocked" for a climb that never happened. `null` routes /account to its honest alert.
  //
  // ⚠️ Deliberately NOT `if (!summary) return null` — a brand-new diner legitimately has no row, and the
  // `?? 0` fallbacks below are exactly what renders their first visit.
  if (summaryErr) {
    console.error("[rewards] mms_rewards_summary failed", summaryErr);
    return null;
  }
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
  let memberSince: string | null = null;
  if (isUpgraded) {
    const { data: prof } = await db
      .from("mms_profiles")
      .select("display_name,created_at")
      .eq("id", uid)
      .maybeSingle();
    displayName = prof?.display_name ?? null;
    memberSince = prof?.created_at ?? null;
  }

  return {
    isUpgraded,
    email: user.email ?? null,
    displayName,
    memberSince,
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

export type RewardsBadge = {
  stars: number;
  tierId: string;
  /** A confirmed (non-anonymous) account — for the header's "save your rewards" anon nudge. */
  isUpgraded: boolean;
};

/**
 * The leanest rewards read — just the Star count + tier + anon/upgraded flag for the persistent header's
 * rewards affordance (and its anon "save your rewards" nudge). One round trip: the SSR-verified uid (anon or
 * upgraded — same uid) + the server-derived summary, service-role, uid-scoped, so a diner only reads their
 * OWN count. Returns null when there's no session (behind AnonAuthGate there always is; the caller renders a
 * plain "Rewards" link either way). Never trust a client-sent stars/tier value.
 */
export async function getRewardsBadge(): Promise<RewardsBadge | null> {
  const supa = serverClient(await cookies());
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) return null;
  const db = serviceClient();
  const { data: summary, error: summaryErr } = await db.rpc("mms_rewards_summary", {
    p_user: user.id,
  });
  // W9c — same rule as `getRewardsState`, and this one rides the PERSISTENT header on every route: a
  // swallowed error showed every diner "0 ★" as fact. Returning null makes the header fall back to its
  // plain "Rewards" label (a stable-width affordance — no layout shift), which claims nothing.
  if (summaryErr) {
    console.error("[rewards] mms_rewards_summary failed (badge)", summaryErr);
    return null;
  }
  const s = (summary ?? {}) as { stars?: number; tier_id?: string };
  return {
    stars: Number(s.stars ?? 0),
    tierId: s.tier_id ?? "new",
    isUpgraded: user.is_anonymous !== true, // real account = not-explicitly-anonymous (see getRewardsState)
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
  /** K3a: a confirmed (non-anonymous) account — so the post-pay copy only claims "saved to your
   *  account" when it's true; an anonymous diner's Stars are device-bound until they upgrade. */
  isUpgraded: boolean;
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
export async function getRewardsProgress(orderId?: string | null): Promise<RewardsProgress | null> {
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
  const { data: summary, error: summaryErr } = await db.rpc("mms_rewards_summary", {
    p_user: user.id,
  });
  // W9c — the THIRD reader of this RPC (the slice's first pass only found two), and it feeds the
  // POST-PAYMENT screen: PaySuccess + GoodbyeBeat. Swallowing the error rendered "0 Stars · 5 orders
  // to your next reward" as fact at the exact moment a diner is being congratulated for the order
  // that just earned one. Same rule as the other two: null on a failed READ, never on an empty row —
  // the caller already renders nothing when this returns null.
  if (summaryErr) {
    console.error("[rewards] mms_rewards_summary failed (progress)", summaryErr);
    return null;
  }
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
    isUpgraded: user.is_anonymous !== true, // real account = not-explicitly-anonymous (see getRewardsState)
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
 * J5 — the welcome-back read for the menu's arrival beat (docs/JOURNEY_PLAN.md · recognition). Two
 * facts, both the caller's OWN and both server-derived: their display name (UPGRADED accounts only —
 * an anon uid has no durable identity to greet by; dine-in guest names are per-session, not a
 * greeting-grade identity) and how many PAID orders this uid has placed this calendar month at the
 * RESTAURANT's clock (America/Los_Angeles — the same TZ convention as order history, so an evening
 * order never drifts into next month). Copy rule for callers: claim ORDERS, never "visits" — two
 * orders in one sitting are two orders, and we won't invent an ordinal the data can't back.
 */
export type WelcomeBack = { name: string | null; ordersThisMonth: number };

/** The LA-midnight instant that starts the current month — computed by rendering "now" in the
 *  restaurant TZ and correcting a first-guess UTC instant by its own TZ rendering (2 passes covers
 *  any DST offset). Pure arithmetic on real clocks; no fabricated boundaries. */
function laMonthStartIso(): string {
  const TZ = "America/Los_Angeles";
  const ym = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const y = ym.find((p) => p.type === "year")?.value;
  const m = ym.find((p) => p.type === "month")?.value;
  let guess = new Date(`${y}-${m}-01T00:00:00Z`);
  const wall = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  for (let i = 0; i < 2; i++) {
    const seen = wall.format(guess).replace(", ", "T");
    const delta = new Date(`${y}-${m}-01T00:00:00Z`).getTime() - new Date(`${seen}Z`).getTime();
    if (delta === 0) break;
    guess = new Date(guess.getTime() + delta);
  }
  return guess.toISOString();
}

export async function getWelcomeBack(): Promise<WelcomeBack | null> {
  const supa = serverClient(await cookies());
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) return null;
  const uid = user.id;
  const db = serviceClient();
  try {
    const [{ count }, name] = await Promise.all([
      db
        .from("qr_orders")
        .select("id", { count: "exact", head: true })
        .eq("earned_by", uid)
        .eq("status", "paid")
        .gte("created_at", laMonthStartIso()),
      user.is_anonymous !== true // real account only has a durable display name (see getRewardsState)
        ? db
            .from("mms_profiles")
            .select("display_name")
            .eq("id", uid)
            .maybeSingle()
            .then((r) => r.data?.display_name ?? null)
        : Promise.resolve(null),
    ]);
    return { name, ordersThisMonth: count ?? 0 };
  } catch {
    // Deliberate swallow (decorative greeting): a failed read is a plain Mingalaba, never a broken menu.
    return null;
  }
}

/**
 * The caller's own order history (M4 P4.2) — their PAID orders (the ones they paid for: earned_by = the
 * SSR-verified uid, anon or upgraded), newest first, with a short line summary. Service-role read scoped
 * to the uid, so a diner only ever sees their OWN orders. Cash/staff-closed orders have no earner, so they
 * don't appear here (honest — "orders you placed", not the whole table's).
 */
export type OrderHistoryLine = {
  name: string;
  qty: number;
  unitPriceCents: number;
  /** Chosen modifier OPTION labels (a string[] in the DB — see cart.ts); [] when none/legacy shape. */
  mods: string[];
  fulfillment: string; // 'dinein' | 'togo' | 'grocery'
  /** W14 — TODAY's catalog photo for the line's soft ref (menu uuid / grocery barcode), containment-
   *  filtered; null → the designed placeholder. Display-only; never a priced field. */
  imageUrl: string | null;
  /** W14 — today's `name_my` for the ref. Live-vs-snapshot caveat (registry S14b): the EN add-time
   *  snapshot stays the row's primary text; a renamed dish shows its CURRENT Burmese subline. */
  nameMy: string | null;
  /** W22r — the line's kitchen note (qr_order_items.notes, ≤160), rendered on receipt surfaces.
   *  Optional: the /account history mapper doesn't populate it (undefined there). */
  notes?: string | null;
  /** W23b — cents refunded against THIS line, 0 when none. Stripe knows the charge, not the line;
   *  this attribution exists only because `mms_record_refund` writes it. */
  refundedCents: number;
};
export type OrderHistoryEntry = {
  id: string;
  /** Short human reference derived from the order uuid tail (deterministic, no migration). */
  code: string;
  createdAt: string;
  totalCents: number;
  tender: string;
  pickupSlot: string | null;
  /** K2: the registered table (1–10) this order was placed at, or null (pickup/scango/unregistered).
   *  Denormalized snapshot on the order — the receipt shows the table you sat at that night. */
  tableNumber: number | null;
  /** Server-derived receipt breakdown (presentation-only — never recomputed client-side). */
  breakdown: {
    subtotalCents: number;
    discountCents: number;
    serviceChargeCents: number;
    taxCents: number;
    tipCents: number;
  };
  lines: OrderHistoryLine[];
  /** W23b — the refund state, derived ONCE in the read (lib/refund-view). A PARTIAL refund leaves
   *  `status` at 'paid', so without this the history card renders a part-returned order at full
   *  price with no trace — the /account half of registry M2. */
  refund: RefundSummary;
};

export async function getOrderHistory(limit = 20): Promise<OrderHistoryEntry[] | null> {
  const supa = serverClient(await cookies());
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) return [];
  const lim = Math.min(Math.max(Math.trunc(limit), 1), 50); // bound a server-action arg (own data only)
  const db = serviceClient();
  // Every amount below is the SERVER-DERIVED figure stored at fulfillment; the UI only displays it verbatim.
  // Return NULL on a read FAILURE (vs [] for a genuinely empty history) so /account can show an honest
  // "couldn't load" note instead of the affirmative "No orders yet" to a diner who actually has orders.
  // W11 (M29): a split payer's orders live behind `qr_order_payers`, not `earned_by` (only the host is
  // stamped there). Resolve the payer's order ids first — uid-scoped, bounded — then one read
  // authorized by EITHER proof. Both `.or()` values are SERVER-derived (a verified auth uid; ids read
  // under that uid's own scope), and this is a SELECT, so the PostgREST-14 or+representation trap
  // (mutations only) does not apply.
  const { data: payerRows, error: payerErr } = await db
    .from("qr_order_payers")
    .select("order_id")
    .eq("payer_uid", user.id)
    .order("created_at", { ascending: false })
    .limit(lim);
  if (payerErr) return null;
  const payerIds = (payerRows ?? []).map((r) => r.order_id);

  let history = db
    .from("qr_orders")
    .select(
      "id,created_at,total_cents,refunded_cents,tender,pickup_slot,table_number,subtotal_cents,discount_cents,service_charge_cents,tax_cents,tip_cents",
    )
    .eq("status", "paid");
  history = payerIds.length
    ? history.or(`earned_by.eq.${user.id},id.in.(${payerIds.join(",")})`)
    : history.eq("earned_by", user.id);
  const { data: orders, error } = await history
    .order("created_at", { ascending: false })
    .limit(lim);
  if (error) return null;
  if (!orders || orders.length === 0) return [];

  const ids = orders.map((o) => o.id);
  const { data: items } = await db
    .from("qr_order_items")
    .select("order_id,menu_item_id,name,qty,unit_price_cents,modifiers,fulfillment,refunded_cents")
    .in("order_id", ids);
  // W14 — line media + Burmese names, the getCartView pattern: `menu_item_id` is a SOFT text ref
  // (a menu_items uuid for restaurant lines, a grocery barcode otherwise — disjoint keyspaces by
  // the uuid partition), so the join is two batch reads, together. Advisory posture: a failed
  // lookup degrades to placeholder/EN text — never a dead history (the receipts are why /track and
  // /cart send diners here). Amounts are untouched: media only, never a priced field.
  const uuidRe = /^[0-9a-f-]{36}$/i;
  const refs = [
    ...new Set(
      (items ?? []).map((i) => i.menu_item_id).filter((x): x is string => typeof x === "string"),
    ),
  ];
  const menuIds = refs.filter((x) => uuidRe.test(x));
  const barcodes = refs.filter((x) => !uuidRe.test(x));
  const media = new Map<string, { imageUrl: string | null; nameMy: string | null }>();
  const [menuRes, groceryRes] = await Promise.all([
    menuIds.length
      ? db.from("menu_items").select("id,image_url,name_my").in("id", menuIds)
      : Promise.resolve({ data: null }),
    barcodes.length
      ? db.from("grocery_items").select("barcode,image_url,name_my").in("barcode", barcodes)
      : Promise.resolve({ data: null }),
  ]);
  for (const f of menuRes.data ?? [])
    media.set(f.id, { imageUrl: safeImageUrl(f.image_url), nameMy: f.name_my ?? null });
  for (const g of groceryRes.data ?? [])
    media.set(g.barcode, { imageUrl: safeImageUrl(g.image_url), nameMy: g.name_my ?? null });
  const byOrder = new Map<string, OrderHistoryLine[]>();
  for (const it of items ?? []) {
    const arr = byOrder.get(it.order_id) ?? [];
    // modifiers is a string[] of option labels; guard defensively against a legacy/unexpected jsonb shape
    // so a malformed row degrades to no mods rather than crashing the server render.
    const raw = it.modifiers;
    const mods = Array.isArray(raw) ? raw.filter((m): m is string => typeof m === "string") : [];
    arr.push({
      name: it.name,
      qty: it.qty,
      unitPriceCents: it.unit_price_cents ?? 0,
      mods,
      fulfillment: it.fulfillment ?? "dinein",
      imageUrl: media.get(it.menu_item_id)?.imageUrl ?? null,
      nameMy: media.get(it.menu_item_id)?.nameMy ?? null,
      refundedCents: it.refunded_cents ?? 0,
    });
    byOrder.set(it.order_id, arr);
  }
  return orders.map((o) => ({
    id: o.id,
    code: o.id.slice(-6).toUpperCase(),
    createdAt: o.created_at,
    totalCents: o.total_cents,
    tender: o.tender,
    pickupSlot: o.pickup_slot ?? null,
    tableNumber: o.table_number ?? null,
    breakdown: {
      subtotalCents: o.subtotal_cents ?? 0,
      discountCents: o.discount_cents ?? 0,
      serviceChargeCents: o.service_charge_cents ?? 0,
      taxCents: o.tax_cents ?? 0,
      tipCents: o.tip_cents ?? 0,
    },
    lines: byOrder.get(o.id) ?? [],
    // The read filters `status = 'paid'`, so every entry here is either unrefunded or PARTIALLY
    // refunded — the exact case that used to render at full price with no trace. Passing the status
    // literal keeps summarizeRefund's contract intact rather than encoding the filter's consequence
    // as an assumption at the call site.
    refund: summarizeRefund(o.total_cents, o.refunded_cents ?? 0, "paid"),
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
  if (!user || user.is_anonymous === true) return; // skip only for an anonymous guest (see getRewardsState)
  // W1·Q6 flood guard — the upsert is idempotent, so a rate-limited call is a safe no-op (the next
  // account-page visit re-runs it).
  if (!(await withinMutationRate(user.id))) return;
  const db = serviceClient();
  await db
    .from("mms_profiles")
    .upsert(
      { id: user.id, email: user.email ?? null },
      { onConflict: "id", ignoreDuplicates: true },
    );
}

export type SetDisplayNameResult =
  | { ok: true; name: string | null }
  | { ok: false; reason: "signed_out" | "invalid" | "rate_limited" | "unavailable" };

/**
 * W14 — the FIRST write to `mms_profiles.display_name` (the column shipped with M4 and was read in
 * three places — the /account heading, the Mingalaba greeting, the lend confirm — while nothing
 * ever wrote it). Upgraded accounts only: a device-bound anon "name" would promise a durability
 * the 4h anon TTL breaks (the anon identity already has `mms.name` for the table/pickup surface).
 * Bounds mirrored at the DB (`char_length between 1 and 80` CHECK): trim; empty/null clears back
 * to null; >80 refused with honest copy, never silently truncated (it's the diner's NAME).
 * Service-role write authorized by the SSR-verified uid — the client never names an id.
 */
export async function setDisplayName(raw: string | null): Promise<SetDisplayNameResult> {
  const supa = serverClient(await cookies());
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user || user.is_anonymous === true) return { ok: false, reason: "signed_out" };
  if (raw !== null && typeof raw !== "string") return { ok: false, reason: "invalid" };
  const trimmed = raw?.trim() ?? "";
  const name = trimmed === "" ? null : trimmed;
  if (name !== null && name.length > 80) return { ok: false, reason: "invalid" };
  // W1·Q6 flood guard — an interactive save, so the refusal is SURFACED (unlike ensureProfile's
  // silent no-op): the card shows "try again in a moment" instead of pretending it stuck.
  if (!(await withinMutationRate(user.id))) return { ok: false, reason: "rate_limited" };
  const db = serviceClient();
  // Upsert (not update) so a save can't vanish on the rare visit where ensureProfile's row is
  // still in flight; email rides along from the same verified auth user, never the client.
  const { error } = await db.from("mms_profiles").upsert(
    {
      id: user.id,
      email: user.email ?? null,
      display_name: name,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) {
    console.error("[rewards] setDisplayName failed", error.message);
    return { ok: false, reason: "unavailable" };
  }
  return { ok: true, name };
}

// (W16b: setLocalePref retired with the language toggle — the app is always bilingual. The
// `lang_change` PostHog event stops flowing, and `mms_profiles.locale` returns to dead-column
// status: no writer, column + CHECK left in place. See docs/OPEN-ITEMS.)
