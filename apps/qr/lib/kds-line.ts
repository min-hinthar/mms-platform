import type { KitchenLine, KitchenTicket } from "./kitchen-types";

/**
 * Phase 2b · kitchen — the decisions one KDS food line makes, pure (no React, no I/O), so each is
 * falsified by a value (`kds-line.test.ts`) and mutated by `verify:slice`.
 *
 * K22's defect was an 86 one tap away under every line; Phase 2b puts it behind the line's ⋯ and a
 * sheet. Everything the row, the ⋯, the sheet and the two tap handlers must agree on is decided
 * here ONCE: whether a line can be 86'd, which line the open sheet is about (the LIVE one), what the
 * line button is described by, and the board's confirmed-override of a dish's sold-out flag.
 *
 * The same-gesture rule is NOT restated here: callers use `removeHeld` / `SAME_GESTURE_MS` from
 * `@mms/ui` (DESIGN-LANGUAGE §24) — a second copy of a one-line rule is the drift it forbids.
 */

/**
 * The ONE offer rule: a line can be 86'd when it is a menu dish (a grocery barcode has no
 * `menuItemId`, and there is nothing to 86 about a packaged item) that is not already off the menu.
 * Read by the row (render the ⋯), the sheet (the action or the statement) and both tap handlers.
 */
export function canEightySix(line: Pick<KitchenLine, "menuItemId" | "soldOut">): boolean {
  return line.menuItemId !== null && !line.soldOut;
}

/**
 * The LIVE line with this id, searched across EVERY ticket (never the station-filtered view: a cook
 * who switches the station chip with the sheet open is still looking at the same dish), or null
 * once it has left the board. The sheet's subject and the source of `expectedSoldOut` — a captured
 * copy would miss a sold-out flag another console set while the sheet was open.
 */
export function lineMenuSubject(
  tickets: readonly KitchenTicket[],
  lineId: string | null,
): KitchenLine | null {
  if (lineId === null) return null;
  for (const t of tickets) for (const l of t.lines) if (l.id === lineId) return l;
  return null;
}

/**
 * The line button's `aria-describedby`: the held ticket's slot line first (WHY the tap refuses),
 * then the dish's kitchen note. `undefined` when neither exists — never an empty attribute, which
 * names nothing and reads as a broken promise to an audit.
 */
export function lineDescribedBy(ids: { slot?: string; note?: string }): string | undefined {
  const parts = [ids.slot, ids.note].filter((id): id is string => !!id);
  return parts.join(" ") || undefined;
}

/**
 * The board's confirmed override of a dish's sold-out flag (menu-3's shape, with its blind pass's
 * correction). `afterSeq` is the latest poll sequence that had STARTED when the server confirmed.
 */
export type SoldOutOverride = { soldOut: boolean; afterSeq: number };

/** Record a server-confirmed flag for `menuItemId` — a new Map, the entry replaced. */
export function recordSoldOut(
  prev: ReadonlyMap<string, SoldOutOverride>,
  menuItemId: string,
  soldOut: boolean,
  afterSeq: number,
): ReadonlyMap<string, SoldOutOverride> {
  const next = new Map(prev);
  next.set(menuItemId, { soldOut, afterSeq });
  return next;
}

/**
 * Drop every override a snapshot supersedes: one whose fetch STARTED after the confirmation
 * (`snapshotSeq > afterSeq`) is the truth, WHATEVER it says. A poll already in flight at the write
 * (`snapshotSeq === afterSeq`) cannot resurrect the ⋯ on a dish the board just took off.
 *
 * ⚠️ Never "until the snapshot agrees": that pins a false verb forever the moment a second writer
 * (/staff/menu, another tablet) moves the dish inside the window — the defect the menu-3 blind pass
 * found in `MenuPriceEditor`. Returns `prev` ITSELF when nothing drops, so a caller's state setter
 * bails out instead of re-rendering the board on every poll.
 */
export function pruneSoldOut(
  prev: ReadonlyMap<string, SoldOutOverride>,
  snapshotSeq: number,
): ReadonlyMap<string, SoldOutOverride> {
  let next: Map<string, SoldOutOverride> | null = null;
  for (const [id, o] of prev) {
    if (snapshotSeq > o.afterSeq) {
      next ??= new Map(prev);
      next.delete(id);
    }
  }
  return next ?? prev;
}

/**
 * The tickets as the board KNOWS them: the snapshot with every confirmed override laid over each
 * line of that dish (on every ticket). The ONE binding every consumer reads — the row, the tag, the
 * ⋯, the sheet's subject, `expectedSoldOut` and the line's accessible name. Untouched lines and
 * tickets stay the same objects, and an empty map returns the input array itself.
 */
export function overlaySoldOut(
  tickets: readonly KitchenTicket[],
  overrides: ReadonlyMap<string, SoldOutOverride>,
): readonly KitchenTicket[] {
  if (overrides.size === 0) return tickets;
  return tickets.map((t) => {
    let changed = false;
    const lines = t.lines.map((l) => {
      const o = l.menuItemId === null ? undefined : overrides.get(l.menuItemId);
      if (o === undefined || o.soldOut === l.soldOut) return l;
      changed = true;
      return { ...l, soldOut: o.soldOut };
    });
    return changed ? { ...t, lines } : t;
  });
}
