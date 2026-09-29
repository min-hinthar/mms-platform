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
 * `echo={false}` — a chip is a 44px object and two scripts cannot legibly stack inside one. The
 * English is not lost: the card's accessible name contains this same state, and the console's
 * language control is one tap away.
 */
const TONE: Record<FloorTone, { fg: string; bg: string }> = {
  rest: { fg: "var(--t2)", bg: "var(--cd)" },
  live: { fg: "var(--ac)", bg: "var(--cd)" },
  // Money about to move, or a table waiting on a person — the attention tone.
  inflight: { fg: "var(--warn)", bg: "var(--warnb)" },
  ask: { fg: "var(--warn)", bg: "var(--warnb)" },
  done: { fg: "var(--ok)", bg: "var(--okb)" },
  // Money that came BACK: the warn pair, never --ok (K33).
  returned: { fg: "var(--warn)", bg: "var(--warnb)" },
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
  const m = TONE[floorTone(status, refundState)];
  return (
    <Badge color={m.fg} background={m.bg} dot={m.fg} bordered>
      <Chrome lang={lang} k={floorStatusKey(status, refundState)} />
    </Badge>
  );
}
