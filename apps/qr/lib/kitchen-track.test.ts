import { describe, expect, it } from "vitest";
import { KDS_UNDO_MS } from "./kds-undo";
import {
  groupStage,
  passSentAt,
  rollUp,
  servedSettled,
  trackStage,
  type TrackLine,
} from "./kitchen-track";

/**
 * PD5 — ONE KITCHEN TRACK (PATH_DESIGN_2026-10-07, round 3): the stage of a line, a same-name
 * group and a whole pass, derived in one pure module for every surface (the TV board, the guest's
 * pass, Dad's pane, the guides). Mom's KDS draws no track — her rows are its source.
 *
 * Each case is the one a `kitchen-track/*` mutant turns red. Times are relative to a fixed DB
 * clock, because every rule here is a comparison against it (the grace, the undo window).
 */
const NOW = "2026-10-08T19:48:00.000Z";
const at = (ms: number) => new Date(Date.parse(NOW) + ms).toISOString();

const line = (over: Partial<TrackLine> = {}): TrackLine => ({
  state: "fired",
  fire_at: at(-60_000),
  bumped_at: null,
  fulfillment: "dinein",
  ...over,
});

describe("trackStage — one line's stamp", () => {
  it("a draft is unsent (`kitchen-track/draft-reads-as-sending`)", () => {
    expect(trackStage(line({ state: "draft", fire_at: null }), NOW)).toBe("unsent");
  });

  it("fired inside the grace is sending; fired past it is sent (`kitchen-track/grace-reads-as-sent`)", () => {
    expect(trackStage(line({ fire_at: at(4_000) }), NOW)).toBe("sending");
    expect(trackStage(line({ fire_at: at(-1) }), NOW)).toBe("sent");
    // The edge: a line whose fire time IS now has cleared its grace (the KDS gate's own reading).
    expect(trackStage(line({ fire_at: NOW }), NOW)).toBe("sent");
  });

  it("a fired line with no fire time was fired at or before now — sent, never sending (M2)", () => {
    expect(trackStage(line({ fire_at: null }), NOW)).toBe("sent");
  });

  it("in progress is cooking (`kitchen-track/in-progress-reads-as-sent`)", () => {
    expect(trackStage(line({ state: "in_progress" }), NOW)).toBe("cooking");
  });

  it("served counts only once its bump is KDS_UNDO_MS old on the DB clock (`kitchen-track/served-ignores-the-undo-window`)", () => {
    expect(trackStage(line({ state: "served", bumped_at: at(-KDS_UNDO_MS) }), NOW)).toBe("served");
    expect(trackStage(line({ state: "served", bumped_at: at(-KDS_UNDO_MS + 1) }), NOW)).toBe(
      "cooking",
    );
    expect(trackStage(line({ state: "served", bumped_at: at(-1_000) }), NOW)).toBe("cooking");
  });

  it("served with no bump stamp is not settled — up requires bumped_at (`kitchen-track/served-without-bumped-at`)", () => {
    expect(trackStage(line({ state: "served", bumped_at: null }), NOW)).toBe("cooking");
    expect(servedSettled(null, NOW)).toBe(false);
    expect(servedSettled(at(-KDS_UNDO_MS), NOW)).toBe(true);
  });

  it("a voided line is off the track (`kitchen-track/voided-counts`)", () => {
    expect(trackStage(line({ state: "voided" }), NOW)).toBeNull();
  });

  it("a grocery line is off the track — it never cooks (`kitchen-track/grocery-counts`)", () => {
    expect(
      trackStage(line({ fulfillment: "grocery", state: "served", bumped_at: at(-9e5) }), NOW),
    ).toBeNull();
    // To-go food cooks like dine-in food; a null fulfillment is the dine-in default.
    expect(trackStage(line({ fulfillment: "togo" }), NOW)).toBe("sent");
    expect(trackStage(line({ fulfillment: null }), NOW)).toBe("sent");
  });

  it("an unknown state is off the track, never guessed", () => {
    expect(trackStage(line({ state: "mystery" }), NOW)).toBeNull();
  });
});

describe("groupStage — a same-name group reads its least-advanced line", () => {
  it("one dish served and one still sent reads sent (`kitchen-track/group-takes-the-most-advanced`)", () => {
    const served = line({ state: "served", bumped_at: at(-60_000) });
    expect(groupStage([served, line()], NOW)).toBe("sent");
    expect(groupStage([line({ state: "in_progress" }), served], NOW)).toBe("cooking");
    expect(groupStage([served, served], NOW)).toBe("served");
  });

  it("lines off the track never pull a group down (`kitchen-track/off-track-pulls-the-group`)", () => {
    const served = line({ state: "served", bumped_at: at(-60_000) });
    expect(groupStage([served, line({ state: "voided" })], NOW)).toBe("served");
    expect(groupStage([line({ state: "voided" })], NOW)).toBeNull();
    expect(groupStage([], NOW)).toBeNull();
  });
});

describe("rollUp — the pass head", () => {
  it("round 1 served and round 2 inside the grace reads sending — the least-advanced stage (m10 C)", () => {
    const r1 = [
      line({ state: "served", bumped_at: at(-120_000), fire_at: at(-600_000) }),
      line({ state: "served", bumped_at: at(-120_000), fire_at: at(-600_000) }),
    ];
    const r2 = [line({ fire_at: at(6_000) })];
    expect(rollUp([...r1, ...r2], NOW)).toEqual({ stage: "sending", sentAt: at(-600_000) });
  });

  it("every dish served past the window reads served; one inside the window holds the pass at cooking", () => {
    const old = line({ state: "served", bumped_at: at(-60_000) });
    expect(rollUp([old, old], NOW).stage).toBe("served");
    expect(rollUp([old, line({ state: "served", bumped_at: at(-2_000) })], NOW).stage).toBe(
      "cooking",
    );
  });

  it("a pass with nothing on the track has no stage and no sent time", () => {
    expect(rollUp([line({ state: "voided" })], NOW)).toEqual({ stage: null, sentAt: null });
  });
});

describe("passSentAt — the Sent stamp on the pass", () => {
  it("is the earliest fire time that has cleared the grace (`kitchen-track/sent-at-inside-the-grace`, `kitchen-track/sent-at-takes-the-latest`)", () => {
    expect(passSentAt([line({ fire_at: at(-30_000) }), line({ fire_at: at(-90_000) })], NOW)).toBe(
      at(-90_000),
    );
    // A Send still inside its grace is not sent: it cannot be the stamp.
    expect(passSentAt([line({ fire_at: at(5_000) })], NOW)).toBeNull();
    expect(passSentAt([line({ fire_at: at(5_000) }), line({ fire_at: at(-30_000) })], NOW)).toBe(
      at(-30_000),
    );
  });

  it("a draft, a voided line, a grocery line or a fired line with no stamp gives no time", () => {
    expect(passSentAt([line({ state: "draft", fire_at: null })], NOW)).toBeNull();
    expect(passSentAt([line({ state: "voided" })], NOW)).toBeNull();
    expect(passSentAt([line({ fulfillment: "grocery" })], NOW)).toBeNull();
    expect(passSentAt([line({ fire_at: null })], NOW)).toBeNull();
  });
});
