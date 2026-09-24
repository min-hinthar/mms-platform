/**
 * Phase 1c · cart-motion — the pure half of a removed line's exit on /cart.
 *
 * Presentation only. Nothing here reads, derives or forwards an amount: the list the renderer shows
 * is the optimistic list, and a GHOST is a snapshot of a row as it was last drawn, rendered inert
 * while it fades. The DOM half (measure, FLIP, the tap hold, focus) lives in
 * `components/useLineMotion.ts`; every decision it makes about WHICH rows are leaving, WHERE a ghost
 * sits, and WHERE focus lands is a value computed here, so each rule is falsified by a value rather
 * than by a render plus five mocks.
 *
 * Identity is the line id across the WHOLE list, never id + section: a line re-routed from one
 * section to another is a move, not a removal, and must never leave a ghost behind.
 */

/** A row that has left the live list but is still drawn while it fades. `after` is the id of the row
 *  it sits after, inside its OWN section (null = first in its section). */
export type Leaving<T> = { item: T; after: string | null };

export type LineMotionState<T> = { leaving: Leaving<T>[]; gone: string[] };

/** How many removed ids are remembered for "did it come back?". A refusal lands within a round trip,
 *  so this only has to outlast the few most recent removals; the cap keeps a long stay bounded. */
const GONE_CAP = 64;

/**
 * The next motion state for a live list that went from `prev` to `next`.
 *
 *  1. `reset` (the view changed: order ⇄ bill ⇄ pay ⇄ settle) → everything empty.
 *  2. `removed` = prev ids absent from next, in prev order — every removal, ghosted or not, because
 *     the focus rule needs to know about a row that unmounted outright.
 *  3. `returned` = next ids that were leaving or recently gone (a refused removal coming back).
 *  4. `leaving` = existing leavers not live again, plus each newly removed row whose section still
 *     has a live row. Its anchor is the nearest PRECEDING row of the same section in the list as it
 *     was drawn (live + leavers), so the ghost stays exactly where the diner last saw it.
 *  5. An emptied list keeps no ghost: the view swaps structurally to the empty state.
 *  6. `gone` = (gone ∪ removed) − next, the most recent GONE_CAP.
 */
export function reconcileLines<T extends { id: string }>(
  prev: readonly T[],
  next: readonly T[],
  state: LineMotionState<T>,
  opts: { group: (t: T) => string; reset: boolean },
): LineMotionState<T> & { removed: string[]; returned: string[] } {
  if (opts.reset) return { leaving: [], gone: [], removed: [], returned: [] };
  const nextIds = new Set(next.map((t) => t.id));
  const removedItems = prev.filter((t) => !nextIds.has(t.id));
  const removed = removedItems.map((t) => t.id);

  const wasLeaving = new Set(state.leaving.map((l) => l.item.id));
  const wasGone = new Set(state.gone);
  const returned = next.filter((t) => wasGone.has(t.id) || wasLeaving.has(t.id)).map((t) => t.id);

  const gone = [...new Set([...state.gone, ...removed])]
    .filter((id) => !nextIds.has(id))
    .slice(-GONE_CAP);
  // An emptied list swaps to the empty state in one frame; a ghost there would keep the review
  // branch (its Pay CTA and a stale sum) mounted over an empty basket.
  if (next.length === 0) return { leaving: [], gone, removed, returned };

  const leaving: Leaving<T>[] = state.leaving.filter((l) => !nextIds.has(l.item.id));
  const liveGroups = new Set(next.map(opts.group));
  // The list as it was drawn before this change — the ground truth for "what sat above it".
  const drawn = mergeLeaving(prev, state.leaving);
  for (const item of removedItems) {
    if (leaving.some((l) => l.item.id === item.id)) continue;
    const g = opts.group(item);
    if (!liveGroups.has(g)) continue; // its section empties: no ghost (the section itself goes)
    const at = drawn.findIndex((r) => r.item.id === item.id);
    let after: string | null = null;
    for (let i = at - 1; i >= 0; i -= 1) {
      const r = drawn[i]!;
      if (opts.group(r.item) === g) {
        after = r.item.id;
        break;
      }
    }
    leaving.push({ item, after });
  }
  return { leaving, gone, removed, returned };
}

/**
 * The rows to draw: the live rows in live order, with each leaver placed after its anchor. Leavers
 * anchored to null, or to a row that is neither live nor leaving, go first. After each placed row,
 * the leavers anchored to it follow, recursively, in insertion order. A leaver whose id is live
 * again is skipped — the live row wins — so every output id is unique.
 */
export function mergeLeaving<T extends { id: string }>(
  live: readonly T[],
  leaving: readonly Leaving<T>[],
): { item: T; leaving: boolean }[] {
  const liveIds = new Set(live.map((t) => t.id));
  const ghosts = leaving.filter((l) => !liveIds.has(l.item.id));
  const known = new Set([...liveIds, ...ghosts.map((l) => l.item.id)]);
  const roots: Leaving<T>[] = [];
  const children = new Map<string, Leaving<T>[]>();
  for (const l of ghosts) {
    if (l.after === null || !known.has(l.after)) roots.push(l);
    else children.set(l.after, [...(children.get(l.after) ?? []), l]);
  }
  const out: { item: T; leaving: boolean }[] = [];
  const placed = new Set<string>();
  const follow = (id: string) => {
    for (const l of children.get(id) ?? []) place(l);
  };
  const place = (l: Leaving<T>) => {
    if (placed.has(l.item.id)) return;
    placed.add(l.item.id);
    out.push({ item: l.item, leaving: true });
    follow(l.item.id);
  };
  for (const l of roots) place(l);
  for (const t of live) {
    out.push({ item: t, leaving: false });
    follow(t.id);
  }
  return out;
}

/** Drop one leaver; any leaver anchored to it takes over its anchor, so the order never jumps. */
export function dropLeaving<T extends { id: string }>(
  leaving: readonly Leaving<T>[],
  id: string,
): Leaving<T>[] {
  const gone = leaving.find((l) => l.item.id === id);
  if (!gone) return leaving as Leaving<T>[];
  return leaving
    .filter((l) => l !== gone)
    .map((l) => (l.after === id ? { item: l.item, after: gone.after } : l));
}

/** The ids in the order the page draws them: section by section (`groupOrder`), live order inside. */
export function renderedOrder<T extends { id: string }>(
  items: readonly T[],
  group: (t: T) => string,
  groupOrder: readonly string[],
): string[] {
  return groupOrder.flatMap((g) => items.filter((i) => group(i) === g)).map((i) => i.id);
}

/**
 * Where focus lands when `from` leaves: the next row in `order` that is still live, else the nearest
 * one before it, else null (nothing left — the caller's view swaps and its heading takes focus).
 */
export function landingAfter(
  order: readonly string[],
  from: string,
  live: ReadonlySet<string>,
): string | null {
  const at = order.indexOf(from);
  if (at < 0) return null;
  for (let i = at + 1; i < order.length; i += 1) if (live.has(order[i]!)) return order[i]!;
  for (let i = at - 1; i >= 0; i -= 1) if (live.has(order[i]!)) return order[i]!;
  return null;
}

/**
 * Did a line that was a draft get FIRED (still here, no longer a draft)? A removal — an id absent
 * from `live` — is never a firing: removals have their own focus rule, keyed on ids.
 */
export function firedSince(
  prevDraft: readonly string[],
  live: ReadonlySet<string>,
  draft: ReadonlySet<string>,
): boolean {
  return prevDraft.some((id) => live.has(id) && !draft.has(id));
}
