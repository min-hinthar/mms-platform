import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 2c · register (P2w) — the one read behind the staff refusal: is the fresh freeze's owner a
 * seat of this session? A failure is never a verdict.
 */
vi.mock("server-only", () => ({}));
let answer: { data: { seat_id: string } | null; error: { message: string } | null } | "throw";
const reads: { session: unknown; seat: unknown }[] = [];
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: () => {
      const eqs: unknown[] = [];
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (_c: string, v: unknown) => {
          eqs.push(v);
          return q;
        },
        maybeSingle: () => {
          reads.push({ session: eqs[0], seat: eqs[1] });
          return answer === "throw" ? Promise.reject(new Error("socket")) : Promise.resolve(answer);
        },
      };
      return q;
    },
  }),
}));
const { inFlightRefusalFor, settleOwnerIsSeat } = await import("./inflight-read");
const { inFlightRefusal } = await import("./inflight-refusal");

const fresh = () => new Date(Date.now() - 1000).toISOString();
beforeEach(() => {
  reads.length = 0;
});

describe("settleOwnerIsSeat", () => {
  it("reads the owner against THIS session's seats", async () => {
    answer = { data: { seat_id: "seat-1" }, error: null };
    expect(await settleOwnerIsSeat("s1", "seat-1")).toBe(true);
    expect(reads).toEqual([{ session: "s1", seat: "seat-1" }]);
  });
  it("no matching seat is a register attempt", async () => {
    answer = { data: null, error: null };
    // MUTATION: read any answer as a seat — the register's held freeze is a guest's phone again; red.
    expect(await settleOwnerIsSeat("s1", "attempt-uuid")).toBe(false);
  });
  it("a failed or thrown read, or no owner at all, is null — never a verdict", async () => {
    answer = { data: null, error: { message: "boom" } };
    expect(await settleOwnerIsSeat("s1", "x")).toBeNull();
    answer = "throw";
    expect(await settleOwnerIsSeat("s1", "x")).toBeNull();
    expect(await settleOwnerIsSeat("s1", null)).toBeNull();
  });
});

describe("inFlightRefusalFor — the sentence a staff settle is refused with", () => {
  it("a register-held freeze (the unknown-outcome card close) is never blamed on a guest's phone", async () => {
    answer = { data: null, error: null };
    const s = await inFlightRefusalFor(
      { locked: false, locked_at: null, settle_at: fresh(), settle_by: "attempt-uuid" },
      "mid_payment",
      "s1",
    );
    expect(s).toBe(inFlightRefusal("register"));
  });
  it("a diner's split is their phone", async () => {
    answer = { data: { seat_id: "host" }, error: null };
    const s = await inFlightRefusalFor(
      { locked: false, locked_at: null, settle_at: fresh(), settle_by: "host" },
      "mid_payment",
      "s1",
    );
    expect(s).toBe(inFlightRefusal("phone"));
  });
});
