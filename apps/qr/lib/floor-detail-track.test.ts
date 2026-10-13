import { beforeEach, describe, expect, it, vi } from "vitest";
/**
 * The lifecycle audit (2026-10-13) — `getTableDetail` hands each sent line its STAGE on the one
 * kitchen track (the editor's tag), and the table's PAID rounds' food still in the kitchen
 * (`paidKitchen`, the "From the paid round" group). The fake answers like PostgREST — a row carries
 * only the columns the query SELECTED — so a select that drops `bumped_at` shows up as a wrong stage.
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
const SESSION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OPEN = "cart-1";
const PAID = "cart-paid";
// The table page's clock on a dine-in table is the app clock: fixtures are cut from the real now.
const NOW = Date.now();
const ago = (ms: number) => new Date(NOW - ms).toISOString();

let openRows: Row[] = [];
let paidRows: Row[] = [];
let paidReadFails = false;
let orders: Row[] = [];
let paidAsked: unknown[] | null = null;

function pick(row: Row, cols: string): Row {
  const out: Row = {};
  for (const c of cols.split(",").map((s) => s.trim())) if (c in row) out[c] = row[c];
  return out;
}

function tableApi(name: string) {
  let cols = "*";
  let inCarts: unknown[] | null = null;
  // #360 (CRITICAL 3) — the paid read's ORDER and CAP are evaluated, so a read that keeps the wrong
  // end of a long night keeps the wrong rows here too.
  const sorts: [string, boolean][] = [];
  let cap: number | null = null;
  const api: Record<string, unknown> = {
    select(c: string) {
      cols = c;
      return api;
    },
    eq: () => api,
    in(col: string, v: unknown[]) {
      if (name === "qr_cart_items" && col === "cart_id") inCarts = v;
      return api;
    },
    order(col: string, o?: { ascending?: boolean }) {
      sorts.push([col, o?.ascending !== false]);
      return api;
    },
    limit(n: number) {
      cap = n;
      return api;
    },
    gt: () => api,
    not: () => api,
    or: () => api,
    is: () => api,
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
            created_at: ago(3_600_000),
          },
          error: null,
        });
      if (name === "qr_carts")
        return Promise.resolve({
          data: {
            id: OPEN,
            locked: false,
            locked_at: null,
            settle_at: null,
            counter_requested_at: null,
            tab_type: "none",
            tab_opened_at: null,
            intended_tip_cents: null,
            promo_code: null,
          },
          error: null,
        });
      return Promise.resolve({ data: null, error: null });
    },
    then(resolve: (r: { data: Row[] | null; error: unknown }) => void) {
      // #360 (Codex P2) — the orders read's CAP is real here (newest first, as the fixtures list them),
      // and so is its column list, so a record page truncated at SETTLED_ORDER_CAP + 1 is truncated.
      if (name === "qr_orders")
        return resolve({
          data: (cap === null ? orders : orders.slice(0, cap)).map((r) => pick(r, cols)),
          error: null,
        });
      if (name === "qr_cart_items") {
        if (inCarts !== null) {
          paidAsked = inCarts;
          if (paidReadFails) return resolve({ data: null, error: { message: "down" } });
          // …and the cart filter: a line on a cart the read did not ask for is not returned.
          const asked = paidRows.filter((r) => !("cart_id" in r) || inCarts!.includes(r.cart_id));
          const sorted = [...asked].sort((a, b) => {
            for (const [c, asc] of sorts) {
              const x = String(a[c]);
              const y = String(b[c]);
              if (x !== y) return (x < y ? -1 : 1) * (asc ? 1 : -1);
            }
            return 0;
          });
          const capped = cap === null ? sorted : sorted.slice(0, cap);
          return resolve({ data: capped.map((r) => pick(r, cols)), error: null });
        }
        return resolve({ data: openRows.map((r) => pick(r, cols)), error: null });
      }
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
const { PAID_KITCHEN_CAP, paidRoundCapNote } = await import("./paid-round");
const { STAFF } = await import("./i18n/staff");
const { fill } = await import("./i18n/fill");

const line = (over: Row): Row => ({
  id: "l-1",
  name: "Mohinga",
  qty: 1,
  unit_price_cents: 1200,
  by_seat: null,
  created_at: ago(600_000),
  menu_item_id: "not-a-uuid",
  state: "fired",
  comped: false,
  notes: null,
  modifiers: [],
  fulfillment: "dinein",
  modifier_option_ids: [],
  fire_at: ago(120_000),
  bumped_at: null,
  ...over,
});

async function detail() {
  const r = await getTableDetail(SESSION);
  if (r.kind !== "detail") throw new Error(`expected a detail, got ${r.kind}`);
  return r.detail;
}

beforeEach(() => {
  openRows = [];
  paidRows = [];
  paidReadFails = false;
  orders = [];
  paidAsked = null;
});

describe("getTableDetail — a sent line's tag is its stage on the one track", () => {
  it("Sending… inside the send grace, Sent past it, Cooking inside Mom's undo, Served after", async () => {
    // lck/floor/stage-reads-the-raw-state — the page said "Sent" (with Void/Comp) while the diner's
    // grace still ran, and "Served" inside the six-second Undo.
    openRows = [
      line({ id: "grace", fire_at: new Date(NOW + 60_000).toISOString() }),
      line({ id: "sent" }),
      line({ id: "undo", state: "served", bumped_at: ago(1_000) }),
      line({ id: "out", state: "served", bumped_at: ago(120_000) }),
      line({ id: "draft", state: "draft", fire_at: null }),
    ];
    const d = await detail();
    expect(d.lines.map((l) => [l.id, l.stage])).toEqual([
      ["grace", "sending"],
      ["sent", "sent"],
      ["undo", "cooking"],
      ["out", "served"],
      ["draft", "unsent"],
    ]);
  });
});

describe("getTableDetail — the paid round's food still in the kitchen", () => {
  it("a PAID round's cooking dishes ride the detail, read from its cart, never the open one", async () => {
    // lck/floor/paid-round-unread — once a new round opened, the paid round's cooking mains appeared
    // nowhere on the page the floor card links to.
    orders = [
      {
        id: "o-1",
        total_cents: 2140,
        created_at: ago(900_000),
        status: "paid",
        refunded_cents: 0,
        tip_cents: 0,
        cart_id: PAID,
      },
    ];
    paidRows = [line({ id: "main", state: "in_progress", notes: "no peanuts" })];
    openRows = [line({ id: "tea", state: "draft", fire_at: null, name: "Tea" })];
    const d = await detail();
    expect(paidAsked).toEqual([PAID]);
    expect(d.paidKitchen?.map((l) => [l.id, l.stage, l.notes])).toEqual([
      ["main", "cooking", "no peanuts"],
    ]);
  });

  it("a round refunded IN FULL is still drawn, TAGGED — a refund is not a cancel (#360, CRITICAL 1)", async () => {
    // A full refund can be a goodwill comp at a table still eating: the KDS keeps the card, and the
    // page names the same dish the same way. lck/floor/paid-round-refund-hides-food — the old filter
    // to `paid` orders only: the group is empty; red. lck/floor/paid-round-refund-untagged — red.
    orders = [
      {
        id: "o-1",
        total_cents: 2140,
        created_at: ago(900_000),
        status: "refunded",
        refunded_cents: 2140,
        tip_cents: 0,
        cart_id: PAID,
      },
    ];
    paidRows = [line({ id: "main", cart_id: PAID, state: "in_progress" })];
    expect((await detail()).paidKitchen?.map((l) => [l.id, l.stage, l.refunded])).toEqual([
      ["main", "cooking", true],
    ]);
    expect(paidAsked).toEqual([PAID]);
    // a PAID round says nothing of a refund
    orders = [{ ...orders[0]!, status: "paid", refunded_cents: 0 }];
    expect((await detail()).paidKitchen?.map((l) => l.refunded)).toEqual([undefined]);
  });

  it("no paid round reads nothing; a failed read draws no group", async () => {
    paidRows = [line({ id: "main", state: "in_progress" })];
    expect((await detail()).paidKitchen).toEqual([]);
    expect(paidAsked).toBeNull();
    orders = [
      {
        id: "o-1",
        total_cents: 2140,
        created_at: ago(900_000),
        status: "paid",
        refunded_cents: 0,
        tip_cents: 0,
        cart_id: PAID,
      },
    ];
    paidReadFails = true;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await detail()).paidKitchen).toBeNull();
    spy.mockRestore();
  });

  it("past the cap the NEWEST dishes are kept, oldest first on the page, and the page says so (#360, CRITICAL 3)", async () => {
    // A long night's paid rounds: 105 dishes still on the track. Read oldest-first and capped, the
    // first 100 were kept and the round still cooking was the one dropped.
    // lck/floor/paid-round-keeps-the-oldest — red. lck/floor/paid-round-cap-unsaid — red.
    orders = [
      {
        id: "o-1",
        total_cents: 2140,
        created_at: ago(900_000),
        status: "paid",
        refunded_cents: 0,
        tip_cents: 0,
        cart_id: PAID,
      },
    ];
    const n = PAID_KITCHEN_CAP + 5;
    paidRows = Array.from({ length: n }, (_, i) =>
      line({
        id: `d-${String(i).padStart(3, "0")}`,
        cart_id: PAID,
        // created one second apart, oldest first; ISO strings sort by time
        created_at: new Date(Date.parse(ago(3_000_000)) + i * 1000).toISOString(),
      }),
    );
    const d = await detail();
    const ids = d.paidKitchen?.map((l) => l.id) ?? [];
    expect(ids).toHaveLength(PAID_KITCHEN_CAP);
    expect(ids[0]).toBe("d-005");
    expect(ids[ids.length - 1]).toBe(`d-${String(n - 1).padStart(3, "0")}`);
    expect(d.paidKitchenCapped).toBe(true);
    expect(d.paidRoundsCapped).toBe(false);
    // exactly at the cap: nothing was cut, nothing is said
    paidRows = paidRows.slice(0, PAID_KITCHEN_CAP);
    expect((await detail()).paidKitchenCapped).toBe(false);
  });

  it("an OLDER round still cooking is read though the record's page stopped at its cap (22 rounds, Codex on #360, P2)", async () => {
    // The paid round's cart ids came from the record's page (SETTLED_ORDER_CAP + 1 = 21 orders), so
    // the 22nd round back — its food still on the wok, and counted by the floor card — was never
    // read. lck/floor/paid-round-scope-capped-by-the-record — red.
    const ROUNDS = 22;
    orders = Array.from({ length: ROUNDS }, (_, i) => ({
      id: `o-${i}`,
      total_cents: 1200,
      created_at: ago(60_000 * (i + 1)), // newest first
      status: "paid",
      refunded_cents: 0,
      tip_cents: 0,
      cart_id: `c-paid-${i}`,
    }));
    // only the OLDEST round still has food in the kitchen
    paidRows = [line({ id: "oldest-main", cart_id: `c-paid-${ROUNDS - 1}`, state: "in_progress" })];
    const d = await detail();
    expect(d.paidKitchen?.map((l) => [l.id, l.stage])).toEqual([["oldest-main", "cooking"]]);
    expect(paidAsked).toContain(`c-paid-${ROUNDS - 1}`);
    expect(d.paidKitchenCapped).toBe(false);
  });

  it("past the scope read's own bound the group says it shows only the latest", async () => {
    // lck/floor/paid-round-scope-cap-unsaid — a session past 200 settled rounds passed a partial
    // scope off as the whole; red.
    orders = Array.from({ length: 202 }, (_, i) => ({
      id: `o-${i}`,
      total_cents: 1200,
      created_at: ago(60_000 * (i + 1)),
      status: "paid",
      refunded_cents: 0,
      tip_cents: 0,
      cart_id: `c-paid-${i}`,
    }));
    paidRows = [line({ id: "newest-main", cart_id: "c-paid-0", state: "in_progress" })];
    const d = await detail();
    expect(d.paidKitchen?.map((l) => l.id)).toEqual(["newest-main"]);
    // #360's blind pass (CRITICAL 2) — the ROUND read was capped, not the dish read: the group says
    // older rounds are not here, with no number. It said "Showing the latest 100 dishes" above this
    // one-dish list. lck/floor/paid-round-rounds-cap-unsaid · lck/floor/paid-round-caps-merged — red.
    expect(d.paidRoundsCapped).toBe(true);
    expect(d.paidKitchenCapped).toBe(false);
    const note = paidRoundCapNote(
      d.paidKitchen?.length ?? 0,
      d.paidKitchenCapped === true,
      d.paidRoundsCapped === true,
    );
    expect(note && fill(STAFF[note.key].en, note.vars ?? {}, "en")).toBe(
      "Older rounds aren’t listed here.",
    );
  });
});
