"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { serviceClient } from "@mms/db/server";
import { clearTableInput } from "@mms/db/schemas";
import { requireStaff } from "./staff";
import { CART_LOCK_TTL_MS, SETTLE_TTL_MS } from "./lock";
import { isFresh, paymentInFlightReason } from "./pay-guard";
import { getCartTotals } from "./totals";
import { getPostHogClient } from "./posthog-server";
import type {
  ClearTableResult,
  FloorSnapshot,
  FloorStatus,
  FloorTable,
  TableDetail,
  TableLineView,
  TableMemberView,
} from "./floor-types";

/**
 * Staff floor view (S1.2). Read-only, cross-table state for a server's device + a turnover "clear
 * table". Server Actions are public POSTs (IDOR by default), so EVERY export re-checks requireStaff()
 * and reads via the service-role client (the authorization decision is ours, not RLS-hidden) — the
 * client UI is the affordance, never the gate. The floor is intentionally cross-session (a server sees
 * the whole room); that's exactly why the staff gate lives here and not on RLS rows.
 *
 * Totals: the per-table "running" figure is the open cart's PRE-TAX subtotal (sum unit×qty) — an honest
 * "so far" glance, NOT a charge. The authoritative total/tax is derived at checkout (lib/totals.ts); we
 * deliberately don't re-run that per table on the realtime hot path (N tax RPCs) nor mirror the tax rule
 * here (SQL/TS drift). A SETTLED order shows its authoritative qr_orders.total_cents.
 */

const ACTIVE_SESSION_CAP = 200; // a teahouse has a handful of live tables; bound the query regardless.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function deriveStatus(
  cart: { locked: boolean; locked_at: string | null; settle_at: string | null } | null,
  itemCount: number,
  hasPaidOrder: boolean,
): FloorStatus {
  if (cart) {
    if (isFresh(cart.settle_at, SETTLE_TTL_MS)) return "settling";
    if (cart.locked && isFresh(cart.locked_at, CART_LOCK_TTL_MS)) return "paying";
    if (itemCount > 0) return "ordering";
  }
  if (hasPaidOrder) return "paid";
  return "seated";
}

const laterIso = (a: string, b: string | null | undefined): string =>
  b && new Date(b).getTime() > new Date(a).getTime() ? b : a;

/**
 * Snapshot of every LIVE table (status='active' AND not past its TTL — a still-'active' but expired
 * session is a ghost the sweeper hasn't closed yet, so exclude it the same way is_member does). Five
 * bounded queries (sessions → members → open carts → cart lines → paid orders), aggregated in TS — a
 * fixed round-trip count regardless of table count. Sorted by table label (numeric-aware) so a server
 * can find a specific table fast; the status chip carries the "what's happening" scan.
 */
export async function getFloorView(): Promise<FloorSnapshot> {
  await requireStaff();
  const db = serviceClient();
  const nowIso = new Date().toISOString();

  const { data: sessions } = await db
    .from("table_sessions")
    .select("id,qr_code,mode,host_seat,created_at")
    .eq("status", "active")
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: true })
    .limit(ACTIVE_SESSION_CAP);

  const sessionIds = (sessions ?? []).map((s) => s.id);
  if (sessionIds.length === 0) return { tables: [], serverNow: nowIso };

  // Members (party size + host name), open carts, and paid orders for exactly these sessions.
  const [{ data: members }, { data: carts }, { data: orders }] = await Promise.all([
    db
      .from("session_members")
      .select("session_id,seat_id,display_name,role")
      .in("session_id", sessionIds),
    db
      .from("qr_carts")
      .select("id,session_id,locked,locked_at,settle_at,created_at")
      .in("session_id", sessionIds)
      .eq("status", "open"),
    db
      .from("qr_orders")
      .select("session_id,total_cents,created_at")
      .in("session_id", sessionIds)
      .eq("status", "paid"),
  ]);

  const cartRows = carts ?? [];
  const cartIds = cartRows.map((c) => c.id);
  // Lines for the open carts → aggregate count + running subtotal + latest line time per cart in TS.
  // `created_at` is the activity signal (NOT qr_carts.updated_at — nothing bumps it; the cart RPCs
  // don't write it, so it's stuck at cart creation): the most recent line add is "last activity".
  const { data: lines } = cartIds.length
    ? await db
        .from("qr_cart_items")
        .select("cart_id,qty,unit_price_cents,created_at")
        .in("cart_id", cartIds)
    : {
        data: [] as {
          cart_id: string;
          qty: number;
          unit_price_cents: number;
          created_at: string;
        }[],
      };

  // Index by session for O(1) assembly.
  const cartBySession = new Map(cartRows.map((c) => [c.session_id, c]));
  const aggByCart = new Map<
    string,
    { count: number; subtotal: number; lastLineAt: string | null }
  >();
  for (const l of lines ?? []) {
    const a = aggByCart.get(l.cart_id) ?? { count: 0, subtotal: 0, lastLineAt: null };
    a.count += l.qty;
    a.subtotal += Number(l.unit_price_cents) * l.qty;
    a.lastLineAt = laterIso(a.lastLineAt ?? l.created_at, l.created_at);
    aggByCart.set(l.cart_id, a);
  }
  const membersBySession = new Map<string, { name: string; seat: string; host: boolean }[]>();
  for (const m of members ?? []) {
    const arr = membersBySession.get(m.session_id) ?? [];
    arr.push({ name: m.display_name, seat: m.seat_id, host: m.role === "host" });
    membersBySession.set(m.session_id, arr);
  }
  const paidBySession = new Map<string, { total: number; latest: string }>();
  for (const o of orders ?? []) {
    if (!o.session_id) continue; // qr_orders.session_id is nullable in the schema; the .in() filter
    const cur = paidBySession.get(o.session_id); // already scopes these, but narrow for the type
    if (!cur || new Date(o.created_at).getTime() > new Date(cur.latest).getTime())
      paidBySession.set(o.session_id, { total: o.total_cents, latest: o.created_at });
  }

  const tables: FloorTable[] = (sessions ?? []).map((s) => {
    const cart = cartBySession.get(s.id) ?? null;
    const empty = { count: 0, subtotal: 0, lastLineAt: null as string | null };
    const agg = cart ? (aggByCart.get(cart.id) ?? empty) : empty;
    const party = membersBySession.get(s.id) ?? [];
    const paid = paidBySession.get(s.id) ?? null;
    let lastActivity = laterIso(s.created_at ?? nowIso, agg.lastLineAt);
    if (paid) lastActivity = laterIso(lastActivity, paid.latest);
    return {
      sessionId: s.id,
      label: s.qr_code,
      mode: s.mode as FloorTable["mode"],
      status: deriveStatus(cart, agg.count, paid != null),
      partySize: party.length,
      hostName: party.find((m) => m.host || m.seat === s.host_seat)?.name ?? null,
      itemCount: agg.count,
      runningSubtotalCents: agg.subtotal,
      paidTotalCents: paid?.total ?? null,
      lastActivityAt: lastActivity,
    };
  });

  tables.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  return { tables, serverNow: nowIso };
}

/**
 * Read-only drill-down for ONE table: party, the actual cart lines (what they've ordered, with split
 * attribution), running subtotal, any paid total, and whether a payment is in flight (which gates
 * clear-table). Returns null when the session doesn't exist or is already closed (a cleared table) —
 * the detail page renders an honest "this table is closed" rather than a stale snapshot.
 */
export async function getTableDetail(sessionId: string): Promise<TableDetail | null> {
  await requireStaff();
  // Bound the input at the trust boundary (parity with clearTable's Zod parse) — a malformed id is a
  // not-found, never a swallowed Postgres cast error.
  if (!UUID_RE.test(sessionId)) return null;
  const db = serviceClient();
  const nowIso = new Date().toISOString();

  const { data: session } = await db
    .from("table_sessions")
    .select("id,qr_code,mode,status,host_seat,created_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session || session.status === "closed") return null;

  const [{ data: members }, { data: cart }, { data: paid }] = await Promise.all([
    db.from("session_members").select("seat_id,display_name,role").eq("session_id", sessionId),
    db
      .from("qr_carts")
      .select("id,locked,locked_at,settle_at")
      .eq("session_id", sessionId)
      .eq("status", "open")
      .maybeSingle(),
    db
      .from("qr_orders")
      .select("total_cents,created_at")
      .eq("session_id", sessionId)
      .eq("status", "paid")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const nameBySeat = new Map((members ?? []).map((m) => [m.seat_id, m.display_name]));
  const memberViews: TableMemberView[] = (members ?? []).map((m) => ({
    seatId: m.seat_id,
    name: m.display_name,
    isHost: m.role === "host" || m.seat_id === session.host_seat,
  }));

  let lines: TableLineView[] = [];
  let itemCount = 0;
  let runningSubtotalCents = 0;
  let lastLineAt: string | null = null;
  if (cart) {
    const { data: items } = await db
      .from("qr_cart_items")
      .select("id,name,qty,unit_price_cents,by_seat,created_at")
      .eq("cart_id", cart.id)
      .order("created_at", { ascending: true });
    lines = (items ?? []).map((i) => ({
      id: i.id,
      name: i.name,
      qty: i.qty,
      unitPriceCents: i.unit_price_cents,
      bySeatName: i.by_seat ? (nameBySeat.get(i.by_seat) ?? null) : null,
    }));
    itemCount = lines.reduce((a, l) => a + l.qty, 0);
    runningSubtotalCents = lines.reduce((a, l) => a + l.unitPriceCents * l.qty, 0);
    // Latest line add = last activity (items are sorted ascending; qr_carts.updated_at isn't bumped).
    lastLineAt = items && items.length ? (items[items.length - 1]?.created_at ?? null) : null;
  }

  const paymentInFlight =
    !!cart &&
    (isFresh(cart.settle_at, SETTLE_TTL_MS) ||
      (cart.locked && isFresh(cart.locked_at, CART_LOCK_TTL_MS)));
  // The authoritative all-in cash total (the single tax engine), so the Settle button shows the real
  // charge. Only when there's an open cart with items — one extra read on the (non-hot) detail path.
  const settleTotalCents =
    cart && itemCount > 0 ? (await getCartTotals(cart.id, 0)).totalCents : null;
  let lastActivityAt = laterIso(session.created_at ?? nowIso, lastLineAt);
  if (paid) lastActivityAt = laterIso(lastActivityAt, paid.created_at);

  return {
    sessionId: session.id,
    cartId: cart?.id ?? null,
    label: session.qr_code,
    mode: session.mode as TableDetail["mode"],
    status: deriveStatus(cart ?? null, itemCount, paid != null),
    members: memberViews,
    lines,
    itemCount,
    runningSubtotalCents,
    settleTotalCents,
    paidTotalCents: paid?.total_cents ?? null,
    lastActivityAt,
    paymentInFlight,
    serverNow: nowIso,
  };
}

/**
 * Clear a table on turnover (ORDER-MODEL "clear table" — so a ghost cart never carries to the next
 * party). Closes the session (status='closed' → is_member goes false, locking diners out) and cancels
 * its open cart (status='cancelled' → the existing mutation/pay guards reject it). REFUSES while a
 * payment is in flight (a fresh single-pay lock or a split freeze), so a server can't yank a table out
 * from under a diner mid-checkout. Any active staff may clear (routine turnover, not a loss action — no
 * PIN, unlike an S2 void); it's logged (non-PII) for the turnover audit. The durable two-party audit
 * table arrives with S2's approvals primitive.
 */
export async function clearTable(raw: unknown): Promise<ClearTableResult> {
  const caller = await requireStaff().catch(() => null);
  if (!caller) return { ok: false, error: "Staff sign-in required." };

  const parsed = clearTableInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { sessionId } = parsed.data;

  const db = serviceClient();
  const { data: session } = await db
    .from("table_sessions")
    .select("id,status,mode")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) return { ok: false, error: "No such table." };
  if (session.status === "closed") return { ok: false, error: "That table is already cleared." };

  const { data: cart } = await db
    .from("qr_carts")
    .select("id,locked,locked_at,settle_at")
    .eq("session_id", sessionId)
    .eq("status", "open")
    .maybeSingle();

  // Don't clear a table while money is moving (shared mutex with cash settle — lib/pay-guard.ts):
  // cancelling the cart out from under a live single-pay lock / split freeze / captured share would
  // strand a charge with no order. The TTLs auto-release an abandoned hold, so this only blocks an
  // ACTIVE payment; the captured-share branch closes the abandoned-but-captured window explicitly.
  const inFlight = await paymentInFlightReason(cart);
  if (inFlight === "mid_payment")
    return { ok: false, error: "This table is mid-payment — clear it once they’ve finished." };
  if (inFlight === "split_in_progress")
    return { ok: false, error: "This table has a split payment in progress — settle it first." };

  // Cancel the open cart FIRST, then close the session: each is a status flip the diner-side guards
  // already honor (a cancelled cart + a closed session both fail is_member / the mutation guards), so a
  // racing diner write lands on a closed door rather than a half-cleared table.
  let hadItems = false;
  if (cart) {
    const { count } = await db
      .from("qr_cart_items")
      .select("id", { count: "exact", head: true })
      .eq("cart_id", cart.id);
    hadItems = (count ?? 0) > 0;
    const { error: cartErr } = await db
      .from("qr_carts")
      .update({ status: "cancelled" })
      .eq("id", cart.id)
      .eq("status", "open");
    if (cartErr) return { ok: false, error: "Couldn’t clear that table. Try again." };
  }
  const { error: sessErr } = await db
    .from("table_sessions")
    .update({ status: "closed" })
    .eq("id", sessionId)
    .neq("status", "closed");
  if (sessErr) return { ok: false, error: "Couldn’t clear that table. Try again." };

  // Logged (non-PII): who (role, not name) cleared which table, whether it had a live cart. Best-effort
  // and decoupled — an analytics outage must never fail a turnover. Durable two-party audit = S2.
  if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    after(async () => {
      try {
        const ph = getPostHogClient();
        ph.capture({
          distinctId: `staff:${caller.staffId}`,
          event: "staff_clear_table",
          properties: { role: caller.role, mode: session.mode, hadItems, sessionId },
        });
        await ph.flush();
      } catch {
        /* analytics best-effort — never fail the clear on a capture error */
      }
    });
  }

  revalidatePath("/staff");
  revalidatePath(`/staff/table/${sessionId}`);
  return { ok: true };
}
