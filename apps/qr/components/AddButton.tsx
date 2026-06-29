"use client";
import { useState } from "react";
import { m } from "framer-motion";
import posthog from "posthog-js";
import { useAnimationPreference, useRipple } from "@mms/ui";
import { useCart } from "./TableCartProvider";

/**
 * Per-item "Add" — the only way an item enters the cart, via the server-authoritative `addItem`
 * (the client sends an item id, never a price). Disabled until the session/cart exists and when the
 * item is sold out (a disabled control, not a missing one — RED-TEAM trap). 44px hit area.
 *
 * Richness R3/R4: the press answers with a spring scale-down (`whileTap`, via the root LazyMotion
 * provider) + a tap ripple (`useRipple`) — the primary CTA's first micro-interaction. Both are gated on
 * `shouldAnimate` (reduced-motion off-switch) and purely presentational; the money path is unchanged.
 */
export function AddButton({
  menuItemId,
  name,
  soldOut = false,
}: {
  menuItemId: string;
  name: string;
  soldOut?: boolean;
}) {
  const { add, cartId, locked } = useCart();
  const [busy, setBusy] = useState(false);
  const { shouldAnimate } = useAnimationPreference();
  const { ripples, onPointerDown } = useRipple();
  // While a member is checking out the cart is frozen (P3.2-lock) — disable adds for everyone else,
  // a disabled control (not a missing one), matching the sold-out treatment. The server rejects a
  // locked add regardless; this is the honest UI of it.
  const disabled = soldOut || !cartId || busy || locked;

  return (
    <m.button
      type="button"
      disabled={disabled}
      aria-busy={busy}
      aria-label={
        soldOut
          ? `${name}, sold out`
          : locked
            ? `${name} — order locked while someone checks out`
            : `Add ${name} to your order`
      }
      // Spring press feedback — reduced-motion-gated; a disabled button never receives the gesture.
      whileTap={shouldAnimate && !disabled ? { scale: 0.94 } : undefined}
      // Ripple origin — only while interactive + motion is allowed (a disabled button gets no pointer events).
      onPointerDown={shouldAnimate && !disabled ? onPointerDown : undefined}
      onClick={async () => {
        setBusy(true);
        try {
          await add(menuItemId);
          posthog.capture("menu_item_add_clicked", { menu_item_id: menuItemId });
        } catch {
          /* the provider announces the failure in its polite live region */
        } finally {
          setBusy(false);
        }
      }}
      style={{
        position: "relative", // ripple container
        overflow: "hidden", // clip the ripple to the pill
        alignSelf: "center",
        minWidth: 44,
        minHeight: 44,
        padding: "0 16px",
        borderRadius: 999,
        border: "none",
        fontWeight: 800,
        cursor: disabled ? "default" : "pointer",
        background: soldOut ? "var(--sf)" : "var(--ac)",
        color: soldOut ? "var(--t3)" : "var(--oa)",
        opacity: !soldOut && disabled ? 0.6 : 1,
      }}
    >
      {shouldAnimate &&
        ripples.map((r) => (
          <span key={r.id} className="mms-ripple" style={{ left: r.x, top: r.y }} aria-hidden />
        ))}
      <span style={{ position: "relative" }}>{busy ? "…" : soldOut ? "Sold out" : "Add"}</span>
    </m.button>
  );
}
