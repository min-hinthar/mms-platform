import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readRegisterQueue,
  readUnpaidCounterCarts,
  REG_PREFIX,
  REGISTER_QUEUE_CAP,
} from "./register-queue";
import { unpaidBag } from "./counter-order";

/**
 * A4·2 — the counter queue read, asserted as a QUERY (every predicate recorded) and by value.
 * A pass-through fake answers the fixture whatever the query said, so each predicate that keeps a
 * settled or a dine-in cart out of the queue is asserted on the recorded chain.
 */
type Rec = {
  table: string;
  cols: string;
  eqs: [string, unknown][];
  neqs: [string, unknown][];
  ors: [string, unknown][];
  likes: [string, unknown][];
  ins: [string, unknown][];
  order: [string, { ascending?: boolean } | undefined] | null;
  limit: number | null;
};
let rec: Rec | null = null;
let rows: Record<string, unknown>[] = [];
let fail = false;

function fakeDb() {
  return {
    from(table: string) {
      const r: Rec = {
        table,
        cols: "",
        eqs: [],
        neqs: [],
        ors: [],
        likes: [],
        ins: [],
        order: null,
        limit: null,
      };
      rec = r;
      const api = {
        select(cols: string) {
          r.cols = cols;
          return api;
        },
        eq(col: string, val: unknown) {
          r.eqs.push([col, val]);
          return api;
        },
        neq(col: string, val: unknown) {
          r.neqs.push([col, val]);
          return api;
        },
        or(expr: string, opts?: unknown) {
          r.ors.push([expr, opts]);
          return api;
        },
        like(col: string, val: unknown) {
          r.likes.push([col, val]);
          return api;
        },
        in(col: string, val: unknown) {
          r.ins.push([col, val]);
          return api;
        },
        order(col: string, opts?: { ascending?: boolean }) {
          r.order = [col, opts];
          return api;
        },
        limit(n: number) {
          r.limit = n;
          return api;
        },
        then(res: (v: { data: unknown; error: unknown }) => unknown) {
          return Promise.resolve(
            fail ? { data: null, error: { message: "boom" } } : { data: rows, error: null },
          ).then(res);
        },
      };
      return api;
    },
  } as unknown as Parameters<typeof readRegisterQueue>[0];
}

const cart = (over: Partial<Record<string, unknown>> = {}) => ({
  id: "cart-1",
  session_id: "sess-1",
  customer_name: "Aye",
  created_at: "2026-09-13T18:00:00Z",
  qr_cart_items: [
    { qty: 2, unit_price_cents: 600, state: "draft", comped: false },
    { qty: 1, unit_price_cents: 900, state: "voided", comped: false },
    { qty: 1, unit_price_cents: 500, state: "draft", comped: true },
  ],
  table_sessions: { qr_code: "reg-ABCD", mode: "pickup", status: "active" },
  ...over,
});

beforeEach(() => {
  rec = null;
  rows = [cart()];
  fail = false;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("readRegisterQueue — the open counter orders, shown oldest first", () => {
  it("reads OPEN carts on ACTIVE pickup sessions carrying a counter code, newest first under the cap", async () => {
    const res = await readRegisterQueue(fakeDb());
    expect(res.ok).toBe(true);
    expect(rec?.table).toBe("qr_carts");
    // MUTATION: drop the open guard → settled-but-unexpired orders fill the queue in a rush.
    expect(rec?.eqs).toContainEqual(["status", "open"]);
    expect(rec?.eqs).toContainEqual(["table_sessions.mode", "pickup"]);
    expect(rec?.eqs).toContainEqual(["table_sessions.status", "active"]);
    // MUTATION: drop the kiosk prefix → self-minted counter orders vanish from the counter.
    expect(rec?.ors).toEqual([
      [`qr_code.like.${REG_PREFIX}%,qr_code.like.kiosk-%`, { referencedTable: "table_sessions" }],
    ]);
    // p2f-rev-lib/register-queue/stale-orders-take-the-cap — NEWEST first under the cap (review
    // M1): a sent-unpaid counter order is exempt from the sweep, so uncollected ones accrue, and an
    // oldest-first cap let them push the order just started off the counter.
    expect(rec?.order).toEqual(["created_at", { ascending: false }]);
    // p2f-sr-lane/register-queue/queue-cap-plus-one — CAP + 1, so a whole page is never "truncated"
    expect(rec?.limit).toBe(REGISTER_QUEUE_CAP + 1);
    expect(rec?.cols).toContain("table_sessions!inner(");
  });
  it("the page read newest-first is SHOWN oldest-first — the counter's order never flipped", async () => {
    // p2f-rev-lib/register-queue/queue-shown-newest-first
    rows = [
      cart({ id: "c-new", session_id: "s-new", created_at: "2026-09-13T18:30:00Z" }),
      cart({ id: "c-old", session_id: "s-old", created_at: "2026-09-13T18:00:00Z" }),
    ];
    const res = await readRegisterQueue(fakeDb());
    if (!res.ok) throw new Error("expected ok");
    expect(res.rows.map((r) => r.sessionId)).toEqual(["s-old", "s-new"]);
  });
  it("counts and totals the LIVE lines only — voided and comped lines are off the card", async () => {
    const res = await readRegisterQueue(fakeDb());
    if (!res.ok) throw new Error("expected ok");
    expect(res.rows).toEqual([
      {
        sessionId: "sess-1",
        source: "register",
        customerName: "Aye",
        itemCount: 2,
        subtotalCents: 1200,
        startedAt: "2026-09-13T18:00:00Z",
      },
    ]);
    expect(res.truncated).toBe(false);
  });
  it("badges a kiosk-minted session by its code", async () => {
    rows = [cart({ table_sessions: { qr_code: "kiosk-Z9", mode: "pickup", status: "active" } })];
    const res = await readRegisterQueue(fakeDb());
    if (!res.ok) throw new Error("expected ok");
    expect(res.rows[0]?.source).toBe("kiosk");
  });
  // Newest first, as the query orders them: `sess-0` is the newest, the last index the oldest.
  const page = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      cart({
        id: `cart-${i}`,
        session_id: `sess-${i}`,
        created_at: new Date(Date.parse("2026-09-13T18:00:00Z") - i * 60_000).toISOString(),
      }),
    );
  it("exactly CAP orders is the WHOLE queue — shown in full and never called truncated", async () => {
    // p2f-sr-lane/register-queue/queue-full-page-truncated — `>= CAP` said "the oldest are not
    // listed" over a page that listed every order.
    rows = page(REGISTER_QUEUE_CAP);
    const res = await readRegisterQueue(fakeDb());
    if (!res.ok) throw new Error("expected ok");
    expect(res.truncated).toBe(false);
    expect(res.rows).toHaveLength(REGISTER_QUEUE_CAP);
    expect(console.warn).not.toHaveBeenCalled();
  });
  it("CAP + 1 orders is REPORTED as truncated, and the one dropped is the OLDEST", async () => {
    rows = page(REGISTER_QUEUE_CAP + 1);
    const res = await readRegisterQueue(fakeDb());
    if (!res.ok) throw new Error("expected ok");
    expect(res.truncated).toBe(true);
    expect(console.warn).toHaveBeenCalled();
    // p2f-sr-lane/register-queue/queue-drops-newest — sliced AFTER the reverse, the newest goes.
    expect(res.rows).toHaveLength(REGISTER_QUEUE_CAP);
    const shown = res.rows.map((r) => r.sessionId);
    expect(shown).not.toContain(`sess-${REGISTER_QUEUE_CAP}`);
    expect(shown[0]).toBe(`sess-${REGISTER_QUEUE_CAP - 1}`);
    expect(shown[shown.length - 1]).toBe("sess-0");
    expect(res.lines.has(`sess-${REGISTER_QUEUE_CAP}`)).toBe(false);
    expect(res.lines.size).toBe(REGISTER_QUEUE_CAP);
  });
  it("a failed read is an outage, never an empty queue", async () => {
    fail = true;
    expect(await readRegisterQueue(fakeDb())).toEqual({ ok: false, reason: "outage" });
  });
});

// ── Phase 2f · P2v ──
describe("readRegisterQueue — the counter orders' lines ride the same read", () => {
  it("returns each session's lines (every state — the floor folds them), keyed by session", async () => {
    rows = [
      cart({
        qr_cart_items: [
          {
            id: "l1",
            qty: 1,
            unit_price_cents: 600,
            state: "fired",
            comped: false,
            fulfillment: "togo",
            fire_at: "2026-09-13T18:01:00Z",
            bumped_at: null,
            by_seat: null,
          },
          {
            id: "l2",
            qty: 2,
            unit_price_cents: 600,
            state: "voided",
            comped: false,
            fulfillment: "togo",
            fire_at: null,
            bumped_at: null,
            by_seat: null,
          },
        ],
      }),
    ];
    const res = await readRegisterQueue(fakeDb());
    if (!res.ok) throw new Error("expected ok");
    expect(rec?.cols).toContain("fire_at");
    expect(res.lines.get("sess-1")).toEqual([
      {
        id: "l1",
        qty: 1,
        state: "fired",
        fulfillment: "togo",
        fire_at: "2026-09-13T18:01:00Z",
        bumped_at: null,
        comped: false,
        by_seat: null,
      },
      {
        id: "l2",
        qty: 2,
        state: "voided",
        fulfillment: "togo",
        fire_at: null,
        bumped_at: null,
        comped: false,
        by_seat: null,
      },
    ]);
    // the card's count and subtotal are still the live lines only
    expect(res.rows[0]).toMatchObject({ itemCount: 1, subtotalCents: 600 });
  });
});

const UNPAID_NOW = "2026-09-13T18:00:00.000Z";

describe("readUnpaidCounterCarts — the lane's unpaid bags, candidates only", () => {
  const unpaid = (over: Partial<Record<string, unknown>> = {}) => ({
    id: "cart-1",
    session_id: "sess-1",
    customer_name: "Aye",
    created_at: "2026-09-13T18:00:00Z",
    items: [],
    sent: [{ id: "l1" }],
    table_sessions: { qr_code: "reg-ABCD", mode: "pickup", status: "active" },
    ...over,
  });

  it("reads OPEN carts on ACTIVE reg- pickup sessions that hold a SENT line, newest first, capped", async () => {
    rows = [unpaid()];
    const res = await readUnpaidCounterCarts(fakeDb(), UNPAID_NOW);
    expect(res).toEqual({ ok: true, carts: [unpaid()], truncated: false });
    expect(rec?.table).toBe("qr_carts");
    expect(rec?.eqs).toContainEqual(["status", "open"]);
    expect(rec?.eqs).toContainEqual(["table_sessions.mode", "pickup"]);
    expect(rec?.eqs).toContainEqual(["table_sessions.status", "active"]);
    // unpaid-read-reaches-kiosk: reg- only — a kiosk order never cooks unpaid
    expect(rec?.likes).toEqual([["table_sessions.qr_code", `${REG_PREFIX}%`]]);
    // unsent-carts-consume-the-cap: the inner-joined sent lines are filtered to the SENT states
    expect(rec?.ins).toEqual([["sent.state", ["fired", "in_progress", "served"]]]);
    expect(rec?.cols).toContain("sent:qr_cart_items!inner(id)");
    // Codex r1 on #308 — and to the REST of `counterKitchenLine`, at the DB clock (the answering fake
    // below proves each clause keeps its decoys off the page). Codex r3 — and NO comped filter: a
    // comped dish is in the bag (p2f-cx3-bag/unpaid-cap-drops-comped).
    expect(rec?.eqs.filter(([c]) => String(c).startsWith("sent."))).toEqual([]);
    expect(rec?.neqs).toEqual([["sent.fulfillment", "grocery"]]);
    expect(rec?.ors).toEqual([
      ["fire_at.is.null,fire_at.lt.2026-09-13T18:00:00.001Z", { referencedTable: "sent" }],
    ]);
    // p2f-rev-lib/register-queue/stale-unpaid-take-the-cap — the NEWEST bags under the cap (the lane
    // sorts its own rows); a saturated read then hides the stalest, and says so (review M1).
    expect(rec?.order).toEqual(["created_at", { ascending: false }]);
    // p2f-sr-lane/register-queue/unpaid-cap-plus-one
    expect(rec?.limit).toBe(REGISTER_QUEUE_CAP + 1);
  });

  it("exactly CAP candidates is whole; CAP + 1 is truncated and drops the OLDEST; a failed read is not ok", async () => {
    // p2f-sr-lane/register-queue/unpaid-full-page-truncated — `>= CAP` said "more unpaid than
    // shown" over a page that showed every bag.
    rows = Array.from({ length: REGISTER_QUEUE_CAP }, (_, i) => unpaid({ id: `c${i}` }));
    const whole = await readUnpaidCounterCarts(fakeDb(), UNPAID_NOW);
    if (!whole.ok) throw new Error("expected ok");
    expect(whole.truncated).toBe(false);
    expect(whole.carts).toHaveLength(REGISTER_QUEUE_CAP);
    // Newest first, as the query orders them: the last row is the oldest candidate.
    rows = Array.from({ length: REGISTER_QUEUE_CAP + 1 }, (_, i) => unpaid({ id: `c${i}` }));
    const res = await readUnpaidCounterCarts(fakeDb(), UNPAID_NOW);
    if (!res.ok) throw new Error("expected ok");
    expect(res.truncated).toBe(true);
    // p2f-sr-lane/register-queue/unpaid-keeps-the-extra — the (CAP+1)th row is a probe, never a bag
    expect(res.carts).toHaveLength(REGISTER_QUEUE_CAP);
    expect(res.carts.map((c) => c.id)).not.toContain(`c${REGISTER_QUEUE_CAP}`);
    expect(res.carts[0]?.id).toBe("c0");
    fail = true;
    expect(await readUnpaidCounterCarts(fakeDb(), UNPAID_NOW)).toEqual({ ok: false });
  });
});

/**
 * Codex round 1 on #308 (P2) — the candidate filter is `counterSentLine` WHOLE. A fake that ANSWERS
 * the query (evaluates each `sent.*` filter on the embedded lines, drops a cart whose inner join is
 * empty, then orders and caps) — a recorded-chain fake cannot say whether a filter reaches the cap.
 * Unknown filter shapes throw: the fake refuses what it cannot evaluate rather than passing it.
 */
describe("readUnpaidCounterCarts — every capped candidate yields a bag (Codex r1 on #308)", () => {
  type Line = {
    id: string;
    state: string;
    comped: boolean;
    fulfillment: string;
    fire_at: string | null;
  };
  type Cart = { id: string; created_at: string; lines: Line[] };
  const line = (over: Partial<Line> = {}): Line => ({
    id: "l",
    state: "fired",
    comped: false,
    fulfillment: "togo",
    fire_at: "2026-09-13T17:50:00.000Z",
    ...over,
  });

  function answeringDb(carts: Cart[]) {
    const preds: ((l: Line) => boolean)[] = [];
    let limit = Infinity;
    let desc = false;
    const col = (c: string) => {
      if (!c.startsWith("sent.")) return null;
      return c.slice(5) as keyof Line;
    };
    const cond = (term: string): ((l: Line) => boolean) => {
      const m = /^(\w+)\.(is|lt|lte)\.(.+)$/.exec(term);
      if (!m) throw new Error(`fake cannot evaluate ${term}`);
      const [, c, op, v] = m as unknown as [string, keyof Line, string, string];
      if (op === "is") {
        if (v !== "null") throw new Error(`fake cannot evaluate ${term}`);
        return (l) => l[c] === null;
      }
      const bound = Date.parse(v);
      return (l) =>
        l[c] !== null &&
        (op === "lt" ? Date.parse(String(l[c])) < bound : Date.parse(String(l[c])) <= bound);
    };
    const api = {
      select: () => api,
      like: () => api,
      eq(c: string, v: unknown) {
        const k = col(c);
        if (k) preds.push((l) => l[k] === v);
        return api;
      },
      neq(c: string, v: unknown) {
        const k = col(c);
        if (!k) throw new Error(`fake cannot evaluate neq ${c}`);
        preds.push((l) => l[k] !== v);
        return api;
      },
      in(c: string, v: unknown[]) {
        const k = col(c);
        if (!k) throw new Error(`fake cannot evaluate in ${c}`);
        preds.push((l) => v.includes(l[k]));
        return api;
      },
      or(expr: string, opts?: { referencedTable?: string }) {
        if (opts?.referencedTable !== "sent") throw new Error(`fake cannot evaluate or ${expr}`);
        const terms = expr.split(",").map(cond);
        preds.push((l) => terms.some((t) => t(l)));
        return api;
      },
      order(c: string, o?: { ascending?: boolean }) {
        if (c !== "created_at") throw new Error(`fake cannot order by ${c}`);
        desc = o?.ascending === false;
        return api;
      },
      limit(n: number) {
        limit = n;
        return api;
      },
      then(res: (v: { data: unknown; error: unknown }) => unknown) {
        const joined = carts
          .map((c) => ({ c, sent: c.lines.filter((l) => preds.every((p) => p(l))) }))
          .filter((x) => x.sent.length > 0)
          .sort((a, b) =>
            desc
              ? b.c.created_at.localeCompare(a.c.created_at)
              : a.c.created_at.localeCompare(b.c.created_at),
          )
          .slice(0, limit)
          .map((x) => ({ id: x.c.id, sent: x.sent.map((l) => ({ id: l.id })), items: x.c.lines }));
        return Promise.resolve({ data: joined, error: null }).then(res);
      },
    };
    return { from: () => api } as unknown as Parameters<typeof readUnpaidCounterCarts>[0];
  }

  // Forty NEWER carts that hold no line IN THE KITCHEN by `counterKitchenLine` — grocery-only,
  // in-grace-only, and a mix of both (a comped in-grace line rides the mix: a comp inside its grace
  // is no more in the kitchen than any other) — ahead of one genuine older bag.
  const decoys = (): Cart[] =>
    Array.from({ length: REGISTER_QUEUE_CAP }, (_, i) => {
      const kind = i % 3;
      const at = `2026-09-13T17:${String(10 + i).padStart(2, "0")}:00.000Z`;
      const groc = line({ id: `g${i}`, fulfillment: "grocery" });
      const grace = line({ id: `w${i}`, fire_at: "2026-09-13T18:00:05.000Z" });
      const compGrace = line({ id: `c${i}`, comped: true, fire_at: "2026-09-13T18:00:05.000Z" });
      const lines = kind === 0 ? [groc] : kind === 1 ? [grace] : [groc, grace, compGrace];
      return { id: `decoy-${i}`, created_at: at, lines };
    });
  const genuine: Cart = {
    id: "genuine",
    created_at: "2026-09-13T17:00:00.000Z",
    lines: [line({ id: "real", fire_at: null })],
  };

  it("forty grocery / in-grace carts never push a genuine older bag past the cap", async () => {
    // p2f-cx1-lane/unpaid-cap-grocery · -in-grace — each clause of `counterKitchenLine` dropped
    // from the candidate filter lets its decoys consume the page.
    const res = await readUnpaidCounterCarts(answeringDb([...decoys(), genuine]), UNPAID_NOW);
    if (!res.ok) throw new Error("expected ok");
    expect(res.carts.map((c) => c.id)).toEqual(["genuine"]);
    expect(res.truncated).toBe(false);
  });

  it("a comped-only cart the kitchen has IS a candidate — the bag the customer still collects", async () => {
    // p2f-cx3-bag/unpaid-cap-drops-comped (Codex r3 on #308) — filtered on `comped`, a comped-only
    // bag never reaches the lane while the KDS cooks it.
    const res = await readUnpaidCounterCarts(
      answeringDb([
        { id: "comped", created_at: "2026-09-13T17:05:00.000Z", lines: [line({ comped: true })] },
        genuine,
      ]),
      UNPAID_NOW,
    );
    if (!res.ok) throw new Error("expected ok");
    expect(res.carts.map((c) => c.id)).toEqual(["comped", "genuine"]);
  });

  it("the page's candidates are EXACTLY the carts `unpaidBag` bags — no slot wasted, no bag dropped", async () => {
    // Every combination of the four clauses, one cart each: the SQL filter and the bag's membership
    // predicate are one definition, so the two sets must coincide.
    const carts: Cart[] = [];
    let n = 0;
    for (const state of ["draft", "fired", "in_progress", "served", "voided"])
      for (const fulfillment of ["togo", "grocery"])
        for (const comped of [false, true])
          for (const fire_at of [null, "2026-09-13T17:50:00.000Z", "2026-09-13T18:00:05.000Z"]) {
            n += 1;
            carts.push({
              id: `k${n}`,
              created_at: `2026-09-13T${String(10 + Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}:00.000Z`,
              lines: [line({ id: `l${n}`, state, fulfillment, comped, fire_at })],
            });
          }
    const res = await readUnpaidCounterCarts(answeringDb(carts), UNPAID_NOW);
    if (!res.ok) throw new Error("expected ok");
    const bagged = carts
      .filter(
        (c) =>
          unpaidBag({
            cartId: c.id,
            sessionId: "s",
            customerName: null,
            lines: c.lines.map((l) => ({ ...l, qty: 1 })),
            nowMs: Date.parse(UNPAID_NOW),
          }) !== null,
      )
      .map((c) => c.id)
      .sort();
    expect(bagged.length).toBeGreaterThan(0);
    expect(bagged.length).toBeLessThan(REGISTER_QUEUE_CAP);
    expect(res.carts.map((c) => c.id).sort()).toEqual(bagged);
  });

  it("a line fired at exactly the DB clock, or with no stamp, is a candidate; one a millisecond later is not", async () => {
    // p2f-cx1-lane/unpaid-cap-grace-edge — `counterSentLine` admits fire_at == now (`<=`)
    const res = await readUnpaidCounterCarts(
      answeringDb([
        {
          id: "at-now",
          created_at: "2026-09-13T17:03:00.000Z",
          lines: [line({ fire_at: UNPAID_NOW })],
        },
        { id: "null", created_at: "2026-09-13T17:02:00.000Z", lines: [line({ fire_at: null })] },
        {
          id: "next-ms",
          created_at: "2026-09-13T17:01:00.000Z",
          lines: [line({ fire_at: "2026-09-13T18:00:00.001Z" })],
        },
      ]),
      UNPAID_NOW,
    );
    if (!res.ok) throw new Error("expected ok");
    expect(res.carts.map((c) => c.id)).toEqual(["at-now", "null"]);
  });
});
