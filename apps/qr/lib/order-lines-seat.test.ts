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
 * M104 extends the same idea to PRICE (see the block at the end of this file), and reuses this
 * harness for the same reason.
 *
 * ⚠️ THE FILTER-ONLY ASSERTIONS ARE NOT ENOUGH ON THEIR OWN, and the first version of this file said
 * they were. Its note read: "a behavioural assertion here would prove the mock". That was true of the
 * mock AS THEN WRITTEN — `eq`/`is` were no-ops and `rpc` recorded nothing — but it is a statement
 * about the harness, not a law. Adversarial review demonstrated the gap by building the mutant: move
 * the price predicate BELOW `await siblingQuery` and every filter assertion still passes, because
 * `filters` is inspected after the function returns and cannot tell "applied to the query" from
 * "applied after the query ran". In real postgrest-js the request is already sent, so that mutant
 * reintroduces M104 in full with a green suite. It is not an exotic edit — it is what a re-order or a
 * merge-conflict resolution produces.
 *
 * So the harness now does two more things, and both are load-bearing:
 *   · `then` applies the filters RECORDED SO FAR to `siblingRows` — the query is "sent" there, so a
 *     predicate added afterwards narrows nothing, exactly as in the real client. A filter is applied
 *     only to columns the fixture row actually declares, so an existing fixture opts in rather than
 *     being silently excluded by a column it never modelled.
 *   · `rpc` records which function was called, so a test can assert the BRANCH — merge or fresh line.
 *
 * The filter assertions stay: they localise a failure to the predicate. The behavioural ones say it
 * still does its job where it is written.
 */

vi.mock("server-only", () => ({}));

let filters: { op: "eq" | "is"; col: string; val: unknown }[] = [];
let siblingRows: Record<string, unknown>[] = [];
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
        // Awaiting the builder IS sending the request, so only the filters recorded by now can
        // narrow the result — a predicate appended afterwards is dead code, here and in postgrest-js.
        then: (res: (v: { data: unknown; error: null }) => unknown) => {
          const sent = [...filters];
          const rows = siblingRows.filter((r) =>
            sent.every((f) => !(f.col in r) || r[f.col] === f.val),
          );
          return Promise.resolve({ data: rows, error: null }).then(res);
        },
      };
      return chain;
    },
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return Promise.resolve({ data: "line-1", error: null });
    },
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
  rpcCalls = [];
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

describe("insertOrIncLine — the merge key includes the PRICE (M104)", () => {
  it("⚠️ scopes the sibling lookup to the price `priceItem` just re-derived", () => {
    // Without this, `line.unitPriceCents` is computed and then DISCARDED on the merge branch:
    // `mms_cart_item_inc_qty` carries no price and only bumps qty. A manager raising a price
    // mid-visit would leave the diner's second add charged at the first add's snapshot, and a
    // manager LOWERING one would charge more than the menu is showing.
    return insertOrIncLine(CART, LINE, "seat-ana").then(() => {
      expect(filters).toContainEqual({
        op: "eq",
        col: "unit_price_cents",
        val: LINE.unitPriceCents,
      });
    });
  });

  // ── The behavioural pair. These are what survive a MISPLACED predicate, not merely a missing one.
  //
  // A "never merges" assertion alone is passed by code that never merges at all, so the two run
  // together: same fixture, same call, one column different, opposite branch. That is also the only
  // thing here that separates the price predicate from the ones above it.
  it("⚠️ a sibling quoted at a DIFFERENT price is NOT merged into — a fresh line is inserted", async () => {
    siblingRows = [{ id: "quoted-before-the-edit", modifiers: [], unit_price_cents: 300 }];
    await insertOrIncLine(CART, LINE, "seat-ana");
    expect(rpcCalls.map((c) => c.fn)).not.toContain("mms_cart_item_inc_qty");
    expect(rpcCalls.map((c) => c.fn)).toContain("mms_cart_item_insert_if_open");
  });

  it("a sibling at the SAME price still merges — the control that keeps the test above honest", async () => {
    siblingRows = [{ id: "same-price-line", modifiers: [], unit_price_cents: LINE.unitPriceCents }];
    await insertOrIncLine(CART, LINE, "seat-ana");
    expect(rpcCalls.map((c) => c.fn)).toContain("mms_cart_item_inc_qty");
    expect(rpcCalls.find((c) => c.fn === "mms_cart_item_inc_qty")?.args).toMatchObject({
      p_id: "same-price-line",
    });
    expect(rpcCalls.map((c) => c.fn)).not.toContain("mms_cart_item_insert_if_open");
  });

  it("⚠️ the STAFF path is not exempt either — the register, kiosk and reorder all reach this function", async () => {
    // `menu-price.ts` promises the new price takes effect on the next add "everywhere at once (diner
    // menu, register, kiosk, reorder)". The predicate is unconditional, so this shares a statement
    // with the diner arm — but it exercises the OTHER `by_seat`/`added_by` branch around it, where a
    // future seat-scoped refactor is exactly where the promise would quietly break for one surface.
    siblingRows = [{ id: "staff-line-before-the-edit", modifiers: [], unit_price_cents: 300 }];
    await insertOrIncLine(CART, LINE, null);
    expect(filters).toContainEqual({
      op: "eq",
      col: "unit_price_cents",
      val: LINE.unitPriceCents,
    });
    expect(rpcCalls.map((c) => c.fn)).not.toContain("mms_cart_item_inc_qty");
  });

  it("uses `eq` and never `is` for the price — it is `not null` by column definition", () => {
    // The mirror of the by_seat/added_by rule one block up, and the opposite conclusion:
    // `unit_price_cents` is `not null` since `create table` with no default, so `.is` would be wrong
    // here for exactly the reason `.eq` is wrong there. Three adjacent predicates, three nullability
    // stories — the same trap M98's migration header names on the SQL side.
    return insertOrIncLine(CART, LINE, "seat-ana").then(() => {
      expect(filters.filter((f) => f.col === "unit_price_cents" && f.op === "is")).toEqual([]);
    });
  });
});
