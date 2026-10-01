import { beforeEach, describe, expect, it, vi } from "vitest";
/**
 * Phase 2g · P2em (decision D2) — a counter order's #CODE card is derivable from its ORDER ROW.
 *
 * Before, the card lived only in the panel that took the charge (and this tab's stash): a counter
 * session closes behind its settle, its closed verdict carried a label and a number, and any exit
 * from the panel — or another device, or a reload — lost "Paid · $X · #CODE" for good. Now the
 * closed verdict of a COUNTER session carries `handoff`, and a SETTLED counter detail (the session
 * the webhook's best-effort close left active) carries `serverHandoff`, both through
 * `serverCounterHandoff` (lib/register-ui) — the one refund gate, the row's figures verbatim.
 *
 * The fake DB EVALUATES its filters, applies the sort and the limit, and PROJECTS each row to the
 * columns the select names — so a read that drops a column, a status, or the newest-first order
 * changes the OUTCOME here, never just a call transcript (the floor-settled-detail pattern). And its
 * `maybeSingle()` answers as PostgREST does over MORE than one surviving row — an error, never the
 * first row (Phase 2g · review, G1) — so a closed read that loses its `.limit(1)` loses the card here
 * exactly as it would in production.
 *
 * Phase 2g · review (M2 · PT-3 · PT-7) — the closed verdict also carries the refund STATE of that
 * same row and its id (`serverCounterOutcome`), so a refunded counter order can be SAID, and can
 * veto a card a tab still holds for it, instead of hedging like an unreadable one.
 */
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("./posthog-server", () => ({
  getPostHogClient: () => ({ capture() {}, flush: () => Promise.resolve() }),
}));
vi.mock("./authz", () => ({ AuthzError: class AuthzError extends Error {} }));
vi.mock("./staff", () => ({
  getStaffAuth: () =>
    Promise.resolve({
      kind: "staff",
      caller: { uid: "u", staffId: "st", role: "server", displayName: "S", email: null },
    }),
  requireStaff: () => Promise.resolve({}),
  staffGate: () => Promise.resolve({ ok: true, caller: {} }),
  STAFF_WRITE_OUTAGE: "outage",
}));
vi.mock("./staff-lock", () => ({ isConsoleLocked: () => Promise.resolve(false) }));
vi.mock("./pay-guard", () => ({
  isFresh: () => false,
  paymentInFlightReason: () => Promise.resolve(null),
}));
vi.mock("@mms/db/schemas", () => ({
  clearTableInput: { safeParse: (x: unknown) => ({ success: true, data: x }) },
  mergeTablesInput: { safeParse: (x: unknown) => ({ success: true, data: x }) },
}));
vi.mock("./totals", () => ({
  getCartTotals: () =>
    Promise.resolve({
      subtotalCents: 1200,
      discountCents: 0,
      rewardCents: 0,
      rewardFaceCents: 0,
      promoCents: 0,
      serviceChargeCents: 0,
      taxCents: 100,
      tipCents: 0,
      totalCents: 1300,
    }),
}));

type Row = Record<string, unknown>;
const SESSION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NOW = "2026-10-01T18:00:00.000Z";
let session: Row;
let cartRow: Row | null;
let orderRows: Row[];
let ordersFail: boolean;
/** Every table read, in order — "no orders read" and "no extra statement" are measured here. */
let reads: string[];

function tableApi(name: string) {
  reads.push(name);
  const eqs: [string, unknown][] = [];
  const ins: [string, unknown[]][] = [];
  let cols: string[] | null = null;
  let sort: { col: string; asc: boolean } | null = null;
  let cap: number | null = null;
  const matches = (r: Row) =>
    eqs.every(([c, v]) => !(c in r) || r[c] === v) &&
    ins.every(([c, vs]) => !(c in r) || vs.includes(r[c]));
  // The select is APPLIED: a column the read does not name is not in the row it gets back.
  const project = (r: Row): Row =>
    cols === null ? r : Object.fromEntries(cols.filter((c) => c in r).map((c) => [c, r[c]]));
  const shaped = (rows: Row[]) => {
    const sorted = sort
      ? [...rows].sort((a, b) => {
          const x = String(a[sort!.col] ?? "");
          const y = String(b[sort!.col] ?? "");
          return sort!.asc ? x.localeCompare(y) : y.localeCompare(x);
        })
      : rows;
    return (cap == null ? sorted : sorted.slice(0, cap)).map(project);
  };
  const rowsOf = (): Row[] | null => {
    if (name === "qr_orders") return orderRows.filter(matches);
    if (name === "qr_carts") return cartRow && matches(cartRow) ? [cartRow] : [];
    if (name === "table_sessions") return [session];
    return [];
  };
  const failed = () => name === "qr_orders" && ordersFail;
  const api: Record<string, unknown> = {
    select(c: string) {
      cols = c.split(",").map((x) => x.trim());
      return api;
    },
    eq(col: string, val: unknown) {
      eqs.push([col, val]);
      return api;
    },
    in(col: string, vals: unknown[]) {
      ins.push([col, vals]);
      return api;
    },
    order(col: string, opts?: { ascending?: boolean }) {
      sort = { col, asc: opts?.ascending !== false };
      return api;
    },
    limit(n: number) {
      cap = n;
      return api;
    },
    maybeSingle() {
      if (failed()) return Promise.resolve({ data: null, error: { message: "orders unreadable" } });
      const hit = shaped(rowsOf() ?? []);
      // PostgREST: `maybeSingle()` over more than one row is an ERROR, never the first row.
      if (hit.length > 1)
        return Promise.resolve({
          data: null,
          error: { message: "JSON object requested, multiple (or no) rows returned" },
        });
      return Promise.resolve({ data: hit[0] ?? null, error: null });
    },
    then(resolve: (r: { data: Row[] | null; error: unknown }) => void) {
      if (failed()) return resolve({ data: null, error: { message: "orders unreadable" } });
      return resolve({ data: shaped(rowsOf() ?? []), error: null });
    },
  };
  return api;
}
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: (name: string) => tableApi(name),
    rpc: () => Promise.resolve({ data: NOW, error: null }),
  }),
}));

const { getTableDetail } = await import("./floor");

const COUNTER_SESSION = {
  id: SESSION,
  qr_code: "reg-7f3a",
  table_number: null,
  mode: "pickup",
  status: "closed",
  host_seat: null,
  created_at: "2026-10-01T17:00:00.000Z",
};
const PAID = {
  id: "o-00a1b2c3",
  session_id: SESSION,
  cart_id: "c-9",
  status: "paid",
  total_cents: 5330,
  tip_cents: 300,
  refunded_cents: 0,
  created_at: "2026-10-01T17:30:00.000Z",
};
const CARD = {
  orderId: "o-00a1b2c3",
  totalCents: 5330,
  tipCents: 300,
  tenderedCents: null,
  isCounter: true,
  cartId: "c-9",
  sentEarly: false,
};

beforeEach(() => {
  session = { ...COUNTER_SESSION };
  cartRow = null;
  orderRows = [{ ...PAID }];
  ordersFail = false;
  reads = [];
});

describe("getTableDetail — a CLOSED counter order carries its #CODE card", () => {
  const CLOSED = { kind: "closed", label: "reg-7f3a", tableNumber: null } as const;

  it("closed + paid: the verdict names the order and carries the card, figures verbatim", async () => {
    const r = await getTableDetail(SESSION);
    // MUTANT p2g-code/closed-handoff-dropped — the closed arm reads no card; red.
    expect(r).toEqual({ ...CLOSED, handoff: CARD, refund: "none", orderId: "o-00a1b2c3" });
  });

  it("a PARTLY refunded order is never carried as Paid — the refund column is READ, and SAID", async () => {
    orderRows = [{ ...PAID, refunded_cents: 1200 }];
    const r = await getTableDetail(SESSION);
    // MUTANT p2g-code/closed-handoff-select-drops-refunded — the select omits `refunded_cents`, the
    // gate reads "nothing came back", and the partly refunded order reads "Paid · $53.30"; red.
    // MUTANT p2g-fix-code/closed-refund-dropped — the verdict loses the refund state: the pane and
    // the page hedge ("it may have been paid, cleared…") over an order the server knows was
    // refunded, and a stashed "Paid" card for it is never vetoed; red.
    expect(r).toEqual({ ...CLOSED, handoff: null, refund: "partial", orderId: "o-00a1b2c3" });
  });

  it("a refunded order is never Paid, and its verdict says it came back in full", async () => {
    orderRows = [{ ...PAID, status: "refunded" }];
    const r = await getTableDetail(SESSION);
    expect(r).toEqual({ ...CLOSED, handoff: null, refund: "full", orderId: "o-00a1b2c3" });
  });

  it("the card is the session's LATEST order", async () => {
    orderRows = [
      { ...PAID, id: "o-0000old1", created_at: "2026-10-01T17:10:00.000Z" },
      { ...PAID, id: "o-0000new2", created_at: "2026-10-01T17:40:00.000Z" },
    ];
    const r = await getTableDetail(SESSION);
    // MUTANT p2g-code/closed-handoff-oldest-order — oldest first; red.
    // MUTANT p2g-fix-code/closed-handoff-no-limit — `.limit(1)` dropped: PostgREST's `maybeSingle()`
    // over the session's two settled orders is an ERROR, the read logs it and the card is lost; red.
    expect(r.kind === "closed" && r.handoff?.orderId).toBe("o-0000new2");
    expect(r.kind === "closed" && r.orderId).toBe("o-0000new2");
  });

  it("no paid order: closed, no card, no refund state (nothing to name)", async () => {
    orderRows = [];
    const r = await getTableDetail(SESSION);
    expect(r).toEqual({ ...CLOSED, handoff: null, refund: null, orderId: null });
  });

  it("an unreadable order is NOT an outage: still closed, no card, logged (only the session read is)", async () => {
    ordersFail = true;
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await getTableDetail(SESSION);
    // MUTANT p2g-code/closed-handoff-error-is-outage — an advisory read freezes the pane on "the
    // system is unreachable" over a counter order that simply closed; red.
    // The refund is UNKNOWN (null), never "none": an unread order vetoes nothing and is hedged.
    expect(r).toEqual({ ...CLOSED, handoff: null, refund: null, orderId: null });
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it("a closed DINE-IN table reads no order and carries no card", async () => {
    session = { ...COUNTER_SESSION, qr_code: "t-7", table_number: 7, mode: "dinein" };
    const r = await getTableDetail(SESSION);
    // MUTANT p2g-code/closed-handoff-any-session — the counter gate dropped: a cleared table grows a
    // #CODE card and a "Back to the counter" over the last party's bill; red.
    expect(r).toEqual({ kind: "closed", label: "t-7", tableNumber: 7 });
    expect(reads).not.toContain("qr_orders");
  });

  it("a KIOSK pickup is not a counter order either (`isCounterOrder` is reg- only)", async () => {
    session = { ...COUNTER_SESSION, qr_code: "kiosk-1" };
    const r = await getTableDetail(SESSION);
    expect(r).toEqual({ kind: "closed", label: "kiosk-1", tableNumber: null });
    expect(reads).not.toContain("qr_orders");
  });
});

describe("getTableDetail — a SETTLED counter detail carries its #CODE card", () => {
  beforeEach(() => {
    session = { ...COUNTER_SESSION, status: "active" };
  });

  it("built from the paid row the detail already reads — one orders statement, no extra", async () => {
    const r = await getTableDetail(SESSION);
    expect(r.kind).toBe("detail");
    if (r.kind !== "detail") throw new Error("unreachable: asserted detail above");
    expect(r.detail.settled).toBe(true);
    // MUTANT p2g-code/settled-detail-drops-server-handoff — the card only on the closed verdict: the
    // session the webhook's close missed shows "Paid $53.30" with no #CODE anywhere; red.
    expect(r.detail.serverHandoff).toEqual(CARD);
    expect(reads.filter((n) => n === "qr_orders")).toHaveLength(1);
  });

  it("a partly refunded settled counter order carries no card", async () => {
    orderRows = [{ ...PAID, refunded_cents: 1200 }];
    const r = await getTableDetail(SESSION);
    expect(r.kind === "detail" && r.detail.serverHandoff).toBeNull();
  });

  it("an OPEN cart never carries a card, whatever paid before it", async () => {
    cartRow = {
      id: "c-10",
      session_id: SESSION,
      status: "open",
      locked: false,
      locked_at: null,
      settle_at: null,
      settle_by: null,
      counter_requested_at: null,
      tab_type: "none",
      tab_opened_at: null,
      intended_tip_cents: null,
      promo_code: null,
      customer_name: "Aye",
      counter_arm: "walkup",
    };
    const r = await getTableDetail(SESSION);
    expect(r.kind).toBe("detail");
    if (r.kind !== "detail") throw new Error("unreachable: asserted detail above");
    expect(r.detail.cartId).toBe("c-10");
    // MUTANT p2g-code/server-handoff-over-open-cart — "Paid · #CODE" over a live basket; red.
    expect(r.detail.serverHandoff).toBeNull();
  });

  it("a settled DINE-IN table carries no card (its paid state is the signal)", async () => {
    session = {
      ...COUNTER_SESSION,
      status: "active",
      qr_code: "t-7",
      table_number: 7,
      mode: "dinein",
    };
    const r = await getTableDetail(SESSION);
    expect(r.kind).toBe("detail");
    if (r.kind !== "detail") throw new Error("unreachable: asserted detail above");
    expect(r.detail.settled).toBe(true);
    // MUTANT p2g-code/settled-detail-server-handoff-any-session — a table grows a #CODE card; red.
    expect(r.detail.serverHandoff).toBeNull();
  });
});
