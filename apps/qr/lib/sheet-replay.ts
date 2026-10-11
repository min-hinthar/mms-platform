import type { ReplayVerdict } from "./grocery-queue";
import { pairMiss, type ScanPairing } from "./scan-pairing";

/**
 * PD4 (Codex round 4 on #329, 4240341719, P1) — a Name-sheet add the radio QUEUED belongs to the
 * sheet that asked, until its replay answers.
 *
 * Live, a sheet add closes its sheet on the server's ok (decision 20), pairs a miss-opened sheet's
 * shelf code to the item (graft 3), and the row the shopper tapped leaves with the sheet. With the
 * radio down the add is QUEUED instead: the sheet stays open saying "Saved — we'll check it when
 * you're back online", and a second tap of that row is refused while the scan waits. The defect had
 * two halves:
 *   · the refusal sat INSIDE the offline branch, so a tap after the radio returned — before the
 *     replay answered — went straight out live under a fresh scan id, and the replay then landed a
 *     second unit behind it;
 *   · the replay was blind to the sheet: it landed the add but neither closed the sheet nor paired
 *     the code, and the moment the entry left the queue the same row was live again — a second tap
 *     charged a second unit, beside a "Saved…" line that was no longer true.
 *
 * So:
 *   · `sheetTapWaits` — a sheet tap on a code whose scan waits in the queue is refused WHATEVER the
 *     radio says (the camera's `classifyScan` already refuses a queued code online or off; a second
 *     unit is the chip's "Add another", deliberately). `check:scan-repeat` proposition 7 pins that
 *     the page asks it before any write of the add, outside the offline branch.
 *   · `replayForSheet` — the replay's verdict is the asking sheet's answer. Delivered is the server's
 *     ok: a miss-opened sheet's code pairs to the item (whether or not the sheet is still up, as a
 *     live ok's does), and the sheet closes if it is still the open one — the page closes it with the
 *     live ok's own routine (the arm and the close-restore ride it; proposition 7 pins that too). A
 *     rejection is spoken in that sheet's own line, replacing the "Saved…" it made false (the toast
 *     sits behind the keyboard). A retry keeps the ask: the add still waits, and its answer is still
 *     owed. A terminal basket is `markCartGone`'s, which closes the sheet and speaks.
 *
 * The ask lives in a page ref keyed by the scan's own id, for the page's life; never stored or sent
 * (the queue entry stays `{scanId, cartId, barcode, queuedAt}` and nothing else).
 */

/** Must a Name-sheet tap on `barcode` wait — refused, nothing written — because a scan of that code
 *  is already in the offline queue? Online or not. */
export function sheetTapWaits(pending: readonly { barcode: string }[], barcode: string): boolean {
  return pending.some((q) => q.barcode === barcode);
}

/** What one replayed entry's verdict does for the sheet that queued it. */
export type SheetReplay = {
  /** The pairing after the replay. */
  pairing: ScanPairing | null;
  /** Close the asking sheet the way a live ok does. */
  close: boolean;
  /** The drain's words go to the asking sheet's own line (its "Saved…" is no longer true). */
  speak: boolean;
  /** The ask is answered — forget it. False: the entry still waits for the next drain. */
  settled: boolean;
};

/** `ask.open`: the asking sheet is still the open one (by identity — a later miss's sheet is not). */
export function replayForSheet(
  verdict: ReplayVerdict,
  ask: { miss: string | null; open: boolean },
  barcode: string,
  pairing: ScanPairing | null,
): SheetReplay {
  if (verdict === "retry") return { pairing, close: false, speak: false, settled: false };
  if (verdict === "delivered")
    return {
      pairing: ask.miss !== null ? pairMiss(ask.miss, barcode) : pairing,
      close: ask.open,
      speak: false,
      settled: true,
    };
  return { pairing, close: false, speak: ask.open && verdict === "rejected", settled: true };
}
