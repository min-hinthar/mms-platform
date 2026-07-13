"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { serviceClient } from "@mms/db/server";
import { clearTableInput, mergeTablesInput } from "@mms/db/schemas";
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
  MergeCandidate,
  MergeResult,
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
    .select("id,qr_code,table_number,mode,host_seat,created_at")
    .eq("status", "active")
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: true })
    .limit(ACTIVE_SESSION_CAP);

  const sessionIds = (sessions ?? []).map((s) => s.id);
  if (sessionIds.length === 0) return { tables: [], serverNow: nowIso };

  // Members (party size + host name), open carts, paid orders, and the tab policy (the silent ceiling) for
  // exactly these sessions. One singleton config read on the floor refresh (cached well enough; tiny row).
  const [{ data: members }, { data: carts }, { data: orders }, { data: tabConfig }] =
    await Promise.all([
      db
        .from("session_members")
        .select("session_id,seat_id,display_name,role")
        .in("session_id", sessionIds),
      db
        .from("qr_carts")
        .select("id,session_id,locked,locked_at,settle_at,created_at,tab_type")
        .in("session_id", sessionIds)
        .eq("status", "open"),
      db
        .from("qr_orders")
        .select("session_id,total_cents,created_at")
        .in("session_id", sessionIds)
        .eq("status", "paid"),
      db.from("mms_tab_config").select("ceiling_cents").maybeSingle(),
    ]);
  const ceilingCents = tabConfig?.ceiling_cents ?? 40000;

  const cartRows = carts ?? [];
  const cartIds = cartRows.map((c) => c.id);
  // Lines for the open carts → aggregate count + running subtotal + latest line time per cart in TS.
  // `created_at` is the activity signal (NOT qr_carts.updated_at — nothing bumps it; the cart RPCs
  // don't write it, so it's stuck at cart creation): the most recent line add is "last activity".
  const { data: lines } = cartIds.length
    ? await db
        .from("qr_cart_items")
        .select("cart_id,qty,unit_price_cents,created_at,state,comped")
        .in("cart_id", cartIds)
    : {
        data: [] as {
          cart_id: string;
          qty: number;
          unit_price_cents: number;
          created_at: string;
          state: string;
          comped: boolean;
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
    // S2-audit S2: count/subtotal reflect the CHARGEABLE base — a voided/comped line still bumps
    // last-activity but isn't part of the "so far" total (parity with getTableDetail + the settle).
    if (l.state !== "voided" && !l.comped) {
      a.count += l.qty;
      a.subtotal += Number(l.unit_price_cents) * l.qty;
    }
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
    const tab = (cart?.tab_type ?? "none") as FloorTable["tab"];
    return {
      sessionId: s.id,
      label: s.qr_code,
      tableNumber: s.table_number,
      mode: s.mode as FloorTable["mode"],
      status: deriveStatus(cart, agg.count, paid != null),
      partySize: party.length,
      hostName: party.find((m) => m.host || m.seat === s.host_seat)?.name ?? null,
      itemCount: agg.count,
      runningSubtotalCents: agg.subtotal,
      paidTotalCents: paid?.total ?? null,
      tab,
      // T11: flag only a TRUST tab over the ceiling (a secure tab is card-backed). A flag, never an action.
      tabOverCeiling: tab === "trust" && agg.subtotal >= ceilingCents,
      lastActivityAt: lastActivity,
    };
  });

  // K2: sort by the real table number first (registered tables 1→10 in order), unregistered/legacy
  // stickers after, tie-broken by the label so the ordering is stable.
  tables.sort((a, b) => {
    if (a.tableNumber != null && b.tableNumber != null) return a.tableNumber - b.tableNumber;
    if (a.tableNumber != null) return -1;
    if (b.tableNumber != null) return 1;
    return a.label.localeCompare(b.label, undefined, { numeric: true });
  });
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
    .select("id,qr_code,table_number,mode,status,host_seat,created_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session || session.status === "closed") return null;

  const [{ data: members }, { data: cart }, { data: paid }, { data: tabConfig }] =
    await Promise.all([
      db.from("session_members").select("seat_id,display_name,role").eq("session_id", sessionId),
      db
        .from("qr_carts")
        .select("id,locked,locked_at,settle_at,tab_type,tab_opened_at")
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
      db
        .from("mms_tab_config")
        .select("ceiling_cents,nudge_party_size,nudge_tab_age_min")
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
      .select("id,name,qty,unit_price_cents,by_seat,created_at,menu_item_id,state,comped")
      .eq("cart_id", cart.id)
      .order("created_at", { ascending: true });
    // Resolve which lines are 86'd so the editor can hide the "+" (S1-audit S4). One extra read on the
    // (non-hot) detail path. `menu_item_id` is a SOFT text ref — a UUID for restaurant lines but a
    // BARCODE for grocery (scan-go) — so filter to UUIDs before the `.in()` against the uuid `id`
    // column (a barcode poisons the whole query → uuid cast error); mirrors lib/cart.ts. A non-UUID
    // (barcode/legacy/null) line is never sold-out here.
    const uuidRe = /^[0-9a-f-]{36}$/i;
    const menuIds = [
      ...new Set(
        (items ?? []).map((i) => i.menu_item_id).filter((x): x is string => uuidRe.test(x ?? "")),
      ),
    ];
    const soldOutIds = new Set<string>();
    if (menuIds.length) {
      // Deliberate: an `{ error }` here is advisory — degrade to not-sold-out rather than fail the view.
      const { data: mi } = await db.from("menu_items").select("id,is_sold_out").in("id", menuIds);
      for (const m of mi ?? []) if (m.is_sold_out) soldOutIds.add(m.id);
    }
    // Lines with an OPEN approval request (S2.4) — so the editor shows "approval requested" instead of a
    // second Void/Comp button. One bounded read on the (non-hot) detail path.
    const pendingLineIds = new Set<string>();
    {
      const { data: pend } = await db
        .from("mms_approvals")
        .select("line_id")
        .eq("cart_id", cart.id)
        .eq("status", "pending");
      for (const p of pend ?? []) if (p.line_id) pendingLineIds.add(p.line_id);
    }
    lines = (items ?? []).map((i) => ({
      id: i.id,
      name: i.name,
      qty: i.qty,
      unitPriceCents: i.unit_price_cents,
      bySeatName: i.by_seat ? (nameBySeat.get(i.by_seat) ?? null) : null,
      soldOut: i.menu_item_id ? soldOutIds.has(i.menu_item_id) : false,
      state: (i.state ?? "draft") as TableLineView["state"],
      comped: i.comped ?? false,
      pendingApproval: pendingLineIds.has(i.id),
    }));
    // Count + running subtotal reflect what's CHARGEABLE — a voided/comped line shows on the drill-down
    // (as a removed/comped row) but isn't part of the "so far" total or the settle amount.
    const chargeable = lines.filter((l) => l.state !== "voided" && !l.comped);
    itemCount = chargeable.reduce((a, l) => a + l.qty, 0);
    runningSubtotalCents = chargeable.reduce((a, l) => a + l.unitPriceCents * l.qty, 0);
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

  // Server-discretion gating (S3.3). Config-driven, never per-customer judgment (T12); a FLAG/HINT only,
  // never an auto-convert or auto-charge (T11).
  const tab = (cart?.tab_type ?? "none") as TableDetail["tab"];
  const ceilingCents = tabConfig?.ceiling_cents ?? 40000;
  const nudgePartySize = tabConfig?.nudge_party_size ?? 10;
  const nudgeTabAgeMin = tabConfig?.nudge_tab_age_min ?? 90;
  const tabOverCeiling = tab === "trust" && runningSubtotalCents >= ceilingCents;
  // Nudge to secure only while there's a live order and the tab isn't already secure. Party-size applies
  // to a none/trust table (suggest opening/converting to secure); tab-age applies once a tab is open.
  let nudgeSecure: TableDetail["nudgeSecure"] = null;
  if (cart && tab !== "secure") {
    const tabAgeMs = cart.tab_opened_at ? Date.now() - new Date(cart.tab_opened_at).getTime() : 0;
    if (memberViews.length >= nudgePartySize) nudgeSecure = "party";
    else if (tab !== "none" && cart.tab_opened_at && tabAgeMs >= nudgeTabAgeMin * 60_000)
      nudgeSecure = "age";
  }

  return {
    sessionId: session.id,
    cartId: cart?.id ?? null,
    label: session.qr_code,
    tableNumber: session.table_number,
    mode: session.mode as TableDetail["mode"],
    status: deriveStatus(cart ?? null, itemCount, paid != null),
    members: memberViews,
    lines,
    itemCount,
    runningSubtotalCents,
    settleTotalCents,
    paidTotalCents: paid?.total_cents ?? null,
    // Tab lifecycle (S3.1) — only meaningful while a cart is open; a settled/absent cart reads 'none'.
    tab,
    tabOpenedAt: cart?.tab_opened_at ?? null,
    ceilingCents,
    tabOverCeiling,
    nudgeSecure,
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

/** Resolve a session's mode/status + its open cart's pay-state in two reads (shared by the merge path).
 *  Returns nulls when the session is missing/closed or has no open cart. */
async function resolveOpenCart(db: ReturnType<typeof serviceClient>, sessionId: string) {
  const { data: session } = await db
    .from("table_sessions")
    .select("id,status,mode")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session || session.status === "closed") return { session: null, cart: null };
  const { data: cart } = await db
    .from("qr_carts")
    .select("id,locked,locked_at,settle_at,promo_code")
    .eq("session_id", sessionId)
    .eq("status", "open")
    .maybeSingle();
  return { session, cart };
}

/**
 * Candidate tables the SOURCE table can be merged INTO (S1.4 soft convergence). The system can't
 * auto-detect that two labels are the same physical table (the sticker qr_code is the only identity and
 * it's unique per active session), so convergence is an EXPLICIT staff tool over a legible candidate list,
 * not a fabricated divergence alarm. A valid target: another ACTIVE, non-expired session of the SAME mode
 * (a cross-mode merge would carry the wrong per-line tax basis — dine-in vs to-go), with an OPEN cart, not
 * mid-payment (a target being paid can't safely receive lines). Sorted by label for a fast scan.
 */
export async function getMergeCandidates(sourceSessionId: string): Promise<MergeCandidate[]> {
  await requireStaff();
  if (!UUID_RE.test(sourceSessionId)) return [];
  const db = serviceClient();
  const nowIso = new Date().toISOString();

  const { data: source } = await db
    .from("table_sessions")
    .select("mode,status")
    .eq("id", sourceSessionId)
    .maybeSingle();
  if (!source || source.status !== "active") return [];

  const { data: sessions } = await db
    .from("table_sessions")
    .select("id,qr_code,table_number,mode")
    .eq("status", "active")
    .eq("mode", source.mode)
    .gt("expires_at", nowIso)
    .neq("id", sourceSessionId)
    .limit(ACTIVE_SESSION_CAP);
  const sessionIds = (sessions ?? []).map((s) => s.id);
  if (sessionIds.length === 0) return [];

  const [{ data: carts }, { data: members }] = await Promise.all([
    db
      .from("qr_carts")
      .select("id,session_id,locked,locked_at,settle_at,tab_type")
      .in("session_id", sessionIds)
      .eq("status", "open"),
    db.from("session_members").select("session_id").in("session_id", sessionIds),
  ]);
  const cartBySession = new Map((carts ?? []).map((c) => [c.session_id, c]));
  const cartIds = (carts ?? []).map((c) => c.id);
  const { data: lines } = cartIds.length
    ? await db.from("qr_cart_items").select("cart_id,qty").in("cart_id", cartIds)
    : { data: [] as { cart_id: string; qty: number }[] };
  const qtyByCart = new Map<string, number>();
  for (const l of lines ?? []) qtyByCart.set(l.cart_id, (qtyByCart.get(l.cart_id) ?? 0) + l.qty);
  const partyBySession = new Map<string, number>();
  for (const m of members ?? [])
    partyBySession.set(m.session_id, (partyBySession.get(m.session_id) ?? 0) + 1);

  const candidates: MergeCandidate[] = [];
  for (const s of sessions ?? []) {
    const cart = cartBySession.get(s.id);
    if (!cart) continue; // a target needs an open cart to receive lines
    // Don't offer a SECURE target — a secured tab can't be merged (S3.2; the card-on-file sidecar can't
    // follow the fold). The SQL refuses it regardless; this keeps it off the picker.
    if (cart.tab_type === "secure") continue;
    // Don't offer a target that's mid-payment — folding lines into a cart being paid would change a
    // total under the payer (the merge RPC also row-locks + requires 'open', this is the affordance).
    if (await paymentInFlightReason(cart)) continue;
    candidates.push({
      sessionId: s.id,
      label: s.qr_code,
      tableNumber: s.table_number,
      mode: s.mode as MergeCandidate["mode"],
      itemCount: qtyByCart.get(cart.id) ?? 0,
      partySize: partyBySession.get(s.id) ?? 0,
    });
  }
  candidates.sort((a, b) => {
    if (a.tableNumber != null && b.tableNumber != null) return a.tableNumber - b.tableNumber;
    if (a.tableNumber != null) return -1;
    if (b.tableNumber != null) return 1;
    return a.label.localeCompare(b.label, undefined, { numeric: true });
  });
  return candidates;
}

/**
 * One-tap merge of two table orders (S1.4) — the recovery for a double-order (a guest scans AND tells the
 * server). Folds the SOURCE table's open cart into the TARGET, then closes the source. Any active staff may
 * merge (a non-loss turnover cleanup, like clear-table — NOT a money-out action, so no manager-PIN; S2's
 * step-up is reserved for voids/comps/refunds); logged non-PII for the audit. Refused when either side is
 * closed, lacks an open cart, is a different mode (tax-basis safety), or is mid-payment. The actual move is
 * the atomic, row-locked mms_merge_table_orders (re-parents server-priced lines — never recomputes a price).
 */
export async function mergeTables(raw: unknown): Promise<MergeResult> {
  const caller = await requireStaff().catch(() => null);
  if (!caller) return { ok: false, error: "Staff sign-in required." };

  const parsed = mergeTablesInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { sourceSessionId, targetSessionId } = parsed.data;
  if (sourceSessionId === targetSessionId)
    return { ok: false, error: "Pick a different table to merge into." };

  const db = serviceClient();
  const [src, tgt] = await Promise.all([
    resolveOpenCart(db, sourceSessionId),
    resolveOpenCart(db, targetSessionId),
  ]);
  if (!src.session) return { ok: false, error: "That table is already cleared." };
  if (!tgt.session) return { ok: false, error: "The table you picked is no longer open." };
  if (!src.cart) return { ok: false, error: "This table has no open order to merge." };
  if (!tgt.cart) return { ok: false, error: "The table you picked has no open order." };
  if (src.session.mode !== tgt.session.mode)
    return { ok: false, error: "Only tables of the same kind can be merged." };

  // A promo code lives on the CART (qr_carts.promo_code), and the discount/tax are re-derived per cart at
  // settle (lib/totals.ts → mms_promo_discount). Merging moves the lines but can't carry a promo cleanly
  // (the source code is tied to the closing session + its per-session redemption cap; recomputing the
  // target's discount off the larger subtotal silently swings the charge either way). So refuse when EITHER
  // side has a promo — staff removes it, then merges — rather than silently change what a guest pays.
  if (src.cart.promo_code || tgt.cart.promo_code)
    return {
      ok: false,
      error: "One of these tables has a promo code applied — remove it before merging.",
    };

  // Refuse if money is moving on EITHER side (shared mutex — lib/pay-guard.ts).
  const [srcFlight, tgtFlight] = await Promise.all([
    paymentInFlightReason(src.cart),
    paymentInFlightReason(tgt.cart),
  ]);
  if (srcFlight || tgtFlight)
    return { ok: false, error: "One of these tables is mid-payment — finish that first." };

  const { data: movedCount, error } = await db.rpc("mms_merge_table_orders", {
    p_source_cart: src.cart.id,
    p_target_cart: tgt.cart.id,
  });
  if (error || movedCount == null) {
    console.error("[floor] mms_merge_table_orders failed", {
      sourceSessionId,
      targetSessionId,
      message: error?.message,
    });
    // A secured tab can't be folded (S3.2 — its card-on-file sidecar can't follow a cancelled cart). The
    // SQL raises on it as the backstop; surface a clear, actionable message rather than the generic race one.
    if (error?.message?.includes("secured tab"))
      return {
        ok: false,
        error: "A secured tab can’t be merged — close it on the card on file first.",
      };
    // Otherwise a raise means a cart flipped out of 'open' under the merge (a race with settle/clear).
    return { ok: false, error: "Couldn’t merge — a table changed. Check both and try again." };
  }

  // Logged (non-PII): who (role) merged which two tables and how many units moved. Best-effort via
  // after() — an analytics outage must never fail a completed merge. Durable two-party audit = S2.
  if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    after(async () => {
      try {
        const ph = getPostHogClient();
        ph.capture({
          distinctId: `staff:${caller.staffId}`,
          event: "staff_merge_tables",
          properties: {
            role: caller.role,
            mode: src.session.mode,
            movedCount,
            sourceSessionId,
            targetSessionId,
          },
        });
        await ph.flush();
      } catch {
        /* analytics best-effort — never fail the merge on a capture error */
      }
    });
  }

  revalidatePath("/staff");
  revalidatePath(`/staff/table/${sourceSessionId}`);
  revalidatePath(`/staff/table/${targetSessionId}`);
  return { ok: true, movedCount, targetSessionId };
}
