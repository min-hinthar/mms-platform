"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { StaffLang } from "@/lib/staff-lang";

const StaffLangContext = createContext<StaffLang | null>(null);

/**
 * P2 — carries the staff device's language from `app/staff/layout.tsx` (one cookie read) to every
 * client board beneath it.
 *
 * ⚠️ THE WRAPPER STAMPS `data-lang`, NEVER `lang`. This is the load-bearing CSS decision of the
 * slice and the attribute name is the whole point:
 *
 *   `globals.css`'s global `[lang="my"]` rule sets `overflow-wrap: anywhere` AND
 *   `line-height: var(--lh-my)`, and BOTH inherit. The companion `[lang="en"]` rule resets only the
 *   wrap — never the leading. So a `lang="my"` root or wrapper would re-lead every Latin run beneath
 *   it that declares no line-height of its own, and would put `anywhere` on every money figure on
 *   the console, where `$42.10` can then break mid-amount. The `[lang="en"]` opt-out cannot undo the
 *   leading, so there is no escape once it is set.
 *
 * Burmese is therefore marked per SPAN, by `<Chrome>` and by the P1 ticket renderer, exactly where
 * Burmese text actually is. A `data-` attribute has no CSS inheritance at all, which makes the wrong
 * "fix" — promoting it to `lang` so a stylesheet can key off the root — inconvenient on purpose. If
 * you are here to do that: the styling hook you want is `.stx-root[data-lang="my"]`.
 *
 * The consequence is stated rather than hidden: WCAG 3.1.1 (a document language matching its
 * content) is knowingly unsatisfied on `/staff` at `lang=my`, because `<html lang="en">` stays.
 * 3.1.2 (language of parts) holds at every Burmese span. The residual is an OPEN-ITEMS row whose
 * precondition is an audit of what the Latin metrics actually do under a Burmese root.
 */
export function StaffLangProvider({ lang, children }: { lang: StaffLang; children: ReactNode }) {
  return (
    <StaffLangContext.Provider value={lang}>
      <div className="stx-root" data-lang={lang}>
        {children}
      </div>
    </StaffLangContext.Provider>
  );
}

/**
 * THROWS outside a provider — never a silent default.
 *
 * A staff component rendered on a diner route with no provider is a real bug (the diner app is
 * always bilingual and has no device language), and the silent-default version of this hook would
 * express that bug as Burmese chrome appearing on a guest's phone. Failing loudly puts it in front
 * of whoever wired it, in development, instead of in front of a guest.
 */
export function useStaffLang(): StaffLang {
  const lang = useContext(StaffLangContext);
  if (lang === null)
    throw new Error(
      "useStaffLang() outside <StaffLangProvider> — staff chrome only renders under app/staff/layout.tsx.",
    );
  return lang;
}
