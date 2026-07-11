"use client";
import { useCart } from "@/components/TableCartProvider";

/**
 * J2 — the arrival beat (docs/JOURNEY_PLAN.md · place-setting). The first branded moment after the scan:
 * a bilingual greeting line that settles into the menu masthead, plus one mode-aware line of place-setting
 * copy. HONEST by construction: the dine-in party line comes from live presence (real members), never a
 * fabricated table number (sessions carry no human table label); solo modes get a welcome, not a claim.
 *
 * The once-per-session "beat" comes free from J1's SurfaceMemory: `.mms-stagger` premieres on the first
 * menu visit this session and lands settled on revisits — arrival is a moment, not a recurring animation.
 * Reduced motion inherits `.mms-stagger`'s existing gate. The Burmese greeting is REAL content (not
 * decoration): `lang="my"` for correct SR pronunciation (WCAG 3.1.2) + the Padauk face; the ✦ is
 * decorative and hidden. No live region — this is static place-setting, announced once in reading order.
 */
export function ArrivalBeat({ mode }: { mode: string }) {
  const { isGroup, members } = useCart();
  const party = isGroup && members.length > 1 ? members.length : 0;
  const line =
    mode === "dinein"
      ? party > 0
        ? `${party} of you at the table — order together, settle together.`
        : "You’re at the table — order when you’re ready."
      : mode === "pickup"
        ? "Pick a time — we’ll have it ready."
        : "Welcome in — pay right from your phone.";

  return (
    <div className="arrival-beat mms-stagger">
      <p className="arrival-greeting">
        <span lang="my" style={{ fontFamily: "var(--font-my)" }}>
          မင်္ဂလာပါ
        </span>{" "}
        Mingalaba <span aria-hidden>✦</span>
      </p>
      <p className="arrival-line">{line}</p>
    </div>
  );
}
