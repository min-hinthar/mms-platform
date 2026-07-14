"use client";
import { Sheet } from "@mms/ui";
import { LiveOrderRow } from "./LiveOrderRow";
import type { LiveOrder } from "@/lib/live-order";

/**
 * K4 — the orders tray: the header pill's multi-order disambiguator. When the diner has ≥2 live orders,
 * the pill grows a count badge and taps open this sheet, one row per in-flight order (mode · context ·
 * honest status), each linking to its own /track. Built on the shared `Sheet` (Radix bottom sheet — focus
 * trap, Esc, scrim, swipe-to-close, a visible accessible title). The list is the server-derived
 * `getMyLiveOrders` snapshot passed by the header (refetched on open via visibilitychange/focus — no new
 * realtime channels — the header keeps the snapshot fresh via visibility/focus/navigation, not the open
 * action itself); a row tap closes the sheet as it navigates.
 */
export function OrdersTray({
  open,
  onOpenChange,
  orders,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  orders: LiveOrder[];
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Your live orders">
      <div className="orders-tray">
        <p className="orders-tray-sub">Tap an order to follow its status.</p>
        <ul className="orders-tray-list" role="list">
          {orders.map((o) => (
            <li key={o.id}>
              <LiveOrderRow order={o} onNavigate={() => onOpenChange(false)} />
            </li>
          ))}
        </ul>
        {/* Honest limitation (same attribution rule as rewards): a cash-settled order carries no earner,
            so it can't appear in a "your orders" list. */}
        <p className="orders-tray-note">Cash-paid orders aren’t shown here.</p>
      </div>
    </Sheet>
  );
}
