"use client";
import { TransitionLink as Link } from "./nav/TransitionNav"; // J1 journey grammar
import { liveOrderTrackHref } from "@/lib/live-order";
import { useActiveOrderStatus } from "./useActiveOrderStatus";

/**
 * Homepage "resume your order" card (M-nav) — when a live order exists, the entry screen leads with a way
 * back to its tracker instead of only the mode picker. Live status (single-pay AND split-tender, via the
 * server-side split-id resolve) comes from `useActiveOrderStatus`; the homepage owns the subscription
 * (`track=true` — the header pill is hidden here). Renders nothing when there's no live order or it has
 * reached a terminal state (picked up / refunded / failed / a dine-in table whose session has closed).
 *
 * Lifecycle audit (2026-10-13), D — the status is the hook's `statusWord`, the ONE derivation
 * (`liveOrderStatusWord`) the header pill, the tray, /account "Today" and /track's chip all speak.
 * This card used to re-derive its own ladder off the raw `togo_status` column and told the two lies
 * W22b and M65 removed everywhere else: a HELD pickup (stamped 'preparing' at payment, fired hours
 * later) read "Preparing your order", and a self-scanned grocery basket read "Preparing", then "Your
 * order is ready" — and the card MORPHS into /track's chip on the tap, which said the opposite.
 * Before the row lands the word is the hook's honest floor ("Confirming", then "Placed").
 *
 * I — the link is `liveOrderTrackHref`, the one resume link (`resume=1` on both branches): a tap here
 * checks on an order, it does not arrive from a payment.
 */
export function HomeResumeCard() {
  const { order, statusWord, isDone } = useActiveOrderStatus(true);
  if (!order || isDone) return null;

  const statusText = statusWord ?? "Order placed";
  const href = liveOrderTrackHref(order);

  return (
    <Link href={href} className="home-resume" aria-label={`${statusText} — track your order`}>
      <span className="home-resume-medallion" aria-hidden>
        🧾
      </span>
      <span className="home-resume-body">
        <span className="home-resume-kicker">In progress</span>
        <span className="home-resume-status">{statusText}</span>
      </span>
      <span className="home-resume-arrow" aria-hidden>
        →
      </span>
    </Link>
  );
}
