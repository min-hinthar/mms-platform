import type { FloorStatus } from "./floor-types";
import type { RefundState } from "./refund-view";

/**
 * Phase 2d · floor — the floor's ONE tone map (plan shared rule "TINT VOCABULARY"), read by the
 * strip's tiles, the card's status edge and the status chip, so the three can never colour one
 * table two ways.
 *
 *   ask       the table asked to pay at the counter — the one filled tile, the table waiting on you
 *   inflight  a card or a split is moving money (paying · settling)
 *   live      ordering
 *   rest      seated, nothing on it (no edge, no bar)
 *   done      paid
 *   returned  paid, and money came back (partial or full) — NEVER the success tone (K33)
 *
 * State is never carried by colour alone: the chip says the word, the tile carries a glyph.
 *
 * Its own module, not a line in `floor-status.ts`: that module reads the payment TTLs through
 * `pay-guard`, which is `server-only`, and the chip, the card and the strip are client components.
 */
export type FloorTone = "ask" | "inflight" | "live" | "rest" | "done" | "returned";

export function floorTone(
  status: FloorStatus,
  refundState: RefundState | null | undefined,
): FloorTone {
  switch (status) {
    case "counter":
      return "ask";
    case "paying":
    case "settling":
      return "inflight";
    case "ordering":
      return "live";
    case "seated":
      return "rest";
    case "paid":
      return refundState === "partial" || refundState === "full" ? "returned" : "done";
  }
}
