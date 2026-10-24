import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `insertOrIncLine`'s sibling read — the query that decides MERGE or FRESH LINE — on the two ways it
 * used to pick the wrong branch.
 *
 * T25 (Codex round 2 on #250) — the read did not filter `comped`, while `mms_cart_item_inc_qty`
 * EXCLUDES comped rows (a comped line is immutable, S2-audit B1) and still answers success on an
 * open cart (20260929000000 §2: "A capped or comped DRAFT stays the silent no-op it was"). So an add
 * that matched the diner's own comped draft line was a successful no-op: no line grew, no error, and
 * the optimistic "Added to your order" stood. The fix is at the source — a comped row is not a merge
 * target, so the add inserts a fresh line, which is what the diner asked for.
 *
 * M188 (#275 six-lens audit) — the read bound no `{ error }`. A transport failure made `siblings`
 * null, `dup` undefined, and the INSERT branch ran: a SECOND line for the same item. On /grocery the
 * Browse grid keys a card by barcode, so the shopper saw one of the two, tapped −, was told
 * "Removed", and was still charged for the twin. An unreadable merge target is an outage, never
 * "no sibling": nothing may be written on it.
 *
 * The harness applies every predicate RECORDED BEFORE the await to the fixture rows (the seat
 * suite's fail-safe semantics: a predicate on a column the row does not model drops the row, so a
 * new filter cannot pass for the wrong reason), and records which RPC ran, so each case asserts the
 * BRANCH, not only the query.
 */

vi.mock("server-only", () => ({}));

let filters: { op: "eq" | "is"; col: string; val: unknown }[] = [];
let siblingRows: Record<string, unknown>[] = [];
let siblingError: { message: string } | null = null;
let rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
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
        then: (res: (v: { data: unknown; error: unknown }) => unknown) => {
          if (siblingError) return Promise.resolve({ data: null, error: siblingError }).then(res);
          const sent = [...filters];
          const rows = siblingRows.filter((r) => sent.every((f) => r[f.col] === f.val));
          return Promise.resolve({ data: rows, error: null }).then(res);
        },
      };
      return chain;
    },
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return Promise.resolve({ data: "line-new", error: null });
    },
  }),
}));

const { insertOrIncLine, ItemUnreadableError } = await import("./order-lines");

const CART = "11111111-1111-4111-8111-111111111111";
const SEAT = "seat-ana";
const LINE = {
  menuItemId: "8851234567890",
  name: "Thanaka jar",
  opts: [],
  unitPriceCents: 450,
  taxCents: 0,
  fulfillment: "grocery" as const,
};

/** A draft sibling modelling every column the read filters on; override the one a case is about. */
const sibling = (over: Record<string, unknown> = {}) => ({
  id: "sibling-1",
  modifiers: [],
  cart_id: CART,
  menu_item_id: LINE.menuItemId,
  fulfillment: LINE.fulfillment,
  state: "draft",
  notes: null,
  by_seat: SEAT,
  added_by: SEAT,
  unit_price_cents: LINE.unitPriceCents,
  tax_cents: LINE.taxCents,
  comped: false,
  ...over,
});

beforeEach(() => {
  filters = [];
  siblingRows = [];
  siblingError = null;
  rpcCalls = [];
});

describe("insertOrIncLine — a COMPED sibling is not a merge target (T25)", () => {
  it("⚠️ an add matching the diner's own comped draft line INSERTS a fresh line", async () => {
    // Before T25 this bumped the comped row: `mms_cart_item_inc_qty` skips it (`not ci.comped`) and
    // answers success, so the add vanished with no error and no growth.
    siblingRows = [sibling({ id: "comped-line", comped: true })];
    await insertOrIncLine(CART, LINE, SEAT);
    expect(rpcCalls.map((c) => c.fn)).toEqual(["mms_cart_item_insert_if_open"]);
  });

  it("an UNCOMPED sibling still merges — the control that keeps the case above honest", async () => {
    siblingRows = [sibling({ id: "plain-line" })];
    await insertOrIncLine(CART, LINE, SEAT);
    expect(rpcCalls.map((c) => c.fn)).toEqual(["mms_cart_item_inc_qty"]);
    expect(rpcCalls[0]!.args).toMatchObject({ p_id: "plain-line" });
  });

  it("with both, the add grows the UNCOMPED line, never the comped one", async () => {
    siblingRows = [sibling({ id: "comped-line", comped: true }), sibling({ id: "plain-line" })];
    await insertOrIncLine(CART, LINE, SEAT);
    expect(rpcCalls.map((c) => c.fn)).toEqual(["mms_cart_item_inc_qty"]);
    expect(rpcCalls[0]!.args).toMatchObject({ p_id: "plain-line" });
  });

  it("the staff path (no seat) is filtered the same way — the register and reorder reach here too", async () => {
    siblingRows = [
      sibling({ id: "comped-staff-line", by_seat: null, added_by: null, comped: true }),
    ];
    await insertOrIncLine(CART, LINE, null);
    expect(rpcCalls.map((c) => c.fn)).toEqual(["mms_cart_item_insert_if_open"]);
  });

  it("filters with `eq(false)` — `comped` is `not null default false`, so `.is` would be wrong", async () => {
    await insertOrIncLine(CART, LINE, SEAT);
    expect(filters).toContainEqual({ op: "eq", col: "comped", val: false });
    expect(filters.filter((f) => f.col === "comped" && f.op === "is")).toEqual([]);
  });
});

describe("insertOrIncLine — an unreadable sibling read writes NOTHING (M188)", () => {
  it("⚠️ THE DEFECT — a failed read must not fall through to the insert (a second line)", async () => {
    siblingError = { message: "fetch failed" };
    await expect(insertOrIncLine(CART, LINE, SEAT)).rejects.toBeInstanceOf(ItemUnreadableError);
    expect(rpcCalls).toEqual([]);
  });

  it("…nor bump anything, with a scan id riding the add (the offline queue's replay)", async () => {
    siblingError = { message: "fetch failed" };
    siblingRows = [sibling()];
    await expect(
      insertOrIncLine(CART, LINE, SEAT, 1, "22222222-2222-4222-8222-222222222222"),
    ).rejects.toBeInstanceOf(ItemUnreadableError);
    expect(rpcCalls).toEqual([]);
  });

  it("the error names the item it could not place (diagnosable without the message)", async () => {
    siblingError = { message: "fetch failed" };
    await expect(insertOrIncLine(CART, LINE, SEAT)).rejects.toMatchObject({
      menuItemId: LINE.menuItemId,
    });
  });

  it("a read that SUCCEEDS with no sibling still inserts — the honest empty case is untouched", async () => {
    await insertOrIncLine(CART, LINE, SEAT);
    expect(rpcCalls.map((c) => c.fn)).toEqual(["mms_cart_item_insert_if_open"]);
  });
});
