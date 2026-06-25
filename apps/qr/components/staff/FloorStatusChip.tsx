import type { FloorStatus } from "@/lib/floor-types";
import { Badge } from "@mms/ui";

/**
 * The per-table status chip (S1.2), shared by the floor cards + the detail header. Tokens only (no
 * hardcoded colors); each state reads as text (never color-alone, for color-blind staff). Payment-level
 * only — kitchen states (fired/served) arrive with S2. Built on the shared `@mms/ui` Badge (P5.4),
 * outlined variant (the dot matches the text color).
 */
const META: Record<FloorStatus, { label: string; fg: string; bg: string }> = {
  seated: { label: "Seated", fg: "var(--t2)", bg: "var(--cd)" },
  ordering: { label: "Ordering", fg: "var(--ac)", bg: "var(--cd)" },
  paying: { label: "Paying", fg: "var(--warn)", bg: "var(--warnb)" },
  settling: { label: "Splitting", fg: "var(--warn)", bg: "var(--warnb)" },
  paid: { label: "Paid", fg: "var(--ok)", bg: "var(--okb)" },
};

export function FloorStatusChip({ status }: { status: FloorStatus }) {
  const m = META[status];
  return (
    <Badge color={m.fg} background={m.bg} dot={m.fg} bordered>
      {m.label}
    </Badge>
  );
}
