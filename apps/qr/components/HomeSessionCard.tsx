"use client";
import { TransitionLink as Link } from "./nav/TransitionNav"; // J1 journey grammar
import { useSessionPeek, type PeekSession } from "@/lib/useSessionPeek";

/**
 * W5a — the homepage "you have something open" card(s), the session-level sibling of
 * HomeResumeCard (which is ORDER-based and only appears after payment). This surfaces the live
 * PRE-payment state that used to be invisible outside the menu — an open table, a basket in
 * progress — so a diner who swiped back to the entry screen has a first-class way back in
 * instead of a silent localStorage rejoin they can't see (the swipe-back dead end).
 *
 * Anatomy + styling reuse `.home-resume` (medallion · kicker/status · arrow). Restraint: at most
 * two cards — the dine-in table (shown even when the cart is empty; a claimed table is live state
 * worth resuming) and one solo basket (shown only with items — solo sessions auto-exist per
 * device, so an empty one is noise, not news).
 */
export function HomeSessionCard() {
  const sessions = useSessionPeek();
  if (!sessions || sessions.length === 0) return null;

  // Only a REGISTERED-table dine-in session gets a card: the ?table anchor is the authoritative
  // rejoin. A null-table session (host-mint code) can only resume via localStorage, which may have
  // been cleared/overwritten — a card promising resume that could mint a fresh empty session is a
  // lie; those sessions keep their in-menu resume path instead.
  const dinein = sessions.find((s) => s.mode === "dinein" && s.tableNumber != null);
  const solo = sessions.find((s) => s.mode !== "dinein" && s.itemCount > 0);
  const cards = [dinein, solo].filter((s): s is PeekSession => !!s);
  if (cards.length === 0) return null;

  return (
    <>
      {cards.map((s) => {
        const items =
          s.itemCount > 0 ? ` · ${s.itemCount} ${s.itemCount === 1 ? "item" : "items"}` : "";
        const isDinein = s.mode === "dinein";
        const status = isDinein
          ? `${s.tableNumber != null ? `Table ${s.tableNumber} is still open` : "Your party’s table is open"}${items}`
          : s.mode === "pickup"
            ? `Pickup order${items}`
            : `Your basket${items}`;
        // Dine-in resumes into the menu (the table context — group cart, guest list), anchored by
        // `?table=N` so the member-aware claim rejoins THIS table even if the localStorage join key
        // was cleared or later overwritten by a different table (the key and the peek can diverge —
        // the claim path is the authoritative rejoin). A solo basket with items lands on the cart
        // review directly (menu-door fallback if the open cart somehow vanished).
        const href = isDinein
          ? `/menu?mode=dinein&door=dinein&resume=1${s.tableNumber != null ? `&table=${s.tableNumber}` : ""}`
          : s.cartId
            ? `/cart?cart=${encodeURIComponent(s.cartId)}`
            : `/menu?mode=${s.mode}&door=togo`;
        return (
          <Link
            key={s.mode}
            href={href}
            className="home-resume"
            aria-label={`${status} — pick up where you left off`}
          >
            <span className="home-resume-medallion" aria-hidden>
              {isDinein ? "🪑" : "🧺"}
            </span>
            <span className="home-resume-body">
              <span className="home-resume-kicker">{isDinein ? "Your table" : "In progress"}</span>
              <span className="home-resume-status">{status}</span>
            </span>
            <span className="home-resume-arrow" aria-hidden>
              →
            </span>
          </Link>
        );
      })}
    </>
  );
}
