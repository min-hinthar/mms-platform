"use client";
import { Chrome } from "./Chrome";
import type { StaffLang } from "@/lib/staff-lang";

/**
 * P5 — the word-check sheet's print control.
 *
 * A button rather than "just press Cmd-P", because the people this sheet is for read it on a tablet
 * where there is no Cmd-P — and because the control has to say, in their language, what it does.
 *
 * It carries no `aria-label`: the visible bilingual label IS the accessible name, which is WCAG
 * 2.5.3 satisfied by construction rather than by a pair that has to be kept in agreement (the reason
 * `lib/staff-labels.ts` exists for the controls that cannot do this). `.print-hide` keeps it off the
 * paper — the repo's existing print block (globals.css, W7a) hides that class wholesale.
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
      className="pgl-print print-hide"
      onClick={() => {
        try {
          window.print();
        } catch {
          /* an embedded browser that refuses to print — the sheet itself is unaffected */
        }
      }}
    >
      <Chrome lang={lang} k="pilot.gloss.print" echo="inline" />
    </button>
  );
}
