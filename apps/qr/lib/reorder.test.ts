import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * M119 (e) — a failed availability read reported the WHOLE MENU unavailable.
 *
 *     const { data: itemRows } = foodIds.length
 *       ? await db.from("menu_items").select("id,is_active,is_sold_out").in("id", foodIds)
 *       : { data: [] };
 *     const itemById = new Map((itemRows ?? []).map((i) => [i.id, i]));
 *
 * The `{ error }` was DISCARDED — the ternary's else-branch type does not even carry an `error` key —
 * so a failed read left `itemRows` null and `itemById` EMPTY. An empty map does not mean "nothing is
 * available"; it means we never asked. Every food line then missed the lookup, was skipped as `gone`,
 * and the diner got an empty cart plus one false statement per dish: "<dish> isn't available today".
 *
 * ── Why refusing is right here, and not over-blocking ──────────────────────────────────────────
 * The alternative is to skip the availability check and add everything — which re-adds a delisted or
 * sold-out dish, exactly what W23a's server-side half exists to prevent. A reorder is a convenience
 * the diner can retry; selling them a pulled dish is not recoverable that cheaply. So the whole
 * reorder refuses with the outage sentence rather than half-succeeding on a fiction.
 *
 * Note the sibling read in this same function was already fixed for this shape — the comment above
 * it records that M108 deleted a session-mode read which "discarded its error".
 */

vi.mock("server-only", () => ({}));

let itemRows: { id: string; is_active: boolean; is_sold_out: boolean }[] | null = null;
let itemsError: { message: string } | null = null;
let orderLines: Record<string, unknown>[] = [];

const DISH = "cccccccc-0000-4000-8000-000000000119";

vi.mock("@mms/db/schemas", () => ({
  reorderInput: { safeParse: (v: unknown) => ({ success: true, data: v }) },
}));
vi.mock("./authz", () => ({
  assertCartMember: () =>
    Promise.resolve({ uid: "u1", sessionId: "s1", mode: "dinein", locked: false, settling: false }),
  AuthzError: class extends Error {},
}));
vi.mock("./rate", () => ({
  withinMutationRate: () => Promise.resolve(true),
  assertMutationRate: () => Promise.resolve(),
}));
vi.mock("./order-lines", () => ({
  insertOrIncLine: () => Promise.resolve({ ok: true }),
  touchCart: () => Promise.resolve(),
  priceItem: () =>
    Promise.resolve({
      ok: true,
      name: "Mohinga",
      unitPriceCents: 1200,
      taxCents: 0,
      category: "hot_prepared",
    }),
}));
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: () =>
          Promise.resolve({ data: { id: "o1", earned_by: "u1", status: "paid" }, error: null }),
        in: () =>
          Promise.resolve(
            table === "menu_items"
              ? { data: itemRows, error: itemsError }
              : { data: [], error: null },
          ),
        then: (r: (v: { data: unknown; error: unknown }) => unknown) =>
          Promise.resolve({ data: orderLines, error: null }).then(r),
      };
      return chain;
    },
  }),
}));

const mod = await import("./reorder");

beforeEach(() => {
  itemRows = [{ id: DISH, is_active: true, is_sold_out: false }];
  itemsError = null;
  orderLines = [
    {
      menu_item_id: DISH,
      name: "Mohinga",
      qty: 1,
      modifiers: [],
      modifier_option_ids: [],
      notes: null,
    },
  ];
});

describe("M119e — an unreadable availability read is not a sold-out menu", () => {
  it("THE DEFECT — a failed read must refuse, not report every dish unavailable", async () => {
    itemRows = null;
    itemsError = { message: "transport failure" };
    const res = (await mod.reorderOrder({ orderId: "o1", cartId: "c1" })) as
      | { ok: true; skipped: { reason: string }[] }
      | { ok: false; error: string };
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("trouble on our end");
  });

  it("a genuinely sold-out dish is still reported sold_out — the honest case is untouched", async () => {
    itemRows = [{ id: DISH, is_active: true, is_sold_out: true }];
    const res = (await mod.reorderOrder({ orderId: "o1", cartId: "c1" })) as
      | { ok: true; skipped: { reason: string }[] }
      | { ok: false; error: string };
    // ANTI-DEGENERACY: this case is only meaningful if the fixture reaches the availability logic at
    // all. The first draft of this file did NOT — the order-lookup mock was missing `earned_by` and
    // `status`, so both cases bailed at "That order isn't available to reorder." and the defect case
    // was red for a reason that had nothing to do with the read it names.
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.skipped.map((s) => s.reason)).toContain("sold_out");
  });
});
