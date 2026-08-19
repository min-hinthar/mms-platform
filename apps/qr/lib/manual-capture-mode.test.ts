import { describe, expect, it, beforeEach, vi } from "vitest";

/**
 * W23d — the gate on whether /track's arrival screen may claim a payment.
 *
 * Under W23c's manual capture the Payment Element still redirects with `redirect_status=succeeded`
 * for a PI that has only reached `requires_capture`, so this boolean is what stands between the
 * celebration and a claim about money that has not moved. Every failure path answers FALSE, which
 * is today's behaviour exactly — being wrong in that direction costs a manual-capture diner some
 * premature copy for a few seconds; being wrong the other way strips "Paid — thank you!" off a
 * payment that really did go through.
 */
vi.mock("server-only", () => ({}));

let row: unknown = null;
let readError: { message: string } | null = null;
let reads = 0;
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => {
            reads += 1;
            return Promise.resolve({ data: row, error: readError });
          },
        }),
      }),
    }),
  }),
}));

const { awaitingManualCapture } = await import("./manual-capture-mode");

beforeEach(() => {
  row = { table_sessions: { mode: "pickup" } };
  readError = null;
  reads = 0;
  process.env.PICKUP_MANUAL_CAPTURE = "1";
});

describe("awaitingManualCapture", () => {
  it("is true for a pickup cart while the flag is on", async () => {
    expect(await awaitingManualCapture("cart_1")).toBe(true);
  });

  it("is false for every other mode — dine-in and scan-&-go never authorize", async () => {
    row = { table_sessions: { mode: "dinein" } };
    expect(await awaitingManualCapture("cart_2")).toBe(false);
    row = { table_sessions: { mode: "scango" } };
    expect(await awaitingManualCapture("cart_3")).toBe(false);
  });

  it("does not even read the cart while the flag is off", async () => {
    // The separating assertion: a version that read first and checked the flag afterwards would
    // still answer false here, so only the call count proves /track pays nothing for this today.
    process.env.PICKUP_MANUAL_CAPTURE = "0";
    expect(await awaitingManualCapture("cart_4")).toBe(false);
    delete process.env.PICKUP_MANUAL_CAPTURE;
    expect(await awaitingManualCapture("cart_4")).toBe(false);
    expect(reads).toBe(0);
  });

  it("falls back to FALSE on an unreadable cart, never to a guess", async () => {
    readError = { message: "transport" };
    expect(await awaitingManualCapture("cart_5")).toBe(false);
    readError = null;
    row = null;
    expect(await awaitingManualCapture("cart_6")).toBe(false);
  });

  it("falls back to FALSE on an unexpected embed shape", async () => {
    // A cast instead of a guard here would answer TRUE for every mode the moment PostgREST returned
    // the embed as an array — and this boolean decides whether a money claim is printed.
    row = { table_sessions: null };
    expect(await awaitingManualCapture("cart_7")).toBe(false);
    row = { table_sessions: [{ mode: "pickup" }] };
    expect(await awaitingManualCapture("cart_8")).toBe(false);
  });

  it("is false without a cart id", async () => {
    expect(await awaitingManualCapture(null)).toBe(false);
    expect(reads).toBe(0);
  });
});
