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
