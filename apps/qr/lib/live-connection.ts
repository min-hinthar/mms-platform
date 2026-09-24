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

// ── Phase 2b · feedback ──
// The bar's liveness truth — pure, so a value can falsify every arm. Nothing here reads a clock or
// the network: the boards' own `degraded` state is the feed truth (the bar and a board's banner
// must never disagree), and the device's offline verdict arrives already sustained.

/** What the bar's status slot draws: three states, three SHAPES — or nothing. */
export type LiveDot = "live" | "stale" | "offline";

/**
 * The slot's state. A SUSTAINED offline outranks everything — a device that cannot reach the
 * network cannot hear the feed it is showing, whatever the feed last said. No feed (a page with
 * none, or a counter no board has reported on yet) draws NOTHING: the reserved mark stays empty
 * rather than guess 'Live'.
 */
export function liveDot(offline: boolean, feed: ReportConnection | undefined): LiveDot | null {
  if (offline) return "offline";
  if (feed === undefined || feed === "page") return null;
  return feed === "not_updating" ? "stale" : "live";
}

/**
 * A list of boards' states → one word. Nothing reported is a `page`; any frozen board is the
 * word (the person is staring at a frozen board, whichever it is); otherwise live.
 */
export function liveFold(states: readonly (LiveBoardState | undefined)[]): ReportConnection {
  const reported = states.filter((s): s is LiveBoardState => s !== undefined);
  if (reported.length === 0) return "page";
  return reported.includes("not_updating") ? "not_updating" : "live";
}

/**
 * The counter screen's two feeds. The manager's approvals rail is deliberately NOT one of them: a
 * stale rail must not make the bar say the counter's boards are stale (and the Help report's fold,
 * `aggregateConnection`, is unchanged — it still reads every report).
 */
export const COUNTER_FEEDS = ["floor", "bags"] as const;

/** The counter bar's fold — exactly `COUNTER_FEEDS`, never every report on the screen. */
export function counterFold(
  states: Readonly<Record<string, LiveBoardState | undefined>>,
): ReportConnection {
  return liveFold(COUNTER_FEEDS.map((b) => states[b]));
}

/**
 * How long the device must stay offline before a feedless page shows its offline row. Marginal
 * restaurant wifi drops for a second at a time; a row that flapped with it would reflow the page
 * under a finger on every blip.
 */
export const NET_SHOW_MS = 2000;

/** Has the device been offline for the whole sustain? `offlineSince` null = online. */
export function offlineSustained(
  offlineSince: number | null,
  now: number,
  ms = NET_SHOW_MS,
): boolean {
  return offlineSince !== null && now - offlineSince >= ms;
}
