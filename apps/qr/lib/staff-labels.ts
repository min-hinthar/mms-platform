import { STAFF, ts } from "./i18n/staff";
import { tf } from "./i18n/fill";
import type { StaffLang } from "./staff-lang";

/**
 * P2 — accessible names for the staff controls that HAVE a visible label.
 *
 * WHY THIS IS A MODULE AND NOT A STRING AT EACH CALL SITE. WCAG 2.5.3 (Label in Name) requires the
 * accessible name to contain the text presented visually. Every one of these names was an English
 * template literal built inline in the JSX, which was fine while the visible label was also English
 * — and stops being fine the moment the button reads `ပြီးပြီ` and announces "Bump". `KdsBoard.tsx`
 * says so in its own source: *"P2 owns the moment the chrome speaks Burmese; the visible English
 * echo keeps WCAG 2.5.3 meanwhile."* This is that moment.
 *
 * THE CONTRACT, and why it is `includes` rather than `startsWith`: 2.5.3 requires CONTAINMENT, not
 * a prefix. Two of these controls do begin with their visible label (the bump and the 86), because
 * their whole visible content IS the label. The line button cannot: its visible label is the DISH
 * NAME, while the name must lead with the action the tap performs ("Done — 2 Mohinga…"), which is
 * what a cook needs announced first. Forcing a prefix there would reorder the announcement to suit
 * the guard rather than the person. So the guard asserts what the standard asks: the visible text
 * appears in the name, in whichever language is on screen.
 *
 * The name is a FLAT STRING and therefore carries no `lang`, so a screen reader with an English
 * voice will garble Myanmar codepoints inside it. That is accepted and documented rather than
 * dodged: the alternative — a flat ENGLISH name over a Burmese visible label — fails 2.5.3 outright,
 * and these tablets are not screen-reader surfaces. The honest name wins over the pronounceable one.
 */

export type StaffLabel = { visible: string; aria: string };

/** The dish name as the ticket actually RENDERS it: Burmese when the catalog has it, else English. */
function dishVisible(lang: StaffLang, name: string, nameMy: string | null): string {
  return lang === "my" && nameMy !== null ? nameMy : name;
}

export type StaffControl =
  /** A ticket line. Visible: the dish name (Burmese-first). Tapping advances its state. */
  | {
      kind: "line";
      done: boolean;
      qty: number;
      name: string;
      nameMy: string | null;
      modifiers: readonly string[];
    }
  /** The full-width bump. Visible: BUMP / ပြီးပြီ. */
  | { kind: "bump"; id: string; items: number }
  /** 86 the dish. Visible: 86 this dish / ဒီဟင်း ဖြုတ်. */
  | { kind: "eighty6"; name: string; nameMy: string | null }
  /**
   * Recall a bumped ticket from the footer rail. Visible: the ticket's CODE — the chip shows
   * `⟲ #A12`, not the verb — so the pair is inverted relative to `undo`: the code is what must be
   * contained, and the verb is what must lead the announcement. Written the other way round first,
   * with `visible` set to the verb, which is a name that contains a string the chip never shows.
   */
  | { kind: "recall"; label: string }
  /** The undo that follows a bump. Visible: the verb — the button's whole content IS the label. */
  | { kind: "undo"; label: string };

export function al(lang: StaffLang, control: StaffControl): StaffLabel {
  switch (control.kind) {
    case "line": {
      const dish = dishVisible(lang, control.name, control.nameMy);
      const verb = ts(lang, control.done ? "kds.line.done" : "kds.line.start");
      const mods = control.modifiers.length ? `, ${control.modifiers.join(", ")}` : "";
      return { visible: dish, aria: `${verb} — ${control.qty} ${dish}${mods}` };
    }
    case "bump": {
      const visible = ts(lang, "kds.bump");
      const what = tf(lang, "kds.bump.what", { x: control.id, n: control.items });
      return { visible, aria: `${visible} — ${what}` };
    }
    case "eighty6": {
      const visible = ts(lang, "kds.86");
      const dish = dishVisible(lang, control.name, control.nameMy);
      return { visible, aria: `${visible} — ${dish}` };
    }
    case "recall": {
      return { visible: control.label, aria: `${ts(lang, "kds.recall")} — ${control.label}` };
    }
    case "undo": {
      const visible = ts(lang, "kds.undo");
      return { visible, aria: `${visible} — ${control.label}` };
    }
  }
}

/**
 * An aria-only string, for a control or region with NO visible text to contain — a `‹ ›` pager
 * arrow, a volume slider, a `<ul>` that needs a name. 2.5.3 does not apply where there is no visible
 * label, which is exactly the set this covers and nothing more: the AST guard refuses `sx()` on any
 * element that has visible text, because there it would bypass the pair above.
 *
 * P6 — the key type admits `board.a11y.*` beside `kds.a11y.*`. The union is a NAMESPACE rule, not a
 * loosening: an aria-only name still has to be a dictionary entry filed under a surface that owns
 * it, so the wall's unlabelled regions come through this same door rather than growing a second
 * one. Widening it to all of `StaffKey` would let any visible-label key be used as an aria-only
 * name, which is the containment bypass `al()` exists to prevent.
 */
export function sx(
  lang: StaffLang,
  key: Extract<keyof typeof STAFF, `kds.a11y.${string}` | `board.a11y.${string}`>,
): string {
  return ts(lang, key);
}
