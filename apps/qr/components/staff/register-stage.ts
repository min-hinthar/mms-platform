import { buttonClass } from "@mms/ui";

/**
 * A4·2 — the Start zone's controls, declared ONCE. `RegisterStart` wears these on the real controls
 * and `HelpPicture` on the counter's first card, so the picture cannot show a button the zone never
 * renders (the same discipline as `expo-stage.ts` for the takeaway stages).
 *
 * counter-4 — the Phone order arm is a CLASS, not a style object. The open arm wears the console's
 * ONE lit cap (`.staff-arm[aria-expanded="true"]` is listed in the shared pressed rule in
 * `globals.css` — DESIGN-LANGUAGE §2/§17, never the accent outline it wore until 2026-09-20) and the
 * press rides `.staff-press`; neither is a thing an inline style can say. The inert replica in the
 * help sheet wears `START_ARM` alone — a picture has no press.
 *
 * Phase 2d · floor — the zone is TWO controls now (owner decision 5c): starting a table moved to the
 * floor's strip. Walk-up is the zone's ONE primary — the primitive Button at `xl`, whose own class
 * the help picture wears through `START_WALKUP_REST` — and Phone order the secondary arm beside it.
 * `START_GRID` lays the two out: stacked on a phone, 2fr 1fr from 48em (globals.css `.reg-start`).
 */
export const START_ARM = "staff-arm";

/** Walk-up at rest: the primitive's own primary `xl` block (the help card's replica). */
export const START_WALKUP_REST = buttonClass({ variant: "primary", size: "xl", block: true });

/** The zone's grid: Walk-up, then the Phone order arm. */
export const START_GRID = "reg-start";
