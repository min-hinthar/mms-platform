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
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
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

  it("0 lines taken back → `expired` (the kitchen has it), never a silent success", async () => {
    h.unfired = 0;
    expect(await staffUndoFire({ sessionId: SESSION, batch: BATCH })).toEqual({
      ok: false,
      reason: "expired",
    });
    expect(h.touched).toEqual([]);
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
