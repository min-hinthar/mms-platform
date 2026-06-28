import type { ComponentPropsWithRef, CSSProperties, ElementType } from "react";

/**
 * Card — the canonical app surface (P5.4): cream `--cd` fill, a hairline `--bd` border, `--r-card`
 * radius, and the soft `--sh` ambient shadow. Pure presentational (no hooks → Server-Component safe).
 *
 * It applies the global **`.card`** class (the single source of truth, in the app's `globals.css`) rather
 * than re-declaring the recipe inline — so it can never drift from the existing `className="card"` sites.
 * This primitive exists to retire the hand-rolled inline copies that had each re-typed the surface and
 * silently dropped the shadow (an accidental "flat" look); routing them through `.card` re-unifies them.
 *
 * **Deliberately NO surface variants.** QR's cards are surface-uniform — the only fork (shadow vs none)
 * was drift, not design, so it's unified here, not parameterized. (Tinted ok/warn status surfaces are a
 * separate `Callout`-shaped concern, not a Card variant.)
 *
 * Polymorphic via `as` (defaults to `div`) so a clickable card renders a real `<Link>`/`<a>`/`<button>`
 * with native focus + semantics — never a `role="button"` div. Pass `style`/`className` for per-site
 * layout (padding/margin/flex); the global `:focus-visible` ring covers interactive hosts automatically.
 * `ref` forwards to the host element (React 19 ref-as-prop) for focus management / measurement.
 */
export function Card<T extends ElementType = "div">({
  as,
  className,
  style,
  ...rest
}: { as?: T; className?: string; style?: CSSProperties } & Omit<
  ComponentPropsWithRef<T>,
  "as" | "className" | "style"
>) {
  const Tag = (as ?? "div") as ElementType;
  return <Tag className={className ? `card ${className}` : "card"} style={style} {...rest} />;
}
