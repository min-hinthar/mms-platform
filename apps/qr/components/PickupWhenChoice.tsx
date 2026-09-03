"use client";
import { useEffect, useRef, useState, type CSSProperties, type MutableRefObject } from "react";
import { setPickupAsap, setPickupSlot } from "@/lib/pickup";
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
  slot,
  onSlotChange,
  asapAvailable,
  onStatus,
  onRevert,
  writesRef,
  frozen,
  frozenNote,
}: {
  cartId: string;
  prepMinutes: number;
  /** The cart's current scheduled slot (ISO), or null = ASAP. CONTROLLED (W19): the state lives in
   *  Checkout, above the keyed step wrapper, and is re-read by refresh() — an owned copy here was
   *  re-seeded from a stale prop on every pay-step remount, relighting ASAP over a scheduled cart. */
  slot: string | null;
  onSlotChange: (slot: string | null) => void;
  /** Server-computed: is the kitchen taking ASAP right now (open + capacity)? When false, the ASAP pill
   *  is disabled and the diner is steered to Schedule — the pay boundary (mms_pickup_asap) would reject
   *  ASAP anyway, so we never offer what it can't honor. */
  asapAvailable: boolean;
  /** Route a failure into the checkout's ONE review-step live region (never a new region). */
  onStatus: (message: string | null) => void;
  /** W20 review — how the pill recovers when the LATEST write is refused: re-read SERVER truth
   *  (Checkout's refresh() re-seeds `slot` via normalizePickupSlot). Never a captured `prev` — a
   *  prev captured mid-burst is the previous OPTIMISTIC value, not what the server holds, so a
   *  two-tap burst whose writes both failed used to settle the pill on a state nobody stored. */
  onRevert: () => void;
  /** W21 (Codex P1 on #191) — the write chain lives in a ref the PARENT owns, because the parent's
   *  continueToPayment must AWAIT it: create-intent locks the cart and reads fire_at, so a timing
   *  write still in flight when the diner taps Pay would be refused as locked and payment would
   *  proceed on the PREVIOUS server timing — an ASAP order snapping after the UI confirmed a
   *  scheduled slot, or the reverse. */
  writesRef: MutableRefObject<Promise<void>>;
  /** T9 — Checkout's `editsFrozen` (the RAW `locked`, the same predicate `setPickupAsap` /
   *  `setPickupSlot` refuse on). This gate stops a NEW write being ENQUEUED; it deliberately does
   *  NOT try to stop one already in flight, and it must not pretend to. `writesRef` is the chain
   *  `continueToPayment` awaits before minting an intent, so a write issued a moment before the
   *  lock still runs — and is refused server-side, and the existing `r.reason === "locked"` branch
   *  below already snaps the pill back to `confirmedSlot` and says so. That path is the in-flight
   *  answer; this prop is only about not OFFERING a tap whose outcome is already decided. */
  frozen: boolean;
  /** The lockbar's own sentence, reused verbatim rather than re-derived here. */
  frozenNote: string | null;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const asap = slot === null;
  // W20 — writes are OPTIMISTIC: the pill flips the instant it is tapped, the server write runs in
  // the background, and a refusal reverts the pill + explains via the view's one live region. The
  // token gates which write's OUTCOME may touch the UI (only the latest); the chain serializes the
  // writes themselves (review: two independent serverless fetches commit in arbitrary order — a
  // cold-started first write can land AFTER the second, leaving the server on the older choice
  // while both answered ok). Chained, commit order = issue order, so the last ok write IS the
  // server's final state.
  const writeToken = useRef(0);
  // W21 (Codex P2 on #191) — the last value the SERVER is known to hold, kept locally so a failure
  // can snap the pill back even when the authoritative re-read itself fails (refresh() swallows
  // its own read errors, so relying on it alone left the optimistic value standing on a dead
  // radio). Updated from the prop only while no write is in flight (mid-flight, the prop is the
  // optimistic value — adopting it would launder a guess into "confirmed").
  const pendingWrites = useRef(0);
  const confirmedSlot = useRef(slot);
  useEffect(() => {
    if (pendingWrites.current === 0) confirmedSlot.current = slot;
  }, [slot]);

  /** Enqueue one optimistic write: flip now, run after every earlier write, and let only the
   *  latest write's outcome speak — ok re-asserts the choice (a mid-flight refresh() may have
   *  stomped the optimistic value with older server truth), a refusal snaps back to the last
   *  CONFIRMED value locally AND re-reads server truth as the belt. */
  function enqueue(next: string | null, write: () => Promise<void>) {
    onStatus(null); // single review live region — clear any prior message first
    onSlotChange(next); // INSTANT: the pill lights now
    pendingWrites.current += 1;
    writesRef.current = writesRef.current.then(write).finally(() => {
      pendingWrites.current -= 1;
    });
  }

  /** The one sentence this component gives a frozen tap — the lockbar's if Checkout supplied one,
   *  otherwise a local fallback in the same voice. Both pills are dimmed together while frozen, so
   *  every tap in the row explains itself, including one on the already-selected pill. */
  function refuseFrozen() {
    onStatus(frozenNote ?? "Someone’s checking out — you can’t change the timing right now.");
  }

  /** Don't open a sheet whose every pick would be refused — say why instead. */
  function openSheet() {
    if (frozen) {
      refuseFrozen();
      return;
    }
    onStatus(null);
    setSheetOpen(true);
  }

  function chooseAsap() {
    if (frozen) {
      refuseFrozen();
      return;
    }
    if (asap) return; // already ASAP — nothing to do
    if (!asapAvailable) {
      // Kitchen closed / fully booked — can't go ASAP; keep the current slot and nudge to Schedule.
      onStatus("The kitchen isn’t taking ASAP orders right now — please schedule a time.");
      return;
    }
    const token = ++writeToken.current;
    enqueue(null, async () => {
      try {
        const r = await setPickupAsap(cartId);
        if (r.ok) {
          // Codex P2 — record EVERY successful write, superseded or not: the server holds this
          // value now, and a later refusal's snap-back must land on it, not on the pre-burst
          // state. Only the UI/status below is token-gated.
          confirmedSlot.current = null;
          if (token === writeToken.current) onSlotChange(null); // re-assert over a raced refresh()
          return;
        }
        if (token !== writeToken.current) return; // superseded — the newer write's outcome speaks
        onSlotChange(confirmedSlot.current); // instant local snap-back, even with no radio
        onRevert(); // …and the authoritative re-read as the belt
        onStatus(
          r.reason === "cart_closed"
            ? "This order is already being paid."
            : r.reason === "locked"
              ? "Someone’s checking out — try again in a moment."
              : "Couldn’t switch to ASAP — please try again.",
        );
      } catch {
        if (token !== writeToken.current) return;
        onSlotChange(confirmedSlot.current);
        onRevert();
        onStatus("Couldn’t switch to ASAP — check your connection and try again.");
      }
    });
  }

  /** W20 — the sheet reports a pick and closes INSTANTLY; this applies it, writes in the
   *  background, and reverts + explains if the slot just filled (the sheet's old in-place round
   *  trip made every pick feel laggy). */
  function chooseSlot(next: string) {
    // Reachable even with the sheet gated shut below: the sheet can be OPEN when a peer takes the
    // lock, and its pick then arrives here. Refuse at the write, not only at the door.
    if (frozen) {
      setSheetOpen(false);
      refuseFrozen();
      return;
    }
    const token = ++writeToken.current;
    enqueue(next, async () => {
      try {
        const r = await setPickupSlot(cartId, next);
        if (r.ok) {
          // Codex P2 — every successful write updates the confirmed value (see chooseAsap).
          confirmedSlot.current = next;
          if (token === writeToken.current) onSlotChange(next); // re-assert over a raced refresh()
          return;
        }
        if (token !== writeToken.current) return;
        onSlotChange(confirmedSlot.current);
        onRevert();
        onStatus(
          r.reason === "unavailable"
            ? "That time just filled — pick another."
            : "Couldn’t set that time — please try again.",
        );
      } catch {
        if (token !== writeToken.current) return;
        onSlotChange(confirmedSlot.current);
        onRevert();
        onStatus("Couldn’t set that time — check your connection and try again.");
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
          // aria-disabled (not native disabled) keeps the control focusable so a keyboard/SR user can
          // reach it and hear WHY (the onStatus nudge) instead of the pill vanishing from the tab order.
          aria-disabled={frozen || !asapAvailable || undefined}
          // Explicit accessible name (the visible "ASAP" initialism + emoji are decorative here).
          // Frozen is checked FIRST: while a checkout holds the lock the timing can't change for
          // ANY reason, so claiming "the kitchen is closed" would be a diagnosis this code never
          // established (M116's rule — a refusal names the reason it actually has).
          aria-label={
            frozen
              ? "As soon as possible — timing is locked while someone checks out"
              : asapAvailable
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
          aria-disabled={frozen || undefined}
          aria-label={
            frozen
              ? slot
                ? `Scheduled for ${formatSlotLong(slot)} — locked while someone checks out`
                : "Schedule a pickup time — locked while someone checks out"
              : slot
                ? `Scheduled for ${formatSlotLong(slot)} — change`
                : "Schedule a pickup time"
          }
          className={`checkout-pill${!asap ? " checkout-pill-on" : ""}`}
          style={segStyle}
          onClick={openSheet}
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
        currentSlot={slot}
        onChosen={chooseSlot}
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
