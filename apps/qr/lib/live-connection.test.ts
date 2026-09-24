import { describe, expect, it } from "vitest";
import {
  COUNTER_FEEDS,
  NET_SHOW_MS,
  aggregateConnection,
  counterFold,
  liveDot,
  liveFold,
  offlineSustained,
} from "./live-connection";

describe("aggregateConnection — the screen's ONE connection word for a report", () => {
  it("no board has reported: the screen is a page", () => {
    expect(aggregateConnection({})).toBe("page");
  });
  it("every board live: live", () => {
    expect(aggregateConnection({ floor: "live", bags: "live" })).toBe("live");
  });
  it("ANY board frozen is the screen's word — the person was staring at a frozen board", () => {
    // MUTATION-shaped: fold with `every` instead of `includes` → a frozen lane beside a live floor
    // reports "live", and the owner cannot tell a frozen-lane report from a live one.
    expect(aggregateConnection({ floor: "live", bags: "not_updating" })).toBe("not_updating");
    expect(aggregateConnection({ floor: "not_updating", bags: "live" })).toBe("not_updating");
  });
});

// ── Phase 2b · feedback ──

describe("liveDot — the bar's ONE word for a feed page, offline first", () => {
  it("a sustained offline outranks a live feed — the device cannot hear the feed it shows", () => {
    // MUTATION `offline-hides-behind-a-feed`: offline tested only when no feed answered — a counter
    // bar on a dead wifi keeps a green 'Live' dot over boards that can no longer update.
    expect(liveDot(true, "live")).toBe("offline");
    expect(liveDot(true, "not_updating")).toBe("offline");
    expect(liveDot(true, undefined)).toBe("offline");
  });
  it("a feedless page (or a counter no board has reported on yet) draws NO dot — never a guessed Live", () => {
    // MUTATION `a-feedless-page-says-live`: the null arm dropped — the reserved mark before the
    // counter's first report, and every feedless call, would claim 'Live' with nothing behind it.
    expect(liveDot(false, "page")).toBeNull();
    expect(liveDot(false, undefined)).toBeNull();
  });
  it("a frozen feed is stale, a live one is live", () => {
    expect(liveDot(false, "not_updating")).toBe("stale");
    expect(liveDot(false, "live")).toBe("live");
  });
});

describe("liveFold / counterFold — the counter folds ITS two boards, never the manager rail", () => {
  it("unreported boards are a page; one live report is live; any frozen board is the word", () => {
    expect(liveFold([undefined, undefined])).toBe("page");
    expect(liveFold(["live", undefined])).toBe("live");
    expect(liveFold(["live", "not_updating"])).toBe("not_updating");
    expect(liveFold([])).toBe("page");
  });
  it("the counter's feeds are the floor and the bags — exactly", () => {
    expect([...COUNTER_FEEDS]).toEqual(["floor", "bags"]);
  });
  it("a frozen approvals rail never makes the counter bar say its boards are stale", () => {
    // MUTATION `approvals-freezes-the-counter-dot`: fold every report — a stale manager rail turns
    // the counter's dot 'Not updating' over a floor and a lane that are both live.
    expect(counterFold({ floor: "live", bags: "live", approvals: "not_updating" })).toBe("live");
    expect(counterFold({ floor: "live", bags: "not_updating" })).toBe("not_updating");
    expect(counterFold({ approvals: "not_updating" })).toBe("page");
    expect(counterFold({})).toBe("page");
  });
});

describe("offlineSustained — the row waits out a blip", () => {
  const now = 1_000_000;
  it("NET_SHOW_MS is two seconds", () => {
    expect(NET_SHOW_MS).toBe(2000);
  });
  it("one millisecond short of the sustain is a blip; the sustain itself shows", () => {
    // MUTATION `the-row-shows-on-a-blip`: any offlineSince shows the row — marginal wifi flaps it.
    expect(offlineSustained(now - (NET_SHOW_MS - 1), now)).toBe(false);
    expect(offlineSustained(now - NET_SHOW_MS, now)).toBe(true);
    expect(offlineSustained(null, now)).toBe(false);
  });
});
