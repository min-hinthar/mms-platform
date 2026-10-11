import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { SAME_GESTURE_MS } from "@mms/ui";
import { STAFF, type StaffKey } from "./i18n/staff";
import { HELP_SCREENS } from "./help";
import { GUIDE_SEEN_PREFIX } from "./guide-seen";
import { CLEAR_UNDO_MS } from "./clear-window";
import { KDS_UNDO_MS } from "./kds-undo";
import {
  GUIDE_ARM_MS,
  GUIDE_SAMPLE,
  STAFF_GUIDE_REVISION,
  STAFF_GUIDE_SHIPS,
  STAFF_GUIDE_STEPS,
  counterAskingAtMount,
  counterGuideQuiet,
  guideActAccepted,
  kitchenGuideQuiet,
  staffGuideKey,
  staffGuideOpensItself,
  staffGuideShips,
} from "./staff-guide";

const STAFF_A = "0b6e1c2a-5f4e-4c7b-9a1d-3e2f1a0b9c8d";
const STAFF_B = "7d3c2b1a-0f9e-4d8c-8b7a-6f5e4d3c2b1a";

/** The `{slot}` names of a template. */
const slots = (s: string) => new Set([...s.matchAll(/\{([a-z]+)\}/g)].map((m) => m[1]!));
const sameSet = (a: Set<string>, b: Set<string>) =>
  a.size === b.size && [...a].every((x) => b.has(x));

describe("the guide model — five steps per station, every word a real key", () => {
  it("each station walks exactly five steps (the owner's 'five steps')", () => {
    for (const screen of HELP_SCREENS) expect(STAFF_GUIDE_STEPS[screen]).toHaveLength(5);
  });

  it("every title and sentence is a dictionary key, and every slot is filled exactly — both tongues", () => {
    for (const screen of HELP_SCREENS)
      for (const [i, step] of STAFF_GUIDE_STEPS[screen].entries()) {
        const where = `${screen} step ${i + 1}`;
        const uses: { k: StaffKey; vars?: Readonly<Record<string, number>> }[] = [
          { k: step.title, vars: step.titleVars },
          ...step.lines,
        ];
        for (const { k, vars } of uses) {
          expect(k in STAFF, `${where}: ${k}`).toBe(true);
          const given = new Set(Object.keys(vars ?? {}));
          expect(sameSet(slots(STAFF[k].en), given), `${where}: ${k} en slots`).toBe(true);
          expect(sameSet(slots(STAFF[k].my), given), `${where}: ${k} my slots`).toBe(true);
        }
        expect(step.lines.length, where).toBeGreaterThan(0);
      }
  });

  it("each title is the CONTROL'S own key — never a help sentence (pointing-and-calling, B7)", () => {
    for (const screen of HELP_SCREENS)
      for (const step of STAFF_GUIDE_STEPS[screen]) {
        expect(step.title.startsWith("help."), step.title).toBe(false);
      }
    // The ring's one word is the vocabulary's one key (P2do retired its twins into it).
    expect(STAFF_GUIDE_STEPS.counter[1]!.title).toBe("pad.group.unsent");
    expect(STAFF_GUIDE_STEPS.kitchen[3]!.title).toBe("kds.stat.late");
  });

  it("D3(c) — no guide step ever shows help.how.kitchen.2.more (it names the Undo bar with the rail's word)", () => {
    const named = HELP_SCREENS.flatMap((s) =>
      STAFF_GUIDE_STEPS[s].flatMap((st) => [st.title, ...st.lines.map((l) => l.k)]),
    );
    expect(named).not.toContain("help.how.kitchen.2.more");
    // …and step 3 teaches the two words through their own controls' keys, in their own places.
    expect(STAFF["kds.undo"].my).not.toBe(STAFF["kds.recall"].my);
  });

  it("the seconds in a sentence are the windows' own constants, never typed", () => {
    const clear = STAFF_GUIDE_STEPS.counter[4]!.lines[0]!;
    expect(clear.k).toBe("help.guide.counter.clear");
    expect(clear.vars).toEqual({ n: CLEAR_UNDO_MS / 1000 });
    const undo = STAFF_GUIDE_STEPS.kitchen[2]!.lines.find((l) => l.k === "help.how.kitchen.2")!;
    expect(undo.vars).toEqual({ n: KDS_UNDO_MS / 1000 });
    // No guide sentence types a digit of its own (Late quotes no minutes — they are configurable).
    for (const screen of HELP_SCREENS)
      for (const step of STAFF_GUIDE_STEPS[screen])
        for (const l of step.lines) expect(/\d/.test(STAFF[l.k].en), l.k).toBe(false);
  });

  it("the titles name the sample the pictures draw — named once", () => {
    const k = STAFF_GUIDE_STEPS.kitchen;
    expect(k[0]!.titleVars).toEqual({ id: GUIDE_SAMPLE.kitchen.landed });
    expect(k[1]!.titleVars).toEqual({ id: GUIDE_SAMPLE.kitchen.round });
    expect(k[4]!.titleVars).toEqual({ id: GUIDE_SAMPLE.kitchen.stopped });
    // m6's arithmetic, computed — never transcribed: the note minus the asked total.
    expect(GUIDE_SAMPLE.counter.noteCents - GUIDE_SAMPLE.counter.askTotalCents).toBe(5000 - 4641);
  });

  it("each picture belongs to its own station, once", () => {
    for (const screen of HELP_SCREENS) {
      const pics = STAFF_GUIDE_STEPS[screen].map((s) => s.picture);
      expect(new Set(pics).size).toBe(pics.length);
      for (const p of pics) expect(p.startsWith(`${screen}.`), p).toBe(true);
    }
  });
});

describe("the seen key — once per person, per station, per tablet", () => {
  it("carries the station, the revision and the person under the guides' prefix", () => {
    expect(staffGuideKey("counter", STAFF_A)).toBe(
      `${GUIDE_SEEN_PREFIX}counter:${STAFF_GUIDE_REVISION.counter}:${STAFF_A}`,
    );
  });
  it("two people, two stations — four first mornings", () => {
    const keys = [
      staffGuideKey("counter", STAFF_A),
      staffGuideKey("counter", STAFF_B),
      staffGuideKey("kitchen", STAFF_A),
      staffGuideKey("kitchen", STAFF_B),
    ];
    expect(new Set(keys).size).toBe(4);
  });
  it("never the retired Help-sheet device key", () => {
    expect(staffGuideKey("counter", STAFF_A).startsWith("mms.help.seen:")).toBe(false);
  });
});

describe("the arm — after mount and after EVERY step change (Codex round 3 E1)", () => {
  it("is the guide's own constant, at least the kit's same-gesture guard", () => {
    expect(GUIDE_ARM_MS).toBeGreaterThanOrEqual(SAME_GESTURE_MS);
  });
  it("refuses a tap before the step's controls arm, and takes one at the arm", () => {
    expect(guideActAccepted({ now: 1000 + GUIDE_ARM_MS - 1, shownAt: 1000, downAt: null })).toBe(
      false,
    );
    expect(guideActAccepted({ now: 1000 + GUIDE_ARM_MS, shownAt: 1000, downAt: null })).toBe(true);
  });
  it("refuses a press that BEGAN before the arm, even when it is released after", () => {
    // Step 4's Next, double-tapped: the second press went down 300ms after step 5 showed and lifted
    // at 500ms — it is the first gesture's tail, never step 5's Got it.
    expect(guideActAccepted({ now: 1500, shownAt: 1000, downAt: 1300 })).toBe(false);
    expect(guideActAccepted({ now: 1500, shownAt: 1000, downAt: 1000 + GUIDE_ARM_MS })).toBe(true);
  });
});

describe("when a guide offers itself — quiet at mount; work always wins", () => {
  it("the counter: only beside the floor, with the pane idle and nobody asking to pay", () => {
    const quiet = { wide: true, paneIdle: true, asking: false };
    expect(counterGuideQuiet(quiet)).toBe(true);
    expect(counterGuideQuiet({ ...quiet, wide: false })).toBe(false);
    expect(counterGuideQuiet({ ...quiet, paneIdle: false })).toBe(false);
    expect(counterGuideQuiet({ ...quiet, asking: true })).toBe(false);
  });
  it("a table asking to pay is the floor's ONE ask tone — the strip's one filled tile, never another status", () => {
    expect(counterAskingAtMount([{ status: "ordering" }, { status: "counter" }])).toBe(true);
    expect(
      counterAskingAtMount([
        { status: "ordering" },
        { status: "seated" },
        { status: "paying" },
        { status: "paid" },
      ]),
    ).toBe(false);
    expect(counterAskingAtMount([])).toBe(false);
  });
  it("the kitchen: an empty board that is updating, with no error — and a landing ticket ends it", () => {
    const quiet = { tickets: 0, degraded: false, failed: false };
    expect(kitchenGuideQuiet(quiet)).toBe(true);
    expect(kitchenGuideQuiet({ ...quiet, tickets: 1 })).toBe(false);
    expect(kitchenGuideQuiet({ ...quiet, degraded: true })).toBe(false);
    expect(kitchenGuideQuiet({ ...quiet, failed: true })).toBe(false);
  });
  it("the Help row promises an auto-open only where the screen makes one", () => {
    expect(staffGuideOpensItself("counter", true)).toBe(true);
    expect(staffGuideOpensItself("counter", false)).toBe(false);
    expect(staffGuideOpensItself("kitchen", false)).toBe(true);
  });
});

/**
 * Decision 20 — a guide never teaches a control its screen does not have. The kitchen's fifth step
 * is the stop card; the board does not draw it yet (OPEN-ITEMS M270 (1)). So the kitchen guide may
 * ship only once `KdsBoard.tsx` RENDERS a `<KdsStopCard>` — parsed off its JSX, so a comment, an
 * import or a string naming it does not count (LEARNINGS #60).
 */
describe("the ships gate — each station's guide after every control it teaches", () => {
  const rendersStopCard = () => {
    const file = join(__dirname, "../components/staff/KdsBoard.tsx");
    const sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    let found = false;
    const visit = (n: ts.Node) => {
      if (
        (ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) &&
        n.tagName.getText() === "KdsStopCard"
      )
        found = true;
      ts.forEachChild(n, (c) => {
        visit(c);
      });
    };
    visit(sf);
    return found;
  };
  it("the kitchen guide ships only once the board draws the stop card it teaches", () => {
    if (STAFF_GUIDE_SHIPS.kitchen) expect(rendersStopCard()).toBe(true);
    expect(staffGuideShips("kitchen")).toBe(STAFF_GUIDE_SHIPS.kitchen);
  });
  it("the counter guide ships — every control it teaches is on the counter", () => {
    expect(staffGuideShips("counter")).toBe(true);
  });
});
