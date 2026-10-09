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
 * An ALLOWLIST, discovered against disk: every `.ts`/`.tsx` source (tests excluded) under the app's
 * `components/`, `app/` and `lib/` AND under `packages/ui/src` (its own wrappers render the
 * primitive too) is parsed ONCE (a cache shared by every sweep), every live `<Sheet>` is found, and
 * the ones passing `initialFocus` must be EXACTLY the list below — a new caller fails here until
 * someone adds it on purpose, and the listed caller must still pass it (the list cannot rot).
 *
 * WHAT IS A `<Sheet>`: a JSX tag bound to the primitive — `@mms/ui`'s `Sheet` (named, aliased, or
 * read off a namespace), a deep `@mms/ui/…` path or a relative path that RESOLVES to the primitive
 * or the package barrel. Everything that could render it where this guard cannot read the props is
 * AMBIGUITY, refused outright (blind pass 2 on #329), never resolved by assuming it is clean:
 *   · a spread on a live `<Sheet>`;
 *   · the binding used as anything but a JSX tag (or a type query) — `const Drawer = Sheet`,
 *     `createElement(Sheet, { initialFocus })`, `as={Sheet}`, a default export;
 *   · a re-export of it anywhere but the package barrel (`export { Sheet } from "@mms/ui"` makes a
 *     second module the import resolution above would not know).
 *
 * ⚠️ PARSED, NEVER SCANNED (LEARNINGS #60): comments are not AST nodes, a `<Sheet initialFocus>`
 * parked in a literal-dead shape (`{false && …}`) is excluded, and the matcher is falsified
 * red-first below on fixtures — a fake money caller, a dead parked copy, an aliased import, a deep
 * import, `createElement`, a local alias, a re-export.
 */

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
/** Every root a `<Sheet>` could be rendered from. */
const ROOTS = ["apps/qr/components", "apps/qr/app", "apps/qr/lib", "packages/ui/src"];
/** The primitive and the one barrel allowed to re-export it. */
const SHEET_MODULE = "packages/ui/src/sheet.tsx";
const BARREL = "packages/ui/src/index.ts";

const parse = (rel: string, text: string) =>
  ts.createSourceFile(
    rel,
    text,
    ts.ScriptTarget.Latest,
    true,
    rel.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.TSX,
  );
/** ONE parse per file for the whole suite (blind pass 2 on #329: each sweep re-parsed every file). */
const parsed = new Map<string, ts.SourceFile>();
const source = (rel: string): ts.SourceFile => {
  let sf = parsed.get(rel);
  if (!sf) {
    sf = parse(rel, readFileSync(path.join(REPO, rel), "utf8"));
    parsed.set(rel, sf);
  }
  return sf;
};

/** Every source on disk under the roots — `.ts` and `.tsx` (a `createElement` needs no JSX), tests
 *  excluded. */
let files: string[] | null = null;
function sourceFiles(): string[] {
  if (files) return files;
  files = [];
  for (const root of ROOTS)
    for (const f of readdirSync(path.join(REPO, root), { recursive: true }).map(String))
      if (/\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.endsWith(".d.ts"))
        files.push(`${root}/${f.split(path.sep).join("/")}`);
  return files;
}

/** One sweep can parse ~600 files (measured 1.4 s at load 8.5, 2026-10-09); the cache makes every
 *  later sweep a walk. A loaded machine gets headroom, not a minute. */
const SWEEP_MS = 15_000;

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

/** Does the module specifier `spec`, imported from `rel`, resolve to the primitive or the barrel? */
function isSheetSource(rel: string, spec: string): boolean {
  if (spec === "@mms/ui") return true;
  let target: string | null = null;
  if (spec.startsWith("@mms/ui/")) target = `packages/ui/${spec.slice("@mms/ui/".length)}`;
  else if (spec.startsWith("@/")) target = `apps/qr/${spec.slice(2)}`;
  else if (spec.startsWith(".")) target = path.posix.join(path.posix.dirname(rel), spec);
  if (target === null) return false;
  const t = path.posix.normalize(target);
  const candidates = [t, `${t}.ts`, `${t}.tsx`, `${t}/index.ts`, `${t}/index.tsx`];
  // `@mms/ui/sheet` (an exports-map shorthand) and `@mms/ui/src/sheet` both land on the primitive.
  if (spec.startsWith("@mms/ui/")) {
    const sub = `packages/ui/src/${spec.slice("@mms/ui/".length)}`;
    candidates.push(sub, `${sub}.ts`, `${sub}.tsx`, `${sub}/index.ts`);
  }
  return candidates.some((c) => c === SHEET_MODULE || c === BARREL);
}

/** The LOCAL names that bind the primitive in a file — an alias is resolved, never trusted by
 *  spelling (`import { Sheet as Drawer }` is still the Sheet) — and the namespace bindings it can be
 *  read through (`import * as UI` → `<UI.Sheet>`). */
function sheetBindings(sf: ts.SourceFile): { named: Set<string>; namespaces: Set<string> } {
  const named = new Set<string>();
  const namespaces = new Set<string>();
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    if (!isSheetSource(sf.fileName, st.moduleSpecifier.text)) continue;
    const b = st.importClause?.namedBindings;
    if (b && ts.isNamedImports(b))
      for (const el of b.elements)
        if ((el.propertyName ?? el.name).text === "Sheet") named.add(el.name.text);
    if (b && ts.isNamespaceImport(b)) namespaces.add(b.name.text);
    // `import Sheet from "./sheet"` — the primitive has no default export; a default import of the
    // module is a binding this guard cannot vouch for.
    if (st.importClause?.name) named.add(st.importClause.name.text);
  }
  return { named, namespaces };
}

/** Is this tag expression the primitive? */
function isSheetTag(tag: ts.JsxTagNameExpression, b: ReturnType<typeof sheetBindings>): boolean {
  return (
    (ts.isIdentifier(tag) && b.named.has(tag.text)) ||
    (ts.isPropertyAccessExpression(tag) &&
      ts.isIdentifier(tag.expression) &&
      b.namespaces.has(tag.expression.text) &&
      tag.name.text === "Sheet")
  );
}

/** Every live `<Sheet>` in a source (named, aliased or namespace-read). */
function liveSheets(sf: ts.SourceFile): Jsx[] {
  const b = sheetBindings(sf);
  const out: Jsx[] = [];
  walk(sf, (n) => {
    if (!(ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n))) return;
    if (!isSheetTag(n.tagName, b) || isLiteralDead(n)) return;
    out.push(n);
  });
  return out;
}

/** A `<Sheet {...props}>` could carry `initialFocus` where this guard cannot read it: AMBIGUITY,
 *  refused outright (blind pass on #329) — never resolved by assuming the spread is clean. */
function spreadSheets(sf: ts.SourceFile): Jsx[] {
  return liveSheets(sf).filter((n) =>
    n.attributes.properties.some((p) => ts.isJsxSpreadAttribute(p)),
  );
}

/** Every use of the primitive that is not a JSX tag (or a type query, which renders nothing): an
 *  alias, a `createElement`, a prop, an export — each renders the Sheet with props this guard cannot
 *  read. Plus every RE-EXPORT of it outside the barrel. Ambiguity, refused (blind pass 2 on #329). */
function unreadableUses(sf: ts.SourceFile): string[] {
  const b = sheetBindings(sf);
  const out: string[] = [];
  const isTag = (n: ts.Node) => {
    const p = n.parent;
    return (
      (ts.isJsxOpeningElement(p) || ts.isJsxSelfClosingElement(p) || ts.isJsxClosingElement(p)) &&
      p.tagName === n
    );
  };
  walk(sf, (n) => {
    if (!n.parent) return; // the source file itself
    if (ts.isImportSpecifier(n.parent) || ts.isNamespaceImport(n.parent)) return;
    if (ts.isImportClause(n.parent) && n.parent.name === n) return;
    const named = ts.isIdentifier(n) && b.named.has(n.text);
    const viaNs =
      ts.isPropertyAccessExpression(n) &&
      ts.isIdentifier(n.expression) &&
      b.namespaces.has(n.expression.text) &&
      n.name.text === "Sheet";
    if (!named && !viaNs) return;
    if (named && ts.isPropertyAccessExpression(n.parent) && n.parent.name === n) return; // x.Sheet
    if (isTag(n)) return;
    if (ts.isTypeQueryNode(n.parent) || ts.isQualifiedName(n.parent)) return;
    out.push(`${sf.fileName}: \`${n.parent.getText(sf).slice(0, 60)}\``);
  });
  if (sf.fileName !== BARREL)
    for (const st of sf.statements) {
      if (!ts.isExportDeclaration(st)) continue;
      const from =
        st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier)
          ? isSheetSource(sf.fileName, st.moduleSpecifier.text)
          : false;
      const clause = st.exportClause;
      const reexportsSheet =
        clause && ts.isNamedExports(clause)
          ? clause.elements.some((el) => {
              const local = (el.propertyName ?? el.name).text;
              return from ? local === "Sheet" : b.named.has(local);
            })
          : from; // `export * from "@mms/ui"` / `export * as UI from "@mms/ui"`
      if (reexportsSheet) out.push(`${sf.fileName}: re-exports the Sheet — \`${st.getText(sf)}\``);
    }
  return out;
}

/** The live `<Sheet>` elements in a source that pass `initialFocus`. */
function initialFocusSheets(sf: ts.SourceFile): Jsx[] {
  return liveSheets(sf).filter((n) =>
    n.attributes.properties.some(
      (p) => ts.isJsxAttribute(p) && p.name.getText(sf) === "initialFocus",
    ),
  );
}

/** The ONE caller allowed to opt in, and why. */
const ALLOWED = ["apps/qr/components/grocery/GroceryNameSheet.tsx"];

/** The money sheets this guard exists for — the sheets that hold an irreversible write (the M82
 *  GUARDED set: cash, a refund, a void/comp, a no-show's loss, a line sent to the kitchen, a table
 *  bound at Send). Each is asserted to RENDER a live `<Sheet>` (blind pass on #329: a file with no
 *  Sheet in it — `Checkout.tsx` — made the "passes nothing" case vacuous), so the list can neither
 *  outlive the files it names nor name a file the guard has nothing to say about. */
const MONEY_SHEETS = [
  "apps/qr/components/staff/CashSettleButton.tsx",
  "apps/qr/components/staff/RefundActionSheet.tsx",
  "apps/qr/components/staff/LossActionSheet.tsx",
  "apps/qr/components/staff/CounterNoShowButton.tsx",
  "apps/qr/components/LineOptionsSheet.tsx",
  "apps/qr/components/TableBindSheet.tsx",
];

describe("PD4 — Sheet `initialFocus` is passed ONLY from the grocery Name sheet", () => {
  it(
    "the callers passing initialFocus on disk are exactly the allowlist",
    { timeout: SWEEP_MS },
    () => {
      const callers = sourceFiles().filter((f) => initialFocusSheets(source(f)).length > 0);
      expect(callers.sort()).toEqual([...ALLOWED].sort());
    },
  );

  it(
    "no live <Sheet> on disk takes a spread — the one shape that could smuggle the prop",
    { timeout: SWEEP_MS },
    () => {
      expect(sourceFiles().filter((f) => spreadSheets(source(f)).length > 0)).toEqual([]);
    },
  );

  it(
    "nothing on disk renders the Sheet where its props cannot be read — no alias, createElement, prop, or re-export outside the barrel",
    { timeout: SWEEP_MS },
    () => {
      expect(sourceFiles().flatMap((f) => unreadableUses(source(f)))).toEqual([]);
    },
  );

  it("the sweep reaches every root, and the barrel's re-export is the one it allows", () => {
    // Not vacuous: each root contributes sources, the primitive itself is among them, and the
    // barrel is read (its re-export is what `@mms/ui` resolves through).
    for (const root of ROOTS)
      expect(
        sourceFiles().some((f) => f.startsWith(`${root}/`)),
        root,
      ).toBe(true);
    expect(sourceFiles()).toContain(SHEET_MODULE);
    expect(sourceFiles()).toContain(BARREL);
  });

  it("the allowed caller passes it LIVE, with a ref (the field), so the list cannot rot", () => {
    const sheets = initialFocusSheets(source(ALLOWED[0]!));
    expect(sheets).toHaveLength(1);
    const sf = sheets[0]!.getSourceFile();
    const attr = sheets[0]!.attributes.properties.find(
      (p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText(sf) === "initialFocus",
    );
    expect(attr?.initializer?.getText(sf)).toBe("{fieldRef}");
  });

  it("the money sheets exist, each RENDERS a live <Sheet>, and none passes initialFocus", () => {
    for (const rel of MONEY_SHEETS) {
      const sf = source(rel); // throws if the file moved — the list names real files
      expect(liveSheets(sf).length, `${rel} renders a <Sheet>`).toBeGreaterThan(0);
      expect(initialFocusSheets(sf)).toHaveLength(0);
    }
  });
});

// ── the MATCHER, falsified red-first on fixtures (what text satisfies it without the behaviour?) ──

const FAKE = "apps/qr/components/staff/Fake.tsx";
const fake = (text: string, rel = FAKE) => parse(rel, text);
const money = (attrs: string) => `
import { Sheet } from "@mms/ui";
export function CashSheet() {
  return <Sheet open onOpenChange={() => {}} title="Take cash" ${attrs}>x</Sheet>;
}`;

describe("the matcher itself", () => {
  it("a fake money caller passing initialFocus IS found", () => {
    expect(initialFocusSheets(fake(money("initialFocus={ref}")))).toHaveLength(1);
  });

  it("a caller passing nothing is clean", () => {
    expect(initialFocusSheets(fake(money("")))).toHaveLength(0);
  });

  it("an ALIASED Sheet import is still the Sheet", () => {
    const src = `
import { Sheet as Drawer } from "@mms/ui";
export function CashSheet() {
  return <Drawer open onOpenChange={() => {}} title="Take cash" initialFocus=".x">x</Drawer>;
}`;
    expect(initialFocusSheets(fake(src))).toHaveLength(1);
  });

  it("a NAMESPACE import is still the Sheet (`<UI.Sheet initialFocus>` is found)", () => {
    const src = `
import * as UI from "@mms/ui";
export function CashSheet() {
  return <UI.Sheet open onOpenChange={() => {}} title="Take cash" initialFocus={r}>x</UI.Sheet>;
}`;
    expect(initialFocusSheets(fake(src))).toHaveLength(1);
  });

  it("a DEEP import that resolves to the primitive is still the Sheet", () => {
    for (const spec of ["@mms/ui/src/sheet", "@mms/ui/sheet", "@mms/ui/src"]) {
      const src = `
import { Sheet } from "${spec}";
export function CashSheet() { return <Sheet initialFocus={r}>x</Sheet>; }`;
      expect(initialFocusSheets(fake(src)), spec).toHaveLength(1);
    }
  });

  it("a RELATIVE import inside @mms/ui (a wrapper beside the primitive) is still the Sheet", () => {
    const src = `
import { Sheet } from "./sheet";
export function ConfirmSheet({ initialFocus }: { initialFocus?: string }) {
  return <Sheet open onOpenChange={() => {}} title="t" initialFocus={initialFocus}>x</Sheet>;
}`;
    expect(initialFocusSheets(fake(src, "packages/ui/src/confirm-sheet.tsx"))).toHaveLength(1);
  });

  it("a spread on a Sheet is AMBIGUITY, refused — it could carry the prop unseen", () => {
    const src = `
import { Sheet } from "@mms/ui";
export function CashSheet(props: object) {
  return <Sheet open onOpenChange={() => {}} title="Take cash" {...props}>x</Sheet>;
}`;
    expect(spreadSheets(fake(src))).toHaveLength(1);
    expect(spreadSheets(fake(money("")))).toHaveLength(0);
  });

  it("`createElement(Sheet, { initialFocus })` is AMBIGUITY, refused (named and namespace)", () => {
    const named = `
import { createElement } from "react";
import { Sheet } from "@mms/ui";
export const CashSheet = () => createElement(Sheet, { open: true, initialFocus: ".x" }, "x");`;
    expect(unreadableUses(fake(named, "apps/qr/lib/cash.ts"))).toHaveLength(1);
    const ns = `
import * as React from "react";
import * as UI from "@mms/ui";
export const CashSheet = () => React.createElement(UI.Sheet, { initialFocus: ".x" });`;
    expect(unreadableUses(fake(ns, "apps/qr/lib/cash.ts"))).toHaveLength(1);
  });

  it("a LOCAL alias (`const Drawer = Sheet`) is AMBIGUITY, refused", () => {
    const src = `
import { Sheet } from "@mms/ui";
const Drawer = Sheet;
export function CashSheet() { return <Drawer initialFocus={r}>x</Drawer>; }`;
    expect(unreadableUses(fake(src))).toHaveLength(1);
  });

  it("a RE-EXPORT outside the barrel is AMBIGUITY, refused — and the barrel's own is allowed", () => {
    expect(
      unreadableUses(fake(`export { Sheet as Drawer } from "@mms/ui";`, "apps/qr/lib/ui.ts")),
    ).toHaveLength(1);
    expect(unreadableUses(fake(`export * from "@mms/ui";`, "apps/qr/lib/ui.ts"))).toHaveLength(1);
    expect(
      unreadableUses(
        fake(`import { Sheet } from "@mms/ui";\nexport { Sheet };`, "apps/qr/lib/ui.ts"),
      ),
    ).toHaveLength(2); // the export names the binding (a use) and re-exports it
    expect(unreadableUses(fake(`export { Sheet } from "./sheet";`, BARREL))).toHaveLength(0);
  });

  it("a type query renders nothing and is not a use", () => {
    const src = `
import { Sheet } from "@mms/ui";
type P = React.ComponentProps<typeof Sheet>;
export function X(p: P) { return <Sheet open={p.open}>x</Sheet>; }`;
    expect(unreadableUses(fake(src))).toHaveLength(0);
  });

  it("a Sheet from another module is not this Sheet", () => {
    const src = `
import { Sheet } from "./my-own-sheet";
export function X() { return <Sheet initialFocus={r}>x</Sheet>; }`;
    expect(initialFocusSheets(fake(src))).toHaveLength(0);
  });

  it("a parked dead copy does not count as live (and does not hide a live one)", () => {
    const dead = `
import { Sheet } from "@mms/ui";
export function X() {
  return <>{false && <Sheet open onOpenChange={() => {}} title="t" initialFocus={r}>x</Sheet>}</>;
}`;
    expect(initialFocusSheets(fake(dead))).toHaveLength(0);
    const both = `
import { Sheet } from "@mms/ui";
export function X() {
  return <>{false && <Sheet open onOpenChange={() => {}} title="t">x</Sheet>}
  <Sheet open onOpenChange={() => {}} title="t" initialFocus={r}>x</Sheet></>;
}`;
    expect(initialFocusSheets(fake(both))).toHaveLength(1);
  });

  it("a comment naming the prop is not a caller", () => {
    const src = `
import { Sheet } from "@mms/ui";
// never pass initialFocus here: <Sheet initialFocus={r} />
export function X() { return <Sheet open onOpenChange={() => {}} title="t">x</Sheet>; }`;
    expect(initialFocusSheets(fake(src))).toHaveLength(0);
  });
});
