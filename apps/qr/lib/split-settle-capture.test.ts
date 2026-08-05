import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * W11 — `captureAllIfReady`'s two new money rules, in ORDER terms, because both defects are orderings:
 *
 *   • M45: the capture-claim stamp must be WRITTEN before Stripe is asked to capture. The stamp is the
 *     serialization token between the capture loop and the two exits (abort, re-open) — their deletes
 *     exclude a stamped row — so a capture that runs unstamped re-opens the exact race where an exit
 *     releases payer A's hold and only then meets payer B's already-captured one.
 *   • M1/M25: the fulfillment RPC takes ONLY the cart id. The old second argument was a tautology (this
 *     module summed the same rows the RPC re-sums); the reconcile now happens in SQL against the total
 *     PINNED at openSettlement. A caller that starts passing a derived expectation again is the exact
 *     regression the W10d revert documented.
 *
 * The mock records every DB write and Stripe call into ONE chronological log, so the assertions are
 * about sequence — the only thing that matters for a serialization token.
 */

vi.mock("server-only", () => ({}));

type Event =
  | {
      kind: "db";
      table: string;
      op: string;
      patch: Record<string, unknown>;
      eq: [string, unknown][];
      is: [string, unknown][];
    }
  | { kind: "stripe"; op: "capture" | "retrieve"; pi: string }
  | { kind: "rpc"; fn: string; args: Record<string, unknown> };
let log: Event[] = [];

let cartRow: Record<string, unknown> = {};
let shares: { stripe_payment_intent_id: string | null; status: string; amount_cents: number }[] =
  [];
let stampError: { message: string } | null = null;
let captureStatus: Record<string, string> = {};

function dbEvent(table: string, op: string, patch: Record<string, unknown>) {
  const e = {
    kind: "db" as const,
    table,
    op,
    patch,
    eq: [] as [string, unknown][],
    is: [] as [string, unknown][],
  };
  log.push(e);
  const api = {
    eq(col: string, val: unknown) {
      e.eq.push([col, val]);
      return api;
    },
    neq() {
      return api;
    },
    in() {
      return api;
    },
    is(col: string, val: unknown) {
      e.is.push([col, val]);
      return api;
    },
    maybeSingle: () => {
      // Two single-row reads exist: `cartIdForPi` (asks for cart_id) and the cart-state read.
      if (String(patch.cols).includes("cart_id"))
        return Promise.resolve({ data: { cart_id: "cart-1" }, error: null });
      return Promise.resolve({ data: cartRow, error: null });
    },
    // A mutation's `.select()` (return=representation) resolves rows; the shares LIST read resolves
    // via `.then` below (the module chains no order on it).
    select: () => Promise.resolve({ data: [{ status: "x" }], error: null }),
    then(res: (v: { data: unknown; error: { message: string } | null }) => unknown) {
      if (op === "select" && String(patch.cols).includes("amount_cents"))
        return Promise.resolve({ data: shares, error: null }).then(res);
      const isStamp = op === "update" && "capture_started_at" in patch && !("status" in patch);
      return Promise.resolve({ data: null, error: isStamp ? stampError : null }).then(res);
    },
  };
  return api;
}

const db = {
  from: (table: string) => ({
    select: (cols: string) => dbEvent(table, "select", { cols }),
    update: (patch: Record<string, unknown>) => dbEvent(table, "update", patch),
  }),
  rpc: (fn: string, args: Record<string, unknown>) => {
    log.push({ kind: "rpc", fn, args });
    return Promise.resolve({ data: "order-1", error: null });
  },
};

vi.mock("@mms/db/server", () => ({ serviceClient: () => db }));
vi.mock("./stripe", () => ({
  getStripe: () => ({
    paymentIntents: {
      capture: (pi: string) => {
        log.push({ kind: "stripe", op: "capture", pi });
        return Promise.resolve({ status: captureStatus[pi] ?? "succeeded" });
      },
      retrieve: (pi: string) => {
        log.push({ kind: "stripe", op: "retrieve", pi });
        return Promise.resolve({ status: "canceled" });
      },
    },
  }),
}));
vi.mock("./lock", () => ({
  releaseSettlement: () => Promise.resolve(null),
  SETTLE_TTL_MS: 10 * 60 * 1000,
  CART_LOCK_TTL_MS: 90 * 1000,
}));

const mod = await import("./split-settle");

beforeEach(() => {
  log = [];
  // A fresh freeze and a fully-authorized table — the state in which the loop captures.
  cartRow = {
    status: "open",
    settle_at: new Date().toISOString(),
    locked: false,
    locked_at: null,
  };
  shares = [
    { stripe_payment_intent_id: "pi_a", status: "authorized", amount_cents: 2000 },
    { stripe_payment_intent_id: "pi_b", status: "authorized", amount_cents: 1500 },
  ];
  stampError = null;
  captureStatus = {};
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const stamps = () =>
  log.filter(
    (e): e is Extract<Event, { kind: "db" }> =>
      e.kind === "db" &&
      e.op === "update" &&
      "capture_started_at" in e.patch &&
      !("status" in e.patch),
  );
const captures = () => log.filter((e) => e.kind === "stripe" && e.op === "capture");

describe("captureAllIfReady — the capture-claim stamp (M45)", () => {
  it("stamps each share BEFORE asking Stripe to capture it", async () => {
    await mod.captureAllIfReady(db as never, "cart-1");
    expect(captures()).toHaveLength(2);
    for (const cap of captures()) {
      const stampIdx = log.findIndex(
        (e) =>
          e.kind === "db" &&
          e.op === "update" &&
          "capture_started_at" in e.patch &&
          e.eq.some(([, v]) => v === (cap as { pi: string }).pi),
      );
      const capIdx = log.indexOf(cap);
      expect(stampIdx).toBeGreaterThanOrEqual(0);
      expect(stampIdx).toBeLessThan(capIdx);
    }
  });

  it("captures NOTHING when the stamp write fails", async () => {
    // Fail closed: an unstamped capture is invisible to the exits, which is the M45 race itself. The
    // webhook's retry machinery re-drives the loop for free.
    stampError = { message: "connection reset" };
    await expect(mod.captureAllIfReady(db as never, "cart-1")).rejects.toThrow(/stamp failed/);
    expect(captures()).toHaveLength(0);
  });

  it("scopes each stamp to its own PaymentIntent, first-writer-wins", async () => {
    await mod.captureAllIfReady(db as never, "cart-1");
    for (const st of stamps()) {
      expect(st.eq.some(([col]) => col === "stripe_payment_intent_id")).toBe(true);
      // `.is("capture_started_at", null)` — a re-entered loop must not re-stamp (the first stamp's
      // timestamp is the serialization record).
      expect(st.is).toContainEqual(["capture_started_at", null]);
    }
  });

  it("clears the stamp when the capture turns out to have taken no money", async () => {
    // The stamp means "money in motion"; leaving it on a canceled share would permanently block the
    // abort that is now the table's only way forward.
    captureStatus = { pi_a: "canceled", pi_b: "succeeded" };
    await mod.captureAllIfReady(db as never, "cart-1");
    const marks = log.filter(
      (e): e is Extract<Event, { kind: "db" }> =>
        e.kind === "db" && e.op === "update" && "status" in e.patch,
    );
    const canceledMark = marks.find((m) => m.patch.status === "canceled");
    expect(canceledMark).toBeDefined();
    expect(canceledMark?.patch.capture_started_at).toBeNull();
    const capturedMark = marks.find((m) => m.patch.status === "captured");
    expect(capturedMark).toBeDefined();
    expect("capture_started_at" in (capturedMark?.patch ?? {})).toBe(false);
  });
});

describe("onShareCaptured — the fulfillment call carries no derived expectation (M1/M25)", () => {
  it("calls mms_fulfill_split_order with ONLY the cart id", async () => {
    shares = [
      { stripe_payment_intent_id: "pi_a", status: "captured", amount_cents: 2000 },
      { stripe_payment_intent_id: "pi_b", status: "captured", amount_cents: 1500 },
    ];
    await mod.onShareCaptured("pi_a");
    const rpc = log.find((e) => e.kind === "rpc" && e.fn === "mms_fulfill_split_order") as
      | Extract<Event, { kind: "rpc" }>
      | undefined;
    expect(rpc).toBeDefined();
    // The reconcile lives in SQL, against the total PINNED at openSettlement. A derived second
    // argument reappearing here is the exact tautology-or-live-value regression W10d documented.
    expect(Object.keys(rpc?.args ?? {})).toEqual(["p_cart_id"]);
  });
});
