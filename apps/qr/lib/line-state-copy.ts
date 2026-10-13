import type { LineState } from "@mms/db";
import { t } from "./i18n";
import { STAFF } from "./i18n/staff";
import type { KitchenStage } from "./kitchen-track";

/**
 * The single source for the DINER's line-state vocabulary (S2-audit S12). Plain module (no I/O):
 * imported by Checkout. A comped line reads "Comped" regardless of state (handled at the call site).
 * The staff map that lived here (`STAFF_STATE_COPY`, English-only) was retired in Phase 2a · send:
 * the drill-down's line tags are the staff dictionary's `table.line.state.*` now, so a Burmese
 * console no longer reads them in English.
 */

/** Diner-facing (the cart): warmer phrasing; a voided line reads "Removed". */
export const DINER_STATE_COPY: Record<LineState, string> = {
  draft: "Not sent yet",
  fired: "Sent to kitchen",
  in_progress: "Cooking",
  served: "Served",
  voided: "Removed",
};

/**
 * PD10 (m10 decision 2; PATH_DESIGN round 3, ONE KITCHEN TRACK) — the guest's word for each STAGE
 * the track draws, both tongues, named ONCE for every diner surface that draws a track: the Bill's
 * One Pass (its head and every dish row), "Show a server" (PD1) and the Order stage's kitchen strip.
 *
 * The English is the guest's own (`DINER_STATE_COPY` — "Sent to kitchen", never the console's
 * clipped "Sent"); the Burmese is the FAMILY's console word, verbatim from the staff dictionary
 * (`table.line.state.*`, `pad.group.unsent`), so what Thiri reads on her phone is what Mom's board
 * and Dad's table page say about the same dish — and the TV's rows, which read the same keys.
 * `line-state-copy.test.ts` pins every Burmese half EQUAL to its staff source (m10 appendix C), so
 * a guest-only re-word (the retired "ရောက်ပါပြီ", a claim that the plate arrived) is a red test,
 * not a drift. "Sending…" is the cart's own `sending` pair (D3: inside the Send's undo window the
 * words are "-ing"; past tense only after the grace).
 *
 * Keyed by the STAGE, never the raw `lineState`: a served line inside Mom's undo window is
 * "cooking" (`trackStage`), so its word is "Cooking" — the word follows the track, not the column.
 */
export const DINER_STAGE_WORD: Readonly<Record<KitchenStage, { en: string; my: string }>> = {
  unsent: { en: DINER_STATE_COPY.draft, my: STAFF["pad.group.unsent"].my },
  sending: { en: t("en", "sending"), my: t("my", "sending") },
  sent: { en: DINER_STATE_COPY.fired, my: STAFF["table.line.state.fired"].my },
  cooking: { en: DINER_STATE_COPY.in_progress, my: STAFF["table.line.state.inProgress"].my },
  served: { en: DINER_STATE_COPY.served, my: STAFF["table.line.state.served"].my },
};

/**
 * Lifecycle audit (out-of-stock 2) — the word a REMOVED line wears, with the reason when the guest
 * may be told it. A dish the kitchen ran out of used to read a bare "Removed" (and, to a screen
 * reader, "removed by our staff"): the table was never told why, so nobody thought to pick a
 * replacement. The reason is staff's own pick on the void (`table.loss.reason.soldOut`, "We ran
 * out"), carried by `getCartView` as `removedReason`; every other reason keeps the bare word.
 */
export function removedWord(reason: "sold_out" | null | undefined): string {
  return reason === "sold_out"
    ? `${DINER_STATE_COPY.voided} — we ran out`
    : DINER_STATE_COPY.voided;
}

/**
 * Lifecycle audit (diner-live-status 6) — the ONE word a dish card's state chip says.
 *
 * The Order stage's chip read the RAW `lineState` ("Sent to kitchen" from `DINER_STATE_COPY`) while
 * the kitchen strip above it read the TRACK — so inside the Send's undo grace the strip said
 * "Sending…" beside a chip saying "Sent to kitchen" and a live Undo, and inside Mom's six-second
 * undo window the strip said "Cooking" while the chip flipped to "Served" (and back, on a recall):
 * the exact flicker `kitchen-track.ts` exists to prevent. `stage` is `passRowStage(line, dbNow)`;
 * the word is keyed by it, as `DINER_STAGE_WORD`'s docblock requires. A voided line is off the track
 * and keeps its removal word; a line with no stage (grocery) keeps its state's word.
 */
export function lineChipWord(
  line: { lineState: LineState; removedReason?: "sold_out" | null },
  stage: KitchenStage | null,
): string {
  if (line.lineState === "voided") return removedWord(line.removedReason);
  if (stage !== null) return DINER_STAGE_WORD[stage].en;
  return DINER_STATE_COPY[line.lineState];
}

/**
 * Lifecycle audit (out-of-stock 2) — the guest-sayable reason for each removed line, from the loss
 * audit's void rows (`mms_approvals`: `line_id`, `reason_code`, `created_at`). An INCLUSION list:
 * only `sold_out` ("We ran out") is a reason a guest is told; `mistake`, `quality`, `guest_request`
 * and the rest stay staff's own record, and a code added later defaults to the bare "Removed" rather
 * than to whatever the strongest sentence on the screen happens to be. The NEWEST row for a line wins.
 */
export function removedReasons(
  rows: ReadonlyArray<{ line_id: string | null; reason_code: string; created_at: string }>,
): Map<string, "sold_out" | null> {
  const newest = new Map<string, { code: string; at: number }>();
  for (const r of rows) {
    if (!r.line_id) continue;
    const at = Date.parse(r.created_at);
    const seen = newest.get(r.line_id);
    if (seen === undefined || (Number.isFinite(at) && at >= seen.at))
      newest.set(r.line_id, { code: r.reason_code, at: Number.isFinite(at) ? at : -Infinity });
  }
  const out = new Map<string, "sold_out" | null>();
  for (const [id, { code }] of newest) out.set(id, code === "sold_out" ? "sold_out" : null);
  return out;
}
