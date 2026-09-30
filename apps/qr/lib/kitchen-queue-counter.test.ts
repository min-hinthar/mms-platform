import { beforeEach, describe, expect, it, vi } from "vitest";
/**
 * Phase 2f · P2v — the KDS reads its lines through `kdsLineGate` (lib/counter-order.ts), so the one
 * staff-only exception to pay-first — an OPEN `reg-` counter order sent by staff — reaches the
 * kitchen flagged Unpaid, and nothing else does. The fake EVALUATES `.eq()` / `.in()` so the gate's
 * inputs are the rows the real reads would return; the DB clock is fixed and each fire time is set
 * relative to it. Each case is the one a `p2f-lib/kitchen/*` mutant turns red.
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
  staffGate: () => Promise.resolve({ ok: true, caller: {} }),
  STAFF_SIGNIN_REQUIRED: "signin",
}));
vi.mock("./staff-lock", () => ({ isConsoleLocked: () => Promise.resolve(false) }));
vi.mock("./served-today", () => ({
  readServedToday: () => Promise.resolve(null),
  settleServedRail: () => Promise.resolve(null),
}));
vi.mock("./line-names", () => ({
  loadLineNames: () => Promise.resolve({ optionNameMy: new Map() }),
}));

type Row = Record<string, unknown>;
const NOW = "2026-10-01T18:00:00.000Z";
const at = (sec: number) => new Date(Date.parse(NOW) + sec * 1000).toISOString();

let tables: Record<string, Row[]> = {};

function query(name: string) {
  const filters: ((r: Row) => boolean)[] = [];
  const api: Record<string, unknown> = {
    select: () => api,
    eq(col: string, v: unknown) {
      filters.push((r) => r[col] === v);
      return api;
    },
    in(col: string, vs: unknown[]) {
      filters.push((r) => vs.includes(r[col]));
      return api;
    },
    // The line read's live-window filter, EVALUATED (Phase 2f review M2): a stamped line inside the
    // day window, or an unstamped one (fired at or before now) created inside it.
    or(expr: string) {
      const terms = expr.match(/and\([^)]*\)|[^,]+/g) ?? [];
      const test = (t: string, r: Row): boolean => {
        if (t.startsWith("and("))
          return t
            .slice(4, -1)
            .split(",")
            .every((u) => test(u, r));
        const [col, op, ...rest] = t.split(".");
        const v = rest.join(".");
        if (op === "is" && v === "null") return r[col!] == null;
        if (op === "gte") return r[col!] != null && String(r[col!]) >= v;
        throw new Error(`fake: unsupported filter ${t}`);
      };
      filters.push((r) => terms.some((t) => test(t, r)));
      return api;
    },
    not: () => api,
    gte: () => api,
    order: () => api,
    limit: () => api,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    then(res: (v: unknown) => unknown) {
      const rows = (tables[name] ?? []).filter((r) => filters.every((f) => f(r)));
      return Promise.resolve({ data: rows, error: null }).then(res);
    },
  };
  return api;
}
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: (name: string) => query(name),
    rpc: (fn: string) =>
      Promise.resolve(fn === "mms_now" ? { data: NOW, error: null } : { data: [], error: null }),
  }),
}));

const { getKitchenQueue } = await import("./kitchen");

const line = (over: Row = {}): Row => ({
  id: "l1",
  name: "Mohinga",
  qty: 1,
  modifiers: [],
  modifier_option_ids: null,
  state: "fired",
  fire_at: at(-60),
  created_at: at(-120),
  comped: false,
  cart_id: "cart-1",
  fulfillment: "togo",
  notes: null,
  menu_item_id: "m1",
  ...over,
});

function setup(o: {
  code: string;
  mode?: string;
  sessionStatus?: string;
  cartStatus?: string;
  fireAt?: string | null;
  order?: boolean;
  lines?: Row[];
  pickupSlot?: string | null;
}) {
  tables = {
    qr_cart_items: o.lines ?? [line({ fire_at: o.fireAt === undefined ? at(-60) : o.fireAt })],
    qr_carts: [
      {
        id: "cart-1",
        session_id: "s1",
        status: o.cartStatus ?? "open",
        customer_name: "Aye",
        pickup_slot: o.pickupSlot ?? null,
      },
    ],
    table_sessions: [
      {
        id: "s1",
        qr_code: o.code,
        table_number: null,
        mode: o.mode ?? "pickup",
        status: o.sessionStatus ?? "active",
      },
    ],
    qr_orders: o.order ? [{ id: "order-00abcdef", cart_id: "cart-1", status: "paid" }] : [],
  };
}

async function tickets() {
  const r = await getKitchenQueue();
  if (!r.ok) throw new Error(`expected a queue, got ${r.reason}`);
  return r.queue.tickets;
}

beforeEach(() => {
  tables = {};
});

describe("getKitchenQueue — pay-first, with ONE staff-only exception", () => {
  it("an OPEN reg- counter order fired a minute ago: one ticket, flagged unpaid, named, no code", async () => {
    setup({ code: "reg-ab12" });
    const t = await tickets();
    // counter-gate-bypassed (inverse) · cart-status-read-as-paid
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({
      channel: "pickup",
      unpaid: true,
      held: false,
      customerName: "Aye",
      shortCode: null,
    });
  });

  it("an open DINER pickup cart with a fired line never reaches the kitchen", async () => {
    // counter-gate-bypassed
    setup({ code: "T7" });
    expect(await tickets()).toEqual([]);
    setup({ code: "kiosk-ab12" });
    expect(await tickets()).toEqual([]);
  });

  it("a cleared reg- session with its cart still open never reaches the kitchen", async () => {
    // session-status-ignored
    setup({ code: "reg-ab12", sessionStatus: "closed" });
    expect(await tickets()).toEqual([]);
  });

  it("once PAID, the ticket carries the order's code and is no longer unpaid", async () => {
    // cart-status-read-as-paid
    setup({ code: "reg-ab12", cartStatus: "paid", order: true, sessionStatus: "closed" });
    const t = await tickets();
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ unpaid: false, held: false, shortCode: "ABCDEF" });
  });

  it("a paid counter line still inside its grace is hidden — never drawn held", async () => {
    setup({ code: "reg-ab12", cartStatus: "paid", order: true, fireAt: at(3) });
    expect(await tickets()).toEqual([]);
  });

  it("a paid counter order WITH a pickup slot is drawn held until slot − prep (review PT2)", async () => {
    // p2f-rev-lib/kitchen/counter-slot-unread — the gate's `slotted` is the cart's pickup_slot
    setup({
      code: "reg-ab12",
      cartStatus: "paid",
      order: true,
      fireAt: at(1800),
      pickupSlot: at(2700),
    });
    const t = await tickets();
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ held: true, unpaid: false });
  });

  it("a ticket is Unpaid when ANY of its lines is sent unpaid food — a comp alone is not (review PT4)", async () => {
    // p2f-rev-lib/kitchen/unpaid-from-first-line-only — the comp is the OLDER line, so the ticket
    // is opened from it; the paid-for dish fired after it must still flag the ticket.
    setup({
      code: "reg-ab12",
      lines: [
        line({ id: "l1", comped: true, fire_at: at(-90) }),
        line({ id: "l2", comped: false, fire_at: at(-30) }),
      ],
    });
    expect((await tickets())[0]).toMatchObject({ unpaid: true });
    // p2f-rev-lib/kitchen/comped-unread — a comp-only ticket cooks, and owes nothing
    setup({ code: "reg-ab12", lines: [line({ comped: true })] });
    const t = await tickets();
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ unpaid: false });
  });

  it("a fired line with NO fire_at reaches the kitchen now — the reading the no-show and Clear share (review M2)", async () => {
    // p2f-rev-lib/kitchen/null-fire-at-unread
    setup({ code: "reg-ab12", fireAt: null });
    const t = await tickets();
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ unpaid: true, held: false });
    expect(t[0]!.firedAt).toBe(NOW);
    // …but only inside the same day window as every stamped line: an ancient unstamped orphan
    // must not creep back into the capped read (M180).
    setup({
      code: "reg-ab12",
      lines: [line({ fire_at: null, created_at: at(-2 * 24 * 3600) })],
    });
    expect(await tickets()).toEqual([]);
  });

  it("a paid DINER pickup with a future fire_at is still held (the slot schedule)", async () => {
    setup({ code: "T7", cartStatus: "paid", order: true, fireAt: at(600) });
    const t = await tickets();
    expect(t[0]).toMatchObject({ held: true, unpaid: false });
  });
});
