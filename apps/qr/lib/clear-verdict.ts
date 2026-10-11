/**
 * PD7 (m7 STATES "GO", narrowed by appendix B6) — whether a floor card shows the QUIET hint "Clear
 * when they leave": a paid, finished table the floor can vouch for. Decided ONCE, from fields the
 * floor already carries, never re-derived at a call site. Only a hint inside the card's link — the
 * one-tap verb lives in the table's pane, where it answers a question Dad has started (B6: the slab
 * claimed "They've left" on every paid card five minutes after its last dish, whether or not the
 * party was still at tea — time-driven escalation the loudness ladder forbids).
 *
 * All must hold:
 *   - the table PAID (`status === "paid"`: a settled order rests on it) with no refund — a refunded
 *     table never wears the success tone, and it clears from the pane (K33);
 *   - no running bill (`tab === "none"`) and nothing on an open cart (`itemCount === 0` — a paid
 *     table that started a second round is ordering again);
 *   - the kitchen is done with it: nothing unsent, nothing cooking, nothing served in the last five
 *     minutes (`up`, the wall's linger) — a family eating is never told to leave. A `null` kitchen is
 *     the fold's own "nothing on it is unsent, cooking, ready or served" (`foldFloorKitchen`): done;
 *   - the kitchen read is KNOWN: an unknown read (`kitchenUnknown`, the poll's own flag) is never
 *     "go" — the one place "unknown" lives, never inferred from a null.
 */
import type { FloorKitchen, FloorStatus } from "./floor-types";
import type { RefundState } from "./refund-view";

export type ClearVerdictInput = {
  status: FloorStatus;
  refundState: RefundState | null;
  tab: "none" | "trust" | "secure";
  itemCount: number;
  kitchen: Pick<FloorKitchen, "notSent" | "inKitchen" | "up"> | null;
  kitchenUnknown: boolean;
};

export function clearHint(t: ClearVerdictInput): boolean {
  if (t.status !== "paid") return false;
  if (t.refundState === "partial" || t.refundState === "full") return false;
  if (t.tab !== "none" || t.itemCount > 0) return false;
  if (t.kitchenUnknown) return false;
  const k = t.kitchen;
  return k === null || (k.notSent === 0 && k.inKitchen === 0 && k.up === 0);
}
