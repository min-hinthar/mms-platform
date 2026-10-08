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
/** Codex r4 — fail the cart-owing read (the line read with the owing columns) to prove it fails closed. */
let failOwingRead = false;
/** PD5 — fail the ADVISORY round read (its carts leg, or its batched-lines leg) to prove it fails
 *  OPEN: every dine-in card reads `unknown`, and the board is still answered. */
let failRoundRead: "carts" | "lines" | null = null;
/** Codex r4 — every column list `qr_cart_items` was read with, in order. */
let itemReads: string[] = [];
const OWING_COLS = "cart_id,state,comped,qty";
const ROUND_LINE_COLS = "cart_id,fire_batch,fire_at,fulfillment";
const ROUND_CART_COLS = "id,session_id,status";

function query(name: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let cols = "";
  let lim: number | null = null;
  const api: Record<string, unknown> = {
    select: (c: string) => {
      cols = c;
      if (name === "qr_cart_items") itemReads.push(c);
      return api;
    },
    eq(col: string, v: unknown) {
      filters.push((r) => r[col] === v);
      return api;
    },
    in(col: string, vs: unknown[]) {
      filters.push((r) => vs.includes(r[col]));
      return api;
    },
    // PD5 — the round read's two filters, EVALUATED: a cancelled cart's Sends never count, and only
    // batched lines are read.
    neq(col: string, v: unknown) {
      filters.push((r) => r[col] !== v);
      return api;
    },
    not(col: string, op: string, v: unknown) {
      if (op !== "is" || v !== null) throw new Error(`fake: unsupported not(${col}, ${op})`);
      filters.push((r) => r[col] != null);
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
    gte: () => api,
    order: () => api,
    limit(n: number) {
      lim = n;
      return api;
    },
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    then(res: (v: unknown) => unknown) {
      const boom = Promise.resolve({ data: null, error: { message: "boom" } });
      if (failOwingRead && name === "qr_cart_items" && cols === OWING_COLS) return boom.then(res);
      if (failRoundRead === "carts" && name === "qr_carts" && cols === ROUND_CART_COLS)
        return boom.then(res);
      if (failRoundRead === "lines" && name === "qr_cart_items" && cols === ROUND_LINE_COLS)
        return boom.then(res);
      const all = (tables[name] ?? []).filter((r) => filters.every((f) => f(r)));
      // PD5 (G1) — the cap is REAL in the fake, so a saturated read answers exactly `cap` rows.
      const rows = lim === null ? all : all.slice(0, lim);
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
  failOwingRead = false;
  failRoundRead = null;
  itemReads = [];
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

describe("getKitchenQueue — an open counter order's Unpaid is the CART's (Codex r4 on #308)", () => {
  it("the chargeable dish SERVED, a comped one still cooking: the ticket is still Unpaid", async () => {
    // p2f-cx4/kitchen/owes-from-board-lines — the board's own read holds only fired / in-progress
    // lines, so the served dish is off it; the cart still owes for it.
    setup({
      code: "reg-ab12",
      lines: [
        line({ id: "l1", state: "served", comped: false, fire_at: at(-300) }),
        line({ id: "l2", state: "in_progress", comped: true, fire_at: at(-120) }),
      ],
    });
    const t = await tickets();
    expect(t).toHaveLength(1);
    expect(t[0]!.lines.map((l) => l.id)).toEqual(["l2"]);
    expect(t[0]).toMatchObject({ unpaid: true });
  });

  it("a comp shown FIRST beside a chargeable dish: the ticket is Unpaid (its first line is a comp)", async () => {
    // p2f-rev-lib/kitchen/unpaid-from-first-line-only (re-anchored) — Unpaid is the cart's, never
    // derived from the line that opened the ticket.
    setup({
      code: "reg-ab12",
      lines: [
        line({ id: "l1", comped: true, fire_at: at(-90) }),
        line({ id: "l2", comped: false, fire_at: at(-30) }),
      ],
    });
    expect((await tickets())[0]).toMatchObject({ unpaid: true });
  });

  it("a FULLY comped open cart — a served comp and a cooking one — owes nothing: not Unpaid", async () => {
    // p2f-rev-lib/kitchen/comped-unread (re-anchored) — the owing read must read the comp.
    setup({
      code: "reg-ab12",
      lines: [
        line({ id: "l1", state: "served", comped: true, fire_at: at(-300) }),
        line({ id: "l2", state: "in_progress", comped: true, fire_at: at(-120) }),
      ],
    });
    const t = await tickets();
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ unpaid: false });
  });

  it("a voided chargeable dish owes nothing either (`counterChargeableLine`)", async () => {
    setup({
      code: "reg-ab12",
      lines: [
        line({ id: "l1", state: "voided", comped: false, fire_at: at(-300) }),
        line({ id: "l2", state: "in_progress", comped: true, fire_at: at(-120) }),
      ],
    });
    expect((await tickets())[0]).toMatchObject({ unpaid: false });
  });

  it("a PAID counter cart is never Unpaid — and is not read for owing", async () => {
    setup({
      code: "reg-ab12",
      cartStatus: "paid",
      order: true,
      lines: [
        line({ id: "l1", state: "served", comped: false, fire_at: at(-300) }),
        line({ id: "l2", state: "in_progress", comped: true, fire_at: at(-120) }),
      ],
    });
    const t = await tickets();
    expect(t[0]).toMatchObject({ unpaid: false });
    // Only the board's own line read: the owing read runs for OPEN counter carts alone.
    expect(itemReads).toHaveLength(1);
  });

  it("a failed owing read is an OUTAGE — never a ticket guessed paid (and the owing read is the one failed)", async () => {
    // p2f-cx4/kitchen/owes-read-error-swallowed
    setup({ code: "reg-ab12" });
    failOwingRead = true;
    expect(await getKitchenQueue()).toEqual({ ok: false, reason: "outage" });
  });

  it("a SATURATED owing read is an outage too — past its cap it did not answer", async () => {
    // p2f-cx4/kitchen/owes-read-saturation-ignored — 500 comped lines served (off the board), one
    // cooking: an unsaturated read would answer "owes nothing"; the capped one cannot say.
    const served = Array.from({ length: 499 }, (_, i) =>
      line({ id: `s${i}`, state: "served", comped: true, fire_at: at(-600) }),
    );
    setup({
      code: "reg-ab12",
      lines: [...served, line({ id: "l2", state: "in_progress", comped: true, fire_at: at(-120) })],
    });
    expect(await getKitchenQueue()).toEqual({ ok: false, reason: "outage" });
  });
});

// ── PD5 — one Send, one card ──────────────────────────────────────────────────────────────────────
const B1 = "3f2a9c10-1111-4aaa-8bbb-000000000001";
const B2 = "7d0e4b22-2222-4aaa-8bbb-000000000002";
const BT = "aaaa0000-3333-4aaa-8bbb-000000000003";

/** A dine-in table (T4, session s4) whose carts and lines the case supplies. */
function setupTable(o: { carts?: Row[]; lines: Row[]; sessionStatus?: string; mode?: string }) {
  tables = {
    qr_cart_items: o.lines,
    qr_carts: o.carts ?? [
      { id: "cart-1", session_id: "s4", status: "open", customer_name: null, pickup_slot: null },
    ],
    table_sessions: [
      {
        id: "s4",
        qr_code: "T4",
        table_number: 4,
        mode: o.mode ?? "dinein",
        status: o.sessionStatus ?? "active",
      },
    ],
    qr_orders: [],
  };
}
const dine = (over: Row = {}): Row => line({ fulfillment: "dinein", cart_id: "cart-1", ...over });

describe("getKitchenQueue — PD5: one Send is one card, keyed by cart + batch", () => {
  it("two Sends on one open dine-in cart are two cards, rounds 1 and 2, each with its own lines and clock (`kitchen/keyed-by-cart`, `kitchen/round-unread`)", async () => {
    setupTable({
      lines: [
        dine({ id: "l1", fire_batch: B1, fire_at: at(-552), created_at: at(-600) }),
        dine({
          id: "l2",
          fire_batch: B1,
          fire_at: at(-552),
          created_at: at(-600),
          state: "in_progress",
        }),
        dine({ id: "l3", fire_batch: B2, fire_at: at(-4), created_at: at(-14) }),
      ],
    });
    const t = await tickets();
    expect(t).toHaveLength(2);
    expect(t[0]).toMatchObject({
      key: `b|${B1}`,
      cartId: "cart-1",
      fireBatch: B1,
      round: { kind: "n", n: 1 },
      firedAt: at(-552),
      stampIso: at(-552),
      channel: "dinein",
      tableNumber: 4,
    });
    expect(t[0]!.lines.map((l) => l.id)).toEqual(["l1", "l2"]);
    expect(t[1]).toMatchObject({
      key: `b|${B2}`,
      fireBatch: B2,
      round: { kind: "n", n: 2 },
      firedAt: at(-4),
      stampIso: at(-4),
    });
    expect(t[1]!.lines.map((l) => l.id)).toEqual(["l3"]);
    // The board's own read, then the round read's batched lines: two item reads, no owing read.
    expect(itemReads).toEqual([expect.stringContaining("modifiers"), ROUND_LINE_COLS]);
  });

  it("a failed CARTS leg leaves every round UNKNOWN and still answers the board (`kitchen/round-read-failure-is-outage`)", async () => {
    setupTable({
      lines: [
        dine({ id: "l1", fire_batch: B1, fire_at: at(-552) }),
        dine({ id: "l3", fire_batch: B2, fire_at: at(-4) }),
      ],
    });
    failRoundRead = "carts";
    const t = await tickets();
    expect(t).toHaveLength(2);
    expect(t.map((x) => x.round)).toEqual([{ kind: "unknown" }, { kind: "unknown" }]);
  });

  it("a failed LINES leg leaves every round UNKNOWN and still answers the board", async () => {
    setupTable({
      lines: [
        dine({ id: "l1", fire_batch: B1, fire_at: at(-552) }),
        dine({ id: "l3", fire_batch: B2, fire_at: at(-4) }),
      ],
    });
    failRoundRead = "lines";
    const t = await tickets();
    expect(t).toHaveLength(2);
    expect(t.map((x) => x.round)).toEqual([{ kind: "unknown" }, { kind: "unknown" }]);
  });

  it("a SATURATED carts leg — the session's carts at the cap — leaves every round UNKNOWN (G1; `kitchen/round-carts-saturation-ignored`)", async () => {
    const carts = Array.from({ length: 200 }, (_, i) => ({
      id: `cart-old-${i}`,
      session_id: "s4",
      status: "paid",
      customer_name: null,
      pickup_slot: null,
    }));
    setupTable({
      carts: [
        ...carts,
        { id: "cart-1", session_id: "s4", status: "open", customer_name: null, pickup_slot: null },
      ],
      lines: [dine({ id: "l3", fire_batch: B2, fire_at: at(-4) })],
    });
    const t = await tickets();
    expect(t).toHaveLength(1);
    expect(t[0]!.round).toEqual({ kind: "unknown" });
  });

  it("a SATURATED lines leg — the session's batched lines at the cap — leaves every round UNKNOWN (G1; `kitchen/round-lines-saturation-ignored`)", async () => {
    // 2 000 served batched lines of the day (off the board) plus the live one: the read answers
    // exactly its cap and cannot rank, so no number is guessed.
    const served = Array.from({ length: 1_999 }, (_, i) =>
      dine({ id: `s${i}`, state: "served", fire_batch: B1, fire_at: at(-3_000) }),
    );
    setupTable({ lines: [...served, dine({ id: "l3", fire_batch: B2, fire_at: at(-4) })] });
    const t = await tickets();
    expect(t).toHaveLength(1);
    expect(t[0]!.round).toEqual({ kind: "unknown" });
  });

  it("a Send that carries no dine-in line (make-it-now to-go) is its own card with NO ordinal, and shifts none (round 3 D4)", async () => {
    setupTable({
      lines: [
        dine({ id: "l1", fire_batch: B1, fire_at: at(-600) }),
        line({
          id: "lt",
          cart_id: "cart-1",
          fulfillment: "togo",
          fire_batch: BT,
          fire_at: at(-300),
        }),
        dine({ id: "l3", fire_batch: B2, fire_at: at(-40) }),
      ],
    });
    const t = await tickets();
    expect(t.map((x) => [x.fireBatch, x.round])).toEqual([
      [B1, { kind: "n", n: 1 }],
      [BT, { kind: "none" }],
      [B2, { kind: "n", n: 2 }],
    ]);
  });

  it("a voided Send (off the board) still holds its number, so a drawn number never shifts down (`kitchen/round-drops-voided`)", async () => {
    setupTable({
      lines: [
        dine({ id: "l1", fire_batch: B1, fire_at: at(-600), state: "voided" }),
        dine({ id: "l3", fire_batch: B2, fire_at: at(-40) }),
      ],
    });
    const t = await tickets();
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ fireBatch: B2, round: { kind: "n", n: 2 } });
  });

  it("a table that paid and kept ordering counts its paid cart's Sends; a cancelled cart's never (`kitchen/round-counts-cancelled-carts`)", async () => {
    setupTable({
      carts: [
        {
          id: "cart-paid",
          session_id: "s4",
          status: "paid",
          customer_name: null,
          pickup_slot: null,
        },
        {
          id: "cart-x",
          session_id: "s4",
          status: "cancelled",
          customer_name: null,
          pickup_slot: null,
        },
        { id: "cart-1", session_id: "s4", status: "open", customer_name: null, pickup_slot: null },
      ],
      lines: [
        dine({
          id: "p1",
          cart_id: "cart-paid",
          fire_batch: B1,
          fire_at: at(-3000),
          state: "served",
        }),
        dine({ id: "x1", cart_id: "cart-x", fire_batch: BT, fire_at: at(-2000), state: "fired" }),
        dine({ id: "l3", fire_batch: B2, fire_at: at(-40) }),
      ],
    });
    const t = await tickets();
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ cartId: "cart-1", round: { kind: "n", n: 2 } });
  });

  it("lines with no batch and no fire time are ONE bucket per cart, stamped by their earliest created_at (correction 3, m5 §F; `kitchen/stamp-from-the-poll-clock`)", async () => {
    setupTable({
      lines: [
        dine({ id: "n1", fire_batch: null, fire_at: null, created_at: at(-200) }),
        dine({ id: "n2", fire_batch: null, fire_at: null, created_at: at(-260) }),
      ],
    });
    const t = await tickets();
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({
      key: "cart-1|n",
      fireBatch: null,
      round: { kind: "unknown" },
      firedAt: NOW,
      stampIso: at(-260),
    });
    expect(t[0]!.lines.map((l) => l.id)).toEqual(["n1", "n2"]);
  });

  it("batchless lines with a fire time key by that raw time — two times, two cards", async () => {
    setupTable({
      lines: [
        dine({ id: "f1", fire_batch: null, fire_at: at(-300) }),
        dine({ id: "f2", fire_batch: null, fire_at: at(-30) }),
      ],
    });
    const t = await tickets();
    expect(t.map((x) => x.key)).toEqual([`cart-1|f|${at(-300)}`, `cart-1|f|${at(-30)}`]);
    expect(t.map((x) => x.stampIso)).toEqual([at(-300), at(-30)]);
  });

  it("a pickup session's card is never a round, and no round read runs for it (`kitchen/round-read-for-every-session`)", async () => {
    setupTable({ mode: "pickup", lines: [] });
    setup({ code: "reg-ab12", lines: [line({ fire_batch: B1 })] });
    const t = await tickets();
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ round: { kind: "none" }, fireBatch: B1 });
    expect(itemReads).toHaveLength(2); // the board read, then the OWING read — no round read
    expect(itemReads[1]).toBe(OWING_COLS);
  });

  it("settlement food on a paid dine-in cart — fired at or after its order — is never a numbered round (Codex on #328)", async () => {
    // A hostless table paid at the counter with unsent drafts: the order is written, then the
    // drafts fire at the settlement on the just-paid cart; the guest's earlier Send came before.
    tables = {
      qr_cart_items: [
        dine({
          id: "p1",
          cart_id: "cart-paid",
          fire_batch: B1,
          fire_at: at(-3_000),
          state: "served",
        }),
        dine({
          id: "p2",
          cart_id: "cart-paid",
          fire_batch: BT,
          fire_at: at(-2_599),
          state: "in_progress",
        }),
        dine({ id: "l3", fire_batch: B2, fire_at: at(-40) }),
      ],
      qr_carts: [
        {
          id: "cart-paid",
          session_id: "s4",
          status: "paid",
          customer_name: null,
          pickup_slot: null,
        },
        { id: "cart-1", session_id: "s4", status: "open", customer_name: null, pickup_slot: null },
      ],
      table_sessions: [
        { id: "s4", qr_code: "T4", table_number: 4, mode: "dinein", status: "active" },
      ],
      qr_orders: [
        { id: "order-00abcdef", cart_id: "cart-paid", status: "paid", created_at: at(-2_600) },
      ],
    };
    const t = await tickets();
    expect(t.map((x) => [x.fireBatch, x.round])).toEqual([
      [BT, { kind: "none" }],
      [B2, { kind: "n", n: 2 }],
    ]);
  });

  it("a paid slotted counter cart with TWO future-fire batches is ONE held card, keyed by the cart — Cook now fires the cart (Codex on #328; `kitchen/held-keyed-by-batch`)", async () => {
    setup({
      code: "reg-ab12",
      cartStatus: "paid",
      order: true,
      pickupSlot: at(2700),
      lines: [
        line({ id: "h1", fire_batch: B1, fire_at: at(1800) }),
        line({ id: "h2", fire_batch: B2, fire_at: at(1800) }),
      ],
    });
    const t = await tickets();
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ held: true, key: "cart-1|h", fireBatch: B1 });
    expect(t[0]!.lines.map((l) => l.id)).toEqual(["h1", "h2"]);
  });
});
