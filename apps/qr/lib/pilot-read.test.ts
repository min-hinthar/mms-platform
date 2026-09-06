import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

/** A scripted answer. `data` is a row LIST for a paged read and a single row for `maybeSingle`. */
type Result = { count?: number | null; data?: unknown; error?: unknown };

/**
 * The minimum of the postgrest builder `pilot.ts` uses. Written out rather than proxied so the next
 * reader can see exactly which chain shapes are covered — a method the module starts using and this
 * fake lacks is a TypeError in the suite, which is the failure we want.
 *
 * ⚠️ IT RECORDS THE FILTERS, AND THAT IS THE WHOLE POINT. The first cut returned `this` from every
 * filter method and dispatched on the table name plus queue position — so `.eq("code", PILOT15)`,
 * `.eq("resolved", false)` and `.lte("rating", 3)` could each be DELETED from `pilot.ts` with the
 * suite still green: the sheet would report every campaign's redemptions under the PILOT15 label,
 * count already-cleared recovery rows as waiting, and set `low` equal to `total`. The two
 * `mms_feedback` reads in particular were told apart only by their ORDER in the script, which is
 * exactly the "guard satisfied by position" shape LEARNINGS #60 names. A query's identity here is
 * its table AND its filters.
 */
class FakeQuery implements PromiseLike<Result> {
  private readonly filters: string[] = [];
  private readonly ordering: string[] = [];
  private readonly ranges: string[] = [];
  private projection = "";
  constructor(
    private readonly table: string,
    private readonly take: (key: string, ranges: readonly string[]) => Result,
  ) {}
  select(columns?: string, opts?: { count?: string; head?: boolean }) {
    // ⚠️ THE PROJECTION IS PART OF A QUERY'S IDENTITY, and for the orders read it is the whole
    // feature. Discarding it here let `.select("status,table_sessions(mode)")` be cut to
    // `.select("status")` with all 26 tests green — every order would then bucket as
    // `unattributed` and the sheet would print "No channel recorded 42" beside "Orders paid 42".
    // Measured, not supposed: that edit was made and the suite stayed green before this line.
    // `{ count: "exact", head: true }` rides along for the same reason — dropping it makes
    // PostgREST answer `count: null`, which `countOf` turns into a permanent "can't read tonight".
    this.projection = columns ?? "";
    if (opts) this.projection += `#${opts.count ?? ""}${opts.head ? "+head" : ""}`;
    return this;
  }
  eq(col: string, value: unknown) {
    this.filters.push(`eq:${col}=${String(value)}`);
    return this;
  }
  gte(col: string, value: unknown) {
    this.filters.push(`gte:${col}=${String(value)}`);
    return this;
  }
  lte(col: string, value: unknown) {
    this.filters.push(`lte:${col}=${String(value)}`);
    return this;
  }
  in(col: string, values: readonly unknown[]) {
    this.filters.push(`in:${col}=${values.join(",")}`);
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    // The `id` tie-break is W21d's and is load-bearing: `created_at` alone can order tied rows
    // differently across two page requests, duplicating or dropping rows at the seam. Recorded so
    // deleting it is a failure rather than a silent change of behaviour past 1000 orders.
    this.ordering.push(`${col}:${opts?.ascending === false ? "desc" : "asc"}`);
    return this;
  }
  range(from: number, to: number) {
    // ⚠️ The WINDOW, recorded but deliberately NOT folded into `key()`. The paged read issues
    // several queries that must share one scripted queue, so keying on the window would need a key
    // per page; asserting the observed windows keeps the queue simple and still makes the cursor
    // falsifiable. Without this, `from + PAGE - 1` → `from + PAGE` asks for 1001 rows a page, the
    // seam OVERLAPS by one row and that order is counted twice — with the two-page test green,
    // because it only ever checked that two requests happened, never which rows they asked for.
    this.ranges.push(`${from}-${to}`);
    return this;
  }
  maybeSingle() {
    return this;
  }
  /**
   * `<table>|<projection>|<sorted filters>|<ordering>` — the identity a script entry is keyed on.
   *
   * Filters are SORTED (issue order is not part of a query's meaning) while ordering is NOT: the
   * sequence of `.order()` calls is exactly what decides the page seam, so a reordering must change
   * the key.
   */
  key(): string {
    return [
      this.table,
      this.projection,
      [...this.filters].sort().join("&"),
      this.ordering.join(">"),
    ].join("|");
  }
  then<A, B>(
    onOk?: ((value: Result) => A | PromiseLike<A>) | null,
    onErr?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve(this.take(this.key(), this.ranges)).then(onOk, onErr);
  }
}

/**
 * Queues keyed by `<table>|<filters>`. The last entry repeats once a queue is drained (so the paged
 * orders read can be scripted page by page), and an UNSCRIPTED key is an error — which is what makes
 * a deleted or altered filter fail loudly instead of silently borrowing another query's answer.
 */
let script: Record<string, Result[]>;
let queries: string[];
/** The `range(from, to)` windows the module actually asked for, in issue order. */
let ranges: string[];

vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: (table: string) =>
      new FakeQuery(table, (key, windows) => {
        queries.push(key);
        ranges.push(...windows);
        const queue = script[key];
        if (!queue?.length) return { error: new Error(`unscripted read: ${key}`) };
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

/** A PDT afternoon, so every fixture's day window is one known instant and the keys are spellable. */
const NOW = "2026-09-05T19:30:00Z";
const SINCE = "2026-09-05T07:00:00.000Z";

/** The six queries `getPilotNight` is allowed to make, each named by its table AND its filters. */
function keysFor(since: string) {
  return {
    redemptions: `promo_redemptions|id#exact+head|eq:code=PILOT15&gte:redeemed_at=${since}|`,
    ratingsAll: `mms_feedback|id#exact+head|gte:created_at=${since}|`,
    ratingsLow: `mms_feedback|id#exact+head|gte:created_at=${since}&lte:rating=3|`,
    recoveries: "qr_refunds_needed|id#exact+head|eq:resolved=false|",
    promoRow: "promo_codes|active,used,max_uses,valid_until|eq:code=PILOT15|",
    orders: `qr_orders|status,table_sessions(mode)|gte:created_at=${since}&in:status=paid,refunded|created_at:asc>id:asc`,
  };
}
const K = keysFor(SINCE);

/** The prod row as applied on 2026-09-05 (#261): pct 0.15 · max_uses 200 · valid_until 2026-10-31. */
const LIVE_CODE: Result = {
  data: { active: true, used: 12, max_uses: 200, valid_until: "2026-10-31T23:59:59-07:00" },
  error: null,
};

/** A quiet-but-successful night: every read answered, every answer zero. */
function quiet(since = SINCE) {
  const k = keysFor(since);
  script = {
    [k.redemptions]: [{ count: 0, error: null }],
    [k.ratingsAll]: [{ count: 0, error: null }],
    [k.ratingsLow]: [{ count: 0, error: null }],
    [k.recoveries]: [{ count: 0, error: null }],
    [k.promoRow]: [LIVE_CODE],
    [k.orders]: [{ data: [], error: null }],
  };
}

/** A busy night, asymmetric on purpose so no two figures can be confused for each other. */
function busy(since = SINCE) {
  const k = keysFor(since);
  script = {
    [k.redemptions]: [{ count: 3, error: null }],
    [k.ratingsAll]: [{ count: 7, error: null }],
    [k.ratingsLow]: [{ count: 2, error: null }],
    [k.recoveries]: [{ count: 1, error: null }],
    [k.promoRow]: [LIVE_CODE],
    [k.orders]: [
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
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
  queries = [];
  ranges = [];
  gate = { ok: true, caller: {} };
  // The register OWNS the day boundary and `getPilotNight` adopts it — so this is the window every
  // scripted key below is built from, not a value the module is free to ignore.
  cash = { ok: true, summary: SUMMARY, sinceIso: SINCE };
  busy();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getPilotNight — the night sheet's reads", () => {
  it("reports the night when every read answers", async () => {
    const res = await getPilotNight();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.night.pilotRedemptions).toBe(3);
    expect(res.night.ratings).toEqual({ total: 7, low: 2 });
    expect(res.night.unresolvedRecoveries).toBe(1);
    expect(res.night.promo).toEqual({
      exists: true,
      active: true,
      used: 12,
      maxUses: 200,
      validUntil: "2026-10-31T23:59:59-07:00",
    });
    expect(res.night.split.channels).toEqual([
      { mode: "dinein", orders: 2 },
      { mode: "pickup", orders: 1 },
      { mode: "scango", orders: 0 },
    ]);
    expect(res.night.split.unattributed).toBe(1);
  });

  it("asks for exactly the six queries it claims, filters and all", async () => {
    // The FILTERS are the identity here, not the table names. Drop `.eq("code", PILOT15)` and the
    // redemptions read becomes a different query — one that counts every campaign under the pilot's
    // label. This assertion is what turns that from a silent relabelling into a failure.
    await getPilotNight();
    expect(new Set(queries)).toEqual(new Set(Object.values(K)));
  });

  it("tells the two feedback reads apart by their FILTER, not by their order", async () => {
    // The first cut keyed the script on table name plus position, so `total` and `low` were
    // distinguished only by which one `Promise.all` happened to issue first — and swapping the two
    // builders in the source was invisible. Scripting them in the OPPOSITE insertion order proves
    // the distinction now rides `lte:rating=3`.
    script = {
      [K.ratingsLow]: [{ count: 2, error: null }],
      [K.ratingsAll]: [{ count: 7, error: null }],
      [K.redemptions]: [{ count: 3, error: null }],
      [K.recoveries]: [{ count: 1, error: null }],
      [K.promoRow]: [LIVE_CODE],
      [K.orders]: [{ data: [], error: null }],
    };
    const res = await getPilotNight();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.night.ratings).toEqual({ total: 7, low: 2 });
  });

  it("quotes the register's day summary verbatim rather than deriving a second one", async () => {
    // Object identity, not a value comparison: a re-derivation that happened to agree today is the
    // drift the W17 rule is about, and identity is the only assertion that refuses it outright.
    const res = await getPilotNight();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.night.money).toBe(SUMMARY);
  });

  it("scopes the night to the LA calendar day, the same window the register uses", async () => {
    // The register derives the window (`laDayStartIso` behind `getDayCashSummary`) and this module
    // adopts it, so the assertion is that the SAME instant reaches both the takings and the counts.
    // It used to call `laDayStartIso` itself, which was a second derivation of one value and is the
    // drift W17 forbids — see the day-boundary suite below for the falsifying case.
    const JULY = "2026-07-15T07:00:00.000Z";
    vi.setSystemTime(new Date("2026-07-15T19:30:00Z")); // PDT — 12:30pm in LA
    cash = { ok: true, summary: SUMMARY, sinceIso: JULY };
    quiet(JULY);
    const res = await getPilotNight();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.night.sinceIso).toBe(JULY);
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

  it("reports NO ROW as its own state, rather than as a zero", async () => {
    // "0 discounts given" is true and reads as "nobody used it" — a claim about the guests rather
    // than about the campaign, and the wrong one when the code simply is not there.
    quiet();
    script[K.promoRow] = [{ data: null, error: null }];
    const res = await getPilotNight();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.night.promo).toEqual({ exists: false });
  });

  it("reports a DEACTIVATED code as existing-but-off, not as absent", async () => {
    // The two are different sentences on the sheet: "isn't set up yet" vs "switched off". Collapsing
    // them would tell whoever turned it off that their change never landed.
    quiet();
    script[K.promoRow] = [
      { data: { active: false, used: 200, max_uses: 200, valid_until: null }, error: null },
    ];
    const res = await getPilotNight();
    expect(res.ok).toBe(true);
    if (res.ok)
      expect(res.night.promo).toEqual({
        exists: true,
        active: false,
        used: 200,
        maxUses: 200,
        validUntil: null,
      });
  });

  it("QUOTES the row's budget and window — it does not judge whether the code still applies", async () => {
    // `mms_promo_check` is the single authority on whether a code applies (active AND window AND
    // caps AND min-subtotal). A second copy of that rule on a reporting screen is the drift the W17
    // money rules forbid — so an EXHAUSTED, still-`active` code is reported exactly as it is stored,
    // and the sheet shows 200-of-200 beside the count so the reader can see why it stopped moving.
    quiet();
    script[K.promoRow] = [
      {
        data: { active: true, used: 200, max_uses: 200, valid_until: "2026-10-31T23:59:59-07:00" },
        error: null,
      },
    ];
    const res = await getPilotNight();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.night.promo).toEqual({
      exists: true,
      active: true,
      used: 200,
      maxUses: 200,
      validUntil: "2026-10-31T23:59:59-07:00",
    });
  });

  it("carries a null budget and a null window through as null, never as a number", async () => {
    // Both columns are nullable. Defaulting either to 0 would print "0 of 0 redemptions used" under
    // a code with no cap at all.
    quiet();
    script[K.promoRow] = [
      { data: { active: true, used: 3, max_uses: null, valid_until: null }, error: null },
    ];
    const res = await getPilotNight();
    expect(res.ok).toBe(true);
    if (res.ok)
      expect(res.night.promo).toEqual({
        exists: true,
        active: true,
        used: 3,
        maxUses: null,
        validUntil: null,
      });
  });

  it("a FAILED code lookup is an outage, not 'not set up yet'", async () => {
    // The two say opposite things about the campaign. Only one of them is ever a fact about a
    // dropped socket.
    quiet();
    script[K.promoRow] = [{ data: null, error: new Error("connection reset") }];
    const res = await getPilotNight();
    expect(res).toEqual({ ok: false, reason: "outage" });
  });

  it.each(["redemptions", "ratingsAll", "ratingsLow", "recoveries"] as const)(
    "an ERROR on the %s read is an outage, never a zero",
    async (name) => {
      quiet();
      script[K[name]] = [{ count: null, error: new Error("connection reset") }];
      const res = await getPilotNight();
      expect(res).toEqual({ ok: false, reason: "outage" });
    },
  );

  it.each(["redemptions", "ratingsAll", "ratingsLow", "recoveries"] as const)(
    "a NULL count with no error on the %s read is an outage too",
    async (name) => {
      // The shape a `?? 0` swallows most quietly: PostgREST answered, but did not count.
      quiet();
      script[K[name]] = [{ count: null, error: null }];
      const res = await getPilotNight();
      expect(res).toEqual({ ok: false, reason: "outage" });
    },
  );

  it("an error on the ORDERS read is an outage, not an empty day", async () => {
    script[K.orders] = [{ data: null, error: new Error("statement timeout") }];
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
    script[K.orders] = [
      { data: full, error: null },
      { data: [{ status: "paid", table_sessions: { mode: "pickup" } }], error: null },
    ];
    const res = await getPilotNight();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(queries.filter((q) => q === K.orders)).toHaveLength(2);
    // …and it asked for the RIGHT windows. Two requests with the same rows counted proves neither
    // the cursor advance nor the page size: `range(from, from + PAGE)` overlaps the seam by one row
    // and `range(0, PAGE - 1)` never advances at all, both invisible to the assertion above.
    expect(ranges).toEqual(["0-999", "1000-1999"]);
    expect(res.night.split.channels).toEqual([
      { mode: "dinein", orders: 1000 },
      { mode: "pickup", orders: 1 },
      { mode: "scango", orders: 0 },
    ]);
  });

  it("stops after a short page rather than asking forever", async () => {
    await getPilotNight();
    expect(queries.filter((q) => q === K.orders)).toHaveLength(1);
  });

  it("reads the session mode through an ARRAY embed too, not only an object", async () => {
    // PostgREST returns a to-one embed as an object, but the generated row type models it loosely
    // and older shapes arrive as a one-element array. Reading only one shape would send every order
    // to `unattributed` — a sheet that reported "no channel recorded" for the entire day.
    script[K.orders] = [
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

describe("the day boundary is the register's, adopted — not a second derivation", () => {
  it("scopes every day-scoped read to the window the register handed it", async () => {
    // A boundary NOTHING here could compute: an hour off the LA midnight `laDayStartIso` would
    // return for `NOW`. If the module recomputed its own window instead of adopting this one, the
    // scripted keys would not match and the reads would go unscripted.
    const HANDED = "2026-09-05T08:00:00.000Z";
    expect(HANDED).not.toBe(SINCE);
    cash = { ok: true, summary: SUMMARY, sinceIso: HANDED };
    busy(HANDED);

    const res = await getPilotNight();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.night.sinceIso).toBe(HANDED);
    // …and it reached the QUERIES, not just the returned shape — the money and the counts must be
    // bucketed into the same service day, which is the whole reason for adopting rather than
    // recomputing. Across midnight two `new Date()` calls put them on different days.
    for (const q of queries.filter((k) => k.includes("created_at") || k.includes("redeemed_at")))
      expect(q).toContain(HANDED);
  });
});
