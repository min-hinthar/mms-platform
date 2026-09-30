import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * P2dd · P2cy — `insertOrIncLine` against the line RPCs' two new raises (20260929000000), asserted
 * on the REAL function with the RPC answers scripted.
 *
 *  · The merge bump raises `line already sent` when a Send fired the sibling between the sibling
 *    read and the bump. An add after a Send is a FRESH draft in the order model, so the add must
 *    INSERT — with the same scan id, whose claim the raise rolled back. Throwing instead reports an
 *    add that went nowhere (the staff pad reads it `unconfirmed` and holds the dish in doubt).
 *  · Either RPC raises `cart is being paid` when a settlement froze the table in the same window:
 *    typed `CartPayingError`, a definite non-write — never the untyped "may have committed" throw.
 */

vi.mock("server-only", () => ({}));

type Answer = { data: string | null; error: { code: string; message: string } | null };
let rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
let siblingRows: { id: string; modifiers: unknown }[] = [];
let incAnswer: Answer = { data: null, error: null };
let insertAnswer: Answer = { data: "line-new", error: null };
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        then: (res: (v: { data: unknown; error: null }) => unknown) =>
          Promise.resolve({ data: siblingRows, error: null }).then(res),
      };
      return chain;
    },
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return Promise.resolve(fn === "mms_cart_item_insert_if_open" ? insertAnswer : incAnswer);
    },
  }),
}));

const { insertOrIncLine, CartClosedError } = await import("./order-lines");
const { CartPayingError } = await import("./line-rpc-refusal");

const CART = "11111111-1111-4111-8111-111111111111";
const SCAN = "22222222-2222-4222-8222-222222222222";
const LINE = {
  menuItemId: "33333333-3333-4333-8333-333333333333",
  name: "Mohinga",
  opts: [],
  unitPriceCents: 1400,
  taxCents: 147,
  fulfillment: "dinein" as const,
};
const SENT = { code: "P0001", message: "line already sent" };
const PAYING = { code: "P0001", message: "cart is being paid" };

beforeEach(() => {
  rpcCalls = [];
  siblingRows = [{ id: "line-sib", modifiers: [] }];
  incAnswer = { data: null, error: null };
  insertAnswer = { data: "line-new", error: null };
});

describe("insertOrIncLine — the merge target was sent mid-add (P2dd)", () => {
  it("falls through to a FRESH insert, carrying the same scan id", async () => {
    incAnswer = { data: null, error: SENT };
    await insertOrIncLine(CART, LINE, "seat-1", 2, SCAN);
    expect(rpcCalls.map((c) => c.fn)).toEqual([
      "mms_cart_item_inc_qty",
      "mms_cart_item_insert_if_open",
    ]);
    const ins = rpcCalls[1]!.args;
    expect(ins.p_scan_id).toBe(SCAN);
    expect(ins.p_qty).toBe(2);
  });

  it("a merge that lands is still ONE call — no insert after a successful bump", async () => {
    await insertOrIncLine(CART, LINE, "seat-1");
    expect(rpcCalls.map((c) => c.fn)).toEqual(["mms_cart_item_inc_qty"]);
  });

  it("any OTHER bump error stays the untyped may-have-committed throw, with no insert", async () => {
    incAnswer = { data: null, error: { code: "P0001", message: "cart is no longer open" } };
    const e = await insertOrIncLine(CART, LINE, "seat-1").catch((x: unknown) => x);
    expect(e).toBeInstanceOf(Error);
    expect(e).not.toBeInstanceOf(CartPayingError);
    expect(e).not.toBeInstanceOf(CartClosedError);
    expect(rpcCalls.map((c) => c.fn)).toEqual(["mms_cart_item_inc_qty"]);
  });
});

describe("insertOrIncLine — the table started paying mid-add (P2cy)", () => {
  it("a frozen BUMP throws CartPayingError and never tries the insert", async () => {
    incAnswer = { data: null, error: PAYING };
    await expect(insertOrIncLine(CART, LINE, "seat-1")).rejects.toBeInstanceOf(CartPayingError);
    expect(rpcCalls.map((c) => c.fn)).toEqual(["mms_cart_item_inc_qty"]);
  });

  it("a frozen INSERT throws CartPayingError", async () => {
    siblingRows = [];
    insertAnswer = { data: null, error: PAYING };
    await expect(insertOrIncLine(CART, LINE, "seat-1")).rejects.toBeInstanceOf(CartPayingError);
  });

  it("the paying error speaks the diner's freeze sentence", () => {
    expect(new CartPayingError().message).toBe(
      "Your table is paying — you can’t change the order while everyone pays",
    );
  });

  it("an insert transport error is still the untyped throw (it may have committed)", async () => {
    siblingRows = [];
    insertAnswer = { data: null, error: { code: "", message: "fetch failed" } };
    const e = await insertOrIncLine(CART, LINE, "seat-1").catch((x: unknown) => x);
    expect(e).toBeInstanceOf(Error);
    expect(e).not.toBeInstanceOf(CartPayingError);
  });
});
