import { beforeEach, describe, expect, it, vi } from "vitest";
/**
 * A1 — `getCartOrderId`: a counter-settled order is found by DURABLE session membership, and only
 * for counter tenders. The fake evaluates its filters, so dropping `.in("tender", …)` or the
 * membership read changes the answer here rather than a call list.
 */
vi.mock("server-only", () => ({}));
vi.mock("@mms/db/schemas", () => ({ cartViewInput: { parse: (x: unknown) => x } }));
let uid: string | null = "u-1";
let memberActive = true;
vi.mock("./authz", () => ({
  getCallerUid: () => (uid ? Promise.resolve(uid) : Promise.reject(new Error("no uid"))),
  assertSessionMember: () =>
    memberActive ? Promise.resolve({ uid }) : Promise.reject(new Error("closed")),
}));

type Row = Record<string, unknown>;
let orders: Row[] = [];
let members: Row[] = [];
let shares: Row[] = [];
type Filter =
  | { kind: "eq"; col: string; val: unknown }
  | { kind: "in"; col: string; vals: unknown[] }
  | { kind: "notnull"; col: string };
const matches = (r: Row, fs: Filter[]) =>
  fs.every((f) =>
    f.kind === "eq"
      ? r[f.col] === f.val
      : f.kind === "in"
        ? f.vals.includes(r[f.col])
        : r[f.col] !== null && r[f.col] !== undefined,
  );
function builder(rows: Row[]) {
  const fs: Filter[] = [];
  const api = {
    eq(col: string, val: unknown) {
      fs.push({ kind: "eq", col, val });
      return api;
    },
    in(col: string, vals: unknown[]) {
      fs.push({ kind: "in", col, vals });
      return api;
    },
    not(col: string, _op: string, _v: unknown) {
      fs.push({ kind: "notnull", col });
      return api;
    },
    limit() {
      return api;
    },
    maybeSingle() {
      return Promise.resolve({ data: rows.find((r) => matches(r, fs)) ?? null, error: null });
    },
  };
  return api;
}
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: (table: string) => ({
      select: () =>
        builder(
          table === "qr_orders"
            ? orders
            : table === "session_members"
              ? members
              : table === "qr_cart_shares"
                ? shares
                : table === "qr_carts"
                  ? [{ id: "c-1", session_id: "s-1" }]
                  : [],
        ),
    }),
  }),
}));

const { getCartOrderId, getCartOrderRef } = await import("./order");

beforeEach(() => {
  uid = "u-1";
  memberActive = false; // the table was CLEARED — the session is closed
  orders = [{ id: "o-1", cart_id: "c-1", session_id: "s-1", status: "paid", tender: "cash" }];
  members = [{ session_id: "s-1", seat_id: "u-1" }];
  shares = [];
});

describe("getCartOrderId — the counter tenders", () => {
  it("a member finds the cash order even after the table is cleared — and it is flagged counter", async () => {
    expect(await getCartOrderId("c-1")).toBe("o-1");
    expect(await getCartOrderRef("c-1")).toEqual({ id: "o-1", counter: true });
  });
  it("a terminal order resolves the same way", async () => {
    orders[0]!.tender = "terminal";
    expect(await getCartOrderId("c-1")).toBe("o-1");
  });
  it("a non-member of that session gets nothing — the read is uid-scoped", async () => {
    members = [{ session_id: "s-1", seat_id: "u-2" }];
    await expect(getCartOrderId("c-1")).rejects.toThrow(); // falls to the split path, which gates
  });
  it("a CARD order does not take this path — who paid is not who sat there", async () => {
    orders[0]!.tender = "card";
    await expect(getCartOrderId("c-1")).rejects.toThrow();
  });
  it("an unpaid order row is never resolved", async () => {
    orders[0]!.status = "refunded";
    await expect(getCartOrderId("c-1")).rejects.toThrow();
  });
  it("a payer's own split share still resolves first, and is NOT flagged counter", async () => {
    orders = [];
    shares = [{ cart_id: "c-1", seat_id: "u-1", order_id: "o-split" }];
    expect(await getCartOrderId("c-1")).toBe("o-split");
    expect(await getCartOrderRef("c-1")).toEqual({ id: "o-split", counter: false });
  });
  it("COUNTER_TENDERS is cash and terminal, nothing else — widening it is the leak above", async () => {
    // Pinned as a VALUE so `counter-tender.ts` cannot quietly admit "card": every membership-gated
    // read (`getCartOrderRef`, `getMyOrderFallback`, `counterPayOutcome`) keys off this list.
    const { COUNTER_TENDERS } = await import("./counter-tender");
    expect([...COUNTER_TENDERS].sort()).toEqual(["cash", "terminal"]);
  });
});
