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

let updates: { table: string; row: Row }[] = [];
function table(name: string) {
  const eqs: [string, unknown][] = [];
  const ins: [string, unknown[]][] = [];
  const ltes: [string, string][] = [];
  const rows = () =>
    (db[name] ?? []).filter(
      (r) =>
        eqs.every(([c, v]) => r[c] === v) &&
        ins.every(([c, vs]) => (vs as unknown[]).includes(r[c])) &&
        // ISO-8601 instants in one zone compare as strings, as Postgres compares the timestamptz.
        ltes.every(([c, v]) => typeof r[c] === "string" && (r[c] as string) <= v),
    );
  const answer = () =>
    failing === name
      ? Promise.resolve({ data: null, error: { message: "boom" } })
      : Promise.resolve({ data: rows()[0] ?? null, error: null });
  const api = {
    select: () => api,
    eq: (c: string, v: unknown) => (eqs.push([c, v]), api),
    in: (c: string, vs: unknown[]) => (ins.push([c, vs]), api),
    lte: (c: string, v: string) => (ltes.push([c, v]), api),
    limit: () => api,
    maybeSingle: answer,
    update: (row: Row) => {
      updates.push({ table: name, row });
      return api;
    },
    then: (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(res),
  };
  return api;
}
vi.mock("@mms/db/server", () => ({
  serverClient: () => ({
    auth: { getUser: () => Promise.resolve({ data: { user: { id: ME, is_anonymous: true } } }) },
  }),
  serviceClient: () => ({ from: table }),
}));

vi.mock("./receipt-entry", () => ({
  RECEIPT_STATUSES: ["paid", "refunded"],
  getReceiptEntry: () => Promise.resolve({ id: "entry" }),
}));

const { getReceiptLink, setReceiptEmail } = await import("./receipt");

const ORDER = "33333333-3333-4333-8333-333333333333";
const SESSION = "44444444-4444-4444-8444-444444444444";

const SETTLED_AT = "2026-10-13T19:30:00.000Z";
function counterOrder(over: Row = {}): Row {
  return {
    id: ORDER,
    status: "paid",
    tender: "cash",
    session_id: SESSION,
    created_at: SETTLED_AT,
    earned_by: null,
    receipt_email: null,
    receipt_sent_at: null,
    ...over,
  };
}
const seated = (seat: string, at = "2026-10-13T18:40:00.000Z") => ({
  session_id: SESSION,
  seat_id: seat,
  created_at: at,
});

beforeEach(() => {
  failing = null;
  updates = [];
  db.qr_orders = [counterOrder()];
  db.qr_order_payers = [];
  db.session_members = [seated(ME)];
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
    db.session_members = [seated("someone-else")];
    await expect(getReceiptLink({ orderId: ORDER })).resolves.toEqual({
      ok: false,
      reason: "refused",
    });
  });

  it("refuses a seat at a DIFFERENT session", async () => {
    db.session_members = [{ ...seated(ME), session_id: "55555555-5555-4555-8555-555555555555" }];
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

describe("the seat arm, after the blind pass on #359 — the party that paid, and the link only", () => {
  it("refuses a member who joined AFTER the settle (the next party at the same sticker, m182)", async () => {
    // RED without the join-time predicate: any later seat at the session is admitted.
    db.session_members = [seated(ME, "2026-10-13T19:45:00.000Z")];
    await expect(getReceiptLink({ orderId: ORDER })).resolves.toEqual({
      ok: false,
      reason: "refused",
    });
  });

  it("a seat at the table that paid gets the link but NEVER the address on the order", async () => {
    db.qr_orders = [
      counterOrder({ receipt_email: "party-a@example.com", receipt_sent_at: SETTLED_AT }),
    ];
    const r = await getReceiptLink({ orderId: ORDER });
    // RED when the seat arm reads the stamp: another diner's address on this phone, pre-filled.
    expect(r).toMatchObject({ ok: true, emailedTo: null, accountEmail: null, canEmail: false });
  });

  it("setReceiptEmail refuses the seat arm with the generic refusal, and writes nothing", async () => {
    const r = await setReceiptEmail({ orderId: ORDER, email: "later@example.com" });
    // RED when the seat arm may email: it could replace the payer's address and redirect the receipt.
    expect(r).toEqual({ ok: false, reason: "refused" });
    expect(updates).toEqual([]);
  });

  it("the earner and a payer keep the email capture and see where it went, unchanged", async () => {
    db.session_members = [];
    db.qr_orders = [
      counterOrder({
        tender: "card",
        earned_by: ME,
        receipt_email: "me@example.com",
        receipt_sent_at: SETTLED_AT,
      }),
    ];
    await expect(getReceiptLink({ orderId: ORDER })).resolves.toMatchObject({
      ok: true,
      emailedTo: "me@example.com",
      canEmail: true,
    });
    await expect(setReceiptEmail({ orderId: ORDER, email: "me@example.com" })).resolves.toEqual({
      ok: true,
      sentTo: "me@example.com",
    });
    db.qr_orders = [counterOrder({ tender: "card" })];
    db.qr_order_payers = [{ order_id: ORDER, payer_uid: ME }];
    await expect(getReceiptLink({ orderId: ORDER })).resolves.toMatchObject({
      ok: true,
      canEmail: true,
    });
  });
});
