import type { StaffKey } from "./i18n/staff";
import type { KitchenStage } from "./kitchen-track";

/**
 * The lifecycle audit (2026-10-13) — the word a SENT dish wears on the table page, the pane and the
 * order pad: its stage on the ONE kitchen track (`trackStage`, computed by the read), never the raw
 * column. The raw column said "Sent" (with a Void/Comp button) while the diner's send grace was still
 * running and the KDS had not seen the dish, and "Served" inside Mom's six-second Undo while the wall
 * and the guest's pass still said "Cooking". With no stage (a settled record line, an older fixture)
 * the raw state keeps its shipped word.
 */
const STAGE_KEY: Readonly<Record<Exclude<KitchenStage, "unsent">, StaffKey>> = {
  sending: "table.line.state.sending",
  sent: "table.line.state.fired",
  cooking: "table.line.state.inProgress",
  served: "table.line.state.served",
};

const STATE_KEY: Readonly<Record<string, StaffKey>> = {
  fired: "table.line.state.fired",
  in_progress: "table.line.state.inProgress",
  served: "table.line.state.served",
};

export function lineTagKey(line: { state: string; stage?: KitchenStage | null }): StaffKey {
  const s = line.stage;
  if (s !== undefined && s !== null && s !== "unsent") return STAGE_KEY[s];
  return STATE_KEY[line.state] ?? "table.line.state.fired";
}
