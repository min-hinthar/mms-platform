import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PendingFlag } from "./settle-approvals";

/**
 * PD8 — the table detail carries the open cart's pending requests (`pendingRequests`) off the ONE
 * read the settle doors compare against (`readPendingApprovalFlags`), and the lines' shipped
 * `pendingApproval` is derived from the same flags. An unreadable read draws no flag (the dish stays
 * charged; the door's own read re-warns) and never an outage.
 */
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("./posthog-server", () => ({
  getPostHogClient: () => ({ capture() {}, flush: () => Promise.resolve() }),
}));
vi.mock("./authz", () => ({ AuthzError: class AuthzError extends Error {} }));
vi.mock("./staff", () => ({
  getStaffAuth: () =>
    Promise.resolve({
      kind: "staff",
      caller: { uid: "u", staffId: "st", role: "server", displayName: "S", email: null },
    }),
  requireStaff: () => Promise.resolve({}),
  staffGate: () => Promise.resolve({ ok: true, caller: {} }),
  STAFF_WRITE_OUTAGE: "outage",
}));
vi.mock("./pay-guard", () => ({
  isFresh: () => false,
  paymentInFlightReason: () => Promise.resolve(null),
}));
vi.mock("@mms/db/schemas", () => ({
  clearTableInput: { safeParse: (x: unknown) => ({ success: true, data: x }) },
  mergeTablesInput: { safeParse: (x: unknown) => ({ success: true, data: x }) },
}));
vi.mock("./totals", () => ({
  getCartTotals: () =>
    Promise.resolve({
      subtotalCents: 1400,
      discountCents: 0,
      rewardCents: 0,
      rewardFaceCents: 0,
      promoCents: 0,
      serviceChargeCents: 0,
      taxCents: 147,
      tipCents: 0,
      totalCents: 1547,
    }),
}));
let flags: PendingFlag[] | null = [];
vi.mock("./approvals-read", () => ({
  readPendingApprovalFlags: () => Promise.resolve(flags),
}));

type Row = Record<string, unknown>;
const cartRow: Row = {
  id: "c-1",
  status: "open",
  locked: false,
  locked_at: null,
  settle_at: null,
  tab_type: "none",
  tab_opened_at: null,
  intended_tip_cents: null,
  promo_code: null,
};
const itemRows: Row[] = [
  {
    id: "l-1",
    name: "Mohinga",
    qty: 1,
    unit_price_cents: 1400,
    by_seat: null,
    created_at: "2026-10-08T10:00:00.000Z",
    menu_item_id: null,
    state: "in_progress",
    comped: false,
    notes: null,
  },
  {
    id: "l-2",
    name: "Parata",
    qty: 1,
    unit_price_cents: 500,
    by_seat: null,
    created_at: "2026-10-08T10:01:00.000Z",
    menu_item_id: null,
    state: "served",
    comped: false,
    notes: null,
  },
];
function tableApi(name: string) {
  const eqs: [string, unknown][] = [];
  const api = {
    select: () => api,
    eq(col: string, val: unknown) {
      eqs.push([col, val]);
      return api;
    },
    in: () => api,
    order: () => api,
    limit: () => api,
    maybeSingle() {
      if (name === "table_sessions")
        return Promise.resolve({
          data: {
            id: "s-1",
            qr_code: "t-7",
            table_number: 7,
            mode: "dinein",
            status: "active",
            host_seat: null,
            created_at: "2026-10-08T09:00:00.000Z",
          },
          error: null,
        });
      if (name === "qr_carts") {
        const hit = eqs.every(([col, val]) => !(col in cartRow) || cartRow[col] === val);
        return Promise.resolve({ data: hit ? cartRow : null, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    then(resolve: (r: { data: Row[]; error: null }) => void) {
      resolve({ data: name === "qr_cart_items" ? itemRows : [], error: null });
    },
  };
  return api;
}
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: (name: string) => tableApi(name),
    rpc: () => Promise.resolve({ data: null, error: null }),
  }),
}));

const { getTableDetail } = await import("./floor");
const SESSION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const flag: PendingFlag = {
  id: "r-1",
  kind: "void",
  lineId: "l-1",
  lineName: "Mohinga",
  nameMy: null,
  qty: 1,
  amountCents: 1400,
  cooked: true,
  initiatorName: "Thiri",
  initiatorStaffId: "thiri",
  createdAt: "2026-10-08T10:05:00.000Z",
};

beforeEach(() => {
  flags = [flag];
});

describe("getTableDetail — the flag at Take payment (PD8)", () => {
  it("carries the cart's pending requests, and marks their lines as pending", async () => {
    const res = await getTableDetail(SESSION);
    expect(res.kind).toBe("detail");
    if (res.kind !== "detail") throw new Error("unreachable: asserted detail above");
    expect(res.detail.pendingRequests.map((r) => r.id)).toEqual(["r-1"]);
    expect(res.detail.lines.map((l) => [l.id, l.pendingApproval])).toEqual([
      ["l-1", true],
      ["l-2", false],
    ]);
  });
  it("an unreadable pending read draws no flag and is never an outage — the dish stays charged", async () => {
    flags = null;
    const res = await getTableDetail(SESSION);
    expect(res.kind).toBe("detail");
    if (res.kind !== "detail") throw new Error("unreachable: asserted detail above");
    expect(res.detail.pendingRequests).toEqual([]);
    expect(res.detail.lines.every((l) => !l.pendingApproval)).toBe(true);
  });
});
