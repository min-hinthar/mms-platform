"use client";
import { Fragment, type ReactNode } from "react";
import { STAFF, type StaffKey } from "@/lib/i18n/staff";
import { fill } from "@/lib/i18n/fill";
import {
  STAFF_WRITE_OUTAGE,
  STAFF_WRITE_OUTAGE_MY,
  AUTHORITY_UNCONFIRMED,
  AUTHORITY_UNCONFIRMED_MY,
} from "@/lib/staff-outage";
import type { StaffLang } from "@/lib/staff-lang";
import { echoDrawn } from "@/lib/staff-labels";
import { useEchoesShown } from "./StaffLangProvider";

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
 *
 * 4. P2e — BURMESE-ONLY DROPS THE ECHO, NEVER THE PAIR, AND NEVER ON THE K15-HIGH BAND. On a device
 *    set to Burmese only (`useEchoesShown()` false) a call site that chose an echo still renders the
 *    `.chrome-pair` wrapper — with ONE child, the Burmese span: no middot, no `.chrome-en`. Every
 *    Burmese size rule in the stylesheet is written `.x > .chrome-pair > [lang="my"]`, so returning
 *    the bare span would strip every bar title, door, More row and Help row of its size. And a key
 *    in `STAFF_K15_HIGH` keeps its English line whatever the device says: the English under Mark
 *    sold out, Cook now, Done and the money words is the shared kitchen tablet's cross-check (Dad's
 *    line, `TicketText`). The band is "the strings a wrong word takes SERVICE down over" — wider
 *    than food and money: the logins and lock-outs, the outage and connection lines, the report's
 *    outcome, the late and held tickets too — so the band that decides what the word-check sheet
 *    asks first also decides what English survives, and the Burmese-only row's description says
 *    exactly that ("where a wrong word would stop service"), never "food or money".
 *    `keepEcho` is the third way through: a language surface (the Help row, the More tile, the
 *    Profile card, the failure line) that must speak BOTH tongues on every device, because the
 *    person reading it may be exactly the one who cannot read the current mode. check:staff-lang
 *    rule 6 confines it to those files, a literal `lang="my"`, a literal echo and a language key
 *    (a literal `shell.lang.*`, or the More tile's `t.k`).
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
  keepEcho = false,
}: {
  lang: StaffLang;
  k: StaffKey;
  vars?: Record<string, string | number>;
  /** `"stack"` = the echo on its own line · `"inline"` = after a middot · `false` = no echo. */
  echo?: "stack" | "inline" | false;
  /**
   * P2e — the echo survives Burmese only. Language surfaces ONLY (the Help row, the More tile, the
   * Profile card, the failure line) — check:staff-lang rule 6 holds it to those files and keys.
   */
  keepEcho?: boolean;
}) {
  // The ONE echo decision (`echoDrawn`), which `chromeVisible()` applies to the same device state —
  // so an accessible name follows the mode exactly as this renders it (P2e review, A5).
  const echoes = echoDrawn(k, useEchoesShown() || keepEcho);
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
      {echoes && echo === "inline" && " · "}
      {echoes && <span className="chrome-en">{en}</span>}
    </span>
  );
}

/**
 * P2 — a server-returned staff error, rendered in the device language where a twin exists.
 *
 * `staffGate` returns `STAFF_WRITE_OUTAGE` as a PLAIN STRING from 27 arms, and threading a language
 * through that contract is an auth-path edit this slice does not take (filed as OPEN-ITEMS P2c). So
 * the twin is picked at the RENDER site instead, by identity against the one sentence that has one:
 * every other error passes through verbatim, because a sentence we cannot translate is better shown
 * in English than guessed at in Burmese.
 *
 * Same two rules as `Chrome`: the English arm is a BRANCH returning a bare text node, and the
 * Burmese arm is a marked span so the console's Padauk companion rules can reach it. No echo — this
 * renders inside a live region, and a bilingual announcement says everything twice.
 */
const OUTAGE_TWINS: ReadonlyMap<string, string> = new Map([
  [STAFF_WRITE_OUTAGE, STAFF_WRITE_OUTAGE_MY],
  // M209 — the authority refresh could not be CHECKED. A separate sentence from the write outage
  // because it means something different (nothing was attempted, and paper is not the fallback), so
  // it needs its own twin rather than sharing one that would be false in both tongues.
  [AUTHORITY_UNCONFIRMED, AUTHORITY_UNCONFIRMED_MY],
]);

export function OutageText({ lang, error }: { lang: StaffLang; error: string }) {
  // A MAP, not a chain of identity comparisons: every sentence that acquires a twin joins here, and
  // the one that motivated the change (M209's) was invisible in Burmese precisely because a second
  // arm had to be remembered. Anything without a twin still passes through verbatim — a sentence we
  // cannot translate is better shown in English than guessed at in Burmese.
  const twin = lang === "my" ? OUTAGE_TWINS.get(error) : undefined;
  if (twin)
    return (
      <span lang="my" className="chrome-my">
        {twin}
      </span>
    );
  return <>{error}</>;
}
