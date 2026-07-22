"use client";
import { Icon } from "@mms/ui";
import { useCart } from "./TableCartProvider";
import { formatSlotLong } from "@/lib/pickupTime";

/**
 * Menu-header pill for pickup mode: shows the chosen slot ("Pickup · 11:45 AM") and reopens the
 * picker to change it. W5e made ASAP the DEFAULT (a null slot fires immediately at settlement), so
 * with no slot the chip reads "Pickup · ASAP" + "Schedule ›" — an OPTIONAL upgrade, not a required
 * gate (the diner is never blocked from ordering; they confirm/change timing again at checkout).
 * Reads the slot from the cart context (server-authoritative), so it stays honest with what's scheduled.
 */
export function PickupSlotChip() {
  const { pickupSlot, openSlotSheet } = useCart();
  return (
    <button
      type="button"
      onClick={openSlotSheet}
      aria-label={
        pickupSlot
          ? `Pickup at ${formatSlotLong(pickupSlot)} — change time`
          : "Pickup as soon as possible — schedule a time instead"
      }
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        minHeight: 44,
        padding: "8px 14px",
        marginTop: 6,
        border: "1.5px solid var(--bd)",
        borderRadius: 999,
        background: "var(--cd)",
        color: "var(--tx)",
        fontWeight: 700,
        fontSize: "var(--fs-sm)",
        cursor: "pointer",
      }}
    >
      <Icon name="bag" size={16} />
      {pickupSlot ? `Pickup · ${formatSlotLong(pickupSlot)}` : "Pickup · ASAP"}
      <span aria-hidden style={{ color: "var(--ac)", fontWeight: 800 }}>
        {pickupSlot ? "Change" : "Schedule ›"}
      </span>
    </button>
  );
}
