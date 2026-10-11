import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { sheetInitialFocusTarget, type FocusContainer } from "../sheet-focus";

/**
 * PD4 (D1(d)) — the Sheet's OPT-IN `initialFocus`, pinned by this package's own suite.
 *
 * `verify:slice` cannot mutate anything in `packages/ui` (OPEN-ITEMS M77: its runner's cwd is
 * `apps/qr`), so the rule is not a mutant — it is falsified here by a value, and the wiring (that
 * `sheet.tsx` CONSULTS the helper in its open-autofocus handler, and consults nothing else) is parsed
 * off the source, never grepped. Each MUTATION below was induced and watched go red:
 *   · the helper returns the ref regardless of containment → "a target outside the sheet" red;
 *   · a selector that matches nothing returns the first tabbable → "no match → container" red;
 *   · the querySelector call unguarded → "a MALFORMED selector" red (the SyntaxError escapes);
 *   · `onOpen` focuses the container unconditionally → the wiring test red;
 *   · `onOpen` focuses the target without the helper → the wiring test red.
 */

type Node = { focus(): void; id: string };
const node = (id: string): Node => ({ id, focus() {} });

/** A container holding `inside`; `querySelector` answers only the selectors in `found`. */
function container(inside: Node[], found: Record<string, Node> = {}): FocusContainer {
  return {
    contains: (n) => inside.includes(n as Node),
    querySelector: (sel) => found[sel] ?? null,
  };
}

describe("sheetInitialFocusTarget — the one decision", () => {
  it("no opt-in → the container (J21's default, never the first tabbable)", () => {
    expect(sheetInitialFocusTarget(undefined, container([node("field")]))).toBeNull();
  });

  it("a ref INSIDE the sheet is the first stop", () => {
    const field = node("field");
    expect(sheetInitialFocusTarget({ current: field }, container([field]))).toBe(field);
  });

  it("a ref OUTSIDE the sheet is refused — Radix traps focus inside, and a page node would fight it", () => {
    const page = node("page");
    expect(sheetInitialFocusTarget({ current: page }, container([node("field")]))).toBeNull();
  });

  it("an empty ref falls back to the container", () => {
    expect(sheetInitialFocusTarget({ current: null }, container([]))).toBeNull();
  });

  it("a selector resolves inside the sheet", () => {
    const field = node("field");
    expect(
      sheetInitialFocusTarget(
        "input[type=search]",
        container([field], { "input[type=search]": field }),
      ),
    ).toBe(field);
  });

  it("a selector that matches nothing → the container, never the ✕", () => {
    expect(sheetInitialFocusTarget("input[type=search]", container([node("close")]))).toBeNull();
  });

  it("a MALFORMED selector (querySelector throws) → the container, never a throw out of onOpen", () => {
    // Blind pass 2 on #329. MUTATION: no try/catch → the SyntaxError escapes the open-autofocus
    // handler after its preventDefault(), and focus is left on <body>; red.
    const throwing: FocusContainer = {
      contains: () => true,
      querySelector: () => {
        throw new SyntaxError("'[[' is not a valid selector");
      },
    };
    expect(sheetInitialFocusTarget("[[", throwing)).toBeNull();
  });

  it("before the sheet has a container there is nothing to focus", () => {
    expect(sheetInitialFocusTarget({ current: node("field") }, null)).toBeNull();
  });
});

// ── the WIRING, parsed off sheet.tsx (LEARNINGS #60: a comment naming the helper is not a call) ──

const src = readFileSync(fileURLToPath(new URL("../sheet.tsx", import.meta.url)), "utf8");
const sf = ts.createSourceFile("sheet.tsx", src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function walk(n: ts.Node, each: (n: ts.Node) => void) {
  each(n);
  ts.forEachChild(n, (c) => {
    walk(c, each);
  });
}

/** The arrow bound to `const onOpen = …`. */
function onOpenBody(): ts.ArrowFunction {
  let found: ts.ArrowFunction | null = null;
  walk(sf, (n) => {
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.name.text === "onOpen" &&
      n.initializer &&
      ts.isArrowFunction(n.initializer)
    )
      found = n.initializer;
  });
  if (!found) throw new Error("sheet.tsx no longer binds `const onOpen = (e) => …`");
  return found;
}

describe("sheet.tsx — the open-autofocus handler consults the helper, and only the helper", () => {
  it("`onOpen` calls sheetInitialFocusTarget(initialFocus, contentRef.current) and focuses its answer, else the container", () => {
    const body = onOpenBody();
    const calls: string[] = [];
    walk(body, (n) => {
      if (ts.isCallExpression(n)) calls.push(n.expression.getText(sf));
    });
    // The helper is called exactly once, with the prop and the content node — never a hand-rolled
    // `initialFocus.current.focus()` that would skip the containment refusal.
    expect(calls.filter((c) => c === "sheetInitialFocusTarget")).toHaveLength(1);
    let helperArgs: string[] = [];
    walk(body, (n) => {
      if (ts.isCallExpression(n) && n.expression.getText(sf) === "sheetInitialFocusTarget")
        helperArgs = n.arguments.map((a) => a.getText(sf));
    });
    expect(helperArgs).toEqual(["initialFocus", "contentRef.current"]);
    // The branch is LIVE and bound to the helper's answer: `if (target) target.focus(); else
    // <container>.focus()`. A `target.focus()` parked under `if (false)` carries the same call text
    // and ships no behaviour — so the test reads the `if`'s own condition, never the call's presence.
    const branches: { test: string; then: string[]; otherwise: string[] }[] = [];
    walk(body, (n) => {
      if (!ts.isIfStatement(n)) return;
      const callsIn = (s: ts.Node | undefined) => {
        const out: string[] = [];
        if (s)
          walk(s, (m) => {
            if (ts.isCallExpression(m)) out.push(m.expression.getText(sf));
          });
        return out;
      };
      branches.push({
        test: n.expression.getText(sf),
        then: callsIn(n.thenStatement),
        otherwise: callsIn(n.elseStatement),
      });
    });
    const decision = branches.find((b) => b.test === "target");
    expect(decision?.then).toEqual(["target.focus"]);
    expect(decision?.otherwise).toEqual(["contentRef.current?.focus"]);
    // And no OTHER branch in the handler focuses anything (one decision, one place).
    for (const b of branches)
      if (b !== decision)
        expect([...b.then, ...b.otherwise].filter((c) => /focus$/.test(c))).toEqual([]);
    // And `initialFocus` is read by nothing else in the handler (no second path to a focus).
    let reads = 0;
    walk(body, (n) => {
      if (ts.isIdentifier(n) && n.text === "initialFocus") reads += 1;
    });
    expect(reads).toBe(1);
  });

  it("the prop is passed down from <Sheet> through SheetContent (never dropped on the way)", () => {
    // The public prop reaches SheetBody only through the JSX attribute on SheetContent.
    const attrs: string[] = [];
    walk(sf, (n) => {
      if (ts.isJsxAttribute(n) && n.name.getText(sf) === "initialFocus")
        attrs.push(n.initializer?.getText(sf) ?? "");
    });
    expect(attrs).toEqual(["{initialFocus}"]);
  });
});
