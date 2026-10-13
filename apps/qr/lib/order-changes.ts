import type { CartItem } from "@mms/db";

/**
 * Lifecycle audit (out-of-stock 2 · diner-live-status 3 · edit-notes 7) — what CHANGED in a diner's
 * order between two confirmed views, when someone ELSE changed it. Pure: the provider and /cart only
 * feed it the previous and the next view and speak the sentence through their one region.
 *
 * Before this, a re-read was applied in silence. Realtime announced only a tablemate's INSERT, so:
 *
 *   • staff voiding a dish — "we ran out" — reached the table as a struck "Removed" on /cart and a
 *     dish silently vanishing from the menu's kitchen strip; nobody was prompted to pick another;
 *   • the host trashing a guest's unsent dish, or a server stepping its quantity or clearing its
 *     allergy note, changed the guest's own line under them with no word at all;
 *   • a dish a server added to the table appeared on every phone unexplained.
 *
 * WHAT IS NEVER SAID: a change THIS phone made. The caller passes the line ids and dishes its own
 * writes are in flight on (`pending`); their effect lands in the very view that is diffed, and
 * "Mohinga is now 2" read back to the diner who just tapped "+" is the noise this rule exists to
 * avoid. A Send firing lines (draft → fired) is not a change to WHAT is ordered, and has its own
 * announcement. A comp is not announced here (it changes nothing the diner must act on).
 */
export type OrderChange =
  /** Staff removed a line from the order (any seat's — it is the table's order). */
  | { kind: "removed_by_staff"; name: string; soldOut: boolean }
  /** The viewer's own unsent dish is gone — the host or a server took it off. */
  | { kind: "own_removed"; name: string }
  /** The viewer's own unsent dish's quantity moved. */
  | { kind: "own_qty"; name: string; qty: number }
  /** The note on the viewer's own unsent dish was cleared or changed. */
  | { kind: "own_note"; name: string; cleared: boolean }
  /** A server added a dish to the order (no seat — `by_seat` null is "added by server"). */
  | { kind: "staff_added"; name: string };

export type PendingWrites = { lineIds: ReadonlySet<string>; dishes: ReadonlySet<string> };

/** Is this line one THIS phone has a write in flight on (by id, or by the dish an add targets)? */
function ours(line: CartItem, pending: PendingWrites): boolean {
  return pending.lineIds.has(line.id) || pending.dishes.has(line.menuItemId);
}

/**
 * The changes, in the order they are said: removals by staff first (a dish the table will not get
 * is the fact that most needs saying), then what happened to the viewer's own dishes, then additions.
 */
export function orderChanges(
  prev: ReadonlyArray<CartItem>,
  next: ReadonlyArray<CartItem>,
  mySeat: string | null,
  pending: PendingWrites,
): OrderChange[] {
  const before = new Map(prev.map((l) => [l.id, l]));
  const after = new Map(next.map((l) => [l.id, l]));
  const voids: OrderChange[] = [];
  const own: OrderChange[] = [];
  const added: OrderChange[] = [];

  for (const n of next) {
    const p = before.get(n.id);
    if (p === undefined) {
      // A server's addition. A diner's add carries their seat (and a tablemate's is announced by
      // realtime with their name); only a seatless line is "our staff". #362 (Codex round 1): only
      // the LINE hold applies to it, never the dish hold — every diner add path writes the verified
      // seat (only `staffAddItem` passes null), so a seatless line can never be this phone's own
      // add, and a dish hold matching it swallowed a server's addition of the same dish.
      if (!n.bySeat && n.lineState !== "voided" && !pending.lineIds.has(n.id))
        added.push({ kind: "staff_added", name: n.name });
      continue;
    }
    if (p.lineState !== "voided" && n.lineState === "voided") {
      voids.push({
        kind: "removed_by_staff",
        name: n.name,
        soldOut: n.removedReason === "sold_out",
      });
      continue;
    }
    // The viewer's OWN unsent dish, changed by someone else.
    if (
      !mySeat ||
      p.bySeat !== mySeat ||
      n.bySeat !== mySeat ||
      p.lineState !== "draft" ||
      n.lineState !== "draft" ||
      ours(n, pending)
    )
      continue;
    if (n.qty !== p.qty) own.push({ kind: "own_qty", name: n.name, qty: n.qty });
    if ((n.notes ?? null) !== (p.notes ?? null))
      own.push({ kind: "own_note", name: n.name, cleared: !n.notes });
  }

  // The viewer's own unsent dish that is GONE (a deletion — a void keeps the row).
  if (mySeat)
    for (const p of prev) {
      if (after.has(p.id)) continue;
      if (p.bySeat !== mySeat || p.lineState !== "draft" || ours(p, pending)) continue;
      own.push({ kind: "own_removed", name: p.name });
    }

  return [...voids.sort((a, b) => soldOutFirst(a) - soldOutFirst(b)), ...own, ...added];
}

function soldOutFirst(c: OrderChange): number {
  return c.kind === "removed_by_staff" && c.soldOut ? 0 : 1;
}

/** One change, as its own sentence — plain words (DESIGN-LANGUAGE §5: never "void", never "86"). */
export function orderChangeSentence(c: OrderChange): string {
  switch (c.kind) {
    case "removed_by_staff":
      return c.soldOut
        ? `We ran out of ${c.name} — it’s off your order.`
        : `Our staff removed ${c.name} from your order.`;
    case "own_removed":
      return `${c.name} was taken off your order.`;
    case "own_qty":
      return `${c.name} on your order is now ${c.qty}.`;
    case "own_note":
      return c.cleared
        ? `The note on ${c.name} was removed.`
        : `The note on ${c.name} was changed.`;
    case "staff_added":
      return `Our staff added ${c.name} to your order.`;
  }
}

/**
 * ONE sentence for the whole re-read, never a toast per change: the view's region is single-slot,
 * and five toasts in a row would each erase the last before it could be read. Two changes are both
 * said; more say the first and count the rest, pointing at the order where every one of them shows.
 */
export function orderChangeNotice(changes: ReadonlyArray<OrderChange>): string | null {
  const [first, second] = changes;
  if (!first) return null;
  if (!second) return orderChangeSentence(first);
  if (changes.length === 2) return `${orderChangeSentence(first)} ${orderChangeSentence(second)}`;
  const more = changes.length - 1;
  return `${orderChangeSentence(first)} And ${more} more change${more === 1 ? "" : "s"} — check your order.`;
}
