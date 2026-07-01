"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { NumberFlow, useAnimationPreference } from "@mms/ui";

// Visually hidden but AT-readable — the real value for screen readers when no parent label carries it.
const srOnly: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
  border: 0,
};

/**
 * A money figure that ROLLS (NumberFlow) and briefly FLASHES on change — the staff-board "live-notice" cue
 * (R9) so a saturated server registers a table's subtotal moving without staring at it. Directional: an
 * accent wash on an increase, a muted wash on a decrease. Self-contained: it holds its OWN previous value,
 * so the flash needs no diff wiring from the parent. Event-driven only (no idle loop) and reduced-motion
 * gated (the CSS `@media` off-switch on `.floor-flash-*` PLUS the `shouldAnimate` guard here). Animate REAL
 * cents only — never a fabricated tick.
 *
 * The flash is a KEYED decorative overlay (`key={nonce}`) so a new value always remounts it → the CSS wash
 * restarts even on rapid consecutive same-direction changes (a plain class toggle would no-op when the class
 * value is unchanged). a11y: NumberFlow's reels + the overlay are `aria-hidden`, and an `sr-only` real value
 * is rendered UNLESS `srHidden` (the parent's composed `aria-label` already names it — so AT hears it once).
 */
export function LiveMoney({ cents, srHidden = false }: { cents: number; srHidden?: boolean }) {
  const { shouldAnimate } = useAnimationPreference();
  const prev = useRef(cents);
  const nonce = useRef(0);
  const [flash, setFlash] = useState<{ dir: "up" | "down"; n: number } | null>(null);

  useEffect(() => {
    if (prev.current === cents) return;
    const dir: "up" | "down" = cents > prev.current ? "up" : "down";
    prev.current = cents;
    if (!shouldAnimate) return;
    nonce.current += 1;
    const n = nonce.current;
    // rAF-deferred setState (async — lint-safe vs set-state-in-effect); the overlay is keyed by `n` so a
    // fresh value always restarts the wash. The timeout only clears when this same flash is still current.
    const raf = requestAnimationFrame(() => setFlash({ dir, n }));
    const t = setTimeout(() => setFlash((f) => (f?.n === n ? null : f)), 820);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [cents, shouldAnimate]);

  return (
    <span className="floor-live">
      {flash && <span key={flash.n} aria-hidden className={`floor-flash floor-flash-${flash.dir}`} />}
      <span className="floor-live-num" aria-hidden>
        <NumberFlow value={cents / 100} format={{ style: "currency", currency: "USD" }} />
      </span>
      {!srHidden && <span style={srOnly}>{`$${(cents / 100).toFixed(2)}`}</span>}
    </span>
  );
}
