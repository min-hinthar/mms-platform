import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * PD8 · M184 — the resolve's WIRING for the two new arms, and the count's verdict:
 *   · a CLOSE runs the step-up pre-flight with NO self rule (`null`), approve with the request's
 *     initiator — the asker may close their own stale request, never approve it;
 *   · a CLOSE is never held by the pay-mutex read (nothing about the line is touched);
 *   · the SQL's `changed` / `still_open` reach the caller as their own reasons, never `error`;
 *   · the bar's count never answers a false 0.
 * Asserted as CALLS and values (the degenerate-mock lesson), each a mutant in verify:slice.
 */
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("./posthog-server", () => ({ getPostHogClient: () => ({ capture() {}, flush() {} }) }));
vi.mock("./order-lines", () => ({ touchCart: () => Promise.resolve() }));
vi.mock("./line-names", () => ({
  loadLineNames: () => Promise.resolve({ nameMyByRef: new Map(), optionNameMy: new Map() }),
}));
let gateOk = true;
vi.mock("./staff", () => ({
  getStaffAuth: () =>
    Promise.resolve({
      kind: "staff",
      caller: { uid: "u-aye", staffId: "aye", role: "manager", displayName: "Aye", email: null },
    }),
  requireStaff: () =>
    gateOk ? Promise.resolve({ staffId: "aye" }) : Promise.reject(new Error("no")),
}));
const preflight = vi.fn((): Promise<string> => Promise.resolve("ok"));
vi.mock("./staff-pin", () => ({
  approverStepUpAllowed: (...a: unknown[]) => preflight(...(a as [])),
  verifyStaffPin: () => Promise.resolve({ status: "ok" }),
}));
let payInFlight: string | null = null;
vi.mock("./pay-guard", () => ({ paymentInFlightReason: () => Promise.resolve(payInFlight) }));

let rpcStatus = "ok";
const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
let countRead: { count: number | null; error: unknown } = { count: 0, error: null };
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return Promise.resolve({ data: rpcStatus, error: null });
    },
    from: (table: string) => ({
      select: (_cols: string, opts?: { head?: boolean }) =>
        opts?.head
          ? { eq: () => Promise.resolve(countRead) }
          : {
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data:
                      table === "mms_approvals"
                        ? {
                            id: REQ,
                            cart_id: "cart-1",
                            session_id: null,
                            status: "pending",
                            initiator_staff_id: "thiri",
                          }
                        : table === "qr_carts"
                          ? { id: "cart-1", locked: false, locked_at: null, settle_at: null }
                          : null,
                    error: null,
                  }),
              }),
            },
    }),
  }),
}));

const REQ = "33333333-3333-4333-8333-333333333333";
const APPROVER = "44444444-4444-4444-8444-444444444444";
const { resolveApproval, countPendingApprovals } = await import("./approvals");

beforeEach(() => {
  preflight.mockClear();
  rpcCalls.length = 0;
  rpcStatus = "ok";
  payInFlight = null;
  gateOk = true;
  countRead = { count: 0, error: null };
});

const input = (decision: string) => ({
  approvalId: REQ,
  decision,
  approverStaffId: APPROVER,
  pin: "1234",
});

describe("resolveApproval — the close arm's wiring (PD8 · D2)", () => {
  it("a CLOSE pre-flights with NO self rule, and reaches the RPC as p_decision 'close'", async () => {
    const res = await resolveApproval(input("close"));
    expect(preflight).toHaveBeenCalledWith(APPROVER, "aye", null);
    expect(rpcCalls).toEqual([
      {
        fn: "mms_resolve_approval",
        args: { p_id: REQ, p_approver: APPROVER, p_decision: "close" },
      },
    ]);
    expect(res).toEqual({ ok: true, decision: "close" });
  });
  it("an APPROVE pre-flights against the REQUEST's initiator (the shipped rule, kept)", async () => {
    await resolveApproval(input("approve"));
    expect(preflight).toHaveBeenCalledWith(APPROVER, "aye", "thiri");
  });
  it("a CLOSE is never held by the pay mutex — nothing about the line is touched", async () => {
    payInFlight = "mid_payment";
    const res = await resolveApproval(input("close"));
    expect(res).toEqual({ ok: true, decision: "close" });
    // …while an approve under the same mutex is still refused (the shipped B2 guard).
    expect(await resolveApproval(input("approve"))).toEqual({ ok: false, reason: "in_flight" });
  });
  it("the SQL's `changed` and `still_open` are their own reasons, never `error`", async () => {
    rpcStatus = "changed";
    expect(await resolveApproval(input("approve"))).toEqual({ ok: false, reason: "changed" });
    rpcStatus = "still_open";
    expect(await resolveApproval(input("close"))).toEqual({ ok: false, reason: "still_open" });
  });
  it("a decision the schema does not know is refused before any read", async () => {
    expect(await resolveApproval(input("supersede"))).toEqual({ ok: false, reason: "error" });
    expect(preflight).not.toHaveBeenCalled();
  });
});

describe("countPendingApprovals — never a false 0 (PD8)", () => {
  it("a read error is unknown, never zero", async () => {
    countRead = { count: null, error: { message: "down" } };
    expect(await countPendingApprovals()).toEqual({ ok: false });
  });
  it("a count is the count — zero included", async () => {
    countRead = { count: 2, error: null };
    expect(await countPendingApprovals()).toEqual({ ok: true, count: 2 });
    countRead = { count: 0, error: null };
    expect(await countPendingApprovals()).toEqual({ ok: true, count: 0 });
  });
  it("an unauthorized caller is unknown too (the circle is drawn only for a manager)", async () => {
    gateOk = false;
    expect(await countPendingApprovals()).toEqual({ ok: false });
  });
});
