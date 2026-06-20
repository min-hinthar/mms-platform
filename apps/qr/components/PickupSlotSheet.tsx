"use client";
import { useEffect, useState, useTransition, type CSSProperties } from "react";
import { Sheet } from "@mms/ui";
import { getPickupSlots, setPickupSlot, type PickupSlot } from "@/lib/pickup";
import { formatSlot } from "@/lib/pickupTime";

/**
 * Pickup time picker (v7.2 "Pick a pickup time" sheet). Lists the kitchen's currently-bookable slots
 * (capacity-aware — full ones never appear); choosing one sets it server-side (re-validated) and
 * closes. Honest: if a slot fills between fetch and tap, the server rejects it and we re-list.
 */
export function PickupSlotSheet({
  open,
  onOpenChange,
  cartId,
  onChosen,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  cartId: string;
  onChosen: (slot: string) => void;
}) {
  const [slots, setSlots] = useState<PickupSlot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Re-fetch availability each time the sheet opens (capacity is live). setState lives only in the
  // async callbacks (the allowed "sync from an external system" pattern — no synchronous setState in
  // the effect body); a fresh load also clears any stale error from a prior failed pick.
  useEffect(() => {
    if (!open) return;
    let active = true;
    getPickupSlots(cartId)
      .then((s) => {
        if (!active) return;
        setSlots(s);
        setError(null);
      })
      .catch(() => active && setSlots([]));
    return () => {
      active = false;
    };
  }, [open]);

  function choose(slot: string) {
    start(async () => {
      setError(null);
      try {
        const r = await setPickupSlot(cartId, slot);
        if (r.ok) {
          onChosen(slot);
          onOpenChange(false);
          return;
        }
        setError(
          r.reason === "unavailable"
            ? "That time just filled — pick another."
            : "Couldn’t set that time — please try again.",
        );
        // Re-list so a filled slot drops out of the choices.
        getPickupSlots(cartId)
          .then(setSlots)
          .catch(() => {});
      } catch {
        setError("Couldn’t set that time — check your connection and try again.");
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Pick a pickup time">
      <p style={{ color: "var(--t2)", fontSize: 13, margin: "0 0 12px" }}>
        Today · 750 Terrado Plaza, Covina
      </p>
      {slots === null ? (
        // Transient visual state only — no aria-live here, so it can't double-announce with the error
        // region below (one live region per view; the Radix Dialog title already names the sheet).
        <p style={{ color: "var(--t2)", fontSize: 14 }}>Loading times…</p>
      ) : slots.length === 0 ? (
        <p style={{ color: "var(--t2)", fontSize: 14 }}>
          No pickup times left today — please check back tomorrow.
        </p>
      ) : (
        <div role="group" aria-label="Available pickup times">
          {slots.map((s) => (
            <button
              key={s.slot}
              type="button"
              disabled={pending}
              onClick={() => choose(s.slot)}
              style={slotChip}
            >
              {formatSlot(s.slot)}
              {s.remaining <= 2 && (
                <span style={{ color: "var(--t3)", fontWeight: 600 }}> · {s.remaining} left</span>
              )}
            </button>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" style={{ color: "var(--warn)", fontSize: 13, marginTop: 10 }}>
          {error}
        </p>
      )}
    </Sheet>
  );
}

const slotChip: CSSProperties = {
  display: "inline-block",
  minHeight: 44,
  padding: "11px 16px",
  margin: "0 8px 8px 0",
  border: "1.5px solid var(--bd)",
  borderRadius: 12,
  background: "var(--cd)",
  color: "var(--tx)",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
};
