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
