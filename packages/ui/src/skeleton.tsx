import type { CSSProperties } from "react";

/**
 * Skeleton — a shimmering content placeholder shown while client-fetched data loads (P5.4). Pure
 * presentational (no hooks → Server-Component safe). The shimmer animation + its reduced-motion
 * off-switch live in the app's `globals.css` `.mms-skeleton` class (a `@keyframes` can't be defined
 * inline) — this component only supplies the shape (size + radius) and references that class, exactly
 * as `Sheet` references `.mms-sheet`. Compose several at the call site to mirror the loaded layout
 * (a row = a circle + a couple of bars).
 *
 * a11y: always `aria-hidden` — a skeleton is a transient visual cue, never announced. The surrounding
 * region keeps its own heading/label; do NOT wrap it in a live region (callers like `PickupSlotSheet` /
 * `SettlementBoard` deliberately keep "one live region per view" — their error branch owns `role=alert`).
 */
export function Skeleton({
  width,
  height = "0.8em",
  radius,
  circle = false,
  style,
}: {
  /** Explicit width (px number or CSS string). Omit to let a flex/grid parent size it. */
  width?: number | string;
  /** Bar height; defaults to a text-line height. */
  height?: number | string;
  /** Corner radius override; defaults to `--r-sm` (or `--r-full` when `circle`). */
  radius?: number | string;
  /** Equal box + full radius — an avatar/dot placeholder (pass `height` for the diameter). */
  circle?: boolean;
  /** Layout extras only (margin, flex); the shape props above still win. */
  style?: CSSProperties;
}) {
  const w = width ?? (circle ? height : undefined);
  return (
    <span
      aria-hidden
      className="mms-skeleton"
      style={{
        display: "block",
        flex: "none",
        ...style,
        ...(w != null ? { width: w } : null),
        height,
        borderRadius: circle ? "var(--r-full)" : (radius ?? "var(--r-sm)"),
      }}
    />
  );
}
