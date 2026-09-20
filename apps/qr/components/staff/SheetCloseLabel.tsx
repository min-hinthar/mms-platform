import type { StaffLang } from "@/lib/staff-lang";
import { Chrome } from "./Chrome";

/**
 * manager-9 — the shared sheet's ✕, named in the console's tongue, built ONCE for every staff caller
 * (the refund, void/comp and modifier sheets, the help sheets, the cash confirm) so the exit is
 * spelled in one place. `Sheet` renders the pair as sr-only DOM text inside the button — §17's
 * circle idiom, never an `aria-label` (rule 3 of `check-staff-lang` cannot follow a name into the
 * primitive, and DOM text keeps the Burmese language-marked) — and takes both states together so
 * the busy name is never left in English while every exit is refused (§16).
 */
export function sheetCloseLabel(lang: StaffLang) {
  return {
    idle: <Chrome lang={lang} k="shell.close" />,
    busy: <Chrome lang={lang} k="shell.closeBusy" />,
  };
}
