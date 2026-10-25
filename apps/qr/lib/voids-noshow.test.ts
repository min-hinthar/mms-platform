import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 2f · P2v (owner decision 7b) — `recordCounterNoShow`: a counter order whose guest never came
 * writes off only its SENT food, through the loss gate, and invents no money. Every branch in the
 * action's order, asserted by the REASON it answers and the CALLS it makes (the SQL — `mms_counter_no_show`
 * — re-derives the sent set, the gate and the approver's role; this suite proves the action reaches
 * it honestly). Each case is the one a `p2f-lib/voids/*` mutant turns red.
 */
const h = vi.hoisted(() => ({
  auth: { kind: "staff", caller: { uid: "u-1", staffId: "st-1", role: "server" } } as {
    kind: string;
    caller?: { uid: string; staffId: string; role: string };
  },
  open: {
    session: { id: "s", status: "active", mode: "pickup", qr_code: "reg-ab12", expires_at: "x" },
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
  rpc: { data: "ok", error: null } as { data: unknown; error: { message: string } | null },
  calls: [] as string[],
  rpcArgs: null as null | Record<string, unknown>,
  touched: [] as string[],
  revalidated: [] as string[],
}));

vi.mock("server-only", () => ({}));
// OA9 — the console lock, read by every money-out and price-authority write.
let consoleLocked = false;
vi.mock("./staff-lock", () => ({ isConsoleLocked: () => Promise.resolve(consoleLocked) }));
vi.mock("next/cache", () => ({
  revalidatePath: (p: string) => {
    h.revalidated.push(p);
  },
}));
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("./posthog-server", () => ({
  getPostHogClient: () => ({ capture() {}, flush: () => Promise.resolve() }),
}));
vi.mock("./authz", () => ({ AuthzError: class AuthzError extends Error {} }));
vi.mock("./staff", () => ({
  getStaffAuth: () => Promise.resolve(h.auth),
  requireStaff: () => Promise.resolve({}),
}));
vi.mock("./staff-open-cart", () => ({ openCartFor: () => Promise.resolve(h.open) }));
vi.mock("./pay-guard", () => ({
  paymentInFlightReason: () => {
    h.calls.push("payGuard");
    return Promise.resolve(h.paying);
  },
}));
vi.mock("./order-lines", () => ({
  touchCart: (id: string) => {
    h.touched.push(id);
    return Promise.resolve();
  },
}));
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    rpc: (fn: string, args: Record<string, unknown>) => {
      h.calls.push(fn);
      h.rpcArgs = args;
      return Promise.resolve(h.rpc);
    },
  }),
}));

// Cross-area decision (Phase 2f review): `counterNoShowInput` gains `expectedLineIds` — the SENT
// line ids the sheet showed the approver (uuid[], max 200). The schema is the db area's; until it
// lands this suite states it (resolves at integration — drop this mock once the real one carries it).
vi.mock("@mms/db/schemas", async (orig) => {
  const real = await orig<typeof import("@mms/db/schemas")>();
  const uuid = real.counterNoShowInput.shape.sessionId;
  return {
    ...real,
    counterNoShowInput: real.counterNoShowInput.extend({
      expectedLineIds: uuid.array().max(200),
    }),
  };
});

const { recordCounterNoShow } = await import("./voids");

const SESSION = "11111111-1111-4111-8111-111111111111";
const MANAGER = "22222222-2222-4222-8222-222222222222";
const LINE_A = "33333333-3333-4333-8333-333333333333";
const LINE_B = "44444444-4444-4444-8444-444444444444";
/** What the sheet showed: the order's sent lines. */
const SAW = [LINE_A, LINE_B];

beforeEach(() => {
  h.auth = { kind: "staff", caller: { uid: "u-1", staffId: "st-1", role: "server" } };
  h.open = {
    session: {
      id: SESSION,
      status: "active",
      mode: "pickup",
      qr_code: "reg-ab12",
      expires_at: "x",
    },
    cart: { id: "cart-1", locked: false, locked_at: null, settle_at: null },
    unavailable: false,
  };
  h.paying = null;
  h.rpc = { data: "ok", error: null };
  h.calls = [];
  h.rpcArgs = null;
  h.touched = [];
  h.revalidated = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("recordCounterNoShow — refusals, in the action's order", () => {
  it("an unreachable gate is an outage; no staff session is an error — no read, no RPC", async () => {
    h.auth = { kind: "unavailable" };
    expect(await recordCounterNoShow({ sessionId: SESSION, expectedLineIds: SAW })).toEqual({
      ok: false,
      reason: "outage",
    });
    h.auth = { kind: "anon" };
    expect(await recordCounterNoShow({ sessionId: SESSION, expectedLineIds: SAW })).toEqual({
      ok: false,
      reason: "error",
    });
    expect(h.calls).toEqual([]);
  });

  it("a malformed input is an error", async () => {
    expect(await recordCounterNoShow({ sessionId: "nope", expectedLineIds: SAW })).toEqual({
      ok: false,
      reason: "error",
    });
  });

  it("no record of what the approver saw is an error — no read, no RPC (the cross-area decision)", async () => {
    // A write-off approved against NOTHING shown is the hole the review found: the approver's PIN
    // must be tied to the food it is writing off.
    expect(await recordCounterNoShow({ sessionId: SESSION })).toEqual({
      ok: false,
      reason: "error",
    });
    expect(h.calls).toEqual([]);
  });

  it("an unread order is an outage; a closed one (or no open cart) is not_open", async () => {
    h.open = { session: null, cart: null, unavailable: true };
    expect(await recordCounterNoShow({ sessionId: SESSION, expectedLineIds: SAW })).toEqual({
      ok: false,
      reason: "outage",
    });
    h.open = { session: null, cart: null, unavailable: false };
    expect(await recordCounterNoShow({ sessionId: SESSION, expectedLineIds: SAW })).toEqual({
      ok: false,
      reason: "not_open",
    });
    expect(h.calls).toEqual([]);
  });

  it("a table (or a kiosk order) is not_counter — before any payment check or RPC", async () => {
    // no-show-counter-check-dropped
    h.open.session = { ...h.open.session!, mode: "dinein", qr_code: "t-7" };
    expect(await recordCounterNoShow({ sessionId: SESSION, expectedLineIds: SAW })).toEqual({
      ok: false,
      reason: "not_counter",
    });
    h.open.session = { ...h.open.session!, mode: "pickup", qr_code: "kiosk-ab12" };
    expect(await recordCounterNoShow({ sessionId: SESSION, expectedLineIds: SAW })).toEqual({
      ok: false,
      reason: "not_counter",
    });
    expect(h.calls).toEqual([]);
  });

  it("a payment in flight is in_flight — no RPC", async () => {
    // no-show-in-flight-ignored
    h.paying = "mid_payment";
    expect(await recordCounterNoShow({ sessionId: SESSION, expectedLineIds: SAW })).toEqual({
      ok: false,
      reason: "in_flight",
    });
    expect(h.calls).not.toContain("mms_counter_no_show");
  });
});

describe("recordCounterNoShow — the RPC", () => {
  it("solo: the RPC gets this cart, the initiator and NO approver", async () => {
    expect(await recordCounterNoShow({ sessionId: SESSION, expectedLineIds: SAW })).toEqual({
      ok: true,
    });
    expect(h.rpcArgs).toEqual({
      p_cart_id: "cart-1",
      p_initiator: "st-1",
      p_approver: undefined,
      p_expected_line_ids: SAW,
    });
  });

  it("the RPC gets EXACTLY the sent lines the sheet showed — the SQL refuses any other set", async () => {
    // p2f-rev-lib/voids/no-show-expected-lines-dropped
    await recordCounterNoShow({ sessionId: SESSION, expectedLineIds: [LINE_B] });
    expect(h.rpcArgs?.p_expected_line_ids).toEqual([LINE_B]);
  });

  it("No-PIN — a MANAGER caller is forwarded as the approver of their own write-off (`p2f-lib/voids/no-show-approver-not-forwarded`)", async () => {
    h.auth = { kind: "staff", caller: { uid: "u-2", staffId: MANAGER, role: "manager" } };
    await recordCounterNoShow({ sessionId: SESSION, expectedLineIds: SAW });
    expect(h.rpcArgs).toMatchObject({ p_initiator: MANAGER, p_approver: MANAGER });
  });

  it("an approver id and PIN an older client still sends are never forwarded — a server stays solo", async () => {
    await recordCounterNoShow({
      sessionId: SESSION,
      expectedLineIds: SAW,
      approverStaffId: MANAGER,
      pin: "1234",
    });
    expect(h.rpcArgs?.p_approver).toBeUndefined();
  });

  it.each([
    ["needs_approval", "needs_manager"],
    ["self_approve", "needs_manager"],
    ["bad_approver", "bad_approver"],
    ["not_found", "not_open"],
    ["not_open", "not_open"],
    ["not_counter", "not_counter"],
    ["in_flight", "in_flight"],
    ["nothing_sent", "nothing_sent"],
    // the order's sent food moved since the approver looked — nothing written
    ["changed", "changed"],
    ["surprise", "error"],
  ])("RPC %s → %s, and nothing is touched", async (status, reason) => {
    h.rpc = { data: status, error: null };
    expect(await recordCounterNoShow({ sessionId: SESSION, expectedLineIds: SAW })).toEqual({
      ok: false,
      reason,
    });
    expect(h.touched).toEqual([]);
  });

  it("an RPC error is an error, never ok", async () => {
    h.rpc = { data: null, error: { message: "boom" } };
    expect(await recordCounterNoShow({ sessionId: SESSION, expectedLineIds: SAW })).toEqual({
      ok: false,
      reason: "error",
    });
    expect(h.touched).toEqual([]);
  });

  it("ok: the cart is touched and the table, floor and kitchen pages refreshed", async () => {
    expect(await recordCounterNoShow({ sessionId: SESSION, expectedLineIds: SAW })).toEqual({
      ok: true,
    });
    expect(h.touched).toEqual(["cart-1"]);
    expect(h.revalidated).toEqual(
      expect.arrayContaining(["/staff", `/staff/table/${SESSION}`, "/staff/kitchen"]),
    );
  });
});

describe("recordCounterNoShow — OA9: a locked console writes nothing off", () => {
  it("answers `locked` before any read or RPC (`voids/noshow-locked`)", async () => {
    consoleLocked = true;
    expect(await recordCounterNoShow({ sessionId: SESSION, expectedLineIds: SAW })).toEqual({
      ok: false,
      reason: "locked",
    });
    expect(h.calls).toEqual([]);
    expect(h.rpcArgs).toBeNull();
  });
});
