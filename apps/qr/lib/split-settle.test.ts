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
  selected?: boolean;
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
      call.selected = true;
      return Promise.resolve(updateResult);
    },
    // ⚠️ Pre-merge review — postgrest's REAL contract: an UPDATE without `.select()` is
    // return=minimal and resolves `data: null`. An earlier mock resolved the same rows either way,
    // so deleting `.select()` from the module under test SURVIVED this suite — a degenerate fixture
    // pinning the exact thing the code comment calls mandatory. Model the difference, so a dropped
    // `.select()` makes the 0-row check fire on every call and the assertions below notice.
    then(res: (v: { data: null; error: { message: string } | null }) => unknown) {
      return Promise.resolve({ data: null, error: updateResult.error }).then(res);
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
    // Without `.select()` postgrest returns `data: null` for an UPDATE, so "we marked nothing" and
    // "we marked a row" become indistinguishable — the 0-row warning degrades to constant noise.
    expect(marked()[0]?.selected).toBe(true);
    // ⚠️ Round 5 — the IDENTITY predicate. Recorded from the first version of this file and asserted
    // by none of it: a reviewer removed `.eq("stripe_payment_intent_id", piId)` from BOTH marks — an
    // implementation that rewrites EVERY share row in the database, across every cart and every
    // table, on each webhook event — and the suite stayed 16/16 green. A guard written and never made
    // to fail, inside the test file added to close exactly that class.
    expect(marked()[0]?.eq).toContainEqual(["stripe_payment_intent_id", "pi_1"]);
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
  // ⚠️ The round-4 finding, and the reason the revival is gated on Stripe. Without this, a redelivery
  // of the ORIGINAL authorization event re-opened a share whose PaymentIntent had since died, the
  // all-authorized gate passed again, and every OTHER payer at the table was really captured against
  // an order that could never be fulfilled — turning "nobody was charged" into "everyone but one was".
  it.each([
    "requires_payment_method",
    "canceled",
    "processing",
    "requires_action",
    "requires_confirmation",
  ])("refuses to revive a share whose PaymentIntent is %s", async (status) => {
    piStatus = status;
    await onShareAuthorized("pi_1");
    expect(calls.filter((c) => c.patch.status === "authorized")).toHaveLength(0);
  });

  it("accepts a retry on a share that was previously marked failed", async () => {
    piStatus = "requires_capture"; // a real, live hold — what a genuine decline→retry produces
    await onShareAuthorized("pi_1");
    const mark = calls.find((c) => c.patch.status === "authorized");
    // Without `failed` here, the plain decline→re-enter-a-card→authorize path updated 0 rows,
    // returned no error, and 200-ACKed — leaving a live hold on a share the board called declined.
    expect(mark?.inList).toEqual(expect.arrayContaining(["pending", "failed"]));
    expect(mark?.inList).not.toContain("captured");
    expect(mark?.inList).not.toContain("canceled");
    expect(mark?.selected).toBe(true);
    expect(mark?.eq).toContainEqual(["stripe_payment_intent_id", "pi_1"]);
  });

  it("throws when the authorization mark fails — a lost hold has no record", async () => {
    piStatus = "requires_capture";
    updateResult = { data: null, error: { message: "fetch failed" } };
    await expect(onShareAuthorized("pi_1")).rejects.toThrow(/mark failed/);
  });
});
