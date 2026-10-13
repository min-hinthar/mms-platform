"use client";
import { endTrackHref } from "@/lib/session-truth";
import { TableEndedCard } from "./TableEnded";
import { useCart } from "./TableCartProvider";

/**
 * The menu's mount: the provider's held end, its "Start a new order" (one re-mint, busy through the
 * mint, the failure said), and the tracker for a paid order this seat may see. Renders nothing until
 * a table has ended — a solo order is never held (it re-mints with its cause said instead).
 */
export function MenuTableEnded() {
  const { ended, restarting, startNewOrder, cartId, error } = useCart();
  if (!ended) return null;
  return (
    <TableEndedCard
      end={ended}
      trackHref={endTrackHref(ended, cartId)}
      start={{
        kind: "mint",
        onStart: startNewOrder,
        busy: restarting,
        failed: !restarting && error !== null,
      }}
    />
  );
}
