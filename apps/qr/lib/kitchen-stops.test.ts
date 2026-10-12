import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * M270 (1) — the stop cards' SERVER wiring in `lib/kitchen.ts`: the queue carries the stop read's
 * answer beside the tickets — on the empty board too (a cleared table's tickets are exactly what the
 * line read no longer returns) — and a stop read that fails is SOFT: the queue is answered, the
 * tickets stand, and `stops` is `null` (the board keeps its cards), never `[]` (which would read as
 * every table acknowledged). And "Got it" (`ackTableClearStop`): the caller is who acknowledged,
 * never the request, and the RPC's word is read, never cast. The read itself is
 * `lib/kitchen-stop-read.test.ts`'s; here it is stubbed so the wiring is all that is asked.
 */
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("./posthog-server", () => ({
  getPostHogClient: () => ({ capture() {}, flush: () => Promise.resolve() }),
}));
const CALLER = { uid: "u-7", staffId: "11111111-2222-4333-8444-555555555555", role: "server" };
let gate: { ok: true; caller: typeof CALLER } | { ok: false; error: string } = {
  ok: true,
  caller: CALLER,
};
vi.mock("./staff", () => ({
  getStaffAuth: () => Promise.resolve({ kind: "staff", caller: CALLER }),
  staffGate: () => Promise.resolve(gate),
  STAFF_SIGNIN_REQUIRED: "Staff sign-in required.",
}));
vi.mock("./staff-lock", () => ({ isConsoleLocked: () => Promise.resolve(false) }));
vi.mock("./served-today", () => ({
  readServedToday: () => Promise.resolve(null),
  settleServedRail: () => Promise.resolve(null),
}));
vi.mock("./line-names", () => ({
  loadLineNames: () => Promise.resolve({ nameMyByRef: new Map(), optionNameMy: new Map() }),
}));
let stopRead: () => Promise<unknown> = () => Promise.resolve([]);
vi.mock("./kitchen-stop-read", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./kitchen-stop-read")>()),
  readKitchenStops: () => stopRead(),
}));

const NOW = "2026-10-11T18:00:00.000Z";
type Row = Record<string, unknown>;
let tables: Record<string, Row[]> = {};
let rpcAnswer: { data: unknown; error: { message: string } | null } = { data: "ok", error: null };
const rpcCalls: [string, unknown][] = [];
/** Every read answers its table whole (the queue's own filtering is `kitchen-queue-counter`'s). */
function query(name: string): unknown {
  const api: unknown = new Proxy(
    {},
    {
      get(_, k) {
        if (k === "then")
          return (res: (v: unknown) => unknown) =>
            Promise.resolve({ data: tables[name] ?? [], error: null, count: null }).then(res);
        if (k === "maybeSingle") return () => Promise.resolve({ data: null, error: null });
        return () => api;
      },
    },
  );
  return api;
}
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: (name: string) => query(name),
    rpc: (fn: string, args: unknown) => {
      if (fn === "mms_now") return Promise.resolve({ data: NOW, error: null });
      if (fn === "mms_ack_table_clear_stop") {
        rpcCalls.push([fn, args]);
        return Promise.resolve(rpcAnswer);
      }
      return Promise.resolve({ data: [], error: null });
    },
  }),
}));

const { getKitchenQueue, ackTableClearStop } = await import("./kitchen");

const STOP = {
  key: "stop|c1|b|batch-9",
  clearId: "c1",
  tableNumber: 3,
  label: "t3",
  firedAt: NOW,
  lines: [],
};
/** One live dine-in ticket: Table 4's Mohinga, fired a minute ago. */
const liveTable = (): Record<string, Row[]> => ({
  qr_cart_items: [
    {
      id: "l1",
      name: "Mohinga",
      qty: 1,
      modifiers: [],
      modifier_option_ids: null,
      state: "fired",
      fire_at: "2026-10-11T17:59:00.000Z",
      fire_batch: "batch-1",
      created_at: "2026-10-11T17:58:00.000Z",
      cart_id: "cart-4",
      fulfillment: "dinein",
      notes: null,
      menu_item_id: "m1",
      comped: false,
    },
  ],
  qr_carts: [
    { id: "cart-4", session_id: "s4", status: "open", customer_name: null, pickup_slot: null },
  ],
  table_sessions: [{ id: "s4", qr_code: "t4", table_number: 4, mode: "dinein", status: "active" }],
});

beforeEach(() => {
  tables = {};
  stopRead = () => Promise.resolve([]);
  rpcAnswer = { data: "ok", error: null };
  rpcCalls.length = 0;
  gate = { ok: true, caller: CALLER };
});

async function queue() {
  const r = await getKitchenQueue();
  if (!r.ok) throw new Error(`expected a queue, got ${r.reason}`);
  return r.queue;
}

describe("getKitchenQueue — the stop cards ride the queue, soft", () => {
  it("an EMPTY board still carries the stop card — the cleared table's tickets are what the line read lost", async () => {
    stopRead = () => Promise.resolve([STOP]);
    const q = await queue();
    expect(q.tickets).toEqual([]);
    // MUTATION m270/kitchen/stops-never-read: the queue answers without them — the card never shows.
    expect(q.stops).toEqual([STOP]);
  });

  it("beside live tickets too", async () => {
    tables = liveTable();
    stopRead = () => Promise.resolve([STOP]);
    const q = await queue();
    expect(q.tickets.map((t) => t.tableNumber)).toEqual([4]);
    expect(q.stops).toEqual([STOP]);
  });

  it.each([
    ["fails", () => Promise.resolve(null)],
    ["throws", () => Promise.reject(new Error("socket"))],
  ])(
    "a stop read that %s: the queue is answered, its tickets stand, and stops is NULL — never []",
    async (_, read) => {
      tables = liveTable();
      stopRead = read;
      const r = await getKitchenQueue();
      // Never an outage: a stop card is not worth a frozen kitchen.
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.queue.tickets).toHaveLength(1);
      // MUTATION m270/kitchen/stops-failure-read-as-none: `[]` here reads as "every table that left
      // was acknowledged", and the board drops cards nobody tapped Got it on.
      expect(r.queue.stops).toBeNull();
    },
  );
});

describe("ackTableClearStop — Got it", () => {
  const CLEAR = "99999999-8888-4777-8666-555555555555";
  it("acknowledges as the CALLER — never a value the request carries", async () => {
    const r = await ackTableClearStop({ clearId: CLEAR, by: "someone-else" });
    expect(r).toEqual({ ok: true, status: "ok" });
    // MUTATION m270/kitchen/ack-by-request: the record would name whoever the POST said.
    expect(rpcCalls).toEqual([
      ["mms_ack_table_clear_stop", { p_clear: CLEAR, p_by: CALLER.staffId }],
    ]);
  });

  it.each(["ok", "already", "nothing_to_stop", "not_found"] as const)(
    "the RPC's %s comes back as it is — the board decides what it means",
    async (status) => {
      rpcAnswer = { data: status, error: null };
      expect(await ackTableClearStop({ clearId: CLEAR })).toEqual({ ok: true, status });
    },
  );

  it("a word outside the four is a FAILURE — never a guessed hide", async () => {
    rpcAnswer = { data: "acknowledged", error: null };
    // MUTATION m270/kitchen/ack-status-cast: the word nobody defined would hide the card.
    expect(await ackTableClearStop({ clearId: CLEAR })).toMatchObject({
      ok: false,
      code: "failed",
    });
  });

  it("an RPC error is a failure; a malformed request never reaches the RPC; the gate's refusal is coded", async () => {
    rpcAnswer = { data: null, error: { message: "boom" } };
    expect(await ackTableClearStop({ clearId: CLEAR })).toMatchObject({
      ok: false,
      code: "failed",
    });
    rpcCalls.length = 0;
    expect(await ackTableClearStop({ clearId: "not-a-uuid" })).toMatchObject({
      ok: false,
      code: "invalid",
    });
    expect(rpcCalls).toEqual([]);
    gate = { ok: false, error: "Staff sign-in required." };
    expect(await ackTableClearStop({ clearId: CLEAR })).toMatchObject({
      ok: false,
      code: "signin",
    });
    expect(rpcCalls).toEqual([]);
  });
});
