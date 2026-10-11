import { describe, expect, it } from "vitest";
import type { CartItem } from "@mms/db";
import { KDS_UNDO_MS } from "./kds-undo";
import {
  passClock,
  passHead,
  passMemory,
  passRowStage,
  planPassMotion,
  settleRereadDelayMs,
  trackLineOf,
  viewClockIso,
  type PassMemory,
} from "./live-pass";
import { GRACE_REREAD_MARGIN_MS } from "./show-server";

/**
 * PD10 — the guest's live One Pass, decided as values (lib/live-pass). Each case is the one a
 * `live-pass/*` mutant turns red. The clock is the VIEW's DB clock, fixed for the view's life: a stage
 * moves only on an observed view, never on this phone's clock.
 */
const NOW = "2026-10-11T01:48:00.000Z";
const NOW_MS = Date.parse(NOW);
const at = (ms: number) => new Date(NOW_MS + ms).toISOString();

const item = (over: Partial<CartItem> = {}): CartItem => ({
  id: "l-1",
  menuItemId: "m-1",
  name: "Mohinga",
  qty: 1,
  modifiers: [],
  unitPriceCents: 1400,
  taxCents: 147,
  lineState: "fired",
  fireAt: at(-60_000),
  bumpedAt: null,
  fulfillment: "dinein",
  ...over,
});

describe("trackLineOf / viewClockIso — the view's lines and clock, as the track reads them", () => {
  it("maps the view's raw columns, never re-shaped", () => {
    expect(
      trackLineOf(
        item({ lineState: "served", fireAt: at(-9), bumpedAt: at(-7), fulfillment: "togo" }),
      ),
    ).toEqual({ state: "served", fire_at: at(-9), bumped_at: at(-7), fulfillment: "togo" });
    // An absent stamp is null — never undefined into a comparison.
    expect(trackLineOf(item({ fireAt: undefined, bumpedAt: undefined }))).toMatchObject({
      fire_at: null,
      bumped_at: null,
    });
  });

  it("an unknown clock is '' — every comparison against it fails closed, never this phone's time", () => {
    // MUTATION (live-pass/unknown-clock-reads-the-phone): this phone's time substituted — a bump
    // Mom may still take back reads Served on a phone whose clock runs ahead; red.
    expect(viewClockIso(null)).toBe("");
    expect(viewClockIso(Number.NaN)).toBe("");
    expect(viewClockIso(NOW_MS)).toBe(NOW);
    // Unknown clock: a bump is never settled, a fire inside nothing is never "sent" early.
    expect(passRowStage(item({ lineState: "served", bumpedAt: at(-60_000) }), "")).toBe("cooking");
  });
});

describe("passRowStage / passHead — on the view's DB clock", () => {
  it("a bump inside Mom's undo window is still Cooking; past it, Served", () => {
    expect(passRowStage(item({ lineState: "served", bumpedAt: at(-1_000) }), NOW)).toBe("cooking");
    expect(passRowStage(item({ lineState: "served", bumpedAt: at(-KDS_UNDO_MS) }), NOW)).toBe(
      "served",
    );
  });
  it("the head is the roll-up — the least advanced dish", () => {
    const head = passHead(
      [
        item({ id: "a", lineState: "served", bumpedAt: at(-60_000) }),
        item({ id: "b", lineState: "in_progress" }),
        item({ id: "c", lineState: "fired", fireAt: at(-120_000) }),
      ],
      NOW,
    );
    expect(head.stage).toBe("sent");
    expect(head.sentAt).toBe(at(-120_000));
  });
});

describe("settleRereadDelayMs — ONE re-read when the clock alone changes a stage", () => {
  it("a bump leaving Mom's undo window: its remaining window on the DB clock, plus the margin", () => {
    // MUTATION (live-pass/settle-reread-ignores-the-bump): the served arm dropped — the pass and the
    // served door stay on "Cooking" until some unrelated event re-reads (none may come); red.
    // MUTATION (live-pass/settle-reread-forgets-the-undo-window): measured to the bump itself, not
    // past Mom's six seconds — the re-read lands inside the window, still unsettled, and never
    // re-arms; red.
    const bumped = item({ lineState: "served", bumpedAt: at(-2_000) });
    expect(settleRereadDelayMs([bumped], NOW_MS)).toBe(
      KDS_UNDO_MS - 2_000 + GRACE_REREAD_MARGIN_MS,
    );
  });
  it("a Send leaving its grace: its remaining grace, plus the margin — the earliest change wins", () => {
    const sending = item({ id: "s", lineState: "fired", fireAt: at(4_000) });
    const bumped = item({ id: "b", lineState: "served", bumpedAt: at(-1_000) });
    expect(settleRereadDelayMs([sending], NOW_MS)).toBe(4_000 + GRACE_REREAD_MARGIN_MS);
    expect(settleRereadDelayMs([bumped, sending], NOW_MS)).toBe(4_000 + GRACE_REREAD_MARGIN_MS);
  });
  it("nothing waiting on the clock — or no clock at all — schedules nothing", () => {
    expect(settleRereadDelayMs([item({ lineState: "in_progress" })], NOW_MS)).toBeNull();
    expect(
      settleRereadDelayMs([item({ lineState: "served", bumpedAt: at(-KDS_UNDO_MS - 1) })], NOW_MS),
    ).toBeNull();
    expect(
      settleRereadDelayMs([item({ lineState: "served", bumpedAt: at(-1_000) })], null),
    ).toBeNull();
    // A grocery line never fires and never settles.
    expect(
      settleRereadDelayMs(
        [item({ fulfillment: "grocery", lineState: "fired", fireAt: at(4_000) })],
        NOW_MS,
      ),
    ).toBeNull();
  });
});

describe("passClock — the stub's Sent stamp, on the RESTAURANT's clock", () => {
  it("is the Los Angeles wall clock, never the device's zone, with a plain space before AM/PM", () => {
    // 01:14Z on 11 October is 6:14 PM on 10 October in Los Angeles (PDT, UTC−7).
    const sent = passClock("2026-10-11T01:14:00.000Z");
    expect(sent).toBe("6:14 PM");
    expect(sent).not.toMatch(/\u202f/);
    expect(passClock("not a time")).toBe("");
  });
});

describe("planPassMotion — one thing at a time, only on an observed advance", () => {
  const mem = (
    stages: Record<string, ReturnType<typeof passRowStage>>,
    head: PassMemory["head"],
    door: boolean | null = null,
  ): PassMemory => ({ stages: new Map(Object.entries(stages)), head, door });

  it("a first read seeds and plays nothing", () => {
    expect(planPassMotion(null, mem({ a: "served" }, "served", true), false)).toEqual([]);
  });

  it("a FOREGROUND re-read plays nothing — the phone missed it; it is drawn at its final frame", () => {
    // MUTATION (live-pass/foreground-view-celebrates): `quiet` ignored — a phone coming back from the
    // lock screen plays a storm of fills, a TURN and "Ready to pay." for things that happened while
    // it was away; red.
    const prev = mem({ a: "sent" }, "sent", false);
    expect(planPassMotion(prev, mem({ a: "served" }, "served", true), true)).toEqual([]);
  });

  it("FILL only where an advance LIGHTS a new segment; a new row or the dashed grace fills nothing", () => {
    // MUTATION (live-pass/fill-on-an-unlit-advance): any change fills — "Sending…"'s dashed segment
    // (nothing landed) and a recall's un-fill animate; red.
    const prev = mem({ a: "sent", b: "unsent", c: "cooking" }, "unsent");
    const next = mem({ a: "cooking", b: "sending", c: "sent", d: "sent" }, "sending");
    expect(planPassMotion(prev, next, false)).toEqual([{ kind: "fill", id: "a" }]);
  });

  it("several rows landing together fill row by row in cart order, then the head TURNs, then the door", () => {
    const prev = mem({ a: "cooking", b: "sent", c: "served" }, "sent", false);
    const next = mem({ a: "served", b: "served", c: "served" }, "served", true);
    expect(planPassMotion(prev, next, false)).toEqual([
      { kind: "fill", id: "a" },
      { kind: "fill", id: "b" },
      { kind: "turn" },
      { kind: "door" },
    ]);
  });

  it("the TURN plays on the EDGE into Served — never again on a view that was already Served", () => {
    // MUTATION (live-pass/turn-on-every-served-view): the 'was not served' half dropped — every
    // realtime echo after the last bump turns the head again; red.
    expect(
      planPassMotion(mem({ a: "served" }, "served"), mem({ a: "served" }, "served"), false),
    ).toEqual([]);
    // …and a recall then a re-serve is news again (an edge, never a latch).
    expect(
      planPassMotion(mem({ a: "cooking" }, "cooking"), mem({ a: "served" }, "served"), false),
    ).toContainEqual({ kind: "turn" });
  });

  it("the door moment plays only on an OBSERVED held → open edge — never on its first sighting", () => {
    // MUTATION (live-pass/door-on-first-sighting): a door first watched already open plays the POP
    // and says "Ready to pay." — the Bill opened (or the phone flipped to it) over an open door; red.
    expect(
      planPassMotion(
        mem({ a: "served" }, "served", null),
        mem({ a: "served" }, "served", true),
        false,
      ),
    ).toEqual([]);
    expect(
      planPassMotion(
        mem({ a: "served" }, "served", false),
        mem({ a: "served" }, "served", true),
        false,
      ),
    ).toEqual([{ kind: "door" }]);
    // A door closing (a recall) moves nothing: the reason returns silently.
    expect(
      planPassMotion(
        mem({ a: "served" }, "served", true),
        mem({ a: "cooking" }, "cooking", false),
        false,
      ),
    ).toEqual([]);
  });

  it("passMemory reads every row and the head on the view's clock", () => {
    const m = passMemory(
      [
        item({ id: "a", lineState: "served", bumpedAt: at(-1_000) }),
        item({ id: "v", lineState: "voided" }),
      ],
      NOW,
      false,
    );
    expect([...m.stages]).toEqual([
      ["a", "cooking"],
      ["v", null],
    ]);
    expect(m.head).toBe("cooking");
    expect(m.door).toBe(false);
  });
});
