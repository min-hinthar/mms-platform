import type { StaffKey } from "./i18n/staff";

/**
 * P7·3 — the Help door. ONE gold circle in the staff bar on the three screens the parents run —
 * the kitchen board, the counter, the takeaway board — opening ONE sheet: "How this screen works"
 * (four cards, with pictures, that opens itself the first time a device sees the screen), the text
 * size on the board, and — PR 4 — "Something's wrong". This module is the pure part: which screens
 * have a door, how many cards each shows, and where a device remembers that it has been shown.
 *
 * The cards are dictionary keys by CONVENTION — `help.how.<screen>.<n>` is the sentence and
 * `help.how.<screen>.<n>.more` the line beneath — so a screen's help is authored in the dictionary
 * beside every other string Mom and Dad read, and the word-check sheet prints it. `lib/help.test.ts`
 * holds the convention: every key the cards name must exist, for every screen.
 *
 * "Seen" is a DEVICE fact (localStorage, like the KDS station and size), never a session one — the
 * point is that the tablet on the pass shows the four cards once, on its first morning, and then
 * never interrupts a shift again. Per screen, because the counter tablet and the kitchen tablet are
 * different devices with different first mornings.
 */
export type HelpScreen = "kitchen" | "counter" | "expo";

export const HELP_SCREENS: readonly HelpScreen[] = ["kitchen", "counter", "expo"];

/** Four things per screen — the number the canvas was drawn with, and the number a first morning can hold. */
export const HELP_CARD_COUNT = 4;

/** The device memory's key prefix; one key per screen. */
export const HELP_SEEN_PREFIX = "mms.help.seen:";

export function helpSeenKey(screen: HelpScreen): string {
  return `${HELP_SEEN_PREFIX}${screen}`;
}

/** The sheet's title for a screen's "How this works" view. */
export function helpTitleKey(screen: HelpScreen): StaffKey {
  return `help.how.title.${screen}`;
}

/** Card `n` (1-based) of a screen: its sentence and the line beneath. */
export function helpCardKeys(screen: HelpScreen, n: number): { k: StaffKey; more: StaffKey } {
  if (!Number.isInteger(n) || n < 1 || n > HELP_CARD_COUNT)
    throw new RangeError(`help card ${n} is out of 1..${HELP_CARD_COUNT}`);
  return {
    k: `help.how.${screen}.${n}` as StaffKey,
    more: `help.how.${screen}.${n}.more` as StaffKey,
  };
}
