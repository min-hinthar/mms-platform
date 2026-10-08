import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

/**
 * PD4 (round 3, D1(d)) — the CALLER half of the `Sheet` `initialFocus` opt-in.
 *
 * `packages/ui` owns the decision (sheet-focus.ts, pinned by its own suite). What it cannot see is
 * WHO passes the prop. The record is explicit: the grocery Name sheet opts in with one prop from its
 * own file, and the prop "never goes on a money sheet" — a cash sheet, Checkout, any settle door.
 * A money sheet's first stop must be the container J21 chose (the dialog and its title announced,
 * never a control under a finger that was still landing), and a diner's or Dad's focus landing on
 * a field inside a sheet that spends money is the shape this guard refuses.
 *
 * An ALLOWLIST, discovered against disk: every `.tsx` under `components/` AND `app/` is parsed,
 * every live `<Sheet>` is found, and the ones passing `initialFocus` must be EXACTLY the list
 * below — a new caller fails here until someone adds it on purpose, and the listed caller must
 * still pass it (the list cannot rot).
 *
 * ⚠️ PARSED, NEVER SCANNED (LEARNINGS #60): comments are not AST nodes, a `<Sheet initialFocus>`
 * parked in a literal-dead shape (`{false && …}`) is excluded, and the matcher is falsified
 * red-first below on fixtures — a fake money caller, a dead parked copy, an aliased import.
 */

const QR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOTS = ["components", "app"];
const readRaw = (rel: string) => readFileSync(path.join(QR, rel), "utf8");
const parse = (rel: string, text: string) =>
  ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

/** Every component file on disk — recursive, `.tsx` only (a Sheet is JSX), tests excluded. */
function componentFiles(): string[] {
  const out: string[] = [];
  for (const root of ROOTS)
    for (const f of readdirSync(path.join(QR, root), { recursive: true }).map(String))
      if (f.endsWith(".tsx") && !/\.test\.tsx?$/.test(f))
        out.push(`${root}/${f.split(path.sep).join("/")}`);
  return out;
}

type Jsx = ts.JsxOpeningElement | ts.JsxSelfClosingElement;

function walk(root: ts.Node, each: (n: ts.Node) => void): void {
  const visit = (n: ts.Node) => {
    each(n);
    ts.forEachChild(n, (c) => {
      visit(c);
    });
  };
  visit(root);
}

function literalTruth(e: ts.Expression): boolean | undefined {
  if (ts.isParenthesizedExpression(e)) return literalTruth(e.expression);
  if (e.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (e.kind === ts.SyntaxKind.FalseKeyword || e.kind === ts.SyntaxKind.NullKeyword) return false;
  if (ts.isIdentifier(e) && e.text === "undefined") return false;
  return undefined;
}

/** Is `n` parked in one of the enumerated LITERAL-dead shapes? Liveness against parked copies. */
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

/** The LOCAL names that bind `@mms/ui`'s `Sheet` in a file — an alias is resolved, never trusted by
 *  spelling (`import { Sheet as Drawer }` is still the Sheet) — and the namespace bindings it can be
 *  read through (`import * as UI` → `<UI.Sheet>`). */
function sheetBindings(sf: ts.SourceFile): { named: Set<string>; namespaces: Set<string> } {
  const named = new Set<string>();
  const namespaces = new Set<string>();
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    if (st.moduleSpecifier.text !== "@mms/ui") continue;
    const b = st.importClause?.namedBindings;
    if (b && ts.isNamedImports(b))
      for (const el of b.elements)
        if ((el.propertyName ?? el.name).text === "Sheet") named.add(el.name.text);
    if (b && ts.isNamespaceImport(b)) namespaces.add(b.name.text);
  }
  return { named, namespaces };
}

/** Every live `<Sheet>` in a source text (named, aliased or namespace-read). */
function liveSheets(sf: ts.SourceFile): Jsx[] {
  const { named, namespaces } = sheetBindings(sf);
  const out: Jsx[] = [];
  walk(sf, (n) => {
    if (!(ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n))) return;
    const tag = n.tagName;
    const isSheet =
      (ts.isIdentifier(tag) && named.has(tag.text)) ||
      (ts.isPropertyAccessExpression(tag) &&
        ts.isIdentifier(tag.expression) &&
        namespaces.has(tag.expression.text) &&
        tag.name.text === "Sheet");
    if (!isSheet || isLiteralDead(n)) return;
    out.push(n);
  });
  return out;
}

/** A `<Sheet {...props}>` could carry `initialFocus` where this guard cannot read it: AMBIGUITY,
 *  refused outright (blind pass on #329) — never resolved by assuming the spread is clean. */
function spreadSheets(rel: string, text: string): Jsx[] {
  const sf = parse(rel, text);
  return liveSheets(sf).filter((n) =>
    n.attributes.properties.some((p) => ts.isJsxSpreadAttribute(p)),
  );
}

/** The live `<Sheet>` elements in a source text that pass `initialFocus`. */
function initialFocusSheets(rel: string, text: string): Jsx[] {
  const sf = parse(rel, text);
  return liveSheets(sf).filter((n) =>
    n.attributes.properties.some(
      (p) => ts.isJsxAttribute(p) && p.name.getText(sf) === "initialFocus",
    ),
  );
}

/** The ONE caller allowed to opt in, and why. */
const ALLOWED = ["components/grocery/GroceryNameSheet.tsx"];

/** The money sheets this guard exists for — the sheets that hold an irreversible write (the M82
 *  GUARDED set: cash, a refund, a void/comp, a no-show's loss, a line sent to the kitchen, a table
 *  bound at Send). Each is asserted to RENDER a live `<Sheet>` (blind pass on #329: a file with no
 *  Sheet in it — `Checkout.tsx` — made the "passes nothing" case vacuous), so the list can neither
 *  outlive the files it names nor name a file the guard has nothing to say about. */
const MONEY_SHEETS = [
  "components/staff/CashSettleButton.tsx",
  "components/staff/RefundActionSheet.tsx",
  "components/staff/LossActionSheet.tsx",
  "components/staff/CounterNoShowButton.tsx",
  "components/LineOptionsSheet.tsx",
  "components/TableBindSheet.tsx",
];

describe("PD4 — Sheet `initialFocus` is passed ONLY from the grocery Name sheet", () => {
  // The on-disk sweep parses every component: a LOAD-dependent duration, so it carries its own
  // timeout — vitest's 5 s default turned a green parsed guard red under five streams' load.
  it(
    "the callers passing initialFocus on disk are exactly the allowlist",
    { timeout: 60_000 },
    () => {
      const callers = componentFiles().filter((f) => initialFocusSheets(f, readRaw(f)).length > 0);
      expect(callers.sort()).toEqual([...ALLOWED].sort());
    },
  );

  it(
    "no live <Sheet> on disk takes a spread — the one shape that could smuggle the prop",
    { timeout: 60_000 },
    () => {
      const spread = componentFiles().filter((f) => spreadSheets(f, readRaw(f)).length > 0);
      expect(spread).toEqual([]);
    },
  );

  it("the allowed caller passes it LIVE, with a ref (the field), so the list cannot rot", () => {
    const sheets = initialFocusSheets(ALLOWED[0]!, readRaw(ALLOWED[0]!));
    expect(sheets).toHaveLength(1);
    const sf = sheets[0]!.getSourceFile();
    const attr = sheets[0]!.attributes.properties.find(
      (p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText(sf) === "initialFocus",
    );
    expect(attr?.initializer?.getText(sf)).toBe("{fieldRef}");
  });

  it("the money sheets exist, each RENDERS a live <Sheet>, and none passes initialFocus", () => {
    for (const rel of MONEY_SHEETS) {
      const text = readRaw(rel); // throws if the file moved — the list names real files
      expect(liveSheets(parse(rel, text)).length, `${rel} renders a <Sheet>`).toBeGreaterThan(0);
      expect(initialFocusSheets(rel, text)).toHaveLength(0);
    }
  });
});

// ── the MATCHER, falsified red-first on fixtures (what text satisfies it without the behaviour?) ──

const money = (attrs: string) => `
import { Sheet } from "@mms/ui";
export function CashSheet() {
  return <Sheet open onOpenChange={() => {}} title="Take cash" ${attrs}>x</Sheet>;
}`;

describe("the matcher itself", () => {
  it("a fake money caller passing initialFocus IS found", () => {
    expect(initialFocusSheets("staff/Fake.tsx", money("initialFocus={ref}"))).toHaveLength(1);
  });

  it("a caller passing nothing is clean", () => {
    expect(initialFocusSheets("staff/Fake.tsx", money(""))).toHaveLength(0);
  });

  it("an ALIASED Sheet import is still the Sheet", () => {
    const src = `
import { Sheet as Drawer } from "@mms/ui";
export function CashSheet() {
  return <Drawer open onOpenChange={() => {}} title="Take cash" initialFocus=".x">x</Drawer>;
}`;
    expect(initialFocusSheets("staff/Fake.tsx", src)).toHaveLength(1);
  });

  it("a NAMESPACE import is still the Sheet (`<UI.Sheet initialFocus>` is found)", () => {
    const src = `
import * as UI from "@mms/ui";
export function CashSheet() {
  return <UI.Sheet open onOpenChange={() => {}} title="Take cash" initialFocus={r}>x</UI.Sheet>;
}`;
    expect(initialFocusSheets("staff/Fake.tsx", src)).toHaveLength(1);
  });

  it("a spread on a Sheet is AMBIGUITY, refused — it could carry the prop unseen", () => {
    const src = `
import { Sheet } from "@mms/ui";
export function CashSheet(props: object) {
  return <Sheet open onOpenChange={() => {}} title="Take cash" {...props}>x</Sheet>;
}`;
    expect(spreadSheets("staff/Fake.tsx", src)).toHaveLength(1);
    expect(spreadSheets("staff/Fake.tsx", money(""))).toHaveLength(0);
  });

  it("a Sheet from another module is not this Sheet", () => {
    const src = `
import { Sheet } from "./my-own-sheet";
export function X() { return <Sheet initialFocus={r}>x</Sheet>; }`;
    expect(initialFocusSheets("staff/Fake.tsx", src)).toHaveLength(0);
  });

  it("a parked dead copy does not count as live (and does not hide a live one)", () => {
    const dead = `
import { Sheet } from "@mms/ui";
export function X() {
  return <>{false && <Sheet open onOpenChange={() => {}} title="t" initialFocus={r}>x</Sheet>}</>;
}`;
    expect(initialFocusSheets("staff/Fake.tsx", dead)).toHaveLength(0);
    const both = `
import { Sheet } from "@mms/ui";
export function X() {
  return <>{false && <Sheet open onOpenChange={() => {}} title="t">x</Sheet>}
  <Sheet open onOpenChange={() => {}} title="t" initialFocus={r}>x</Sheet></>;
}`;
    expect(initialFocusSheets("staff/Fake.tsx", both)).toHaveLength(1);
  });

  it("a comment naming the prop is not a caller", () => {
    const src = `
import { Sheet } from "@mms/ui";
// never pass initialFocus here: <Sheet initialFocus={r} />
export function X() { return <Sheet open onOpenChange={() => {}} title="t">x</Sheet>; }`;
    expect(initialFocusSheets("staff/Fake.tsx", src)).toHaveLength(0);
  });
});
