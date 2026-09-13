import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * W6c — the Terminal settle's authority rules, asserted as CALL SHAPES + ordering (the
 * degenerate-mock lesson: assert the params and the sequence, never a scripted answer):
 *
 *   • unset STRIPE_TERMINAL_READER_ID = the feature is OFF — refuse before any money work;
 *   • the settlement freeze is acquired BEFORE the PI is minted (the double-collect mutex), keyed
 *     by a per-ATTEMPT id that also rides the PI metadata — so every release is SCOPED to its own
 *     attempt (a late webhook / stale panel / double-tap loser can never null a successor's live
 *     freeze: the review's confirmed-HIGH era-confusion class);
 *   • the SUCCESS path HOLDS the freeze (the webhook fulfill is the terminal state); every failure
 *     path releases — scoped;
 *   • a DECLINE is released BY THE POLL the moment it is observed ("try another card or cash" must
 *     be true when we say it, not after a webhook lands);
 *   • the captured-but-unfulfilled window ("recording") keeps EXTENDING the freeze — money has
 *     moved and the cart is still open, the window where takeover is a guaranteed double-collect;
 *   • the PI amount is the server-derived total; the reader runs tip-free (skip_tipping);
 *   • the idempotency key is per-ATTEMPT (a stable key caches a decline for 24h);
 *   • cancel clears the reader only when its live action IS this PI, and releases the freeze ONLY
 *     after the PI cancel succeeds (a tap that won the race keeps the freeze — the webhook owns it).
 */

vi.mock("server-only", () => ({}));

// ── ordered spy log ──────────────────────────────────────────────────────────────────────────────
let calls: { op: string; args?: unknown }[] = [];
const log = (op: string, args?: unknown) => calls.push({ op, args });

// Stripe mock — scripted failure switches per test.
let piCreateFails = false;
let processFails: { code: string } | null = null;
let piCancelFails = false;
let retrieved: Record<string, unknown> | null = null;
/** A3 — what `retrieve` answers AFTER a `cancel` has been attempted: the re-read that decides whether
 *  a refused cancel means "the tap won", "already canceled" or "cannot tell". */
let retrievedAfterCancel: Record<string, unknown> | null = null;
let retrieveFailsAfterCancel = false;
let readerAction: Record<string, unknown> | null = null;
vi.mock("./stripe", () => ({
  getStripe: () => ({
    paymentIntents: {
      create: (params: unknown, opts: unknown) => {
        log("pi.create", { params, opts });
        if (piCreateFails)
          return Promise.reject(Object.assign(new Error("nope"), { code: "api_error" }));
        return Promise.resolve({ id: "pi_test_1", amount: (params as { amount: number }).amount });
      },
      cancel: (id: string) => {
        log("pi.cancel", id);
        if (piCancelFails)
          return Promise.reject(
            Object.assign(new Error("succeeded"), { code: "payment_intent_unexpected_state" }),
          );
        return Promise.resolve({ id });
      },
      retrieve: (id: string) => {
        log("pi.retrieve", id);
        const afterCancel = calls.some((c) => c.op === "pi.cancel");
        if (afterCancel && retrieveFailsAfterCancel)
          return Promise.reject(Object.assign(new Error("net"), { code: "api_connection_error" }));
        // `false ?? x` is `false`, not `x` — a bare `afterCancel && …` here returned `false` on every
        // base-case read and made all 15 poll/cancel cases refuse as "Invalid request."
        const answer = afterCancel && retrievedAfterCancel ? retrievedAfterCancel : retrieved;
        return Promise.resolve(answer ?? { id, status: "requires_payment_method", metadata: {} });
      },
    },
    terminal: {
      readers: {
        retrieve: (readerId: string) => {
          log("reader.retrieve", readerId);
          return Promise.resolve({ id: readerId, action: readerAction });
        },
        processPaymentIntent: (readerId: string, params: unknown) => {
          log("reader.process", { readerId, params });
          if (processFails)
            return Promise.reject(Object.assign(new Error("reader"), { code: processFails.code }));
          return Promise.resolve({ id: readerId });
        },
        cancelAction: (readerId: string) => {
          log("reader.cancelAction", readerId);
          return Promise.resolve({ id: readerId });
        },
      },
    },
  }),
}));

vi.mock("./staff", () => ({
  STAFF_WRITE_OUTAGE: "outage",
  staffGate: () =>
    Promise.resolve({
      ok: true,
      caller: { uid: "staff-uid", staffId: "staff-row-id", role: "manager" },
    }),
}));
vi.mock("./staff-open-cart", () => ({
  openCartFor: () =>
    Promise.resolve({
      session: { id: "sess-1", status: "active", mode: "pickup", qr_code: "reg-XYZ" },
      cart: { id: "cart-1", locked: false, locked_at: null, settle_at: null, tab_type: "none" },
      unavailable: false,
    }),
}));
vi.mock("./pay-guard", () => ({ paymentInFlightReason: () => Promise.resolve(null) }));
vi.mock("./totals", () => ({
  getCartTotals: (cartId: string, tipRate: number) => {
    log("totals", { cartId, tipRate });
    return Promise.resolve({
      totalCents: 4321,
      subtotalCents: 4000,
      discountCents: 0,
      serviceChargeCents: 200,
      taxCents: 121,
      tipCents: 0,
    });
  },
}));
let acquireResult: "acquired" | "locked" | "settling_other" | "closed" = "acquired";
/** A3 — the extend now ANSWERS. `false` is "nothing of this attempt's was fresh to extend";
 *  `extendError` non-null is an OUTAGE, which must never be read as a verdict. */
let extendResult = true;
let extendError: { message: string } | null = null;
vi.mock("./lock", () => ({
  acquireSettlement: (cartId: string, uid: string) => {
    log("acquire", { cartId, uid });
    return Promise.resolve(acquireResult);
  },
  releaseSettlementFor: (cartId: string, attemptId: string) => {
    log("releaseFor", { cartId, attemptId });
    return Promise.resolve({ released: true, error: null });
  },
  extendSettlementFor: (cartId: string, owner: string) => {
    log("extend", { cartId, owner });
    return Promise.resolve({ extended: extendResult, error: extendError });
  },
}));
vi.mock("./posthog-server", () => ({
  getPostHogClient: () => ({ capture: () => {}, flush: () => Promise.resolve() }),
}));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

let orderRow: { id: string } | null = null;
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: (table: string) => ({
      select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
        if (opts?.head) return { eq: () => Promise.resolve({ count: 2, error: null }) };
        return {
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({ data: table === "qr_orders" ? orderRow : null, error: null }),
          }),
        };
      },
    }),
  }),
}));

const { settleCard, terminalStatus, cancelTerminal } = await import("./terminal");
const SESSION = "11111111-1111-4111-8111-111111111111";
const UUID_RE = /^[0-9a-f-]{36}$/;

/** The attempt id every scoped call must agree on: acquire's key == metadata.settleAttempt. */
function mintedAttempt(): string {
  const create = calls.find((c) => c.op === "pi.create")?.args as {
    params: { metadata: Record<string, string> };
  };
  return create.params.metadata.settleAttempt ?? "";
}

beforeEach(() => {
  calls = [];
  piCreateFails = false;
  processFails = null;
  piCancelFails = false;
  retrieved = null;
  readerAction = null;
  orderRow = null;
  acquireResult = "acquired";
  vi.stubEnv("STRIPE_TERMINAL_READER_ID", "tmr_test_reader");
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  extendResult = true;
  extendError = null;
  retrievedAfterCancel = null;
  retrieveFailsAfterCancel = false;
  acquireResult = "acquired";
  vi.unstubAllEnvs();
});

describe("settleCard — the reader gate + attempt-scoped freeze lifecycle", () => {
  it("an UNSET reader id means the feature is OFF — refuse before any money work", async () => {
    vi.stubEnv("STRIPE_TERMINAL_READER_ID", "");
    const r = await settleCard({ sessionId: SESSION });
    expect(r.ok).toBe(false);
    // No freeze, no totals, no Stripe call — the refusal costs nothing and holds nothing.
    expect(calls).toHaveLength(0);
  });

  it("acquires the freeze BEFORE minting, keyed by the SAME per-attempt id the PI metadata carries", async () => {
    const r = await settleCard({ sessionId: SESSION });
    expect(r).toMatchObject({ ok: true, paymentIntentId: "pi_test_1", totalCents: 4321 });
    const ops = calls.map((c) => c.op);
    // The mutex order: freeze → totals → mint → reader. Money never derives on an unfrozen cart.
    expect(ops.indexOf("acquire")).toBeGreaterThan(-1);
    expect(ops.indexOf("acquire")).toBeLessThan(ops.indexOf("totals"));
    expect(ops.indexOf("totals")).toBeLessThan(ops.indexOf("pi.create"));
    expect(ops.indexOf("pi.create")).toBeLessThan(ops.indexOf("reader.process"));
    // The attempt key: a fresh UUID (NOT the staff uid — same-uid re-acquire would let a double-
    // tap share the freeze), and the PI metadata carries the SAME id so every later release can
    // scope to this attempt's era.
    const acq = calls.find((c) => c.op === "acquire")?.args as { cartId: string; uid: string };
    expect(acq.uid).toMatch(UUID_RE);
    expect(acq.uid).not.toBe("staff-uid");
    expect(mintedAttempt()).toBe(acq.uid);
    // Success HOLDS the freeze: the webhook's open→paid flip is the terminal state.
    expect(ops).not.toContain("releaseFor");
  });

  it("the PI is the server total, card_present, tip-free metadata, per-attempt key", async () => {
    await settleCard({ sessionId: SESSION });
    const create = calls.find((c) => c.op === "pi.create")?.args as {
      params: {
        amount: number;
        payment_method_types: string[];
        capture_method: string;
        metadata: Record<string, string>;
      };
      opts: { idempotencyKey: string };
    };
    expect(create.params.amount).toBe(4321); // getCartTotals(cart, 0) — never a client amount
    expect(create.params.payment_method_types).toEqual(["card_present"]);
    // Manual capture would strand the PI: the amount_capturable_updated arm is split_share-only.
    expect(create.params.capture_method).toBe("automatic");
    expect(create.params.metadata.cartId).toBe("cart-1");
    expect(create.params.metadata.tipRate).toBe("0");
    // 'terminal', NEVER 'split_share' — the share arm would route this PI into ledger code with no row.
    expect(create.params.metadata.kind).toBe("terminal");
    expect(create.params.metadata.settledByStaffId).toBe("staff-row-id");
    // Per-attempt (uuid) — a STABLE key caches a Stripe decline for 24h (the closeSecureTab lesson).
    expect(create.opts.idempotencyKey).toMatch(/^pi_cart-1_term_[0-9a-f-]{36}$/);
  });

  it("the reader runs TIP-FREE — skip_tipping in the process config", async () => {
    await settleCard({ sessionId: SESSION });
    const proc = calls.find((c) => c.op === "reader.process")?.args as {
      readerId: string;
      params: { payment_intent: string; process_config: { skip_tipping: boolean } };
    };
    expect(proc.readerId).toBe("tmr_test_reader");
    expect(proc.params.payment_intent).toBe("pi_test_1");
    // An on-reader tip mutates the amount after mint; no tipRate reproduces a dollar tip, so every
    // tipped tap would 409-loop the webhook reconcile and strand the charge.
    expect(proc.params.process_config.skip_tipping).toBe(true);
  });

  it("a reader hand-off failure cancels the orphan PI and releases — scoped to THIS attempt", async () => {
    processFails = { code: "terminal_reader_offline" };
    const r = await settleCard({ sessionId: SESSION });
    expect(r.ok).toBe(false);
    const ops = calls.map((c) => c.op);
    expect(ops).toContain("pi.cancel");
    expect(ops.indexOf("pi.cancel")).toBeLessThan(ops.indexOf("releaseFor"));
    const rel = calls.find((c) => c.op === "releaseFor")?.args as {
      cartId: string;
      attemptId: string;
    };
    expect(rel).toEqual({ cartId: "cart-1", attemptId: mintedAttempt() });
  });

  it("a PI-create failure releases the freeze (nothing to cancel), scoped", async () => {
    piCreateFails = true;
    const r = await settleCard({ sessionId: SESSION });
    expect(r.ok).toBe(false);
    const acq = calls.find((c) => c.op === "acquire")?.args as { uid: string };
    const rel = calls.find((c) => c.op === "releaseFor")?.args as { attemptId: string };
    expect(rel?.attemptId).toBe(acq.uid);
  });

  it("a refused freeze is a refusal — no PI is ever minted over someone else's settle", async () => {
    acquireResult = "settling_other";
    const r = await settleCard({ sessionId: SESSION });
    expect(r.ok).toBe(false);
    expect(calls.map((c) => c.op)).not.toContain("pi.create");
    // The loser acquired nothing, so it releases nothing (a release here would null the winner's).
    expect(calls.map((c) => c.op)).not.toContain("releaseFor");
  });
});

const TERMINAL_META = { kind: "terminal", cartId: "cart-1", settleAttempt: "attempt-1" };

describe("terminalStatus — the collect-window poll", () => {
  it("mid-collect it EXTENDS the freeze (the >10-min chip interaction can't lose the cart)", async () => {
    retrieved = {
      id: "pi_test_1",
      status: "requires_payment_method",
      last_payment_error: null,
      metadata: TERMINAL_META,
      amount: 4321,
    };
    const r = await terminalStatus({ sessionId: SESSION, paymentIntentId: "pi_test_1" });
    expect(r).toEqual({ ok: true, state: "collecting" });
    // ⚠️ SCOPED to this attempt (A3 · M203): an unscoped extend kept alive whatever freeze the row
    // held — a cash settle's, after a takeover — and could not say when it had extended nothing.
    expect(calls.find((c) => c.op === "extend")?.args).toEqual({
      cartId: "cart-1",
      owner: "attempt-1",
    });
  });

  it("a mutex lost MID-COLLECT abandons the attempt — reader first, then the PI — and reports `failed` (A3 · M203)", async () => {
    // `extended: false` while the customer is on the reader means the table's freeze is no longer this
    // attempt's: it aged past the TTL and someone else acquired, or a scoped release already ran. A
    // cash settle can now proceed beside a live card prompt — the double-collect. The old unscoped
    // extend no-oped silently here and the poll kept saying "collecting".
    retrieved = {
      id: "pi_test_1",
      status: "requires_payment_method",
      last_payment_error: null,
      metadata: TERMINAL_META,
      amount: 4321,
    };
    readerAction = {
      type: "process_payment_intent",
      process_payment_intent: { payment_intent: "pi_test_1" },
    };
    extendResult = false;
    acquireResult = "settling_other"; // a colleague holds the table fresh — the re-acquire refuses
    const r = await terminalStatus({ sessionId: SESSION, paymentIntentId: "pi_test_1" });
    expect(r).toEqual({
      ok: true,
      state: "failed",
      error: expect.stringMatching(/payment hold was lost/),
    });
    const ops = calls.map((c) => c.op);
    // The re-acquire was ASKED before anything was abandoned — it is what separates "aged out" from
    // "taken", and it is keyed on the same attempt.
    expect(calls.find((c) => c.op === "acquire")?.args).toEqual({
      cartId: "cart-1",
      uid: "attempt-1",
    });
    expect(ops.indexOf("acquire")).toBeLessThan(ops.indexOf("reader.cancelAction"));
    expect(ops.indexOf("reader.cancelAction")).toBeLessThan(ops.indexOf("pi.cancel"));
    // Nothing of ours to release: the freeze is not this attempt's, and the webhook's canceled arm
    // scopes its own release to the attempt anyway.
    expect(ops).not.toContain("releaseFor");
  });

  it("a freeze that merely AGED OUT is re-acquired under the same attempt and the collect continues", async () => {
    // A backgrounded tablet stops polling; ten minutes later the freeze is stale but nobody took the
    // table. Abandoning a live tap there would be the over-block. The re-acquire succeeds on a stale
    // freeze — the same statement the counter uses — and the reader keeps going.
    retrieved = {
      id: "pi_test_1",
      status: "requires_payment_method",
      last_payment_error: null,
      metadata: TERMINAL_META,
      amount: 4321,
    };
    extendResult = false;
    acquireResult = "acquired";
    const r = await terminalStatus({ sessionId: SESSION, paymentIntentId: "pi_test_1" });
    expect(r).toEqual({ ok: true, state: "collecting" });
    const ops = calls.map((c) => c.op);
    expect(ops).toContain("acquire");
    expect(ops).not.toContain("pi.cancel");
    expect(ops).not.toContain("reader.cancelAction");
  });

  it("an extend OUTAGE is a poll miss, not a lost mutex — nothing is cancelled and nothing re-acquired (blind pass, CRITICAL 2)", async () => {
    // `{ extended: false, error }` is what a PostgREST hiccup produces. The first draft read it as
    // "lost": it wiped the guest's live tap and told staff the hold "was lost … being settled
    // another way" — a fabricated diagnosis over an outage.
    retrieved = {
      id: "pi_test_1",
      status: "requires_payment_method",
      last_payment_error: null,
      metadata: TERMINAL_META,
      amount: 4321,
    };
    extendResult = false;
    extendError = { message: "connection reset" };
    const r = await terminalStatus({ sessionId: SESSION, paymentIntentId: "pi_test_1" });
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/still trying/) });
    const ops = calls.map((c) => c.op);
    expect(ops).not.toContain("acquire");
    expect(ops).not.toContain("pi.cancel");
    expect(ops).not.toContain("reader.cancelAction");
  });

  it("a refused cancel whose re-read says SUCCEEDED reports `succeeded` — the tap already won", async () => {
    retrieved = {
      id: "pi_test_1",
      status: "requires_payment_method",
      last_payment_error: null,
      metadata: TERMINAL_META,
      amount: 4321,
    };
    extendResult = false;
    acquireResult = "settling_other";
    piCancelFails = true;
    retrievedAfterCancel = {
      id: "pi_test_1",
      status: "succeeded",
      metadata: TERMINAL_META,
      amount: 4321,
    };
    const r = await terminalStatus({ sessionId: SESSION, paymentIntentId: "pi_test_1" });
    piCancelFails = false;
    expect(r).toEqual({ ok: true, state: "succeeded", orderId: null, totalCents: 4321 });
  });

  it("a refused cancel on an ALREADY-CANCELED intent is `failed`, never `succeeded` (blind pass, CRITICAL 1)", async () => {
    // Stripe answers `payment_intent_unexpected_state` for a canceled intent exactly as it does for a
    // succeeded one. Reading every refusal as "the tap won" reported a paid state with a dollar
    // total for money never taken — two tablets polling one attempt is all it takes.
    retrieved = {
      id: "pi_test_1",
      status: "requires_payment_method",
      last_payment_error: null,
      metadata: TERMINAL_META,
      amount: 4321,
    };
    extendResult = false;
    acquireResult = "settling_other";
    piCancelFails = true;
    retrievedAfterCancel = {
      id: "pi_test_1",
      status: "canceled",
      metadata: TERMINAL_META,
      amount: 4321,
    };
    const r = await terminalStatus({ sessionId: SESSION, paymentIntentId: "pi_test_1" });
    piCancelFails = false;
    expect(r).toEqual({
      ok: true,
      state: "failed",
      error: expect.stringMatching(/payment hold was lost/),
    });
  });

  it("a refused cancel whose re-read FAILS is a poll miss — never a paid state", async () => {
    retrieved = {
      id: "pi_test_1",
      status: "requires_payment_method",
      last_payment_error: null,
      metadata: TERMINAL_META,
      amount: 4321,
    };
    extendResult = false;
    acquireResult = "settling_other";
    piCancelFails = true;
    retrieveFailsAfterCancel = true;
    const r = await terminalStatus({ sessionId: SESSION, paymentIntentId: "pi_test_1" });
    piCancelFails = false;
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/still trying/) });
  });

  it("captured-but-unfulfilled: the extend is scoped, and a lost freeze is LOGGED rather than hidden", async () => {
    // Money has moved and the webhook owns fulfilment; nothing can be undone. The honest act in the
    // worst window is to say so under the attempt, not to swallow a zero-row update as before.
    retrieved = { id: "pi_test_1", status: "succeeded", metadata: TERMINAL_META, amount: 4321 };
    orderRow = null;
    extendResult = false;
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await terminalStatus({ sessionId: SESSION, paymentIntentId: "pi_test_1" });
    expect(r).toEqual({ ok: true, state: "succeeded", orderId: null, totalCents: 4321 });
    expect(calls.find((c) => c.op === "extend")?.args).toEqual({
      cartId: "cart-1",
      owner: "attempt-1",
    });
    expect(
      errSpy.mock.calls.some(([msg]) =>
        String(msg).includes("no longer holds the settlement freeze"),
      ),
    ).toBe(true);
    errSpy.mockRestore();
    expect(calls.map((c) => c.op)).not.toContain("pi.cancel"); // never cancel a captured charge
  });

  it("a non-terminal PI is not pollable — the id is a handle, the metadata is the authority", async () => {
    retrieved = {
      id: "pi_x",
      status: "succeeded",
      metadata: { kind: "split_share", cartId: "cart-9" },
      amount: 1,
    };
    const r = await terminalStatus({ sessionId: SESSION, paymentIntentId: "pi_x" });
    expect(r.ok).toBe(false);
  });

  it("a decline releases THIS attempt's freeze AT OBSERVATION — retry and cash are true immediately", async () => {
    retrieved = {
      id: "pi_test_1",
      status: "requires_payment_method",
      last_payment_error: { code: "card_declined" },
      metadata: TERMINAL_META,
      amount: 4321,
    };
    const r = await terminalStatus({ sessionId: SESSION, paymentIntentId: "pi_test_1" });
    expect(r).toMatchObject({ ok: true, state: "failed" });
    // Scoped: a stale panel polling an OLD attempt must match zero rows, never a successor's freeze.
    expect(calls.find((c) => c.op === "releaseFor")?.args).toEqual({
      cartId: "cart-1",
      attemptId: "attempt-1",
    });
    expect(calls.map((c) => c.op)).not.toContain("extend");
  });

  it("captured-but-unfulfilled ('recording') KEEPS extending — the window where takeover double-collects", async () => {
    retrieved = { id: "pi_test_1", status: "succeeded", metadata: TERMINAL_META, amount: 4321 };
    orderRow = null; // the webhook hasn't landed the order yet
    const r = await terminalStatus({ sessionId: SESSION, paymentIntentId: "pi_test_1" });
    expect(r).toEqual({ ok: true, state: "succeeded", orderId: null, totalCents: 4321 });
    // Scoped to this attempt (A3): the recording window is exactly where a takeover double-collects.
    expect(calls.find((c) => c.op === "extend")?.args).toEqual({
      cartId: "cart-1",
      owner: "attempt-1",
    });
  });

  it("succeeded reports the fulfilled order once the webhook lands it", async () => {
    retrieved = { id: "pi_test_1", status: "succeeded", metadata: TERMINAL_META, amount: 4321 };
    orderRow = { id: "order-1" };
    const r = await terminalStatus({ sessionId: SESSION, paymentIntentId: "pi_test_1" });
    expect(r).toEqual({ ok: true, state: "succeeded", orderId: "order-1", totalCents: 4321 });
  });
});

describe("cancelTerminal — scoped release, PI-verified reader clear", () => {
  it("clears the reader ONLY when its live action is THIS PI, then cancels, then releases scoped", async () => {
    retrieved = {
      id: "pi_test_1",
      status: "requires_payment_method",
      metadata: TERMINAL_META,
      amount: 4321,
    };
    readerAction = {
      type: "process_payment_intent",
      process_payment_intent: { payment_intent: "pi_test_1" },
    };
    const r = await cancelTerminal({ sessionId: SESSION, paymentIntentId: "pi_test_1" });
    expect(r).toEqual({ ok: true });
    const ops = calls.map((c) => c.op);
    expect(ops.indexOf("reader.cancelAction")).toBeLessThan(ops.indexOf("pi.cancel"));
    expect(ops.indexOf("pi.cancel")).toBeLessThan(ops.indexOf("releaseFor"));
    expect(calls.find((c) => c.op === "releaseFor")?.args).toEqual({
      cartId: "cart-1",
      attemptId: "attempt-1",
    });
  });

  it("a reader busy with a DIFFERENT collect is left alone — cancelAction is reader-scoped, not PI-scoped", async () => {
    retrieved = {
      id: "pi_test_1",
      status: "requires_payment_method",
      metadata: TERMINAL_META,
      amount: 4321,
    };
    readerAction = {
      type: "process_payment_intent",
      process_payment_intent: { payment_intent: "pi_OTHER_TABLE" },
    };
    const r = await cancelTerminal({ sessionId: SESSION, paymentIntentId: "pi_test_1" });
    expect(r).toEqual({ ok: true }); // our PI still cancels; the other table's prompt survives
    expect(calls.map((c) => c.op)).not.toContain("reader.cancelAction");
  });

  it("a refused cancel on an already-CANCELED intent still releases scoped and answers ok", async () => {
    retrieved = {
      id: "pi_test_1",
      status: "requires_payment_method",
      metadata: TERMINAL_META,
      amount: 4321,
    };
    piCancelFails = true;
    retrievedAfterCancel = { id: "pi_test_1", status: "canceled", metadata: TERMINAL_META };
    const r = await cancelTerminal({ sessionId: SESSION, paymentIntentId: "pi_test_1" });
    piCancelFails = false;
    expect(r).toEqual({ ok: true });
    expect(calls.find((c) => c.op === "releaseFor")?.args).toEqual({
      cartId: "cart-1",
      attemptId: "attempt-1",
    });
  });

  it("a refused cancel whose re-read fails is 'couldn't reach Stripe', not 'too late'", async () => {
    retrieved = {
      id: "pi_test_1",
      status: "requires_payment_method",
      metadata: TERMINAL_META,
      amount: 4321,
    };
    piCancelFails = true;
    retrieveFailsAfterCancel = true;
    const r = await cancelTerminal({ sessionId: SESSION, paymentIntentId: "pi_test_1" });
    piCancelFails = false;
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/reach Stripe/) });
    expect(calls.map((c) => c.op)).not.toContain("releaseFor");
  });

  it("a tap that won the race keeps the freeze — 'too late' is the honest answer", async () => {
    retrieved = { id: "pi_test_1", status: "succeeded", metadata: TERMINAL_META, amount: 4321 };
    piCancelFails = true;
    const r = await cancelTerminal({ sessionId: SESSION, paymentIntentId: "pi_test_1" });
    expect(r.ok).toBe(false);
    // The webhook fulfill owns the freeze from here — releasing would reopen the double-collect.
    expect(calls.map((c) => c.op)).not.toContain("releaseFor");
  });
});
