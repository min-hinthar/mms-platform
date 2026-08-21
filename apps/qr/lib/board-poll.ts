/**
 * The ready board's two poll DECISIONS, as pure functions.
 *
 * They live here rather than inside `ReadyBoard.tsx` for the reason the repo already learned on the
 * money paths: a rule written inside a component does not get guarded. `apps/qr` has no DOM test
 * environment configured — vitest runs `environment: "node"` with `include: ["**\/*.test.ts"]` — so
 * testing this board's behaviour would have meant standing that up first (the config comment says as
 * much: "add jsdom + @vitejs/plugin-react here when the first React component test lands"). It is a
 * missing setup, not an impossibility; `emails/palette.test.ts` already renders components from a
 * `.test.ts` via `createElement`. But nobody stands up a test harness mid-fix, which is exactly how
 * three defects came to live in this logic at once — a bodyless 503 read as a de-authorization, a
 * board that booted into an outage claiming to still be "Connecting…", and two different verdicts
 * collapsed into one wrong instruction — every one invisible to the whole suite. Out here, each is
 * one assertion.
 */

/** What a 401/503 from `/api/board` actually licenses the board to conclude. */
export type BoardRefusal =
  /** A verdict about THIS DEVICE. `message` is the server's own sentence, when it sent one. */
  | { kind: "verdict"; message: string | null }
  /** No verdict available — retry and keep whatever we already have on screen. */
  | { kind: "retry" };

/**
 * Read a refusal.
 *
 * The rule in one line: **only a KNOWN device refusal is a verdict.** Everything else — including
 * everything this client does not recognise — is "we can't tell", which means retry and keep
 * whatever is already on screen.
 *
 * The first cut had the polarity backwards. It BLACKLISTED `reason: "unavailable"` and treated every
 * other parseable body as authoritative, which blanked a live board for three separate shapes:
 *
 *  · a body that will not parse at all — a platform 503 (Vercel throttle, a paused deployment, any
 *    upstream gateway) answers with an HTML error page, and `body?.reason !== "unavailable"` is TRUE
 *    when `body` is null, so the least informative response we can receive was the most authoritative;
 *  · an upstream that DOES emit JSON — `{ error: "Service unavailable" }` parses fine, carries no
 *    `reason`, and sailed straight through to the verdict branch;
 *  · any transient reason added to the API later. A reason this client has never heard of is the one
 *    MOST likely to be new and transient, and a blacklist de-authorizes the board on all of them.
 *
 * Hence the status is part of the decision. `401` is the route's only genuine denial and is a verdict
 * whatever its body; a `503` is a verdict only when it names a device reason we actually know. The
 * failure mode of an unrecognised answer is now a board that stays up (W10b: unavailable ≠ denied,
 * and "we can't tell" is neither).
 */
/** 503 reasons that really are statements about THIS DEVICE, and nothing else. */
const DEVICE_REFUSAL_REASONS = new Set(["not_configured"]);

export function readBoardRefusal(
  status: number,
  body: { reason?: string; error?: string } | null,
): BoardRefusal {
  const message = typeof body?.error === "string" ? body.error : null;
  // The route's only 401 is `authorizeDevice` answering `denied` — a real statement about the device,
  // and it carries no `reason`, so it cannot be recognised from the body alone.
  if (status === 401) return { kind: "verdict", message };
  if (status === 503 && body && DEVICE_REFUSAL_REASONS.has(body.reason ?? "")) {
    return { kind: "verdict", message };
  }
  return { kind: "retry" };
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
