import { describe, expect, it } from "vitest";
import { lineRpcRefusal, RPC_CART_PAYING, RPC_LINE_SENT } from "./line-rpc-refusal";

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
