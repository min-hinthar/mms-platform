"use client";
import type { CSSProperties, ReactNode } from "react";
import { TransitionLink as Link } from "./nav/TransitionNav"; // J1 journey grammar
import posthog from "posthog-js";

// K1 (Journey II) — the three-door entry (Dine-in · To-go · Grocery), each a ModeCard link. `DoorFace`
// is the shared inner visual (emoji tile · bilingual EN/MY name · description · trailing affordance).
// The doors are the front door of the house — a first impression, not a utility switch — so they carry
// the menu's card language + a real Burmese line each (the app is bilingual everywhere). To-go's
// now-vs-scheduled choice moved to checkout (W5e); the door no longer forks it up front.

const tileStyle: CSSProperties = {
  display: "grid",
  placeItems: "center",
  width: 52,
  height: 52,
  flex: "none",
  borderRadius: 14,
  background: "var(--grad)", // gradient tile behind the emoji — a small depth detail, flips per theme
  fontSize: "var(--fs-h1)",
};

/** The card interior shared by every door. `trailing` optionally overrides the default chevron. `my`
 *  is the Burmese companion to the English name (lang="my" Padauk for correct SR pronunciation per
 *  WCAG 3.1.2 — the same bilingual idiom as the menu item rows). */
function DoorFace({
  emoji,
  name,
  my,
  description,
  trailing,
}: {
  emoji: string;
  name: string;
  my?: string;
  description: string;
  trailing?: ReactNode;
}) {
  return (
    <>
      <span aria-hidden style={tileStyle}>
        {emoji}
      </span>
      <span style={{ minWidth: 0 }}>
        <b style={{ fontSize: "var(--fs-h3)" }}>
          {name}
          {my ? (
            <>
              {" "}
              <span
                lang="my"
                style={{ fontFamily: "var(--font-my)", fontWeight: 600, color: "var(--t2)" }}
              >
                {my}
              </span>
            </>
          ) : null}
        </b>
        <br />
        <small style={{ color: "var(--t2)" }}>{description}</small>
      </span>
      {trailing ?? (
        <span
          aria-hidden
          style={{ marginLeft: "auto", color: "var(--ac)", fontSize: "var(--fs-h2)" }}
        >
          ›
        </span>
      )}
    </>
  );
}

interface ModeCardProps {
  mode: string;
  href: string;
  emoji: string;
  name: string;
  /** Burmese companion line (bilingual door). */
  my?: string;
  description: string;
  /** Analytics-only door tag (K0) — mirrors the `door` that lands on `session_created` at mint. */
  door?: string;
  /** Position in the door list — drives the staggered entrance delay (Richness R5a). */
  index?: number;
}

export function ModeCard({
  mode,
  href,
  emoji,
  name,
  my,
  description,
  door,
  index = 0,
}: ModeCardProps) {
  return (
    <Link
      href={href}
      // card-interactive = hover-lift + press settle (this card IS clickable); mms-stagger = entrance.
      className="card card-interactive mms-stagger"
      style={{
        display: "flex",
        gap: 14,
        alignItems: "center",
        padding: 18,
        textDecoration: "none",
        color: "inherit",
        animationDelay: `calc(${index} * 70ms)`,
      }}
      onClick={() => posthog.capture("mode_selected", { mode, ...(door ? { door } : {}) })}
    >
      <DoorFace emoji={emoji} name={name} my={my} description={description} />
    </Link>
  );
}
