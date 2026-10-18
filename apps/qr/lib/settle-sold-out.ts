import type { UnavailableLine } from "./availability";

/**
 * The lifecycle audit (2026-10-13) — a SOLD-OUT draft at a staff payment door: a re-warning, never a
 * block (PD8's acknowledged-ids pattern, PATH_DESIGN decision 4; `settle-approvals.ts`).
 *
 * The staff unsent gate counts only dine-in drafts, so a to-go draft at a table or a counter order's
 * draft went through cash, the reader or a card-on-file close with its dish 86'd since it was added:
 * the guest was charged for it, and settlement then fired it to a kitchen that cannot make it. The
 * first fix REFUSED the payment; a hard refusal blocks money at the register on our own say-so, and
 * every staff settle-door refusal so far has been the owner's call (decisions 3 and 5a, PD8's
 * "a re-warning, never a block"). So it warns instead, exactly like a dish waiting for a manager:
 *
 *   · the page names the sold-out drafts above the doors, Remove first ("Mohinga is sold out —
 *     remove it from the order, or take payment anyway");
 *   · the tap carries the dishes it DISPLAYED (`acknowledgedSoldOutIds` — menu item ids, the unit the
 *     sold-out fact is about), plus what this door's own last re-warning carried (`ackForTap`);
 *   · the server refuses `sold_out_unseen` ONLY for a sold-out draft the tap did not display — the
 *     door names it, and the next tap passes. So staff always SEE it before money moves;
 *   · an acknowledged settle goes through, and settlement still fires the dish (no migration): the
 *     KDS line wears the sold-out tag it already draws, and the warning says "tell the cook";
 *   · an UNREADABLE availability read follows PD8's `approval_unreadable`: the staff doors fail
 *     closed with a retry sentence (P2dc, owner decision 5a) — `sold_out_unreadable`.
 *
 * Whether to refuse instead (a hard block at the register) is the owner's question (OPEN-ITEMS K50).
 * Pure: the read is `availability-read.ts`; the doors decide nothing about amounts here.
 */

/** One sold-out dish as the door names it: the menu item's id and its name. */
export type SoldOutDish = UnavailableLine;

/** `unseen`: the dishes the tap did not display (they cause the refusal); `all`: every sold-out draft
 *  on the cart (the refusal carries them all, so the next tap acknowledges what the door names). */
export type SoldOutSettleVerdict =
  | null
  | "unreadable"
  | { unseen: SoldOutDish[]; all: SoldOutDish[] };

/** The compare: the read's sold-out drafts against the dishes this tap acknowledged. */
export function staffSettleSoldOutVerdict(
  read: { ok: true; lines: readonly SoldOutDish[] } | { ok: false },
  acknowledged: readonly string[],
): SoldOutSettleVerdict {
  if (!read.ok) return "unreadable";
  const seen = new Set(acknowledged);
  const unseen = read.lines.filter((l) => !seen.has(l.id));
  return unseen.length === 0 ? null : { unseen, all: [...read.lines] };
}

/** What a re-warning NAMES: the dishes this tap did not acknowledge (they caused the refusal). */
export function soldOutWarned(
  dishes: readonly SoldOutDish[],
  acknowledged: readonly string[],
): string {
  const seen = new Set(acknowledged);
  const fresh = dishes.filter((d) => !seen.has(d.id));
  return (fresh.length > 0 ? fresh : dishes).map((d) => d.name).join(", ");
}

/** Plain words for a bundle older than the typed code; every current client says the dictionary's. */
export const SOLD_OUT_UNSEEN_REFUSAL =
  "A dish on this order is sold out — remove it, or tap again to take payment with it.";

export type SoldOutUnseenRefusal = {
  ok: false;
  error: string;
  code: "sold_out_unseen";
  /** EVERY sold-out draft on the cart (not only the unseen ones): the next tap acknowledges them all. */
  dishes: SoldOutDish[];
};

export function soldOutUnseenRefusal(dishes: readonly SoldOutDish[]): SoldOutUnseenRefusal {
  return {
    ok: false,
    error: SOLD_OUT_UNSEEN_REFUSAL,
    code: "sold_out_unseen",
    dishes: [...dishes],
  };
}

export const SOLD_OUT_UNREADABLE_REFUSAL = "Couldn’t check what’s sold out — try again.";

export type SoldOutUnreadableRefusal = { ok: false; error: string; code: "sold_out_unreadable" };

export function soldOutUnreadableRefusal(): SoldOutUnreadableRefusal {
  return { ok: false, error: SOLD_OUT_UNREADABLE_REFUSAL, code: "sold_out_unreadable" };
}

/** The sold-out drafts a page displays above its doors (one per dish; the ids its doors acknowledge). */
export function displayedSoldOut(
  lines: readonly { state: string; soldOut: boolean; menuItemId: string | null }[],
): string[] {
  return [
    ...new Set(
      lines
        .filter((l) => l.state === "draft" && l.soldOut && l.menuItemId !== null)
        .map((l) => l.menuItemId as string),
    ),
  ];
}
