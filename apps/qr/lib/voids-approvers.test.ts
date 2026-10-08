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
vi.mock("./staff", () => ({
  requireStaff: () => Promise.resolve({ staffId: "thiri" }),
  getStaffAuth: () => Promise.resolve({ kind: "staff", caller: { staffId: "thiri" } }),
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

describe("listApprovers — the PIN join (PD8)", () => {
  it("marks exactly the managers with a tablet PIN", async () => {
    const roster = await listApprovers();
    expect(roster.map((a) => [a.staffId, a.hasPin, a.active])).toEqual([
      ["aye", true, true],
      ["nu", false, true],
    ]);
  });
  it("a failed PIN read is an outage, never 'nobody has a PIN'", async () => {
    pinsFail = true;
    await expect(listApprovers()).rejects.toThrow();
  });
});
