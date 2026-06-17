"use client";
import Link from "next/link";
import posthog from "posthog-js";

interface ModeCardProps {
  mode: string;
  href: string;
  emoji: string;
  name: string;
  description: string;
}

export function ModeCard({ mode, href, emoji, name, description }: ModeCardProps) {
  return (
    <Link
      href={href}
      className="card"
      style={{ display: "flex", gap: 14, alignItems: "center", padding: 18, textDecoration: "none", color: "inherit" }}
      onClick={() => posthog.capture("mode_selected", { mode })}
    >
      <span aria-hidden style={{ fontSize: 34 }}>{emoji}</span>
      <span><b style={{ fontSize: 17 }}>{name}</b><br /><small style={{ color: "var(--t2)" }}>{description}</small></span>
      <span aria-hidden style={{ marginLeft: "auto", color: "var(--ac)", fontSize: 20 }}>›</span>
    </Link>
  );
}
