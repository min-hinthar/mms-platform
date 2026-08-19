import { describe, expect, it, beforeEach, vi } from "vitest";

/**
 * W23d — the read that decides whether /track may say "no payment was taken".
 *
 * There are three answers and only one of them may produce that sentence. The two that may NOT are
 * the whole point of the file: `undecided` is what a capture still in flight looks like, and
 * `error` is a failed read. Either one silently becoming a verdict would tell a guest whose money
 * IS moving that nothing was charged.
 */
vi.mock("server-only", () => ({}));

let rpcData: unknown = null;
let rpcError: { message: string } | null = null;
const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return Promise.resolve({ data: rpcData, error: rpcError });
    },
  }),
}));

const { settlementVerdict } = await import("./dropped-read");

beforeEach(() => {
  rpcData = null;
  rpcError = null;
  rpcCalls.length = 0;
});

describe("settlementVerdict", () => {
  it("reports a recorded cancellation, with its lines", async () => {
    rpcData = [
      {
        reason: "nothing_left",
        lines: [{ name: "Mohinga", qty: 2 }],
      },
    ];
    const r = await settlementVerdict("pi_1", "uid_1");
    expect(r).toEqual({
      state: "decided",
      settle: {
        reason: "nothing_left",
        dropped: { count: 1, lines: [{ name: "Mohinga", qty: 2 }] },
      },
    });
  });

  it("scopes the read to the caller's own uid, in the statement", async () => {
    // The PaymentIntent is a LOOKUP, never a credential — holding a /track URL must grant nothing.
    await settlementVerdict("pi_2", "uid_2");
    expect(rpcCalls).toEqual([
      { fn: "mms_settlement_cancellation", args: { p_intent: "pi_2", p_uid: "uid_2" } },
    ]);
  });

  it("answers UNDECIDED when no cancellation is on record", async () => {
    rpcData = [];
    expect(await settlementVerdict("pi_3", "uid_3")).toEqual({ state: "undecided" });
  });

  it("answers ERROR on a failed read — never undecided", async () => {
    // The separating case. Both arms produce "the tracker says nothing new", so only the OUTCOME
    // distinguishes them — and it has to, because a caller that adopts values on `undecided` would
    // let a transient blip stand in for an answer. Same rule as availability-read, one layer out.
    rpcError = { message: "transport" };
    expect(await settlementVerdict("pi_4", "uid_4")).toEqual({ state: "error" });
  });

  it("does not call the database without both keys", async () => {
    expect(await settlementVerdict("", "uid_5")).toEqual({ state: "undecided" });
    expect(await settlementVerdict("pi_5", "")).toEqual({ state: "undecided" });
    expect(rpcCalls).toEqual([]);
  });

  it("degrades an unrecognised reason rather than printing raw column text", async () => {
    rpcData = [{ reason: "kitchen_closed", lines: [] }];
    const r = await settlementVerdict("pi_6", "uid_6");
    expect(r).toEqual({
      state: "decided",
      settle: { reason: "unknown", dropped: { count: 0, lines: [] } },
    });
  });
});
