import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Lifecycle audit (2026-10-13), H — the receipt's COUNTER arm. A cash or Terminal settle writes no
 * `earned_by` and no payer row (M206), so /track showed the seated diner their counter order and then
 * refused them its receipt. `callerMayReceiveReceipt` now also admits a `session_members` seat for the
 * order's session — for a COUNTER tender only, the arm `getMyOrderFallback` / `getCartOrderRef` read
 * the order by.
 *
 * The mock is a tiny DATABASE, not a script: each table holds rows and every `.eq` / `.in` filter is
 * EVALUATED against them. So a mutant that drops a predicate widens what the read returns, exactly as
 * Postgres would, and a refusal test goes red — it can never pass because the stub happened to answer
 * the same either way.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: () => Promise.resolve({}) }));
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("./rate", () => ({ withinReceiptRate: () => Promise.resolve(true) }));
vi.mock("./email", () => ({
  receiptEmailConfigured: () => true,
  sendOrderReceiptEmail: () => Promise.resolve({ ok: true }),
}));
vi.mock("./receipt-token", () => ({ mintReceiptToken: () => Promise.resolve("T".repeat(43)) }));

type Row = Record<string, unknown>;
const ME = "uid-1";
const db: Record<string, Row[]> = {};
let failing: string | null = null;

function table(name: string) {
  const eqs: [string, unknown][] = [];
  const ins: [string, unknown[]][] = [];
  const rows = () =>
    (db[name] ?? []).filter(
      (r) =>
        eqs.every(([c, v]) => r[c] === v) &&
        ins.every(([c, vs]) => (vs as unknown[]).includes(r[c])),
    );
  const answer = () =>
    failing === name
      ? Promise.resolve({ data: null, error: { message: "boom" } })
      : Promise.resolve({ data: rows()[0] ?? null, error: null });
  const api = {
    select: () => api,
    eq: (c: string, v: unknown) => (eqs.push([c, v]), api),
    in: (c: string, vs: unknown[]) => (ins.push([c, vs]), api),
    limit: () => api,
    maybeSingle: answer,
  };
  return api;
}
vi.mock("@mms/db/server", () => ({
  serverClient: () => ({
    auth: { getUser: () => Promise.resolve({ data: { user: { id: ME, is_anonymous: true } } }) },
  }),
  serviceClient: () => ({ from: table }),
}));

const { getReceiptLink } = await import("./receipt");

const ORDER = "33333333-3333-4333-8333-333333333333";
const SESSION = "44444444-4444-4444-8444-444444444444";

function counterOrder(over: Row = {}): Row {
  return {
    id: ORDER,
    status: "paid",
    tender: "cash",
    session_id: SESSION,
    earned_by: null,
    receipt_email: null,
    receipt_sent_at: null,
    ...over,
  };
}

beforeEach(() => {
  failing = null;
  db.qr_orders = [counterOrder()];
  db.qr_order_payers = [];
  db.session_members = [{ session_id: SESSION, seat_id: ME }];
});

describe("callerMayReceiveReceipt — the counter arm", () => {
  it("mints a receipt link for a diner seated at the table that settled at the counter", async () => {
    // RED with the arm removed: a cash order has no earner and no payer row.
    await expect(getReceiptLink({ orderId: ORDER })).resolves.toMatchObject({ ok: true });
  });

  it("covers a Terminal settle too, and a refunded counter order keeps its receipt", async () => {
    db.qr_orders = [counterOrder({ tender: "terminal", status: "refunded" })];
    await expect(getReceiptLink({ orderId: ORDER })).resolves.toMatchObject({ ok: true });
  });

  it("refuses a diner who never sat at that table — another table's member is not this one's", async () => {
    // The seat is someone else's, at THIS session. RED when the uid predicate is dropped: any member
    // row for the session would then authorize anybody who can guess an order id.
    db.session_members = [{ session_id: SESSION, seat_id: "someone-else" }];
    await expect(getReceiptLink({ orderId: ORDER })).resolves.toEqual({
      ok: false,
      reason: "refused",
    });
  });

  it("refuses a seat at a DIFFERENT session", async () => {
    db.session_members = [{ session_id: "55555555-5555-4555-8555-555555555555", seat_id: ME }];
    await expect(getReceiptLink({ orderId: ORDER })).resolves.toEqual({
      ok: false,
      reason: "refused",
    });
  });

  it("refuses a tablemate for a CARD order — sitting there is not paying (M29)", async () => {
    // RED when the tender scope is dropped: every card receipt becomes mintable by table membership.
    db.qr_orders = [counterOrder({ tender: "card" })];
    await expect(getReceiptLink({ orderId: ORDER })).resolves.toEqual({
      ok: false,
      reason: "refused",
    });
  });

  it("refuses a counter order that never settled (no receipt for money that did not move)", async () => {
    db.qr_orders = [counterOrder({ status: "pending" })];
    await expect(getReceiptLink({ orderId: ORDER })).resolves.toEqual({
      ok: false,
      reason: "refused",
    });
  });

  it("fails CLOSED on an unreadable membership probe", async () => {
    failing = "session_members";
    await expect(getReceiptLink({ orderId: ORDER })).resolves.toEqual({
      ok: false,
      reason: "refused",
    });
  });

  it("still authorizes the earner first, unchanged", async () => {
    db.qr_orders = [counterOrder({ tender: "card", earned_by: ME, session_id: null })];
    db.session_members = [];
    await expect(getReceiptLink({ orderId: ORDER })).resolves.toMatchObject({ ok: true });
  });
});
