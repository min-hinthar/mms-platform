import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * W7b — the scan-event id must reach the SQL, asserted as RPC PAYLOAD SHAPES on the REAL
 * insertOrIncLine (the degenerate-mock lesson): both branches (inc-a-sibling / fresh insert) thread
 * `p_scan_id`, because the dedupe ledger lives in the RPCs' own transaction — a dropped id turns
 * every queue replay back into a silent qty+1 the shopper is charged for. Live adds (no scanId)
 * must NOT send the param (deploy-order safety: a pre-migration DB still resolves the call).
 */

vi.mock("server-only", () => ({}));

let rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
let siblingRows: { id: string; modifiers: unknown }[] = [];
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
      return Promise.resolve({
        data: fn === "mms_cart_item_insert_if_open" ? "line-1" : null,
        error: null,
      });
    },
  }),
}));

const { insertOrIncLine } = await import("./order-lines");

const CART = "11111111-1111-4111-8111-111111111111";
const SCAN = "22222222-2222-4222-8222-222222222222";
const LINE = {
  menuItemId: "12345678",
  name: "Test Jar",
  opts: [],
  unitPriceCents: 350,
  taxCents: 0,
  fulfillment: "grocery" as const,
};

beforeEach(() => {
  rpcCalls = [];
  siblingRows = [];
});

describe("insertOrIncLine — p_scan_id threading", () => {
  it("the FRESH-INSERT branch carries p_scan_id into mms_cart_item_insert_if_open", async () => {
    await insertOrIncLine(CART, LINE, "seat-1", 1, SCAN);
    const call = rpcCalls.find((c) => c.fn === "mms_cart_item_insert_if_open");
    expect(call?.args.p_scan_id).toBe(SCAN);
  });

  it("the INC-SIBLING branch carries p_scan_id into mms_cart_item_inc_qty", async () => {
    siblingRows = [{ id: "line-9", modifiers: [] }];
    await insertOrIncLine(CART, LINE, "seat-1", 1, SCAN);
    const call = rpcCalls.find((c) => c.fn === "mms_cart_item_inc_qty");
    expect(call?.args.p_id).toBe("line-9");
    expect(call?.args.p_scan_id).toBe(SCAN);
  });

  it("a LIVE add (no scanId) omits the param entirely — a pre-migration DB still resolves", async () => {
    await insertOrIncLine(CART, LINE, "seat-1");
    const call = rpcCalls.find((c) => c.fn === "mms_cart_item_insert_if_open");
    expect(call && "p_scan_id" in call.args).toBe(false);
  });
});
