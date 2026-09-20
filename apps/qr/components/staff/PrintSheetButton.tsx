"use client";
import { Icon } from "@mms/ui";
import { Chrome } from "./Chrome";
import type { StaffLang } from "@/lib/staff-lang";

/**
 * P5 — the word-check sheet's print control.
 *
 * A button rather than "just press Cmd-P", because the people this sheet is for read it on a tablet
 * where there is no Cmd-P — and because the control has to say, in their language, what it does.
 *
 * gloss-2 — a CIRCLE in the bar's trailing slot, the same idiom the Menu bar uses to reach this
 * sheet (§17: trailing = circles in one order), named by sr-only `<Chrome>` in the device language.
 * It was a text pill — a second vocabulary for one action, on a bar whose whole promise is that
 * positions and shapes mean one thing. `.print-hide` keeps it off the paper (the W7a print block
 * hides that class wholesale).
 *
 * ⚠️ `window.print()` is not available during SSR and is blocked outright in some embedded browsers.
 * A throw inside an onClick would reach `app/staff/error.tsx` and take the whole page down over a
 * failed print, so the call is guarded and the failure is silent-but-recoverable: the sheet is still
 * on screen, and the device's own print menu still works.
 */
export function PrintSheetButton({ lang }: { lang: StaffLang }) {
  return (
    <button
      type="button"
      className="staff-circ staff-press print-hide"
      onClick={() => {
        try {
          window.print();
        } catch {
          /* an embedded browser that refuses to print — the sheet itself is unaffected */
        }
      }}
    >
      <Icon name="print" size={20} />
      <span className="sr-only">
        <Chrome lang={lang} k="pilot.gloss.print" />
      </span>
    </button>
  );
}
