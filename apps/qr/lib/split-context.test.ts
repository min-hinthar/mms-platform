import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * PD1's tail (OPEN-ITEMS PD1, "Still open") — `getSplitContext`, the group context /cart renders
 * from, and the one value it must NEVER carry: the session's JOIN CODE (`table_sessions.qr_code`).
 *
 * The code is the table's bearer join secret and its realtime/RLS key (lib/session-code.ts). PD2
 * carried it to /cart so a numberless table's pass could print it; the owner-delegated decision of
 * 2026-10-09 reversed that (no pass prints it — lib/pass-identity.ts), and the field was left with
 * no reader — still shipped, in the RSC payload, to every phone at the table. These cases pin both
 * halves of "never": the read never ASKS for it, and the context never CARRIES it even from a row
 * that has it (the mock answers the FULL session row whatever the select names — the worst case).
 *
 * And `sessionId` (m1 decision 16): the host's one-time name ask renames their own seat through
 * `setDisplayName(sessionId, …)`, so the context carries the session the caller's membership was
 * verified in — the authz answer, never a value from the request.
 */

vi.mock("server-only", () => ({}));

const CART = "11111111-1111-4111-8111-111111111111";
const SESSION = "22222222-2222-4222-8222-222222222222";
const JOIN_CODE = "7C2E9A";

/** Every `.select(...)` column list the module asked of each table, in order. */
let selects: { table: string; cols: string }[] = [];

const SESSION_ROW = { mode: "dinein", table_number: 7, qr_code: JOIN_CODE, host_seat: "seat-host" };
const MEMBERS = [
  { seat_id: "seat-host", display_name: "Aye", role: "host", created_at: "2026-10-12T10:00:00Z" },
  { seat_id: "seat-b", display_name: "Thiri", role: "guest", created_at: "2026-10-12T10:01:00Z" },
];

vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: (table: string) => ({
      select: (cols: string) => {
        selects.push({ table, cols });
        const api = {
          eq: () => api,
          // The session read: the FULL row, whatever was selected — a leak test must not depend on
          // the mock being kinder than PostgREST's `*`.
          maybeSingle: () => Promise.resolve({ data: SESSION_ROW, error: null }),
          // The member read.
          order: () => Promise.resolve({ data: MEMBERS, error: null }),
        };
        return api;
      },
    }),
  }),
}));
vi.mock("./authz", () => ({
  assertCartMember: () => Promise.resolve({ uid: "seat-b", role: "guest", sessionId: SESSION }),
  AuthzError: class extends Error {},
}));
vi.mock("./stripe", () => ({ getStripe: () => ({}) }));
vi.mock("./rate", () => ({ assertMutationRate: () => Promise.resolve() }));
vi.mock("./lock", () => ({}));
vi.mock("./totals", () => ({ getCartTotals: () => Promise.resolve(null) }));

const { getSplitContext } = await import("./split");

beforeEach(() => {
  selects = [];
});

describe("getSplitContext — the join code never leaves the server through /cart's context", () => {
  it("the session read never asks for the join code", async () => {
    await getSplitContext(CART);
    const sessionReads = selects.filter((s) => s.table === "table_sessions");
    expect(sessionReads).toHaveLength(1);
    const cols = sessionReads[0]!.cols.split(",").map((c) => c.trim());
    // MUTATION (pdrem/split-context-selects-the-join-code): `qr_code` back in the column list; red.
    expect(cols).not.toContain("qr_code");
    expect(cols).not.toContain("*");
    // What the context does need, still read.
    expect(cols).toEqual(expect.arrayContaining(["mode", "table_number"]));
  });

  it("the context never CARRIES the join code — not as a field, not anywhere in its value", async () => {
    const ctx = await getSplitContext(CART);
    // MUTATION (pdrem/split-context-carries-the-session-row): the session row spread into the
    // context — the code rides to every phone at the table; red.
    expect(JSON.stringify(ctx)).not.toContain(JOIN_CODE);
    expect(Object.keys(ctx)).not.toContain("qrCode");
    expect(Object.keys(ctx)).not.toContain("qr_code");
  });

  it("carries the session the caller's membership was verified in, and the table as read", async () => {
    const ctx = await getSplitContext(CART);
    // MUTATION (pdrem/split-context-session-not-the-members): the seat id handed back as the
    // session — the host's name ask then renames nothing (setDisplayName refuses a non-session); red.
    expect(ctx.sessionId).toBe(SESSION);
    expect(ctx).toMatchObject({
      mode: "dinein",
      mySeat: "seat-b",
      myRole: "guest",
      tableNumber: 7,
      members: [
        { seat: "seat-host", name: "Aye", role: "host" },
        { seat: "seat-b", name: "Thiri", role: "guest" },
      ],
    });
  });
});
