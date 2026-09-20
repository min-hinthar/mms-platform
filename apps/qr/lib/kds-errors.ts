import type { StaffKey } from "./i18n/staff";
import type { KitchenErrCode } from "./kitchen-types";
import type { SoldOutErrCode } from "./menu-availability";

/**
 * kitchen-3 — a refused kitchen action speaks the device language.
 *
 * The server answers with a CODE beside its English sentence (`KitchenActionResult`); this module
 * turns the code into what the board's one live region may hold: the dictionary's sentence about
 * the thing the cook just tapped (`x` = the ticket id or the dish, Burmese-first where the ticket
 * is), or the server sentence verbatim for the arm that has no key (`sentence`). That arm is
 * rendered through `<OutageText>`, which swaps in the write-outage twin and shows anything else in
 * English rather than guessing at Burmese. `signin` is not a message: the board leaves for
 * /staff/login, the honest surface (K10), instead of wearing a five-second banner in the wrong
 * language.
 *
 * The 86 has its own mapper (`eightySixOutcome`): its refusals come from `setItemSoldOut`, whose
 * codes are the menu's (`gone` · `stale`), not the ticket's.
 *
 * Pure so a value falsifies it: the board's suite only pins the WIRING (a refusal reaches the
 * region marked `lang="my"`, a twin-less sentence reaches it unmarked).
 */
export type KdsAct = "bump" | "fire" | "recall" | "line";

/** What the region holds: a dictionary key with its slots, or a server sentence. */
export type KdsMsg = { k: StaffKey; vars?: Record<string, string | number> } | string;

export type KdsErrOutcome = { kind: "leave"; href: "/staff/login" } | { kind: "show"; msg: KdsMsg };

const FAILED: Record<KdsAct, StaffKey> = {
  bump: "kds.err.bump",
  fire: "kds.err.fire",
  recall: "kds.err.recall",
  line: "kds.err.line",
};

export function kitchenErrOutcome(
  res: { error: string; code: KitchenErrCode },
  act: KdsAct,
  x: string,
): KdsErrOutcome {
  switch (res.code) {
    case "signin":
      return { kind: "leave", href: "/staff/login" };
    case "sentence":
      return { kind: "show", msg: res.error };
    case "invalid":
      return { kind: "show", msg: { k: "kds.err.invalid" } };
    case "stale":
      return { kind: "show", msg: { k: "kds.err.stale", vars: { x } } };
    case "recall-window":
      return { kind: "show", msg: { k: "kds.err.recall.window", vars: { x } } };
    case "already-live":
      return { kind: "show", msg: { k: "kds.err.fire.live", vars: { x } } };
    case "failed":
      return { kind: "show", msg: { k: FAILED[act], vars: { x } } };
  }
}

/** The 86 and its undo: `setItemSoldOut`'s refusal, said about the dish the cook sees. */
export function eightySixOutcome(res: { error: string; code: SoldOutErrCode }, x: string): KdsMsg {
  switch (res.code) {
    case "sentence":
      return res.error;
    case "invalid":
      return { k: "kds.err.invalid" };
    case "gone":
      return { k: "kds.err.86.gone", vars: { x } };
    case "stale":
      return { k: "kds.err.stale", vars: { x } };
  }
}

/**
 * kitchen-10 — a refused action must outlive the poll that follows it. The board clears a stale
 * error banner on every good snapshot (no perma-stuck error), and the poll runs every 5 s with a
 * realtime-triggered refresh that can land at any moment — so "Couldn’t bump that ticket" was on
 * screen for anywhere between ~0 s and 5 s. The 5-second poll is not the reader's clock: a banner
 * younger than the dwell survives the snapshot; the next user action replaces it regardless
 * (every handler clears the region first).
 */
export const ERR_DWELL_MS = 8_000;

export function actionErrorStale(
  sinceMs: number | null,
  nowMs: number,
  dwellMs: number = ERR_DWELL_MS,
): boolean {
  return sinceMs === null || nowMs - sinceMs >= dwellMs;
}
