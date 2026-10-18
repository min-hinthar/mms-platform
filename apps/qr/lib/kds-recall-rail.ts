/**
 * The lifecycle audit (2026-10-13) — the KDS's Bring-back rail with two kinds of chip, and ONE rule
 * for how many of each it keeps.
 *
 * The rail has held the last five bumped CARDS since SPEC-KDS §4 ("last 5"), and B6 / PATH_DESIGN
 * decision 15 keeps that capacity for cards: a mis-bumped card is the expensive mistake, and its chip
 * must stand for the whole recall window. A per-line Done now leaves a DISH chip too — so a busy pass
 * bumping single dishes must never push a card's chip off the rail inside its two minutes. The two
 * kinds are capped SEPARATELY: cards at `CARD_CHIPS`, dishes at `DISH_CHIPS`, and a dish never counts
 * against a card.
 *
 * Pure: the board owns the entries; this only decides which stay, newest first.
 */
export const CARD_CHIPS = 5; // SPEC-KDS §4 — unchanged for cards
export const DISH_CHIPS = 3;

export type RailChip = { key: string; scope?: "line" };

/** The rail after `entry` lands: newest first, each kind on its own cap — a dish chip never evicts a
 *  card chip, and a card chip never evicts a dish chip. */
export function railWith<T extends RailChip>(prev: readonly T[], entry: T): T[] {
  let cards = 0;
  let dishes = 0;
  return [entry, ...prev].filter((r) =>
    r.scope === "line" ? dishes++ < DISH_CHIPS : cards++ < CARD_CHIPS,
  );
}
