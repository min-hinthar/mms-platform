"use client";
import { LiveOrderRow } from "./LiveOrderRow";
import type { LiveOrder } from "@/lib/live-order";
import { useLiveOrders } from "@/lib/useLiveOrders";

/**
 * K4 — the /account "Today" section: the same live-orders read as the header tray, rendered at the top
 * of the page (Phase 1c: what is happening NOW comes first). Seeded by the server snapshot (the page does
 * the uid-scoped `getMyLiveOrders` read and passes it — no fetch and no flash on mount), then kept fresh
 * by `useLiveOrders`: refreshed on wake/focus (the J3 pattern — the email-code round trip to Mail and
 * back IS a hidden→visible wake, so a Ready that landed meanwhile is showing on return) and replaced by
 * any new server snapshot on `router.refresh()` (after a sign-in or a merge).
 *
 * It stays the ONLY order status on /account: the header pill is off here on purpose, because a realtime
 * pill and this row would be two claims about one order on one screen (W22b removed exactly that).
 * Renders nothing when there's nothing in flight, so it never leaves an empty shell above the page.
 */
export function TodayOrders({ orders }: { orders: LiveOrder[] }) {
  const { orders: live } = useLiveOrders(true, null, orders);
  if (live.length === 0) return null;
  const label = live.length === 1 ? "1 order in progress" : `${live.length} orders in progress`;
  return (
    <section className="today-orders" aria-labelledby="today-orders-h">
      <div className="today-orders-head">
        <p className="eyebrow" style={{ margin: 0 }}>
          <span aria-hidden>✦ </span>In progress
        </p>
        <h2 id="today-orders-h" className="today-orders-h">
          Your live orders
        </h2>
      </div>
      <ul className="today-orders-list" role="list" aria-label={label}>
        {live.map((o) => (
          <li key={o.id}>
            <LiveOrderRow order={o} />
          </li>
        ))}
      </ul>
    </section>
  );
}
