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
  GUIDE_FLOOR_TILES,
  GUIDE_SAMPLE,
  STAFF_GUIDE_REVISION,
  STAFF_GUIDE_SHIPS,
  STAFF_GUIDE_STEPS,
  counterAskingAtMount,
  counterGuideQuiet,
  guideActAccepted,
  guideFloor,
  guideReplacedHeld,
  kitchenGuideQuiet,
  staffGuideKey,
  staffGuideKeyFor,
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
  it("the hosts' key: no person or an id that is not a key segment is NO guide — never a throw", () => {
    expect(staffGuideKeyFor("counter", STAFF_A)).toBe(staffGuideKey("counter", STAFF_A));
    expect(staffGuideKeyFor("counter", null)).toBeNull();
    expect(staffGuideKeyFor("kitchen", undefined)).toBeNull();
    // `staff.user_id` is a uuid primary key; a malformed one must not take the screen down.
    expect(() => staffGuideKeyFor("counter", "not a uuid:")).not.toThrow();
    expect(staffGuideKeyFor("counter", "not a uuid:")).toBeNull();
    expect(staffGuideKeyFor("counter", "")).toBeNull();
  });
});

describe("the ONE floor the counter pictures crop (the blind pass on #345: they had drifted)", () => {
  const S = GUIDE_SAMPLE.counter;
  it("the calm floor: Table 3 and Table 4 ordering, Table 5 seated, the rest free — no ask", () => {
    const calm = guideFloor("calm");
    expect([...calm.keys()]).toEqual([...GUIDE_FLOOR_TILES]);
    expect(calm.get(S.ordering)).toBe("ordering");
    // m12's step 3 "face A, live": the asking table was ordering before it filled.
    expect(calm.get(S.asking)).toBe("ordering");
    expect(calm.get(S.seated)).toBe("seated");
    expect([...calm.values()].filter((v) => v === null)).toHaveLength(GUIDE_FLOOR_TILES.length - 3);
    expect([...calm.values()]).not.toContain("counter");
  });
  it("the ask floor is the same room: ONLY the asking table changed, and it filled", () => {
    const calm = guideFloor("calm");
    const ask = guideFloor("ask");
    const changed = GUIDE_FLOOR_TILES.filter((n) => calm.get(n) !== ask.get(n));
    expect(changed).toEqual([S.asking]);
    expect(ask.get(S.asking)).toBe("counter");
    expect(
      counterAskingAtMount(
        [...ask.values()].filter((v) => v !== null).map((status) => ({ status })),
      ),
    ).toBe(true);
  });
});

describe("the arm — after mount and after EVERY step change (Codex round 3 E1)", () => {
  it("is the guide's own constant, at least the kit's same-gesture guard", () => {
    expect(GUIDE_ARM_MS).toBeGreaterThanOrEqual(SAME_GESTURE_MS);
  });
  it("refuses a tap before the guide's first commit stamped the clock — arming, never 'long armed' (the blind pass on #345)", () => {
    expect(guideActAccepted({ now: 1_000_000, shownAt: null, downAt: null })).toBe(false);
    expect(guideActAccepted({ now: 1_000_000, shownAt: null, downAt: 999_000 })).toBe(false);
  });
  it("refuses a tap before the step's controls arm, and takes one at the arm", () => {
    expect(guideActAccepted({ now: 1000 + GUIDE_ARM_MS - 1, shownAt: 1000, downAt: null })).toBe(
      false,
    );
    expect(guideActAccepted({ now: 1000 + GUIDE_ARM_MS, shownAt: 1000, downAt: null })).toBe(true);
  });
  it("takes a guide's OWN arm when it names one (PD11's phone guide: the kit's 350 ms)", () => {
    // MUTATION (pd11/arm/own-arm-ignored): `armMs` ignored — the phone guide holds the console's
    // 400 ms, and a press at 350 is refused; red.
    const armMs = SAME_GESTURE_MS;
    expect(guideActAccepted({ now: 1000 + armMs - 1, shownAt: 1000, downAt: null, armMs })).toBe(
      false,
    );
    expect(guideActAccepted({ now: 1000 + armMs, shownAt: 1000, downAt: null, armMs })).toBe(true);
    expect(
      guideActAccepted({ now: 1000 + armMs, shownAt: 1000, downAt: 1000 + armMs - 1, armMs }),
    ).toBe(false);
    // Without one, the console's own.
    expect(guideActAccepted({ now: 1000 + armMs, shownAt: 1000, downAt: null })).toBe(
      armMs >= GUIDE_ARM_MS,
    );
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
  it("#347 (C1) — the stop step says what one Got it does on a kitchen with several screens", () => {
    const step = STAFF_GUIDE_STEPS.kitchen[4]!;
    expect(step.lines.map((l) => l.k)).toEqual(["help.guide.kitchen.stop"]);
    const en = STAFF["help.guide.kitchen.stop"].en;
    // MUTATION m270/i18n/guide-promises-you: "it stays until you do" — false the moment another
    // station's tablet taps Got it (one acknowledgement per clear, M271).
    expect(en).not.toContain("until you do");
    expect(en).toContain("one Got it clears it on every screen");
  });

  it("M270 (1) — work that replaced the guide holds the board's controls for the guide's own arm, from that moment", () => {
    // The flip's condition (b): a tap aimed at Next meets the All done or the Got it that took the
    // guide's place. MUTATION m270/staff-guide/replaced-never-held: it acts — and Got it has no undo.
    expect(guideReplacedHeld(1_000, 1_000)).toBe(true);
    expect(guideReplacedHeld(1_000, 1_000 + GUIDE_ARM_MS - 1)).toBe(true);
    // MUTATION m270/staff-guide/replaced-held-forever: the board's controls never act again.
    expect(guideReplacedHeld(1_000, 1_000 + GUIDE_ARM_MS)).toBe(false);
    // The guide never stood here, or the person closed it: nothing is held.
    expect(guideReplacedHeld(null, 1_000)).toBe(false);
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
 * ship only once `KdsBoard.tsx` RENDERS a `<KdsStopCard>` — parsed off its JSX (a comment or a string
 * is no node, LEARNINGS #60), and LIVE: an element parked in one of the enumerated literal-dead shapes
 * (`false && …`, `0 && …`, `null && …`, a ternary or an `if` on a literal) does not count (the blind
 * pass on #345 found `{false && <KdsStopCard …/>}` satisfying the first cut). Liveness against parked
 * copies, not a reachability proof.
 */
function literalTruth(e: ts.Expression): boolean | undefined {
  if (ts.isParenthesizedExpression(e)) return literalTruth(e.expression);
  if (e.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (e.kind === ts.SyntaxKind.FalseKeyword || e.kind === ts.SyntaxKind.NullKeyword) return false;
  if (ts.isIdentifier(e) && e.text === "undefined") return false;
  if (ts.isNumericLiteral(e)) return Number(e.text) !== 0;
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text !== "";
  if (ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.ExclamationToken) {
    const t = literalTruth(e.operand);
    return t === undefined ? undefined : !t;
  }
  return undefined;
}
function isLiteralDead(n: ts.Node): boolean {
  for (let child: ts.Node = n, p = n.parent; p; child = p, p = p.parent) {
    if (ts.isBinaryExpression(p) && child === p.right) {
      const left = literalTruth(p.left);
      if (p.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && left === false)
        return true;
      if (p.operatorToken.kind === ts.SyntaxKind.BarBarToken && left === true) return true;
    }
    if (ts.isConditionalExpression(p)) {
      const c = literalTruth(p.condition);
      if (c === true && child === p.whenFalse) return true;
      if (c === false && child === p.whenTrue) return true;
    }
    if (ts.isIfStatement(p)) {
      const c = literalTruth(p.expression);
      if (c === false && child === p.thenStatement) return true;
      if (c === true && child === p.elseStatement) return true;
    }
  }
  return false;
}
/** Does `src` RENDER a `<tag>` element outside every literal-dead shape? */
function rendersLive(src: string, tag: string): boolean {
  const sf = ts.createSourceFile("x.tsx", src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found = false;
  const visit = (n: ts.Node) => {
    if (
      (ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) &&
      n.tagName.getText() === tag &&
      !isLiteralDead(ts.isJsxOpeningElement(n) ? n.parent : n)
    )
      found = true;
    ts.forEachChild(n, (c) => {
      visit(c);
    });
  };
  visit(sf);
  return found;
}

describe("the ships gate — each station's guide after every control it teaches", () => {
  const board = () => readFileSync(join(__dirname, "../components/staff/KdsBoard.tsx"), "utf8");
  const wrap = (body: string) => `export function Board({ x }: { x: boolean }) {\n${body}\n}`;
  it("the kitchen guide ships only once the board draws the stop card it teaches", () => {
    // M270 (1) — it ships: `KdsBoard` draws a LIVE `<KdsStopCard>` for every open stop record. The
    // refusal stays armed: a board that parks the card in a dead branch reddens this
    // (`pd12/staff-guide/kitchen-ships-without-its-card`).
    expect(STAFF_GUIDE_SHIPS.kitchen).toBe(true);
    if (STAFF_GUIDE_SHIPS.kitchen) expect(rendersLive(board(), "KdsStopCard")).toBe(true);
    expect(staffGuideShips("kitchen")).toBe(STAFF_GUIDE_SHIPS.kitchen);
  });
  it("the matcher counts a LIVE render, conditional or not", () => {
    expect(rendersLive(wrap("return <ul><KdsStopCard table={3} /></ul>;"), "KdsStopCard")).toBe(
      true,
    );
    expect(
      rendersLive(wrap("return <ul>{x && <KdsStopCard table={3} />}</ul>;"), "KdsStopCard"),
    ).toBe(true);
    expect(
      rendersLive(wrap("return x ? <KdsStopCard table={3}></KdsStopCard> : null;"), "KdsStopCard"),
    ).toBe(true);
  });
  // Red-first, each row an evasion that once satisfied a matcher like this one (LEARNINGS #60): a
  // parked copy in a never-taken branch, a mention in a comment or a string.
  it.each([
    ["`false &&`", "return <ul>{false && <KdsStopCard table={3} />}</ul>;"],
    ["`0 &&`", "return <ul>{0 && <KdsStopCard table={3} />}</ul>;"],
    ["`null &&`", "return <ul>{null && <KdsStopCard table={3} />}</ul>;"],
    ["`undefined &&`", "return <ul>{undefined && <KdsStopCard table={3} />}</ul>;"],
    ['`"" &&`', 'return <ul>{"" && <KdsStopCard table={3} />}</ul>;'],
    ["`!true &&`", "return <ul>{!true && <KdsStopCard table={3} />}</ul>;"],
    ["`(false) &&`", "return <ul>{(false) && <KdsStopCard table={3} />}</ul>;"],
    ["`true ||`", "return <ul>{true || <KdsStopCard table={3} />}</ul>;"],
    ["a ternary on `false`", "return <ul>{false ? <KdsStopCard table={3} /> : null}</ul>;"],
    ["a ternary on `true` (else)", "return <ul>{true ? null : <KdsStopCard table={3} />}</ul>;"],
    ["an `if (false)` return", "if (false) return <KdsStopCard table={3} />;\nreturn null;"],
    [
      "an `if (true)` else",
      "if (true) { return null; } else { return <KdsStopCard table={3} />; }",
    ],
    ["a JSX comment", "return <ul>{/* <KdsStopCard table={3} /> */}</ul>;"],
    ["a line comment", "// <KdsStopCard table={3} />\nreturn null;"],
    ["a string", 'return <p>{"<KdsStopCard table={3} />"}</p>;'],
  ])("a dead or mentioned stop card does not count — %s", (_, body) => {
    expect(rendersLive(wrap(body), "KdsStopCard")).toBe(false);
  });
  it("the counter guide ships — every control it teaches is on the counter", () => {
    expect(staffGuideShips("counter")).toBe(true);
  });
});

/**
 * The counter page's wiring (the blind pass on #345): the pane's guide is seeded with the SERVER'S
 * floor read — whether a table was asking as the page was read — and the signed-in person; the Help
 * door gets the same person. Parsed off `app/staff/page.tsx`'s JSX: a constant `false` (or any other
 * value) where the floor's ask belongs would offer the guide over a table waiting to pay.
 */
describe("the counter page seeds the guide from the floor it read", () => {
  const src = readFileSync(join(__dirname, "../app/staff/page.tsx"), "utf8");
  const sf = ts.createSourceFile("page.tsx", src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const attrsOf = (tag: string) => {
    const out: ts.JsxAttributes[] = [];
    const visit = (n: ts.Node) => {
      if (
        (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) &&
        n.tagName.getText() === tag
      )
        out.push(n.attributes);
      ts.forEachChild(n, (c) => {
        visit(c);
      });
    };
    visit(sf);
    return out;
  };
  const attr = (a: ts.JsxAttributes, name: string) => {
    const at = a.properties.filter(ts.isJsxAttribute).find((p) => p.name.getText() === name);
    return at?.initializer && ts.isJsxExpression(at.initializer)
      ? at.initializer.expression
      : undefined;
  };
  it("CounterSplit's guide = { staffId: caller.staffId, askingAtMount: counterAskingAtMount(floor.snapshot.tables) }", () => {
    const splits = attrsOf("CounterSplit");
    expect(splits).toHaveLength(1);
    const guide = attr(splits[0]!, "guide");
    expect(guide && ts.isObjectLiteralExpression(guide)).toBe(true);
    const props = new Map(
      (guide as ts.ObjectLiteralExpression).properties
        .filter(ts.isPropertyAssignment)
        .map((p) => [p.name.getText(), p.initializer.getText()]),
    );
    expect(props.get("staffId")).toBe("caller.staffId");
    expect(props.get("askingAtMount")).toBe("counterAskingAtMount(floor.snapshot.tables)");
  });
  it("the counter's Help door is handed the same person", () => {
    const helps = attrsOf("HelpButton");
    expect(helps).toHaveLength(1);
    expect(attr(helps[0]!, "staffId")?.getText()).toBe("caller.staffId");
  });
});
