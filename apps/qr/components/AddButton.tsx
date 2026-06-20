"use client";
import { useState } from "react";
import posthog from "posthog-js";
import { useCart } from "./TableCartProvider";

/**
 * Per-item "Add" — the only way an item enters the cart, via the server-authoritative `addItem`
 * (the client sends an item id, never a price). Disabled until the session/cart exists and when the
 * item is sold out (a disabled control, not a missing one — RED-TEAM trap). 44px hit area.
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
  // While a member is checking out the cart is frozen (P3.2-lock) — disable adds for everyone else,
  // a disabled control (not a missing one), matching the sold-out treatment. The server rejects a
  // locked add regardless; this is the honest UI of it.
  const disabled = soldOut || !cartId || busy || locked;

  return (
    <button
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
      {busy ? "…" : soldOut ? "Sold out" : "Add"}
    </button>
  );
}
