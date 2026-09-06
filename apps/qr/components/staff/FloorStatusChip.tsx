import { FLOOR_STATUS_KEY } from "@/lib/staff-labels";
import type { FloorStatus } from "@/lib/floor-types";
import type { StaffLang } from "@/lib/staff-lang";
import { Chrome } from "./Chrome";
import { Badge } from "@mms/ui";

/**
 * The per-table status chip (S1.2), shared by the floor cards + the detail header. Tokens only (no
 * hardcoded colors); each state reads as text (never color-alone, for color-blind staff). Payment-level
 * only — kitchen states (fired/served) arrive with S2. Built on the shared `@mms/ui` Badge (P5.4),
 * outlined variant (the dot matches the text color).
 *
 * P2 — the WORD comes from `FLOOR_STATUS_KEY`, which `lib/staff-labels.ts`'s `al()` also reads, so the
 * chip and the card's accessible name can never name different states again (OPEN-ITEMS P2g). The
 * colors stay here: they are presentation, and they carry no meaning the text does not already carry.
 *
 * `echo={false}` — a chip is a 44px object and two scripts cannot legibly stack inside one. The
 * English is not lost: the card's accessible name contains this same state, and the console's
 * language control is one tap away.
 */
const TONE: Record<FloorStatus, { fg: string; bg: string }> = {
  seated: { fg: "var(--t2)", bg: "var(--cd)" },
  ordering: { fg: "var(--ac)", bg: "var(--cd)" },
  paying: { fg: "var(--warn)", bg: "var(--warnb)" },
  settling: { fg: "var(--warn)", bg: "var(--warnb)" },
  paid: { fg: "var(--ok)", bg: "var(--okb)" },
};

export function FloorStatusChip({ status, lang }: { status: FloorStatus; lang: StaffLang }) {
  const m = TONE[status];
  return (
    <Badge color={m.fg} background={m.bg} dot={m.fg} bordered>
      <Chrome lang={lang} k={FLOOR_STATUS_KEY[status]} />
    </Badge>
  );
}
