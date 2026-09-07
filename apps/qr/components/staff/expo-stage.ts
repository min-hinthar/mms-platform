import type { CSSProperties } from "react";

/**
 * P7·3 — the takeaway board's two stage buttons, declared ONCE. `ExpoBoard` wears them on the real
 * control and `HelpPicture` on the card that teaches it, so the picture cannot show a colour the
 * board never renders: the first stage (Bagged & ready · Verified) is the accent, the second
 * (Picked up · Handed over) a plain card. Moved verbatim from `ExpoBoard.tsx`, where they were
 * module-private — the first draft of the help card drew the first stage GREEN and the second
 * inverted, two looks the board has never had, under a docblock promising the opposite.
 */
export const bumpBtn: CSSProperties = {
  minHeight: 44,
  borderRadius: "var(--r-sm)",
  border: "1px solid var(--bd)",
  fontWeight: 700,
  fontSize: "var(--fs-sm)",
  cursor: "pointer",
};
export const readyBtn: CSSProperties = {
  background: "var(--ac)",
  color: "var(--oa)",
  borderColor: "var(--ac)",
};
export const pickedBtn: CSSProperties = { background: "var(--cd)", color: "var(--tx)" };
