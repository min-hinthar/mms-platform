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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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
// which is page wiring no suite sees: the non-exempt `scanAdd(...)`'s barcode argument is the
// enclosing function's OWN PARAMETER (the code the camera decoded), never a derived binding.
// Red-first: the argument swapped to `judged` → red; to a fresh `const code = judged` → red; the
// parameter renamed without re-pointing the argument → red.
if (!problems.length) {
  const charge = chargeCalls[0];
  const fn = enclosingFunction(charge);
  const arg = charge.arguments[1];
  const paramNames = new Set(
    (fn?.parameters ?? [])
      .map((p) => (ts.isIdentifier(p.name) ? p.name.text : null))
      .filter(Boolean),
  );
  if (!arg || !ts.isIdentifier(arg) || !paramNames.has(arg.text))
    fail(
      `${CHARGE}()'s barcode argument must be the enclosing function's own parameter (the code the\n` +
        `  camera decoded); found \`${arg ? arg.getText(src) : "(none)"}\`.\n` +
        "  A judged or paired code must never be charged — a pairing may only ever REPEAT (PD4,\n" +
        "  lib/scan-pairing.ts); charging it bills an item the shopper never pointed at.",
    );
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
    ` ${liveStages.length} <ScanStage> holds on ${READY}() and on ${sheets.length} sheet${sheets.length === 1 ? "" : "s"} (${sheets.map((sh) => sh.tag).join(", ")})\x1b[0m`,
);
