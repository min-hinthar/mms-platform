import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * M221 — ONE ledger answer per request, whoever asks first.
 *
 * `/staff` renders the settled list (`getSettledToday`) and the register's drawer
 * (`getDayCashSummary`) on one page, and both need the service day's refund ledger. M218 put the read
 * behind one function, but each caller still made its OWN read, so a refund committing between the
 * two asks landed in one screen's answer and not the other's — the one place the two sit side by
 * side. `readDayLedger` is that read inside React's request-scoped `cache()`, keyed on the day floor.
 *
 * React only memoizes inside a server request; outside one (a unit test) its `cache` calls straight
 * through. So `react` is replaced here by a memo whose store is ONE request — cleared before every
 * case — which is exactly the scope React gives it in production. What this suite proves is that the
 * read goes through `cache` and is keyed on the floor; that React scopes a cache to its request is
 * React's contract, not this module's.
 */
vi.mock("server-only", () => ({}));

/** The request's cache store: per wrapped function, per argument list. Cleared per case. */
const requestStore = new Map<unknown, Map<string, unknown>>();
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache:
    <A extends unknown[], R>(fn: (...args: A) => R) =>
    (...args: A): R => {
      let perFn = requestStore.get(fn);
      if (!perFn) requestStore.set(fn, (perFn = new Map()));
      const key = JSON.stringify(args);
      if (!perFn.has(key)) perFn.set(key, fn(...args));
      return perFn.get(key) as R;
    },
}));

type Row = {
  id: string;
  order_id: string;
  order_item_id: string | null;
  amount_cents: number;
  tender: string;
  created_at: string;
};
/** The ledger as the database holds it RIGHT NOW — a case may commit a row between two asks. */
let ledger: Row[] = [];
/** How many times `mms_refunds` was asked, and the floor each ask carried. */
let reads: string[] = [];

vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: (table: string) => {
      if (table !== "mms_refunds") throw new Error(`unexpected table ${table}`);
      let floor = "";
      const api: Record<string, unknown> = {
        select: () => api,
        gte: (_col: string, since: string) => ((floor = since), api),
        or: () => api,
        order: () => api,
        limit: () => api,
        then(resolve: (v: { data: Row[]; error: null }) => unknown) {
          reads.push(floor);
          // One short page — every row at or after the floor — which is what ends the keyset loop.
          return Promise.resolve({
            data: ledger.filter((r) => r.created_at >= floor),
            error: null,
          }).then(resolve);
        },
      };
      return api;
    },
  }),
}));

const { readDayLedger } = await import("./refund-ledger-day");

const FLOOR = "2026-10-12T07:00:00.000Z";
const cashRefund = (id: string, cents: number): Row => ({
  id,
  order_id: `order-${id}`,
  order_item_id: null,
  amount_cents: cents,
  tender: "cash",
  created_at: "2026-10-12T18:00:00.000Z",
});

beforeEach(() => {
  requestStore.clear(); // a new request
  ledger = [cashRefund("r1", 500)];
  reads = [];
});

describe("M221 — the day's ledger is read ONCE per request", () => {
  it("two asks for one day share one read — and one answer, even across a refund committing between them", async () => {
    const first = await readDayLedger(FLOOR);
    // A refund commits after the first screen read the day.
    ledger.push(cashRefund("r2", 700));
    const second = await readDayLedger(FLOOR);
    // MUTATION (m221/day-read-uncached): each ask reads for itself — two reads, and the second
    // answer carries a refund the first never saw; the settled list and the drawer disagree; red.
    expect(reads).toEqual([FLOOR]);
    expect(second).toBe(first);
    expect(second?.map((r) => r.orderId)).toEqual(["order-r1"]);
  });

  it("keyed on the day floor: a different floor is a different question, asked on its own", async () => {
    // A request that straddles the service day's boundary (two `mms_now` reads either side of the
    // floor) must not be handed the other day's ledger. MUTATION (m221/day-read-keyed-on-nothing):
    // one answer for every floor; red.
    const EARLIER = "2026-10-11T07:00:00.000Z";
    await readDayLedger(FLOOR);
    await readDayLedger(EARLIER);
    expect(reads).toEqual([FLOOR, EARLIER]);
  });
});
