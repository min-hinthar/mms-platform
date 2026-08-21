/**
 * The ready board's two poll DECISIONS, as pure functions.
 *
 * They live here rather than inside `ReadyBoard.tsx` for the reason the repo already learned on the
 * money paths: a rule written inside a component cannot be guarded. `apps/qr` runs vitest with
 * `environment: "node"` and `include: ["**\/*.test.ts"]`, so there is no component test and there was
 * no way to write one. Three separate defects lived in this logic at once — a bodyless 503 read as a
 * de-authorization, a board that booted into an outage claiming to still be "Connecting…", and two
 * different verdicts collapsed into one wrong instruction — and every one of them was invisible to
 * the whole suite. Moved out here, each is one assertion.
 */

/** What a 401/503 from `/api/board` actually licenses the board to conclude. */
export type BoardRefusal =
  /** A verdict about THIS DEVICE. `message` is the server's own sentence, when it sent one. */
  | { kind: "verdict"; message: string | null }
  /** No verdict available — retry and keep whatever we already have on screen. */
  | { kind: "retry" };

/**
 * Read a refusal body.
 *
 * The rule in one line: **a verdict must actually BE one.** Two things are NOT verdicts about the
 * device, and conflating either with "you are not authorized" blanks a working display mid-service:
 *
 *  · `reason: "unavailable"` — the server could not reach the sign-in service. That is a statement
 *    about the platform, not about this screen (W10b: unavailable ≠ denied).
 *  · a body that will not parse at all — a platform-level 503 (Vercel throttle, a paused deployment,
 *    any upstream gateway) answers with an HTML error page. The first cut tested
 *    `body?.reason !== "unavailable"`, and on a null body that is `undefined !== "unavailable"` →
 *    TRUE, so the least informative response we can possibly receive was treated as the most
 *    authoritative one.
 */
export function readBoardRefusal(body: { reason?: string; error?: string } | null): BoardRefusal {
  if (!body) return { kind: "retry" };
  if (body.reason === "unavailable") return { kind: "retry" };
  return { kind: "verdict", message: typeof body.error === "string" ? body.error : null };
}

/** The board's screen state, mirrored from `ReadyBoard` so this module stays free of React. */
export type BoardPollState =
  | { kind: "loading" }
  | { kind: "unlinked"; message: string | null }
  /**
   * `escalated` is computed HERE, not at render. The screen needs to know whether the outage has
   * outlived the shared two-minute window, and deriving that in the component would mean calling
   * `Date.now()` during render — impure, and React Compiler rejects it outright. The fold already
   * holds both endpoints in one clock domain, which is also the only way to measure a duration
   * correctly (`staff-outage.ts` documents the skew bug that taught this).
   */
  | { kind: "offline"; since: number; fails: number; escalated: boolean }
  | { kind: "live"; stale: boolean };

/**
 * How long a board with nothing on screen waits before it stops implying the outage is momentary.
 * The same window every other staff board uses — re-exported rather than re-chosen, so the house
 * speaks with one voice about when to fall back to paper.
 */
export { STAFF_OUTAGE_ESCALATE_MS } from "./staff-outage";
import { STAFF_OUTAGE_ESCALATE_MS } from "./staff-outage";

/** How many consecutive misses before a board is allowed to say anything is wrong. */
export const BOARD_FAIL_THRESHOLD = 2;

/**
 * Fold a failed poll into the board's state.
 *
 * A board WITH a snapshot keeps it and eventually admits it is stale — its last-known ledger is the
 * most valuable thing on the screen. A board WITHOUT one has nothing to keep, and that is the case
 * this diff created: authorized by a staff session, it now starts at `loading` and polls, so a board
 * that boots during an outage used to fold straight back to `loading` on every failure — "Connecting…"
 * forever, above a Ready column reading "Ready orders light up here."
 *
 * `since` is preserved across failures on purpose: the escalation window measures the WHOLE outage
 * and must never restart on each failed poll.
 */
export function nextBoardStateOnFailure(
  prev: BoardPollState,
  fails: number,
  now: number,
): BoardPollState {
  if (prev.kind === "live") {
    return fails >= BOARD_FAIL_THRESHOLD ? { ...prev, stale: true } : prev;
  }
  if (fails < BOARD_FAIL_THRESHOLD) return prev.kind === "offline" ? prev : { kind: "loading" };
  const since = prev.kind === "offline" ? prev.since : now;
  return {
    kind: "offline",
    since,
    fails,
    escalated: now - since >= STAFF_OUTAGE_ESCALATE_MS,
  };
}
