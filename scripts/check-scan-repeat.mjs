#!/usr/bin/env node
/**
 * M186 — the /grocery camera scan must ASK `classifyScan` before it charges, and must STOP on a
 * repeat.
 *
 * ## Why a guard, and why here
 *
 * The charge rule itself is a pure module (`apps/qr/lib/scan-gate.ts`), falsifiable by a value and
 * covered by nine mutants. Its WIRING is not: `apps/qr/app/grocery/page.tsx` is a component, so it
 * sits outside `check-money-coverage`'s `MONEY_PATHS` and has no suite. The blind pre-PR audit that
 * rejected M186's first attempt named exactly that shape as its blocking finding — the one line the
 * author called "the fix" lived where no test, no mutant and no mechanical gate could see it, and
 * moving it two lines rebuilt the bug with everything still green.
 *
 * So this guard owns two propositions:
 *
 *   1. In `page.tsx`, the single `scanAdd` call is preceded — inside the same function — by a
 *      `classifyScan` call whose result gates an early `return`.
 *   2. (Phase 1c) Every live `<ScanStage>` takes `cartReady={scanBasketReady({ …, hydrated })}`.
 *      The camera now mounts BEFORE the basket exists and holds sightings until `cartReady`; the
 *      repeat stop in (1) judges a sighting against the basket's LINES, so a hold that lifts on the
 *      cart id alone judges the jar already in a rejoined basket against [] and charges it again —
 *      with (1) fully intact. The blind review of Phase 1c found exactly that.
 *
 * Without it, deleting the four-line guard clause turns every sighting of an item the basket
 * already holds back into a fresh charge, and nothing in CI notices.
 *
 * ## It PARSES, and it is aimed at its own matcher (LEARNINGS #60)
 *
 * The obvious version of this greps for "classifyScan" and passes on a comment, an import that is
 * never called, or a `{false && …}` branch parked next to the live code. So:
 *
 *   • comments are not AST nodes, so a mention in a docblock cannot satisfy anything here;
 *   • both calls must be LIVE — neither may sit under `if (false)`, `false && …`, `false ? … : x`
 *     or `while (false)`, the enumerated literal-dead shapes;
 *   • the guard's `if` test must reference the BINDING the classify call was assigned to, not any
 *     identifier that happens to read well — renaming the variable without re-pointing the test
 *     fails;
 *   • "before" is asserted as *inside the same function, at an earlier position, with a `return`
 *     in the taken branch* — an early return is the one case where lexical order IS the semantics,
 *     and the return is what makes it a stop rather than a log.
 *
 * Red-first — five falsifications induced against the real file and watched fail before this
 * shipped, then restored: the guard's `if` wrapped in `if (false)`; the `return` deleted so the
 * repeat only announces and falls through; the test swapped to read `via` instead of the verdict;
 * the verdict binding renamed without re-pointing the test; and the whole classification moved to
 * after the `scanAdd` await.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

// `SCAN_REPEAT_ROOT` points the gate at a COPY of the tree — `apps/qr/lib/check-scan-repeat.test.ts`
// runs it against committed mutations of the page and its sheets (each must turn it red). Unset, it
// reads this checkout.
const ROOT = process.env.SCAN_REPEAT_ROOT
  ? path.resolve(process.env.SCAN_REPEAT_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/qr/app/grocery/page.tsx";
const CLASSIFIER = "classifyScan";
const CHARGE = "scanAdd";

const problems = [];
const fail = (m) => problems.push(m);

const src = ts.createSourceFile(
  PAGE,
  readFileSync(path.join(ROOT, PAGE), "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);

/** Depth-first walk. `ts.forEachChild` is a SEARCH primitive — a truthy return aborts it. */
const walk = (n, fn) => {
  fn(n);
  ts.forEachChild(n, (c) => {
    walk(c, fn);
  });
};

const isFalseLiteral = (n) => n?.kind === ts.SyntaxKind.FalseKeyword;

/**
 * Is `node` parked in one of the enumerated literal-dead shapes? This is liveness against a parked
 * dead copy, not a reachability proof — a call behind a runtime condition still counts as live,
 * which is correct: this guard asks whether the code is THERE and wired, not whether some input
 * reaches it.
 */
const isLiterallyDead = (node) => {
  for (let n = node; n; n = n.parent) {
    const p = n.parent;
    if (!p) return false;
    if (ts.isIfStatement(p) && isFalseLiteral(p.expression) && p.thenStatement === n) return true;
    if (ts.isWhileStatement(p) && isFalseLiteral(p.expression) && p.statement === n) return true;
    if (
      ts.isBinaryExpression(p) &&
      p.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
      isFalseLiteral(p.left) &&
      p.right === n
    )
      return true;
    if (ts.isConditionalExpression(p) && isFalseLiteral(p.condition) && p.whenTrue === n)
      return true;
  }
  return false;
};

const enclosingFunction = (node) => {
  for (let n = node.parent; n; n = n.parent) if (ts.isFunctionLike(n)) return n;
  return null;
};

/** Every live call to `name` as a bare identifier callee. */
const callsTo = (name) => {
  const out = [];
  walk(src, (n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === name)
      out.push(n);
  });
  return out;
};

/**
 * EVERY binding a call sits under, innermost first: the scan charge answers ["add"], the queue
 * replay answers ["r", "outcomes", "drainNow"].
 *
 * ⚠️ A SET, not "the" owner, because two drafts of this got it wrong in opposite ways. Stopping at
 * the first enclosing function returned null for the replay (it lives in an anonymous arrow inside
 * `.map(…)`), and taking the first binding above that returned `outcomes` — the `const` the map's
 * promise lands in, which is not a name anyone would write an exemption against. An exemption is
 * matched against the whole chain so it names the function a reader would recognise.
 */
const ownerNames = (node) => {
  const out = [];
  for (let n = node; n; n = n.parent) {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name)) out.push(n.name.text);
    else if (ts.isFunctionDeclaration(n) && n.name) out.push(n.name.text);
  }
  return out;
};

const exemptReason = (node) => ownerNames(node).find((n) => n in EXEMPT) ?? null;

/**
 * `scanAdd` call sites that must NOT be gated by `classifyScan`, each with a reason that must FIRE
 * — an exemption for a call site that no longer exists is a silent hole (LEARNINGS #60).
 */
const EXEMPT = {
  drainNow:
    "the offline queue's REPLAY. Every entry in it was already classified at scan time and is " +
    "already counted as charged (`classifyScan` reads the queue); re-classifying here would " +
    "refuse the shopper's own queued scans as repeats of themselves and they would never land.",
};

const classifyCalls = callsTo(CLASSIFIER);
const allChargeCalls = callsTo(CHARGE);
const chargeCalls = allChargeCalls.filter((c) => exemptReason(c) === null);
const exemptedOwners = new Set(allChargeCalls.map(exemptReason).filter((n) => n !== null));
for (const name of Object.keys(EXEMPT))
  if (!exemptedOwners.has(name))
    fail(
      `EXEMPT names \`${name}\`, but no ${CHARGE}() call in ${PAGE} sits under it.\n` +
        "  The exemption no longer fires — delete it, or the next charge path added there is\n" +
        "  silently unguarded.",
    );

if (classifyCalls.length !== 1)
  fail(
    `expected exactly ONE live call to ${CLASSIFIER}() in ${PAGE}; found ${classifyCalls.length}.\n` +
      "  Two classifiers means two answers to one money question — name it once (CLAUDE.md), or\n" +
      "  this guard cannot say which one gates the charge.",
  );
if (chargeCalls.length !== 1)
  fail(
    `expected exactly ONE non-exempt call to ${CHARGE}() in ${PAGE}; found ${chargeCalls.length}` +
      ` (of ${allChargeCalls.length} total).\n` +
      "  A second charge path would need its own repeat guard, and this one would not see it —\n" +
      "  add it to EXEMPT with a reason, or gate it.",
  );

if (!problems.length) {
  const classify = classifyCalls[0];
  const charge = chargeCalls[0];

  for (const [label, node] of [
    [CLASSIFIER, classify],
    [CHARGE, charge],
  ])
    if (isLiterallyDead(node))
      fail(
        `${label}() sits in a literally-dead branch (if (false) / false && … / while (false)).\n` +
          "  A parked copy is not shipped behaviour.",
      );

  const fn = enclosingFunction(charge);
  if (!fn) fail(`${CHARGE}() is not inside a function — cannot locate the guard clause.`);
  else if (enclosingFunction(classify) !== fn)
    fail(
      `${CLASSIFIER}() and ${CHARGE}() are in DIFFERENT functions.\n` +
        "  The repeat check must gate the charge in the same call, or a scan can reach the server\n" +
        "  without ever being classified.",
    );
  else if (classify.pos >= charge.pos)
    fail(
      `${CLASSIFIER}() is positioned AFTER ${CHARGE}().\n` +
        "  The classification is a guard clause — after the charge it is a comment on a bill that\n" +
        "  already went out.",
    );
  else {
    // The binding the verdict was assigned to. Bound to the live call, not to any identifier
    // reading "verdict": rename it without re-pointing the test and this fails.
    let binding = null;
    for (let n = classify.parent; n; n = n.parent)
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name)) {
        binding = n.name.text;
        break;
      }
    if (!binding)
      fail(
        `${CLASSIFIER}()'s result is not bound to a variable, so nothing can gate on it.\n` +
          "  Assign the verdict and branch on it.",
      );
    else {
      const guards = [];
      walk(fn, (n) => {
        if (!ts.isIfStatement(n)) return;
        if (n.pos < classify.pos || n.pos >= charge.pos) return;
        if (isLiterallyDead(n.thenStatement)) return;
        let readsVerdict = false;
        walk(n.expression, (e) => {
          if (ts.isIdentifier(e) && e.text === binding) readsVerdict = true;
        });
        if (!readsVerdict) return;
        let stops = false;
        walk(n.thenStatement, (e) => {
          if (ts.isReturnStatement(e)) stops = true;
        });
        if (stops) guards.push(n);
      });
      if (!guards.length)
        fail(
          `no live \`if\` between ${CLASSIFIER}() and ${CHARGE}() reads \`${binding}\` and returns.\n` +
            "  A repeat must STOP the charge. Announcing it and falling through bills the shopper\n" +
            "  a second time for the item already in their basket — M186, reopened.",
        );
    }
  }
}

// ── (2) The camera's hold lifts only on a LOADED basket ─────────────────────────────────────────
// Red-first, each induced against the real file and watched fail, then restored: `cartReady` keyed
// on `Boolean(cartId)`; `scanBasketReady({ cartId, hydrated: true })` (a literal is not the state);
// the prop deleted; a spread after it. A `{false && <ScanStage cartReady={scanBasketReady(…)} />}`
// parked beside a live stage keyed on the id is refused because the LIVE stage is checked.
const READY = "scanBasketReady";
const stages = [];
walk(src, (n) => {
  if (
    (ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) &&
    ts.isIdentifier(n.tagName) &&
    n.tagName.text === "ScanStage"
  )
    stages.push(n);
});
const liveStages = stages.filter((st) => !isLiterallyDead(st));
if (!liveStages.length)
  fail(
    `no live <ScanStage> in ${PAGE} — the camera's hold cannot be checked.\n` +
      "  If the stage moved, move this proposition with it.",
  );
for (const st of liveStages) {
  const props = st.attributes.properties;
  const idx = props.findIndex((a) => ts.isJsxAttribute(a) && a.name.getText(src) === "cartReady");
  const attr = idx >= 0 ? props[idx] : null;
  const init = attr?.initializer;
  const expr = init && ts.isJsxExpression(init) ? init.expression : null;
  const arg = expr && ts.isCallExpression(expr) ? expr.arguments[0] : null;
  const hydratedLive =
    arg &&
    ts.isObjectLiteralExpression(arg) &&
    arg.properties.some(
      (p) =>
        (ts.isShorthandPropertyAssignment(p) && p.name.text === "hydrated") ||
        (ts.isPropertyAssignment(p) &&
          p.name.getText(src) === "hydrated" &&
          p.initializer.kind !== ts.SyntaxKind.TrueKeyword),
    );
  const spreadAfter = props.some((a, i) => i > idx && ts.isJsxSpreadAttribute(a));
  if (
    !expr ||
    !ts.isCallExpression(expr) ||
    !ts.isIdentifier(expr.expression) ||
    expr.expression.text !== READY ||
    expr.arguments.length !== 1 ||
    !hydratedLive ||
    spreadAfter
  )
    fail(
      `<ScanStage> must take \`cartReady={${READY}({ cartId, hydrated })}\` (no spread after it).\n` +
        "  The hold lifts the moment cartReady turns true, and the jar in frame is judged against\n" +
        "  the basket's lines THEN — before the first read lands they are [], so a rejoined\n" +
        "  basket's item is charged a second time.",
    );
}

// ── (3) Every sheet the page can open over the stage is a camera HOLD ────────────────────────────
// Blind pass on Phase 3b (concurrency): the door sheet joined the basket sheet over the camera, and
// `decodeHold` treats any sheet as a hold — but only if the page TELLS the stage. The invariant lived
// in a comment and one `||`; a mutant dropping `|| doorSheetOpen` survived every suite (the page has
// none, and it is outside the mutate set).
//
// Deep pass on #312 rewrote the matcher (LEARNINGS #60 — guards parse, never scan): the first draft
// found sheets by a NAME suffix (`/SheetOpen$/`) and asserted identifier PRESENCE in `sheetOpen`. So
// the basket sheet — `basketOpen`, the original camera hold — was never in the population, and
// `(basketOpen && !cartGone) && doorSheetOpen` (both sheets required at once, a state the UI cannot
// reach) or `|| (false && doorSheetOpen)` passed green. Now the population is what the page DECLARES:
// every JSX element whose tag ends in `Sheet` opens on its `open={…}` expression, and the stage must
// be told EXACTLY that — `sheetOpen` is a top-level `||` of disjuncts and every sheet's `open`
// expression is one of them, structurally (printed text, parentheses stripped). A sheet with no
// `open=`, or a `sheetOpen` that is not a disjunction over those expressions, is refused — never
// resolved by position or by guessing. Red-first: `||` → `&&`; a `false && x` disjunct; the basket's
// disjunct deleted; a sheet renamed.
const unwrap = (n) => {
  while (ts.isParenthesizedExpression(n)) n = n.expression;
  return n;
};
const printed = (n) => unwrap(n).getText(src).replace(/\s+/g, " ").trim();
// Every `useState` pair on the page: a sheet that OWNS its open state (the DoorSheet) reports it
// through `onOpenChange={setX}`, so its condition from the page's side is the state that setter
// writes. Found by the setter, never by the state's name.
const statePairs = new Map(); // setter → state
walk(src, (n) => {
  if (
    ts.isVariableDeclaration(n) &&
    ts.isArrayBindingPattern(n.name) &&
    n.initializer &&
    ts.isCallExpression(n.initializer) &&
    ts.isIdentifier(n.initializer.expression) &&
    n.initializer.expression.text === "useState"
  ) {
    const [st, set] = n.name.elements;
    if (
      st &&
      set &&
      ts.isBindingElement(st) &&
      ts.isBindingElement(set) &&
      ts.isIdentifier(st.name) &&
      ts.isIdentifier(set.name)
    )
      statePairs.set(set.name.text, st.name.text);
  }
});
const sheets = []; // { tag, open }
walk(src, (n) => {
  if (!(ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n))) return;
  const tag = n.tagName.getText(src);
  if (!/Sheet$/.test(tag)) return;
  const attrExpr = (name) => {
    const attr = n.attributes.properties.find(
      (a) => ts.isJsxAttribute(a) && a.name.getText(src) === name,
    );
    const init = attr?.initializer;
    return init && ts.isJsxExpression(init) ? init.expression : null;
  };
  const open = attrExpr("open");
  if (open) {
    sheets.push({ tag, open: printed(open) });
    return;
  }
  const report = attrExpr("onOpenChange");
  if (!report) {
    fail(
      `<${tag}> in ${PAGE} has neither \`open={…}\` nor \`onOpenChange={…}\` — a sheet whose condition the guard cannot read cannot be shown to be a camera hold.`,
    );
    return;
  }
  const states = new Set();
  walk(report, (m) => {
    if (ts.isIdentifier(m) && statePairs.has(m.text)) states.add(statePairs.get(m.text));
  });
  if (states.size !== 1)
    fail(
      `<${tag}> in ${PAGE} reports its open state through \`onOpenChange\`, but that expression writes ${states.size} page state(s) (${[...states].join(", ") || "none"}) — exactly one is the sheet's condition; ambiguity is refused.`,
    );
  else sheets.push({ tag, open: [...states][0] });
});
if (!sheets.length)
  fail(
    `no \`<…Sheet open={…}>\` in ${PAGE} — the camera-hold proposition has nothing to check; if the sheets were renamed, rename the rule.`,
  );
const disjuncts = (n, out = []) => {
  n = unwrap(n);
  if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
    disjuncts(n.left, out);
    disjuncts(n.right, out);
  } else out.push(printed(n));
  return out;
};
for (const st of liveStages) {
  const attr = st.attributes.properties.find(
    (a) => ts.isJsxAttribute(a) && a.name.getText(src) === "sheetOpen",
  );
  const init = attr?.initializer;
  const expr = init && ts.isJsxExpression(init) ? init.expression : null;
  const told = new Set(expr ? disjuncts(expr) : []);
  const missing = sheets.filter((sh) => !told.has(sh.open));
  if (!expr || missing.length)
    fail(
      `<ScanStage sheetOpen={…}> must be an \`||\` over EXACTLY each sheet's own \`open\` expression; not told: ${
        missing.map((m) => `<${m.tag} open={${m.open}}>`).join(", ") || "(no sheetOpen expression)"
      }.\n` +
        "  decodeHold treats ANY sheet over the stage as a hold — a sheet the stage is not told about\n" +
        "  (or is told about only together with another, or behind a dead `false &&`) lets a sighting\n" +
        "  through its scrim charge the basket.",
    );
}

// ── (4) The charge takes the SIGHTED code, never a judged / paired one (PD4) ──────────────────────
// m4 graft 3 lets a missed shelf code be JUDGED as the item it was paired to, so a re-read jar gets
// M186's repeat verdict. The critic's blocking finding (m4 appendix B1): the moment that item leaves
// the basket, `classifyScan` answers `add`, and a page that then charged the PAIRED barcode would
// charge an item the shopper never pointed at — from a sighting of a jar whose code is not in the
// app. `lib/scan-pairing.ts` spends the pairing on `add`; this proposition pins the other half,
// which is page wiring no suite sees: the non-exempt `scanAdd(...)`'s barcode argument RESOLVES to
// the enclosing function's own PARAMETER — the code the camera decoded.
//
// Bound to the parameter's DECLARATION, not its name (the blind pass on #329): a `barcode = judged`
// reassignment at the top of `add`, or a block-scoped `const barcode = judged` above the charge,
// ships the judged code under the same spelling. So the function body may hold NO assignment to
// that name (`=`, `+=`, `++`, a destructuring target) and NO shadowing declaration of it (a const,
// a binding element, a nested function's parameter). Red-first: the argument swapped to `judged`;
// `const code = judged` as the argument; `barcode = judged;` at the top; `{ const barcode =
// judged; … }` around the charge; the parameter renamed without re-pointing the argument.
if (!problems.length) {
  const charge = chargeCalls[0];
  const fn = enclosingFunction(charge);
  const arg = charge.arguments[1];
  const param =
    arg && ts.isIdentifier(arg)
      ? (fn?.parameters ?? []).find((p) => ts.isIdentifier(p.name) && p.name.text === arg.text)
      : undefined;
  if (!arg || !ts.isIdentifier(arg) || !param)
    fail(
      `${CHARGE}()'s barcode argument must be the enclosing function's own parameter (the code the\n` +
        `  camera decoded); found \`${arg ? arg.getText(src) : "(none)"}\`.\n` +
        "  A judged or paired code must never be charged — a pairing may only ever REPEAT (PD4,\n" +
        "  lib/scan-pairing.ts); charging it bills an item the shopper never pointed at.",
    );
  else {
    const name = arg.text;
    const isAssignment = (k) =>
      k >= ts.SyntaxKind.FirstAssignment && k <= ts.SyntaxKind.LastAssignment;
    const namesIn = (node) => {
      let hit = false;
      walk(node, (m) => {
        if (ts.isIdentifier(m) && m.text === name) hit = true;
      });
      return hit;
    };
    walk(fn.body, (n) => {
      if (ts.isBinaryExpression(n) && isAssignment(n.operatorToken.kind) && namesIn(n.left))
        fail(
          `\`${name}\` is ASSIGNED inside the charging function (\`${n.getText(src).slice(0, 60)}\`).\n` +
            "  The parameter must reach scanAdd() untouched: an assignment ships a judged code under\n" +
            "  the sighted code's own name.",
        );
      if (
        (ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n)) &&
        (n.operator === ts.SyntaxKind.PlusPlusToken ||
          n.operator === ts.SyntaxKind.MinusMinusToken) &&
        ts.isIdentifier(n.operand) &&
        n.operand.text === name
      )
        fail(`\`${name}\` is mutated inside the charging function.`);
      if (
        (ts.isVariableDeclaration(n) || ts.isBindingElement(n) || ts.isParameter(n)) &&
        ts.isIdentifier(n.name) &&
        n.name.text === name
      )
        fail(
          `\`${name}\` is DECLARED again inside the charging function (a shadowing \`${
            ts.isParameter(n) ? "parameter" : "binding"
          }\`).\n` + "  The argument then resolves to the shadow, not to the camera's code.",
        );
    });
  }
}

// ── (5) A sheet's COVER outlasts its `open`: only its exit end lifts the camera's hold (PD4) ──────
// Codex round 2 on #329 (4226434718): a sheet's `open` turns false at the START of its exit, while
// Radix keeps the sheet and its scrim mounted for the whole `--dur-sheet` exit. Proposition (3) tells
// the stage each sheet's `open` — so the hold lifted as the exit began, `BarcodeScanner` announced
// the next FRESH sighting (`sightBarcode` emits on any new barcode) and `add()` charged a jar behind
// a scrim the shopper was still looking at. `lib/hooks/useStageCover.ts` keeps a cover up from open
// until the exit end (the Sheet fires `onCloseAutoFocus` at unmount, after the exit — M76), and
// its suite pins the hook. This proposition pins the WIRING, for every page-owned sheet (a JSX
// `…Sheet` with `open={…}`):
//   a. exactly ONE `const { covering: C, exitEnd: E } = useStageCover(<that open expression>)`;
//   b. `C` is a disjunct of every live `<ScanStage sheetOpen>` (the stage is told the cover);
//   c. `E()` is called LIVE inside the handler passed as that sheet's `onCloseAutoFocus` — an
//      inline function, or an identifier bound to `useCallback(fn)` / a function — and NOWHERE
//      else: a call at the close's START lifts the cover exactly when the hole opens;
//   d. the sheet's component forwards `onCloseAutoFocus` to its one live `<Sheet>` (or the exit end
//      never arrives and only the fail-safe lifts the cover);
//   and every `useStageCover(…)` covers a sheet the page renders.
// A sheet that reports only through `onOpenChange` owns its Sheet and exposes no exit end; it must
// be EXEMPT with a reason that fires. Red-first, each induced against the real files and watched
// fail, then restored: the cover dropped from `sheetOpen`; `nameExitEnd()` moved into the close's
// START (`closeNameSheet`); the exit-end call deleted from the handler; the call parked under
// `if (false)`; the Name sheet's component no longer forwarding `onCloseAutoFocus`; the basket's
// cover deleted.
const COVER = "useStageCover";
const EXEMPT_COVER = {
  DoorSheet:
    "owns its Sheet and reports only `onOpenChange`, at the START of its close — it exposes no " +
    "exit end, so its exit window cannot be covered from this page without changing the shared " +
    "component (OPEN-ITEMS row `PD4 · door`).",
};
{
  const covers = [];
  walk(src, (n) => {
    if (!ts.isVariableDeclaration(n) || !n.initializer || !ts.isCallExpression(n.initializer))
      return;
    const call = n.initializer;
    if (!ts.isIdentifier(call.expression) || call.expression.text !== COVER) return;
    if (!ts.isObjectBindingPattern(n.name) || call.arguments.length !== 1) {
      fail(
        `a ${COVER}() result must be destructured as { covering, exitEnd } from ONE open expression.`,
      );
      return;
    }
    const pick = (key) => {
      const el = n.name.elements.find((e) => (e.propertyName ?? e.name).getText(src) === key);
      return el && ts.isIdentifier(el.name) ? el.name.text : null;
    };
    covers.push({
      open: printed(call.arguments[0]),
      covering: pick("covering"),
      exitEnd: pick("exitEnd"),
    });
  });
  const told = new Set();
  for (const st of liveStages) {
    const attr = st.attributes.properties.find(
      (a) => ts.isJsxAttribute(a) && a.name.getText(src) === "sheetOpen",
    );
    const init = attr?.initializer;
    const expr = init && ts.isJsxExpression(init) ? init.expression : null;
    for (const d of expr ? disjuncts(expr) : []) told.add(d);
  }
  const attrOf = (el, name) => {
    const a = el.attributes.properties.find(
      (p) => ts.isJsxAttribute(p) && p.name.getText(src) === name,
    );
    const init = a?.initializer;
    return init && ts.isJsxExpression(init) ? init.expression : null;
  };
  const pageSheets = [];
  const reported = [];
  walk(src, (n) => {
    if (!(ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n))) return;
    const tag = n.tagName.getText(src);
    if (!/Sheet$/.test(tag)) return;
    const open = attrOf(n, "open");
    if (open) pageSheets.push({ tag, el: n, open: printed(open) });
    else reported.push(tag);
  });
  for (const tag of reported)
    if (!(tag in EXEMPT_COVER))
      fail(
        `<${tag}> reports its open state only through onOpenChange, so its exit cannot be covered.\n` +
          "  Give it `open={…}` and an `onCloseAutoFocus` exit end, or exempt it here with a reason.",
      );
  for (const name of Object.keys(EXEMPT_COVER))
    if (!reported.includes(name))
      fail(
        `EXEMPT_COVER names <${name}>, but no such sheet reports through onOpenChange — delete the exemption.`,
      );
  /** The function a JSX handler attribute resolves to: an inline function, or an identifier bound
   *  (in this file) to `useCallback(fn, …)` or to a function. */
  const resolveHandler = (expr) => {
    if (!expr) return null;
    if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) return expr;
    if (!ts.isIdentifier(expr)) return null;
    let found = null;
    walk(src, (n) => {
      if (!ts.isVariableDeclaration(n) || !ts.isIdentifier(n.name) || n.name.text !== expr.text)
        return;
      const init = n.initializer;
      if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) found = init;
      else if (
        init &&
        ts.isCallExpression(init) &&
        ts.isIdentifier(init.expression) &&
        init.expression.text === "useCallback" &&
        init.arguments[0] &&
        (ts.isArrowFunction(init.arguments[0]) || ts.isFunctionExpression(init.arguments[0]))
      )
        found = init.arguments[0];
    });
    return found;
  };
  /** Does `tag`'s own component forward `onCloseAutoFocus` to its one live `<Sheet>`? */
  const forwardsExit = (tag) => {
    let spec = null;
    for (const st of src.statements)
      if (
        ts.isImportDeclaration(st) &&
        st.importClause?.namedBindings &&
        ts.isNamedImports(st.importClause.namedBindings) &&
        st.importClause.namedBindings.elements.some((e) => e.name.text === tag) &&
        ts.isStringLiteral(st.moduleSpecifier)
      )
        spec = st.moduleSpecifier.text;
    if (!spec || !spec.startsWith("@/"))
      return `<${tag}> is not imported from an @/ path this guard can read`;
    const rel = path.join("apps/qr", `${spec.slice(2)}.tsx`);
    const comp = ts.createSourceFile(
      rel,
      readFileSync(path.join(ROOT, rel), "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const live = [];
    walk(comp, (n) => {
      if (
        (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) &&
        n.tagName.getText(comp) === "Sheet" &&
        !isLiterallyDead(n)
      )
        live.push(n);
    });
    if (live.length !== 1)
      return `${rel} renders ${live.length} live <Sheet> (ambiguity is refused)`;
    const a = live[0].attributes.properties.find(
      (p) => ts.isJsxAttribute(p) && p.name.getText(comp) === "onCloseAutoFocus",
    );
    const init = a?.initializer;
    const ok =
      init &&
      ts.isJsxExpression(init) &&
      init.expression &&
      init.expression.getText(comp) === "onCloseAutoFocus";
    return ok
      ? null
      : `${rel}'s <Sheet> does not take \`onCloseAutoFocus={onCloseAutoFocus}\` — the exit end never arrives`;
  };
  for (const sh of pageSheets) {
    const mine = covers.filter((c) => c.open === sh.open);
    if (mine.length !== 1) {
      fail(
        `<${sh.tag} open={${sh.open}}> needs exactly ONE \`${COVER}(${sh.open})\`; found ${mine.length}.\n` +
          "  Without it the camera's hold lifts as the sheet's exit STARTS, while it is still on screen.",
      );
      continue;
    }
    const c = mine[0];
    if (!c.covering || !told.has(c.covering))
      fail(
        `the stage is not told <${sh.tag}>'s cover: \`${c.covering}\` is not a <ScanStage sheetOpen> disjunct.\n` +
          "  A sighting during the sheet's exit is then announced — and charged — behind its scrim.",
      );
    const handler = resolveHandler(attrOf(sh.el, "onCloseAutoFocus"));
    if (!handler) {
      fail(`<${sh.tag}> takes no resolvable onCloseAutoFocus — its exit end has no way in.`);
      continue;
    }
    const calls = c.exitEnd ? callsTo(c.exitEnd) : [];
    const inside = calls.filter(
      (x) => x.pos >= handler.pos && x.end <= handler.end && !isLiterallyDead(x),
    );
    if (!inside.length)
      fail(
        `\`${c.exitEnd}()\` is not called (live) in <${sh.tag}>'s onCloseAutoFocus handler.\n` +
          "  That handler is the exit end (the Sheet fires it at unmount, after the exit).",
      );
    const outside = calls.filter((x) => !(x.pos >= handler.pos && x.end <= handler.end));
    if (outside.length)
      fail(
        `\`${c.exitEnd}()\` is called OUTSIDE <${sh.tag}>'s onCloseAutoFocus handler.\n` +
          "  Anywhere else — a close handler above all — lifts the cover at the START of the exit.",
      );
    const fwd = forwardsExit(sh.tag);
    if (fwd) fail(fwd);
  }
  for (const c of covers)
    if (!pageSheets.some((sh) => sh.open === c.open))
      fail(`\`${COVER}(${c.open})\` covers no sheet the page renders — a cover tied to nothing.`);
}

// ── (6) The add-Undo writes from the add's OWN confirmed qty and speaks from its follow-up read ──
// Blind pass 2 on #329: `undoAdd` took its target from `linesRef` (the client view, which a read
// issued after the add can leave a unit short — "one fewer" of THAT removed the unit the basket held
// before the add) and said "Removed" on any ok read without reading its lines. The rules are pure
// (`lib/scan-undo.ts`, mutant-pinned); this pins the page's WIRING, in the function bound to `undoAdd`:
//   a. exactly ONE live `setQty(…)`, whose qty is `undoTargetQty(R)` (directly, or through a const
//      bound to it), R being the Undo record (`undo`, or a const bound to it);
//   b. no reference to the client view (`linesRef`, `lines`), and no hand-written "Removed…" text;
//   c. a live `undoOutcome(R, …)` — the words come from what the follow-up read confirms;
// and, file-wide, d. every `setUndo(…)` is `null`, a retiring updater, or a binding to `undoFromAdd(…)`
// — the record is built only from the add's own confirmed view.
{
  const fnOf = (name) => {
    const decls = [];
    walk(src, (n) => {
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === name)
        decls.push(n);
    });
    if (decls.length !== 1)
      return { problem: `${decls.length} declarations of \`${name}\` (ambiguity is refused)` };
    const init = decls[0].initializer;
    const fn =
      init &&
      ts.isCallExpression(init) &&
      ts.isIdentifier(init.expression) &&
      init.expression.text === "useCallback"
        ? init.arguments[0]
        : init;
    return fn && (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))
      ? { fn }
      : { problem: `\`${name}\` is not a function` };
  };
  const { fn, problem } = fnOf("undoAdd");
  if (problem) fail(`proposition 6: ${problem}.`);
  else {
    // R — the record: `undo`, or a const in the function bound to it.
    const records = new Set(["undo"]);
    const constInit = new Map();
    walk(fn, (n) => {
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
        constInit.set(n.name.text, n.initializer);
        if (ts.isIdentifier(n.initializer) && n.initializer.text === "undo")
          records.add(n.name.text);
      }
    });
    const callsIn = (name) => {
      const out = [];
      walk(fn, (n) => {
        if (
          ts.isCallExpression(n) &&
          ts.isIdentifier(n.expression) &&
          n.expression.text === name &&
          !isLiterallyDead(n)
        )
          out.push(n);
      });
      return out;
    };
    const isTargetOfRecord = (e) => {
      if (e && ts.isIdentifier(e) && constInit.has(e.text)) e = constInit.get(e.text);
      return (
        !!e &&
        ts.isCallExpression(e) &&
        ts.isIdentifier(e.expression) &&
        e.expression.text === "undoTargetQty" &&
        e.arguments.length === 1 &&
        ts.isIdentifier(e.arguments[0]) &&
        records.has(e.arguments[0].text)
      );
    };
    const writes = callsIn("setQty");
    if (writes.length !== 1 || !isTargetOfRecord(writes[0].arguments[1]))
      fail(
        "proposition 6: `undoAdd` must make exactly ONE live `setQty(lineId, undoTargetQty(<the Undo record>))`.\n" +
          "  `setQty` is absolute: a qty from anywhere else — the client view above all — can remove the\n" +
          "  unit the basket held before the add.",
      );
    // Names `undoAdd` declares itself (a `const { lines } = r` is the follow-up read's, not the view).
    const ownNames = new Set();
    walk(fn, (n) => {
      if (
        (ts.isVariableDeclaration(n) || ts.isBindingElement(n) || ts.isParameter(n)) &&
        ts.isIdentifier(n.name)
      )
        ownNames.add(n.name.text);
    });
    /** A REFERENCE — not a member name (`r.lines`), a property key or a declaration's own name. */
    const isReference = (n) => {
      const p = n.parent;
      if (ts.isPropertyAccessExpression(p) && p.name === n) return false;
      if (ts.isPropertyAssignment(p) && p.name === n) return false;
      if (ts.isBindingElement(p) && p.propertyName === n) return false;
      if (
        (ts.isVariableDeclaration(p) || ts.isBindingElement(p) || ts.isParameter(p)) &&
        p.name === n
      )
        return false;
      return true;
    };
    walk(fn, (n) => {
      if (
        ts.isIdentifier(n) &&
        isReference(n) &&
        (n.text === "linesRef" || (n.text === "lines" && !ownNames.has("lines")))
      )
        fail(
          `proposition 6: \`undoAdd\` reads the client view (\`${n.text}\`).\n` +
            "  The Undo's target and words come from the add's own confirmed view and the follow-up read.",
        );
      if (
        (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n)) &&
        /\bRemoved\b/.test(n.text)
      )
        fail(
          'proposition 6: `undoAdd` hand-writes a "Removed…" — the past tense comes only from `undoSentence(undoOutcome(…))`.',
        );
    });
    const outcomes = callsIn("undoOutcome").filter(
      (c) => ts.isIdentifier(c.arguments[0]) && records.has(c.arguments[0].text),
    );
    if (!outcomes.length)
      fail(
        "proposition 6: `undoAdd` never calls `undoOutcome(<the Undo record>, …)` — its words are not the read's.",
      );
  }
  // d. every setUndo(...) — null, a retiring updater, or a binding to undoFromAdd(...) over the
  //    add's OWN response: `{ barcode: <scanAdd's code>, lines: <R>.lines }`, R assigned from the
  //    `scanAdd(…)` call — never the client view handed to the same builder.
  const charged = chargeCalls[0];
  const chargedCode = charged?.arguments[1]?.getText(src);
  /** Identifiers assigned (or initialised) from an expression holding the `scanAdd(…)` call. */
  const responses = new Set();
  walk(src, (n) => {
    const target =
      ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken
        ? [n.left, n.right]
        : ts.isVariableDeclaration(n) && n.initializer
          ? [n.name, n.initializer]
          : null;
    if (!target || !ts.isIdentifier(target[0]) || !charged) return;
    if (charged.pos >= target[1].pos && charged.end <= target[1].end) responses.add(target[0].text);
  });
  const fromAdd = new Set();
  walk(src, (n) => {
    if (
      !ts.isVariableDeclaration(n) ||
      !ts.isIdentifier(n.name) ||
      !n.initializer ||
      !ts.isCallExpression(n.initializer) ||
      !ts.isIdentifier(n.initializer.expression) ||
      n.initializer.expression.text !== "undoFromAdd"
    )
      return;
    const obj = n.initializer.arguments[0];
    const prop = (key) => {
      if (!obj || !ts.isObjectLiteralExpression(obj)) return null;
      const p = obj.properties.find((q) => q.name && q.name.getText(src) === key);
      if (!p) return null;
      if (ts.isShorthandPropertyAssignment(p)) return p.name;
      return ts.isPropertyAssignment(p) ? p.initializer : null;
    };
    const lines = prop("lines");
    const code = prop("barcode");
    const ownLines =
      lines &&
      ts.isPropertyAccessExpression(lines) &&
      lines.name.text === "lines" &&
      ts.isIdentifier(lines.expression) &&
      responses.has(lines.expression.text);
    const ownCode = code && ts.isIdentifier(code) && code.text === chargedCode;
    if (ownLines && ownCode) fromAdd.add(n.name.text);
    else
      fail(
        `proposition 6: \`${n.getText(src).slice(0, 80)}\` — undoFromAdd must take the add's OWN response\n` +
          `  (\`lines: <the scanAdd result>.lines\`, \`barcode\` the code scanAdd charged), never the client view.`,
      );
  });
  const isNull = (e) => e.kind === ts.SyntaxKind.NullKeyword;
  /** `(u) => (cond ? null : u)` — an updater that can only retire the record or keep it. */
  const retiring = (e) => {
    if (
      !ts.isArrowFunction(e) ||
      e.parameters.length !== 1 ||
      !ts.isIdentifier(e.parameters[0].name)
    )
      return false;
    const p = e.parameters[0].name.text;
    let body = e.body;
    while (ts.isParenthesizedExpression(body)) body = body.expression;
    return (
      ts.isConditionalExpression(body) &&
      [body.whenTrue, body.whenFalse].every(
        (b) => isNull(b) || (ts.isIdentifier(b) && b.text === p),
      )
    );
  };
  walk(src, (n) => {
    if (
      !ts.isCallExpression(n) ||
      !ts.isIdentifier(n.expression) ||
      n.expression.text !== "setUndo"
    )
      return;
    const a = n.arguments[0];
    const ok = a && (isNull(a) || retiring(a) || (ts.isIdentifier(a) && fromAdd.has(a.text)));
    if (!ok)
      fail(
        `proposition 6: \`setUndo(${a ? a.getText(src).slice(0, 50) : ""})\` — an Undo record may only be\n` +
          "  built by `undoFromAdd(…)` from the add's own confirmed view (or retired with null).",
      );
  });
}

if (problems.length) {
  console.error("scan repeat gate … \x1b[31m✗\x1b[0m\n");
  for (const p of problems) console.error("  " + p + "\n");
  process.exit(1);
}
console.log(
  "scan repeat gate … \x1b[32mclean\x1b[0m\x1b[2m" +
    ` — ${PAGE}: the ${CHARGE}() call is gated by a live ${CLASSIFIER}() early return` +
    ` (${exemptedOwners.size} exempt call site${exemptedOwners.size === 1 ? "" : "s"}, reason fired);` +
    ` ${liveStages.length} <ScanStage> holds on ${READY}() and on ${sheets.length} sheet${sheets.length === 1 ? "" : "s"} (${sheets.map((sh) => sh.tag).join(", ")}),` +
    ` each page-owned sheet's cover lifted only by its exit end (${Object.keys(EXEMPT_COVER).length} exempt, reason fired);` +
    ` the add-Undo writes undoTargetQty(<its record>) and speaks undoOutcome(<the follow-up read>)\x1b[0m`,
);
