/**
 * A4·2 — the Start zone's arms (Walk-up · Phone order · Start a table), declared ONCE. `RegisterStart`
 * wears the class on the real controls and `HelpPicture` on the counter's first card, so the picture
 * cannot show a button the zone never renders (the same discipline as `expo-stage.ts` for the
 * takeaway stages).
 *
 * counter-4 — a CLASS now, not a style object. The open arm wears the console's ONE lit cap
 * (`.staff-arm[aria-expanded="true"]` is listed in the shared pressed rule in `globals.css` —
 * DESIGN-LANGUAGE §2/§17, never the accent outline it wore until 2026-09-20) and the press rides
 * `.staff-press`; neither is a thing an inline style can say. The inert replica in the help sheet
 * wears `START_ARM` alone — a picture has no press.
 */
export const START_ARM = "staff-arm";
