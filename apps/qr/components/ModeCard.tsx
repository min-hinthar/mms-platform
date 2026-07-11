"use client";
import { TransitionLink as Link } from "./nav/TransitionNav"; // J1 journey grammar
import posthog from "posthog-js";

interface ModeCardProps {
  mode: string;
  href: string;
  emoji: string;
  name: string;
  description: string;
  /** Position in the mode list — drives the staggered entrance delay (Richness R5a). */
  index?: number;
}

export function ModeCard({ mode, href, emoji, name, description, index = 0 }: ModeCardProps) {
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
      onClick={() => posthog.capture("mode_selected", { mode })}
    >
      {/* Gradient tile behind the emoji — a small depth detail (token --grad, flips per theme). */}
      <span
        aria-hidden
        style={{
          display: "grid",
          placeItems: "center",
          width: 52,
          height: 52,
          flex: "none",
          borderRadius: 14,
          background: "var(--grad)",
          fontSize: 28,
        }}
      >
        {emoji}
      </span>
      <span>
        <b style={{ fontSize: 17 }}>{name}</b>
        <br />
        <small style={{ color: "var(--t2)" }}>{description}</small>
      </span>
      <span aria-hidden style={{ marginLeft: "auto", color: "var(--ac)", fontSize: 20 }}>
        ›
      </span>
    </Link>
  );
}
