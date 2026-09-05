"use client";
import { Fragment, type ReactNode } from "react";
import { STAFF, type StaffKey } from "@/lib/i18n/staff";
import { fill } from "@/lib/i18n/fill";
import type { StaffLang } from "@/lib/staff-lang";

/**
 * P2 — the ONE staff chrome renderer. Every localized string on a staff surface goes through here,
 * so the three rules below are enforced in one place instead of at 130 call sites.
 *
 * 1. THE ENGLISH BRANCH IS A BRANCH, NOT CSS GATING. Under `lang="en"` this returns the English
 *    string as a bare text node — no element, no class, no `lang` attribute — so an English console
 *    is byte-identical to the pre-P2 markup. P1 learned this the expensive way: the equivalent claim
 *    about the kitchen ticket was true only because of a JSX branch, and the CHANGELOG had described
 *    it as CSS gating. `Chrome.test.tsx` pins the branch by counting elements.
 *
 * 2. THE ENGLISH ECHO IS A SIBLING, NEVER A CHILD. Under `lang="my"` the Burmese sits in a
 *    `lang="my"` span and the English echo follows it as a SIBLING carrying no `lang` (English is
 *    the ambient tongue of the document). Nesting the echo inside the Burmese span would typeset
 *    English in Padauk and announce it as Burmese — the same defect P1's hole rule exists to prevent,
 *    one tier up.
 *
 * 3. A LATIN VALUE INSIDE A BURMESE RUN IS MARKED `lang="en"`. A dish name, a guest name, a table
 *    number or a money figure interpolated into a Burmese sentence is wrapped, which restores the
 *    body face and — through the global `[lang="en"]` rule — restores `overflow-wrap: normal`, so
 *    `$42.10` and `7:45 PM` cannot break mid-value inside a Burmese run.
 *
 * ECHO POLICY (owner, 2026-09-05): "echo on the important things only". `echo` is chosen per call
 * site, not derived: `"stack"` and `"inline"` for headings, action buttons, outage sentences, the 86
 * control and money labels; `false` for 44px chips and badges (two scripts cannot legibly stack in a
 * chip) and for live regions (a bilingual announcement says everything twice).
 */

/** Anything with a Latin letter or an ASCII digit has to be marked inside a Burmese run. */
const HAS_LATIN = /[A-Za-z0-9]/;

function renderMyTemplate(
  key: StaffKey,
  vars: Record<string, string | number> | undefined,
  lang: StaffLang,
): ReactNode {
  const template = STAFF[key].my;
  if (!vars) return template;

  // Split on the slots so each interpolated VALUE can be judged on its own script, while the
  // Burmese around it stays one run. `fill` still owns the numeral rule: a count reaches here
  // already converted, so it is Burmese script and needs no wrapper.
  const parts = template.split(/(\{[a-z]+\})/g);
  return parts.map((part, i) => {
    const slot = /^\{([a-z]+)\}$/.exec(part);
    if (!slot) return <Fragment key={i}>{part}</Fragment>;
    const name = slot[1]!;
    if (!(name in vars)) return <Fragment key={i}>{part}</Fragment>;
    const value = fill(part, vars, lang);
    return HAS_LATIN.test(value) ? (
      <span key={i} lang="en">
        {value}
      </span>
    ) : (
      <Fragment key={i}>{value}</Fragment>
    );
  });
}

export function Chrome({
  lang,
  k,
  vars,
  echo = false,
}: {
  lang: StaffLang;
  k: StaffKey;
  vars?: Record<string, string | number>;
  /** `"stack"` = the echo on its own line · `"inline"` = after a middot · `false` = no echo. */
  echo?: "stack" | "inline" | false;
}) {
  const en = vars ? fill(STAFF[k].en, vars, "en") : STAFF[k].en;
  if (lang === "en") return <>{en}</>;

  const my = (
    <span lang="my" className="chrome-my">
      {renderMyTemplate(k, vars, lang)}
    </span>
  );
  if (echo === false) return my;

  return (
    <span className={echo === "stack" ? "chrome-pair" : "chrome-pair chrome-pair-inline"}>
      {my}
      {echo === "inline" && " · "}
      <span className="chrome-en">{en}</span>
    </span>
  );
}
