import type { ReportConnection } from "./staff-report";

/**
 * A4·2 — what the counter screen believes about its feeds, folded into the ONE word a staff
 * report carries (`connection`). The screen has two live boards (the floor, the lane) and one help
 * door in a server-rendered bar; the bar cannot know the boards' state, so the boards REPORT
 * theirs and the door reads the fold. `not_updating` anywhere is the screen's word — the owner
 * reading `staff_reports` needs to know the person was staring at a frozen board, whichever it
 * was; a screen no board has reported on is still just a `page`.
 */
export type LiveBoardState = Exclude<ReportConnection, "page">;

export function aggregateConnection(
  reports: Readonly<Record<string, LiveBoardState>>,
): ReportConnection {
  const states = Object.values(reports);
  if (states.length === 0) return "page";
  return states.includes("not_updating") ? "not_updating" : "live";
}
