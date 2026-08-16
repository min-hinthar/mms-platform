import { describe, expect, it } from "vitest";
import { normalizePickupSlot } from "./pickup-slot";

/**
 * W19 — the ASAP-snap normalization, pinned. Two callers (the server seed in cart/page.tsx and
 * Checkout's refresh()) must read a cart's pickup timing IDENTICALLY, or the pill state diverges
 * from the server on a pay-step round-trip — the relit-ASAP bug this module exists to close.
 */
describe("normalizePickupSlot — one reading of the cart's pickup timing", () => {
  const SLOT = "2026-08-16T18:30:00.000Z";
  const FIRE = "2026-08-16T18:18:00.000Z";

  it("a slot WITH fire_at is a real schedule — kept", () => {
    expect(normalizePickupSlot(SLOT, FIRE)).toBe(SLOT);
  });

  it("a slot with NULL fire_at is the ASAP capacity snap — reads as ASAP (null)", () => {
    // mms_pickup_asap books a slot for capacity but leaves fire_at null (fire at settlement).
    // Showing that snapped slot as "Scheduled" mislabels a choice the diner never made.
    expect(normalizePickupSlot(SLOT, null)).toBeNull();
  });

  it("no slot at all is ASAP regardless of fire_at", () => {
    expect(normalizePickupSlot(null, null)).toBeNull();
    // fire_at without a slot doesn't occur for pickup carts, but the reading must not invent one.
    expect(normalizePickupSlot(null, FIRE)).toBeNull();
  });
});
