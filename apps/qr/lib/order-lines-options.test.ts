import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * M3 — the option IDS must reach the SQL, asserted as RPC payload shapes on the REAL
 * insertOrIncLine (the degenerate-mock lesson, same harness as order-lines-scan.test.ts). A
 * dropped `p_option_ids` quietly ships label-only lines forever — reorder falls back to the base
 * dish and nobody ever sees a failure. Option-less callers must NOT send the param (deploy-order
 * safety: a DB without 20260815100000 still resolves every live call).
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
const LINE = {
  menuItemId: "33333333-3333-4333-8333-333333333333",
  name: "Kyay-O",
  opts: ["Pork", "Extra egg"],
  optionIds: ["opt-pork", "opt-egg"],
  unitPriceCents: 2000,
  taxCents: 195,
  fulfillment: "dinein" as const,
};

beforeEach(() => {
  rpcCalls = [];
  siblingRows = [];
});

describe("insertOrIncLine — p_option_ids threading (M3)", () => {
  it("a line WITH option ids sends p_option_ids to mms_cart_item_insert_if_open", async () => {
    await insertOrIncLine(CART, LINE, "seat-1");
    const call = rpcCalls.find((c) => c.fn === "mms_cart_item_insert_if_open");
    expect(call?.args.p_option_ids).toEqual(["opt-pork", "opt-egg"]);
  });

  it("an option-LESS line must NOT send the param (deploy-order safety)", async () => {
    await insertOrIncLine(CART, { ...LINE, opts: [], optionIds: [] }, "seat-1");
    const call = rpcCalls.find((c) => c.fn === "mms_cart_item_insert_if_open");
    expect(call && "p_option_ids" in call.args).toBe(false);
  });

  it("a legacy caller that omits optionIds entirely also sends nothing", async () => {
    const { optionIds: _drop, ...legacy } = LINE;
    await insertOrIncLine(CART, legacy, "seat-1");
    const call = rpcCalls.find((c) => c.fn === "mms_cart_item_insert_if_open");
    expect(call && "p_option_ids" in call.args).toBe(false);
  });
});
