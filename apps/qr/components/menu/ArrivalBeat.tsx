"use client";
import { useCart } from "@/components/TableCartProvider";
import { menuHref } from "@/lib/menu-href";
import { forgetDineinOnThisDevice } from "@/lib/useTableSession";
import { TransitionLink as Link } from "@/components/nav/TransitionNav";
import type { WelcomeBack } from "@/lib/rewards";

/**
 * J2 — the arrival beat (docs/JOURNEY_PLAN.md · place-setting). The first branded moment after the scan:
 * a bilingual greeting line that settles into the menu masthead, plus one mode-aware line of place-setting
 * copy. HONEST by construction: the dine-in party line comes from live presence (real members), never a
 * fabricated table number (sessions carry no human table label); solo modes get a welcome, not a claim.
 *
 * J5 — recognition layers in, both claims strictly data-backed (getWelcomeBack): the NAME only for an
 * upgraded account (an anonymous uid isn't a durable identity to greet by), and the welcome-back line
 * only when ≥2 PAID orders exist this month — phrased as ORDERS, never "visits" (two orders in one
 * sitting are two orders; we don't invent ordinals the data can't back). First-timers see the J2
 * greeting unchanged.
 *
 * The once-per-session "beat" comes free from J1's SurfaceMemory: `.mms-stagger` premieres on the first
 * menu visit this session and lands settled on revisits — arrival is a moment, not a recurring animation.
 * Reduced motion inherits `.mms-stagger`'s existing gate. The Burmese greeting is REAL content (not
 * decoration): `lang="my"` for correct SR pronunciation (WCAG 3.1.2) + the Padauk face; the ✦ is
 * decorative and hidden. No live region — this is static place-setting, announced once in reading order.
 */
export function ArrivalBeat({
  mode,
  welcome = null,
}: {
  mode: string;
  welcome?: WelcomeBack | null;
}) {
  const { isGroup, members, tableNumber } = useCart();
  const party = isGroup && members.length > 1 ? members.length : 0;
  const line =
    mode === "dinein"
      ? party > 0
        ? `${party} of you at the table — order together, settle together.`
        : "You’re at the table — order when you’re ready."
      : mode === "pickup"
        ? "Pick a time — we’ll have it ready."
        : "Welcome in — pay right from your phone.";

  const name = welcome?.name?.trim() || null;
  const backLine =
    welcome && welcome.ordersThisMonth >= 2
      ? `Welcome back — ${welcome.ordersThisMonth} orders with us this month.`
      : null;
  // The group party line always wins the one sub-line: it carries live coordination semantics
  // ("order together, settle together"); warmth never displaces information.
  const shown = mode === "dinein" && party > 0 ? line : (backLine ?? line);

  return (
    <div className="arrival-beat mms-stagger">
      <p className="arrival-greeting">
        <span lang="my" style={{ fontFamily: "var(--font-my)" }}>
          မင်္ဂလာပါ
        </span>{" "}
        Mingalaba{name ? `, ${name}` : ""} <span aria-hidden>✦</span>
        {/* K2: the real table label, at last (dine-in with a registered table only). */}
        {isGroup && tableNumber != null && (
          <span style={{ color: "var(--ac)", fontWeight: 700 }}> · Table {tableNumber}</span>
        )}
      </p>
      <p className="arrival-line">{shown}</p>
      {/* W19 (owner: "how to switch from dine-in to main portal or other modes?") — the exit was
          always there (the header logo → the door picker) but nothing SAID so. This names it, with
          the same promise the home screen's resume card keeps: leaving is a navigation, never a
          "leave table" mutation — the party's session and cart survive untouched (4h sliding TTL).
          menuHref(null) = the door picker; a literal "/" with a "menu" label is the W9a lie. */}
      {mode === "dinein" ? (
        /* W20→W21 — ONE exit line, two distinct doors (the owner flagged two stacked lines both
           walking to the door picker as redundant). Same destination, different promise: "Back to
           the start" keeps this phone at the table (browse other modes, come back); "Leave this
           table" forgets it ON THIS PHONE (device-level only — the storage clear runs in the
           click, before the navigation; the party's session and cart stay open for everyone
           else, never a server "close table"). */
        <p className="arrival-line" style={{ marginTop: 2 }}>
          Switching modes or heading out?{" "}
          <Link href={menuHref(null)} className="nav-link" style={{ minHeight: 44 }}>
            Back to the start
            <span aria-hidden className="nav-arrow nav-arrow-fwd">
              {" "}
              →
            </span>
          </Link>{" "}
          keeps your table ·{" "}
          <Link
            href={menuHref(null)}
            className="nav-link"
            style={{ minHeight: 44 }}
            onClick={() => forgetDineinOnThisDevice()}
          >
            Leave this table
          </Link>{" "}
          lets this phone go — the table stays open for everyone else.
        </p>
      ) : (
        /* W20 (owner: "To-go and groceries should also have leave options") — the same named exit
           the dine-in beat got in W19, tuned for a solo mode: leaving is a navigation, and the
           order is safe to leave (the per-device session rejoins the same open cart). */
        <p className="arrival-line" style={{ marginTop: 2 }}>
          Switching how you’re ordering?{" "}
          <Link href={menuHref(null)} className="nav-link" style={{ minHeight: 44 }}>
            Back to the start
            <span aria-hidden className="nav-arrow nav-arrow-fwd">
              {" "}
              →
            </span>
          </Link>{" "}
          — your order stays saved on this phone.
        </p>
      )}
    </div>
  );
}
