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

  /**
   * M131 (owner: the arrival beat "for both dine-in and to-go modes have to be … reimagined").
   * The door, named in three words — from the shared DOOR map above, which the menu eyebrow reads
   * too. The glyph is decorative and hidden; the words carry it.
   */
  const door = doorFor(mode);

  const name = welcome?.name?.trim() || null;
  const backLine =
    welcome && welcome.ordersThisMonth >= 2
      ? `Welcome back — ${welcome.ordersThisMonth} orders with us this month.`
      : null;
  // The group party line always wins the one sub-line: it carries live coordination semantics
  // ("order together, settle together"); warmth never displaces information.
  const shown = mode === "dinein" && party > 0 ? line : (backLine ?? line);

  return (
    /* `card card-textured` is the shipped paper surface (satin ramp + bevel + two-tier shadow, plus
       the masked dot grid W22a·depth gave cards) — reused, never re-authored, so the beat inherits
       every M126 depth change for free. `card-textured` is pure decoration: a `::before` behind the
       content, pointer-events-none, invisible to AT, and no DOM change here. Its `isolation` is
       safe on an ordinary card — the rule against isolating hosts is about `PaperAmbient`'s, which
       would trap the app's fixed overlays. */
    <div className="card card-textured arrival-beat mms-stagger">
      <p className="arrival-mode">
        <span aria-hidden className="arrival-mode-glyph">
          {door.glyph}
        </span>
        {door.label}
        {/* K2: the real table label, at last (dine-in with a registered table only). It rides the
            mode row now rather than the greeting — it is a fact about the DOOR, and putting it
            here stops a long name and a table number competing on one line. */}
        {isGroup && tableNumber != null && (
          <span className="arrival-table">Table {tableNumber}</span>
        )}
      </p>
      <p className="arrival-greeting">
        <span lang="my" className="arrival-greeting-my">
          မင်္ဂလာပါ
        </span>{" "}
        Mingalaba{name ? `, ${name}` : ""} <span aria-hidden>✦</span>
      </p>
      <p className="arrival-line">{shown}</p>
      {/* W19/W20 — the named exit, DEMOTED and rebuilt as DOORS (M131). It was a run-on sentence
          with two links inside it, at the greeting's weight and longer than it, so the eye landed
          on navigation before welcome. Two tiles now: the door on top, its promise underneath, so
          the promise is part of the link's own accessible name instead of loose text beside it.

          The promises are unchanged, because they are the honest part: leaving is a NAVIGATION,
          never a "leave table" mutation — the party's session and cart survive untouched (4h
          sliding TTL). menuHref(null) = the door picker; a literal "/" with a "menu" label is the
          W9a lie. */}
      <div className="arrival-exit">
        {/* W20→W21 — ONE exit, two distinct doors (the owner flagged two stacked lines both
            walking to the door picker as redundant). Same destination, different promise. */}
        <Link href={menuHref(null)} className="arrival-exit-link">
          <span className="arrival-exit-title">
            Back to the start
            <span aria-hidden className="nav-arrow nav-arrow-fwd">
              →
            </span>
          </span>
          <span className="arrival-exit-note">
            {mode === "dinein" ? "keeps your table" : "your order stays saved on this phone"}
          </span>
        </Link>
        {/* Dine-in only: "Leave this table" forgets it ON THIS PHONE (device-level only — the
            storage clear runs in the click, before the navigation; the party's session and cart
            stay open for everyone else, never a server "close table"). A solo mode has no table to
            leave, so it gets the one door — which `auto-fit` then lets span the full width. */}
        {mode === "dinein" && (
          <Link
            href={menuHref(null)}
            className="arrival-exit-link"
            onClick={() => forgetDineinOnThisDevice()}
          >
            <span className="arrival-exit-title">Leave this table</span>
            <span className="arrival-exit-note">
              this phone only — the table stays open for everyone else
            </span>
          </Link>
        )}
      </div>
    </div>
  );
}
