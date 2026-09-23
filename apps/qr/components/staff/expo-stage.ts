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
  minHeight: "var(--tap-bump)", // O-E — the KDS bump's height, ONE token (counter-1)
  borderRadius: "var(--r-sm)",
  border: "1px solid var(--bd)",
  fontWeight: "var(--fw-bold)",
  fontSize: "var(--fs-sm)",
  cursor: "pointer",
};
export const readyBtn: CSSProperties = {
  background: "var(--ac)",
  color: "var(--oa)",
  borderColor: "var(--ac)",
};
export const pickedBtn: CSSProperties = { background: "var(--cd)", color: "var(--tx)" };
/** counter-1 — the Undo posture in the same slot: a hairline ghost, unmistakably not a stage. */
export const undoBtn: CSSProperties = {
  background: "var(--sf)",
  color: "var(--tx)",
  borderColor: "var(--ac)",
  borderStyle: "dashed",
};
