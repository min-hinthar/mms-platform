import { type CSSProperties } from "react";
import type { FloorStatus } from "@/lib/floor-types";

/**
 * The per-table status chip (S1.2), shared by the floor cards + the detail header. Tokens only (no
 * hardcoded colors); each state reads as text (never color-alone, for color-blind staff). Payment-level
 * only — kitchen states (fired/served) arrive with S2.
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
    <span style={{ ...chip, color: m.fg, background: m.bg }}>
      {/* Decorative dot; the text label carries the meaning. */}
      <span aria-hidden style={{ width: 6, height: 6, borderRadius: 999, background: m.fg }} />
      {m.label}
    </span>
  );
}

const chip: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "3px 10px",
  borderRadius: "var(--r-full)",
  border: "1px solid var(--bd)",
  fontSize: 12,
  fontWeight: 700,
  whiteSpace: "nowrap",
};
