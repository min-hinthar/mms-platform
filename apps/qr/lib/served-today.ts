import type { serviceClient } from "@mms/db/server";
import type { KitchenChannel, ServedLine, ServedRail } from "./kitchen-types";
import { queueEmptiness } from "./queue-window";
import { loadLineNames, type LineNames } from "./line-names";
import { catalogNameMy, pairModifiersMy } from "./ticket-names";

/**
 * A4·1 (K31) — what went OUT today: the served rail beside the KDS queue.
 *
 * A bumped ticket left `/staff/kitchen` forever, and the one screen that listed finished orders was
 * manager-gated, not day-scoped and English-only — so a cook could not answer "what went out on
 * table 6?" without a manager. This is the read-only answer: `state = 'served'` lines bumped since
 * the service day began, newest first, capped, rendered through the same ticket text the live board
 * uses so it is Burmese-first for free. No recall control — `mms_recall_ticket` refuses past two
 * minutes, and the live board's own recall rail already covers that window.
 *
 * ⚠️ The day floor is the CALLER's, derived from `pickup_config.tz` by `dayStartIso` — never
 * `laDayStartIso` (hardcoded LA): the "Avg today" cell on the SAME strip derives its day from that
 * config in SQL (`mms_kds_stats`), and two different "today"s on one screen the moment the owner
 * sets a zone is the defect the verifier named.
 *
 * ADVISORY as a whole: the rail is history, not the pass. A failed read here answers `null` (the
 * board says it could not read what went out) and the live queue is unaffected — freezing a working
 * kitchen over its own history would be the over-blocking direction.
 */
export const SERVED_RAIL_CAP = 40;
/** How long the LIVE queue will wait for the rail before answering without it (see `settleServedRail`). */
export const SERVED_RAIL_BUDGET_MS = 2_500;

const CLOCK = new Map<string, Intl.DateTimeFormat>();
/** "12:42" in the service zone — the zone is validated upstream (`resolveServiceTz`). */
export function clockLabel(iso: string, tz: string): string {
  let f = CLOCK.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      hour: "2-digit",
      minute: "2-digit",
    });
    CLOCK.set(tz, f);
  }
  return f.format(new Date(iso));
}

type Db = ReturnType<typeof serviceClient>;

export type ServedRow = {
  id: string;
  name: string;
  qty: number;
  modifiers: unknown;
  modifier_option_ids: unknown;
  bumped_at: string;
  cart_id: string;
  fulfillment: string | null;
  menu_item_id: string;
};
export type ServedCartRow = { id: string; session_id: string };
export type ServedSessionRow = {
  id: string;
  qr_code: string;
  table_number: number | null;
  mode: string;
};

/**
 * The pure half: rows → rail lines. Newest bump FIRST (the cook is asking about the last thing that
 * left, not the first), the same channel/label/code rules as the live ticket, and a row whose cart or
 * session cannot be resolved is dropped rather than shown with a label it does not have — the live
 * path makes the same call on its orphans.
 */
export function shapeServedLines(
  rows: readonly ServedRow[],
  ctx: {
    cartById: ReadonlyMap<string, ServedCartRow>;
    sessById: ReadonlyMap<string, ServedSessionRow>;
    orderByCart: ReadonlyMap<string, string>;
    names: LineNames;
  },
  tz: string,
): ServedLine[] {
  const out: ServedLine[] = [];
  for (const r of rows) {
    const cart = ctx.cartById.get(r.cart_id);
    const sess = cart ? ctx.sessById.get(cart.session_id) : undefined;
    if (!cart || !sess) continue;
    const channel: KitchenChannel =
      sess.mode === "dinein" ? "dinein" : sess.mode === "pickup" ? "pickup" : "scango";
    const modifiers = Array.isArray(r.modifiers) ? (r.modifiers as string[]) : [];
    const orderId = ctx.orderByCart.get(r.cart_id);
    out.push({
      id: r.id,
      name: r.name,
      nameMy: catalogNameMy(ctx.names.nameMyByRef.get(r.menu_item_id), r.name),
      qty: r.qty,
      modifiers,
      modifiersMy: pairModifiersMy(r.modifier_option_ids, modifiers, ctx.names.optionNameMy),
      bumpedAt: r.bumped_at,
      bumpedAtLabel: clockLabel(r.bumped_at, tz),
      channel,
      label: sess.qr_code,
      tableNumber: channel === "dinein" ? (sess.table_number ?? null) : null,
      shortCode: channel === "dinein" || !orderId ? null : orderId.slice(-6).toUpperCase(),
      fulfillment: (r.fulfillment ?? "dinein") as ServedLine["fulfillment"],
    });
  }
  // Sorted HERE, not trusted from the read: the SQL orders the capped window, but the rule the rail
  // states is "newest first", and a rule stated once is pinned once.
  return out.sort((a, b) => Date.parse(b.bumpedAt) - Date.parse(a.bumpedAt));
}

/**
 * The read: today's served lines and everything needed to label them. `null` on any failed read
 * (logged), never a partial rail — a rail missing its labels would attribute food to no table, and
 * a rail missing rows would tell a cook something did NOT go out.
 */
export async function readServedToday(
  db: Db,
  dayFloorIso: string,
  tz: string,
  cap: number = SERVED_RAIL_CAP,
): Promise<ServedRail | null> {
  const { data: rows, error: rowsError } = await db
    .from("qr_cart_items")
    .select("id,name,qty,modifiers,modifier_option_ids,bumped_at,cart_id,fulfillment,menu_item_id")
    .eq("state", "served")
    .not("bumped_at", "is", null)
    .gte("bumped_at", dayFloorIso)
    .order("bumped_at", { ascending: false })
    .limit(cap);
  if (rowsError) {
    console.error("[kitchen] served rail read failed — the rail says so, the board is unaffected", {
      message: rowsError.message,
    });
    return null;
  }
  // `not null` is in the predicate, so a null here is a row the DB should not have returned —
  // dropped rather than rendered at the epoch.
  const served: ServedRow[] = (rows ?? []).flatMap((r) =>
    r.bumped_at === null ? [] : [{ ...r, bumped_at: r.bumped_at }],
  );
  // A read that came back FULL did not see the whole day — said on the rail, never a heading that
  // reads "today" over a list missing the morning (blind pass on A4·1, CRITICAL 2).
  const truncated = queueEmptiness(served.length, cap) === "cannot-say";
  if (served.length === 0) return { lines: [], truncated };

  // Carts of ANY status: a line that went out on a table cleared without settling still went out.
  const cartIds = [...new Set(served.map((r) => r.cart_id))];
  const { data: carts, error: cartsError } = await db
    .from("qr_carts")
    .select("id,session_id")
    .in("id", cartIds);
  if (cartsError) {
    console.error("[kitchen] served rail cart read failed", { message: cartsError.message });
    return null;
  }
  const cartById = new Map((carts ?? []).map((c) => [c.id, c]));
  const sessionIds = [...new Set([...cartById.values()].map((c) => c.session_id))];
  const [sessRes, orderRes, names] = await Promise.all([
    sessionIds.length
      ? db.from("table_sessions").select("id,qr_code,table_number,mode").in("id", sessionIds)
      : Promise.resolve({ data: [] as ServedSessionRow[], error: null }),
    db.from("qr_orders").select("id,cart_id").in("cart_id", cartIds).eq("status", "paid"),
    loadLineNames(db, served, { tag: "kitchen/served" }),
  ]);
  if (sessRes.error || orderRes.error) {
    console.error("[kitchen] served rail label read failed", {
      message: sessRes.error?.message ?? orderRes.error?.message,
    });
    return null;
  }
  const orderByCart = new Map<string, string>();
  for (const o of orderRes.data ?? []) {
    if (o.cart_id && !orderByCart.has(o.cart_id)) orderByCart.set(o.cart_id, o.id);
  }
  const lines = shapeServedLines(
    served,
    {
      cartById,
      sessById: new Map((sessRes.data ?? []).map((s) => [s.id, s])),
      orderByCart,
      names,
    },
    tz,
  );
  return { lines, truncated };
}

/**
 * Bound the rail's cost to the live queue: the pass is answered when IT is ready, and the rail rides
 * along only if it finished inside the budget — otherwise `null`, which the board renders as
 * "couldn't read what went out", and the late answer is dropped (blind pass on A4·1: the first draft
 * awaited the rail BEFORE the live phase-2 reads, putting three serial history hops in front of the
 * pass on every poll). A rail that rejects is a `null` too, never a rejected queue.
 */
export async function settleServedRail(
  rail: Promise<ServedRail | null>,
  budgetMs: number = SERVED_RAIL_BUDGET_MS,
): Promise<ServedRail | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      console.error(
        "[kitchen] served rail read exceeded its budget — answering the queue without it",
        {
          budgetMs,
        },
      );
      resolve(null);
    }, budgetMs);
  });
  try {
    return await Promise.race([
      rail.catch((e: unknown) => {
        console.error("[kitchen] served rail read rejected — the rail says so", {
          error: e instanceof Error ? e.message : String(e),
        });
        return null;
      }),
      budget,
    ]);
  } finally {
    clearTimeout(timer);
  }
}
