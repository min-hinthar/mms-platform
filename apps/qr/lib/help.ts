import type { StaffKey } from "./i18n/staff";

/**
 * P7·3 — the Help door. ONE gold circle in the staff bar on the screens the parents run — the
 * kitchen board and, since A4·2, the counter's one screen (tables, counter orders and the takeaway
 * lane; the takeaway board's own door went with the board) — opening ONE sheet: "How this screen
 * works" (a few cards, with pictures, that opens itself the first time a device sees the screen),
 * the text size on the board, and — PR 4 — "Something's wrong". This module is the pure part:
 * which screens have a door, how many cards each shows, and where a device remembers that it has
 * been shown.
 *
 * The cards are dictionary keys by CONVENTION — `help.how.<screen>.<n>` is the sentence and
 * `help.how.<screen>.<n>.more` the line beneath — so a screen's help is authored in the dictionary
 * beside every other string Mom and Dad read, and the word-check sheet prints it. `lib/help.test.ts`
 * holds the convention: every key the cards name must exist, for every screen, and none beyond.
 *
 * "Seen" is a DEVICE fact (localStorage, like the KDS station and size), never a session one — the
 * point is that the tablet on the pass shows the cards once, on its first morning, and then never
 * interrupts a shift again. Per screen, because the counter tablet and the kitchen tablet are
 * different devices with different first mornings.
 */
export type HelpScreen = "kitchen" | "counter" | "expo";

/**
 * The screens that HAVE a door. `expo` stays in `HelpScreen` because a report filed from the
 * takeaway board before A4·2 carries it (`staff_reports.screen`), and the report surfaces name
 * the screen through `helpScreenNameKey`; it has no door and no cards any more.
 */
export type HelpDoorScreen = "kitchen" | "counter";
export const HELP_SCREENS: readonly HelpDoorScreen[] = ["kitchen", "counter"];

/**
 * How many things a screen's first morning holds. The kitchen's four are the number the canvas
 * was drawn with; the counter carries six because A4·2 made it the screen for three jobs (the
 * register, the tables, the bags) and the two cards that MOVED from the takeaway board (the bump
 * and the paper instruction) teach things this screen now does.
 */
export function helpCardCount(screen: HelpDoorScreen): number {
  return screen === "counter" ? 6 : 4;
}

/** The device memory's key prefix; one key per screen (and per REVISION of its sheet). */
export const HELP_SEEN_PREFIX = "mms.help.seen:";

/**
 * A sheet that changed SHAPE is a new first morning. A4·2 gave the counter six cards, two of them
 * teaching things this screen never did (the bump, the paper instruction), so a tablet that had
 * dismissed the four-card sheet sees the new one once — under a new key, so nothing is un-marked.
 * Per screen, never global: the kitchen's four cards are the ones its tablet already read.
 */
const HELP_SHEET_REVISION: Record<HelpDoorScreen, number> = { kitchen: 1, counter: 2 };

export function helpSeenKey(screen: HelpDoorScreen): string {
  const rev = HELP_SHEET_REVISION[screen];
  return `${HELP_SEEN_PREFIX}${screen}${rev > 1 ? `:${rev}` : ""}`;
}

/** The screen's NAME as the doors and the boards already say it (owner-verified where it is) —
 *  what a report quotes as "Screen: …". Never the how-view's title, which is a sentence. */
export function helpScreenNameKey(screen: HelpScreen): StaffKey {
  return screen === "kitchen"
    ? "kds.title"
    : screen === "counter"
      ? "floor.door.counter"
      : "expo.title";
}

/** The sheet's title for a screen's "How this works" view. */
export function helpTitleKey(screen: HelpDoorScreen): StaffKey {
  return `help.how.title.${screen}`;
}

/** Card `n` (1-based) of a screen: its sentence and the line beneath. */
export function helpCardKeys(screen: HelpDoorScreen, n: number): { k: StaffKey; more: StaffKey } {
  const count = helpCardCount(screen);
  if (!Number.isInteger(n) || n < 1 || n > count)
    throw new RangeError(`help card ${n} is out of 1..${count} on ${screen}`);
  return {
    k: `help.how.${screen}.${n}` as StaffKey,
    more: `help.how.${screen}.${n}.more` as StaffKey,
  };
}
