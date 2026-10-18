import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
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
/** `mms_identity_merges`: anon uid → the account it merged into (K3b). */
let merges: Record<string, string> = {};
let mergeError: { message: string } | null = null;
const mergeReads: unknown[] = [];
/** Every `.in()` the sweep sent, by table, with how many ids it carried. */
const inCalls: { table: string; n: number }[] = [];
/** Fail the order ledger's Nth `.in()` read (1-based) — a chunk error mid-sweep. */
let ledgerErrorOnCall = 0;
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: (table: string) => ({
      select: (cols: string) => {
        if (table !== "mms_identity_merges") cartSelects.push(cols);
        return {
          eq: (_col: string, v: string) => ({
            maybeSingle: () => {
              if (table === "mms_identity_merges") {
                mergeReads.push(v);
                return Promise.resolve({
                  data: mergeError || !merges[v] ? null : { target_uid: merges[v] },
                  error: mergeError,
                });
              }
              return Promise.resolve({ data: cartError ? null : cart, error: cartError });
            },
          }),
          in: (_col: string, ids: string[]) => {
            inCalls.push({ table, n: ids.length });
            if (table === "qr_orders") {
              const nth = inCalls.filter((c) => c.table === "qr_orders").length;
              return Promise.resolve({
                data: ordersOnRecord
                  .filter((id) => ids.includes(id))
                  .map((id) => ({ stripe_payment_intent_id: id })),
                error: ledgerErrorOnCall === nth ? { message: "URI too long" } : ledgerError,
              });
            }
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
  SWEEP_ID_CHUNK,
  SWEEP_MAX_EXAMINE,
  SWEEP_TIME_BUDGET_MS,
  SWEEP_MAX_RECOVER,
  SWEEP_MAX_PAGES,
  SWEEP_CRON_DRIFT_MS,
  SWEEP_LOOKBACK_MS,
  SWEEP_MIN_AGE_MS,
  SWEEP_OVERLAP_MS,
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
  latest_charge: { amount: 5200, amount_captured: 5200, amount_refunded: 0, refunded: false },
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
  merges = {};
  mergeError = null;
  mergeReads.length = 0;
  inCalls.length = 0;
  ledgerErrorOnCall = 0;
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
    expect(retrieveParams).toEqual([{ expand: ["latest_charge", "latest_charge.refunds"] }]);
  });

  it("a charge refunded in Stripe before recovery ran is refused — no order for money that went back", async () => {
    retrieved = pi("pi_1", {
      latest_charge: { amount: 5200, amount_captured: 5200, amount_refunded: 5200, refunded: true },
    });
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

  // Codex on #365 @ 1b760cb (P2): a diner who paid anonymously and then signed into an existing
  // account is the same payer — K3b's durable redirect (`mms_identity_merges`) says so, and the late
  // earn already resolves through it. The guest door resolves the metadata uid the same way, from the
  // DATABASE (never the caller), before it compares.
  it("a payer whose anon uid MERGED into the caller's account is recovered (K3b redirect)", async () => {
    retrieved = pi("pi_1", {}, { earnerUid: "77777777-7777-4777-8777-777777777777" });
    merges = { "77777777-7777-4777-8777-777777777777": "account-uid" };
    const out = await recoverIntent("pi_1", { cartId: CART, payerUid: "account-uid" }, "track");
    expect(out).toEqual({ kind: "recorded" });
    expect(mergeReads).toEqual(["77777777-7777-4777-8777-777777777777"]);
  });

  it("an unmerged stranger is still refused, and an unreadable merge read is error", async () => {
    retrieved = pi("pi_1", {}, { earnerUid: "77777777-7777-4777-8777-777777777777" });
    expect(await recoverIntent("pi_1", { cartId: CART, payerUid: "account-uid" }, "track")).toEqual(
      { kind: "refused" },
    );
    mergeError = { message: "timeout" };
    expect(await recoverIntent("pi_1", { cartId: CART, payerUid: "account-uid" }, "track")).toEqual(
      { kind: "error" },
    );
    expect(fulfilled).toEqual([]);
  });

  it("the merge is read only at the guest door, and only when the uids differ", async () => {
    retrieved = pi("pi_1", {}, { earnerUid: "77777777-7777-4777-8777-777777777777" });
    await recoverIntent("pi_1", { cartId: CART, payerUid: null }, "staff");
    await recoverIntent(
      "pi_1",
      { cartId: CART, payerUid: "77777777-7777-4777-8777-777777777777" },
      "track",
    );
    expect(mergeReads).toEqual([]);
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
        // interval 24 h + cron drift 1 h + min-age 3 min + overlap 1 h = 26 h 03 min
        gte: (NOW - (24 * 3600_000 + 3600_000 + 3 * 60_000 + 3600_000)) / 1000,
        lte: (NOW - 3 * 60_000) / 1000,
      },
      limit: 100,
      expand: ["data.latest_charge", "data.latest_charge.refunds"],
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

  // The blind pass on #369: a plan that only allows daily crons fires one ANYWHERE inside its hour,
  // so a 10:00 run can be followed by a 10:59 one. The windows must still overlap by the full slack.
  it("two runs an interval PLUS the cron's full drift apart still overlap by the slack", () => {
    const first = sweepWindow(NOW, SWEEP_LOOKBACK_MS, SWEEP_MIN_AGE_MS);
    const next = sweepWindow(
      NOW + SWEEP_SCHEDULE_INTERVAL_MS + SWEEP_CRON_DRIFT_MS,
      SWEEP_LOOKBACK_MS,
      SWEEP_MIN_AGE_MS,
    );
    expect(first.lte - next.gte).toBeGreaterThanOrEqual(SWEEP_OVERLAP_MS / 1000);
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
    // A cancelled cart passes the verdict, so every attempt reaches the (mocked) fulfillment.
    cart = { status: "cancelled", live_payment_intent_id: null };
    const summary = await sweepStrandedPayments(NOW);
    expect(summary.candidates).toBe(SWEEP_MAX_RECOVER + 3);
    expect(fulfilled).toHaveLength(SWEEP_MAX_RECOVER);
    expect(summary.truncated).toBe(true);
  });

  // Codex on #365 @ 1b760cb (P2): a refused candidate (refunded, superseded) never gets an order or a
  // ledger row, so it is a candidate on EVERY run — newest-first, a handful of them spent the whole
  // recovery cap and an older recoverable payment was never reached.
  it("refusals do not spend the recovery cap — an older recoverable payment is still reached", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const refunded = { amount: 5200, amount_captured: 5200, amount_refunded: 5200, refunded: true };
    const stuck = Array.from({ length: SWEEP_MAX_RECOVER + 5 }, (_, i) =>
      pi(`pi_refunded_${i}`, { latest_charge: refunded }),
    );
    pages = [{ data: [...stuck, pi("pi_older_recoverable")], has_more: false }];
    cart = { status: "cancelled", live_payment_intent_id: null };
    const summary = await sweepStrandedPayments(NOW);
    expect(fulfilled).toEqual([{ id: "pi_older_recoverable", via: "cron" }]);
    expect(summary.answers).toEqual({ refused: SWEEP_MAX_RECOVER + 5, recorded: 1 });
    expect(summary.truncated).toBe(false);
    // Each refusal is at error level, by name: a charged intent the cron will not recover.
    const refusals = err.mock.calls.filter((c) => String(c[0]).includes("refused"));
    expect(refusals).toHaveLength(SWEEP_MAX_RECOVER + 5);
    expect(refusals[0]?.[1]).toMatchObject({ refusal: "refunded", via: "cron" });
    err.mockRestore();
  });

  it(`examines at most ${SWEEP_MAX_EXAMINE} candidates per run, refused or not`, async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const refunded = { amount: 5200, amount_captured: 5200, amount_refunded: 5200, refunded: true };
    pages = [
      {
        data: Array.from({ length: SWEEP_MAX_EXAMINE + 4 }, (_, i) =>
          pi(`pi_r${i}`, { latest_charge: refunded }),
        ),
        has_more: false,
      },
    ];
    cart = { status: "cancelled", live_payment_intent_id: null };
    const summary = await sweepStrandedPayments(NOW);
    expect(summary.answers.refused).toBe(SWEEP_MAX_EXAMINE);
    expect(summary.truncated).toBe(true);
    err.mockRestore();
  });

  it("stops at the time budget, says so at error level, and names what it did not reach", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    pages = [{ data: [pi("pi_a"), pi("pi_b"), pi("pi_c")], has_more: false }];
    cart = { status: "cancelled", live_payment_intent_id: null };
    // The clock: read at the start (0), before the first candidate (inside the budget), then before
    // the second (past it). One page, so the listing never reads it.
    const ticks = [0, 0, SWEEP_TIME_BUDGET_MS + 1];
    const clock = () => ticks.shift() ?? SWEEP_TIME_BUDGET_MS + 1;
    const summary = await sweepStrandedPayments(NOW, clock);
    expect(fulfilled).toEqual([{ id: "pi_a", via: "cron" }]);
    expect(summary.truncated).toBe(true);
    const budget = err.mock.calls.filter((c) => String(c[0]).includes("time budget"));
    expect(budget).toHaveLength(1);
    expect(budget[0]?.[1]).toMatchObject({ notReached: 2 });
    err.mockRestore();
  });

  it("the time budget also stops the LISTING, and says so", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    pages = Array.from({ length: 3 }, (_, p) => ({
      data: [pi(`pi_p${p}`, { status: "canceled" })],
      has_more: true,
    }));
    const ticks = [0, SWEEP_TIME_BUDGET_MS + 1];
    const summary = await sweepStrandedPayments(
      NOW,
      () => ticks.shift() ?? SWEEP_TIME_BUDGET_MS + 1,
    );
    expect(lists).toHaveLength(1);
    expect(summary.truncated).toBe(true);
    expect(err.mock.calls.filter((c) => String(c[0]).includes("time budget"))).toHaveLength(1);
    err.mockRestore();
  });

  // Blind pass + Codex on #365 @ 1b760cb: up to 1000 ids in ONE `.in()` is a ~30 KB GET URL, past
  // what a gateway takes — the sweep would 500 exactly at volume. Chunked, and any chunk's error is
  // the whole ledger's (fail closed: never recover against a ledger half-read).
  it(`reads the ledgers in chunks of at most ${SWEEP_ID_CHUNK} ids`, async () => {
    const n = SWEEP_ID_CHUNK * 2 + 7;
    pages = [{ data: Array.from({ length: n }, (_, i) => pi(`pi_${i}`)), has_more: false }];
    ordersOnRecord = Array.from({ length: n }, (_, i) => `pi_${i}`);
    const summary = await sweepStrandedPayments(NOW);
    expect(summary.candidates).toBe(0);
    for (const table of ["qr_orders", "qr_refunds_needed"]) {
      const sizes = inCalls.filter((c) => c.table === table).map((c) => c.n);
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(n);
      expect(Math.max(...sizes)).toBeLessThanOrEqual(SWEEP_ID_CHUNK);
    }
  });

  it("one unreadable ledger chunk fails the whole sweep — never a half-read ledger", async () => {
    const n = SWEEP_ID_CHUNK + 1;
    pages = [{ data: Array.from({ length: n }, (_, i) => pi(`pi_${i}`)), has_more: false }];
    ledgerErrorOnCall = 2;
    await expect(sweepStrandedPayments(NOW)).rejects.toThrow(/order ledger unreadable/);
    expect(fulfilled).toEqual([]);
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

/**
 * M160(b) · the blind pass on #369 — the stranded-payment sweep's window is sized for a cron that runs
 * at least once every `SWEEP_SCHEDULE_INTERVAL_MS` (a day), and nothing else tied the schedule in
 * `apps/qr/vercel.json` to it: a schedule edited to every other day, or a route renamed out from
 * under its `path`, would leave the unattended recovery with gaps or never running, every check green.
 * This reads the shipped JSON (parsed, never pattern-matched) and holds both to the window.
 */
const CRON_APP = path.resolve(__dirname, "..");
const SWEEP_PATH = "/api/cron/stranded-payments";

type Cron = { path: string; schedule: string };
const crons = (): Cron[] =>
  (JSON.parse(readFileSync(path.join(CRON_APP, "vercel.json"), "utf8")) as { crons?: Cron[] })
    .crons ?? [];

/** Does a 5-field cron expression fire at least once every calendar day? */
function firesDaily(schedule: string): boolean {
  const fields = schedule.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;
  // Day-of-month, month and day-of-week must not narrow the days; minute and hour may be any one
  // value, a list or a step — each still fires at least once a day.
  const anyDay = (f: string | undefined) => f === "*";
  const fires = (f: string | undefined) => typeof f === "string" && /^[\d*,/-]+$/.test(f);
  return anyDay(dayOfMonth) && anyDay(month) && anyDay(dayOfWeek) && fires(minute) && fires(hour);
}

describe("the stranded-payment cron is scheduled to fit its window", () => {
  it("is registered, exactly once", () => {
    expect(crons().filter((c) => c.path === SWEEP_PATH)).toHaveLength(1);
  });

  it("points at a route that exists", () => {
    for (const c of crons()) {
      expect(existsSync(path.join(CRON_APP, "app", c.path, "route.ts")), c.path).toBe(true);
    }
  });

  it("fires at least once a day — the window covers one day, never more", () => {
    expect(SWEEP_SCHEDULE_INTERVAL_MS).toBe(24 * 60 * 60 * 1000);
    const sweep = crons().find((c) => c.path === SWEEP_PATH);
    expect(sweep && firesDaily(sweep.schedule), sweep?.schedule).toBe(true);
  });

  it("refuses a schedule that skips days", () => {
    expect(firesDaily("7 10 * * *")).toBe(true);
    expect(firesDaily("0 * * * *")).toBe(true);
    expect(firesDaily("7 10 */2 * *")).toBe(false);
    expect(firesDaily("7 10 * * 1-5")).toBe(false);
    expect(firesDaily("7 10 1 * *")).toBe(false);
    expect(firesDaily("7 10 * *")).toBe(false);
  });
});
