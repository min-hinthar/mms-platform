import { LiveOrderRow } from "./LiveOrderRow";
import type { LiveOrder } from "@/lib/live-order";

/**
 * K4 — the /account "Today" section: the same live-orders read as the header tray, rendered above order
 * history. Server-rendered (fresh on each navigation to /account); presentational — the page does the
 * uid-scoped read (getMyLiveOrders) and passes the snapshot. Renders nothing when there's nothing in
 * flight, so it never leaves an empty shell above history.
 */
export function TodayOrders({ orders }: { orders: LiveOrder[] }) {
  if (orders.length === 0) return null;
  const label = orders.length === 1 ? "1 order in progress" : `${orders.length} orders in progress`;
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
        {orders.map((o) => (
          <li key={o.id}>
            <LiveOrderRow order={o} />
          </li>
        ))}
      </ul>
    </section>
  );
}
