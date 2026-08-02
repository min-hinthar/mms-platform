import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * W10c pre-merge — the split share-status transitions, which have now been wrong twice.
 *
 * `onShareFailed` and `onShareAuthorized` decide, from a Stripe webhook that may be redelivered for
 * up to 72h and is NOT ordered, whether a payer's share is dead or alive. Both failure modes we hit
 * end in the same place — a live card hold that can never be captured and an order that is never
 * fulfilled — from opposite mistakes:
 *
 *   • too permissive: an unguarded `failed` write let a late redelivery downgrade a share that had
 *     since been authorized and captured;
 *   • too strict: scoping the write to `pending|failed` (and `onShareAuthorized` to `pending` alone)
 *     made a real decline-then-retry unrepresentable, so the retry's authorization was discarded.
 *
 * There is no other executable coverage of this file, and `verify:slice`'s mutants are structurally
 * limited to the pure money modules — so these are the only guards that can fail here. Each one is a
 * transition that a live table's money depends on, asserted against the DB call the code actually
 * makes.
 */

vi.mock("server-only", () => ({}));

type Row = { status: string };

// Records what the module under test actually asked the database to do, so the assertions are about
// the QUERY (predicate included), not about a mocked answer we chose.
type Call = {
  table: string;
  patch: Record<string, unknown>;
  eq: [string, unknown][];
  inList?: string[];
};
const calls: Call[] = [];
let updateResult: { data: Row[] | null; error: { message: string } | null } = {
  data: [{ status: "x" }],
  error: null,
};

function chain(table: string, patch: Record<string, unknown>) {
  const call: Call = { table, patch, eq: [] };
  calls.push(call);
  const api = {
    eq(col: string, val: unknown) {
      call.eq.push([col, val]);
      return api;
    },
    in(col: string, list: string[]) {
      call.inList = list;
      return api;
    },
    select() {
      return Promise.resolve(updateResult);
    },
    then(res: (v: typeof updateResult) => unknown) {
      return Promise.resolve(updateResult).then(res);
    },
  };
  return api;
}

vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: (table: string) => ({
      update: (patch: Record<string, unknown>) => chain(table, patch),
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
      }),
    }),
  }),
}));

// The PaymentIntent `onShareFailed` will retrieve, and an optional error to throw instead.
let piStatus = "requires_payment_method";
let retrieveError: unknown = null;
vi.mock("./stripe", () => ({
  getStripe: () => ({
    paymentIntents: {
      retrieve: () =>
        retrieveError ? Promise.reject(retrieveError) : Promise.resolve({ status: piStatus }),
    },
  }),
}));

// `onShareAuthorized` calls these after its mark; they are not what these tests pin.
vi.mock("./lock", () => ({
  extendSettlement: () => Promise.resolve(),
  releaseSettlement: () => Promise.resolve(null),
  CART_LOCK_TTL_MS: 300000,
  SETTLE_TTL_MS: 600000,
}));

const { onShareFailed, onShareAuthorized } = await import("./split-settle");

beforeEach(() => {
  calls.length = 0;
  piStatus = "requires_payment_method";
  retrieveError = null;
  updateResult = { data: [{ status: "x" }], error: null };
});

const marked = () => calls.filter((c) => c.patch.status === "failed");

describe("onShareFailed — only a genuinely dead PaymentIntent may mark a share failed", () => {
  it("marks the share when Stripe says the attempt is dead", async () => {
    await onShareFailed("pi_1");
    expect(marked()).toHaveLength(1);
    // The predicate is the guard: it must reach an `authorized` row (a capture declined by the
    // issuer fires payment_failed while the row still reads authorized) …
    expect(marked()[0]?.inList).toContain("authorized");
    // … and must never reach a terminal, money-bearing one.
    expect(marked()[0]?.inList).not.toContain("captured");
    expect(marked()[0]?.inList).not.toContain("canceled");
  });

  // The regression that shipped and was caught pre-merge: a 3DS step-up parks the PI at
  // `requires_action` for as long as the diner takes on their bank's screen. A redelivery landing in
  // that window used to mark the share failed mid-challenge.
  it.each([
    "succeeded",
    "requires_capture",
    "processing",
    "requires_action",
    "requires_confirmation",
    "canceled",
  ])("leaves the share alone when the PaymentIntent is %s", async (status) => {
    piStatus = status;
    await onShareFailed("pi_1");
    expect(marked()).toHaveLength(0);
  });

  it("does not retry forever on a PaymentIntent that cannot exist", async () => {
    // `resource_missing` is permanent — throwing would 500 every redelivery for 72h on an event that
    // can never succeed.
    retrieveError = Object.assign(new Error("No such payment_intent"), {
      code: "resource_missing",
    });
    await expect(onShareFailed("pi_gone")).resolves.toBeUndefined();
    expect(marked()).toHaveLength(0);
  });

  it("throws on a transport failure so Stripe redelivers", async () => {
    retrieveError = Object.assign(new Error("fetch failed"), { code: "api_connection_error" });
    await expect(onShareFailed("pi_1")).rejects.toThrow(/fetch failed/);
  });

  it("throws when the mark itself fails — a lost decline stalls the whole table", async () => {
    updateResult = { data: null, error: { message: "fetch failed" } };
    await expect(onShareFailed("pi_1")).rejects.toThrow(/mark failed/);
  });
});

describe("onShareAuthorized — a declined share must be able to come back", () => {
  it("accepts a retry on a share that was previously marked failed", async () => {
    await onShareAuthorized("pi_1");
    const mark = calls.find((c) => c.patch.status === "authorized");
    // Without `failed` here, the plain decline→re-enter-a-card→authorize path updated 0 rows,
    // returned no error, and 200-ACKed — leaving a live hold on a share the board called declined.
    expect(mark?.inList).toEqual(expect.arrayContaining(["pending", "failed"]));
    expect(mark?.inList).not.toContain("captured");
    expect(mark?.inList).not.toContain("canceled");
  });

  it("throws when the authorization mark fails — a lost hold has no record", async () => {
    updateResult = { data: null, error: { message: "fetch failed" } };
    await expect(onShareAuthorized("pi_1")).rejects.toThrow(/mark failed/);
  });
});
