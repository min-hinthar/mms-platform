"use client";
import { useEffect, useRef, useState } from "react";
import { m } from "framer-motion";
import posthog from "posthog-js";
import type { CartItem } from "@mms/db";
import { useAnimationPreference, useRipple } from "@mms/ui";
import { useCart } from "./TableCartProvider";

const MAX_QTY = 99; // matches the cart Stepper's upper bound (setQty is the authority; this is the UI gate)

// The viewer's OWN draft quick-add lines for this item, from a given cart snapshot: item + no modifiers +
// the session-default fulfillment + draft + not comped + own verified seat. Shared by the render (current
// items) and the write-queue (the freshest threaded snapshot) so both agree on which lines the stepper
// owns. Require a known seat — a staff line has `bySeat` undefined and session recovery blanks `mySeat`, so
// an unguarded `=== mySeat` would false-match a staff line (a real diner line always carries its by_seat).
function matchOwnLines(
  items: CartItem[],
  menuItemId: string,
  fulfillment: string,
  mySeat: string | undefined,
): CartItem[] {
  if (!mySeat) return [];
  return items.filter(
    (i) =>
      i.menuItemId === menuItemId &&
      i.modifiers.length === 0 &&
      i.fulfillment === fulfillment &&
      i.lineState === "draft" &&
      !i.comped &&
      i.bySeat === mySeat,
  );
}

/**
 * Per-item "Add" — the only way an item enters the cart, via the server-authoritative `addItem`
 * (the client sends an item id, never a price). Disabled until the session/cart exists and when the
 * item is sold out (a disabled control, not a missing one — RED-TEAM trap). 44px hit area.
 *
 * Richness R3/R4: the press answers with a spring scale-down (`whileTap`) + a tap ripple (`useRipple`).
 *
 * Richness R5c — **Add → quantity morph** (the prototype's `.add → .stp`): once the viewer has this item
 * in their OWN cart line, the pill morphs into an inline accent stepper (− qty +). The "+" reuses `add` (the
 * server creates/increments the viewer's own line); the "−" calls `setItemQty` (`qty<=0` removes, morphing
 * back to the Add pill).
 *
 * **Works in every mode, incl. dine-in groups, because the cart merge is per-seat** (`insertOrIncLine`
 * scopes its merge by `by_seat`): two diners ordering the same item get SEPARATE lines, so each diner's
 * Add/stepper targets their OWN line — never a tablemate's — and `canMutateLine` (own-draft) always passes
 * for the "−". The match below mirrors `insertOrIncLine`'s exact merge keys, scoped to the viewer's seat.
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
  const { add, setItemQty, items, cartId, locked, settling, isGroup, me } = useCart();
  const [busy, setBusy] = useState(false);
  // Optimistic add delta (R7 perf): the button morphs to the stepper the INSTANT it's tapped, before the
  // server round-trip returns, so a tap never sits at "…" waiting on the network. Reconciled to server
  // truth in `increment`'s finally — on success the returned view already includes the add (delta nets to
  // 0, no flicker); on failure the delta reverts, dropping back to the Add pill.
  const [optimistic, setOptimistic] = useState(0);
  const { shouldAnimate } = useAnimationPreference();
  const { ripples, onPointerDown } = useRipple();

  // `add(menuItemId)` inserts/increments at the SESSION-DEFAULT fulfillment (dine-in at a table, else to-go),
  // and `insertOrIncLine` keeps different fulfillments as SEPARATE lines. So the menu stepper must match
  // EXACTLY that default-fulfillment line — otherwise a line re-routed to "to go" in the cart would show its
  // qty here while "+" silently grew a different (default) line (stuck qty + wrong routing/tax).
  const defaultFulfillment = isGroup ? "dinein" : "togo";
  // The viewer's OWN draft quick-add lines for this item. Usually exactly one — `insertOrIncLine` merges a
  // diner's repeat adds per seat — but the cart can legitimately hold MORE than one matching own line (a host
  // reassign onto an item the diner already has, a price-snapshot difference between two adds, or a concurrent
  // first-add race), and there's deliberately no unique constraint. So AGGREGATE rather than assume one line —
  // the cart, split, and totals already sum per line — and the menu stays correct for any count.
  const mySeat = me?.seat;
  const myLines = matchOwnLines(items, menuItemId, defaultFulfillment, mySeat);
  const serverQty = myLines.reduce((sum, l) => sum + l.qty, 0);
  // Displayed qty = server truth + the optimistic in-flight delta (the instant-morph). All UI (the digit,
  // aria labels, the MAX gate, the morph) keys off this; the WRITE still targets real server lines only.
  const qty = serverQty + optimistic;
  // Fresher 86'd signal: any matching own line flagged sold-out (server-derived live in getCartView) OR the
  // page-render menu prop. Gates the in-cart "+" so a line 86'd after load can't keep incrementing.
  const liveSoldOut = soldOut || myLines.some((l) => l.soldOut);
  // Morph once the viewer has the item in their own line(s) — all modes (per-seat merge shows each diner their
  // own contribution). Qty-driven: the stepper stays the control even if 86'd ("+" disables, "−" still removes).
  const inCart = qty > 0;

  // Two freeze levels. `frozen` = the cart can't be written AT ALL: no session yet, a pay-window lock
  // (P3.2), or a split-settlement freeze (P3.3b) — the server rejects add/setQty, so the STEPPER's +/−
  // are disabled (a disabled control, not a missing one). `blocked` adds the in-flight `busy` window and
  // gates only the Add PILL (double-create guard) + the focus effects. Crucially the stepper does NOT gate
  // on `busy`, so rapid +/− taps stay live and never freeze mid-write — the "cart actions feel delayed" fix.
  const frozen = !cartId || locked || settling;
  const blocked = frozen || busy;

  // Serialize THIS button's stepper writes so rapid taps can't race on a stale server read: a "+" merges via
  // `add` (relative — order-independent), a "−" trims a specific line by id, and each op reads the FRESHEST
  // lines (threaded from the prior op's returned view) before it writes. The digit stays instant via the
  // optimistic delta; the writes drain in the background, in tap order.
  const writeChain = useRef<Promise<CartItem[] | null>>(Promise.resolve(null));
  // Latest committed items in a ref (effect-synced, not a render closure) so a decrement op that has no
  // threaded predecessor — the first op, or one following a concurrent create — still seeds from the freshest
  // snapshot rather than the tap-time closure.
  const itemsRef = useRef<CartItem[]>(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Focus management (WCAG 2.4.3): a "−" that removes the line unmounts the stepper, so focus would drop to
  // <body>. When the removal lands (qty → 0), move focus to the Add pill that replaces it. Gate on `!blocked`
  // so we focus only a focusable pill (`frozen` natively-disables it). The decrement no longer holds `busy`,
  // so at qty 0 the pill is focusable at once and focus lands immediately. Set only on a remove-via-"−".
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const refocusAfterRemove = useRef(false);
  useEffect(() => {
    if (qty === 0 && refocusAfterRemove.current && !blocked) {
      refocusAfterRemove.current = false;
      addBtnRef.current?.focus();
    }
  }, [qty, blocked]);

  // Symmetric to the remove path: a morph that mounts the stepper unmounts whatever was focused, so move
  // focus back onto a stepper button (WCAG 2.4.3). Gated on `!blocked` (a create holds `busy`; focus lands
  // once it clears). Two arming cases, mutually exclusive:
  //  • `refocusAfterAdd` — this instance's 0→1 create tap → focus the "+" (never a peer's add / a stepper
  //    "+", so it can't steal focus from another element).
  //  • `refocusStepper` — a "−" optimistically emptied the line (focus moved to the Add pill), but the write
  //    was REVERTED (transient error left the draft line), so the stepper REMOUNTS and the pill's focus would
  //    drop to <body>. Land focus back on the "−" the user was operating.
  const plusBtnRef = useRef<HTMLButtonElement>(null);
  const minusBtnRef = useRef<HTMLButtonElement>(null);
  const refocusAfterAdd = useRef(false);
  const refocusStepper = useRef(false);
  useEffect(() => {
    if (!inCart || blocked) return;
    if (refocusAfterAdd.current) {
      refocusAfterAdd.current = false;
      refocusStepper.current = false; // an add supersedes a pending revert-refocus
      plusBtnRef.current?.focus();
    } else if (refocusStepper.current) {
      refocusStepper.current = false;
      minusBtnRef.current?.focus();
    }
  }, [inCart, blocked]);

  // Record a CONFIRMED add only: the provider's `add` returns null (never throws) on a refused/expired add,
  // so an unconditional capture would log phantom adds. Returns the result through for the queue to thread.
  function captureAdd(result: CartItem[] | null): CartItem[] | null {
    if (result) posthog.capture("menu_item_add_clicked", { menu_item_id: menuItemId });
    return result;
  }

  // Every increment (the 0→1 create tap from the pill AND a stepper "+") runs through `writeChain` so it
  // orders with any in-flight "−" and threads THIS add's server truth to the next op. `fromPill` additionally
  // holds `busy` (the pill's double-create guard + the focus-after-morph timing) and arms the "+" refocus.
  // The morph/digit is instant via the optimistic delta; the write drains in the background, in tap order.
  function increment(fromPill: boolean) {
    setOptimistic((n) => n + 1); // instant morph / digit bump — before the round-trip resolves
    if (fromPill) {
      refocusAfterAdd.current = true; // Add-pill tap → focus the "+" once the stepper mounts
      setBusy(true);
    }
    writeChain.current = writeChain.current
      .then(async () => {
        let fresh: CartItem[] | null = null;
        try {
          fresh = captureAdd(await add(menuItemId));
        } finally {
          // Reconcile: on success the returned view already includes the add (delta nets to 0, no flicker);
          // on failure serverQty is unchanged, so the delta reverting drops back to the Add pill.
          setOptimistic((n) => n - 1);
          if (fromPill) setBusy(false);
        }
        return fresh; // thread THIS add's server truth so a following "−" trims a real, current line
      })
      .catch(() => null);
  }

  function decrement() {
    const nextAgg = qty - 1; // qty is optimistic-inclusive → the aggregate the user intends after this tap
    if (nextAgg < 0) return; // the "−" unmounts at 0, but never underflow
    setOptimistic((n) => n - 1); // instant digit drop
    const emptying = nextAgg <= 0;
    if (emptying) {
      refocusAfterRemove.current = true; // aggregate empties → focus the Add pill that replaces us
      refocusAfterAdd.current = false; // a removal moots any pending create-focus (avoids a stuck flag)
    }
    // Announce through the provider's ONE polite live region (WCAG 4.1.3), symmetric with the add path's
    // "Added to your order"; the provider flashes it optimistically on tap so the SR user hears it at once.
    const announce = emptying ? `Removed ${name}` : `${name}, quantity ${nextAgg}`;
    // If an emptying "−" is REVERTED (the write fails and the draft line survives), the optimistic +1 below
    // remounts the stepper — arm a refocus so the pill's focus doesn't drop to <body> (WCAG 2.4.3).
    const armRevertRefocus = (fresh: CartItem[]) => {
      if (
        emptying &&
        matchOwnLines(fresh, menuItemId, defaultFulfillment, mySeat).some((l) => l.qty > 0)
      ) {
        refocusStepper.current = true;
      }
    };
    writeChain.current = writeChain.current
      .then(async (threaded) => {
        try {
          // Freshest lines: the prior op's returned view, else the latest committed snapshot. Recomputed here
          // (not from a tap-time closure) so serialized "−" taps each peel a real, still-present line. Peel a
          // qty-1 line first (a duplicate fully removed → set converges to one), else trim the last line.
          const source = threaded ?? itemsRef.current;
          const lines = matchOwnLines(source, menuItemId, defaultFulfillment, mySeat);
          const target = lines.find((l) => l.qty <= 1) ?? lines[lines.length - 1];
          if (!target) {
            setOptimistic((n) => n + 1); // nothing to remove (already gone) → drop the optimistic step
            return source;
          }
          const fresh = await setItemQty(target.id, target.qty - 1, announce);
          armRevertRefocus(fresh); // set BEFORE the reconcile so the flag is armed when the stepper remounts
          setOptimistic((n) => n + 1); // reconcile: the returned view's serverQty now reflects the removal
          return fresh;
        } catch {
          if (emptying) refocusStepper.current = true; // defensive: assume the line survived the throw
          setOptimistic((n) => n + 1); // defensive: setItemQty swallows its own errors, so this rarely runs
          return itemsRef.current;
        }
      })
      .catch(() => null);
  }

  // Morphed state: the viewer has this item in their own line → the accent quick-qty stepper.
  if (inCart) {
    return (
      <span
        // Pop on mount (the prototype's `.stp{animation:pop}`); reuses `.mms-pop` + its reduced-motion gate.
        className={`mms-qty-stepper${shouldAnimate ? " mms-pop" : ""}`}
      >
        <button
          ref={minusBtnRef}
          type="button"
          className="mms-stepper-btn"
          disabled={frozen}
          aria-label={qty === 1 ? `Remove ${name}` : `Remove one ${name}`}
          onClick={decrement}
        >
          <span aria-hidden>−</span>
        </button>
        {/* Accessible quantity = a REAL `.sr-only` text node (an aria-label on a roleless span isn't
            reliably exposed); NOT a live region, so it never announces per tap. The visible digit is
            aria-hidden + keyed on qty so it remounts → replays `.mms-pop` (RM-gated) — purely visual. */}
        <span className="mms-qty-val">
          <span className="sr-only">
            {name}, quantity {qty}
          </span>
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
          ref={plusBtnRef}
          type="button"
          className="mms-stepper-btn"
          // Sold-out disables "+" (a now-86'd line can't grow — only shrink via "−"), as does max/lock/settle.
          // NOT the in-flight `busy` — the stepper stays live across writes. Uses the LIVE cart `line.soldOut`
          // (fresher than the page-render menu prop) so a freshly-86'd line can't keep incrementing this session.
          disabled={frozen || liveSoldOut || qty >= MAX_QTY}
          aria-label={
            liveSoldOut
              ? `${name} is sold out`
              : qty >= MAX_QTY
                ? `Maximum ${MAX_QTY} ${name}`
                : `Add another ${name}`
          }
          onClick={() => increment(false)}
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
        increment(true);
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
