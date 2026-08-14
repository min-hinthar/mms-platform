import { describe, expect, it } from "vitest";
import {
  fulfillKind,
  groupByMonth,
  itemCount,
  leadImage,
  lineSummary,
  reorderLink,
} from "./order-history-view";

const line = (
  fulfillment: string,
  over: Partial<{ qty: number; name: string; imageUrl: string | null }> = {},
) => ({
  qty: over.qty ?? 1,
  name: over.name ?? "Mohinga",
  fulfillment,
  imageUrl: over.imageUrl ?? null,
});

describe("groupByMonth", () => {
  it("groups at the LA clock and keeps the global stagger index", () => {
    // 2026-07-01T02:00Z is June 30 in LA — it must land in the June group, not July.
    const groups = groupByMonth([
      { createdAt: "2026-07-04T20:00:00Z" },
      { createdAt: "2026-07-01T02:00:00Z" },
      { createdAt: "2026-06-13T22:00:00Z" },
    ]);
    expect(groups.map((g) => g.label)).toEqual(["July 2026", "June 2026"]);
    expect(groups[0]?.orders.map((o) => o.gIndex)).toEqual([0]);
    expect(groups[1]?.orders.map((o) => o.gIndex)).toEqual([1, 2]);
  });
});

describe("fulfillKind / itemCount / lineSummary", () => {
  it("grocery beats togo; plain dine-in has no chip", () => {
    expect(fulfillKind([line("togo"), line("grocery")])).toBe("grocery");
    expect(fulfillKind([line("dinein"), line("togo")])).toBe("togo");
    expect(fulfillKind([line("dinein")])).toBeNull();
  });

  it("counts units and composes the summary; a failed items read keeps the row's shape", () => {
    const lines = [line("dinein", { qty: 2 }), line("dinein", { qty: 1, name: "Milk tea" })];
    expect(itemCount(lines)).toBe(3);
    expect(lineSummary(lines)).toBe("2× Mohinga · 1× Milk tea");
    expect(lineSummary([])).toBe("—");
  });
});

describe("leadImage", () => {
  it("takes the first line that HAS a photo, else null (the designed placeholder)", () => {
    expect(leadImage([line("dinein"), line("dinein", { imageUrl: "/img/a.jpg" })])).toBe(
      "/img/a.jpg",
    );
    expect(leadImage([line("dinein")])).toBeNull();
  });
});

describe("reorderLink (J19 — the mode stops being a guess)", () => {
  const base = { id: "abc 123", pickupSlot: null, tableNumber: null };

  it("routes a pure-grocery order to the market, not a reorder that returns nothing", () => {
    expect(reorderLink({ ...base, lines: [line("grocery"), line("grocery")] })).toEqual({
      kind: "market",
      href: "/grocery",
    });
  });

  it("a TABLE-STAMPED pure-grocery order is still pure grocery (review LOW-4)", () => {
    // modeFromOrder's tableNumber signal would read this as dine-in, but reorderOrder skips every
    // grocery line — the market is the only destination that doesn't re-run an empty reorder.
    expect(reorderLink({ ...base, tableNumber: 7, lines: [line("grocery")] })).toEqual({
      kind: "market",
      href: "/grocery",
    });
  });

  it("routes every food order through the pickup door — dine-in is DEMOTED, never a phantom table", () => {
    const dinein = reorderLink({ ...base, lines: [line("dinein")] });
    expect(dinein.kind).toBe("reorder");
    expect(dinein.href).toBe("/menu?reorder=abc%20123&mode=pickup");
    // A registered table number is a dine-in signal — still demoted to pickup here.
    const tabled = reorderLink({ ...base, tableNumber: 7, lines: [line("togo")] });
    expect(tabled.href).toContain("mode=pickup");
  });

  it("keeps a scheduled pickup order on the pickup door (slot picker in the flow)", () => {
    const r = reorderLink({ ...base, pickupSlot: "2026-08-14T19:30:00Z", lines: [line("togo")] });
    expect(r).toEqual({ kind: "reorder", href: "/menu?reorder=abc%20123&mode=pickup" });
  });

  it("mixed grocery + food reorders the food (grocery lines get the server's honest skip)", () => {
    const r = reorderLink({ ...base, lines: [line("grocery"), line("togo")] });
    expect(r.kind).toBe("reorder");
  });

  it("a failed items read (no lines) still offers the reorder — the server re-reads the order", () => {
    // `reorderOrder` works from qr_order_items server-side; an empty DISPLAY read must not
    // downgrade a food order's link to the market.
    expect(reorderLink({ ...base, lines: [] }).kind).toBe("reorder");
  });
});
