import type { FloorStatus } from "./floor-types";
import type { RefundState } from "./refund-view";

/**
 * Phase 2d · floor — the floor's ONE tone map (plan shared rule "TINT VOCABULARY"), read by the
 * strip's tiles, the card's status edge, the strip's key and the status chip, so none of them can
 * colour one table two ways — the chip's inline ink and the stylesheet's `--floor-ink` per tone are
 * pinned equal by `TableCard.test.tsx` ("ONE tone map").
 *
 *   ask       the table asked to pay at the counter — the one filled tile, the table waiting on you
 *   inflight  a card or a split is moving money (paying · settling)
 *   live      ordering
 *   rest      seated, nothing on it (no edge, no bar)
 *   done      paid
 *   returned  paid, and money came back (partial or full) — muted (--t2 ink, --t3 bar), NEVER the
 *             success tone (K33) and never the act-now warn
 *
 * State is never carried by colour alone: the chip says the word, the tile carries a glyph.
 *
 * Its own module, not a line in `floor-status.ts`: that module reads the payment TTLs through
 * `pay-guard`, which is `server-only`, and the chip, the card and the strip are client components.
 */
export type FloorTone = "ask" | "inflight" | "live" | "rest" | "done" | "returned";

/** The tones in the order a person acts on them — the strip's key reads it (`stripKey`). */
export const FLOOR_TONES: readonly FloorTone[] = [
  "ask",
  "inflight",
  "live",
  "rest",
  "done",
  "returned",
];

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
