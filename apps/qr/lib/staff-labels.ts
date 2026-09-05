import { STAFF, ts, type StaffKey } from "./i18n/staff";
import { plural, tf } from "./i18n/fill";
import type { FloorStatus } from "./floor-types";
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

/** The dictionary keys that name an ACTION — the visible word on a control. See the `verb` arm. */
export type VerbKey = Extract<StaffKey, `${string}.verb.${string}`>;

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
  | { kind: "undo"; label: string }
  /**
   * A table on the floor. The whole CARD is the link, so its visible content is a paragraph, not a
   * label — but one line of it identifies the table ("Table 7"), and that is what the name must
   * contain and lead with.
   *
   * ⚠️ `status` is a FloorStatus, and the word it resolves to comes from `FLOOR_STATUS_KEY` — the
   * same map the visible chip renders. OPEN-ITEMS P2g is what happens otherwise: the raw key was
   * interpolated straight into the name, so a `settling` table announced "settling" while the chip
   * read "Splitting". A WCAG 2.5.3 mismatch in ENGLISH, live before this slice.
   */
  /**
   * THE GENERAL SHAPE, and the one most staff controls turn out to be: a button whose visible label
   * is a VERB and whose name must also say what the verb acts on — "Deactivate" on a row for Daw
   * Hla, "Options" on a row for Mohinga, "Void or comp" on a line. `eighty6` above is this shape
   * hard-coded for one control; this is it with the pieces named.
   *
   * The verb key must sit in a `…verb…` segment of its surface's namespace. That is the same
   * enumerability trick `sx()` uses on `a11y`, and it earns its keep the same way: it stops an
   * arbitrary key being borrowed as a verb and then drifting from the label it has to contain,
   * because a `…verb…` key exists for no other purpose than to be a control's visible word.
   *
   * `subject` is rendered VERBATIM — it is a dish name, a person's name, a table token — so it is
   * never a dictionary lookup and never a count.
   */
  | { kind: "verb"; verb: VerbKey; subject: string }
  /**
   * THE INVERSION of `verb`, and `recall` above is this shape hard-coded for one control: the
   * visible label is the SUBJECT — a queue row of guest name and line meta, a chip showing a ticket
   * code — and the name must LEAD with the action, so a person hears what the tap DOES before what
   * it acts on.
   *
   * Which arm a control needs is decided by what the screen shows, not by which reads better: pick
   * `verb` and the button must render the verb (`check-staff-lang.mjs` rule 3c enforces exactly
   * that); pick `subject` and it must render the subject. A row that shows neither has no business
   * carrying a name built from either.
   */
  | { kind: "subject"; verb: VerbKey; subject: string }
  | {
      kind: "table";
      /** The table's display token — the number off the physical tent card. Latin, always. */
      label: string;
      unregistered: boolean;
      status: FloorStatus;
      tabOpen: boolean;
      tabOverCeiling: boolean;
      partySize: number;
      itemCount: number;
      /** Preformatted money (`$42.10`) — never cents, never recomputed here. */
      runningSubtotal: string;
      /** Preformatted money, or null when nothing has been paid. */
      paidTotal: string | null;
    };

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
    case "verb": {
      const visible = ts(lang, control.verb);
      return { visible, aria: `${visible} — ${control.subject}` };
    }
    case "subject": {
      return { visible: control.subject, aria: `${ts(lang, control.verb)} — ${control.subject}` };
    }
    case "table": {
      const visible = tf(lang, "floor.table", { id: control.label });
      // Built as a list of localized fragments rather than one template, because WHICH fragments
      // appear depends on the table: a tab, a ceiling breach and a paid total are each conditional.
      // A single template with optional slots would have to render an empty `{}` for each absent
      // one, and the joiner would land in the wrong place in one of the two tongues.
      const parts = [visible];
      if (control.unregistered) parts.push(ts(lang, "floor.unregisteredSticker"));
      parts.push(ts(lang, FLOOR_STATUS_KEY[control.status]));
      if (control.tabOpen) parts.push(ts(lang, "floor.tabOpen"));
      if (control.tabOverCeiling) parts.push(ts(lang, "floor.tabOverLimit"));
      parts.push(tf(lang, "floor.party", { n: control.partySize }));
      if (control.itemCount > 0) {
        parts.push(
          tf(lang, plural(control.itemCount, "floor.card.item.one", "floor.card.item.many"), {
            n: control.itemCount,
          }),
        );
        parts.push(tf(lang, "floor.card.soFar", { m: control.runningSubtotal }));
      }
      if (control.paidTotal !== null)
        parts.push(tf(lang, "floor.card.paid", { m: control.paidTotal }));
      // ", " in both tongues, matching the `line` case above. A flat accessible name carries no
      // markup and no `lang`, so its punctuation is a pause hint rather than typography; inventing
      // a second joiner for Burmese would make the two cases disagree for no gain a reader hears.
      return { visible, aria: parts.join(", ") };
    }
  }
}

/**
 * The per-status word, read by BOTH the visible chip (`FloorStatusChip`) and the accessible name
 * (`al()`'s `table` case). It lives here rather than in the chip so the pair cannot fork again —
 * the chip owning its own label map is exactly the arrangement OPEN-ITEMS P2g describes.
 *
 * `settling` is the DB's value for a table splitting its bill; "Splitting" is what the room calls
 * it, and the room wins. That divergence is the reason the raw key must never reach a name.
 */
export const FLOOR_STATUS_KEY = {
  seated: "floor.status.seated",
  ordering: "floor.status.ordering",
  paying: "floor.status.paying",
  settling: "floor.status.settling",
  paid: "floor.status.paid",
} as const satisfies Record<FloorStatus, StaffKey>;

/**
 * An aria-only string, for a control or region with NO visible text to contain — a `‹ ›` pager
 * arrow, a volume slider, a `<ul>` that needs a name. 2.5.3 does not apply where there is no visible
 * label, which is exactly the set this covers and nothing more: the AST guard refuses `sx()` on any
 * element that has visible text, because there it would bypass the pair above.
 *
 * The key must sit in an `…a11y…` segment of its surface's namespace (`kds.a11y.tickets`,
 * `reg.a11y.open`). That is a naming rule with teeth: it makes the aria-ONLY strings a set you can
 * enumerate, so a native-check pass can see at a glance which strings nobody will ever read on
 * screen — and it stops a VISIBLE key being quietly borrowed as a name that then drifts from the
 * label it is supposed to contain.
 */
export function sx(lang: StaffLang, key: Extract<keyof typeof STAFF, `${string}.a11y.${string}`>) {
  return ts(lang, key);
}
