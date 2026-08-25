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
 * ── The first fix REFUSED the whole reorder, and Codex was right that it over-blocked ──────────
 * `priceItem` re-reads `is_active,is_sold_out` on every single add and throws, so the batch read is
 * an OPTIMISATION plus a source of precise skip reasons — never the only thing between a diner and a
 * delisted dish. Aborting every otherwise-valid dish to re-check something already checked one layer
 * down is cost with no cover. And the refusal advertised "try again in a moment" into a screen with
 * no way to try again: `MenuBrowser` sets `reorderRan.current = true` and strips the `reorder` URL
 * param BEFORE calling, so the effect never re-runs.
 *
 * So the fallback proceeds and lets the per-line gate decide — with the reason riding the throw
 * (`ItemUnsellableError`), because otherwise a sold-out dish on that path comes back "needs_choices"
 * and we would have swapped a wrong outcome for a wrong sentence.
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
/**
 * Hoisted: `vi.mock` factories are lifted above every top-level statement, and this one uses the
 * class as a VALUE. The mutable fixtures below do not need hoisting — they are only dereferenced
 * inside the factory's function bodies, at call time.
 */
const { ItemUnsellableError } = vi.hoisted(() => {
  class ItemUnsellableError extends Error {
    reason: "sold_out" | "gone";
    constructor(message: string, reason: "sold_out" | "gone") {
      super(message);
      this.name = "ItemUnsellableError";
      this.reason = reason;
    }
  }
  return { ItemUnsellableError };
});

/** What `priceItem` should do when called — the per-line gate the fallback now leans on. */
let priceItemThrows: "sold_out" | "gone" | "cardinality" | null = null;
let priceItemCalls = 0;

vi.mock("./order-lines", () => ({
  ItemUnsellableError,
  insertOrIncLine: () => Promise.resolve({ ok: true }),
  touchCart: () => Promise.resolve(),
  priceItem: () => {
    priceItemCalls += 1;
    if (priceItemThrows === "cardinality") throw new Error("This item needs a required choice");
    if (priceItemThrows) throw new ItemUnsellableError("unsellable", priceItemThrows);
    return Promise.resolve({
      name: "Mohinga",
      unitPriceCents: 1200,
      category: "hot_prepared",
      opts: [],
      optionIds: [],
    });
  },
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
  priceItemThrows = null;
  priceItemCalls = 0;
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
  it("THE DEFECT — a failed read must not report every dish unavailable", async () => {
    itemRows = null;
    itemsError = { message: "transport failure" };
    const res = (await mod.reorderOrder({ orderId: "o1", cartId: "c1" })) as
      | { ok: true; added: number; skipped: { reason: string }[] }
      | { ok: false; error: string };
    expect(res.ok).toBe(true);
    if (res.ok) {
      // The dish is genuinely available, so it must be ADDED — not skipped as "gone".
      expect(res.skipped.map((s) => s.reason)).not.toContain("gone");
      expect(res.added).toBe(1);
    }
  });

  it("the fallback still refuses a dish that is actually gone — priceItem is the real gate", async () => {
    itemRows = null;
    itemsError = { message: "transport failure" };
    priceItemThrows = "sold_out";
    const res = (await mod.reorderOrder({ orderId: "o1", cartId: "c1" })) as
      | { ok: true; added: number; skipped: { reason: string }[] }
      | { ok: false; error: string };
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.added).toBe(0);
      // …and with the TRUE reason. Before `ItemUnsellableError` carried it, this path reported
      // `needs_choices` — "tap to choose" for a dish nobody can have.
      expect(res.skipped.map((s) => s.reason)).toContain("sold_out");
      expect(res.skipped.map((s) => s.reason)).not.toContain("needs_choices");
    }
    expect(priceItemCalls).toBeGreaterThan(0); // the gate actually ran
  });

  it("a cardinality failure is still needs_choices — the distinction is real, not cosmetic", async () => {
    itemRows = null;
    itemsError = { message: "transport failure" };
    priceItemThrows = "cardinality";
    const res = (await mod.reorderOrder({ orderId: "o1", cartId: "c1" })) as
      | { ok: true; skipped: { reason: string }[] }
      | { ok: false; error: string };
    if (res.ok) expect(res.skipped.map((s) => s.reason)).toContain("needs_choices");
  });

  it("a genuinely sold-out dish is still reported sold_out on the NORMAL path", async () => {
    itemRows = [{ id: DISH, is_active: true, is_sold_out: true }];
    const res = (await mod.reorderOrder({ orderId: "o1", cartId: "c1" })) as
      | { ok: true; skipped: { reason: string }[] }
      | { ok: false; error: string };
    // ANTI-DEGENERACY: only meaningful if the fixture reaches the availability logic at all. The
    // first draft of this file did NOT — the order-lookup mock lacked `earned_by`/`status`, so both
    // cases bailed at "That order isn't available to reorder."
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.skipped.map((s) => s.reason)).toContain("sold_out");
  });
});
