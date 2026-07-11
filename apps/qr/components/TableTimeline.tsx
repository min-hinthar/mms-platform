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
 * Freshness: dine-in updates live (the cart realtime subscription fires on the KDS's qr_cart_items
 * state flips); every mode also re-fetches on tab re-focus (the provider's visibility refetch), so a
 * backgrounded phone in a thick-walled teahouse never narrates a stale state as current.
 */
export function TimelineStrip({ items, onMenu = false }: { items: CartItem[]; onMenu?: boolean }) {
  // Real, countable kitchen states only (comped lines still cook — keep them; voided lines are gone).
  const active = items.filter((l) => l.lineState !== "draft" && l.lineState !== "voided");
  const cooking = active.filter((l) => l.lineState === "in_progress");
  const sent = active.filter((l) => l.lineState === "fired");
  const served = active.filter((l) => l.lineState === "served");
  const allServed = active.length > 0 && sent.length === 0 && cooking.length === 0;

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
  const headline =
    cooking.length === 1
      ? `${cooking[0]?.name ?? "Your dish"} is being made`
      : cooking.length > 1
        ? `${cooking.length} dishes are being made`
        : sent.length > 0
          ? "Your order’s with the kitchen"
          : "All served — enjoy!";

  const counts = [
    sent.length > 0 ? `${sent.length} with the kitchen` : null,
    cooking.length > 0 ? `${cooking.length} cooking` : null,
    served.length > 0 ? `${served.length} served` : null,
  ].filter(Boolean);

  return (
    <section className="table-timeline mms-rise" aria-label="Kitchen status">
      <p className="table-timeline-head">
        <span className="table-timeline-dot" aria-hidden />
        {headline}
      </p>
      <p className="table-timeline-counts">{counts.join(" · ")}</p>
      {allServed && (
        <p className="table-timeline-note">
          {onMenu ? (
            <>Room for dessert or tea? The menu’s right here.</>
          ) : (
            <>
              Room for dessert or tea?{" "}
              <Link href="/menu" className="nav-link">
                Back to the menu
              </Link>
            </>
          )}
        </p>
      )}
      {settleNudge && (
        <p className="table-timeline-note">
          {onMenu ? (
            <>
              Whenever you’re ready — settle up from your{" "}
              <Link href="/cart" className="nav-link">
                order
              </Link>
              .
            </>
          ) : (
            <>Whenever you’re ready — settle up below.</>
          )}
        </p>
      )}
    </section>
  );
}

/** Menu mount: the provider's live items (dine-in realtime + visibility refetch). */
export function MenuTimeline() {
  const { items } = useCart();
  return <TimelineStrip items={items} onMenu />;
}
