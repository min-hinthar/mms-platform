"use client";
import { useEffect, useState, useTransition, type CSSProperties } from "react";
import { Sheet } from "@mms/ui";
import { getPickupSlots, setPickupSlot, type PickupSlot } from "@/lib/pickup";
import { dayLabel, formatSlot } from "@/lib/pickupTime";

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
  const [pendingSlot, setPendingSlot] = useState<string | null>(null); // the chip being set (instant feedback)
  const [pending, start] = useTransition();

  // Re-fetch availability each time the sheet opens, or if the cart changes (capacity is live). setState
  // lives only in the async callbacks (the allowed "sync from an external system" pattern — no synchronous
  // setState in the effect body); a fresh load also clears any stale error from a prior failed pick.
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
  }, [open, cartId]);

  function choose(slot: string) {
    setPendingSlot(slot); // synchronous → the tapped chip shows "Setting…" on tap, before the round-trip
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
      } finally {
        setPendingSlot(null);
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Pick a pickup time">
      <p style={{ color: "var(--t2)", fontSize: 13, margin: "0 0 12px" }}>
        750 Terrado Plaza, Covina
      </p>
      {slots === null ? (
        // Transient visual state only — no aria-live here, so it can't double-announce with the error
        // region below (one live region per view; the Radix Dialog title already names the sheet).
        <p style={{ color: "var(--t2)", fontSize: 14 }}>Loading times…</p>
      ) : slots.length === 0 ? (
        <p style={{ color: "var(--t2)", fontSize: 14 }}>
          No pickup times available right now — please check back soon.
        </p>
      ) : (
        // Slots arrive sorted by time → already day-then-time order; group into day sections so an
        // after-hours diner sees "Tomorrow"'s slots, not just an empty "Today".
        groupByDay(slots).map((g) => (
          <section key={g.label} style={{ marginBottom: 2 }}>
            <h3 style={{ fontSize: 13, fontWeight: 800, color: "var(--t2)", margin: "12px 0 8px" }}>
              {g.label}
            </h3>
            <div role="group" aria-label={`Pickup times — ${g.label}`}>
              {g.slots.map((s) => (
                <button
                  key={s.slot}
                  type="button"
                  disabled={pending}
                  aria-busy={pendingSlot === s.slot}
                  onClick={() => choose(s.slot)}
                  style={{
                    ...slotChip,
                    ...(pendingSlot === s.slot
                      ? { borderColor: "var(--ac)", color: "var(--ac)" }
                      : null),
                  }}
                >
                  {pendingSlot === s.slot ? (
                    "Setting…"
                  ) : (
                    <>
                      {formatSlot(s.slot)}
                      {s.remaining <= 2 && (
                        <span style={{ color: "var(--t3)", fontWeight: 600 }}>
                          {" "}
                          · {s.remaining} left
                        </span>
                      )}
                    </>
                  )}
                </button>
              ))}
            </div>
          </section>
        ))
      )}
      {error && (
        <p role="alert" style={{ color: "var(--warn)", fontSize: 13, marginTop: 10 }}>
          {error}
        </p>
      )}
    </Sheet>
  );
}

// Collapse the time-sorted slots into consecutive day sections (Today / Tomorrow / weekday).
function groupByDay(slots: PickupSlot[]): { label: string; slots: PickupSlot[] }[] {
  const groups: { label: string; slots: PickupSlot[] }[] = [];
  for (const s of slots) {
    const label = dayLabel(s.slot);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.slots.push(s);
    else groups.push({ label, slots: [s] });
  }
  return groups;
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
