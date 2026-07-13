"use client";
import { useCart } from "@/components/TableCartProvider";
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
    </div>
  );
}
