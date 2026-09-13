import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadLineNames } from "./line-names";

/**
 * F18's loader, falsified by what it ASKS and what it ANSWERS — the two things a copy drifts on.
 * The mock records every `.from(table).in(col, ids)` and answers from per-table fixtures, with a
 * per-table error switch so the advisory posture is pinned table by table, not as one flag.
 */
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const O1 = "33333333-3333-4333-8333-333333333333";
const O2 = "44444444-4444-4444-8444-444444444444";

type Q = { table: string; col: string; ids: unknown[] };
let asked: Q[] = [];
let rows: Record<string, unknown[]> = {};
let fails: Record<string, { message: string } | undefined> = {};

const db = {
  from: (table: string) => ({
    select: () => ({
      in: (col: string, ids: unknown[]) => {
        asked.push({ table, col, ids });
        const error = fails[table] ?? null;
        return Promise.resolve({ data: error ? null : (rows[table] ?? []), error });
      },
    }),
  }),
};
// The loader takes the service client's type; the mock implements the two calls it makes.
const client = db as unknown as Parameters<typeof loadLineNames>[0];

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  asked = [];
  rows = {};
  fails = {};
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errorSpy.mockRestore());

describe("loadLineNames — one loader for the Burmese half of a line", () => {
  it("partitions dish uuids from grocery barcodes BEFORE the IN-lists, and asks each table once", async () => {
    // MUTATION: put the barcode into the uuid list → PostgREST rejects the whole menu read and
    // every dish on the board loses its Burmese, not the one grocery line.
    rows = {
      menu_items: [{ id: A, name_my: "မုန့်ဟင်းခါး" }],
      grocery_items: [{ barcode: "0123456789012", name_my: "ငါးပိ" }],
      modifier_options: [{ id: O1, name_my: "အစပ်" }],
    };
    const names = await loadLineNames(
      client,
      [
        { menu_item_id: A, modifier_option_ids: [O1] },
        { menu_item_id: "0123456789012", modifier_option_ids: null },
        { menu_item_id: A, modifier_option_ids: [O1, "not-a-uuid"] },
      ],
      { tag: "t" },
    );
    expect(asked).toEqual([
      { table: "menu_items", col: "id", ids: [A] },
      { table: "grocery_items", col: "barcode", ids: ["0123456789012"] },
      { table: "modifier_options", col: "id", ids: [O1] },
    ]);
    expect(names.nameMyByRef.get(A)).toBe("မုန့်ဟင်းခါး");
    expect(names.nameMyByRef.get("0123456789012")).toBe("ငါးပိ");
    expect(names.optionNameMy.get(O1)).toBe("အစပ်");
  });

  it("asks nothing for an empty partition — no IN-list with zero ids reaches the DB", async () => {
    await loadLineNames(client, [{ menu_item_id: A }], { tag: "t" });
    expect(asked.map((q) => q.table)).toEqual(["menu_items"]);
  });

  it('`menu: "skip"` reads options only — the KDS supplies its own gated menu map', async () => {
    rows = { modifier_options: [{ id: O2, name_my: "အချို" }] };
    const names = await loadLineNames(
      client,
      [{ menu_item_id: A, modifier_option_ids: [O2] }, { menu_item_id: "0123456789012" }],
      { tag: "kitchen", menu: "skip" },
    );
    expect(asked.map((q) => q.table)).toEqual(["modifier_options"]);
    expect(names.nameMyByRef.size).toBe(0);
    expect(names.optionNameMy.get(O2)).toBe("အချို");
  });

  it("a failed table is ADVISORY: logged by table, that half empty, the other halves intact", async () => {
    // MUTATION: throw or return nothing on error → a label outage freezes a board that could have
    // rendered English, the over-blocking direction P1 refused.
    rows = {
      menu_items: [{ id: A, name_my: "မုန့်ဟင်းခါး" }],
      modifier_options: [{ id: O1, name_my: "အစပ်" }],
    };
    fails = { grocery_items: { message: "connection reset" } };
    const names = await loadLineNames(
      client,
      [{ menu_item_id: A, modifier_option_ids: [O1] }, { menu_item_id: "0123456789012" }],
      { tag: "expo" },
    );
    expect(names.nameMyByRef.get(A)).toBe("မုန့်ဟင်းခါး");
    expect(names.nameMyByRef.has("0123456789012")).toBe(false);
    expect(names.optionNameMy.get(O1)).toBe("အစပ်");
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(String(errorSpy.mock.calls[0]?.[0])).toContain(
      "[expo] grocery_items name_my read failed",
    );
  });

  it("a failed read never poisons the map with its null data — absent, not `undefined → EN` by accident", async () => {
    fails = { menu_items: { message: "boom" }, modifier_options: { message: "boom" } };
    const names = await loadLineNames(client, [{ menu_item_id: A, modifier_option_ids: [O1] }], {
      tag: "t",
    });
    expect(names.nameMyByRef.size).toBe(0);
    expect(names.optionNameMy.size).toBe(0);
    expect(errorSpy).toHaveBeenCalledTimes(2);
  });

  it("a catalog row whose name_my is null is recorded as null — a known absence, not a missing read", async () => {
    rows = { menu_items: [{ id: B, name_my: null }] };
    const names = await loadLineNames(client, [{ menu_item_id: B }], { tag: "t" });
    expect(names.nameMyByRef.has(B)).toBe(true);
    expect(names.nameMyByRef.get(B)).toBeNull();
  });
});
