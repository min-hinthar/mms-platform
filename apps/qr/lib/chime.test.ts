import { describe, expect, it } from "vitest";
import { CHIME, CHIME_LEVEL, SOUND_KEY, mayChime, soundEnabled, type ChimeMoment } from "./chime";

/** A minimal Storage stand-in — the module only ever reads. */
const store = (v: string | null): Pick<Storage, "getItem"> => ({ getItem: () => v });
const throwing: Pick<Storage, "getItem"> = {
  getItem: () => {
    throw new Error("storage disabled");
  },
};

describe("soundEnabled — off by default, and off means silent", () => {
  it("⚠️ answers FALSE for an unset preference", () => {
    // Rule 1. This is the whole opt-in promise: a guest who has never been asked hears nothing.
    expect(soundEnabled(store(null))).toBe(false);
  });

  it("⚠️ answers FALSE when the store THROWS — a broken store is not consent", () => {
    // Private mode, partitioned storage, a locked-down browser. Failing toward "on" would make the
    // one setting whose entire point is consent behave as though it had been given.
    expect(soundEnabled(throwing)).toBe(false);
    expect(soundEnabled(null)).toBe(false);
    expect(soundEnabled(undefined)).toBe(false);
  });

  it("requires the exact opt-in value, not merely a truthy one", () => {
    // A stale or foreign value under this key must not read as consent.
    expect(soundEnabled(store("1"))).toBe(true);
    for (const v of ["0", "true", "yes", "", "on"]) {
      expect(soundEnabled(store(v))).toBe(false);
    }
  });

  it("keys off a per-DEVICE preference, not an account setting", () => {
    // A guest's phone, like the KDS volume — not something that follows them onto a shared device.
    expect(SOUND_KEY).toMatch(/^mms\./);
  });
});

describe("mayChime — enabled and armed are separate failures", () => {
  it("⚠️ stays silent when sound is on but the context never armed", () => {
    // Reachable: the diner enabled sound in a previous session, or the resume was refused. Collapsing
    // the two flags would make this path either throw or play into a dead context.
    expect(mayChime({ enabled: true, armed: false })).toBe(false);
  });

  it("stays silent when armed but not enabled", () => {
    expect(mayChime({ enabled: false, armed: true })).toBe(false);
    expect(mayChime({ enabled: false, armed: false })).toBe(false);
  });

  it("plays only when both are true", () => {
    expect(mayChime({ enabled: true, armed: true })).toBe(true);
  });
});

describe("the vocabulary", () => {
  it("⚠️ has NO error moment, and must never grow one", () => {
    // Rule 3. A sound on failure turns a recoverable problem into a public one — the whole table
    // looks over. Errors are read, not heard.
    const moments = Object.keys(CHIME);
    expect(moments).toEqual(["sent", "paid"]);
    for (const m of moments) {
      expect(m).not.toMatch(/error|fail|warn|refus|declin/i);
    }
  });

  it("is only the two moments the app already treats as ceremony", () => {
    // Rule 4. Giving ordinary traffic (an add, a tap, a step) a sound is how an app becomes a slot
    // machine — and it is why `haptics.ts` has four weights while this has two moments.
    expect(Object.keys(CHIME)).toHaveLength(2);
  });

  it("⚠️ resolves DOWN on pay, closing the phrase the bell opened", () => {
    // The two moments are one musical phrase across the meal: `sent` lifts G5→C6, `paid` comes back
    // C6→G5. If pay ever rises too, the pair stops being a beginning and an end.
    const sent = CHIME.sent;
    const paid = CHIME.paid;
    const first = sent[0]!.freq;
    const last = sent[sent.length - 1]!.freq;
    expect(last).toBeGreaterThan(first); // the bell lifts
    expect(paid[0]!.freq).toBe(last); // and pay picks up exactly where it left off
    expect(paid[paid.length - 1]!.freq).toBe(first); // resolving home
    expect(paid[paid.length - 1]!.freq).toBeLessThan(paid[0]!.freq); // i.e. downward
  });

  it("schedules notes in order, with real durations", () => {
    for (const notes of Object.values(CHIME)) {
      let prev = -1;
      for (const n of notes) {
        expect(n.at).toBeGreaterThan(prev);
        expect(n.dur).toBeGreaterThan(0);
        // Audible on a phone speaker without being shrill.
        expect(n.freq).toBeGreaterThan(400);
        expect(n.freq).toBeLessThan(2000);
        prev = n.at;
      }
    }
  });

  it("⚠️ stays quieter than the KITCHEN chime — this is a phone at a table", () => {
    // The KDS default is 0.8: a working device in a loud kitchen. This is someone's dinner, with
    // other people at the table. Loud enough for the person holding it, not for the room.
    expect(CHIME_LEVEL).toBeLessThan(0.8);
    expect(CHIME_LEVEL).toBeGreaterThan(0);
  });

  it("every moment is a known key — no string can reach the engine unchecked", () => {
    const m: ChimeMoment = "sent";
    expect(CHIME[m]).toBeDefined();
  });
});
