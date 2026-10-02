import { describe, expect, it } from "vitest";
import { STAFF_CONTRACT, type Served, type VersionVerdict } from "./build-stamp";
import {
  COUNTDOWN_MS,
  CURRENT,
  RETIRED_SNOOZE_MS,
  SNOOZE_MS,
  VERSION_POLL_MS,
  stepUpdate,
  type UpdateEvent,
  type UpdatePhase,
} from "./update-policy";

/**
 * Phase 2i (P2bi) — the state machine behind the staff bar's version row. Each rule is a moment on
 * a real screen: the countdown a cook's tap must cancel, the Not now that must not silence a
 * person's own Reload, the retired screen that must not loop.
 */
const SERVED: Served = { build: "mfq3k9zz-ffee0011", contract: STAFF_CONTRACT };
const changed = (incompatible = false): VersionVerdict => ({
  kind: "changed",
  served: SERVED,
  incompatible,
});
const T = 1_000_000;
const stale = (over: Partial<Extract<UpdatePhase, { k: "stale" }>> = {}): UpdatePhase => ({
  k: "stale",
  served: SERVED,
  retired: false,
  snoozeUntil: null,
  ...over,
});
const countdown = (over: Partial<Extract<UpdatePhase, { k: "countdown" }>> = {}): UpdatePhase => ({
  k: "countdown",
  served: SERVED,
  retired: false,
  endsAt: T + COUNTDOWN_MS,
  ...over,
});
const step = (p: UpdatePhase, ev: UpdateEvent) => stepUpdate(p, ev);
const tick = (now: number, autoClear = true, tried = false): UpdateEvent => ({
  e: "tick",
  now,
  autoClear,
  tried,
});

describe("verdict", () => {
  it("changed → stale; incompatible → stale and retired", () => {
    expect(step(CURRENT, { e: "verdict", v: changed(), now: T }).phase).toEqual(stale());
    expect(step(CURRENT, { e: "verdict", v: changed(true), now: T }).phase).toEqual(
      stale({ retired: true }),
    );
  });
  it("a countdown stays a countdown; unknown changes nothing", () => {
    expect(step(countdown(), { e: "verdict", v: changed(), now: T }).phase).toEqual(countdown());
    expect(step(stale(), { e: "verdict", v: { kind: "unknown" }, now: T }).phase).toEqual(stale());
  });
  it("a compatible new build never UN-retires a retired screen", () => {
    // MUTATION (p2i-policy/verdict-unretires): the next poll's compatible answer drops `retired`, and
    // the screen that is dropping taps goes back to waiting for full quiet; red.
    expect(step(stale({ retired: true }), { e: "verdict", v: changed(), now: T }).phase).toEqual(
      stale({ retired: true }),
    );
  });
  it("a verdict while the executor runs changes nothing — its own outcome decides", () => {
    // MUTATION (p2i-policy/verdict-races-apply): a watcher's `current` lands mid-apply and the
    // executor's refusal then finds no applying phase to return from; red.
    const applying: UpdatePhase = { k: "applying", served: SERVED, retired: false, mode: "manual" };
    expect(step(applying, { e: "verdict", v: { kind: "current" }, now: T }).phase).toBe(applying);
  });
  it("current clears a stale screen — but never a retired one", () => {
    // MUTATION (p2i-policy/current-clears-retired): a retired screen whose version check reads
    // current hides its row while its actions are still gone; red.
    expect(step(stale(), { e: "verdict", v: { kind: "current" }, now: T }).phase).toEqual(CURRENT);
    expect(
      step(stale({ retired: true }), { e: "verdict", v: { kind: "current" }, now: T }).phase,
    ).toEqual(stale({ retired: true }));
  });
});

describe("retired", () => {
  it("→ stale and retired, and asks for a version check", () => {
    expect(step(CURRENT, { e: "retired", now: T })).toEqual({
      phase: stale({ served: null, retired: true }),
      effect: { check: true },
    });
  });
  it("is ignored for RETIRED_SNOOZE_MS after an apply came back current (no loop)", () => {
    // MUTATION (p2i-policy/retired-loops): an anomaly reloads, comes back current, is witnessed
    // retired again, and reloads forever; red.
    const applying: UpdatePhase = { k: "applying", served: null, retired: true, mode: "auto" };
    const back = step(applying, { e: "outcome", o: { kind: "current" }, now: T }).phase;
    expect(back.k).toBe("current");
    expect(step(back, { e: "retired", now: T + RETIRED_SNOOZE_MS - 1 }).phase).toBe(back);
    expect(step(back, { e: "retired", now: T + RETIRED_SNOOZE_MS }).phase.k).toBe("stale");
  });
});

describe("tick — the countdown", () => {
  it("a quiet, untried stale screen starts a VISIBLE countdown of COUNTDOWN_MS", () => {
    // MUTATION (p2i-policy/countdown-instant): the reload is applied at the first quiet tick, with
    // no countdown and no Not now; red.
    expect(step(stale(), tick(T))).toEqual({
      phase: countdown({ endsAt: T + COUNTDOWN_MS }),
      effect: null,
    });
  });
  it("applies only AT endsAt", () => {
    const c = countdown({ endsAt: T + COUNTDOWN_MS });
    expect(step(c, tick(T + COUNTDOWN_MS - 1))).toEqual({ phase: c, effect: null });
    expect(step(c, tick(T + COUNTDOWN_MS))).toEqual({
      phase: { k: "applying", served: SERVED, retired: false, mode: "auto" },
      effect: { apply: "auto" },
    });
  });
  it("a block mid-countdown cancels it", () => {
    // MUTATION (p2i-policy/countdown-ignores-block): a dialog that opens, or a write that starts,
    // during the countdown does not stop it; red.
    expect(step(countdown(), tick(T + 1, false)).phase).toEqual(stale());
  });
  it("a tried target never counts down (no automatic loop)", () => {
    // MUTATION (p2i-policy/tried-retries): a target this tab already reloaded into without success
    // is retried automatically, forever; red.
    expect(step(stale(), tick(T, true, true)).phase).toEqual(stale());
    expect(step(countdown(), tick(T, true, true)).phase).toEqual(stale());
  });
  it("a blocked tick changes nothing", () => {
    expect(step(stale(), tick(T, false)).phase).toEqual(stale());
  });
});

describe("input · Not now · tap", () => {
  it("any input during the countdown cancels it", () => {
    // MUTATION (p2i-policy/countdown-ignores-input): a cook's tap does not stop the reload; red.
    expect(step(countdown(), { e: "input" }).phase).toEqual(stale());
    expect(step(stale(), { e: "input" }).phase).toEqual(stale());
  });
  it("Not now snoozes SNOOZE_MS; a retired screen only RETIRED_SNOOZE_MS", () => {
    // MUTATION (p2i-policy/retired-snooze-long): a retired screen dropping taps sleeps 10 min; red.
    expect(step(countdown(), { e: "notNow", now: T }).phase).toEqual(
      stale({ snoozeUntil: T + SNOOZE_MS }),
    );
    expect(step(countdown({ retired: true }), { e: "notNow", now: T }).phase).toEqual(
      stale({ retired: true, snoozeUntil: T + RETIRED_SNOOZE_MS }),
    );
  });
  it("Not now is AUTO-only: a tap still applies at once", () => {
    // MUTATION (p2i-policy/snooze-blocks-manual): after Not now, the person's own Reload does
    // nothing for ten minutes; red.
    const snoozed = step(countdown(), { e: "notNow", now: T }).phase;
    expect(step(snoozed, { e: "tap" })).toEqual({
      phase: { k: "applying", served: SERVED, retired: false, mode: "manual" },
      effect: { apply: "manual" },
    });
  });
  it("the snooze is bounded: a tick AT snoozeUntil counts down", () => {
    // MUTATION (p2i-policy/snooze-forever): Not now never expires; red.
    const snoozed = stale({ snoozeUntil: T + SNOOZE_MS });
    expect(step(snoozed, tick(T + SNOOZE_MS - 1)).phase).toEqual(snoozed);
    expect(step(snoozed, tick(T + SNOOZE_MS)).phase.k).toBe("countdown");
  });
  it("a tap while applying is ignored; a tap on a current screen does nothing", () => {
    const applying: UpdatePhase = { k: "applying", served: SERVED, retired: false, mode: "manual" };
    expect(step(applying, { e: "tap" })).toEqual({ phase: applying, effect: null });
    expect(step(CURRENT, { e: "tap" })).toEqual({ phase: CURRENT, effect: null });
  });
});

describe("outcome", () => {
  const manual: UpdatePhase = { k: "applying", served: SERVED, retired: false, mode: "manual" };
  const auto: UpdatePhase = { ...manual, mode: "auto" };
  it("reloading stays applying; current → current", () => {
    expect(step(manual, { e: "outcome", o: { kind: "reloading" }, now: T }).phase).toBe(manual);
    expect(step(manual, { e: "outcome", o: { kind: "current" }, now: T }).phase.k).toBe("current");
  });
  it("a refused manual apply → stale, free to tap again at once", () => {
    expect(
      step(manual, { e: "outcome", o: { kind: "refused", block: { kind: "saving" } }, now: T })
        .phase,
    ).toEqual(stale());
  });
  it("a refused AUTOMATIC apply waits one poll before counting down again", () => {
    // MUTATION (p2i-policy/auto-refusal-loops): a failing pre-flight counts down and refuses every
    // few seconds, flashing the row and fetching each time; red.
    const back = step(auto, {
      e: "outcome",
      o: { kind: "refused", block: { kind: "check" } },
      now: T,
    }).phase;
    expect(back).toEqual(stale({ snoozeUntil: T + VERSION_POLL_MS }));
    expect(step(back, tick(T + 1)).phase).toEqual(back);
  });
});
