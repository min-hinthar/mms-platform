"use client";
import { useEffect, useRef, useState } from "react";
import { m } from "framer-motion";
import posthog from "posthog-js";
import { useAnimationPreference, useRipple } from "@mms/ui";
import { useCart } from "./TableCartProvider";

const MAX_QTY = 99; // matches the cart Stepper's upper bound (setQty is the authority; this is the UI gate)

/**
 * Per-item "Add" — the only way an item enters the cart, via the server-authoritative `addItem`
 * (the client sends an item id, never a price). Disabled until the session/cart exists and when the
 * item is sold out (a disabled control, not a missing one — RED-TEAM trap). 44px hit area.
 *
 * Richness R3/R4: the press answers with a spring scale-down (`whileTap`) + a tap ripple (`useRipple`).
 *
 * Richness R5c — **Add → quantity morph** (the prototype's `.add → .stp`): once the viewer has this item
 * in their OWN cart line, the pill morphs into an inline accent stepper (− qty +). The "+" reuses `add`
 * (the server merges/increments the same no-modifier line); the "−" calls `setItemQty` (`qty<=0` removes,
 * morphing back to the Add pill). It edits ONLY the viewer's own, still-draft, no-modifier line — a group
 * peer's line, a modifier variant, or a fired line is never touched from the menu (managed in the cart).
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
  const { add, setItemQty, items, cartId, locked, me } = useCart();
  const [busy, setBusy] = useState(false);
  const { shouldAnimate } = useAnimationPreference();
  const { ripples, onPointerDown } = useRipple();

  // The viewer's OWN, still-draft, no-modifier quick-add line for this item — the only line the menu's
  // Add creates/edits. Scoping to `bySeat === me.seat` (the anon-auth uid == addItem's `by_seat`) keeps a
  // group peer's line, a modifier variant (future item sheet), a fired line, or a comped line off the
  // menu's reach; those are managed in the cart. `find` is safe: merge-or-insert yields one such line.
  const line = items.find(
    (i) =>
      i.menuItemId === menuItemId &&
      i.modifiers.length === 0 &&
      i.lineState === "draft" &&
      !i.comped &&
      (me ? i.bySeat === me.seat : true),
  );
  const qty = line?.qty ?? 0;
  const inCart = qty > 0 && !soldOut;

  // Focus management (WCAG 2.4.3): a "−" that removes the line unmounts the stepper, so focus would drop
  // to <body>. When that removal lands (qty → 0), move focus to the Add pill that replaces it — its
  // accessible name announces the item is back to an addable state. Set only on a remove-via-"−".
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const refocusAfterRemove = useRef(false);
  useEffect(() => {
    if (qty === 0 && refocusAfterRemove.current) {
      refocusAfterRemove.current = false;
      addBtnRef.current?.focus();
    }
  }, [qty]);

  // While a member is checking out the cart is frozen (P3.2-lock) — disable for everyone else, a disabled
  // control (not a missing one), matching the sold-out treatment. The server rejects regardless; this is
  // the honest UI of it. No cart yet / a mutation in flight also disable.
  const blocked = !cartId || busy || locked;

  async function increment() {
    setBusy(true);
    try {
      await add(menuItemId);
      posthog.capture("menu_item_add_clicked", { menu_item_id: menuItemId });
    } catch {
      /* the provider announces the failure / recovers in its polite live region */
    } finally {
      setBusy(false);
    }
  }

  async function decrement() {
    if (!line) return;
    const next = qty - 1;
    if (next <= 0) refocusAfterRemove.current = true; // remove → focus the Add pill that replaces us
    setBusy(true);
    try {
      await setItemQty(line.id, next);
    } catch {
      /* provider recovers + re-syncs from server truth */
    } finally {
      setBusy(false);
    }
  }

  // Morphed state: the viewer has this item in their own line → the accent quick-qty stepper.
  if (inCart) {
    return (
      <span
        // Pop on mount (the prototype's `.stp{animation:pop}`); reuses `.mms-pop` + its reduced-motion gate.
        className={`mms-qty-stepper${shouldAnimate ? " mms-pop" : ""}`}
      >
        <button
          type="button"
          className="mms-stepper-btn"
          disabled={blocked}
          aria-label={qty === 1 ? `Remove ${name}` : `Remove one ${name}`}
          onClick={decrement}
        >
          <span aria-hidden>−</span>
        </button>
        {/* Accessible quantity = a REAL `.sr-only` text node (an aria-label on a roleless span isn't
            reliably exposed); NOT a live region, so it never announces per tap. The visible digit is
            aria-hidden + keyed on qty so it remounts → replays `.mms-pop` (RM-gated) — purely visual. */}
        <span className="mms-qty-val">
          <span className="sr-only">{name}, quantity {qty}</span>
          <span
            key={qty}
            aria-hidden
            className={shouldAnimate ? "mms-pop" : undefined}
            style={{ display: "inline-block" }}
          >
            {qty}
          </span>
        </span>
        <button
          type="button"
          className="mms-stepper-btn"
          disabled={blocked || qty >= MAX_QTY}
          aria-label={qty >= MAX_QTY ? `Maximum ${MAX_QTY} ${name}` : `Add another ${name}`}
          onClick={increment}
        >
          <span aria-hidden>+</span>
        </button>
      </span>
    );
  }

  // Default / sold-out state: the Add pill.
  const disabled = soldOut || blocked;
  return (
    <m.button
      ref={addBtnRef}
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
      onClick={increment}
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
