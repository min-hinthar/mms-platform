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
/**
 * The ONE door vocabulary (name-it-ONCE, applied to identity — see brand.ts/track-order.ts for the
 * rule). The adversarial pass on #239 caught the menu eyebrow speaking its own dialect: bare /menu
 * defaults to scango (page.tsx), whose branch the eyebrow's ternary lacked, so the masthead said
 * "TO-GO" over this card's "SCAN & GO" — two door claims on one screen. Both surfaces read this map
 * now, so a new mode that misses a branch falls back visibly to the same word everywhere instead of
 * silently disagreeing.
 */
const DOOR = {
  dinein: { glyph: "🍽", label: "At the table" },
  pickup: { glyph: "🥡", label: "To go" },
  scango: { glyph: "🛒", label: "Scan & go" },
} as const;

/** The door for a mode string, unknown modes falling back VISIBLY to scan & go — the same word on
 *  every surface beats a per-surface guess. */
export function doorFor(mode: string): { glyph: string; label: string } {
  return (DOOR as Record<string, { glyph: string; label: string }>)[mode] ?? DOOR.scango;
}

export function ArrivalBeat({
  mode,
  welcome = null,
}: {
  mode: string;
  welcome?: WelcomeBack | null;
}) {
  const { isGroup, members } = useCart();
  const party = isGroup && members.length > 1 ? members.length : 0;
  const line =
    mode === "dinein"
      ? party > 0
        ? `${party} of you at the table — order together, pay together.`
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

  // Phase 1a — the beat is a LINE now, not a card. It was a textured card repeating the eyebrow's
  // door ("At the table" twice), the table number the guest list already shows, and two exit tiles
  // placed before any food — the first things a scanned guest could tap were ways to leave. The
  // exits live in the table's own sheet (`TableOptions`, behind the dine-in eyebrow); the greeting
  // keeps its one job: say hello in both tongues and set the place in one sentence.
  return (
    <div className="menu-greet mms-stagger">
      <p className="menu-greet-hello">
        <span lang="my" className="arrival-greeting-my">
          မင်္ဂလာပါ
        </span>{" "}
        Mingalaba{name ? `, ${name}` : ""} <span aria-hidden>✦</span>
      </p>
      <p className="menu-greet-line">{shown}</p>
    </div>
  );
}
