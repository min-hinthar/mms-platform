import type { CSSProperties } from "react";

/**
 * A4·2 — the Start zone's buttons, declared ONCE. `RegisterStart` wears them on the real controls
 * and `HelpPicture` on the counter's first card, so the picture cannot show a button the zone never
 * renders (the same discipline as `expo-stage.ts` for the takeaway stages).
 */
export const startBtn: CSSProperties = {
  minHeight: 48,
  padding: "0 var(--s4)",
  borderRadius: "var(--r-sm)",
  border: "1px solid var(--bd)",
  background: "var(--sf)",
  color: "var(--tx)",
  fontSize: "var(--fs-body)",
  fontWeight: 700,
  cursor: "pointer",
};
export const startBtnActive: CSSProperties = {
  ...startBtn,
  borderColor: "var(--ac-strong)",
  color: "var(--ac-strong)",
};
