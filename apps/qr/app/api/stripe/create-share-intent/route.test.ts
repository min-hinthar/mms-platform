import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * W10d pre-merge RE-REVIEW — the split share mint route.
 *
 * This file exists because of one demonstrated fact: a reviewer reverted the route's claim UPDATE from
 * `{ count: "exact" }` back to `.select("id").maybeSingle()` — **the exact regression this whole review
 * round was convened to fix, the one that took production checkout down on 2026-07-08** — and the full
 * `apps/qr` suite stayed green, `tsc` clean, `eslint` clean. Nothing imported this file from a test.
 *
 * So the assertions below are about the REQUEST the route issues, not about answers we chose:
 *
 *   • the claim must ask PostgREST for a COUNT and must not ask for a representation. A mutation
 *     carrying a top-level `or()` AND `Prefer: return=representation` is re-projected by PostgREST 14
 *     against the RETURNING columns, the filtered column falls out of scope, and every mint 400s with
 *     42703. The mock therefore models postgrest's REAL contract: `count` is populated only when the
 *     caller passed `{ count: … }`, and rows come back only from `.select()`.
 *   • a replaced PaymentIntent whose state we could not establish must NOT be minted over — the claim
 *     overwrites `stripe_payment_intent_id`, which is the only record of it.
 *   • a replaced PaymentIntent that already SUCCEEDED must not be repointed, or the seat pays twice.
 *   • a lost claim must not cancel an intent the row now points at — that is the payer's live hold.
 */

vi.mock("server-only", () => ({}));

type ShareRow = {
  id: string;
  subtotal_cents: number;
  discount_cents: number;
  service_charge_cents: number;
  tax_cents: number;
  status: string;
  stripe_payment_intent_id: string | null;
};

// ── scripted state ────────────────────────────────────────────────────────────────────────────────
type Recorded = {
  table: string;
  op: "select" | "update";
  /** Whether `{ count: "exact" }` was passed to `.update()` — i.e. `Prefer: count=exact`. */
  countRequested: boolean;
  /** Whether `.select()` was chained — i.e. `Prefer: return=representation`. */
  representationRequested: boolean;
  hasOr: boolean;
  eq: [string, unknown][];
  inList?: string[];
  cols?: string;
};
let recorded: Recorded[] = [];

let share: ShareRow | null = null;
/** M119 (c) — the FIRST share read's error, which the route used to discard. */
let shareError: { message: string } | null = null;
let cartStatus = "open";
/** Rows the claim UPDATE matches. */
let claimMatches = 1;
let claimError: { message: string } | null = null;
/** The row as re-read inside the lost-claim branch. */
let rowAfter: { status: string; stripe_payment_intent_id: string | null } | null = null;
let rowAfterError: { message: string } | null = null;

let cancelled: string[] = [];
let cancelThrows: Record<string, { code?: string }> = {};
let retrieveStatus: Record<string, string> = {};
let createdKeys: string[] = [];
let createdAmounts: number[] = [];
const NEW_PI = "pi_new";

function stripeError(code?: string) {
  const e = new Error(code ?? "stripe failure") as Error & { code?: string };
  if (code) e.code = code;
  return e;
}

function selectBuilder(table: string, cols: string) {
  const rec: Recorded = {
    table,
    op: "select",
    countRequested: false,
    representationRequested: false,
    hasOr: false,
    eq: [],
    cols,
  };
  recorded.push(rec);
  const api = {
    eq: () => api,
    maybeSingle: () => {
      if (table === "qr_carts")
        return Promise.resolve({ data: { status: cartStatus }, error: null });
      // Two reads hit qr_cart_shares: the initial share fetch (asks for the money columns) and the
      // lost-claim re-read (asks for status + the intent pointer).
      if (cols.includes("subtotal_cents"))
        return Promise.resolve({ data: shareError ? null : share, error: shareError });
      return Promise.resolve({ data: rowAfter, error: rowAfterError });
    },
  };
  return api;
}

function updateBuilder(table: string, options?: { count?: string }) {
  const rec: Recorded = {
    table,
    op: "update",
    countRequested: options?.count != null,
    representationRequested: false,
    hasOr: false,
    eq: [],
  };
  recorded.push(rec);
  const settle = () => ({
    // postgrest's REAL contract, modelled deliberately: `count` is parsed from the `content-range`
    // response header ONLY when the request carried `Prefer: count=…`. An UPDATE without it resolves
    // `count: null`, so a route that stops asking for the count reads 0 rows and 409s every payer.
    count: rec.countRequested ? claimMatches : null,
    // Rows come back ONLY from `.select()` (`return=representation`). Without it, `data` is null.
    data: rec.representationRequested ? (claimMatches > 0 ? { id: "share-1" } : null) : null,
    error: claimError,
  });
  const api = {
    eq: (col: string, val: unknown) => {
      rec.eq.push([col, val]);
      return api;
    },
    in: (_col: string, list: string[]) => {
      rec.inList = list;
      return api;
    },
    or: () => {
      rec.hasOr = true;
      return api;
    },
    select: () => {
      rec.representationRequested = true;
      return { maybeSingle: () => Promise.resolve(settle()) };
    },
    then: (res: (v: ReturnType<typeof settle>) => unknown) => Promise.resolve(settle()).then(res),
  };
  return api;
}

vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: (table: string) => ({
      select: (cols: string) => selectBuilder(table, cols),
      update: (_patch: unknown, options?: { count?: string }) => updateBuilder(table, options),
    }),
  }),
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    paymentIntents: {
      create: (params: { amount: number }, opts: { idempotencyKey: string }) => {
        createdKeys.push(opts.idempotencyKey);
        createdAmounts.push(params.amount);
        return Promise.resolve({ id: NEW_PI, client_secret: "cs_test" });
      },
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

vi.mock("@/lib/authz", () => ({
  assertCartMember: () => Promise.resolve({ uid: "seat-1", settling: true }),
  AuthzError: class extends Error {
    status = 403;
  },
}));
vi.mock("@/lib/rate", () => ({ withinMutationRate: () => Promise.resolve(true) }));
vi.mock("@/lib/lock", () => ({ extendSettlement: () => Promise.resolve(null) }));
vi.mock("@/lib/split-settle", () => ({ captureAllIfReady: () => Promise.resolve() }));
vi.mock("@/lib/posthog-server", () => ({ getPostHogClient: () => ({ capture: () => {} }) }));

const { POST } = await import("./route");

function request(tipRate = 0.2) {
  return {
    json: () => Promise.resolve({ cartId: "11111111-1111-4111-8111-111111111111", tipRate }),
  } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  shareError = null;
  recorded = [];
  share = {
    id: "share-1",
    subtotal_cents: 2000,
    discount_cents: 0,
    service_charge_cents: 100,
    tax_cents: 193,
    status: "pending",
    stripe_payment_intent_id: null,
  };
  cartStatus = "open";
  claimMatches = 1;
  claimError = null;
  rowAfter = { status: "pending", stripe_payment_intent_id: "pi_someone_else" };
  rowAfterError = null;
  cancelled = [];
  cancelThrows = {};
  retrieveStatus = {};
  createdKeys = [];
  createdAmounts = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const claim = () => recorded.find((r) => r.op === "update" && r.table === "qr_cart_shares");

describe("create-share-intent — the claim must count rows, never ask for a representation", () => {
  it("asks PostgREST for a count", async () => {
    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(claim()?.countRequested).toBe(true);
  });

  it("never chains .select() onto the claim UPDATE", async () => {
    // The 2026-07-08 outage shape. `.or()` + `Prefer: return=representation` makes PostgREST 14
    // re-apply the or-tree against the RETURNING projection; the filtered column falls out of scope and
    // the UPDATE 400s with 42703 — on EVERY mint, with the retry deriving the same idempotency key.
    await POST(request());
    expect(claim()?.representationRequested).toBe(false);
  });

  it("scopes the claim to THIS share and to pre-authorization statuses", async () => {
    // Round-3 review — the TOCTOU gate. Without the id the claim rewrites another seat's row; without
    // the status list it flips a CAPTURED row back to pending, the double-pay the route's own comment
    // warns about.
    await POST(request());
    expect(claim()?.eq).toContainEqual(["id", "share-1"]);
    expect(claim()?.inList).toEqual(["pending", "failed", "canceled"]);
  });

  it("charges the server-derived amount, never anything from the request body", async () => {
    // The repo's first rule, asserted in the file built for this route. Derived from the SAME fixture
    // the mock serves — computed here, not transcribed.
    await POST(request(0.2));
    const base = 2000 - 0 + 100 + 193;
    const tip = Math.round((2000 - 0) * 0.2);
    expect(createdAmounts).toEqual([base + tip]);
  });

  it("still carries the or-predicate the count has to survive", async () => {
    // Guards the other direction: dropping the `.or()` would make the assertion above trivially true
    // while re-breaking the concurrent double-tap it exists for.
    await POST(request());
    expect(claim()?.hasOr).toBe(true);
  });

  it("409s rather than handing out a secret when the claim matched nothing", async () => {
    claimMatches = 0;
    const res = await POST(request());
    expect(res.status).toBe(409);
  });

  it("500s and leaves the intent LIVE when the claim write fails", async () => {
    // A failed write is retryable and the row still points at the previous intent, so the retry derives
    // the same key and Stripe replays a USABLE intent. Cancelling here re-creates M39's dead end.
    claimError = { message: "connection reset" };
    const res = await POST(request());
    expect(res.status).toBe(500);
    expect(cancelled).toEqual([]);
  });
});

describe("create-share-intent — a replaced hold is never forgotten", () => {
  it("mints nothing when the replaced intent's state could not be established", async () => {
    // The claim overwrites `stripe_payment_intent_id`, the only record of the prior intent. A 429/5xx
    // on the cancel tells us nothing about the hold, so minting over it strands a real authorization.
    share!.stripe_payment_intent_id = "pi_prev";
    cancelThrows = { pi_prev: { code: "api_error" } };
    const res = await POST(request());
    expect(res.status).toBe(503);
    expect(createdKeys).toEqual([]);
    expect(claim()).toBeUndefined();
  });

  it("refuses to repoint a share whose replaced intent already succeeded", async () => {
    // `payment_intent_unexpected_state` also means SUCCEEDED. Repointing would charge the seat twice.
    share!.stripe_payment_intent_id = "pi_paid";
    cancelThrows = { pi_paid: { code: "payment_intent_unexpected_state" } };
    retrieveStatus = { pi_paid: "succeeded" };
    const res = await POST(request());
    expect(res.status).toBe(409);
    expect(createdKeys).toEqual([]);
  });

  it("proceeds when the replaced intent is simply gone", async () => {
    share!.stripe_payment_intent_id = "pi_missing";
    cancelThrows = { pi_missing: { code: "resource_missing" } };
    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(createdKeys).toHaveLength(1);
  });

  it("varies the idempotency key with the intent it replaces", async () => {
    // M39, asserted at the CALL SITE — the pure function's own tests could not see whether the route
    // actually passes the previous id.
    await POST(request());
    const firstMint = createdKeys[0];
    createdKeys = [];
    recorded = [];
    share!.stripe_payment_intent_id = "pi_prev";
    await POST(request());
    expect(createdKeys[0]).not.toBe(firstMint);
  });
});

describe("create-share-intent — a lost claim must not void the payer's own hold", () => {
  it("does not cancel the minted intent when the row now points at it", async () => {
    // Two same-key requests get the SAME PaymentIntent back from Stripe. If the twin claimed the row
    // and the payer authorized on it, this intent IS the row's live authorization — cancelling it
    // voided the payer's hold and gated capture for the whole table.
    claimMatches = 0;
    rowAfter = { status: "authorized", stripe_payment_intent_id: NEW_PI };
    const res = await POST(request());
    expect(res.status).toBe(409);
    expect(cancelled).toEqual([]);
  });

  it("does cancel the minted intent when the row moved on to someone else's", async () => {
    claimMatches = 0;
    rowAfter = { status: "pending", stripe_payment_intent_id: "pi_twin" };
    await POST(request());
    expect(cancelled).toEqual([NEW_PI]);
  });

  it("says the share is settled only when the row actually says so", async () => {
    // Two tip taps ~1s apart mint two intents at different amounts, so the loser is the request the
    // client is listening to. Telling that payer their pending share was settled discarded their tip.
    claimMatches = 0;
    rowAfter = { status: "pending", stripe_payment_intent_id: "pi_twin" };
    const res = await POST(request());
    const body = (await res.json()) as { error: string };
    expect(body.error).not.toMatch(/already paid/i);
    expect(body.error).toMatch(/try again/i);
  });

  it("reports an unreadable re-read as retryable, not as a settled share", async () => {
    claimMatches = 0;
    rowAfter = null;
    rowAfterError = { message: "connection reset" };
    const res = await POST(request());
    expect(res.status).toBe(503);
  });

  it("cancels NOTHING when the re-read fails — the intent may be the payer's live hold", async () => {
    // Round-3 review. A null `now` made the pointer comparison read as "not ours", picking the
    // destructive branch on the one input that carries no information. Not knowing means not
    // cancelling: an authorize-only intent we walk away from lapses on its own.
    claimMatches = 0;
    rowAfter = null;
    rowAfterError = { message: "connection reset" };
    await POST(request());
    expect(cancelled).toEqual([]);
  });
});

/**
 * M119 (c) — an unreadable share read is not a membership verdict.
 *
 *     const { data: share } = await db.from("qr_cart_shares").select(…).eq("seat_id", uid).maybeSingle();
 *     if (!share) return NextResponse.json({ error: "You're not part of this split." }, { status: 400 });
 *
 * The `{ error }` was DISCARDED, so a transport failure made `share` null and told a payer looking at
 * their own share on the live split board that they are not in the split — with a 400, a client-fault
 * status, for our outage.
 *
 * The standard this file already holds itself to is 200 lines below, on the SAME table: the lost-claim
 * re-read binds `nowErr` and answers 503, under a comment reading "an UNREADABLE re-read must not pick
 * the destructive branch". Only the first read never bound its error.
 */
describe("M119c — a failed share read must not deny membership", () => {
  it("THE DEFECT — an unreadable read answers 503, never 'not part of this split'", async () => {
    shareError = { message: "transport failure" };
    const res = await POST(request());
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).not.toBe("You’re not part of this split.");
  });

  it("a seat genuinely absent from the split still gets the true, specific 400", async () => {
    share = null;
    shareError = null;
    const res = await POST(request());
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "You’re not part of this split." });
  });
});
