"use client";
import { useState, useTransition, type CSSProperties } from "react";
import { setPickupAsap } from "@/lib/pickup";
import { formatSlot, formatSlotLong } from "@/lib/pickupTime";
import { PickupSlotSheet } from "./PickupSlotSheet";

/**
 * W5e — the pickup timing choice at checkout: ASAP ("make it now") ⇆ a scheduled slot. This replaces
 * the old force-a-slot-before-ordering gate at the menu (TableCartProvider no longer auto-opens the
 * slot sheet). ASAP is a first-class default: a cart with NO slot fires immediately at settlement
 * (mms_fire_pending_food's null-fire_at path), so choosing ASAP just CLEARS any scheduled slot
 * (setPickupAsap → mms_clear_pickup_slot); choosing/changing a time opens the capacity-aware sheet.
 *
 * Money-invariant: pickup_slot/fire_at are fulfillment metadata — never a price. getCartTotals reads
 * neither, so flipping ASAP⇆scheduled here can't move any amount (the pay total is unchanged).
 *
 * Errors route UP to the checkout's single review-step live region (onStatus) — not a second region —
 * so a screen reader hears one announcement per view (the slot sheet owns its own in-dialog alert).
 */
export function PickupWhenChoice({
  cartId,
  prepMinutes,
  initialSlot,
  asapAvailable,
  onStatus,
}: {
  cartId: string;
  prepMinutes: number;
  /** The cart's current scheduled slot (ISO), or null = ASAP. Seeds the choice from the server view. */
  initialSlot: string | null;
  /** Server-computed: is the kitchen taking ASAP right now (open + capacity)? When false, the ASAP pill
   *  is disabled and the diner is steered to Schedule — the pay boundary (mms_pickup_asap) would reject
   *  ASAP anyway, so we never offer what it can't honor. */
  asapAvailable: boolean;
  /** Route a failure into the checkout's ONE review-step live region (never a new region). */
  onStatus: (message: string | null) => void;
}) {
  const [slot, setSlot] = useState<string | null>(initialSlot);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, startAsap] = useTransition();
  const asap = slot === null;

  function chooseAsap() {
    if (asap || busy) return; // already ASAP → no needless round-trip
    if (!asapAvailable) {
      // Kitchen closed / fully booked — can't go ASAP; keep the current slot and nudge to Schedule.
      onStatus("The kitchen isn’t taking ASAP orders right now — please schedule a time.");
      return;
    }
    onStatus(null); // single review live region — clear any prior message first
    startAsap(async () => {
      try {
        const r = await setPickupAsap(cartId);
        if (r.ok) {
          setSlot(null);
          return;
        }
        onStatus(
          r.reason === "cart_closed"
            ? "This order is already being paid."
            : r.reason === "locked"
              ? "Someone’s checking out — try again in a moment."
              : "Couldn’t switch to ASAP — please try again.",
        );
      } catch {
        onStatus("Couldn’t switch to ASAP — check your connection and try again.");
      }
    });
  }

  return (
    <div style={{ margin: "12px 0" }}>
      <p id="pickup-when-label" style={labelStyle}>
        When would you like it?
      </p>
      <div role="group" aria-labelledby="pickup-when-label" className="checkout-pill-row">
        <button
          type="button"
          aria-pressed={asap}
          aria-busy={busy || undefined}
          // aria-disabled (not native disabled) keeps the control focusable so a keyboard/SR user can
          // reach it and hear WHY (the onStatus nudge) instead of the pill vanishing from the tab order.
          aria-disabled={!asapAvailable || undefined}
          // Explicit accessible name (the visible "ASAP" initialism + emoji are decorative here).
          aria-label={
            asapAvailable
              ? `As soon as possible — ready in about ${prepMinutes} minutes`
              : "As soon as possible — unavailable right now, the kitchen is closed or fully booked"
          }
          // Only render the lit-gold selected cap when ASAP is both chosen AND fulfillable — a disabled
          // ASAP must never read as the active selection (the .checkout-pill[aria-disabled] rule dims it).
          className={`checkout-pill${asap && asapAvailable ? " checkout-pill-on" : ""}`}
          style={segStyle}
          onClick={chooseAsap}
        >
          <span>
            <span aria-hidden>⚡ </span>ASAP
          </span>
          <small style={subStyle}>{asapAvailable ? `~${prepMinutes} min` : "Unavailable"}</small>
        </button>
        <button
          type="button"
          aria-pressed={!asap}
          aria-haspopup="dialog"
          aria-expanded={sheetOpen}
          // When scheduled, the accessible name carries the FULL day+time (the visible <small> shows
          // time only) and signals the tap changes it; when ASAP it invites picking a time.
          aria-label={slot ? `Scheduled for ${formatSlotLong(slot)} — change` : "Schedule a pickup time"}
          className={`checkout-pill${!asap ? " checkout-pill-on" : ""}`}
          style={segStyle}
          onClick={() => {
            onStatus(null);
            setSheetOpen(true);
          }}
        >
          <span>
            <span aria-hidden>🗓 </span>
            {slot ? "Scheduled" : "Schedule"}
          </span>
          <small style={subStyle}>{slot ? formatSlot(slot) : "Pick a time"}</small>
        </button>
      </div>
      {/* Honest confirmation of what each choice means — no fabricated countdown, just the config
          estimate for ASAP and the chosen wall-clock time for scheduled. When ASAP is unavailable and no
          slot is chosen yet, say so and steer to Schedule (the pay boundary would otherwise reject it). */}
      <p style={hintStyle}>
        {asap
          ? asapAvailable
            ? // Frame ~prep as the cook estimate and point to /track for the confirmed pickup time, so the
              // two surfaces read as one story (create-intent snaps a slot for capacity; /track echoes it).
              `We’ll start it the moment you pay — ready in about ${prepMinutes} min; we’ll confirm your pickup time next.`
            : "ASAP isn’t available right now — please schedule a pickup time above."
          : `Ready for pickup ${formatSlotLong(slot)}.`}
      </p>
      <PickupSlotSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        cartId={cartId}
        onChosen={(s) => setSlot(s)}
      />
    </div>
  );
}

const labelStyle: CSSProperties = {
  display: "block",
  fontWeight: 700,
  fontSize: "var(--fs-sm)",
  marginBottom: 6,
};
// Each segment splits the row evenly and stacks its main label over the sub (a compact two-line pill,
// like the tip chips) — the shared .checkout-pill supplies the lit-cap selected state + 44px height.
const segStyle: CSSProperties = {
  flex: "1 1 0",
  flexDirection: "column",
  gap: 1,
  padding: "6px 10px",
  minWidth: 0,
};
// Font-size only — color INHERITS the pill's (t2 idle / cream --oa selected) so the sub can't drop
// below the pill's own contrast on the gold cap.
const subStyle: CSSProperties = { fontSize: "var(--fs-xs)", fontWeight: 700 };
const hintStyle: CSSProperties = {
  margin: "6px 2px 0",
  fontSize: "var(--fs-sm)",
  color: "var(--t3)",
};
