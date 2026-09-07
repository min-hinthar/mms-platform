import type { ReactNode, Ref } from "react";
import Link from "next/link";
import { Icon } from "@mms/ui";
import { Chrome } from "./Chrome";
import { StaffLangSwitch } from "./StaffLangSwitch";
import { LockButton } from "./LockButton";
import { sx } from "@/lib/staff-labels";
import type { StaffKey } from "@/lib/i18n/staff";
import type { StaffLang } from "@/lib/staff-lang";

/**
 * P7·1b — ONE chrome on every staff page. Positions are the promise: a parent learns WHERE once and
 * then never looks. Leading = where you are (the Screens circle, the one way to the doors — or, on a
 * sub-page, the way back up); title = the page's own name, Burmese first with the English echo
 * beneath (the only English in the bar); middle = the page's own control, if it has one (the KDS
 * stations); trailing = utilities, always in the same order, Lock LAST because it is the thing you do
 * on the way out. Sign out is not a bar button on any page — a mis-tap on it costs a login, a
 * mis-tap on Lock costs a PIN — it lives on the profile page.
 *
 * Help (the gold circle, PR 3) is deliberately absent here rather than parked as a dead control: a
 * circle that does nothing is the exact thing DESIGN-LANGUAGE §16 forbids. It takes the slot before
 * the language switch when it lands.
 *
 * This is plain JSX — no `server-only`, no hooks — so a server page and the client KDS board render
 * the SAME component. `check-staff-lang.mjs` rule 4 (every staff page reaches the language control)
 * is satisfied THROUGH this component: the walk follows a page's imports to the `<StaffLangSwitch>`
 * mounted below, exactly as it already followed `kitchen/page.tsx` into `KdsBoard`.
 */
export type StaffBarLeading =
  /** The Screens circle → `/staff?doors=1`, honoured over any remembered door (the default). */
  | { kind: "screens" }
  /** The doors themselves: the same mark, static — never a control that does nothing. */
  | { kind: "here" }
  /** A sub-page: the way back UP (a table's add page → the table; the counter order → the register). */
  | { kind: "back"; href: string; k: StaffKey; vars?: Record<string, string | number> };

export function StaffBar({
  lang,
  title,
  titleVars,
  titleNode,
  titleId = "staff-bar-title",
  titleRef,
  titleTabIndex,
  after,
  leading = { kind: "screens" },
  middle,
  trailing,
  lock = false,
  className,
}: {
  lang: StaffLang;
  /** The page's name — a dictionary key rendered `echo="stack"`; or `titleNode` for a real name. */
  title?: StaffKey;
  titleVars?: Record<string, string | number>;
  /** Replaces the dictionary title (the profile page shows the person's own name). */
  titleNode?: ReactNode;
  /** The h1's id, for pages that `aria-labelledby` their region with it. */
  titleId?: string;
  /** The KDS moves focus to its heading after a bump/recall; the h1 is the bar's, so the ref is. */
  titleRef?: Ref<HTMLHeadingElement>;
  titleTabIndex?: number;
  /** Rendered inside the h1 after the title — a RoleBadge, a status chip. */
  after?: ReactNode;
  leading?: StaffBarLeading;
  /** The page's own control (the KDS station filter). */
  middle?: ReactNode;
  /** Page utilities rendered BEFORE the language switch (KDS: text size, sound). */
  trailing?: ReactNode;
  /** Mount the Lock circle — only when the caller has a PIN (locking without one strands the device). */
  lock?: boolean;
  className?: string;
}) {
  return (
    <header className={`staff-bar${className ? ` ${className}` : ""}`}>
      {leading.kind === "screens" && (
        <Link href="/staff?doors=1" className="staff-circ staff-press">
          <Icon name="grid" size={20} />
          {/* The name is DOM text, marked by <Chrome> — an aria-label on a control with children
              bypasses the {visible, aria} pair (rule 3), and a glyph is not a word anyone speaks. */}
          <span className="sr-only">
            <Chrome lang={lang} k="shell.screens" />
          </span>
        </Link>
      )}
      {leading.kind === "here" && (
        <span className="staff-circ staff-circ-here" aria-hidden>
          <Icon name="grid" size={20} />
        </span>
      )}
      {leading.kind === "back" && (
        <Link href={leading.href} className="staff-back staff-press">
          {/* The arrow lives INSIDE the dictionary value (`← Table 7`), as every back label does. */}
          <Chrome lang={lang} k={leading.k} vars={leading.vars} />
        </Link>
      )}
      <h1 id={titleId} ref={titleRef} tabIndex={titleTabIndex} className="staff-bar-title">
        {titleNode ??
          (title ? <Chrome lang={lang} k={title} vars={titleVars} echo="stack" /> : null)}
        {after}
      </h1>
      {middle && <div className="staff-bar-mid">{middle}</div>}
      {/* `role="group"`: a bare <div> is `generic`, which prohibits an author name (rule 3d). */}
      <div className="staff-bar-tail" role="group" aria-label={sx(lang, "shell.a11y.tools")}>
        {trailing}
        <StaffLangSwitch lang={lang} />
        {lock && <LockButton lang={lang} />}
      </div>
    </header>
  );
}
