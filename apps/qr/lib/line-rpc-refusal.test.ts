import { describe, expect, it } from "vitest";
import {
  lineRpcRefusal,
  rpcDishUnavailable,
  RPC_CART_PAYING,
  RPC_DISH_UNAVAILABLE,
  RPC_LINE_SENT,
} from "./line-rpc-refusal";

/**
 * P2dd · P2cy — the two raises in 20260929000000 are DEFINITE refusals only because they carry
 * BOTH the plpgsql SQLSTATE and the migration's exact words. Either half alone would promote some
 * other failure (a transport error, an unrelated raise) to "nothing was written" — and a staff add
 * that may have committed would then invite a second one under a new key.
 */
describe("lineRpcRefusal", () => {
  it("names the two raises by code AND message", () => {
    expect(lineRpcRefusal({ code: "P0001", message: RPC_CART_PAYING })).toBe("paying");
    expect(lineRpcRefusal({ code: "P0001", message: RPC_LINE_SENT })).toBe("sent");
  });

  it("the words are the migration's, verbatim", () => {
    expect(RPC_CART_PAYING).toBe("cart is being paid");
    expect(RPC_LINE_SENT).toBe("line already sent");
  });

  it("the right words under another code are not a verdict", () => {
    expect(lineRpcRefusal({ code: "XX000", message: RPC_CART_PAYING })).toBeNull();
    expect(lineRpcRefusal({ code: null, message: RPC_LINE_SENT })).toBeNull();
    expect(lineRpcRefusal({ message: RPC_LINE_SENT })).toBeNull();
  });

  it("P0001 with any other words is not either refusal — e.g. the closed-cart raise", () => {
    expect(lineRpcRefusal({ code: "P0001", message: "cart is no longer open" })).toBeNull();
    expect(lineRpcRefusal({ code: "P0001", message: "invalid quantity" })).toBeNull();
  });

  it("no error, no refusal", () => {
    expect(lineRpcRefusal(null)).toBeNull();
    expect(lineRpcRefusal(undefined)).toBeNull();
  });
});

/**
 * #362 (Codex P2 at lib/cart.ts:240) — 20261018140000's growth gate: `set_qty` refuses to GROW a line
 * of a dish the kitchen can no longer make, measured against the quantity under its row lock, with
 * WHICH fact in DETAIL and the refusal's stamp (the transaction start) in HINT.
 */
describe("rpcDishUnavailable", () => {
  const AT = "2026-10-13T12:00:00.000Z";
  it("names the raise by code AND message, with the kind and the stamp it carries", () => {
    // MUTATION (lcb/rpc/dish-unavailable-unnamed): answer null — the refusal reads as an unknown
    // RPC error and the diner hears "We couldn’t confirm that" over a dish that cannot grow; red.
    expect(
      rpcDishUnavailable({
        code: "P0001",
        message: RPC_DISH_UNAVAILABLE,
        details: "sold_out",
        hint: AT,
      }),
    ).toEqual({ why: "sold_out", at: AT });
    // MUTATION (lcb/rpc/gone-reads-sold-out): map every kind to `sold_out`; red.
    expect(
      rpcDishUnavailable({
        code: "P0001",
        message: RPC_DISH_UNAVAILABLE,
        details: "gone",
        hint: AT,
      }),
    ).toEqual({ why: "gone", at: AT });
  });

  it("the words are the migration's, verbatim", () => {
    expect(RPC_DISH_UNAVAILABLE).toBe("dish unavailable");
  });

  it("refuses ambiguity — another code, another kind, or no readable stamp is not this refusal", () => {
    expect(
      rpcDishUnavailable({
        code: "XX000",
        message: RPC_DISH_UNAVAILABLE,
        details: "sold_out",
        hint: AT,
      }),
    ).toBeNull();
    expect(
      rpcDishUnavailable({
        code: "P0001",
        message: RPC_DISH_UNAVAILABLE,
        details: "maybe",
        hint: AT,
      }),
    ).toBeNull();
    // MUTATION (lcb/rpc/stampless-refusal-trusted): accept an unreadable stamp; red.
    expect(
      rpcDishUnavailable({
        code: "P0001",
        message: RPC_DISH_UNAVAILABLE,
        details: "sold_out",
        hint: "x",
      }),
    ).toBeNull();
    expect(rpcDishUnavailable({ code: "P0001", message: RPC_LINE_SENT })).toBeNull();
    expect(rpcDishUnavailable(null)).toBeNull();
  });
});
