import { describe, expect, it } from "vitest";
import {
  GUIDE_SEEN_MARK,
  GUIDE_SEEN_PREFIX,
  GUIDE_STORE_REFUSED,
  claimGuideFirstRun,
  guideDue,
  guideSeenKey,
  readGuideMark,
  type GuideStore,
} from "./guide-seen";

/** An in-memory store, with a switch to refuse reads and a switch to refuse writes. */
function memStore(opts: { refuseRead?: boolean; refuseWrite?: boolean } = {}) {
  const map = new Map<string, string>();
  const store: GuideStore = {
    getItem: (k) => {
      if (opts.refuseRead) throw new DOMException("denied", "SecurityError");
      return map.get(k) ?? null;
    },
    setItem: (k, v) => {
      if (opts.refuseWrite) throw new DOMException("full", "QuotaExceededError");
      map.set(k, v);
    },
  };
  return { map, get: () => store };
}

const STAFF_A = "0b6e1c2a-5f4e-4c7b-9a1d-3e2f1a0b9c8d";
const STAFF_B = "7d3c2b1a-0f9e-4d8c-8b7a-6f5e4d3c2b1a";

describe("guideSeenKey — one key per surface, per revision, per person", () => {
  it("names the surface, the revision and the person, under the one prefix", () => {
    expect(guideSeenKey("counter", 1, STAFF_A)).toBe(`${GUIDE_SEEN_PREFIX}counter:1:${STAFF_A}`);
    // A per-DEVICE guide (m11's) leaves the person out.
    expect(guideSeenKey("dinein", 1)).toBe(`${GUIDE_SEEN_PREFIX}dinein:1`);
    expect(GUIDE_SEEN_PREFIX.startsWith("mms.")).toBe(true);
  });
  it("two people on one tablet are two first mornings", () => {
    expect(guideSeenKey("counter", 1, STAFF_A)).not.toBe(guideSeenKey("counter", 1, STAFF_B));
  });
  it("two stations are two first mornings for one person", () => {
    expect(guideSeenKey("counter", 1, STAFF_A)).not.toBe(guideSeenKey("kitchen", 1, STAFF_A));
  });
  it("a guide that changed SHAPE (a new revision) is a new first morning", () => {
    expect(guideSeenKey("counter", 2, STAFF_A)).not.toBe(guideSeenKey("counter", 1, STAFF_A));
    expect(guideSeenKey("dinein", 2)).not.toBe(guideSeenKey("dinein", 1));
  });
  it("a per-person key never equals the per-device key of the same surface", () => {
    expect(guideSeenKey("counter", 1, STAFF_A)).not.toBe(guideSeenKey("counter", 1));
  });
  it("refuses a malformed segment or revision — never a key that might collide", () => {
    expect(() => guideSeenKey("", 1)).toThrow(RangeError);
    expect(() => guideSeenKey("count:er", 1)).toThrow(RangeError);
    expect(() => guideSeenKey("counter", 0)).toThrow(RangeError);
    expect(() => guideSeenKey("counter", 1.5)).toThrow(RangeError);
    expect(() => guideSeenKey("counter", 1, "")).toThrow(RangeError);
    expect(() => guideSeenKey("counter", 1, "a:b")).toThrow(RangeError);
  });
});

describe("guideDue — never shown, the store answered, and the screen is quiet", () => {
  it("due only when nothing is stored and the screen is quiet", () => {
    expect(guideDue({ stored: null, quiet: true })).toBe(true);
  });
  it("a seen key is never due again", () => {
    expect(guideDue({ stored: GUIDE_SEEN_MARK, quiet: true })).toBe(false);
    expect(guideDue({ stored: "anything", quiet: true })).toBe(false);
  });
  it("a refused store is never due", () => {
    expect(guideDue({ stored: GUIDE_STORE_REFUSED, quiet: true })).toBe(false);
  });
  it("a busy screen is not due — the guide waits for the next quiet open", () => {
    expect(guideDue({ stored: null, quiet: false })).toBe(false);
  });
});

describe("readGuideMark — a refused read is never 'unseen'", () => {
  it("returns the stored value, or null when nothing is stored", () => {
    const s = memStore();
    expect(readGuideMark(s.get, "k")).toBeNull();
    s.map.set("k", GUIDE_SEEN_MARK);
    expect(readGuideMark(s.get, "k")).toBe(GUIDE_SEEN_MARK);
  });
  it("a store that throws on read, or on access, answers the refusal", () => {
    expect(readGuideMark(memStore({ refuseRead: true }).get, "k")).toBe(GUIDE_STORE_REFUSED);
    const blocked = () => {
      throw new DOMException("blocked", "SecurityError");
    };
    expect(readGuideMark(blocked, "k")).toBe(GUIDE_STORE_REFUSED);
  });
});

describe("claimGuideFirstRun — marked the moment it shows; refused means never by itself", () => {
  const key = guideSeenKey("counter", 1, STAFF_A);
  it("a first quiet open shows it AND marks it before answering", () => {
    const s = memStore();
    expect(claimGuideFirstRun(s.get, key, true)).toBe(true);
    expect(s.map.get(key)).toBe(GUIDE_SEEN_MARK);
  });
  it("the second open never shows it — not after a reload, a Close or the last step", () => {
    const s = memStore();
    expect(claimGuideFirstRun(s.get, key, true)).toBe(true);
    expect(claimGuideFirstRun(s.get, key, true)).toBe(false);
  });
  it("a busy first open shows nothing and marks NOTHING — the next quiet open still shows it", () => {
    const s = memStore();
    expect(claimGuideFirstRun(s.get, key, false)).toBe(false);
    expect(s.map.has(key)).toBe(false);
    expect(claimGuideFirstRun(s.get, key, true)).toBe(true);
  });
  it("a refused read never shows it, and writes nothing", () => {
    const s = memStore({ refuseRead: true });
    expect(claimGuideFirstRun(s.get, key, true)).toBe(false);
    expect(s.map.size).toBe(0);
  });
  it("a refused write never shows it — no interruption on every load", () => {
    const s = memStore({ refuseWrite: true });
    expect(claimGuideFirstRun(s.get, key, true)).toBe(false);
  });
  it("another person's mark on the same tablet does not stand for this one", () => {
    const s = memStore();
    expect(claimGuideFirstRun(s.get, guideSeenKey("counter", 1, STAFF_B), true)).toBe(true);
    expect(claimGuideFirstRun(s.get, key, true)).toBe(true);
  });
});
