import { floorStatusKey } from "@/lib/staff-labels";
import { floorTone, type FloorTone } from "@/lib/floor-tone";
import type { FloorStatus } from "@/lib/floor-types";
import type { RefundSummary } from "@/lib/refund-view";
import type { StaffLang } from "@/lib/staff-lang";
import { Chrome } from "./Chrome";
import { Badge } from "@mms/ui";

/**
 * The per-table status chip (S1.2), shared by the floor cards + the detail header. Tokens only (no
 * hardcoded colors); each state reads as text (never color-alone, for color-blind staff). Built on
 * the shared `@mms/ui` Badge (P5.4), outlined variant (the dot matches the text color).
 *
 * P2 — the WORD comes from the dictionary map `lib/staff-labels.ts`'s `al()` also reads, so the chip
 * and the card's accessible name can never name different states again (OPEN-ITEMS P2g).
 *
 * Phase 2d · floor (K33, the chip's half) — the word is `floorStatusKey`, which reads the refund: a
 * paid table whose money came back says "Refunded" / "Partly refunded", never "Paid", and the colour
 * is `floorTone`'s — the ONE tone map the strip's tiles and the card's edge read — so returned money
 * is never drawn in the success tone. The drill-down header passes the same refund.
 *
 * `CHIP_TONE[t].fg` is the SAME ink the stylesheet gives `.floor-tile[data-tone=t]` (`--floor-ink`),
 * pinned by `TableCard.test.tsx` ("ONE tone map"), so a table is never two colours at once. Returned
 * money is the MUTED pair, like its tile: the warn tone means "a person or money is moving now" (the
 * ask, a payment in flight), and a refund done is neither — three warn states on one strip would
 * bury the one ask that needs someone. The word ("Refunded") carries the difference from "Seated".
 *
 * `echo={false}` — a chip is a 44px object and two scripts cannot legibly stack inside one. The
 * English is not lost: the card's accessible name contains this same state, and the counter's Help
 * sheet has the Language row (P2e), two taps away.
 */
export const CHIP_TONE: Record<FloorTone, { fg: string; bg: string }> = {
  rest: { fg: "var(--t2)", bg: "var(--cd)" },
  live: { fg: "var(--ac)", bg: "var(--cd)" },
  // Money about to move, or a table waiting on a person — the attention tone.
  inflight: { fg: "var(--warn)", bg: "var(--warnb)" },
  ask: { fg: "var(--warn)", bg: "var(--warnb)" },
  done: { fg: "var(--ok)", bg: "var(--okb)" },
  // Money that came BACK: the muted pair on the raised fill (the calm wait pill's audited pair) —
  // never --ok (K33), and never the act-now warn (docblock).
  returned: { fg: "var(--t2)", bg: "var(--sf)" },
};

export function FloorStatusChip({
  status,
  refund,
  lang,
}: {
  status: FloorStatus;
  /** The settled order's refund summary, or null/absent when there is none. */
  refund?: RefundSummary | null;
  lang: StaffLang;
}) {
  const refundState = refund?.state ?? null;
  const m = CHIP_TONE[floorTone(status, refundState)];
  return (
    <Badge color={m.fg} background={m.bg} dot={m.fg} bordered>
      <Chrome lang={lang} k={floorStatusKey(status, refundState)} />
    </Badge>
  );
}
