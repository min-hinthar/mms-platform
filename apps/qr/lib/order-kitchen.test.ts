import { describe, expect, it } from "vitest";
import {
  bagKitchen,
  kitchenPending,
  kitchenRereadDelayMs,
  kitchenRows,
  pickupKitchenLine,
  railKitchenSub,
  type KitchenLine,
} from "./order-kitchen";
import { KDS_UNDO_MS } from "./kds-undo";
import { GRACE_REREAD_MARGIN_MS } from "./live-pass";
import { TRACK } from "./i18n/track";

/**
 * Lifecycle audit (2026-10-13) — /track's post-order kitchen words come from the PAID CART'S LINES,
 * never from `togo_status` (lit at payment) and never from this phone's clock. The stage of each line
 * is lib/kitchen-track.ts's; these pin what /track may CLAIM from them: A (the settled table's dishes),
 * B (the bag: started, done), G (the rail's step 1, which read "Cooking" from the moment of payment).
 */
const NOW = "2026-10-13T19:00:00.000Z";
const NOW_MS = Date.parse(NOW);
const ago = (ms: number) => new Date(NOW_MS - ms).toISOString();
const ahead = (ms: number) => new Date(NOW_MS + ms).toISOString();

function line(over: Partial<KitchenLine> & { id: string }): KitchenLine {
  return {
    name: "Mohinga",
    qty: 1,
    lineState: "fired",
    fireAt: ago(60_000),
    bumpedAt: null,
    fulfillment: "dinein",
    ...over,
  };
}

describe("kitchenRows — A, the settled table's dishes", () => {
  it("lists every food line on the track, in CART order, each at its stage on the read's clock", () => {
    const rows = kitchenRows(
      [
        line({ id: "a", name: "Tea", lineState: "served", bumpedAt: ago(KDS_UNDO_MS + 1) }),
        line({ id: "b", name: "Mohinga", qty: 2, lineState: "in_progress" }),
        line({ id: "c", name: "Rice" }),
      ],
      NOW,
    );
    expect(rows.map((r) => [r.id, r.stage])).toEqual([
      ["a", "served"],
      ["b", "cooking"],
      ["c", "sent"],
    ]);
    expect(rows[1]).toMatchObject({ name: "Mohinga", qty: 2 });
  });

  it("keeps grocery, voided lines and drafts OFF the list (nothing cooks there; a draft was never sent)", () => {
    const rows = kitchenRows(
      [
        line({ id: "g", fulfillment: "grocery" }),
        line({ id: "v", lineState: "voided" }),
        // A draft reads "unsent" on the track — RED if it leaks onto a paid table's list as a dish
        // "Not sent yet": the settle fired every food draft (`mms_fire_pending_food`).
        line({ id: "d", lineState: "draft", fireAt: null }),
        line({ id: "f" }),
      ],
      NOW,
    );
    expect(rows.map((r) => r.id)).toEqual(["f"]);
  });

  it("reads a bump inside Mom's undo window as still COOKING — never Served on a take-back", () => {
    const rows = kitchenRows([line({ id: "a", lineState: "served", bumpedAt: ago(1000) })], NOW);
    expect(rows[0]?.stage).toBe("cooking");
  });

  it("is pending while any dish is not yet Served, and done once all are", () => {
    const served = line({ id: "a", lineState: "served", bumpedAt: ago(KDS_UNDO_MS) });
    expect(kitchenPending(kitchenRows([served, line({ id: "b" })], NOW))).toBe(true);
    // A dish on the wok is still with the kitchen (RED if only "sent" counted as pending).
    expect(
      kitchenPending(kitchenRows([served, line({ id: "c", lineState: "in_progress" })], NOW)),
    ).toBe(true);
    expect(kitchenPending(kitchenRows([served], NOW))).toBe(false);
  });
});

describe("bagKitchen — B, the to-go bag from its own food lines", () => {
  const box = (over: Partial<KitchenLine> & { id: string }) =>
    line({ fulfillment: "togo", ...over });

  it("is DONE only when every to-go dish is Served past the undo window", () => {
    expect(
      bagKitchen(
        [
          box({ id: "a", lineState: "served", bumpedAt: ago(KDS_UNDO_MS + 1) }),
          box({ id: "b", lineState: "served", bumpedAt: ago(KDS_UNDO_MS + 1) }),
        ],
        NOW,
      ),
    ).toBe("done");
  });

  it("is COOKING once the kitchen has started it — a dish cooking, or one out while another waits", () => {
    expect(bagKitchen([box({ id: "a", lineState: "in_progress" }), box({ id: "b" })], NOW)).toBe(
      "cooking",
    );
    // RED if "started" is the roll-up's least-advanced stage: one dish out and one still queued is a
    // kitchen that has begun, never "Sent to kitchen".
    expect(
      bagKitchen(
        [box({ id: "a", lineState: "served", bumpedAt: ago(KDS_UNDO_MS + 1) }), box({ id: "b" })],
        NOW,
      ),
    ).toBe("cooking");
  });

  it("is SENT while every dish is fired and nobody has tapped Start", () => {
    expect(bagKitchen([box({ id: "a" }), box({ id: "b" })], NOW)).toBe("sent");
  });

  it("says nothing for a HELD pickup — its Sends sit in the future (`fire_at = slot − prep`)", () => {
    expect(bagKitchen([box({ id: "a", fireAt: ahead(3 * 60 * 60 * 1000) })], NOW)).toBeNull();
  });

  it("ignores the dine-in plates and the groceries on the same order — they are not in the bag", () => {
    expect(
      bagKitchen(
        [
          line({ id: "plate", lineState: "in_progress" }),
          line({ id: "jar", fulfillment: "grocery" }),
          box({ id: "a" }),
        ],
        NOW,
      ),
    ).toBe("sent");
    expect(bagKitchen([line({ id: "plate", lineState: "in_progress" })], NOW)).toBeNull();
  });
});

describe("railKitchenSub — G, the rail's step 1 never claims a stage the lines do not back", () => {
  it("says Cooking ONLY after the kitchen started, and the honest default otherwise", () => {
    expect(railKitchenSub("cooking")).toBe("Cooking");
    expect(railKitchenSub("done")).toBe("Kitchen’s done — bagging it");
    // RED when the default is the old "Cooking" — lit at payment, before the wok was touched.
    expect(railKitchenSub("sent")).toBe("Sent to kitchen");
    expect(railKitchenSub(null)).toBe("Sent to kitchen");
  });
});

describe("pickupKitchenLine — B, the pickup page's line under its Now sentence", () => {
  it("speaks the kitchen's taps while the ticket is with the kitchen, and while it runs late", () => {
    expect(pickupKitchenLine("cooking", "cooking")).toBe(TRACK.kitchenCooking);
    expect(pickupKitchenLine("cooking", "done")).toBe(TRACK.kitchenDone);
    expect(pickupKitchenLine("late", "done")).toBe(TRACK.kitchenDone);
  });

  it("never speaks for a held booking, a Ready bag, or a kitchen that has not started", () => {
    expect(pickupKitchenLine("booked", "cooking")).toBeNull();
    expect(pickupKitchenLine("ready", "done")).toBeNull();
    expect(pickupKitchenLine("pickedUp", "done")).toBeNull();
    expect(pickupKitchenLine("cooking", "sent")).toBeNull();
    expect(pickupKitchenLine("cooking", null)).toBeNull();
  });
});

describe("kitchenRereadDelayMs — the ONE scheduled re-read is the Bill's rule", () => {
  it("waits for a bump to leave Mom's undo window, plus the margin, on the read's DB clock", () => {
    const lines = [line({ id: "a", lineState: "served", bumpedAt: ago(1000) })];
    expect(kitchenRereadDelayMs(lines, NOW_MS)).toBe(KDS_UNDO_MS - 1000 + GRACE_REREAD_MARGIN_MS);
  });

  it("schedules nothing when no stage waits on the clock, or the clock is unknown", () => {
    expect(kitchenRereadDelayMs([line({ id: "a", lineState: "in_progress" })], NOW_MS)).toBeNull();
    expect(kitchenRereadDelayMs([line({ id: "a", fireAt: ahead(5000) })], null)).toBeNull();
  });
});
