import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * W10d pre-merge — `abortSettlement` and `openSettlement`, the split table's two exits.
 *
 * The pre-merge review's sharpest finding was mechanical, not hypothetical: the whole M40 rule shipped
 * with **zero** executable coverage. Nothing imported `lib/split.ts` from a test, and `verify:slice`'s
 * mutants target only the pure money modules — so reverting the widened cancel predicate, or deleting
 * the `deleteErr` throw, left the suite green. A money rule that cannot fail is not a guard; it is a
 * comment. These are the assertions that make it one.
 *
 * Every test below is written against the DB/Stripe calls the module ACTUALLY makes (the mock records
 * the query, predicate included) rather than against an answer we chose, because the defects this file
 * exists to catch all live in the predicate:
 *
 *   • cancelling only `authorized` holds → a `pending`/`failed`/`canceled` row whose PaymentIntent is
 *     live gets deleted, and the money sits on a diner's card for the ~7-day authorization window;
 *   • treating `payment_intent_unexpected_state` as "already dead" → an abort deletes a share whose
 *     card was really charged (that code also means **succeeded**);
 *   • reading `status === "captured"` without checking for a PaymentIntent → a $0 by-person seat, which
 *     `openSettlement` auto-settles with a NULL PI, impersonates taken money and bricks the table;
 *   • cancelling from a snapshot → a share claimed mid-abort is destroyed with its intent never released;
 *   • re-opening a split → the same hold-release rule, in the sibling path that never had it.
 */

vi.mock("server-only", () => ({}));

type ShareRow = { stripe_payment_intent_id: string | null; status: string };
type PiRow = { stripe_payment_intent_id: string | null };

const CART = "11111111-1111-4111-8111-111111111111";

// ── scripted state ────────────────────────────────────────────────────────────────────────────────
type Query = {
  table: string;
  op: "select" | "update" | "delete" | "insert";
  cols?: string;
  eq: [string, unknown][];
  neq: [string, unknown][];
  is: [string, unknown][];
  not: [string, string, unknown][];
  inList?: string[];
  patch?: unknown;
  selected?: boolean;
};
let queries: Query[] = [];

/** abortSettlement's share snapshot. */
let shares: ShareRow[] = [];
let sharesError: { message: string } | null = null;
/** Rows the ledger DELETE reports it removed — the serialization point, so it can differ from `shares`. */
let deletedRows: PiRow[] | null = [];
let deleteError: { message: string } | null = null;
let zeroSweepError: { message: string } | null = null;
let survivors: { id: string }[] = [];
/** openSettlement: the prior share set its replace-delete removes. */
let replacedRows: PiRow[] | null = [];
let replacedError: { message: string } | null = null;
/** openSettlement: rows matching the authorized/captured in-flight probe. */
let liveRows: { id: string }[] = [];

/** PaymentIntent ids passed to `cancel`, in order. */
let cancelled: string[] = [];
/** Per-PI scripted Stripe behaviour: what `cancel` throws and what `retrieve` then reports. */
let cancelThrows: Record<string, { code?: string }> = {};
let retrieveStatus: Record<string, string> = {};
let releasedFreeze = 0;

function stripeError(code?: string) {
  const e = new Error(code ?? "stripe failure") as Error & { code?: string };
  if (code) e.code = code;
  return e;
}

/** The single place that decides what a recorded query resolves to. */
function respond(q: Query): { data: unknown; error: { message: string } | null } {
  if (q.table === "qr_cart_shares") {
    if (q.op === "select") {
      // Three distinct reads: abort's snapshot (asks for the PI column), openSettlement's in-flight
      // probe (carries an `in` list), and abort's survivor check (`id`, no `in`).
      if (q.cols?.includes("stripe_payment_intent_id")) return { data: shares, error: sharesError };
      if (q.inList) return { data: liveRows, error: null };
      return { data: survivors, error: null };
    }
    if (q.op === "delete") {
      if (q.neq.length > 0) return { data: deletedRows, error: deleteError }; // ledger delete
      if (q.is.length > 0) return { data: null, error: zeroSweepError }; // $0 sweep
      return { data: replacedRows, error: replacedError }; // openSettlement replace
    }
    return { data: null, error: null }; // insert / status marks
  }
  if (q.table === "session_members")
    return {
      data: [
        { seat_id: "seat-host", created_at: "2026-01-01T00:00:00Z" },
        { seat_id: "seat-b", created_at: "2026-01-01T00:01:00Z" },
      ],
      error: null,
    };
  if (q.table === "qr_cart_items")
    return {
      data: [
        {
          by_seat: "seat-host",
          qty: 1,
          unit_price_cents: 1800,
          tax_cents: 173,
          state: "sent",
          comped: false,
        },
        {
          by_seat: "seat-b",
          qty: 1,
          unit_price_cents: 1200,
          tax_cents: 116,
          state: "sent",
          comped: false,
        },
      ],
      error: null,
    };
  return { data: null, error: null }; // qr_carts refreeze
}

function builder(table: string, op: Query["op"], patch?: unknown, cols?: string) {
  const q: Query = { table, op, cols, eq: [], neq: [], is: [], not: [], patch };
  queries.push(q);
  const api = {
    eq(col: string, val: unknown) {
      q.eq.push([col, val]);
      return api;
    },
    neq(col: string, val: unknown) {
      q.neq.push([col, val]);
      return api;
    },
    is(col: string, val: unknown) {
      q.is.push([col, val]);
      return api;
    },
    not(col: string, operator: string, val: unknown) {
      q.not.push([col, operator, val]);
      return api;
    },
    in(col: string, list: string[]) {
      q.inList = list;
      return api;
    },
    order() {
      return Promise.resolve(respond(q));
    },
    limit() {
      return Promise.resolve(respond(q));
    },
    select(selectCols?: string) {
      q.selected = true;
      // A SELECT keeps chaining (`.eq().limit()`); a DELETE/UPDATE `.select()` is the terminal
      // representation request, which is what the delete-then-release passes read.
      if (op === "select") {
        q.cols = selectCols;
        return api;
      }
      q.cols = selectCols;
      return Promise.resolve(respond(q));
    },
    then(res: (v: { data: unknown; error: { message: string } | null }) => unknown) {
      return Promise.resolve(respond(q)).then(res);
    },
  };
  return api;
}

vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: (table: string) => ({
      select: (cols: string) => builder(table, "select", undefined, cols),
      update: (patch: Record<string, unknown>) => builder(table, "update", patch),
      insert: (rows: unknown) => builder(table, "insert", rows),
      delete: () => builder(table, "delete"),
    }),
  }),
}));

vi.mock("./stripe", () => ({
  getStripe: () => ({
    paymentIntents: {
      cancel: (id: string) => {
        cancelled.push(id);
        const err = cancelThrows[id];
        return err
          ? Promise.reject(stripeError(err.code))
          : Promise.resolve({ status: "canceled" });
      },
      retrieve: (id: string) => Promise.resolve({ status: retrieveStatus[id] ?? "canceled" }),
    },
  }),
}));

vi.mock("./authz", () => ({
  assertCartMember: () => Promise.resolve({ uid: "seat-host", role: "host", sessionId: "sess-1" }),
  AuthzError: class extends Error {},
}));
vi.mock("./rate", () => ({ assertMutationRate: () => Promise.resolve() }));
vi.mock("./lock", () => ({
  acquireSettlement: () => Promise.resolve("acquired"),
  releaseSettlement: () => {
    releasedFreeze += 1;
    return Promise.resolve(null);
  },
}));
vi.mock("./totals", () => ({
  getCartTotals: () =>
    Promise.resolve({
      subtotalCents: 3000,
      discountCents: 0,
      serviceChargeCents: 150,
      taxCents: 289,
    }),
}));

const { abortSettlement, openSettlement } = await import("./split");

beforeEach(() => {
  queries = [];
  shares = [];
  sharesError = null;
  deletedRows = [];
  deleteError = null;
  zeroSweepError = null;
  survivors = [];
  replacedRows = [];
  replacedError = null;
  liveRows = [];
  cancelled = [];
  cancelThrows = {};
  retrieveStatus = {};
  releasedFreeze = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const ledgerDelete = () =>
  queries.find((q) => q.op === "delete" && q.table === "qr_cart_shares" && q.neq.length > 0);
const loggedText = () =>
  JSON.stringify((console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls);

describe("abortSettlement — every hold it abandons must be released (M40)", () => {
  it("cancels the PaymentIntent on EVERY non-captured status, not just authorized", async () => {
    // The rule M40 added. A share's ROW STATUS is not its PaymentIntent's status: a decline at capture
    // marks the row `failed` over a live hold, and a row `canceled` by one attempt can have been
    // re-authorized by a later one. The delete below is the last moment anything knows these exist.
    shares = [
      { stripe_payment_intent_id: "pi_pending", status: "pending" },
      { stripe_payment_intent_id: "pi_failed", status: "failed" },
      { stripe_payment_intent_id: "pi_authorized", status: "authorized" },
      { stripe_payment_intent_id: "pi_canceled", status: "canceled" },
    ];
    await abortSettlement(CART);
    expect(cancelled.sort()).toEqual(
      ["pi_authorized", "pi_canceled", "pi_failed", "pi_pending"].sort(),
    );
  });

  it("rejects when the ledger delete fails instead of reporting a clean abort", async () => {
    // postgrest resolves a transport failure into `{ data: null, error }` — it never rejects — so an
    // unchecked delete told the host the split was cancelled over rows that still exist and whose holds
    // had just been cancelled.
    shares = [{ stripe_payment_intent_id: "pi_1", status: "pending" }];
    deleteError = { message: "connection reset" };
    await expect(abortSettlement(CART)).rejects.toThrow(/Couldn’t cancel the split/);
  });

  it("releases a PaymentIntent claimed inside the abort window", async () => {
    // The cancel loop runs off a snapshot taken several Stripe round-trips earlier, and SharePay mints
    // on mount — so a payer opening the sheet mid-abort repoints their row to a brand-new intent. The
    // DELETE is the serialization point, so what it hands back is the truth.
    shares = [{ stripe_payment_intent_id: "pi_old", status: "pending" }];
    deletedRows = [
      { stripe_payment_intent_id: "pi_old" },
      { stripe_payment_intent_id: "pi_claimed_mid_abort" },
    ];
    await abortSettlement(CART);
    expect(cancelled).toContain("pi_claimed_mid_abort");
  });

  it("does not cancel the same PaymentIntent twice", async () => {
    // The second pass must skip what the loop already attempted — a duplicate cancel is harmless at
    // Stripe but would mask a genuinely missed intent if this became a count-based assertion.
    shares = [{ stripe_payment_intent_id: "pi_1", status: "pending" }];
    deletedRows = [{ stripe_payment_intent_id: "pi_1" }];
    await abortSettlement(CART);
    expect(cancelled).toEqual(["pi_1"]);
  });

  it("logs a hold it could not prove dead, naming the PaymentIntent", async () => {
    // A 429/5xx/timeout says nothing about the hold. The row is about to be deleted, so this log is the
    // only artifact that could ever lead an operator back to the charge.
    shares = [{ stripe_payment_intent_id: "pi_flaky", status: "pending" }];
    cancelThrows = { pi_flaky: { code: "api_error" } };
    await abortSettlement(CART);
    expect(loggedText()).toContain("pi_flaky");
  });

  it("does NOT log an already-dead hold as abandoned", async () => {
    // The other direction: `resource_missing` and an already-`canceled` PI carry no money, so logging
    // them would bury the real leaks in routine noise.
    shares = [
      { stripe_payment_intent_id: "pi_missing", status: "pending" },
      { stripe_payment_intent_id: "pi_already", status: "failed" },
    ];
    cancelThrows = {
      pi_missing: { code: "resource_missing" },
      pi_already: { code: "payment_intent_unexpected_state" },
    };
    retrieveStatus = { pi_already: "canceled" };
    await abortSettlement(CART);
    expect(loggedText()).not.toContain("pi_missing");
    expect(loggedText()).not.toContain("pi_already");
  });
});

describe("abortSettlement — a succeeded PaymentIntent must survive the abort", () => {
  it("refuses the abort when a cancel reveals the charge already went through", async () => {
    // `payment_intent_unexpected_state` is ALSO Stripe's code for a succeeded PI — `captureAllIfReady`
    // retrieves on it for exactly that reason. Reachable when a capture takes the money and its
    // post-capture mark write throws, leaving the row reading `authorized`. Treating the code as
    // "already dead" deleted a share whose card was really charged: no order, no row, no refunds record.
    shares = [{ stripe_payment_intent_id: "pi_paid", status: "authorized" }];
    cancelThrows = { pi_paid: { code: "payment_intent_unexpected_state" } };
    retrieveStatus = { pi_paid: "succeeded" };
    await expect(abortSettlement(CART)).rejects.toThrow(/Payment already completed/);
  });

  it("never reaches the ledger delete once it finds a succeeded PaymentIntent", async () => {
    // The refusal is only worth anything if the row survives to be fulfilled.
    shares = [{ stripe_payment_intent_id: "pi_paid", status: "authorized" }];
    cancelThrows = { pi_paid: { code: "payment_intent_unexpected_state" } };
    retrieveStatus = { pi_paid: "succeeded" };
    await expect(abortSettlement(CART)).rejects.toThrow();
    expect(ledgerDelete()).toBeUndefined();
  });

  it("marks the share captured so the succeeded webhook can still fulfill it", async () => {
    shares = [{ stripe_payment_intent_id: "pi_paid", status: "authorized" }];
    cancelThrows = { pi_paid: { code: "payment_intent_unexpected_state" } };
    retrieveStatus = { pi_paid: "succeeded" };
    await expect(abortSettlement(CART)).rejects.toThrow();
    const mark = queries.find((q) => q.op === "update" && q.table === "qr_cart_shares");
    expect((mark?.patch as { status?: string } | undefined)?.status).toBe("captured");
  });

  it("treats a live requires_capture hold as unreleased rather than dead", async () => {
    // The one shape that must never round down to "released": cancel refused, and the PI still holds.
    shares = [{ stripe_payment_intent_id: "pi_live", status: "pending" }];
    cancelThrows = { pi_live: { code: "payment_intent_unexpected_state" } };
    retrieveStatus = { pi_live: "requires_capture" };
    await abortSettlement(CART);
    expect(loggedText()).toContain("pi_live");
  });
});

describe("abortSettlement — a $0 seat is not taken money", () => {
  it("proceeds when the only captured share has no PaymentIntent", async () => {
    // `openSettlement` auto-settles a $0 by-person seat straight to `captured` with a NULL PI so it
    // can't block the all-covered gate. Reading status alone made that sentinel indistinguishable from
    // a real charge, and it permanently bricked the table: abort refused, re-open refused, and
    // `paymentInFlightReason` returned `split_in_progress` with no TTL escape — so cash-settle and
    // clear-table were refused too, and any OTHER seat's live hold could never be released.
    shares = [
      { stripe_payment_intent_id: null, status: "captured" },
      { stripe_payment_intent_id: "pi_real", status: "authorized" },
    ];
    await abortSettlement(CART);
    expect(cancelled).toEqual(["pi_real"]);
  });

  it("still refuses when a captured share HAS a PaymentIntent", async () => {
    // The opposite direction, so the fix above can't be over-applied into deleting real money.
    shares = [{ stripe_payment_intent_id: "pi_taken", status: "captured" }];
    await expect(abortSettlement(CART)).rejects.toThrow(/Payment already completed/);
    expect(cancelled).toEqual([]);
  });

  it("sweeps the $0 rows so the survivor check can't report a phantom capture", async () => {
    // The ledger delete is `.neq("status","captured")`, which skips the $0 sentinel — left behind, it
    // would trip the survivor check and tell the host "Payment completed during cancel".
    shares = [{ stripe_payment_intent_id: null, status: "captured" }];
    await abortSettlement(CART);
    const sweep = queries.find(
      (q) =>
        q.op === "delete" &&
        q.table === "qr_cart_shares" &&
        q.is.some(([col]) => col === "stripe_payment_intent_id"),
    );
    expect(sweep).toBeDefined();
    expect(sweep?.eq).toContainEqual(["status", "captured"]);
  });

  it("rejects when the $0 sweep fails rather than deleting around it", async () => {
    shares = [{ stripe_payment_intent_id: null, status: "captured" }];
    zeroSweepError = { message: "connection reset" };
    await expect(abortSettlement(CART)).rejects.toThrow(/Couldn’t cancel the split/);
    expect(ledgerDelete()).toBeUndefined();
  });
});

describe("openSettlement — a re-open must release the holds it replaces", () => {
  it("cancels the PaymentIntent of every prior share it deletes", async () => {
    // The sibling of M40, in the path that never had it. The in-flight probe above only refuses on
    // `authorized`/`captured`, and a `pending`/`failed` row can sit over a LIVE authorization whenever
    // the webhook that would have advanced it is delayed or 5xxing. Past the 10-minute TTL a re-open is
    // the table's only forward exit, and it used to delete those rows and cancel nothing.
    replacedRows = [
      { stripe_payment_intent_id: "pi_prior_a" },
      { stripe_payment_intent_id: null },
      { stripe_payment_intent_id: "pi_prior_b" },
    ];
    await openSettlement(CART, "by_person");
    expect(cancelled.sort()).toEqual(["pi_prior_a", "pi_prior_b"]);
  });

  it("refuses to re-derive over a live authorized share", async () => {
    // The pre-existing guard, pinned so the `.not(stripe_payment_intent_id …)` narrowing can't widen
    // into deleting a share whose money is genuinely in flight.
    liveRows = [{ id: "share-live" }];
    await expect(openSettlement(CART, "even")).rejects.toThrow(/Payments are already in progress/);
    expect(cancelled).toEqual([]);
  });

  it("rejects and lifts the freeze when the replace-delete fails", async () => {
    // A silently-failed replace left the OLD share rows in place and inserted a second full set beside
    // them — two ledgers for one table, and a freeze over both.
    replacedError = { message: "connection reset" };
    await expect(openSettlement(CART, "even")).rejects.toThrow(/Could not start the split/);
    expect(releasedFreeze).toBeGreaterThan(0);
    expect(queries.some((q) => q.op === "insert")).toBe(false);
  });

  it("logs a prior hold it could not release", async () => {
    replacedRows = [{ stripe_payment_intent_id: "pi_stuck" }];
    cancelThrows = { pi_stuck: { code: "api_error" } };
    await openSettlement(CART, "even");
    expect(loggedText()).toContain("pi_stuck");
  });
});
