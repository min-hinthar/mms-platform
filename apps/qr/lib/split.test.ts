import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * W10d pre-merge — `abortSettlement`, the split table's only exit.
 *
 * The pre-merge review's sharpest finding was mechanical, not hypothetical: the whole M40 rule shipped
 * with **zero** executable coverage. Nothing imported `lib/split.ts` from a test, and `verify:slice`'s
 * mutants target only the pure money modules — so reverting the widened cancel predicate, or deleting
 * the `deleteErr` throw, left the suite 209/209 green and `verify:slice` clean. A money rule that
 * cannot fail is not a guard; it is a comment. These are the assertions that make it one.
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
 *   • cancelling from a snapshot → a share claimed mid-abort is destroyed with its intent never released.
 */

vi.mock("server-only", () => ({}));

type ShareRow = { stripe_payment_intent_id: string | null; status: string };

const CART = "11111111-1111-4111-8111-111111111111";

// ── recorded state ────────────────────────────────────────────────────────────────────────────────
type Query = {
  table: string;
  op: "select" | "update" | "delete";
  eq: [string, unknown][];
  neq: [string, unknown][];
  is: [string, unknown][];
  not: [string, string, unknown][];
  inList?: string[];
  patch?: Record<string, unknown>;
  selected?: boolean;
};
let queries: Query[] = [];
let shares: ShareRow[] = [];
let sharesError: { message: string } | null = null;
/** Rows the ledger DELETE reports it removed — the serialization point, so it can differ from `shares`. */
let deletedRows: { stripe_payment_intent_id: string | null }[] | null = null;
let deleteError: { message: string } | null = null;
let survivors: { id: string }[] = [];
/** PaymentIntent ids passed to `cancel`, in order. */
let cancelled: string[] = [];
/** Per-PI scripted Stripe behaviour: what `cancel` throws and what `retrieve` then reports. */
let cancelThrows: Record<string, { code?: string; message?: string }> = {};
let retrieveStatus: Record<string, string> = {};

function stripeError(code?: string) {
  const e = new Error(code ?? "stripe failure") as Error & { code?: string };
  if (code) e.code = code;
  return e;
}

function builder(table: string, op: Query["op"], patch?: Record<string, unknown>) {
  const q: Query = { table, op, eq: [], neq: [], is: [], not: [], patch };
  queries.push(q);
  const settle = (): { data: unknown; error: { message: string } | null } => {
    if (op === "delete" && table === "qr_cart_shares" && q.neq.length > 0)
      return { data: deletedRows, error: deleteError };
    if (op === "select" && table === "qr_cart_shares") {
      // The share read selects the PI column; the survivor check selects only `id`.
      if (q.inList) return { data: [], error: null }; // openSettlement's in-flight probe
      return survivors === null
        ? { data: null, error: { message: "unreadable" } }
        : q.selected
          ? { data: shares, error: sharesError }
          : { data: survivors, error: null };
    }
    return { data: null, error: null };
  };
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
    limit() {
      return Promise.resolve({ data: survivors, error: null });
    },
    select(cols?: string) {
      q.selected = true;
      // A SELECT keeps chaining (`.eq().limit()`); a DELETE/UPDATE `.select()` is the terminal
      // representation request, which is what the delete-then-release pass reads.
      if (op === "select") {
        q.patch = { cols } as Record<string, unknown>;
        return api;
      }
      return Promise.resolve(settle());
    },
    then(res: (v: { data: unknown; error: { message: string } | null }) => unknown) {
      return Promise.resolve(settle()).then(res);
    },
  };
  return api;
}

vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: (table: string) => ({
      select: (cols: string) => {
        const b = builder(table, "select");
        // The share read is the only select that asks for the PaymentIntent column; flag it so the
        // survivor check (which selects `id`) can resolve differently.
        if (cols.includes("stripe_payment_intent_id")) return b.select(cols);
        return b;
      },
      update: (patch: Record<string, unknown>) => builder(table, "update", patch),
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
        return err ? Promise.reject(stripeError(err.code)) : Promise.resolve({ status: "canceled" });
      },
      retrieve: (id: string) =>
        Promise.resolve({ status: retrieveStatus[id] ?? "canceled" }) as Promise<{
          status: string;
        }>,
    },
  }),
}));

vi.mock("./authz", () => ({
  assertCartMember: () => Promise.resolve({ uid: "seat-host", role: "host", sessionId: "s1" }),
  AuthzError: class extends Error {},
}));
vi.mock("./rate", () => ({ assertMutationRate: () => Promise.resolve() }));
vi.mock("./lock", () => ({
  acquireSettlement: () => Promise.resolve("acquired"),
  releaseSettlement: () => Promise.resolve(null),
}));
vi.mock("./totals", () => ({ getCartTotals: () => Promise.resolve({}) }));

const { abortSettlement } = await import("./split");

beforeEach(() => {
  queries = [];
  shares = [];
  sharesError = null;
  deletedRows = [];
  deleteError = null;
  survivors = [];
  cancelled = [];
  cancelThrows = {};
  retrieveStatus = {};
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const ledgerDelete = () =>
  queries.find((q) => q.op === "delete" && q.table === "qr_cart_shares" && q.neq.length > 0);

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
    // Stripe but would mask a genuinely missed intent if this ever became a count-based assertion.
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
    const logged = (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(JSON.stringify(logged)).toContain("pi_flaky");
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
    const logged = JSON.stringify(
      (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls,
    );
    expect(logged).not.toContain("pi_missing");
    expect(logged).not.toContain("pi_already");
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
    expect(mark?.patch?.status).toBe("captured");
  });

  it("treats a live requires_capture hold as unreleased rather than dead", async () => {
    // The one shape that must never round down to "released": cancel refused, and the PI still holds.
    shares = [{ stripe_payment_intent_id: "pi_live", status: "pending" }];
    cancelThrows = { pi_live: { code: "payment_intent_unexpected_state" } };
    retrieveStatus = { pi_live: "requires_capture" };
    await abortSettlement(CART);
    const logged = JSON.stringify(
      (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls,
    );
    expect(logged).toContain("pi_live");
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
});
