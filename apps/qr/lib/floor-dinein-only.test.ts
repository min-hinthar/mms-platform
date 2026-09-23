import { beforeEach, describe, expect, it, vi } from "vitest";
/**
 * K21 (Phase 0) — THE FLOOR IS THE ROOM.
 *
 * A to-go or scan-&-go phone mints its own session the moment a diner opens the menu, and the floor
 * drew every one of them as a table card titled `pickup-1d7e294a-…` (27 of 33 cards, measured).
 * The floor's session read now admits dine-in only. The fake below EVALUATES `.eq()` on the session
 * list, so a read that drops the guard hands the phones back and the case goes red on the OUTCOME,
 * not on a call transcript.
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
      subtotalCents: 5000,
      discountCents: 0,
      rewardCents: 0,
      rewardFaceCents: 0,
      promoCents: 0,
      serviceChargeCents: 0,
      taxCents: 330,
      tipCents: 0,
      totalCents: 5330,
    }),
}));

type Row = Record<string, unknown>;
const NOW = "2026-09-22T19:00:00.000Z";
const session = (id: string, qr_code: string, mode: string, table_number: number | null): Row => ({
  id,
  qr_code,
  table_number,
  mode,
  status: "active",
  host_seat: null,
  created_at: NOW,
});
let sessionRows: Row[] = [];

function tableApi(name: string) {
  const eqs: [string, unknown][] = [];
  const api: Record<string, unknown> = {
    select: () => api,
    eq(col: string, val: unknown) {
      eqs.push([col, val]);
      return api;
    },
    in: () => api,
    order: () => api,
    limit: () => api,
    gt: () => api,
    not: () => api,
    or: () => api,
    is: () => api,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    then(resolve: (r: { data: Row[] | null; error: unknown }) => void) {
      if (name === "table_sessions")
        return resolve({
          data: sessionRows.filter((r) => eqs.every(([c, v]) => !(c in r) || r[c] === v)),
          error: null,
        });
      resolve({ data: [], error: null });
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

const { getFloorView } = await import("./floor");

beforeEach(() => {
  sessionRows = [
    session("s-7", "3F9A2C1B", "dinein", 7),
    session("s-p", "pickup-1d7e294a-0000-4000-8000-000000000001", "pickup", null),
    session("s-g", "scango-9b1c2d3e-0000-4000-8000-000000000002", "scango", null),
    session("s-k", "kiosk-4", "dinein", 4), // a kiosk DINE-IN claim keeps its card (W6b)
  ];
});

describe("K21 — the floor draws tables, never phones browsing the menu", () => {
  it("admits dine-in sessions only", async () => {
    const r = await getFloorView();
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable: asserted ok above");
    // MUTATION: drop `.eq("mode", "dinein")` from the floor's session read → the pickup and
    // scan-&-go phones come back as table cards; red.
    expect(r.snapshot.tables.map((t) => t.sessionId).sort()).toEqual(["s-7", "s-k"]);
  });
});
