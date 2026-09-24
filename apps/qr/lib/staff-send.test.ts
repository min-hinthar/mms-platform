import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 2a · send — the staff console's Send and its take-back, asserted against the CALLS the module
 * makes and the REASONS it answers (never a message). Each case is the one a `staff-send/*` mutant in
 * `scripts/verify-slice.mjs` turns red.
 */
const h = vi.hoisted(() => ({
  auth: { kind: "staff", caller: { uid: "u-1", staffId: "st-1", role: "server" } } as {
    kind: string;
    caller?: { uid: string; staffId: string; role: string };
  },
  open: {
    session: {
      id: "11111111-1111-4111-8111-111111111111",
      status: "active",
      mode: "dinein",
      qr_code: "t-7",
      expires_at: "2026-09-24T20:00:00.000Z",
    },
    cart: { id: "cart-1", locked: false, locked_at: null, settle_at: null },
    unavailable: false,
  } as {
    session: null | {
      id: string;
      status: string;
      mode: string;
      qr_code: string;
      expires_at: string;
    };
    cart: null | { id: string; locked: boolean; locked_at: null; settle_at: null };
    unavailable: boolean;
  },
  paying: null as null | string,
  rpcCalls: [] as { fn: string; args: Record<string, unknown> }[],
  fireRows: [] as { fired: number; batch: string; fire_deadline: string }[],
  unfired: 0,
  rpcError: null as null | { message: string },
  touched: [] as string[],
  renewed: [] as unknown[][],
  reads: 0,
  /** qr_cart_items rows the post-fire units read returns, and what it filtered on. */
  batchRows: [] as { qty: number }[] | null,
  batchReadError: null as null | { message: string },
  itemReads: [] as { table: string; cols: string; filters: [string, unknown][] }[],
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
// `after` runs INLINE, so an analytics drain that threw would surface here rather than vanish.
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));
vi.mock("./posthog-server", () => ({
  getPostHogClient: () => ({ capture() {}, flush: () => Promise.resolve() }),
}));
vi.mock("./staff", () => ({
  getStaffAuth: () => Promise.resolve(h.auth),
  roleAtLeast: () => true,
}));
vi.mock("./staff-open-cart", () => ({
  openCartFor: () => {
    h.reads += 1;
    return Promise.resolve(h.open);
  },
}));
vi.mock("./pay-guard", () => ({ paymentInFlightReason: () => Promise.resolve(h.paying) }));
vi.mock("./order-lines", () => ({
  touchCart: (cartId: string) => {
    h.touched.push(cartId);
    return Promise.resolve();
  },
}));
vi.mock("./authz", () => ({
  maybeRenewSession: (...a: unknown[]) => {
    h.renewed.push(a);
    return Promise.resolve();
  },
}));
/** `from(t).select(c).eq(..).eq(..)` — thenable at any depth, recording every filter. */
function itemsQuery(table: string) {
  const rec = { table, cols: "", filters: [] as [string, unknown][] };
  h.itemReads.push(rec);
  const q = {
    select(cols: string) {
      rec.cols = cols;
      return q;
    },
    eq(col: string, v: unknown) {
      rec.filters.push([col, v]);
      return q;
    },
    limit() {
      return q;
    },
    then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) {
      return Promise.resolve(
        h.batchReadError
          ? { data: null, error: h.batchReadError }
          : { data: h.batchRows, error: null },
      ).then(res, rej);
    },
  };
  return q;
}
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: (table: string) => itemsQuery(table),
    rpc: (fn: string, args: Record<string, unknown>) => {
      h.rpcCalls.push({ fn, args });
      if (h.rpcError) return Promise.resolve({ data: null, error: h.rpcError });
      return Promise.resolve({
        data: fn === "mms_fire_cart" ? h.fireRows : h.unfired,
        error: null,
      });
    },
  }),
}));

const { staffFireCart, staffUndoFire } = await import("./staff-send");

const SESSION = "11111111-1111-4111-8111-111111111111";
const BATCH = "22222222-2222-4222-8222-222222222222";
const DEADLINE = "2026-09-24T18:00:10.000Z";

beforeEach(() => {
  h.auth = { kind: "staff", caller: { uid: "u-1", staffId: "st-1", role: "server" } };
  h.open = {
    session: {
      id: SESSION,
      status: "active",
      mode: "dinein",
      qr_code: "t-7",
      expires_at: "2026-09-24T20:00:00.000Z",
    },
    cart: { id: "cart-1", locked: false, locked_at: null, settle_at: null },
    unavailable: false,
  };
  h.paying = null;
  h.rpcCalls = [];
  h.fireRows = [{ fired: 3, batch: BATCH, fire_deadline: DEADLINE }];
  h.unfired = 2;
  h.rpcError = null;
  h.touched = [];
  h.renewed = [];
  h.reads = 0;
  // Three rows of qty 1 — the default where rows and units agree. The units case below separates them.
  h.batchRows = [{ qty: 1 }, { qty: 1 }, { qty: 1 }];
  h.batchReadError = null;
  h.itemReads = [];
});

describe("staffFireCart — refusals decided by where they happen", () => {
  it("a counter order is refused as `counter`, and the kitchen RPC is never called", async () => {
    h.open.session!.mode = "pickup";
    expect(await staffFireCart({ sessionId: SESSION })).toEqual({ ok: false, reason: "counter" });
    expect(h.rpcCalls).toEqual([]);
  });

  it("a payment in flight is refused as `paying`, with no fire", async () => {
    h.paying = "mid_payment";
    expect(await staffFireCart({ sessionId: SESSION })).toEqual({ ok: false, reason: "paying" });
    expect(h.rpcCalls).toEqual([]);
  });

  it("no open cart → `closed`; an unread table → `outage` (never a false verdict)", async () => {
    h.open = { session: h.open.session, cart: null, unavailable: false };
    expect(await staffFireCart({ sessionId: SESSION })).toEqual({ ok: false, reason: "closed" });
    h.open = { session: null, cart: null, unavailable: true };
    expect(await staffFireCart({ sessionId: SESSION })).toEqual({ ok: false, reason: "outage" });
    expect(h.rpcCalls).toEqual([]);
  });

  it("no staff session → `signin` before any table read; an unreachable auth → `outage`", async () => {
    h.auth = { kind: "anon" };
    expect(await staffFireCart({ sessionId: SESSION })).toEqual({ ok: false, reason: "signin" });
    h.auth = { kind: "unavailable" };
    expect(await staffFireCart({ sessionId: SESSION })).toEqual({ ok: false, reason: "outage" });
    expect(h.reads).toBe(0);
    expect(h.rpcCalls).toEqual([]);
  });

  it("a malformed session id → `invalid`, no read", async () => {
    expect(await staffFireCart({ sessionId: "nope" })).toEqual({ ok: false, reason: "invalid" });
    expect(h.reads).toBe(0);
  });

  it("an RPC error → `failed`; nothing fired → `nothing` (never 'all in the kitchen')", async () => {
    h.rpcError = { message: "boom" };
    expect(await staffFireCart({ sessionId: SESSION })).toEqual({ ok: false, reason: "failed" });
    h.rpcError = null;
    h.fireRows = [{ fired: 0, batch: BATCH, fire_deadline: DEADLINE }];
    expect(await staffFireCart({ sessionId: SESSION })).toEqual({ ok: false, reason: "nothing" });
    expect(h.touched).toEqual([]);
    expect(h.renewed).toEqual([]);
  });
});

describe("staffFireCart — a committed send", () => {
  it("fires THIS table's cart and hands back the batch, the deadline and the server clock", async () => {
    const r = await staffFireCart({ sessionId: SESSION });
    expect(h.rpcCalls).toEqual([{ fn: "mms_fire_cart", args: { p_cart_id: "cart-1" } }]);
    expect(r).toMatchObject({ ok: true, fired: 3, undoBatch: BATCH, undoUntil: DEADLINE });
    expect(r.ok && typeof r.serverNow).toBe("string");
    expect(r.ok && Number.isFinite(Date.parse(r.serverNow))).toBe(true);
  });

  it("`fired` is the UNITS the batch holds (sum of qty), not the rows the RPC updated", async () => {
    // One Mohinga ×3 and one tea: the RPC reports 2 rows; the kitchen got 4 dishes — the number the
    // "Send · 4 items" button promised and the notice must repeat.
    h.fireRows = [{ fired: 2, batch: BATCH, fire_deadline: DEADLINE }];
    h.batchRows = [{ qty: 3 }, { qty: 1 }];
    const r = await staffFireCart({ sessionId: SESSION });
    // MUTATION: return the row count as `fired` — "Sent 2 items" under "Send · 4 items"; red.
    expect(r).toMatchObject({ ok: true, fired: 4, undoBatch: BATCH });
    expect(h.itemReads).toEqual([
      {
        table: "qr_cart_items",
        cols: "qty",
        filters: [
          ["cart_id", "cart-1"],
          ["fire_batch", BATCH],
        ],
      },
    ]);
  });

  it("an unreadable units read falls back to the row count — never more than was fired", async () => {
    h.fireRows = [{ fired: 2, batch: BATCH, fire_deadline: DEADLINE }];
    h.batchReadError = { message: "boom" };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await staffFireCart({ sessionId: SESSION })).toMatchObject({ ok: true, fired: 2 });
    spy.mockRestore();
  });

  it("re-syncs the host's phone and slides the table's expiry, from the session's own stamp", async () => {
    await staffFireCart({ sessionId: SESSION });
    expect(h.touched).toEqual(["cart-1"]);
    expect(h.renewed).toHaveLength(1);
    expect(h.renewed[0]!.slice(1)).toEqual([SESSION, "2026-09-24T20:00:00.000Z"]);
  });
});

describe("staffUndoFire — takes back exactly this send's batch", () => {
  it("undoes THIS cart's batch and re-syncs", async () => {
    expect(await staffUndoFire({ sessionId: SESSION, batch: BATCH })).toEqual({
      ok: true,
      unfired: 2,
    });
    expect(h.rpcCalls).toEqual([
      { fn: "mms_undo_fire", args: { p_cart_id: "cart-1", p_batch: BATCH } },
    ]);
    expect(h.touched).toEqual(["cart-1"]);
    expect(h.renewed).toHaveLength(1);
  });

  it("0 lines taken back while the batch's lines still carry it → `expired` (the kitchen has it)", async () => {
    h.unfired = 0;
    h.batchRows = [{ qty: 1 }];
    expect(await staffUndoFire({ sessionId: SESSION, batch: BATCH })).toEqual({
      ok: false,
      reason: "expired",
    });
    // MUTATION: answer `gone` without looking — "nothing is with the kitchen" over a dish being
    // cooked, and nobody reaches for Void / Comp; red.
    expect(h.itemReads).toEqual([
      {
        table: "qr_cart_items",
        cols: "id",
        filters: [
          ["cart_id", "cart-1"],
          ["fire_batch", BATCH],
        ],
      },
    ]);
    expect(h.touched).toEqual([]);
  });

  it("0 lines taken back and NO line still carries the batch → `gone` (an earlier undo landed)", async () => {
    // The first undo's response was lost; the retry finds the batch already brought back (undo
    // clears fire_batch) or voided. "Too late — the kitchen has it" would send staff to Void a dish
    // that was never cooking.
    h.unfired = 0;
    h.batchRows = [];
    // MUTATION: drop the `gone` arm (always `expired`); red.
    expect(await staffUndoFire({ sessionId: SESSION, batch: BATCH })).toEqual({
      ok: false,
      reason: "gone",
    });
    expect(h.touched).toEqual([]);
  });

  it("an unreadable batch check stays `expired` — the steer that sends staff to look", async () => {
    h.unfired = 0;
    h.batchReadError = { message: "boom" };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    // MUTATION: an unread check answers `gone` — a comforting "nothing is with the kitchen" read
    // off no evidence; red.
    expect(await staffUndoFire({ sessionId: SESSION, batch: BATCH })).toEqual({
      ok: false,
      reason: "expired",
    });
    spy.mockRestore();
  });

  it("no staff session → `signin`; an unreachable auth → `outage` — no read, no RPC", async () => {
    h.auth = { kind: "anon" };
    expect(await staffUndoFire({ sessionId: SESSION, batch: BATCH })).toEqual({
      ok: false,
      reason: "signin",
    });
    h.auth = { kind: "signin" };
    expect(await staffUndoFire({ sessionId: SESSION, batch: BATCH })).toEqual({
      ok: false,
      reason: "signin",
    });
    h.auth = { kind: "unavailable" };
    expect(await staffUndoFire({ sessionId: SESSION, batch: BATCH })).toEqual({
      ok: false,
      reason: "outage",
    });
    expect(h.reads).toBe(0);
    expect(h.rpcCalls).toEqual([]);
    expect(h.itemReads).toEqual([]);
  });

  it("the same prefix refuses: counter, paying, invalid batch", async () => {
    h.paying = "mid_payment";
    expect(await staffUndoFire({ sessionId: SESSION, batch: BATCH })).toEqual({
      ok: false,
      reason: "paying",
    });
    h.paying = null;
    h.open.session!.mode = "scango";
    expect(await staffUndoFire({ sessionId: SESSION, batch: BATCH })).toEqual({
      ok: false,
      reason: "counter",
    });
    expect(await staffUndoFire({ sessionId: SESSION, batch: "x" })).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(h.rpcCalls).toEqual([]);
  });
});
