import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * No-PIN (owner, 2026-10-24) — `listApprovers` carries the caller's own row (`self`), which the
 * approvals decision reads to name the decider; and `voidLine` sends the SIGNED-IN caller as the
 * approver of their own gated write when they are a manager or owner, and nobody when they are a
 * server — mapping the SQL's `needs_approval` (and the pre-migration `self_approve`) to
 * `needs_manager`, the sheet's request path.
 */
vi.mock("server-only", () => ({}));
// OA9 — the console lock, read by every money-out and price-authority write.
let consoleLocked = false;
vi.mock("./staff-lock", () => ({ isConsoleLocked: () => Promise.resolve(consoleLocked) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("./posthog-server", () => ({ getPostHogClient: () => ({ capture() {}, flush() {} }) }));
let caller = { staffId: "thiri", displayName: "Thiri", role: "server" };
vi.mock("./staff", () => ({
  requireStaff: () => Promise.resolve(caller),
  getStaffAuth: () => Promise.resolve({ kind: "staff", caller }),
}));
vi.mock("./pay-guard", () => ({ paymentInFlightReason: () => Promise.resolve(null) }));
vi.mock("./order-lines", () => ({ touchCart: () => Promise.resolve() }));
vi.mock("./staff-open-cart", () => ({ openCartFor: () => Promise.resolve({}) }));
vi.mock("./counter-order", () => ({ isCounterOrder: () => false, noShowOutcome: () => "ok" }));

let staffRows = [
  { user_id: "aye", display_name: "Aye", role: "manager", active: true },
  { user_id: "nu", display_name: "Nu", role: "manager", active: true },
];
let rpcAnswer: string = "ok";
const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
const SESSION = "11111111-1111-4111-8111-111111111111";
const LINE = "22222222-2222-4222-8222-222222222222";

/** A chain that answers by table: the roster read, the open cart, the line. */
function chain(table: string) {
  const c: Record<string, unknown> = {
    select: () => c,
    in: () => c,
    eq: () => c,
    limit: () => Promise.resolve({ data: staffRows, error: null }),
    maybeSingle: () =>
      Promise.resolve(
        table === "qr_carts"
          ? { data: { id: "cart-1", locked: false, locked_at: null, settle_at: null }, error: null }
          : { data: { id: LINE }, error: null },
      ),
  };
  return c;
}
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: (table: string) => chain(table),
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return Promise.resolve({ data: rpcAnswer, error: null });
    },
  }),
}));

const { listApprovers, voidLine } = await import("./voids");

beforeEach(() => {
  rpcAnswer = "ok";
  rpcCalls.length = 0;
  staffRows = [
    { user_id: "aye", display_name: "Aye", role: "manager", active: true },
    { user_id: "nu", display_name: "Nu", role: "manager", active: true },
  ];
});

describe("listApprovers — the caller's own row", () => {
  beforeEach(() => {
    caller = { staffId: "thiri", displayName: "Thiri", role: "server" };
  });
  it("lists the managers and carries the server caller as `self`", async () => {
    const roster = await listApprovers();
    expect(roster.map((a) => [a.staffId, a.role, a.active, a.self])).toEqual([
      ["aye", "manager", true, false],
      ["nu", "manager", true, false],
      ["thiri", "server", true, true],
    ]);
  });
  it("a manager caller is marked `self` on their own roster row — never listed twice", async () => {
    caller = { staffId: "aye", displayName: "Aye", role: "manager" };
    const roster = await listApprovers();
    expect(roster.filter((a) => a.staffId === "aye")).toHaveLength(1);
    expect(roster.map((a) => [a.staffId, a.self])).toEqual([
      ["aye", true],
      ["nu", false],
    ]);
  });
});

describe("voidLine — No-PIN: the signed-in caller is the approver", () => {
  const input = { sessionId: SESSION, cartItemId: LINE, action: "comp", reason: "quality" };

  it("a manager is sent as the approver of their own comp, and it lands", async () => {
    caller = { staffId: "aye", displayName: "Aye", role: "manager" };
    expect(await voidLine(input)).toEqual({ ok: true, action: "comp" });
    const call = rpcCalls.find((c) => c.fn === "mms_void_line")!;
    expect(call.args).toMatchObject({ p_initiator: "aye", p_approver: "aye" });
  });

  it("a server is sent with NO approver, and a gated line answers needs_manager", async () => {
    caller = { staffId: "thiri", displayName: "Thiri", role: "server" };
    rpcAnswer = "needs_approval";
    expect(await voidLine(input)).toEqual({ ok: false, reason: "needs_manager" });
    const call = rpcCalls.find((c) => c.fn === "mms_void_line")!;
    expect(call.args.p_approver).toBeUndefined();
  });

  it("the PRE-migration self_approve reads as needs_manager — the request path, never a dead refusal (`voids/self-approve-dead-end`)", async () => {
    caller = { staffId: "aye", displayName: "Aye", role: "manager" };
    rpcAnswer = "self_approve";
    expect(await voidLine(input)).toEqual({ ok: false, reason: "needs_manager" });
  });

  it("a PIN an older client still sends is never read — the parse strips it", async () => {
    caller = { staffId: "thiri", displayName: "Thiri", role: "server" };
    rpcAnswer = "needs_approval";
    await voidLine({ ...input, approverStaffId: "aye", pin: "1234" });
    expect(rpcCalls.find((c) => c.fn === "mms_void_line")!.args.p_approver).toBeUndefined();
  });
});

describe("voidLine — OA9: a locked console voids nothing", () => {
  it("answers `locked` before any RPC (`voids/void-locked`)", async () => {
    caller = { staffId: "aye", displayName: "Aye", role: "manager" };
    consoleLocked = true;
    expect(
      await voidLine({ sessionId: SESSION, cartItemId: LINE, action: "comp", reason: "quality" }),
    ).toEqual({ ok: false, reason: "locked" });
    expect(rpcCalls).toEqual([]);
  });
});
