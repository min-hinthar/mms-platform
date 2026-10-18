import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
/**
 * Lifecycle residuals (Theme 5) — Cook now moves the ORDER, not only its lines.
 *
 * `mms_fire_ticket_now` writes only `qr_cart_items.fire_at`, while `qr_orders.fire_at` (snapshotted at
 * fulfil) is what /track's guide, the tray, the pill and the wall read as "has the kitchen got it?".
 * So a held pickup Mom was already cooking read "You’re booked … closer to your time" and "Scheduled"
 * to its guest and stayed off the wall. Two fixes, both falsified by VALUE here:
 *
 *   1. `fireTicketNow` writes the order's stamp to the DB clock, guarded IN the statement (a SETTLED
 *      status — `paid` or `refunded`, #360 — and `fire_at > now`), with the row count read back
 *      (`.select("id")`); and a Cook now on an already-live ticket REPAIRS a stamp whose first write
 *      failed, once no line of the cart is still held (the blind pass on #363);
 *   2. `pickupGuide` treats a bag the kitchen has STARTED (`bagStarted`: Start or Done) as fired even
 *      while the order's stamp is still ahead — the belt for a write that failed.
 *
 * The fake EVALUATES every filter the write chains, so dropping one changes which row moves.
 * verify:slice mutants: `lcr/kitchen/*`, `lcr/pickup-promise/*`, `lcr/order-kitchen/*`.
 */
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("./posthog-server", () => ({
  getPostHogClient: () => ({ capture() {}, flush: () => Promise.resolve() }),
}));
vi.mock("./staff", () => ({
  getStaffAuth: () =>
    Promise.resolve({ kind: "staff", caller: { uid: "u", staffId: "st", role: "server" } }),
  staffGate: () => Promise.resolve({ ok: true, caller: { staffId: "st", role: "server" } }),
  STAFF_SIGNIN_REQUIRED: "signin",
}));
vi.mock("./staff-lock", () => ({ isConsoleLocked: () => Promise.resolve(false) }));

type Row = Record<string, unknown>;
const CART = "11111111-1111-4111-8111-111111111111";
// A 6:20 PM pickup (PDT) booked at noon; the slot's fire time is slot − 12 min. Mom taps Cook now at
// 5:00 PM — an hour and eight minutes early — then Start.
const SLOT = "2026-10-09T01:20:00.000Z"; // 6:20 PM PDT, Oct 8
const HELD_FIRE = "2026-10-09T01:08:00.000Z"; // slot − 12 min
const DB_NOW = "2026-10-09T00:00:00.000Z"; // 5:00 PM PDT — the database clock at the tap
const later = (sec: number) => new Date(Date.parse(DB_NOW) + sec * 1000).toISOString();

let tables: Record<string, Row[]> = {};
let clockFails = false;
let orderWriteFails = false;
let clockThrows = false;
let orderWriteThrows = false;
let heldReadFails = false;

function heldTables(order: Partial<Row> = {}): Record<string, Row[]> {
  return {
    qr_carts: [{ id: CART, status: "paid" }],
    qr_cart_items: [
      { id: "l1", cart_id: CART, state: "fired", fire_at: HELD_FIRE, fulfillment: "togo" },
      { id: "l2", cart_id: CART, state: "fired", fire_at: HELD_FIRE, fulfillment: "togo" },
    ],
    qr_orders: [
      {
        id: "o1",
        cart_id: CART,
        status: "paid",
        togo_status: "preparing",
        fire_at: HELD_FIRE,
        pickup_slot: SLOT,
        created_at: "2026-10-08T19:00:00.000Z",
        ...order,
      },
    ],
  };
}

/** The write chain, evaluated: `.update(patch).eq().eq().gt().select(cols)`, awaited. */
function updateChain(name: string, patch: Row) {
  const filters: ((r: Row) => boolean)[] = [];
  let cols: string | null = null;
  const api: Record<string, unknown> = {
    eq(col: string, v: unknown) {
      filters.push((r) => r[col] === v);
      return api;
    },
    in(col: string, vs: readonly unknown[]) {
      filters.push((r) => vs.includes(r[col]));
      return api;
    },
    // PostgREST's `gt` is SQL's `>`: a NULL never compares greater (an as-soon-as-possible order).
    gt(col: string, v: string) {
      filters.push((r) => r[col] != null && String(r[col]) > v);
      return api;
    },
    select(c: string) {
      cols = c;
      return api;
    },
    then(res: (v: unknown) => unknown) {
      // A rejected `.update()` chain (a socket that hangs up mid-write) — the order write itself.
      if (name === "qr_orders" && orderWriteThrows) throw new Error("write socket hang up");
      if (name === "qr_orders" && orderWriteFails)
        return Promise.resolve({ data: null, error: { message: "boom" } }).then(res);
      const hit = (tables[name] ?? []).filter((r) => filters.every((f) => f(r)));
      for (const r of hit) Object.assign(r, patch);
      const data =
        cols === null
          ? null
          : hit.map((r) => Object.fromEntries(cols!.split(",").map((c) => [c, r[c]])));
      return Promise.resolve({ data, error: null }).then(res);
    },
  };
  return api;
}

/** The repair's held-line read, evaluated: `.select("id").eq().eq().gt().limit(n)`, awaited. */
function selectChain(name: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let cap = Infinity;
  const api: Record<string, unknown> = {
    eq(col: string, v: unknown) {
      filters.push((r) => r[col] === v);
      return api;
    },
    gt(col: string, v: string) {
      filters.push((r) => r[col] != null && String(r[col]) > v);
      return api;
    },
    limit(n: number) {
      cap = n;
      return api;
    },
    then(res: (v: unknown) => unknown) {
      if (heldReadFails)
        return Promise.resolve({ data: null, error: { message: "nope" } }).then(res);
      const hit = (tables[name] ?? []).filter((r) => filters.every((f) => f(r))).slice(0, cap);
      return Promise.resolve({ data: hit.map((r) => ({ id: r.id })), error: null }).then(res);
    },
  };
  return api;
}

vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    rpc(fn: string, args: Row) {
      if (fn === "mms_now" && clockThrows) throw new Error("socket hang up");
      if (fn === "mms_now")
        return Promise.resolve(
          clockFails ? { data: null, error: { message: "boom" } } : { data: DB_NOW, error: null },
        );
      if (fn === "mms_fire_ticket_now") {
        // The SQL's own predicate: a PAID cart's fired lines whose fire time is still ahead.
        const cart = (tables.qr_carts ?? []).find((c) => c.id === args.p_cart);
        let n = 0;
        if (cart?.status === "paid")
          for (const l of tables.qr_cart_items ?? [])
            if (l.cart_id === args.p_cart && l.state === "fired" && String(l.fire_at) > DB_NOW) {
              l.fire_at = DB_NOW;
              n += 1;
            }
        return Promise.resolve({ data: n, error: null });
      }
      throw new Error(`fake: unexpected rpc ${fn}`);
    },
    from(name: string) {
      return {
        update: (patch: Row) => updateChain(name, patch),
        select: () => selectChain(name),
      };
    },
  }),
}));

const { fireTicketNow } = await import("./kitchen");
const { bagKitchen, bagStarted, pickupKitchenLine } = await import("./order-kitchen");
const { isFired, pickupGuide } = await import("./pickup-promise");
const { liveOrderStatusWord } = await import("./live-order");
const { boardOrderLive } = await import("./board-orders");
const { queueFloorIso } = await import("./queue-window");
const { TRACK } = await import("./i18n/track");

const order = () => tables.qr_orders![0]!;
/** The paid cart's lines as the post-order kitchen read hands them to /track (`getOrderKitchen`). */
const kitchenLines = () =>
  tables.qr_cart_items!.map((l) => ({
    id: String(l.id),
    name: "Mohinga",
    qty: 1,
    lineState: l.state as "fired" | "in_progress" | "served",
    fireAt: (l.fire_at as string | null) ?? null,
    bumpedAt: (l.bumped_at as string | null) ?? null,
    fulfillment: "togo" as const,
  }));
const guideInput = (kitchen: ReturnType<typeof bagKitchen>) => ({
  status: String(order().status),
  pickupSlot: SLOT,
  fireAt: (order().fire_at as string | null) ?? null,
  togoStatus: String(order().togo_status),
  arrivedAt: null,
  createdAt: String(order().created_at),
  kitchen,
});

let warn: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  tables = heldTables();
  clockFails = false;
  orderWriteFails = false;
  clockThrows = false;
  orderWriteThrows = false;
  heldReadFails = false;
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  error = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
  error.mockRestore();
});

describe("fireTicketNow — Cook now moves the order's fire time to the DB clock", () => {
  it("THE FIXTURE: a held pickup fired early and Started — /track cooking, the tray Preparing, the wall Preparing", async () => {
    expect(await fireTicketNow({ cartId: CART })).toEqual({ ok: true });
    // The order row moved with its lines, to the DATABASE clock (never the app's).
    expect(order().fire_at).toBe(DB_NOW);
    // Mom taps Start on both dishes.
    for (const l of tables.qr_cart_items!) l.state = "in_progress";
    const nowIso = later(90);
    const nowMs = Date.parse(nowIso);
    const bag = bagKitchen(kitchenLines(), nowIso);
    expect(bag).toBe("cooking");
    // /track: with the kitchen, and #359's "It's cooking now" line under it.
    const g = pickupGuide(guideInput(bag), nowMs);
    expect(g.stage).toBe("cooking");
    expect(g.step).toBe(1);
    expect(pickupKitchenLine(g.stage, bag)).toEqual(TRACK.kitchenCooking);
    // The tray, the pill and /account read the order row through the same word.
    expect(
      liveOrderStatusWord({
        kind: "pickup",
        togoStatus: "preparing",
        hasTogoFood: true,
        fired: isFired((order().fire_at as string | null) ?? null, nowMs),
      }),
    ).toBe("Preparing");
    // The wall publishes it as Preparing (the rule `/api/board` publishes by).
    const row = {
      status: String(order().status),
      togo_status: String(order().togo_status),
      fire_at: (order().fire_at as string | null) ?? null,
      pickup_slot: SLOT,
      created_at: String(order().created_at),
    };
    expect(boardOrderLive(row, nowIso, queueFloorIso(nowIso))).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it("before the fix the same order read booked, Scheduled and off the wall (the defect, pinned)", () => {
    const nowIso = later(90);
    const nowMs = Date.parse(nowIso);
    // The order's stamp still ahead and NO kitchen read: the order row speaks alone.
    expect(pickupGuide(guideInput(null), nowMs).stage).toBe("booked");
    expect(
      liveOrderStatusWord({
        kind: "pickup",
        togoStatus: "preparing",
        hasTogoFood: true,
        fired: isFired(HELD_FIRE, nowMs),
      }),
    ).toBe("Scheduled");
    const row = {
      status: "paid",
      togo_status: "preparing",
      fire_at: HELD_FIRE,
      pickup_slot: SLOT,
      created_at: "2026-10-08T19:00:00.000Z",
    };
    expect(boardOrderLive(row, nowIso, queueFloorIso(nowIso))).toBe(false);
  });

  it("only ever EARLIER: an as-soon-as-possible order's null stamp is left null", async () => {
    // Held lines on a cart whose order carries no stamp (fire_at null = fired at payment). The `>`
    // guard is the only thing standing between it and a stamp it never had.
    tables = heldTables({ fire_at: null });
    expect(await fireTicketNow({ cartId: CART })).toEqual({ ok: true });
    expect(order().fire_at).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      "[kitchen] Cook now fired the lines; no held settled order moved",
      { cartId: CART },
    );
  });

  it("a stamp already reached is never moved LATER", async () => {
    const reached = "2026-10-08T23:50:00.000Z"; // ten minutes before the tap
    tables = heldTables({ fire_at: reached });
    await fireTicketNow({ cartId: CART });
    expect(order().fire_at).toBe(reached);
  });

  it("a card-refunded held bag moves like a cash-refunded one: a refund is a TAG, never a cancel (#360)", async () => {
    // A card refund reaching the total writes `refunded`; an equal cash refund leaves `paid`. Every
    // staff board reads both (`SETTLED_ORDER_STATUSES`), and the wall follows `togo_status` for both.
    tables = heldTables({ status: "refunded" });
    expect(await fireTicketNow({ cartId: CART })).toEqual({ ok: true });
    expect(order().fire_at).toBe(DB_NOW);
    expect(warn).not.toHaveBeenCalled();
  });

  it("an order that never SETTLED is never revived onto the wall", async () => {
    tables = heldTables({ status: "pending" });
    expect(await fireTicketNow({ cartId: CART })).toEqual({ ok: true });
    expect(order().fire_at).toBe(HELD_FIRE);
    expect(warn).toHaveBeenCalledWith(
      "[kitchen] Cook now fired the lines; no held settled order moved",
      { cartId: CART },
    );
  });

  it("a moved order is not reported as blocked (the row count is read, not assumed)", async () => {
    await fireTicketNow({ cartId: CART });
    expect(order().fire_at).toBe(DB_NOW);
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("a failed order write is logged, never surfaced: the kitchen still cooks", async () => {
    orderWriteFails = true;
    expect(await fireTicketNow({ cartId: CART })).toEqual({ ok: true });
    expect(order().fire_at).toBe(HELD_FIRE);
    expect(tables.qr_cart_items!.every((l) => l.fire_at === DB_NOW)).toBe(true);
    expect(error).toHaveBeenCalledWith("[kitchen] Cook now fired the lines but not the order", {
      cartId: CART,
      message: "boom",
    });
  });

  it("a THROWN clock read is logged, never surfaced: the cook never reads a failed Cook now", async () => {
    clockThrows = true;
    expect(await fireTicketNow({ cartId: CART })).toEqual({ ok: true });
    expect(tables.qr_cart_items!.every((l) => l.fire_at === DB_NOW)).toBe(true);
    expect(error).toHaveBeenCalledWith(
      "[kitchen] Cook now fired the lines; the order write threw",
      {
        cartId: CART,
        message: "socket hang up",
      },
    );
  });

  it("a THROWN order write (the `.update()` chain rejects) is logged, never surfaced", async () => {
    orderWriteThrows = true;
    expect(await fireTicketNow({ cartId: CART })).toEqual({ ok: true });
    expect(tables.qr_cart_items!.every((l) => l.fire_at === DB_NOW)).toBe(true);
    expect(order().fire_at).toBe(HELD_FIRE);
    expect(error).toHaveBeenCalledWith(
      "[kitchen] Cook now fired the lines; the order write threw",
      { cartId: CART, message: "write socket hang up" },
    );
  });

  it("an unreadable DB clock moves the order on the app clock, logged", async () => {
    clockFails = true;
    vi.useFakeTimers({ now: Date.parse(later(-30)), toFake: ["Date"] });
    try {
      await fireTicketNow({ cartId: CART });
      expect(order().fire_at).toBe(later(-30));
    } finally {
      vi.useRealTimers();
    }
    expect(error).toHaveBeenCalledWith(
      "[kitchen] mms_now unreadable — the held order moves on the app clock",
      { cartId: CART, message: "boom" },
    );
  });

  it("an already-live ticket whose order already moved writes nothing new", async () => {
    for (const l of tables.qr_cart_items!) l.fire_at = later(-60);
    tables.qr_orders![0]!.fire_at = later(-60);
    expect(await fireTicketNow({ cartId: CART })).toMatchObject({
      ok: false,
      code: "already-live",
    });
    expect(order().fire_at).toBe(later(-60));
    expect(warn).not.toHaveBeenCalled();
  });

  it("THE REPAIR: an order write that failed is repaired by the next Cook now (already-live)", async () => {
    // First tap: the lines fire, the order write fails — the stamp stays an hour ahead.
    orderWriteFails = true;
    expect(await fireTicketNow({ cartId: CART })).toEqual({ ok: true });
    expect(order().fire_at).toBe(HELD_FIRE);
    // A second tap (another tablet's stale card): the lines are live, so the RPC fires nothing —
    // and the order's stamp still follows them to the DB clock.
    orderWriteFails = false;
    expect(await fireTicketNow({ cartId: CART })).toMatchObject({
      ok: false,
      code: "already-live",
    });
    expect(order().fire_at).toBe(DB_NOW);
    expect(warn).toHaveBeenCalledWith("[kitchen] Cook now repaired a held order's fire time", {
      cartId: CART,
    });
  });

  it("the repair never pulls an order ahead of lines that are still HELD", async () => {
    // The RPC refused (the cart is not `paid`), so the lines are still held: the order stays with them.
    tables.qr_carts![0]!.status = "closed";
    expect(await fireTicketNow({ cartId: CART })).toMatchObject({ code: "already-live" });
    expect(tables.qr_cart_items!.every((l) => l.fire_at === HELD_FIRE)).toBe(true);
    expect(order().fire_at).toBe(HELD_FIRE);
  });

  it("the repair stands down when the held-line read fails (never a guess), logged", async () => {
    tables.qr_carts![0]!.status = "closed";
    heldReadFails = true;
    expect(await fireTicketNow({ cartId: CART })).toMatchObject({ code: "already-live" });
    expect(order().fire_at).toBe(HELD_FIRE);
    expect(error).toHaveBeenCalledWith("[kitchen] Cook now repair: the held-line read failed", {
      cartId: CART,
      message: "nope",
    });
  });
});

describe("pickupGuide — a bag the kitchen has STARTED is with the kitchen (the belt)", () => {
  // The order write failed: the stamp is still an hour ahead, the lines say Mom is on it.
  const nowMs = Date.parse(later(90));
  const held = {
    status: "paid",
    pickupSlot: SLOT,
    fireAt: HELD_FIRE,
    togoStatus: "preparing",
    arrivedAt: null,
    createdAt: "2026-10-08T19:00:00.000Z",
  };
  it("Start: cooking, step 1, and the kitchen's own line under it", () => {
    const g = pickupGuide({ ...held, kitchen: "cooking" }, nowMs);
    expect(g.stage).toBe("cooking");
    expect(g.step).toBe(1);
    expect(g.sub).toBeNull();
    expect(pickupKitchenLine(g.stage, "cooking")).toEqual(TRACK.kitchenCooking);
  });
  it("Done: cooking (the bag is the counter's to make), never booked", () => {
    const g = pickupGuide({ ...held, kitchen: "done" }, nowMs);
    expect(g.stage).toBe("cooking");
    expect(pickupKitchenLine(g.stage, "done")).toEqual(TRACK.kitchenDone);
  });
  it("Sent (fired, nobody tapped) is the order row's to speak for: still booked", () => {
    expect(pickupGuide({ ...held, kitchen: "sent" }, nowMs).stage).toBe("booked");
    expect(pickupGuide({ ...held, kitchen: null }, nowMs).stage).toBe("booked");
  });
  it("bagStarted is Start or Done, nothing else", () => {
    expect(bagStarted("cooking")).toBe(true);
    expect(bagStarted("done")).toBe(true);
    expect(bagStarted("sent")).toBe(false);
    expect(bagStarted(null)).toBe(false);
  });
});
