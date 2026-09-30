import type { serviceClient } from "@mms/db/server";

/**
 * A4·2 — the open COUNTER orders, read in ONE place.
 *
 * The register page used to own this read (`getRegisterQueue`, W6a) and the floor deliberately
 * excluded the same sessions (`lib/floor.ts`, the `reg-` / `kiosk-`+pickup filters) so the two
 * lists could not double-count a session. With the register folded into the counter's one screen
 * the floor's own snapshot carries these rows beside the tables — same poll, same outage posture —
 * and this module is the query both callers share, so the predicate cannot drift between them.
 * Plain module (no "use server"): the floor read and the Server Action both import it.
 */
type Db = ReturnType<typeof serviceClient>;

/** The prefix a staff-minted counter session's code carries (`reg-<code>`, W6a). */
export const REG_PREFIX = "reg-";

/**
 * A teahouse has a handful of open counter orders; bound the read regardless. A TRUNCATED page is
 * reported (`truncated`) rather than passed off as the whole queue. The page is read NEWEST first
 * (Phase 2f review M1): a sent-unpaid counter order is exempt from the expiry sweep, so uncollected
 * ones accrue, and an oldest-first cap let them push the order just started off the counter. A
 * saturated read now hides the STALEST orders — and says so.
 *
 * Both reads fetch CAP + 1 (M212's shape, `lib/floor.ts` SETTLED_ORDER_CAP): exactly CAP rows is the
 * whole queue, and only the (CAP+1)th row proves one is hidden — a `rows >= CAP` test said "not
 * listed" over a full page that listed everything. The extra row is the OLDEST (newest-first
 * order), so it is the one dropped.
 */
export const REGISTER_QUEUE_CAP = 40;

/** One open counter order (a register queue row). */
export type RegisterQueueRow = {
  sessionId: string;
  customerName: string | null;
  itemCount: number;
  subtotalCents: number;
  startedAt: string;
  /** W6b: where the order was entered — the card badges kiosk orders. */
  source: "register" | "kiosk";
};

/** Phase 2f — one counter order's line as the floor folds it (every state; `foldFloorKitchen` and
 *  `counterSent` pick what they read). */
export type CounterQueueLine = {
  id: string;
  qty: number;
  state: string;
  fulfillment: string;
  fire_at: string | null;
  bumped_at: string | null;
  comped: boolean;
  by_seat: string | null;
};

export type RegisterQueue =
  | {
      ok: true;
      rows: RegisterQueueRow[];
      truncated: boolean;
      /** Phase 2f — each row's lines, by `sessionId` (the SAME read, no extra round trip). */
      lines: ReadonlyMap<string, CounterQueueLine[]>;
    }
  | { ok: false; reason: "outage" };

/**
 * The open counter orders: `reg-` (staff-minted) and `kiosk-` (self-minted) PICKUP sessions with an
 * open cart, SHOWN oldest first (read newest first under the cap — see `REGISTER_QUEUE_CAP`). OPEN
 * CARTS first (the W6a review's confirmed HIGH): a limit applied to
 * ACTIVE SESSIONS is consumed by settled-but-not-yet-expired ones, hiding genuinely open orders in
 * a rush. The inner join scopes to counter sessions; no `expires_at` filter — an open cart IS the
 * liveness signal (the 11am-phone-order-for-4pm case must stay visible its whole day).
 */
export async function readRegisterQueue(db: Db): Promise<RegisterQueue> {
  const { data: carts, error: cartErr } = await db
    .from("qr_carts")
    .select(
      "id,session_id,customer_name,created_at,qr_cart_items(id,qty,unit_price_cents,state,comped,fulfillment,fire_at,bumped_at,by_seat),table_sessions!inner(qr_code,mode,status)",
    )
    .eq("status", "open")
    .eq("table_sessions.mode", "pickup")
    .eq("table_sessions.status", "active")
    // Counter-style orders: staff-minted (`reg-`, W6a) and kiosk-minted (`kiosk-`, W6b) both pay
    // at this counter — one queue.
    .or(`qr_code.like.${REG_PREFIX}%,qr_code.like.kiosk-%`, { referencedTable: "table_sessions" })
    .order("created_at", { ascending: false })
    .limit(REGISTER_QUEUE_CAP + 1);
  if (cartErr) return { ok: false, reason: "outage" };

  // CAP + 1 read: a (CAP+1)th row proves the page is truncated; keep the CAP NEWEST, dropping the
  // oldest, BEFORE the reverse (after it, the slice would drop the newest).
  const page = carts ?? [];
  const truncated = page.length > REGISTER_QUEUE_CAP;
  // Read newest first (the cap keeps the live orders); shown oldest first, as the counter always was.
  const oldestFirst = [...page.slice(0, REGISTER_QUEUE_CAP)].reverse();
  const rows: RegisterQueueRow[] = oldestFirst.map((cart) => {
    const lines = (cart.qr_cart_items ?? []).filter((l) => l.state !== "voided" && !l.comped);
    return {
      sessionId: cart.session_id,
      source: cart.table_sessions.qr_code.startsWith("kiosk-")
        ? ("kiosk" as const)
        : ("register" as const),
      customerName: cart.customer_name ?? null,
      itemCount: lines.reduce((n, l) => n + l.qty, 0),
      // Display-only running subtotal for the card — the charge is always getCartTotals at settle.
      subtotalCents: lines.reduce((n, l) => n + l.qty * l.unit_price_cents, 0),
      startedAt: cart.created_at,
    };
  });
  const lines = new Map<string, CounterQueueLine[]>(
    oldestFirst.map((cart) => [
      cart.session_id,
      (cart.qr_cart_items ?? []).map((l) => ({
        id: l.id,
        qty: l.qty,
        state: l.state,
        fulfillment: l.fulfillment,
        fire_at: l.fire_at,
        bumped_at: l.bumped_at,
        comped: l.comped,
        by_seat: l.by_seat,
      })),
    ]),
  );
  if (truncated)
    console.warn(
      "[register-queue] counter queue read saturated — the oldest orders are not shown",
      {
        cap: REGISTER_QUEUE_CAP,
      },
    );
  return { ok: true, rows, truncated, lines };
}

// ── Phase 2f · P2v — the lane's unpaid bags ──────────────────────────────────────────────────────

/** One open counter order with food in the kitchen, as the takeaway lane reads it (`expo.ts` shapes
 *  it through `unpaidBag`, which keeps only the lines past their grace). */
export type UnpaidCartRow = {
  id: string;
  session_id: string;
  customer_name: string | null;
  items: {
    id: string;
    name: string;
    qty: number;
    modifiers: unknown;
    modifier_option_ids: unknown;
    fulfillment: string;
    notes: string | null;
    menu_item_id: string;
    state: string;
    fire_at: string | null;
    bumped_at: string | null;
    comped: boolean;
  }[];
};

/**
 * The OPEN `reg-` counter orders that hold a line the kitchen has (fired / in progress / served) —
 * the lane's unpaid bags. The `reg-` predicate lives HERE (the one module that names `REG_PREFIX`),
 * never the kiosk's: a kiosk order is pay-first. `sent:qr_cart_items!inner(id)` filtered to the FULL
 * `counterKitchenLine` definition (sent state · not grocery · past its grace, at `nowIso`, the DB
 * clock — comped or not, because `unpaidBag` bags a comp) makes the cap count CANDIDATE bags only —
 * every row the page holds yields a bag, so a cart of drafts, grocery or in-grace sends never
 * consumes a slot, and a comped-only bag still reaches the lane (Codex r3 on #308); `items`
 * is the unfiltered embed the bag is built from. Read NEWEST first under the cap (review M1: the
 * sweep exempts these, so stale ones accrue); an over-full page (CAP + 1 rows) is `truncated` —
 * the lane keeps its paid bags and says its unpaid list is partial, and what it drops is the
 * stalest bag, never the newest. A page of exactly CAP candidates is whole and says nothing.
 * Plain query; no amount is read.
 */
export async function readUnpaidCounterCarts(
  db: Db,
  nowIso: string,
): Promise<{ ok: true; carts: UnpaidCartRow[]; truncated: boolean } | { ok: false }> {
  // Codex round 1 on #308 (P2) — the capped candidate filter is the bag's membership predicate WHOLE
  // (`counterKitchenLine`), not its state clause alone. A cart holding only grocery or in-grace lines
  // passes a state-only join, consumes a slot, and yields no bag (`unpaidBag` drops it) — forty of
  // them pushed a genuine older bag past the cap. Codex round 3: NO comped filter — a comped dish is
  // in the kitchen and in the bag, so a comped-only cart IS a bag; filtered here it never reached the
  // lane while the KDS cooked it. The grace bound is `lt` one millisecond past the DB clock, which is
  // exactly `Date.parse(fire_at) <= nowMs` (`lineFireMs` reads the column to the millisecond); a
  // null `fire_at` is fired-at-or-before-now (review M2), so it is a candidate.
  const nowMs = Date.parse(nowIso);
  const graceBound = new Date((Number.isFinite(nowMs) ? nowMs : Date.now()) + 1).toISOString();
  const { data, error } = await db
    .from("qr_carts")
    .select(
      "id,session_id,customer_name,created_at,items:qr_cart_items(id,name,qty,modifiers,modifier_option_ids,fulfillment,notes,menu_item_id,state,fire_at,bumped_at,comped),sent:qr_cart_items!inner(id),table_sessions!inner(qr_code,mode,status)",
    )
    .eq("table_sessions.mode", "pickup")
    .eq("table_sessions.status", "active")
    .like("table_sessions.qr_code", `${REG_PREFIX}%`)
    .eq("status", "open")
    .neq("sent.fulfillment", "grocery")
    .or(`fire_at.is.null,fire_at.lt.${graceBound}`, { referencedTable: "sent" })
    .in("sent.state", ["fired", "in_progress", "served"])
    .order("created_at", { ascending: false })
    .limit(REGISTER_QUEUE_CAP + 1);
  if (error) {
    console.error("[register-queue] unpaid counter read failed", { message: error.message });
    return { ok: false };
  }
  // CAP + 1 (see `REGISTER_QUEUE_CAP`): only a (CAP+1)th candidate proves one is hidden; the page is
  // newest first, so the dropped row is the oldest bag.
  const page: UnpaidCartRow[] = data ?? [];
  const truncated = page.length > REGISTER_QUEUE_CAP;
  return { ok: true, carts: page.slice(0, REGISTER_QUEUE_CAP), truncated };
}
