import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * PD8 — `listApprovers` joins `staff_pins` for `hasPin`, the fact `eligibleApprovers` filters on.
 * A failed PIN read is an OUTAGE like a failed roster read — never "nobody has a PIN", which would
 * promote the deferred request and tell a server nobody can sign while a manager stands there.
 */
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("./posthog-server", () => ({ getPostHogClient: () => ({ capture() {}, flush() {} }) }));
let caller = { staffId: "thiri", displayName: "Thiri", role: "server" };
vi.mock("./staff", () => ({
  requireStaff: () => Promise.resolve(caller),
  getStaffAuth: () => Promise.resolve({ kind: "staff", caller }),
}));
vi.mock("./staff-pin", () => ({
  approverStepUpAllowed: () => Promise.resolve("ok"),
  verifyStaffPin: () => Promise.resolve({ status: "ok" }),
}));
vi.mock("./pay-guard", () => ({ paymentInFlightReason: () => Promise.resolve(null) }));
vi.mock("./order-lines", () => ({ touchCart: () => Promise.resolve() }));
vi.mock("./staff-open-cart", () => ({ openCartFor: () => Promise.resolve({}) }));
vi.mock("./counter-order", () => ({ isCounterOrder: () => false, noShowOutcome: () => "ok" }));

let staffRows = [
  { user_id: "aye", display_name: "Aye", role: "manager", active: true },
  { user_id: "nu", display_name: "Nu", role: "manager", active: true },
];
let pinRows: { staff_id: string }[] = [{ staff_id: "aye" }];
let pinsFail = false;
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: (table: string) => ({
      select: () => ({
        in: (_c: string, ids: string[]) =>
          table === "staff_pins"
            ? Promise.resolve(
                pinsFail
                  ? { data: null, error: { message: "down" } }
                  : { data: pinRows.filter((p) => ids.includes(p.staff_id)), error: null },
              )
            : {
                eq: () => ({
                  limit: () => Promise.resolve({ data: staffRows, error: null }),
                }),
              },
      }),
    }),
  }),
}));

const { listApprovers } = await import("./voids");

beforeEach(() => {
  pinsFail = false;
  pinRows = [{ staff_id: "aye" }];
  staffRows = [
    { user_id: "aye", display_name: "Aye", role: "manager", active: true },
    { user_id: "nu", display_name: "Nu", role: "manager", active: true },
  ];
});

describe("listApprovers — the PIN join and the caller's own row (PD8)", () => {
  beforeEach(() => {
    caller = { staffId: "thiri", displayName: "Thiri", role: "server" };
  });
  it("marks exactly the managers with a tablet PIN, and carries the server caller as `self`", async () => {
    const roster = await listApprovers();
    expect(roster.map((a) => [a.staffId, a.role, a.hasPin, a.active, a.self])).toEqual([
      ["aye", "manager", true, true, false],
      ["nu", "manager", false, true, false],
      ["thiri", "server", false, true, true],
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
  it("a failed PIN read is an outage, never 'nobody has a PIN'", async () => {
    pinsFail = true;
    await expect(listApprovers()).rejects.toThrow();
  });
});
