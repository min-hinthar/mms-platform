import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DaySummary } from "./register-math";

/**
 * P5 — `getPilotNight`'s failure contract: **a read that did not happen is never a zero.**
 *
 * This is the T21(a) class, on the screen where it costs most. postgrest-js RESOLVES a transport
 * failure into `{ data: null, error }` rather than rejecting — the service client never calls
 * `.throwOnError()` — so an unbound `?? 0` turns a dropped socket, a statement timeout or a 42703
 * into a confident "0 discounts given · 0 orders · 0 charges with no order". On a sheet headed
 * "Tonight", read at 9pm by the person deciding whether anything needs chasing, that zero is not a
 * missing number: it is the answer they were looking for, and it is false.
 *
 * ⚠️ THE FIXTURE SEPARATES THE TWO ANSWERS. Every failure case below is paired with a genuinely
 * QUIET night — a real state in a family restaurant, and the one this sheet must still report
 * happily. So a mutant that failed on every read would be as red as one that never failed; what
 * distinguishes them is `error` / a null `count`, never the size of the number.
 */

vi.mock("server-only", () => ({}));

/** A scripted result for one awaited query. */
type Result = { count?: number | null; data?: unknown[] | null; error?: unknown };

/**
 * The minimum of the postgrest builder `pilot.ts` uses. Written out rather than proxied so the next
 * reader can see exactly which chain shapes are covered — a method the module starts using and this
 * fake lacks is a TypeError in the suite, which is the failure we want.
 */
class FakeQuery implements PromiseLike<Result> {
  constructor(
    private readonly table: string,
    private readonly take: (table: string) => Result,
  ) {}
  select() {
    return this;
  }
  eq() {
    return this;
  }
  gte() {
    return this;
  }
  lte() {
    return this;
  }
  in() {
    return this;
  }
  order() {
    return this;
  }
  range() {
    return this;
  }
  then<A, B>(
    onOk?: ((value: Result) => A | PromiseLike<A>) | null,
    onErr?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve(this.take(this.table)).then(onOk, onErr);
  }
}

/** Per-table queues; the last entry repeats once a queue is drained. */
let script: Record<string, Result[]>;
let queries: string[];

vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: (table: string) =>
      new FakeQuery(table, (t) => {
        queries.push(t);
        const queue = script[t];
        if (!queue?.length) return { error: new Error(`unscripted read of ${t}`) };
        return queue.length === 1 ? queue[0]! : queue.shift()!;
      }),
  }),
}));

const OUTAGE = "We can’t reach the ordering system — that change wasn’t saved.";
let gate: { ok: true; caller: unknown } | { ok: false; error: string };
vi.mock("./staff", () => ({
  STAFF_WRITE_OUTAGE: OUTAGE,
  staffGate: () => Promise.resolve(gate),
}));

const SUMMARY: DaySummary = {
  cashCount: 2,
  cashCents: 4200,
  cardCount: 5,
  cardCents: 19_050,
  terminalCount: 1,
  terminalCents: 3300,
  refundedCount: 1,
  refundedCents: 1200,
  cashTipCents: 500,
};
let cash: { ok: true; summary: DaySummary; sinceIso: string } | { ok: false; reason: string };
vi.mock("./register", () => ({
  getDayCashSummary: () => Promise.resolve(cash),
}));

const { getPilotNight } = await import("./pilot");

/** A quiet-but-successful night: every read answered, every answer zero. */
function quiet() {
  script = {
    promo_redemptions: [{ count: 0, error: null }],
    mms_feedback: [
      { count: 0, error: null },
      { count: 0, error: null },
    ],
    qr_refunds_needed: [{ count: 0, error: null }],
    qr_orders: [{ data: [], error: null }],
  };
}

/** A busy night with an asymmetric shape, so no two figures can be confused for each other. */
function busy() {
  script = {
    promo_redemptions: [{ count: 3, error: null }],
    mms_feedback: [
      { count: 7, error: null },
      { count: 2, error: null },
    ],
    qr_refunds_needed: [{ count: 1, error: null }],
    qr_orders: [
      {
        data: [
          { status: "paid", table_sessions: { mode: "dinein" } },
          { status: "paid", table_sessions: { mode: "dinein" } },
          { status: "paid", table_sessions: { mode: "pickup" } },
          { status: "paid", table_sessions: null },
          { status: "refunded", table_sessions: { mode: "dinein" } },
        ],
        error: null,
      },
    ],
  };
}

beforeEach(() => {
  queries = [];
  gate = { ok: true, caller: {} };
  cash = { ok: true, summary: SUMMARY, sinceIso: "ignored" };
  busy();
});

describe("getPilotNight — the night sheet's reads", () => {
  it("reports the night when every read answers", async () => {
    const res = await getPilotNight();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.night.pilotRedemptions).toBe(3);
    expect(res.night.ratings).toEqual({ total: 7, low: 2 });
    expect(res.night.unresolvedRecoveries).toBe(1);
    expect(res.night.split.channels).toEqual([
      { mode: "dinein", orders: 2 },
      { mode: "pickup", orders: 1 },
      { mode: "scango", orders: 0 },
    ]);
    expect(res.night.split.unattributed).toBe(1);
  });

  it("quotes the register's day summary verbatim rather than deriving a second one", () => {
    // Object identity, not a value comparison: a re-derivation that happened to agree today is the
    // drift the W17 rule is about, and identity is the only assertion that refuses it outright.
    return getPilotNight().then((res) => {
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.night.money).toBe(SUMMARY);
    });
  });

  it("scopes the night to the LA calendar day, the same window the register uses", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T19:30:00Z")); // PDT — 12:30pm in LA
    const res = await getPilotNight();
    vi.useRealTimers();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.night.sinceIso).toBe("2026-07-15T07:00:00.000Z");
  });

  it("a QUIET night is reported as a night, not as a failure", async () => {
    quiet();
    const res = await getPilotNight();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.night.pilotRedemptions).toBe(0);
    expect(res.night.split.counted).toBe(0);
    expect(res.night.unresolvedRecoveries).toBe(0);
  });

  it.each([
    ["promo_redemptions", 0],
    ["mms_feedback", 0],
    ["mms_feedback", 1],
    ["qr_refunds_needed", 0],
  ] as const)("an ERROR on the %s read (#%i) is an outage, never a zero", async (table, index) => {
    quiet();
    script[table]![index] = { count: null, error: new Error("connection reset") };
    const res = await getPilotNight();
    expect(res).toEqual({ ok: false, reason: "outage" });
  });

  it.each([
    ["promo_redemptions", 0],
    ["mms_feedback", 0],
    ["mms_feedback", 1],
    ["qr_refunds_needed", 0],
  ] as const)(
    "a NULL count with no error on the %s read (#%i) is an outage too",
    async (table, index) => {
      // The shape a `?? 0` swallows most quietly: PostgREST answered, but did not count.
      quiet();
      script[table]![index] = { count: null, error: null };
      const res = await getPilotNight();
      expect(res).toEqual({ ok: false, reason: "outage" });
    },
  );

  it("an error on the ORDERS read is an outage, not an empty day", async () => {
    script.qr_orders = [{ data: null, error: new Error("statement timeout") }];
    const res = await getPilotNight();
    expect(res).toEqual({ ok: false, reason: "outage" });
  });

  it("pages the orders read, so a day past the PostgREST cap is not silently truncated", async () => {
    // PostgREST truncates at max-rows (default 1000) with `error` still null. A first page that comes
    // back FULL must therefore be followed by another request, and the counts must include both.
    const full = Array.from({ length: 1000 }, () => ({
      status: "paid",
      table_sessions: { mode: "dinein" },
    }));
    script.qr_orders = [
      { data: full, error: null },
      { data: [{ status: "paid", table_sessions: { mode: "pickup" } }], error: null },
    ];
    const res = await getPilotNight();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(queries.filter((t) => t === "qr_orders")).toHaveLength(2);
    expect(res.night.split.channels).toEqual([
      { mode: "dinein", orders: 1000 },
      { mode: "pickup", orders: 1 },
      { mode: "scango", orders: 0 },
    ]);
  });

  it("stops after a short page rather than asking forever", async () => {
    await getPilotNight();
    expect(queries.filter((t) => t === "qr_orders")).toHaveLength(1);
  });

  it("reads the session mode through an ARRAY embed too, not only an object", async () => {
    // PostgREST returns a to-one embed as an object, but the generated row type models it loosely
    // and older shapes arrive as a one-element array. Reading only one shape would send every order
    // to `unattributed` — a sheet that reported "no channel recorded" for the entire day.
    script.qr_orders = [
      {
        data: [
          { status: "paid", table_sessions: [{ mode: "scango" }] },
          { status: "paid", table_sessions: [{ mode: "scango" }] },
          { status: "paid", table_sessions: [{ mode: "pickup" }] },
        ],
        error: null,
      },
    ];
    const res = await getPilotNight();
    expect(res.ok).toBe(true);
    if (res.ok)
      expect(res.night.split.channels).toEqual([
        { mode: "dinein", orders: 0 },
        { mode: "pickup", orders: 1 },
        { mode: "scango", orders: 2 },
      ]);
  });

  it("a role refusal is FORBIDDEN and an unreachable platform is OUTAGE — never the same answer", async () => {
    // The two say different things to the person in front of the tablet: one means "this zone is not
    // yours", the other means "come back in a moment". Collapsing them is how a manager mid-outage
    // gets told to go and find a manager.
    gate = { ok: false, error: "That needs a manager — ask one to step in." };
    expect(await getPilotNight()).toEqual({ ok: false, reason: "forbidden" });
    gate = { ok: false, error: OUTAGE };
    expect(await getPilotNight()).toEqual({ ok: false, reason: "outage" });
  });

  it("does not read anything at all before the gate answers", async () => {
    gate = { ok: false, error: "Staff sign-in required." };
    await getPilotNight();
    expect(queries).toEqual([]);
  });

  it("propagates the register summary's own failure instead of inventing a day", async () => {
    cash = { ok: false, reason: "outage" };
    const res = await getPilotNight();
    expect(res).toEqual({ ok: false, reason: "outage" });
  });
});
