import { beforeEach, describe, expect, it, vi } from "vitest";
import { computeTotals, type TotalsLine } from "./totals-math";

/**
 * M187 (#275 six-lens audit) — the Scan & Go basket must show what the cart CHARGES.
 *
 * `/grocery`'s "Subtotal · before tax" (and the checkout CTA's accessible name, and the kiosk's
 * running list) sum `unitPriceCents * qty` over the lines `readGroceryLines` returns. The charge
 * authority sums the same lines through `computeTotals`, which excludes a voided OR comped line
 * (`totals-math.ts`: `lines.filter((i) => i.state !== "voided" && !i.comped)`). The read excluded
 * only `voided`, so a grocery line staff comped stayed in the basket at full price: the figure on
 * the phone read higher than the amount the card would be charged, by exactly the comped line.
 *
 * The fix is the charge authority's own predicate on the read — a comped line is not something the
 * basket charges, so it is not in the basket's list. The assertion that matters is the PARITY, not
 * the filter: the page's sum over the returned lines equals `computeTotals`'s subtotal over the
 * same cart rows, on a fixture where the comped line's price moves the answer.
 */

vi.mock("server-only", () => ({}));
vi.mock("@mms/db/schemas", () => ({
  scanInput: { parse: (v: unknown) => v },
  grocerySearchInput: { parse: (v: unknown) => v },
  cartViewInput: { parse: (v: unknown) => v },
}));
vi.mock("./authz", () => ({
  assertCartMember: () =>
    Promise.resolve({ uid: "u1", sessionId: "s1", locked: false, settling: false, mode: "scango" }),
}));
vi.mock("./rate", () => ({ assertMutationRate: () => Promise.resolve() }));
vi.mock("./cart-failure", () => ({ whyCartUnavailable: () => Promise.resolve("unreadable") }));
vi.mock("./order-lines", () => ({
  insertOrIncLine: () => Promise.resolve(),
  touchCart: () => Promise.resolve(),
}));
vi.mock("./media-url", () => ({ safeImageUrl: (u: string | null) => u }));

type Filter = { op: "eq" | "neq"; col: string; val: unknown };
let lineFilters: Filter[] = [];
let cartRows: Record<string, unknown>[] = [];

vi.mock("@mms/db/server", () => ({
  publicClient: () => ({}),
  serviceClient: () => ({
    from: (table: string) => {
      // Each `from` starts a fresh request; only the cart-line read is filtered by the harness.
      const mine: Filter[] = [];
      const chain = {
        select: () => chain,
        eq: (col: string, val: unknown) => {
          mine.push({ op: "eq", col, val });
          return chain;
        },
        neq: (col: string, val: unknown) => {
          mine.push({ op: "neq", col, val });
          return chain;
        },
        order: () => chain,
        in: () => chain,
        // Awaiting the builder sends the request: only predicates recorded by now narrow it. An
        // `eq` on a column a row does not model drops the row (fail-safe — a new filter cannot pass
        // for the wrong reason); a `neq` on one keeps it, exactly as `undefined !== x`.
        then: (res: (v: { data: unknown; error: null }) => unknown) => {
          if (table !== "qr_cart_items")
            return Promise.resolve({ data: CATALOG, error: null }).then(res);
          lineFilters = [...mine];
          const rows = cartRows.filter((r) =>
            mine.every((f) => (f.op === "eq" ? r[f.col] === f.val : r[f.col] !== f.val)),
          );
          return Promise.resolve({ data: rows, error: null }).then(res);
        },
      };
      return chain;
    },
  }),
}));

const { getGroceryLines } = await import("./grocery");

const CART = "00000000-0000-4000-8000-000000000187";

const CATALOG = [
  {
    barcode: "8850001000011",
    name_my: null,
    ebt_eligible: true,
    image_url: null,
    compare_at_cents: null,
  },
  {
    barcode: "8850001000028",
    name_my: null,
    ebt_eligible: false,
    image_url: null,
    compare_at_cents: null,
  },
  {
    barcode: "8850001000035",
    name_my: null,
    ebt_eligible: true,
    image_url: null,
    compare_at_cents: null,
  },
];

/** A grocery cart row modelling every column the read filters on, plus what it selects. */
const row = (over: Record<string, unknown>) => ({
  cart_id: CART,
  fulfillment: "grocery",
  state: "draft",
  comped: false,
  qty: 1,
  tax_cents: 0,
  ...over,
});

beforeEach(() => {
  lineFilters = [];
  cartRows = [
    // Charged: 2 × $3.50.
    row({
      id: "l-tea",
      menu_item_id: "8850001000011",
      name: "Tea leaf",
      qty: 2,
      unit_price_cents: 350,
    }),
    // Comped by staff: the kitchen-side line stays, the charge does not. $8.99 moves the answer.
    row({
      id: "l-balm",
      menu_item_id: "8850001000028",
      name: "Tiger balm",
      unit_price_cents: 899,
      comped: true,
    }),
    // Voided: already excluded before M187 — the control.
    row({
      id: "l-rice",
      menu_item_id: "8850001000035",
      name: "Rice",
      unit_price_cents: 500,
      state: "voided",
    }),
  ];
});

/** What the page shows: `app/grocery/page.tsx`'s `totalCents`, the same reduce over the lines. */
const shownSubtotal = (lines: { unitPriceCents: number; qty: number }[]) =>
  lines.reduce((a, l) => a + l.unitPriceCents * l.qty, 0);

/** What the charge authority bills for the same cart rows. */
const chargedSubtotal = () =>
  computeTotals(
    cartRows.map(
      (r): TotalsLine => ({
        qty: r.qty as number,
        unitPriceCents: r.unit_price_cents as number,
        taxCents: r.tax_cents as number,
        state: r.state as string,
        comped: r.comped as boolean,
        fulfillment: "grocery",
      }),
    ),
    0,
    0,
    0,
  ).subtotalCents;

describe("M187 — the grocery basket shows the chargeable base", () => {
  it("⚠️ THE DEFECT — the shown subtotal equals the charged subtotal, with a comped line in the cart", async () => {
    const r = await getGroceryLines(CART);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // The fixture separates the two readings: including the comped balm reads $15.99, the charge
    // authority bills $7.00.
    expect(chargedSubtotal()).toBe(700);
    expect(shownSubtotal(r.lines)).toBe(chargedSubtotal());
  });

  it("a comped line is not in the basket's list — nothing on it is chargeable or editable", async () => {
    const r = await getGroceryLines(CART);
    if (!r.ok) throw new Error("expected ok");
    expect(r.lines.map((l) => l.lineId)).toEqual(["l-tea"]);
  });

  it("the filter is the charge authority's own: `comped = false`, beside `state <> voided`", async () => {
    await getGroceryLines(CART);
    expect(lineFilters).toContainEqual({ op: "eq", col: "comped", val: false });
    expect(lineFilters).toContainEqual({ op: "neq", col: "state", val: "voided" });
  });

  it("an un-comped basket is unchanged — every charged line still shows, at its own price", async () => {
    cartRows = cartRows.map((r) => ({ ...r, comped: false }));
    const r = await getGroceryLines(CART);
    if (!r.ok) throw new Error("expected ok");
    expect(r.lines.map((l) => [l.lineId, l.qty, l.unitPriceCents])).toEqual([
      ["l-tea", 2, 350],
      ["l-balm", 1, 899],
    ]);
    expect(shownSubtotal(r.lines)).toBe(chargedSubtotal());
  });
});
