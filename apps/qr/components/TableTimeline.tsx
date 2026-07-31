"use client";
import { useEffect, useRef, useState } from "react";
import type { CartItem } from "@mms/db";
import { useCart } from "./TableCartProvider";
import { TransitionLink as Link } from "./nav/TransitionNav"; // J1 journey grammar

/**
 * J3 — the wait, designed (docs/JOURNEY_PLAN.md). A slim strip that narrates the meal's REAL kitchen
 * state — every word is a kitchen tap, never a guess: `fired` is the send, `in_progress` is the KDS
 * "Start" tap, `served` is its "Ready" tap (KdsBoard.tsx). No fabricated ETAs, no invented "on the
 * stove" — if the kitchen hasn't tapped, we don't narrate it.
 *
 * Right-moment prompts, both honest:
 *  - all-served → one quiet dessert/tea line (a sentence, not a modal — hospitality, not a nag);
 *  - ~20 minutes after we OBSERVE all-served (client-measured from the transition we watched, not a
 *    fabricated server time) → a gentle settle-up pointer.
 *
 * a11y: deliberately NOT a live region — kitchen transitions are AMBIENT state (the same discipline as
 * the never-announced rolling CartBar total): the strip is ordinary perceivable content that updates in
 * place, and the view keeps its ONE polite live region for transactional feedback. Entrance rides
 * `.mms-rise` (a mid-meal dynamic mount — J1's stagger memory must never zero it).
 *
 * Freshness: carts update live where a realtime subscription exists (group dine-in on the menu,
 * dine-in on /cart); EVERY mount also re-fetches on tab re-focus (the provider's and Checkout's
 * visibility refetch), so a backgrounded phone in a thick-walled teahouse never narrates a stale
 * state as current.
 */
export function TimelineStrip({
  items,
  onMenu = false,
  /** Menu mount: where the settle nudge's "order" link lands (the cart NEEDS its `?cart=` id — a bare
   *  /cart renders the not-available placeholder). Null → the nudge renders linkless, never a dead end. */
  cartHref = null,
  /** Checkout mount: where the dessert line's menu link lands. Must carry the session `mode` — a bare
   *  /menu defaults to scan-&-go and would strand a dine-in diner's dessert in a phantom cart, so the
   *  DEFAULT is the door picker (W9a `menuHref(null)`), never a guessed mode. Callers that know the
   *  mode pass `menuHref(sessionMode)`. */
  menuHref = "/",
  /** Suppress the invitation notes (dessert / settle) while the cart can't accept them — locked by a
   *  peer's checkout or frozen by a split. The kitchen counts stay: they're true regardless. */
  quiet = false,
}: {
  items: CartItem[];
  onMenu?: boolean;
  cartHref?: string | null;
  menuHref?: string;
  quiet?: boolean;
}) {
  // Real, countable kitchen states only (comped lines still cook — keep them; voided lines are gone).
  const active = items.filter((l) => l.lineState !== "draft" && l.lineState !== "voided");
  const cooking = active.filter((l) => l.lineState === "in_progress");
  const sent = active.filter((l) => l.lineState === "fired");
  const served = active.filter((l) => l.lineState === "served");
  const allServed = active.length > 0 && sent.length === 0 && cooking.length === 0;
  // Counts are PLATES (qty-weighted), not lines — "3 cooking" for one qty-3 line is what the diner
  // ordered and what the kitchen is actually making.
  const plates = (ls: CartItem[]) => ls.reduce((n, l) => n + l.qty, 0);

  // The settle nudge: 20 minutes after the all-served transition WE observed. A ref timestamp (set on
  // the edge, cleared when new food fires) + a minute tick while relevant — client-measured, honestly
  // phrased as a pointer ("whenever you're ready"), never a claim about the kitchen or the bill.
  const servedAtRef = useRef<number | null>(null);
  const [settleNudge, setSettleNudge] = useState(false);
  useEffect(() => {
    if (!allServed) {
      servedAtRef.current = null;
      // Defer the reset out of the effect body (React Compiler discipline): only clear when shown.
      if (settleNudge) {
        const t = window.setTimeout(() => setSettleNudge(false), 0);
        return () => window.clearTimeout(t);
      }
      return;
    }
    servedAtRef.current ??= Date.now();
    // Interval-only (no synchronous first check — setState in an effect body is forbidden): the nudge
    // lands on a minute tick between 20 and 21 minutes, which is exactly as honest.
    const t = window.setInterval(() => {
      if (servedAtRef.current && Date.now() - servedAtRef.current >= 20 * 60 * 1000) {
        setSettleNudge(true);
      }
    }, 60 * 1000);
    return () => window.clearInterval(t);
  }, [allServed, settleNudge]);

  if (active.length === 0) return null;

  // Headline priority: the kitchen's LIVE tap (cooking) > queued (sent) > done (all served).
  // J6 round framing: a REAL wave, not a coincidence of speed — "next round" only when every queued
  // line was FIRED after every served line's own send (mms_fire_cart stamps a batch with one
  // fire_at, so batch membership is recoverable from the stamps). A first send whose tea lands
  // while the mains still wait stays "Your order's with the kitchen" — same round, not a next one.
  // The plan's "if tables order in waves" condition is answered per-table, live, by the stamps.
  const fireMs = (l: CartItem) => (l.fireAt ? new Date(l.fireAt).getTime() : 0);
  const isNextRound =
    sent.length > 0 &&
    served.length > 0 &&
    Math.min(...sent.map(fireMs)) > Math.max(...served.map(fireMs));
  const headline =
    cooking.length === 1
      ? `${cooking[0]?.name ?? "Your dish"} is being made`
      : cooking.length > 1
        ? `${plates(cooking)} dishes are being made`
        : sent.length > 0
          ? isNextRound
            ? "Next round’s with the kitchen"
            : "Your order’s with the kitchen"
          : "All served — enjoy!";

  const counts = [
    sent.length > 0 ? `${plates(sent)} with the kitchen` : null,
    cooking.length > 0 ? `${plates(cooking)} cooking` : null,
    served.length > 0 ? `${plates(served)} served` : null,
  ].filter(Boolean);

  return (
    <section className="table-timeline mms-rise" aria-label="Kitchen status">
      <p className="table-timeline-head">
        <span className="table-timeline-dot" aria-hidden />
        {headline}
      </p>
      <p className="table-timeline-counts">{counts.join(" · ")}</p>
      {allServed && !quiet && (
        <p className="table-timeline-note">
          {onMenu ? (
            <>Room for dessert or tea? The menu’s right here.</>
          ) : (
            <>
              Room for dessert or tea?{" "}
              <Link href={menuHref} className="nav-link">
                Back to the menu
              </Link>
            </>
          )}
        </p>
      )}
      {settleNudge && !quiet && (
        <p className="table-timeline-note">
          {onMenu ? (
            cartHref ? (
              <>
                Whenever you’re ready — settle up from your{" "}
                <Link href={cartHref} className="nav-link">
                  order
                </Link>
                .
              </>
            ) : (
              <>Settle up whenever you’re ready.</>
            )
          ) : (
            <>Whenever you’re ready — settle up below.</>
          )}
        </p>
      )}
    </section>
  );
}

/** Menu mount: the provider's live items (group realtime + visibility refetch). The settle link
 *  carries the server-issued cart id (a bare /cart is a dead end); a locked/settling cart quiets the
 *  invitations — the menu can't accept an add and the bill is already in motion. */
export function MenuTimeline() {
  const { items, cartId, locked, settling } = useCart();
  return (
    <TimelineStrip
      items={items}
      onMenu
      cartHref={cartId ? `/cart?cart=${encodeURIComponent(cartId)}` : null}
      quiet={locked || settling}
    />
  );
}
