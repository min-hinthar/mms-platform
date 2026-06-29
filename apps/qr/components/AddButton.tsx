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
 * in their cart line, the pill morphs into an inline accent stepper (− qty +). The "+" reuses `add` (the
 * server merges/increments the same line); the "−" calls `setItemQty` (`qty<=0` removes, morphing back to
 * the Add pill).
 *
 * **Solo modes only.** In a dine-in GROUP cart the no-modifier draft line is SHARED — `insertOrIncLine`
 * merges by cart/item/fulfillment/draft-state, NOT by `by_seat` — and `canMutateLine` is owner/host-gated.
 * A per-row menu stepper there would mis-target a peer's shared line and a non-owner's "−" would be rejected
 * server-side, so group quantity is managed in the cart (the Checkout `Stepper` already gates on `canEdit`,
 * host, split). Solo (pickup / scan-and-go) has one diner, no cross-seat merge, and no split settlement → the
 * morph is unambiguous and correct. The match below mirrors `insertOrIncLine`'s exact merge keys.
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
  const { add, setItemQty, items, cartId, locked, settling, isGroup } = useCart();
  const [busy, setBusy] = useState(false);
  const { shouldAnimate } = useAnimationPreference();
  const { ripples, onPointerDown } = useRipple();

  // `add(menuItemId)` inserts/increments at the SESSION-DEFAULT fulfillment (dine-in at a table, else to-go),
  // and `insertOrIncLine` keeps different fulfillments as SEPARATE lines. So the menu stepper must match
  // EXACTLY that default-fulfillment line — otherwise a line re-routed to "to go" in the cart would show its
  // qty here while "+" silently grew a different (default) line (stuck qty + wrong routing/tax).
  const defaultFulfillment = isGroup ? "dinein" : "togo";
  // The quick-add line for this item, matching `insertOrIncLine`'s merge keys EXACTLY (item + no modifiers +
  // default fulfillment + still-draft); `!comped` keeps an immutable comped line out. No `by_seat` filter —
  // the server merge ignores it too, and the morph only renders in solo modes (one seat) per `inCart` below.
  const line = items.find(
    (i) =>
      i.menuItemId === menuItemId &&
      i.modifiers.length === 0 &&
      i.fulfillment === defaultFulfillment &&
      i.lineState === "draft" &&
      !i.comped,
  );
  const qty = line?.qty ?? 0;
  // The fresher 86'd signal for an IN-CART line: the cart view carries a live `line.soldOut` (server-derived
  // in getCartView), more current than the menu RSC's `soldOut` prop captured at page render. Gate the in-cart
  // "+" on the fresher of the two so a line 86'd after load can't keep incrementing (addItem doesn't reject it).
  const liveSoldOut = soldOut || (line?.soldOut ?? false);
  // Show the morph ONLY in solo modes (see the component doc): qty-driven once present (the stepper stays the
  // authoritative control even if the item is later 86'd — "+" disables on sold-out, "−" stays enabled to
  // remove). In group dine-in the Add pill always shows; quantity is managed in the shared cart.
  const inCart = qty > 0 && !isGroup;

  // While a member is checking out (P3.2-lock) OR the table is settling its split (P3.3b) the cart is frozen
  // and the server rejects add/setQty — disable the control so a tap can't fire an optimistic confirmation
  // the server will reject (a disabled control, not a missing one). No cart yet / a mutation in flight also disable.
  const blocked = !cartId || busy || locked || settling;

  // Focus management (WCAG 2.4.3): a "−" that removes the line unmounts the stepper, so focus would drop to
  // <body>. When that removal lands (qty → 0), move focus to the Add pill that replaces it. Gate on `!blocked`
  // so we focus only once the pill is actually focusable — `decrement` holds `busy` (→ `blocked`) through the
  // provider refresh, so the first render at qty 0 has a NATIVELY-disabled pill; `blocked` is a dep, so the
  // effect re-fires when `busy` clears and the focus then lands. Set only on a remove-via-"−".
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const refocusAfterRemove = useRef(false);
  useEffect(() => {
    if (qty === 0 && refocusAfterRemove.current && !blocked) {
      refocusAfterRemove.current = false;
      addBtnRef.current?.focus();
    }
  }, [qty, blocked]);

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
    // Announce the outcome through the provider's ONE polite live region (WCAG 4.1.3) — symmetric with the
    // "+"/add path's "Added to your order". The provider flashes it optimistically on tap so the SR user
    // gets immediate confirmation; the visible qty settles on the server-authoritative refresh.
    const announce = next <= 0 ? `Removed ${name}` : `${name}, quantity ${next}`;
    setBusy(true);
    try {
      await setItemQty(line.id, next, announce);
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
          // Sold-out disables "+" (a now-86'd line can't grow — only shrink via "−"), as does max/locked/busy.
          // Uses the LIVE cart `line.soldOut` (fresher than the page-render menu prop) so a freshly-86'd line
          // can't keep incrementing during the page's session.
          disabled={blocked || liveSoldOut || qty >= MAX_QTY}
          aria-label={
            liveSoldOut
              ? `${name} is sold out`
              : qty >= MAX_QTY
                ? `Maximum ${MAX_QTY} ${name}`
                : `Add another ${name}`
          }
          onClick={increment}
        >
          <span aria-hidden>+</span>
        </button>
      </span>
    );
  }

  // Default / sold-out state: the Add pill.
  // Sold-out is rendered as a FOCUSABLE `aria-disabled` control (NOT the native `disabled` attribute) for two
  // reasons: (a) the focus-restoration after a sold-out removal can actually land on it — a native-disabled
  // button can't receive focus, which would drop focus to <body> (WCAG 2.4.3); (b) it stays perceivable to AT
  // as "sold out". The truly-transient inert states (no cart / busy / locked) stay NATIVELY disabled (out of
  // the tab order). `inactive` = no add can fire either way; both the gesture + the click are gated on it.
  const nativeDisabled = blocked;
  const inactive = blocked || soldOut;
  return (
    <m.button
      ref={addBtnRef}
      type="button"
      disabled={nativeDisabled}
      aria-disabled={soldOut || undefined}
      aria-busy={busy}
      aria-label={
        soldOut
          ? `${name}, sold out`
          : locked
            ? `${name} — order locked while someone checks out`
            : `Add ${name} to your order`
      }
      // Spring press feedback — reduced-motion-gated; never on an inactive (disabled/sold-out) button.
      whileTap={shouldAnimate && !inactive ? { scale: 0.94 } : undefined}
      // Ripple origin — only while interactive + motion is allowed.
      onPointerDown={shouldAnimate && !inactive ? onPointerDown : undefined}
      // Guard the click: a focusable aria-disabled sold-out pill (and keyboard Enter) must not add.
      onClick={() => {
        if (inactive) return;
        void increment();
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
        cursor: inactive ? "default" : "pointer",
        background: soldOut ? "var(--sf)" : "var(--ac)",
        color: soldOut ? "var(--t3)" : "var(--oa)",
        opacity: !soldOut && nativeDisabled ? 0.6 : 1,
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
