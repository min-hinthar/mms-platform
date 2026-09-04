"use client";
import { useCallback, useRef, useState } from "react";
import { useCart } from "@/components/TableCartProvider";
import { mayRetry } from "@/lib/write-outcome";
import { haptic } from "@/lib/haptics";
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
  const { add, announce, cartId, lastRefusalNotice, loading } = useCart();
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
  // ⚠️ T14 — THIS CARD DELIBERATELY DOES NOT GATE ON A CACHED FREEZE (Codex round 2 on #248).
  //
  // The first draft refused a frozen tap here, "like its siblings". That is the same defect the
  // provider's pre-write gate had, and it is worse on this control: `assertCartMember` computes the
  // lock as `locked_at > now - CART_LOCK_TTL_MS`, so it expires by the PASSAGE OF TIME with no row
  // write — no realtime event, and a tab that stays visible never hits the visibility refresh
  // either. A gate here therefore intercepts the tap that would have corrected the stale copy, and
  // the CTA can sit unusable indefinitely on a cart the server would accept.
  //
  // So the tap goes to the server, and `TableCartProvider`'s `explainCaught` re-reads and names what
  // that read established. The failure arm below carries that sentence rather than inventing one.
  // (`AddButton` and `ItemSheet` still hold pre-existing gates of this shape — filed as T20, not
  // widened into here.)

  const addAll = useCallback(async () => {
    // Early return rather than `disabled` — see note 3. The control stays focusable throughout.
    if (busy || allIn || notReady || items.length === 0) return;
    setBusy(true);
    haptic("add");
    // Dishes whose write committed but whose result we could not SEE. They are not re-sendable, so
    // the loop moves past them — but the closing sentence must not count them as landed.
    let unseen = 0;
    try {
      for (let i = doneCount; i < items.length; i += 1) {
        const item = items[i];
        if (!item) break;
        const res = await add(item.id);
        // ⚠️ THIS LOOP IS THE REASON T26 EXISTS. It used to test `res === null`, and `null` meant
        // BOTH "refused" and "committed, view unreadable" — so a dish that HAD landed took the arm
        // below, which sets `doneCount` to resume at this index, and the diner's retry added it a
        // second time. A duplicate line on a real bill, from a tap that worked.
        //
        // `mayRetry` is the only question that may gate a resend: it is true for `refused` alone,
        // where the cart was actually read and this dish was not in it.
        if (!mayRetry(res)) {
          // Committed, or committed-but-unseen. Either way the write is NOT re-sendable, so move
          // past it. `unconfirmed` additionally may not be CLAIMED — hence the tally.
          if (res.state === "unconfirmed") unseen += 1;
          continue;
        }
        {
          // ⚠️ THIS ARM USED TO OVERWRITE THE ESTABLISHED CAUSE WITH DEAD ADVICE (adversarial round
          // 1 on #248). The provider has just re-read the cart and published what it found through
          // the SAME single-slot live region; announcing here replaces it, and "try it from the menu
          // below" points at a menu that is frozen too — the exact string this slice removed one
          // layer down. So carry the provider's sentence when there is one, and only name what
          // landed. A freeze can arrive DURING this loop, so the tap-time gate above cannot cover
          // it: the first dish succeeds, the second is refused, and this is the arm that runs.
          const cause = lastRefusalNotice();
          const landed = i > 0 ? `Added ${items[0]?.name ?? ""} — ` : "";
          announce(
            cause
              ? `${landed}${item.name} didn’t go through. ${cause}`
              : `${landed}we couldn’t add ${item.name} just now.`,
          );
          setDoneCount(i); // resume here, so a retry never re-adds what already landed
          return;
        }
      }
      setDoneCount(items.length);
      // ⚠️ ONLY CLAIM WHAT WE SAW (T26). Every dish was sent and none may be re-sent, so the loop
      // completed — but a write whose view we never read is not a landing we can assert, and this
      // is the same single live region the provider speaks through. Naming the cart as the place to
      // check is honest and actionable; "Added 5 to your order" over an outage is neither.
      announce(
        unseen > 0
          ? `${dishes} sent — we couldn’t confirm all of them. Check your order below.`
          : `Added ${dishes} to your order.`,
      );
    } finally {
      setBusy(false);
      // Keep focus where the diner put it; the button is never disabled, so this is a no-op in the
      // common case and a repair if a re-render moved things.
      btnRef.current?.focus({ preventScroll: true });
    }
  }, [add, announce, allIn, busy, dishes, doneCount, items, lastRefusalNotice, notReady]);

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
        aria-disabled={busy || allIn || notReady}
        /* The visible label is short; the accessible name names the dishes, so a screen-reader diner
           hears WHAT is being added without hunting for the line above. It tracks the visible text
           rather than contradicting it (WCAG 2.5.3 — label in name). */
        aria-label={allIn ? `${dishes} added to your order` : `${text} — ${dishes}`}
      >
        {text}
      </button>
    </section>
  );
}
