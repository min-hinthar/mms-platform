import { describe, expect, it } from "vitest";
import {
  BOARD_FAIL_THRESHOLD,
  STAFF_OUTAGE_ESCALATE_MS,
  nextBoardStateOnFailure,
  readBoardRefusal,
  type BoardPollState,
} from "./board-poll";

/**
 * Three defects lived in this logic simultaneously and the entire suite was green, because it sat
 * inside a component this project cannot test. Each case below is one of them.
 */

describe("readBoardRefusal — only a KNOWN device refusal is a verdict", () => {
  it.each([
    ["an upstream 503 that happens to emit JSON", 503, { error: "Service unavailable" }],
    ["a gateway envelope with no fields we know", 503, { error: undefined }],
    ["a transient reason added to the API LATER", 503, { reason: "rate_limited" }],
  ])("retries on %s", (_why, status, body) => {
    // The first cut BLACKLISTED `unavailable` and treated every other parseable body as a verdict,
    // so all three of these blanked a live board. The polarity was backwards: an unrecognised body
    // is "we can't tell", and a reason this client has never heard of is the MOST likely to be a new
    // transient one. Whitelisting means an unknown answer leaves the board up rather than letting it
    // de-authorize itself (Codex on #222 — LEARNINGS #53's own recommendation was insufficient, and
    // the shipped code had the same gap).
    expect(readBoardRefusal(status, body)).toEqual({ kind: "retry" });
  });

  it("a 401 is a verdict even with no reason — it is the route's only genuine denial", () => {
    expect(readBoardRefusal(401, { error: "Unauthorized" })).toEqual({
      kind: "verdict",
      message: "Unauthorized",
    });
  });

  it("only `not_configured` makes a 503 a verdict", () => {
    expect(
      readBoardRefusal(503, { reason: "not_configured", error: "set BOARD_DEVICE_TOKEN" }),
    ).toEqual({ kind: "verdict", message: "set BOARD_DEVICE_TOKEN" });
  });
});

describe("readBoardRefusal — a verdict must actually BE one", () => {
  it("an UNPARSEABLE body is not a verdict — it is the least informative answer there is", () => {
    // The shipped bug: a platform 503 (Vercel throttle / paused deployment) returns an HTML error
    // page, `res.json()` rejects, and the old predicate `body?.reason !== "unavailable"` evaluated
    // `undefined !== "unavailable"` → TRUE. A live board was destroyed and the house was told the
    // screen had never been linked, by a response that said nothing about the screen at all.
    expect(readBoardRefusal(503, null)).toEqual({ kind: "retry" });
  });

  it("`unavailable` is about the PLATFORM, never about this device (W10b)", () => {
    expect(readBoardRefusal(503, { reason: "unavailable", error: "can’t reach sign-in" })).toEqual({
      kind: "retry",
    });
  });

  it.each([
    [503, "not_configured", "Set BOARD_DEVICE_TOKEN, or sign in on this device."],
    [401, undefined, "This device isn’t authorized."],
  ])("status %s IS a verdict, and carries the server's own sentence", (status, reason, error) => {
    // The message is carried because the two verdicts need DIFFERENT instructions: a denied board
    // has a device link it isn't using; a not_configured board has none to use and its operator has
    // to sign in instead. One hardcoded "open the board with its device link" was false for the
    // staff-signed-in install this slice exists to enable.
    expect(readBoardRefusal(status, { reason, error })).toEqual({
      kind: "verdict",
      message: error,
    });
  });

  it("a verdict with no sentence still resolves — message is null, never undefined", () => {
    expect(readBoardRefusal(401, { error: "Unauthorized" })).toEqual({
      kind: "verdict",
      message: "Unauthorized",
    });
    expect(readBoardRefusal(401, {})).toEqual({ kind: "verdict", message: null });
  });
});

describe("nextBoardStateOnFailure — a board with no snapshot must not claim to be connecting", () => {
  const LIVE: BoardPollState = { kind: "live", stale: false };

  it("a board that BOOTS into an outage goes offline, not loading-forever", () => {
    // The shipped bug: `prev.kind === "live"` is false for a board that never reached live, so it
    // folded back to `loading` on every failure — "Connecting…" indefinitely, over a Ready column
    // promising "Ready orders light up here."
    let s: BoardPollState = { kind: "loading" };
    for (let i = 1; i <= 720; i++) s = nextBoardStateOnFailure(s, i, 1_000 + i);
    expect(s.kind).toBe("offline"); // one hour at the 5s cadence
  });

  it("holds `loading` until the threshold — one blip is not an outage", () => {
    expect(nextBoardStateOnFailure({ kind: "loading" }, BOARD_FAIL_THRESHOLD - 1, 50)).toEqual({
      kind: "loading",
    });
  });

  it("`since` survives every later failure — the escalation measures the WHOLE outage", () => {
    let s = nextBoardStateOnFailure({ kind: "loading" }, 2, 1_000);
    expect(s).toMatchObject({ kind: "offline", since: 1_000 });
    for (const t of [6_000, 11_000, 16_000]) s = nextBoardStateOnFailure(s, 9, t);
    // Restarting the clock on each failed poll would mean the escalation never arrives.
    expect(s).toMatchObject({ kind: "offline", since: 1_000 });
  });

  it("re-renders while offline — a NEW object each poll, or the escalation never appears", () => {
    const a = nextBoardStateOnFailure({ kind: "loading" }, 2, 1_000);
    const b = nextBoardStateOnFailure(a, 3, 6_000);
    expect(b).not.toBe(a);
  });

  it("a LIVE board keeps its orders and admits staleness — never blanks", () => {
    expect(nextBoardStateOnFailure(LIVE, 1, 10)).toBe(LIVE); // one miss: say nothing
    expect(nextBoardStateOnFailure(LIVE, BOARD_FAIL_THRESHOLD, 10)).toEqual({
      kind: "live",
      stale: true,
    });
  });
});

describe("the escalation window is decided in the fold, never at render", () => {
  it("stays soft inside the window and escalates past it", () => {
    let s = nextBoardStateOnFailure({ kind: "loading" }, 2, 0);
    expect(s).toMatchObject({ kind: "offline", escalated: false });
    s = nextBoardStateOnFailure(s, 3, STAFF_OUTAGE_ESCALATE_MS - 1);
    expect(s).toMatchObject({ escalated: false }); // "Trying again…" is still true here
    s = nextBoardStateOnFailure(s, 4, STAFF_OUTAGE_ESCALATE_MS);
    // Past two minutes the floor needs the paper instruction, not a promise it is coming back.
    expect(s).toMatchObject({ escalated: true });
  });
});
