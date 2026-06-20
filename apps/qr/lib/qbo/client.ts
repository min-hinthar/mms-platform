import "server-only";
import { serviceClient } from "@mms/db/server";
import { buildSalesReceipt, type QboOrder, type QboOrderItem, type QboRefs } from "./mapping";

// QBO posting (M2·P2.4). Fail-safe by construction: when QBO_SYNC_ENABLED!=="true" or config is
// missing, every entry point is a logged no-op that records the order as "skipped" — the accounting
// sync can NEVER block fulfillment or fail a webhook. The post is idempotent (one Sales Receipt per
// order, guarded by the qbo_sync_queue row), and out-of-band (the webhook calls it inside `after()`).

type Db = ReturnType<typeof serviceClient>;

type QboConfig = {
  baseUrl: string;
  realmId: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  refs: QboRefs;
};

function qboConfig(): QboConfig | null {
  if (process.env.QBO_SYNC_ENABLED !== "true") return null;
  const realmId = process.env.QBO_REALM_ID;
  const clientId = process.env.QBO_CLIENT_ID;
  const clientSecret = process.env.QBO_CLIENT_SECRET;
  const refreshToken = process.env.QBO_REFRESH_TOKEN;
  const customerRef = process.env.QBO_CUSTOMER_REF;
  const clearingAccountRef = process.env.QBO_CLEARING_ACCOUNT_REF;
  const itemSalesRef = process.env.QBO_ITEM_SALES_REF;
  if (
    !realmId ||
    !clientId ||
    !clientSecret ||
    !refreshToken ||
    !customerRef ||
    !clearingAccountRef ||
    !itemSalesRef
  ) {
    console.error("[qbo] QBO_SYNC_ENABLED=true but required config is missing — skipping sync");
    return null;
  }
  const baseUrl =
    process.env.QBO_ENV === "production"
      ? "https://quickbooks.api.intuit.com"
      : "https://sandbox-quickbooks.api.intuit.com";
  return {
    baseUrl,
    realmId,
    clientId,
    clientSecret,
    refreshToken,
    refs: {
      customerRef,
      clearingAccountRef,
      itemSalesRef,
      itemServiceRef: process.env.QBO_ITEM_SERVICE_REF,
      itemTaxRef: process.env.QBO_ITEM_TAX_REF,
      itemTipRef: process.env.QBO_ITEM_TIP_REF,
    },
  };
}

// Access tokens last ~1h; cache in module memory and refresh a minute early. NOTE(prod): Intuit
// ROTATES the refresh token on each exchange — production must persist the rotated token (a secrets
// row / re-auth), not rely forever on the env one. Documented in docs/QBO_SYNC.md as an activation step.
let tokenCache: { token: string; exp: number } | null = null;

async function accessToken(cfg: QboConfig): Promise<string> {
  if (tokenCache && tokenCache.exp > Date.now() + 60_000) return tokenCache.token;
  const basic = btoa(`${cfg.clientId}:${cfg.clientSecret}`);
  const res = await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: cfg.refreshToken }),
  });
  if (!res.ok) throw new Error(`QBO token refresh failed: ${res.status}`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return j.access_token;
}

async function loadOrder(
  db: Db,
  orderId: string,
): Promise<{ order: QboOrder; items: QboOrderItem[] }> {
  const { data: o, error } = await db
    .from("qr_orders")
    .select(
      "id,stripe_payment_intent_id,created_at,subtotal_cents,discount_cents,service_charge_cents,tax_cents,tip_cents,total_cents",
    )
    .eq("id", orderId)
    .single();
  if (error || !o) throw new Error(`order ${orderId} not found`);
  // The column is nullable in schema, but a fulfilled order always carries its PI id (mms_fulfill_order
  // sets it). Guard defensively so the receipt's PaymentRefNum/PrivateNote can't be null, and narrow.
  if (!o.stripe_payment_intent_id) throw new Error(`order ${orderId} has no payment intent id`);
  const { data: rows } = await db
    .from("qr_order_items")
    .select("name,qty,unit_price_cents")
    .eq("order_id", orderId);
  return {
    order: {
      id: o.id,
      stripePaymentIntentId: o.stripe_payment_intent_id,
      createdAt: o.created_at,
      subtotalCents: o.subtotal_cents,
      discountCents: o.discount_cents,
      serviceChargeCents: o.service_charge_cents,
      taxCents: o.tax_cents,
      tipCents: o.tip_cents,
      totalCents: o.total_cents,
    },
    items: (rows ?? []).map((r) => ({
      name: r.name,
      qty: r.qty,
      unitPriceCents: r.unit_price_cents,
    })),
  };
}

type QueuePatch = {
  status: "pending" | "synced" | "error" | "skipped";
  qbo_doc_id?: string | null;
  last_error?: string | null;
  bumpAttempt?: boolean;
};

async function markQueue(db: Db, orderId: string, patch: QueuePatch): Promise<void> {
  const { data: cur } = await db
    .from("qbo_sync_queue")
    .select("attempts")
    .eq("order_id", orderId)
    .maybeSingle();
  const attempts = (cur?.attempts ?? 0) + (patch.bumpAttempt ? 1 : 0);
  const { error } = await db.from("qbo_sync_queue").upsert(
    {
      order_id: orderId,
      status: patch.status,
      attempts,
      updated_at: new Date().toISOString(),
      ...(patch.qbo_doc_id !== undefined ? { qbo_doc_id: patch.qbo_doc_id } : {}),
      ...(patch.last_error !== undefined ? { last_error: patch.last_error } : {}),
    },
    { onConflict: "order_id" },
  );
  if (error) console.error("[qbo] markQueue failed", { orderId, status: patch.status, error });
}

/** Durably record that an order owes a QBO sync. Idempotent — never clobbers a later status. */
export async function enqueueQboSync(db: Db, orderId: string): Promise<void> {
  const { error } = await db
    .from("qbo_sync_queue")
    .upsert(
      { order_id: orderId, status: "pending" },
      { onConflict: "order_id", ignoreDuplicates: true },
    );
  if (error) console.error("[qbo] enqueue failed", { orderId, error });
}

export type QboSyncResult = {
  status: "synced" | "skipped" | "error";
  docId?: string;
  error?: string;
};

/**
 * Post one paid order to QBO as a Sales Receipt (idempotent, fail-safe). Disabled/unconfigured → a
 * logged "skipped". Already-synced → returns the existing doc id without re-posting. Any failure is
 * caught, recorded on the queue row (status + last_error + attempts), and returned — never thrown.
 */
export async function syncOrderToQbo(orderId: string): Promise<QboSyncResult> {
  const db = serviceClient();
  const cfg = qboConfig();
  if (!cfg) {
    await markQueue(db, orderId, { status: "skipped" });
    return { status: "skipped" };
  }
  // Idempotency: never create a second Sales Receipt for an order.
  const { data: existing } = await db
    .from("qbo_sync_queue")
    .select("status,qbo_doc_id")
    .eq("order_id", orderId)
    .maybeSingle();
  if (existing?.status === "synced" && existing.qbo_doc_id)
    return { status: "synced", docId: existing.qbo_doc_id };

  try {
    const { order, items } = await loadOrder(db, orderId);
    const receipt = buildSalesReceipt(order, items, cfg.refs); // throws if it doesn't balance
    const token = await accessToken(cfg);
    // `requestid` makes the create idempotent on QBO's side: a retry after a lost/timed-out response
    // (the POST may have committed) returns the SAME receipt instead of a duplicate. The order id is a
    // stable per-order token (≤ 50 chars).
    const res = await fetch(
      `${cfg.baseUrl}/v3/company/${cfg.realmId}/salesreceipt?minorversion=73&requestid=${orderId}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(receipt),
      },
    );
    if (!res.ok)
      throw new Error(`QBO salesreceipt ${res.status}: ${(await res.text()).slice(0, 400)}`);
    const j = (await res.json()) as { SalesReceipt?: { Id?: string; TotalAmt?: number } };
    const docId = j.SalesReceipt?.Id ?? null;
    // Trust-but-verify: buildSalesReceipt proved OUR Σ(lines) is consistent, but confirm QBO totaled the
    // receipt the SAME as the Stripe charge — if it didn't (a line interpreted differently, AST partly
    // engaging despite NotApplicable), the clearing account would silently drift. A mismatch is an error
    // (flag for review), not a 'synced'; the requestid above means a re-run won't double-post.
    const qboTotal = j.SalesReceipt?.TotalAmt;
    if (typeof qboTotal === "number" && Math.round(qboTotal * 100) !== order.totalCents)
      throw new Error(
        `QBO TotalAmt ${qboTotal} ≠ order total ${order.totalCents}¢ (doc ${docId ?? "?"})`,
      );
    await markQueue(db, orderId, { status: "synced", qbo_doc_id: docId, bumpAttempt: true });
    return { status: "synced", docId: docId ?? undefined };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[qbo] sync failed", { orderId, error: msg });
    await markQueue(db, orderId, {
      status: "error",
      last_error: msg.slice(0, 400),
      bumpAttempt: true,
    });
    return { status: "error", error: msg };
  }
}

/** Drain pending/errored syncs — for an on-demand admin call or a cron (wiring deferred). */
export async function processPendingQboSyncs(limit = 20): Promise<{ processed: number }> {
  const db = serviceClient();
  const { data: rows } = await db
    .from("qbo_sync_queue")
    .select("order_id")
    .in("status", ["pending", "error"])
    .order("created_at")
    .limit(limit);
  let processed = 0;
  for (const r of rows ?? []) {
    await syncOrderToQbo(r.order_id);
    processed++;
  }
  return { processed };
}
