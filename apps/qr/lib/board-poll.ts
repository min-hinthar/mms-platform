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
 * Two further rounds tightened it, and the intermediate versions are worth naming because each one
 * READ as safe:
 *
 *  · "the 401 is our only genuine denial, so it is a verdict whatever its body" — no: an upstream
 *    401 (Vercel deployment protection answers one with HTML on a protected preview) unlinks a live
 *    board under that rule;
 *  · "accept a known reason on either status" — no: that also admits `(503,"denied")` and
 *    `(401,"not_configured")`, pairs this route never sends.
 *
 * So the decision is the exact (status, reason) PAIR, per `DEVICE_REFUSALS` below. The failure mode
 * of an unrecognised answer is a board that stays up (W10b: unavailable ≠ denied, and "we can't
 * tell" is neither).
 */
/**
 * The exact refusals `/api/board` issues, as (status → reason) PAIRS. It emits these two and nothing
 * else, so matching the pair is what "did this come from our route?" actually means.
 *
 * A `Set` of reasons checked independently of the status was one step too loose: it also accepted
 * `(503, "denied")` and `(401, "not_configured")`, combinations the route never sends, so an upstream
 * emitting either would still have blanked the board — and the suite carried a test named "only
 * `not_configured` makes a 503 a verdict" asserting a guarantee the code did not make (Codex round 3).
 */
const DEVICE_REFUSALS = new Map<number, string>([
  [401, "denied"],
  [503, "not_configured"],
]);

export function readBoardRefusal(
  status: number,
  body: { reason?: string; error?: string } | null,
): BoardRefusal {
  const message = typeof body?.error === "string" ? body.error : null;
  // ONE rule: a refusal counts only when its (status, reason) pair is one this route actually sends.
  // The first cut whitelisted the 503 and left the 401 unconditional, which left the same hole open
  // on the other status — Vercel's deployment protection answers 401 with HTML on a protected
  // preview, and that blanked a live board (Codex round 2).
  //
  // Deploy skew runs the safe way: a new client against an older server that omits `reason` on its
  // 401 retries instead of unlinking, so the board stays up and self-heals once the deploy lands.
  if (body && DEVICE_REFUSALS.get(status) === body.reason) return { kind: "verdict", message };
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
