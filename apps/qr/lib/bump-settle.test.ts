import { describe, expect, it } from "vitest";
import { bumpSettled, settleLeftMs, soonerMs } from "./bump-settle";
import { KDS_UNDO_MS } from "./kds-undo";

/**
 * The lifecycle audit (kitchen ↔ floor ↔ board) — a bump means "done" on a staff board only once it
 * has left Mom's undo window, and the board re-reads ONCE when the earliest window closes. Values,
 * each separating the two paths its mutant would merge.
 */
const NOW_ISO = "2026-10-13T19:00:00.000Z";
const NOW = Date.parse(NOW_ISO);
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe("bumpSettled — the ONE track's settled predicate, on a served row", () => {
  it("is served AND stamped at least KDS_UNDO_MS ago", () => {
    expect(bumpSettled({ state: "served", bumped_at: ago(KDS_UNDO_MS) }, NOW_ISO)).toBe(true);
    expect(bumpSettled({ state: "served", bumped_at: ago(KDS_UNDO_MS - 1) }, NOW_ISO)).toBe(false);
    expect(bumpSettled({ state: "served", bumped_at: null }, NOW_ISO)).toBe(false);
    // a stamp on a line that is no longer served (a recall nulls it, but never trust that) is not done
    expect(bumpSettled({ state: "in_progress", bumped_at: ago(60_000) }, NOW_ISO)).toBe(false);
  });
});

describe("settleLeftMs — when the earliest bump on the board turns into 'done'", () => {
  it("is the time left on the YOUNGEST-to-settle window — the earliest closing one", () => {
    // lck/bump-settle/latest-window-wins — scheduling the LAST window left the first bump's
    // "Kitchen done" waiting on a bump seconds younger.
    expect(
      settleLeftMs(
        [
          { state: "served", bumped_at: ago(1_000) },
          { state: "served", bumped_at: ago(4_000) },
        ],
        NOW_ISO,
      ),
    ).toBe(KDS_UNDO_MS - 4_000);
  });

  it("ignores settled bumps, unstamped lines and lines that are not served", () => {
    expect(
      settleLeftMs(
        [
          { state: "served", bumped_at: ago(KDS_UNDO_MS) },
          { state: "served", bumped_at: null },
          { state: "in_progress", bumped_at: ago(1_000) },
          { state: "fired" },
        ],
        NOW_ISO,
      ),
    ).toBeNull();
    expect(settleLeftMs([], NOW_ISO)).toBeNull();
  });

  it("an unknown clock schedules nothing — there is no duration to measure", () => {
    expect(settleLeftMs([{ state: "served", bumped_at: ago(1_000) }], "")).toBeNull();
  });
});

describe("soonerMs", () => {
  it("is the earlier of two optional durations", () => {
    expect(soonerMs(null, null)).toBeNull();
    expect(soonerMs(5, null)).toBe(5);
    expect(soonerMs(null, 7)).toBe(7);
    expect(soonerMs(9, 3)).toBe(3);
  });
});
