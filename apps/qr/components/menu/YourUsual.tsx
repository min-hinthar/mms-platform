"use client";
import { useState } from "react";
import { useCart } from "@/components/TableCartProvider";
import { haptic } from "@/lib/haptics";
import { USUAL_HEADING, usualAction, usualDishes, type UsualOutcome } from "@/lib/menu/your-usual";

/**
 * W22e — the recognition card on the arrival beat.
 *
 * Everything it CLAIMS is decided in `lib/menu/your-usual.ts` (counted, tie-aware, availability-gated
 * — see the five rules there). This component only renders the outcome and performs the add, so a
 * future edit cannot loosen the honesty bar from here.
 *
 * ⚠️ NO NEW MONEY SURFACE. The add goes through the cart context's `add`, which is the same
 * server-authoritative path the menu row and the item sheet use: the client sends an item id, the
 * server re-derives the price. This card never sees or quotes an amount — deliberately. A recognition
 * card that also stated a total would be a second money surface to keep true, and it would have to
 * re-derive a number the cart already owns.
 *
 * Adds are SERIALIZED (awaited in sequence), not fired in parallel. `insertOrIncLine` is
 * status-atomic per line, but two concurrent adds against a cart that closes mid-flight can land on
 * opposite sides of the guard — one in, one refused — leaving the diner with half of what the button
 * offered and no way to tell which half. One at a time, and the first refusal stops the rest.
 */
export function YourUsual({ outcome }: { outcome: UsualOutcome }) {
  const { add, announce } = useCart();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (outcome.state === "none") return null;

  const dishes = usualDishes(outcome);
  const label = usualAction(outcome);

  const addAll = async () => {
    if (busy || done) return;
    setBusy(true);
    // `pick`, not `commit`: this is one tap adding a known dish, the same weight as the Add pill.
    haptic("add");
    try {
      for (const item of outcome.items) {
        const res = await add(item.id);
        // `add` resolves null on a refused write (a closed or locked cart). Stop rather than press
        // on — the second dish would refuse for the same reason, and two identical failures read as
        // a broken button instead of a closed cart.
        if (res === null) {
          announce("We couldn’t add that just now — try from the menu below.");
          return;
        }
      }
      setDone(true);
      // `dishes` already reads correctly for one or two ("Mohinga" / "Mohinga + Tea"), so one
      // sentence covers both — no branch that returns the same string twice.
      announce(`Added ${dishes} to your order.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="usual-card mms-rise" aria-labelledby="usual-h">
      <p className="usual-kicker" id="usual-h">
        <span aria-hidden>✦</span> {USUAL_HEADING}
      </p>
      <p className="usual-dishes">{dishes}</p>
      <button
        type="button"
        className="usual-add"
        onClick={addAll}
        disabled={busy || done}
        /* The visible label is short ("Add both"); the accessible name names the dishes, so a screen
           reader user hears WHAT is being added without having to hunt for the line above. */
        aria-label={done ? `${dishes} added to your order` : `${label} — ${dishes}`}
      >
        {done ? "Added ✓" : busy ? "Adding…" : label}
      </button>
    </section>
  );
}
