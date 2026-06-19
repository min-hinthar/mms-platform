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
  const { add, cartId } = useCart();
  const [busy, setBusy] = useState(false);
  const disabled = soldOut || !cartId || busy;

  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={soldOut ? `${name}, sold out` : `Add ${name} to your order`}
      onClick={async () => {
        setBusy(true);
        try {
          await add(menuItemId);
          posthog.capture("menu_item_add_clicked", { menu_item_id: menuItemId });
        } catch {
          /* surfaced by the cart not updating; M1 keeps this quiet */
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
      {busy ? "…" : soldOut ? "86'd" : "Add"}
    </button>
  );
}
