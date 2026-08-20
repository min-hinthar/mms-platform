import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * M87 — the merge key for an add is the diner who ADDED the sibling, not only the seat that currently
 * owns it.
 *
 * `by_seat` alone stopped being sufficient the moment the split-the-bill UI shipped: `assignLine`
 * rewrites it to whoever will PAY for a line. So after Ben adds a dish and Ana reassigns it onto her
 * own share, Ana adding the same dish matches Ben's row on `by_seat` and bumps its qty — while the
 * cart trigger pins `added_by` to Ben. Ana's addition then exists nowhere, and a dish she really
 * chose never reaches her history. (Codex round 2, P2.)
 *
 * ⚠️ This asserts the FILTERS, not the outcome, and that is deliberate: the shared harness's `eq`/`is`
 * are no-ops that return the same rows whatever is asked, so a behavioural assertion here would prove
 * the mock. Recording the filter calls is the strongest thing this runner can say about a PostgREST
 * query — the same reasoning behind the delivery repo's phantom-column guard.
 */

vi.mock("server-only", () => ({}));

let filters: { op: "eq" | "is"; col: string; val: unknown }[] = [];
let siblingRows: { id: string; modifiers: unknown }[] = [];
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: () => {
      const chain = {
        select: () => chain,
        eq: (col: string, val: unknown) => {
          filters.push({ op: "eq", col, val });
          return chain;
        },
        is: (col: string, val: unknown) => {
          filters.push({ op: "is", col, val });
          return chain;
        },
        then: (res: (v: { data: unknown; error: null }) => unknown) =>
          Promise.resolve({ data: siblingRows, error: null }).then(res),
      };
      return chain;
    },
    rpc: () => Promise.resolve({ data: "line-1", error: null }),
  }),
}));

const { insertOrIncLine } = await import("./order-lines");

const CART = "11111111-1111-4111-8111-111111111111";
const LINE = {
  menuItemId: "33333333-3333-4333-8333-333333333333",
  name: "Kyay-O",
  opts: [],
  unitPriceCents: 2000,
  taxCents: 195,
  fulfillment: "dinein" as const,
};

beforeEach(() => {
  filters = [];
  siblingRows = [];
});

describe("insertOrIncLine — the merge key includes the ADDER (M87)", () => {
  it("⚠️ a diner add scopes the sibling lookup to both by_seat AND added_by", () => {
    return insertOrIncLine(CART, LINE, "seat-ana").then(() => {
      expect(filters).toContainEqual({ op: "eq", col: "by_seat", val: "seat-ana" });
      expect(filters).toContainEqual({ op: "eq", col: "added_by", val: "seat-ana" });
    });
  });

  it("⚠️ a staff add (no seat) scopes BOTH columns with `is`, never `eq`", () => {
    // PostgREST needs `.is` for null; an `.eq(col, null)` matches nothing, which would silently turn
    // every staff add into a fresh line and quietly change the register's behaviour.
    return insertOrIncLine(CART, LINE, null).then(() => {
      expect(filters).toContainEqual({ op: "is", col: "by_seat", val: null });
      expect(filters).toContainEqual({ op: "is", col: "added_by", val: null });
      expect(filters.filter((f) => f.col === "added_by" && f.op === "eq")).toEqual([]);
    });
  });

  it("keeps the rest of the merge key — item, fulfillment, draft state and note-lessness", () => {
    // The M87 addition must NARROW the key, never replace part of it. Each of these guards a
    // documented rule: S4 (a for-here add must not merge into a to-go line), S2.1b (never fold into
    // a line the kitchen has started), W3b (a noted line never merges in either direction).
    return insertOrIncLine(CART, LINE, "seat-ana").then(() => {
      expect(filters).toContainEqual({ op: "eq", col: "cart_id", val: CART });
      expect(filters).toContainEqual({ op: "eq", col: "menu_item_id", val: LINE.menuItemId });
      expect(filters).toContainEqual({ op: "eq", col: "fulfillment", val: "dinein" });
      expect(filters).toContainEqual({ op: "eq", col: "state", val: "draft" });
      expect(filters).toContainEqual({ op: "is", col: "notes", val: null });
    });
  });
});
