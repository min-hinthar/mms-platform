import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * PD8 — the pending-request read behind the flag and the three doors. The mock EVALUATES every
 * filter it records (LEARNINGS #244: a mock that returns rows regardless of its filters can never
 * falsify a missing one), so a dropped `status = pending` or `cart_id` term surfaces a resolved or a
 * foreign request as "pending on this cart" — and the door then over-warns, or the detail draws a
 * flag for a request the manager already decided.
 */
type Row = {
  id: string;
  kind: string;
  line_id: string | null;
  line_name: string | null;
  qty: number | null;
  amount_cents: number;
  cooked: boolean;
  initiator_staff_id: string;
  created_at: string;
  cart_id: string;
  status: string;
};
let rows: Row[] = [];
let readFails = false;
let staffFails = false;
type LineRow = {
  id: string;
  qty: number;
  unit_price_cents: number;
  state: string;
  comped: boolean;
};
let lines: LineRow[] = [];
let linesFail = false;
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: (table: string) => {
      if (table === "qr_cart_items") {
        // The live lines, EVALUATED by id (a read that ignored its ids would hand back any line).
        return {
          select: () => ({
            in: (_c: string, ids: string[]) =>
              Promise.resolve(
                linesFail
                  ? { data: null, error: { message: "down" } }
                  : { data: lines.filter((l) => ids.includes(l.id)), error: null },
              ),
          }),
        };
      }
      if (table === "staff") {
        return {
          select: () => ({
            in: (_c: string, ids: string[]) =>
              Promise.resolve(
                staffFails
                  ? { data: null, error: { message: "down" } }
                  : {
                      data: ids
                        .filter((id) => id === "thiri")
                        .map((id) => ({ user_id: id, display_name: "Thiri" })),
                      error: null,
                    },
              ),
          }),
        };
      }
      const filters: [string, unknown][] = [];
      // A thenable chain: `.select().eq().eq()` awaited, the filters EVALUATED against the rows.
      const q = {
        eq: (c: string, v: unknown) => {
          filters.push([c, v]);
          return q;
        },
        then(resolve: (r: { data: Row[] | null; error: { message: string } | null }) => void) {
          resolve(
            readFails
              ? { data: null, error: { message: "down" } }
              : {
                  data: rows.filter((r) =>
                    filters.every(([c, v]) => (r as Record<string, unknown>)[c] === v),
                  ),
                  error: null,
                },
          );
        },
      };
      return { select: () => q };
    },
  }),
}));

const { readPendingApprovalFlags } = await import("./approvals-read");

const row = (over: Partial<Row>): Row => ({
  id: "r1",
  kind: "void",
  line_id: "l1",
  line_name: "Mohinga",
  qty: 1,
  amount_cents: 1400,
  cooked: true,
  initiator_staff_id: "thiri",
  created_at: "2026-10-08T10:00:00Z",
  cart_id: "cart-1",
  status: "pending",
  ...over,
});

beforeEach(() => {
  rows = [];
  readFails = false;
  staffFails = false;
  lines = [{ id: "l1", qty: 1, unit_price_cents: 1400, state: "draft", comped: false }];
  linesFail = false;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("readPendingApprovalFlags", () => {
  it("returns the cart's PENDING requests only — a resolved row and another cart's row are not flags", async () => {
    rows = [
      row({ id: "r1" }),
      row({ id: "r2", status: "approved" }),
      row({ id: "r3", cart_id: "cart-9" }),
    ];
    const flags = await readPendingApprovalFlags("cart-1");
    expect(flags?.map((f) => f.id)).toEqual(["r1"]);
  });
  it("shapes the flag the doors and the detail draw, with the asker's name joined", async () => {
    rows = [row({})];
    expect(await readPendingApprovalFlags("cart-1")).toEqual([
      {
        id: "r1",
        kind: "void",
        lineId: "l1",
        lineName: "Mohinga",
        nameMy: null,
        qty: 1,
        amountCents: 1400,
        cooked: true,
        initiatorName: "Thiri",
        initiatorStaffId: "thiri",
        createdAt: "2026-10-08T10:00:00Z",
        lineNow: { qty: 1, unitPriceCents: 1400, offTheBill: false },
      },
    ]);
  });
  it("the blind pass on #333 — each flag carries ITS line as it stands now: moved, gone, already off", async () => {
    rows = [
      row({ id: "moved", line_id: "l1" }),
      row({ id: "gone", line_id: "l-gone", created_at: "2026-10-08T10:01:00Z" }),
      row({ id: "off", line_id: "l3", created_at: "2026-10-08T10:02:00Z" }),
    ];
    lines = [
      { id: "l1", qty: 2, unit_price_cents: 1400, state: "draft", comped: false },
      { id: "l3", qty: 1, unit_price_cents: 900, state: "voided", comped: false },
      { id: "l-other", qty: 9, unit_price_cents: 1, state: "draft", comped: false },
    ];
    const flags = await readPendingApprovalFlags("cart-1");
    expect(flags?.map((f) => [f.id, f.lineNow])).toEqual([
      ["moved", { qty: 2, unitPriceCents: 1400, offTheBill: false }],
      ["gone", null],
      ["off", { qty: 1, unitPriceCents: 900, offTheBill: true }],
    ]);
  });
  it("a live-line read that fails is 'unknown' — never 'gone' (a false Close it) and never a dropped flag", async () => {
    rows = [row({})];
    linesFail = true;
    const flags = await readPendingApprovalFlags("cart-1");
    expect(flags?.map((f) => f.lineNow)).toEqual(["unknown"]);
  });
  it("an unreadable read is NULL — never an empty list the doors would pass", async () => {
    rows = [row({})];
    readFails = true;
    expect(await readPendingApprovalFlags("cart-1")).toBeNull();
  });
  it("an unreadable roster keeps the flag with the shipped fallback name — attribution never drops a warning", async () => {
    rows = [row({})];
    staffFails = true;
    const flags = await readPendingApprovalFlags("cart-1");
    expect(flags?.length).toBe(1);
    expect(flags?.[0]?.initiatorName).toBe("A server");
  });
  it("oldest first, whatever order the rows arrive in", async () => {
    rows = [
      row({ id: "later", created_at: "2026-10-08T10:09:00Z" }),
      row({ id: "earlier", created_at: "2026-10-08T10:03:00Z" }),
    ];
    expect((await readPendingApprovalFlags("cart-1"))?.map((f) => f.id)).toEqual([
      "earlier",
      "later",
    ]);
  });
  it("no rows: an empty list (a real nothing-pending)", async () => {
    expect(await readPendingApprovalFlags("cart-1")).toEqual([]);
  });
});
