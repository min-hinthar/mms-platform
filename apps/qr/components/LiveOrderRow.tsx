"use client";
import { TransitionLink as Link } from "./nav/TransitionNav"; // J1 journey grammar (pill→/track morph)
import { formatSlotLong } from "@/lib/pickupTime";
import {
  liveOrderGlyph,
  liveOrderModeLabel,
  liveOrderTrackHref,
  type LiveOrder,
} from "@/lib/live-order";

/**
 * K4 — one live-order row, shared by the header OrdersTray and /account "Today" (one row craft, one
 * accessible name). A link to that order's /track (the diner's OWN order — RLS-gated). The mode glyph is
 * decorative (`aria-hidden`); the accessible name carries mode + context + the honest status word, so a
 * screen reader hears "Dine-in, Table 4, Preparing" without the emoji. `onNavigate` lets the tray close
 * its sheet on tap (the Today section passes nothing).
 */
export function LiveOrderRow({ order, onNavigate }: { order: LiveOrder; onNavigate?: () => void }) {
  const context = contextFor(order);
  return (
    <Link
      href={liveOrderTrackHref(order)}
      className="live-order-row"
      onClick={onNavigate}
      aria-label={`${liveOrderModeLabel(order.kind)}${context ? ` — ${context}` : ""} — ${order.statusWord} — view status`}
    >
      <span className="live-order-glyph" aria-hidden>
        {liveOrderGlyph(order.kind)}
      </span>
      <span className="live-order-body">
        <span className="live-order-mode">{liveOrderModeLabel(order.kind)}</span>
        {context && <span className="live-order-context">{context}</span>}
      </span>
      <span
        className={`live-order-status${order.togoStatus === "ready" || order.kind === "grocery" ? " live-order-status-ready" : ""}`}
      >
        <span className="live-order-status-dot" aria-hidden />
        {order.statusWord}
      </span>
      <span className="live-order-arrow" aria-hidden>
        →
      </span>
    </Link>
  );
}

/** The row's mode-specific context line: the table you're at, the pickup time, or the exit-pass cue. */
function contextFor(o: LiveOrder): string {
  switch (o.kind) {
    case "dinein":
      return o.tableNumber ? `Table ${o.tableNumber}` : "At your table";
    case "pickup":
      // formatSlotLong prefixes the day when it isn't today, so a later pickup never reads ambiguously.
      return o.pickupSlot ? `Pickup · ${formatSlotLong(o.pickupSlot)}` : "Pickup";
    case "grocery":
      return "Show your exit pass on the way out";
    default:
      return "To-go";
  }
}
