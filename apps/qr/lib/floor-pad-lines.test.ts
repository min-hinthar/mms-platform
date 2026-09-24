import { beforeEach, describe, expect, it, vi } from "vitest";
/**
 * Phase 2c · pad — `getTableDetail` hands each open-cart line what the ORDER PAD's ticket reads: the
 * dish it is (the tile's confirmed ×N), where it goes (a to-go draft groups apart), and its Burmese
 * name and options (the ticket leads with them on a Burmese console). All advisory: a failed name
 * read renders English, never an outage.
 *
 * The fake answers like PostgREST — a row carries only the columns the query SELECTED — so a select
 * that dropped `modifier_option_ids` or `name_my` shows up as a missing Burmese half. Each case is
 * the one a `floor/pad-*` mutant in `scripts/verify-slice.mjs` turns red.
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
const MOHINGA = "11111111-1111-4111-8111-111111111111";
const CURRY = "22222222-2222-4222-8222-222222222222";
const EGG = "33333333-3333-4333-8333-333333333333";
const SPICY = "44444444-4444-4444-8444-444444444444";

let cartItemRows: Row[] = [];
let menuRows: Row[] = [];
let optionRows: Row[] = [];
let menuError: unknown = null;

function pick(row: Row, cols: string): Row {
  const out: Row = {};
  for (const c of cols.split(",").map((s) => s.trim())) if (c in row) out[c] = row[c];
  return out;
}

function tableApi(name: string) {
  let cols = "*";
  const api: Record<string, unknown> = {
    select(c: string) {
      cols = c;
      return api;
    },
    eq: () => api,
    in: () => api,
    order: () => api,
    limit: () => api,
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
            created_at: "2026-09-09T00:00:00.000Z",
          },
          error: null,
        });
      if (name === "qr_carts")
        return Promise.resolve({
          data: {
            id: "cart-1",
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
      if (name === "qr_cart_items")
        return resolve({ data: cartItemRows.map((r) => pick(r, cols)), error: null });
      if (name === "menu_items")
        return resolve(
          menuError
            ? { data: null, error: menuError }
            : { data: menuRows.map((r) => pick(r, cols)), error: null },
        );
      if (name === "modifier_options")
        return resolve({ data: optionRows.map((r) => pick(r, cols)), error: null });
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

const line = (over: Row): Row => ({
  id: "l",
  name: "Mohinga",
  qty: 1,
  unit_price_cents: 1200,
  by_seat: null,
  created_at: "2026-09-09T00:01:00.000Z",
  menu_item_id: MOHINGA,
  state: "draft",
  comped: false,
  notes: null,
  modifiers: [],
  modifier_option_ids: [],
  fulfillment: "dinein",
  ...over,
});

async function lines() {
  const r = await getTableDetail(SESSION);
  if (r.kind !== "detail") throw new Error(`expected a detail, got ${r.kind}`);
  return Object.fromEntries(r.detail.lines.map((l) => [l.id, l]));
}

beforeEach(() => {
  menuError = null;
  cartItemRows = [
    line({ id: "a", modifiers: ["Egg", "Extra spicy"], modifier_option_ids: [EGG, SPICY] }),
    line({ id: "b", name: "Beef Curry", menu_item_id: CURRY, fulfillment: "togo" }),
    line({ id: "c", name: "Tea", menu_item_id: "8850000000001", fulfillment: "grocery" }),
  ];
  menuRows = [
    { id: MOHINGA, is_sold_out: false, name_my: "မုန့်ဟင်းခါး" },
    // A romanisation stored as name_my is not Burmese — `catalogNameMy` refuses it.
    { id: CURRY, is_sold_out: true, name_my: "Beef Curry" },
  ];
  optionRows = [
    { id: EGG, name_my: "ကြက်ဥ" },
    { id: SPICY, name_my: null },
  ];
});

describe("getTableDetail — what the order pad's ticket reads per line", () => {
  it("the dish each line is — the tile's confirmed badge counts by it", async () => {
    const l = await lines();
    // MUTATION: `menuItemId: null` — every tile's ×N reads nothing, so a server re-adds a dish
    // already on the ticket; red.
    expect(l.a?.menuItemId).toBe(MOHINGA);
    expect(l.b?.menuItemId).toBe(CURRY);
    expect(l.c?.menuItemId).toBe("8850000000001");
  });

  it("where each line goes — a to-go draft is to-go, never read as dine-in", async () => {
    const l = await lines();
    // MUTATION: fulfillment hard-coded "dinein" — the to-go draft lands under "Not sent yet" and
    // staff are told to send a dish the Send will not fire; red.
    expect(l.a?.fulfillment).toBe("dinein");
    expect(l.b?.fulfillment).toBe("togo");
    expect(l.c?.fulfillment).toBe("grocery");
  });

  it("the Burmese name, validated: a romanised name_my is not Burmese", async () => {
    const l = await lines();
    expect(l.a?.nameMy).toBe("မုန့်ဟင်းခါး");
    // MUTATION: passing the raw name_my through — "Beef Curry" leads as "Burmese", set in Padauk; red.
    expect(l.b?.nameMy).toBeNull();
    expect(l.c?.nameMy).toBeNull();
    // The sold-out flag rides the SAME read, unchanged.
    expect(l.b?.soldOut).toBe(true);
  });

  it("the chosen options' Burmese, per slot (null where unknown)", async () => {
    const l = await lines();
    // MUTATION: dropping `modifier_option_ids` from the select — no slot can be paired, so every
    // option renders English under a Burmese console; red.
    expect(l.a?.modifiersMy).toEqual(["ကြက်ဥ", null]);
    expect(l.b?.modifiersMy).toEqual([]);
  });

  it("a failed name read is advisory: English everywhere, the table still reads", async () => {
    menuError = { message: "boom" };
    const l = await lines();
    expect(l.a?.nameMy).toBeNull();
    expect(l.a?.menuItemId).toBe(MOHINGA);
  });
});
