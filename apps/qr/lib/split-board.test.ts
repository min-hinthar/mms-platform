import { describe, expect, it } from "vitest";
import { everyShareIn } from "./split-board";

/**
 * W10d pre-merge RE-REVIEW. The board's "finishing up…" claim must agree with `captureAllIfReady`'s
 * gate (`every(authorized|captured)`, split-settle.ts). It stopped agreeing when `canPay` learned
 * `canceled`, and nothing could catch that: the gate lived inline in a `.tsx` component, and no vitest
 * config in this repo runs `.tsx` suites.
 */
describe("everyShareIn — the board may only say 'finishing up' when capture can actually run", () => {
  it("is true when every share is authorized or captured", () => {
    expect(everyShareIn([{ status: "authorized" }, { status: "captured" }])).toBe(true);
  });

  it("is FALSE with a canceled share", () => {
    // The regression. `captureAllIfReady` writes `canceled` itself when a capture meets a dead
    // PaymentIntent, so `[captured, captured, canceled]` is produced by the capture loop — not exotic.
    expect(everyShareIn([{ status: "captured" }, { status: "canceled" }])).toBe(false);
  });

  it("is FALSE with a failed share", () => {
    expect(everyShareIn([{ status: "authorized" }, { status: "failed" }])).toBe(false);
  });

  it("is FALSE with a pending share", () => {
    expect(everyShareIn([{ status: "authorized" }, { status: "pending" }])).toBe(false);
  });

  it("is FALSE for an empty board", () => {
    // A board that has not loaded its ledger yet must not announce that everyone has paid.
    expect(everyShareIn([])).toBe(false);
  });
});
