"use client";
import { Icon } from "@mms/ui";
import { useCart } from "./TableCartProvider";
import { formatSlotLong } from "@/lib/pickupTime";

/**
 * Menu-header pill for pickup mode: shows the chosen slot ("Pickup · 11:45 AM") and reopens the
 * picker to change it, or prompts to pick one if none is set yet. Reads the slot from the cart
 * context (server-authoritative), so it stays honest with what's actually scheduled.
 */
export function PickupSlotChip() {
  const { pickupSlot, openSlotSheet } = useCart();
  return (
    <button
      type="button"
      onClick={openSlotSheet}
      aria-label={
        pickupSlot ? `Pickup at ${formatSlotLong(pickupSlot)} — change time` : "Pick a pickup time"
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
      {pickupSlot ? `Pickup · ${formatSlotLong(pickupSlot)}` : "Pick a pickup time"}
      <span aria-hidden style={{ color: "var(--ac)", fontWeight: 800 }}>
        {pickupSlot ? "Change" : "Choose ›"}
      </span>
    </button>
  );
}
