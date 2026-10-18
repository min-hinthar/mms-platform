import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * M160(b) — the sequence around the verdict: Stripe's own answer first, the cart the metadata
 * names, the verdict, and only then the webhook's own fulfillment. And the cron's sweep: what it
 * lists, what it skips, and how far it goes in one run.
 */
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("./posthog-server", () => ({
  getPostHogClient: () => ({ capture: () => {}, flush: () => Promise.resolve() }),
}));

const CART = "44444444-4444-4444-8444-444444444444";
const FOREIGN = "55555555-5555-4555-8555-555555555555";

type PI = {
  id: string;
  status: string;
  currency: string;
  metadata: Record<string, string | undefined>;
  latest_charge?: unknown;
  created?: number;
};
let retrieved: PI | Error;
const retrieves: string[] = [];
const retrieveParams: unknown[] = [];
let pages: { data: PI[]; has_more: boolean }[] = [];
const lists: Record<string, unknown>[] = [];
vi.mock("./stripe", () => ({
  getStripe: () => ({
    paymentIntents: {
      retrieve: (id: string, params?: unknown) => {
        retrieves.push(id);
        retrieveParams.push(params);
        return retrieved instanceof Error ? Promise.reject(retrieved) : Promise.resolve(retrieved);
      },
      list: (params: Record<string, unknown>) => {
        lists.push(params);
        return Promise.resolve(pages.shift() ?? { data: [], has_more: false });
      },
    },
  }),
}));

const fulfilled: { id: string; via: string }[] = [];
vi.mock("./fulfill-intent", () => ({
  fulfillSucceededIntent: (intent: PI, via: string) => {
    fulfilled.push({ id: intent.id, via });
    return Promise.resolve({ kind: "fulfilled", orderId: `order-${intent.id}` });
  },
}));

let cart: {
  status: string;
  live_payment_intent_id: string | null;
  settle_by?: string | null;
  settle_at?: string | null;
  locked?: boolean;
  locked_at?: string | null;
} | null;
const cartSelects: string[] = [];
let cartError: { message: string } | null = null;
let ordersOnRecord: string[] = [];
let refundsOnRecord: string[] = [];
let ledgerError: { message: string } | null = null;
let ourCarts: string[] = [];
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: (table: string) => ({
      select: (cols: string) => {
        cartSelects.push(cols);
        return {
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: cartError ? null : cart, error: cartError }),
          }),
          in: (_col: string, ids: string[]) => {
            if (table === "qr_orders")
              return Promise.resolve({
                data: ordersOnRecord
                  .filter((id) => ids.includes(id))
                  .map((id) => ({ stripe_payment_intent_id: id })),
                error: ledgerError,
              });
            if (table === "qr_refunds_needed")
              return Promise.resolve({
                data: refundsOnRecord
                  .filter((id) => ids.includes(id))
                  .map((id) => ({ payment_intent: id })),
                error: null,
              });
            return Promise.resolve({
              data: ourCarts.filter((id) => ids.includes(id)).map((id) => ({ id })),
              error: null,
            });
          },
        };
      },
    }),
  }),
}));

const {
  recoverIntent,
  sweepStrandedPayments,
  SWEEP_MAX_RECOVER,
  SWEEP_MAX_PAGES,
  SWEEP_LOOKBACK_MS,
  SWEEP_MIN_AGE_MS,
  SWEEP_SCHEDULE_INTERVAL_MS,
} = await import("./payment-recovery");
const { sweepWindow } = await import("./payment-recovery-verdict");

const pi = (
  id: string,
  over: Partial<PI> = {},
  meta: Record<string, string | undefined> = {},
): PI => ({
  id,
  status: "succeeded",
  currency: "usd",
  metadata: { cartId: CART, earnerUid: "payer-1", ...meta },
  latest_charge: { amount_refunded: 0, refunded: false },
  ...over,
});

beforeEach(() => {
  retrieved = pi("pi_1");
  retrieves.length = 0;
  retrieveParams.length = 0;
  cartSelects.length = 0;
  pages = [];
  lists.length = 0;
  fulfilled.length = 0;
  cart = { status: "open", live_payment_intent_id: "pi_1" };
  cartError = null;
  ordersOnRecord = [];
  refundsOnRecord = [];
  ledgerError = null;
  ourCarts = [CART];
});

describe("recoverIntent", () => {
  it("retrieves from Stripe, checks the verdict, and runs the webhook's fulfillment", async () => {
    const out = await recoverIntent("pi_1", { cartId: CART, payerUid: "payer-1" }, "track");
    expect(out).toEqual({ kind: "recorded" });
    expect(retrieves).toEqual(["pi_1"]);
    expect(fulfilled).toEqual([{ id: "pi_1", via: "track" }]);
  });

  it("retrieves with the charge EXPANDED — the refund rule cannot read a bare id", async () => {
    await recoverIntent("pi_1", { cartId: CART, payerUid: "payer-1" }, "track");
    expect(retrieveParams).toEqual([{ expand: ["latest_charge"] }]);
  });

  it("a charge refunded in Stripe before recovery ran is refused — no order for money that went back", async () => {
    retrieved = pi("pi_1", { latest_charge: { amount_refunded: 5200, refunded: true } });
    const out = await recoverIntent("pi_1", { cartId: CART, payerUid: null }, "staff");
    expect(out).toEqual({ kind: "refused" });
    expect(fulfilled).toEqual([]);
  });

  it("a secure-tab close bound by its settlement freeze is recovered (the cart reads the freeze)", async () => {
    const ATTEMPT = "66666666-6666-4666-8666-666666666666";
    retrieved = pi("pi_1", {}, { closedBy: "staff", settleAttempt: ATTEMPT, earnerUid: undefined });
    cart = {
      status: "open",
      live_payment_intent_id: null,
      settle_by: ATTEMPT,
      settle_at: "2026-10-18T12:00:00.000Z",
      locked: false,
      locked_at: null,
    };
    const out = await recoverIntent("pi_1", { cartId: CART, payerUid: null }, "cron");
    expect(out).toEqual({ kind: "recorded" });
    expect(cartSelects[0]).toBe(
      "status,live_payment_intent_id,settle_by,settle_at,locked,locked_at",
    );
  });

  it("a failed retrieve is error — a transport failure is never a verdict, and nothing runs", async () => {
    retrieved = new Error("stripe down");
    const out = await recoverIntent("pi_1", { cartId: CART, payerUid: null }, "staff");
    expect(out).toEqual({ kind: "error" });
    expect(fulfilled).toEqual([]);
  });

  it("an intent Stripe has not marked succeeded is not_paid — and is never fulfilled", async () => {
    retrieved = pi("pi_1", { status: "requires_payment_method" });
    const out = await recoverIntent("pi_1", { cartId: CART, payerUid: null }, "staff");
    expect(out).toEqual({ kind: "not_paid" });
    expect(fulfilled).toEqual([]);
  });

  it("a superseded intent (the open cart links another) is refused — never fulfilled", async () => {
    cart = { status: "open", live_payment_intent_id: "pi_successor" };
    const out = await recoverIntent("pi_1", { cartId: CART, payerUid: null }, "staff");
    expect(out).toEqual({ kind: "refused" });
    expect(fulfilled).toEqual([]);
  });

  it("another payer's intent is refused at the guest door", async () => {
    const out = await recoverIntent("pi_1", { cartId: CART, payerUid: "not-the-payer" }, "track");
    expect(out).toEqual({ kind: "refused" });
    expect(fulfilled).toEqual([]);
  });

  it("an unreadable cart is error, not 'no cart' — and nothing runs", async () => {
    cartError = { message: "timeout" };
    const out = await recoverIntent("pi_1", { cartId: CART, payerUid: null }, "staff");
    expect(out).toEqual({ kind: "error" });
    expect(fulfilled).toEqual([]);
  });

  it("a cancelled cart reaches the shared fulfillment (which records refund-needed, no order)", async () => {
    cart = { status: "cancelled", live_payment_intent_id: null };
    await recoverIntent("pi_1", { cartId: CART, payerUid: null }, "cron");
    expect(fulfilled).toEqual([{ id: "pi_1", via: "cron" }]);
  });
});

describe("sweepStrandedPayments", () => {
  const NOW = Date.UTC(2026, 9, 18, 12, 0, 0);

  it("lists only the bounded window, in Stripe's seconds, with each charge expanded", async () => {
    await sweepStrandedPayments(NOW);
    expect(lists[0]).toEqual({
      created: {
        gte: (NOW - (24 * 3600_000 + 3 * 60_000 + 3600_000)) / 1000,
        lte: (NOW - 3 * 60_000) / 1000,
      },
      limit: 100,
      expand: ["data.latest_charge"],
    });
  });

  // Codex on #365 @ a2636db (P2): a 24 h lookback minus the 3 min floor left a gap between two
  // daily runs — an intent created in the 3 minutes before one run was never in ANY run's window.
  it("two runs one schedule interval apart OVERLAP — no intent falls between them", () => {
    const first = sweepWindow(NOW, SWEEP_LOOKBACK_MS, SWEEP_MIN_AGE_MS);
    const next = sweepWindow(NOW + SWEEP_SCHEDULE_INTERVAL_MS, SWEEP_LOOKBACK_MS, SWEEP_MIN_AGE_MS);
    expect(next.gte).toBeLessThan(first.lte);
    // …by the stated margin, not by a rounding accident.
    expect(first.lte - next.gte).toBeGreaterThanOrEqual(30 * 60);
  });

  it("recovers a stranded succeeded intent and skips everything already on record", async () => {
    cart = { status: "open", live_payment_intent_id: "pi_stranded" };
    pages = [
      {
        data: [
          pi("pi_stranded"),
          pi("pi_has_order"),
          pi("pi_on_refund_list"),
          pi("pi_not_paid", { status: "requires_payment_method" }),
          pi("pi_split", {}, { kind: "split_share" }),
          pi("pi_terminal", {}, { kind: "terminal" }),
          pi("pi_no_cart", {}, { cartId: undefined }),
        ],
        has_more: false,
      },
    ];
    ordersOnRecord = ["pi_has_order"];
    refundsOnRecord = ["pi_on_refund_list"];
    const summary = await sweepStrandedPayments(NOW);
    expect(fulfilled).toEqual([{ id: "pi_stranded", via: "cron" }]);
    expect(summary).toEqual({
      listed: 7,
      candidates: 1,
      foreign: 0,
      answers: { recorded: 1 },
      truncated: false,
    });
  });

  it("another app's intent on the shared Stripe account is counted foreign and never touched", async () => {
    pages = [{ data: [pi("pi_delivery", {}, { cartId: FOREIGN })], has_more: false }];
    const summary = await sweepStrandedPayments(NOW);
    expect(fulfilled).toEqual([]);
    expect(summary.foreign).toBe(1);
  });

  it("an unreadable order ledger throws — the sweep never recovers blind", async () => {
    pages = [{ data: [pi("pi_x")], has_more: false }];
    ledgerError = { message: "timeout" };
    await expect(sweepStrandedPayments(NOW)).rejects.toThrow(/order ledger unreadable/);
    expect(fulfilled).toEqual([]);
  });

  it(`recovers at most ${SWEEP_MAX_RECOVER} per run and says it was truncated`, async () => {
    const many = Array.from({ length: SWEEP_MAX_RECOVER + 3 }, (_, i) => pi(`pi_${i}`));
    pages = [{ data: many, has_more: false }];
    // What each attempt answers is not what is measured here (the cart read says no cart, so each
    // is refused); the COUNT of attempts is, and every attempt lands in `answers`.
    cart = null;
    const summary = await sweepStrandedPayments(NOW);
    expect(summary.candidates).toBe(SWEEP_MAX_RECOVER + 3);
    expect(Object.values(summary.answers).reduce((a, b) => a + (b ?? 0), 0)).toBe(
      SWEEP_MAX_RECOVER,
    );
    expect(summary.truncated).toBe(true);
  });

  it(`reads at most ${SWEEP_MAX_PAGES} pages, paging by the last id`, async () => {
    pages = Array.from({ length: SWEEP_MAX_PAGES + 2 }, (_, p) => ({
      data: [pi(`pi_p${p}`, { status: "canceled" })],
      has_more: true,
    }));
    const summary = await sweepStrandedPayments(NOW);
    expect(lists).toHaveLength(SWEEP_MAX_PAGES);
    expect(lists[1]).toMatchObject({ starting_after: "pi_p0" });
    expect(summary.truncated).toBe(true);
  });

  // Codex on #365 @ a2636db (P2): newest-first with a restart per run, a capped list never reaches
  // the oldest part of a busy window. The bound stays (justified at `SWEEP_MAX_PAGES`); what may not
  // happen is a SILENT gap.
  it("a run stopped by the page cap says so at error level, with how far back it reached", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    pages = Array.from({ length: SWEEP_MAX_PAGES + 1 }, (_, p) => ({
      data: [pi(`pi_p${p}`, { status: "canceled", created: 1_792_000_000 - p })],
      has_more: true,
    }));
    await sweepStrandedPayments(NOW);
    const capped = err.mock.calls.filter((c) => String(c[0]).includes("page cap"));
    expect(capped).toHaveLength(1);
    expect(capped[0]?.[1]).toMatchObject({
      pages: SWEEP_MAX_PAGES,
      reachedCreated: 1_792_000_000 - (SWEEP_MAX_PAGES - 1),
    });
    err.mockRestore();
  });

  it("a window that ends before the cap is not called truncated, and logs nothing", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    pages = [{ data: [pi("pi_only", { status: "canceled" })], has_more: false }];
    const summary = await sweepStrandedPayments(NOW);
    expect(summary.truncated).toBe(false);
    expect(err.mock.calls.filter((c) => String(c[0]).includes("page cap"))).toEqual([]);
    err.mockRestore();
  });
});
