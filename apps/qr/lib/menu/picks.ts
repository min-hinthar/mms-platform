/**
 * Phase 1a — which lenses the menu's picks row offers, in order. Pure, so the precedence rules the
 * row depends on can be watched failing without a render.
 *
 *  · `favorites` first, and only when the diner has hearted something that fits right now (J5: a
 *    returning diner's own shortlist beats our guidance).
 *  · `popular` when the most-ordered set has anything that fits (M135 — the POS export).
 *  · `surprise` whenever there is anything at all to draw from.
 *
 * A lens with nothing to show is never OFFERED — a pill that opens an empty row is a dead control.
 */
export type PicksLens = "favorites" | "popular" | "surprise";

export function picksLenses(counts: {
  favorites: number;
  popular: number;
  pool: number;
}): PicksLens[] {
  const out: PicksLens[] = [];
  if (counts.favorites > 0) out.push("favorites");
  if (counts.popular > 0) out.push("popular");
  if (counts.pool > 0) out.push("surprise");
  return out;
}

/**
 * The lens the row shows. The diner's choice holds while it still has something to show; otherwise
 * the first offered lens — so a dietary filter that empties the chosen lens never strands the row on
 * nothing. The row PINS its opening lens at mount (the component seeds `chosen` with it), so a first
 * heart mid-browse adds a Favorites pill without yanking the row out from under the diner.
 */
export function resolveLens(chosen: PicksLens | null, offered: PicksLens[]): PicksLens | null {
  return chosen && offered.includes(chosen) ? chosen : (offered[0] ?? null);
}

/**
 * How many dishes a Surprise draw could actually produce (Codex round 1 on #300): the draw never
 * picks a dish the diner already hearted (`surpriseMe`), so a pool that is ALL hearts is an empty
 * lens — and an empty lens is never offered.
 */
export function surpriseEligible(
  pool: readonly { id: string }[],
  hearted: ReadonlySet<string>,
): number {
  return pool.filter((i) => !hearted.has(i.id)).length;
}
