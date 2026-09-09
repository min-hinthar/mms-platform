import { beforeEach, describe, expect, it, vi } from "vitest";
/**
 * K33 — THE FLOOR DRILL-DOWN AFTER THE TABLE PAYS.
 *
 * `getTableDetail`'s cart read is `.eq("status","open")` and both fulfillment RPCs flip the cart to
 * 'paid', so at the instant of settlement the whole line block stopped running and the screen printed
 * "Nothing in the cart yet." over a table that had just eaten. The lines never went anywhere —
 * `mms_fulfill_order` copies them into `qr_order_items` — so the settled path reads them from there.
 *
 * The fake DB EVALUATES its filters (the cart-promo-freeze pattern), so a mutant that drops the
 * status guard, reads the wrong table, or lets the settled lines leak into the open-cart "so far"
 * bindings changes the OUTCOME here rather than a call transcript.
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
      subtotalCents: 5000,
      discountCents: 0,
      rewardCents: 0,
      rewardFaceCents: 0,
      promoCents: 0,
      serviceChargeCents: 0,
      taxCents: 330,
      tipCents: 0,
      totalCents: 5330,
    }),
}));

type Row = Record<string, unknown>;
let cartRow: Row | null = null;
// A LIST, because a session can settle more than once — `/api/session` starts a fresh cart after
// one is paid. `orderRow` is kept as the single-round convenience the older cases use.
let orderRows: Row[] = [];
let orderItemRows: Row[] = [];
// The party, so a settled line's `added_by` has a seat to resolve against.
let memberRows: Row[] = [];
let cartItemRows: Row[] = [];
let orderItemsFail = false;

function tableApi(name: string) {
  const eqs: [string, unknown][] = [];
  const ins: [string, unknown[]][] = [];
  let sort: { col: string; asc: boolean } | null = null;
  let cap: number | null = null;
  const applySort = (rows: Row[]) => {
    const out = sort
      ? [...rows].sort((a, b) => {
          const x = String(a[sort!.col] ?? "");
          const y = String(b[sort!.col] ?? "");
          return sort!.asc ? x.localeCompare(y) : y.localeCompare(x);
        })
      : rows;
    return cap == null ? out : out.slice(0, cap);
  };
  const api: Record<string, unknown> = {
    select() {
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
    // ⚠️ APPLIED, not swallowed. A blind audit of this suite named the evasion: with these as
    // no-ops, `maybeSingle()` answered the same row whatever the sort said, and the ordering
    // assertion below passed for any column, any direction — so flipping the settled-order read to
    // ascending (showing the FIRST round instead of the latest) was invisible.
    order(col: string, opts?: { ascending?: boolean }) {
      sort = { col, asc: opts?.ascending !== false };
      return api;
    },
    limit(n: number) {
      cap = n;
      return api;
    },
    // Carried, not evaluated: the floor's liveness bounds (`expires_at`, the `reg-` exclusion) are
    // not what these cases are about, and a fixture that answered them would need a whole clock.
    // Only `eq`/`in` are applied, which is where the settled-status policy lives.
    gt() {
      return api;
    },
    not() {
      return api;
    },
    is() {
      return api;
    },
    // A row satisfies the read only if every filter it can answer actually matches — a fixture that
    // ignored the filters would let a dropped guard report clean.
    maybeSingle() {
      if (name === "table_sessions")
        return Promise.resolve({
          data: {
            id: SESSION,
            qr_code: "t-7",
            table_number: 7,
            mode: "dinein",
            status: "active",
            host_seat: null,
            created_at: "2026-09-09T00:00:00.000Z",
          },
          error: null,
        });
      const r =
        name === "qr_carts" ? cartRow : name === "qr_orders" ? (orderRows[0] ?? null) : null;
      if (r === null) return Promise.resolve({ data: null, error: null });
      const hit =
        eqs.every(([c, v]) => !(c in r) || r[c] === v) &&
        ins.every(([c, vs]) => !(c in r) || vs.includes(r[c]));
      return Promise.resolve({ data: hit ? r : null, error: null });
    },
    then(resolve: (r: { data: Row[] | null; error: unknown }) => void) {
      // `getFloorView` reads the room as LISTS. Only `qr_orders` matters to the case below, and its
      // status filter has to be EVALUATED, or a read that drops `refunded` still answers with the
      // row and the guard proves nothing.
      if (name === "qr_orders") {
        const hit = applySort(
          orderRows.filter(
            (r) =>
              eqs.every(([c, v]) => !(c in r) || r[c] === v) &&
              ins.every(([c, vs]) => !(c in r) || vs.includes(r[c])),
          ),
        );
        return resolve({ data: hit, error: null });
      }
      if (name === "table_sessions")
        return resolve({
          data: [
            {
              id: SESSION,
              qr_code: "t-7",
              table_number: 7,
              mode: "dinein",
              status: "active",
              host_seat: null,
              created_at: "2026-09-09T00:00:00.000Z",
            },
          ],
          error: null,
        });
      if (name === "qr_order_items") {
        if (orderItemsFail)
          return resolve({ data: null, error: { message: "order items unreadable" } });
        const hit = applySort(
          orderItemRows.filter((r) => eqs.every(([c, v]) => !(c in r) || r[c] === v)),
        );
        return resolve({ data: hit, error: null });
      }
      if (name === "qr_cart_items") return resolve({ data: cartItemRows, error: null });
      if (name === "session_members") return resolve({ data: memberRows, error: null });
      resolve({ data: [], error: null });
    },
  };
  return api;
}
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: (name: string) => tableApi(name),
    rpc: () => Promise.resolve({ data: null, error: null }),
  }),
}));

const { getTableDetail } = await import("./floor");
const SESSION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

beforeEach(() => {
  cartRow = null; // the table has PAID — no open cart exists
  orderRows = [
    {
      id: "o-1",
      session_id: SESSION,
      status: "paid",
      total_cents: 5330,
      refunded_cents: 0,
      created_at: "2026-09-09T01:00:00.000Z",
    },
  ];
  orderItemRows = [
    {
      id: "oi-1",
      order_id: "o-1",
      name: "Mohinga",
      qty: 2,
      unit_price_cents: 1400,
      notes: "no egg",
      modifiers: ["Extra fish", "No egg"],
      refunded_cents: 0,
      added_by: null,
    },
    {
      id: "oi-2",
      order_id: "o-1",
      name: "Tea leaf salad",
      qty: 1,
      unit_price_cents: 900,
      notes: null,
      modifiers: [],
      refunded_cents: 0,
      added_by: null,
    },
  ];
  cartItemRows = [];
  memberRows = [];
  orderItemsFail = false;
});

describe("K33 — a settled table still shows what it ordered", () => {
  it("reads the paid order's lines instead of printing an empty cart", async () => {
    const r = await getTableDetail(SESSION);
    expect(r.kind).toBe("detail");
    if (r.kind !== "detail") throw new Error("unreachable: asserted detail above");
    expect(r.detail.settled).toBe(true);
    expect(r.detail.lines.map((l) => l.name)).toEqual(["Mohinga", "Tea leaf salad"]);
    expect(r.detail.lines[0]?.qty).toBe(2);
    // The fulfilment-time snapshot, verbatim — never re-derived.
    expect(r.detail.lines[0]?.unitPriceCents).toBe(1400);
    expect(r.detail.paidTotalCents).toBe(5330);
  });

  it("carries the chosen options and the kitchen note — the details the floor never showed", async () => {
    const r = await getTableDetail(SESSION);
    expect(r.kind).toBe("detail");
    if (r.kind !== "detail") throw new Error("unreachable: asserted detail above");
    expect(r.detail.lines[0]?.modifiers).toEqual(["Extra fish", "No egg"]);
    expect(r.detail.lines[0]?.notes).toBe("no egg");
    // A line with no options carries an empty array, never undefined — the renderer maps over it.
    expect(r.detail.lines[1]?.modifiers).toEqual([]);
  });

  it("never lets a settled line reach the open-cart 'so far' bindings", async () => {
    // `itemCount`/`runningSubtotalCents` drive LiveMoney's running total; a settled table's
    // authoritative figure is `paidTotalCents`. Leaking the order into them would print a
    // live-looking basket beside a paid total — two numbers for one meal.
    const r = await getTableDetail(SESSION);
    expect(r.kind).toBe("detail");
    if (r.kind !== "detail") throw new Error("unreachable: asserted detail above");
    expect(r.detail.itemCount).toBe(0);
    expect(r.detail.runningSubtotalCents).toBe(0);
    expect(r.detail.settleTotalCents).toBeNull();
    expect(r.detail.cartId).toBeNull();
  });

  it("a REFUNDED order still shows its lines, and stops deriving as 'seated'", async () => {
    orderRows = [{ ...(orderRows[0] as Row), status: "refunded" }];
    const r = await getTableDetail(SESSION);
    expect(r.kind).toBe("detail");
    if (r.kind !== "detail") throw new Error("unreachable: asserted detail above");
    expect(r.detail.settled).toBe(true);
    expect(r.detail.lines).toHaveLength(2);
    expect(r.detail.status).toBe("paid"); // a settled table, not an empty one
  });

  it("an OPEN cart still wins — the settled path is the fallback, not an override", async () => {
    cartRow = {
      id: "c-1",
      status: "open",
      locked: false,
      locked_at: null,
      settle_at: null,
      counter_requested_at: null,
      tab_type: "none",
      tab_opened_at: null,
      intended_tip_cents: null,
      promo_code: null,
    };
    cartItemRows = [
      {
        id: "ci-1",
        name: "Mohinga",
        qty: 1,
        unit_price_cents: 1400,
        by_seat: null,
        created_at: "2026-09-09T00:30:00.000Z",
        menu_item_id: null,
        state: "draft",
        comped: false,
        notes: null,
        modifiers: ["No egg"],
      },
    ];
    const r = await getTableDetail(SESSION);
    expect(r.kind).toBe("detail");
    if (r.kind !== "detail") throw new Error("unreachable: asserted detail above");
    expect(r.detail.settled).toBe(false);
    expect(r.detail.lines).toHaveLength(1);
    expect(r.detail.lines[0]?.modifiers).toEqual(["No egg"]); // the open path carries them too
    expect(r.detail.itemCount).toBe(1); // the running bindings are live again
    expect(r.detail.runningSubtotalCents).toBe(1400);
  });

  it("an unreadable order-items read is an OUTAGE, never an empty table", async () => {
    // The exact false verdict this branch exists to end: "nothing here" over a table that just paid.
    orderItemsFail = true;
    const r = await getTableDetail(SESSION);
    expect(r.kind).toBe("outage");
  });
});

describe("getFloorView — the room agrees with the drill-down about a settled table", () => {
  it("counts a REFUNDED order as settled, exactly as getTableDetail does", async () => {
    // The two reads pick a settled order by the same rule (latest by `created_at`), so a divergence
    // in the STATUS SET is not a smaller answer on the card — it is a different one. With the floor
    // filtering `paid` alone, a fully-refunded table derives as `seated` with no total on the card
    // while the drill-down shows it settled with its lines; with two orders, the card can name an
    // older paid one beside a detail showing the newer refunded one. Found by Codex on this PR.
    orderRows = [{ ...(orderRows[0] as Row), status: "refunded" }];
    const { getFloorView } = await import("./floor");
    const res = await getFloorView();
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("unreachable: asserted ok above");
    const table = res.snapshot.tables.find((t) => t.sessionId === SESSION);
    expect(table).toBeDefined();
    expect(table?.paidTotalCents).toBe(5330);
    expect(table?.status).toBe("paid"); // a settled table, not an empty one
  });

  it("still counts a plain PAID order — the widening did not replace the ordinary case", async () => {
    const { getFloorView } = await import("./floor");
    const res = await getFloorView();
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("unreachable: asserted ok above");
    expect(res.snapshot.tables.find((t) => t.sessionId === SESSION)?.paidTotalCents).toBe(5330);
  });
});

describe("K33 — the settled record tells the truth about money that came back", () => {
  it("never reports a FULLY refunded order as plainly paid", async () => {
    // Registry M2 closed exactly this on the guest receipt: a refunded order must never read as
    // paid. Admitting `refunded` here (so the table keeps its lines) reopened the same question on
    // the staff surface, and the money row is what a cashier reads while holding cash.
    orderRows = [{ ...(orderRows[0] as Row), status: "refunded", refunded_cents: 5330 }];
    const r = await getTableDetail(SESSION);
    expect(r.kind).toBe("detail");
    if (r.kind !== "detail") throw new Error("unreachable: asserted detail above");
    expect(r.detail.refund).toEqual({ state: "full", refundedCents: 5330, netPaidCents: 0 });
  });

  it("reads a full refund from the STATUS alone, when no ledger row recorded the amount", async () => {
    // A refund issued from the Stripe dashboard writes no ledger row, so the column stays 0 while
    // the status flips. Reporting "$0.00 came back" there would be a lie in the guest's favour and
    // no less wrong for it — the summary answers with the whole total.
    orderRows = [{ ...(orderRows[0] as Row), status: "refunded", refunded_cents: 0 }];
    const r = await getTableDetail(SESSION);
    expect(r.kind).toBe("detail");
    if (r.kind !== "detail") throw new Error("unreachable: asserted detail above");
    expect(r.detail.refund?.state).toBe("full");
    expect(r.detail.refund?.refundedCents).toBe(5330);
  });

  it("carries a PARTIAL refund, which leaves the order's status at 'paid'", async () => {
    // The case with no other signal at all: `status` still reads 'paid', so without the column the
    // record renders every line at full price and the money row says the guest paid the lot.
    orderRows = [{ ...(orderRows[0] as Row), refunded_cents: 1400 }];
    // BOTH lines kept: the second one, untouched, is what proves the refund lands on the line it
    // belongs to rather than on every line in the order.
    orderItemRows = [
      { ...(orderItemRows[0] as Row), refunded_cents: 1400 },
      { ...(orderItemRows[1] as Row) },
    ];
    const r = await getTableDetail(SESSION);
    expect(r.kind).toBe("detail");
    if (r.kind !== "detail") throw new Error("unreachable: asserted detail above");
    expect(r.detail.refund).toEqual({
      state: "partial",
      refundedCents: 1400,
      netPaidCents: 3930,
    });
    // 3930 ≠ 1400 ≠ 5330: three separable figures, so a mutant reading the wrong one cannot pass.
    expect(r.detail.lines[0]?.refundedCents).toBe(1400);
    expect(r.detail.lines[1]?.refundedCents).toBe(0);
  });

  it("reports NO refund on an ordinary paid table — never a fabricated zero-refund state", async () => {
    const r = await getTableDetail(SESSION);
    expect(r.kind).toBe("detail");
    if (r.kind !== "detail") throw new Error("unreachable: asserted detail above");
    expect(r.detail.refund?.state).toBe("none");
    expect(r.detail.refund?.netPaidCents).toBe(5330);
  });
});

describe("K33 — the settled record names the round it is showing", () => {
  it("shows the LATEST round's lines and says how many rounds there are", async () => {
    // `/api/session` starts a fresh cart once one is paid, so a table that pays and keeps ordering
    // settles more than once. Showing one round while implying it is the meal is the defect; the
    // ordering here is what decides WHICH round, so the fake applies `.order()` for real.
    orderRows = [
      {
        id: "o-old",
        session_id: SESSION,
        status: "paid",
        total_cents: 1100,
        refunded_cents: 0,
        created_at: "2026-09-09T00:30:00.000Z",
      },
      {
        id: "o-1",
        session_id: SESSION,
        status: "paid",
        total_cents: 5330,
        refunded_cents: 0,
        created_at: "2026-09-09T01:00:00.000Z",
      },
    ];
    const r = await getTableDetail(SESSION);
    expect(r.kind).toBe("detail");
    if (r.kind !== "detail") throw new Error("unreachable: asserted detail above");
    expect(r.detail.settledOrderCount).toBe(2);
    // The LATEST, not the first: 5330 and 1100 are separable, so a read sorted ascending fails here
    // rather than passing on a tie. That assertion was VACUOUS until the fake applied `.order()`.
    expect(r.detail.paidTotalCents).toBe(5330);
  });

  it("counts ONE round for the ordinary table, so the note stays off", async () => {
    const r = await getTableDetail(SESSION);
    expect(r.kind).toBe("detail");
    if (r.kind !== "detail") throw new Error("unreachable: asserted detail above");
    expect(r.detail.settledOrderCount).toBe(1);
  });
});

describe("K33 — a settled line still says who ordered it", () => {
  it("resolves the seat that added the line to that guest's name", async () => {
    // `qr_order_items.added_by` and `qr_cart_items.by_seat` share a key space (`order-lines.ts`:
    // "outside a reassign `added_by === by_seat` always"), so the settled branch reuses the same
    // seat→name map. Both fixture rows carried `added_by: null` until a blind audit noticed the
    // field was never exercised with a VALUE, which left the whole lookup revertible to `null`.
    memberRows = [
      { session_id: SESSION, seat_id: "seat-a", display_name: "Ko Ko", role: "host" },
      { session_id: SESSION, seat_id: "seat-b", display_name: "Ma Ma", role: "guest" },
    ];
    orderItemRows = [
      { ...(orderItemRows[0] as Row), added_by: "seat-b" },
      { ...(orderItemRows[1] as Row), added_by: null },
    ];
    const r = await getTableDetail(SESSION);
    expect(r.kind).toBe("detail");
    if (r.kind !== "detail") throw new Error("unreachable: asserted detail above");
    // Ma Ma, not the host — a lookup that returned the first member would pass on a one-seat table.
    expect(r.detail.lines[0]?.bySeatName).toBe("Ma Ma");
    expect(r.detail.lines[1]?.bySeatName).toBeNull();
  });
});
