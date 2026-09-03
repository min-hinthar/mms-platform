"use client";
import { useCallback, useRef, useState } from "react";
import { useCart } from "@/components/TableCartProvider";
import { haptic } from "@/lib/haptics";
import { inertReason } from "@/lib/inert-reason";
import { USUAL_HEADING, usualAction, usualDishes, type UsualOutcome } from "@/lib/menu/your-usual";

/**
 * W22e — the recognition card on the arrival beat.
 *
 * Everything it CLAIMS is decided in `lib/menu/your-usual.ts` (counted by day, tie-aware,
 * offerability-gated — see the six rules there). This component only renders the outcome and performs
 * the add, so a future edit cannot loosen the honesty bar from here.
 *
 * ⚠️ NO NEW MONEY SURFACE. The add goes through the cart context's `add`, the same
 * server-authoritative path the menu row and the item sheet use: the client sends an item id, the
 * server re-derives the price. This card never sees or quotes an amount — deliberately. A recognition
 * card that also stated a total would be a second money surface to keep true.
 *
 * ── Three things the first draft got wrong, all found in review ──────────────────────────────────
 *
 * 1. **Adds are serialized AND resumable.** Serializing was right (two concurrent adds against a cart
 *    closing mid-flight can land on opposite sides of the status guard), but the first version
 *    restarted the loop from index 0 on retry — so a pair whose SECOND add failed re-added the first
 *    dish on the next tap. `doneCount` remembers how far it got.
 * 2. **A partial add says which half landed.** Announcing a bare "we couldn't add that" after one of
 *    two dishes is already in the cart is the exact failure this component's own header warned about.
 * 3. **The button never becomes `disabled` while focused.** Browsers blur a disabled element and drop
 *    focus to `<body>`, so a keyboard or screen-reader diner pressing Enter here lost their place and
 *    restarted from the top of the document (WCAG 2.4.3). `aria-disabled` + an early return keeps the
 *    control focusable and announced, which is what `AddButton` already does.
 */
export function YourUsual({ outcome }: { outcome: UsualOutcome }) {
  const { add, announce, cartId, loading, locked, lockedByName, settling } = useCart();
  const [busy, setBusy] = useState(false);
  /** How many of `items` are confirmed in the cart — the resume point, not a boolean. */
  const [doneCount, setDoneCount] = useState(0);
  const btnRef = useRef<HTMLButtonElement>(null);

  const items = outcome.state === "none" ? [] : outcome.items;
  const dishes = usualDishes(outcome);
  const allIn = items.length > 0 && doneCount >= items.length;
  // The session is still minting, so `add` would answer null for a reason that is not a failure.
  // Every other add surface (AddButton, ItemSheet) reports this state rather than firing into it.
  const notReady = loading || !cartId;
  // T14 — the freeze this card was missing. `AddButton` and `ItemSheet` have gated on `locked ||
  // settling` since W9b; this one did not, so under a peer's checkout every tap fired a write the
  // server refuses and the diner was told "we couldn't add X — try from the menu below", pointing at
  // a menu that is frozen too. Same `inertReason` vocabulary as its siblings, so one frozen cart
  // does not tell a screen-reader user three different stories.
  const frozen = locked || settling;
  const reason = inertReason({
    minting: notReady,
    locked,
    lockedByYou: lockedByName === "You",
    settling,
  });

  const addAll = useCallback(async () => {
    // Early return rather than `disabled` — see note 3. The control stays focusable throughout.
    if (busy || allIn || notReady || items.length === 0) return;
    // T14 — refuse the frozen tap here and SAY so. The provider refuses it too (one gate, both
    // sides), but a refusal announced from the control the diner actually pressed names the dishes;
    // the provider's flash cannot.
    if (frozen && reason) {
      announce(`${dishes} — ${reason}`);
      return;
    }
    setBusy(true);
    haptic("add");
    try {
      for (let i = doneCount; i < items.length; i += 1) {
        const item = items[i];
        if (!item) break;
        const res = await add(item.id);
        // `add` resolves null on a refused write (locked, settling, closed, or a lost session).
        if (res === null) {
          // Name what DID land. "We couldn't add that" after one of two dishes is already in the
          // cart is worse than silence — the diner cannot tell which half to fix.
          announce(
            i > 0
              ? `Added ${items[0]?.name ?? ""} — but we couldn’t add ${item.name}. Try it from the menu below.`
              : `We couldn’t add ${item.name} just now — try from the menu below.`,
          );
          setDoneCount(i); // resume here, so a retry never re-adds what already landed
          return;
        }
      }
      setDoneCount(items.length);
      announce(`Added ${dishes} to your order.`);
    } finally {
      setBusy(false);
      // Keep focus where the diner put it; the button is never disabled, so this is a no-op in the
      // common case and a repair if a re-render moved things.
      btnRef.current?.focus({ preventScroll: true });
    }
  }, [add, announce, allIn, busy, dishes, doneCount, frozen, items, notReady, reason]);

  if (outcome.state === "none") return null;

  const label = usualAction(outcome);
  const text = allIn ? "Added ✓" : busy ? "Adding…" : notReady ? "One moment…" : label;

  return (
    <section className="usual-card mms-rise" aria-labelledby="usual-h">
      {/* A real heading, like every sibling band (StartHereBand, TasteBand, FavoritesRail) — so this
          card is reachable by heading navigation instead of being skipped between h1 and the rails. */}
      <h2 className="usual-kicker" id="usual-h">
        <span aria-hidden>✦</span> {USUAL_HEADING}
      </h2>
      <p className="usual-dishes">{dishes}</p>
      <button
        ref={btnRef}
        type="button"
        className="usual-add"
        onClick={addAll}
        aria-disabled={busy || allIn || notReady || frozen}
        /* The visible label is short; the accessible name names the dishes, so a screen-reader diner
           hears WHAT is being added without hunting for the line above. It tracks the visible text
           rather than contradicting it (WCAG 2.5.3 — label in name). */
        aria-label={
          allIn
            ? `${dishes} added to your order`
            : frozen && reason
              ? `${text} — ${dishes} — ${reason}`
              : `${text} — ${dishes}`
        }
      >
        {text}
      </button>
    </section>
  );
}
