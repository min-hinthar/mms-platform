import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

/**
 * Phase 2i (P2bi) · S0 critic F1 — EVERY Server Action a staff client component calls goes through
 * the stall ledger (`track` · `boundWrite` · `boundRead` · `raceTimeout` · a poll gate's `watch`).
 *
 * The reload contract reads that ledger and nothing else to know what a reload would lose: a write
 * still out is `youngWrite` / `stalledWrite`, a write that just answered opens the answer window
 * (`msSinceWriteSettled`), and a rejection is the ONLY place a retired action id
 * (`UnrecognizedActionError`) is witnessed for the tab (`onTrackedRejection`). A raw
 * `await setMenuPrice(…)` is invisible to all three: a manager's Reload tap passed every check and
 * reloaded over the price write still out, and its retired-id rejection never marked the tab.
 *
 * ⚠️ PARSED, NEVER SCANNED (LEARNINGS #60). Each call to a binding imported from a `"use server"`
 * module is checked on its own — a wrapped copy elsewhere never excuses a raw one. A call is tracked
 * when it is the FIRST argument of a wrapper resolved through its import (an alias is read, a local
 * function that merely shares the name is not); or the initializer of a `const` that a LIVE wrapper
 * call in the same function takes (literal-dead shapes — `if (false)`, `false && …`, a dead ternary
 * arm — never count); or that `const` is RETURNED by a named function, whose own calls are then
 * checked the same way (MergeTableButton's `candidateRead`). A local function that hands one of its
 * parameters to a wrapper is a wrapper for that position (KdsBoard's `kitchenWrite`). A `.watch(…)`
 * counts only in a file that imports `createPollGate`. Each evasion is falsified on a fixture below.
 *
 * ⚠️ AND BY KIND (Phase 2i blind review, money M3 · M4). Reaching the ledger is not enough: a call
 * tracked as a READ (`boundRead`, `track(…, "read")`, `raceTimeout(…, "read")`, a gate's `watch`, or
 * any wrapper whose kind argument is not a string literal) is invisible to every write signal the
 * reload contract reads, so it may wrap only an action on `READS` below. The reader's status poll
 * shipped labelled a read while it moves the settlement freeze and can cancel a payment — and this
 * guard passed it. A namespace or default import of a "use server" module is refused outright: its
 * calls are property accesses this resolver does not follow.
 */

const QR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const STAFF = path.join(QR, "components", "staff");

const WRAPPERS: Record<string, readonly string[]> = {
  "lib/bounded-write": ["track", "boundWrite", "boundRead"],
  "lib/staff-outage": ["raceTimeout"],
};

/** What a wrapper call puts on the ledger: a write, a read, or a kind no parse can read (a variable
 *  passed as the kind) — which counts as NOT provably a write. */
type Kind = "write" | "read" | "unknown";

/**
 * Phase 2i blind review (money M3) — the ONLY Server Actions a staff component may put on the ledger
 * as a READ. A read is invisible to `youngWrite`, `stalledWrite` and the answer window, so a WRITE
 * labelled "read" lets a Reload tap land in the middle of it as "nothing saving" — exactly what
 * `terminalStatus` did (it moves the settlement freeze and can cancel a payment) until this list
 * existed. Each entry is an action whose server side changes nothing; adding one is a claim about
 * that action's server code, so read it before you add it here.
 */
const READS: ReadonlySet<string> = new Set([
  // The boards' polls and the pane/pad detail reads (selects, plus the read-only `mms_now` /
  // `mms_kds_stats` RPCs).
  "pollPendingApprovals",
  "listApprovers",
  "listRefundsNeeded",
  "getOldestCounterOrders",
  "getExpoQueue",
  "getFloorView",
  "getTableDetail",
  "getKitchenQueue",
  "getMergeCandidates",
  // PD7 — the clear's fresh look: the session, `mms_now`, the open cart's lines and their names,
  // all selects (`lib/floor.ts` `getClearPreview`); the clear itself is `clearTable`, a write.
  "getClearPreview",
  "getSettledToday",
  "listMyStaffReports",
  // Stripe `retrieve` calls only — its docblock: "no freeze is touched, nothing is extended,
  // cancelled or revalidated" (S0 deviation 1).
  "terminalResume",
]);

const parse = (rel: string, text: string) =>
  ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

/** A module's repo-relative id (`lib/menu-price`) from an import specifier in `fromRel`. */
function moduleId(fromRel: string, spec: string): string | null {
  if (spec.startsWith("@/")) return spec.slice(2);
  if (spec.startsWith(".")) return path.posix.join(path.posix.dirname(fromRel), spec);
  return null;
}

/** The kind an imported wrapper's call puts on the ledger: `boundWrite` / `boundRead` by name, and
 *  `track(raw, kind = "write")` / `raceTimeout(p, kind, ms)` by their kind argument — a string
 *  literal, read as written; anything else is not provably a write. */
function wrapperKind(imported: string, call: ts.CallExpression): Kind {
  if (imported === "boundWrite") return "write";
  if (imported === "boundRead") return "read";
  const arg = call.arguments[1];
  if (arg === undefined) return imported === "track" ? "write" : "unknown";
  if (ts.isStringLiteralLike(arg)) {
    if (arg.text === "write") return "write";
    if (arg.text === "read") return "read";
  }
  return "unknown";
}

function isUseServer(text: string): boolean {
  const sf = parse("m.ts", text);
  for (const st of sf.statements) {
    if (!ts.isExpressionStatement(st) || !ts.isStringLiteral(st.expression)) return false;
    if (st.expression.text === "use server") return true;
  }
  return false;
}

/** Inside a literal-dead shape: never runs. */
function isDead(node: ts.Node): boolean {
  for (let n: ts.Node = node; n.parent !== undefined; n = n.parent) {
    const p = n.parent;
    const lit = (e: ts.Expression) => {
      while (ts.isParenthesizedExpression(e)) e = e.expression;
      return e.kind;
    };
    if (ts.isIfStatement(p)) {
      if (n === p.thenStatement && lit(p.expression) === ts.SyntaxKind.FalseKeyword) return true;
      if (n === p.elseStatement && lit(p.expression) === ts.SyntaxKind.TrueKeyword) return true;
    }
    if (ts.isConditionalExpression(p)) {
      if (n === p.whenTrue && lit(p.condition) === ts.SyntaxKind.FalseKeyword) return true;
      if (n === p.whenFalse && lit(p.condition) === ts.SyntaxKind.TrueKeyword) return true;
    }
    if (ts.isBinaryExpression(p) && n === p.right) {
      const l = lit(p.left);
      const and = p.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken;
      const or = p.operatorToken.kind === ts.SyntaxKind.BarBarToken;
      if (and && (l === ts.SyntaxKind.FalseKeyword || l === ts.SyntaxKind.NullKeyword)) return true;
      if (or && l === ts.SyntaxKind.TrueKeyword) return true;
    }
  }
  return false;
}

function enclosingFunction(
  node: ts.Node,
): ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction | ts.MethodDeclaration | null {
  for (let p = node.parent; p !== undefined; p = p.parent) {
    if (
      ts.isFunctionDeclaration(p) ||
      ts.isFunctionExpression(p) ||
      ts.isArrowFunction(p) ||
      ts.isMethodDeclaration(p)
    )
      return p;
  }
  return null;
}

function eachNode(root: ts.Node, fn: (n: ts.Node) => void): void {
  const visit = (n: ts.Node): void => {
    fn(n);
    ts.forEachChild(n, (c) => {
      visit(c);
    });
  };
  visit(root);
}

const unwrap = (e: ts.Node): ts.Node => {
  let n = e;
  while (
    n.parent !== undefined &&
    (ts.isParenthesizedExpression(n.parent) ||
      ts.isAsExpression(n.parent) ||
      ts.isNonNullExpression(n.parent) ||
      ts.isSatisfiesExpression(n.parent))
  )
    n = n.parent;
  return n;
};

type Untracked = { file: string; line: number; callee: string };

/** Every call to a server-action import in `files` that does not reach the ledger. */
function untrackedActionCalls(
  files: { rel: string; text: string }[],
  serverModules: ReadonlySet<string>,
  readsAllowed: ReadonlySet<string> = READS,
): {
  untracked: Untracked[];
  checked: string[];
  /** Tracked, but as a read (or an unreadable kind) — and not on `readsAllowed`. */
  misread: Untracked[];
  /** Every action tracked as a read, `file:action` (the allowlist is pinned to these). */
  reads: string[];
  refusedImports: string[];
} {
  const untracked: Untracked[] = [];
  const checked: string[] = [];
  const misread: Untracked[] = [];
  const reads: string[] = [];
  const refusedImports: string[] = [];
  for (const { rel, text } of files) {
    const sf = parse(rel, text);
    const actions = new Set<string>();
    // local name → the argument position it tracks, and the kind a call to it puts on the ledger
    const wrappers = new Map<string, { pos: number; kind: (c: ts.CallExpression) => Kind }>();
    const actionOf = new Map<string, string>(); // local callee → the server action's exported name
    let pollGate = false;
    for (const st of sf.statements) {
      if (!ts.isImportDeclaration(st) || st.importClause === undefined) continue;
      if (st.importClause.isTypeOnly || !ts.isStringLiteral(st.moduleSpecifier)) continue;
      const mod = moduleId(rel, st.moduleSpecifier.text);
      const nb = st.importClause.namedBindings;
      if (mod === null) continue;
      // Blind review (money M4) — a namespace or default import of a "use server" module hides every
      // call behind a property access (`acts.setPin(…)`) this resolver never reads: refused outright.
      if (
        serverModules.has(mod) &&
        (st.importClause.name !== undefined || (nb !== undefined && ts.isNamespaceImport(nb)))
      )
        refusedImports.push(`${rel}:${st.moduleSpecifier.text}`);
      if (nb === undefined || !ts.isNamedImports(nb)) continue;
      for (const el of nb.elements) {
        if (el.isTypeOnly) continue;
        const imported = (el.propertyName ?? el.name).text;
        if (serverModules.has(mod)) {
          actions.add(el.name.text);
          actionOf.set(el.name.text, imported);
        }
        if (WRAPPERS[mod]?.includes(imported))
          wrappers.set(el.name.text, { pos: 0, kind: (c) => wrapperKind(imported, c) });
        if (mod === "lib/poll-gate" && imported === "createPollGate") pollGate = true;
      }
    }
    if (actions.size === 0) continue;

    const wrapperPos = (call: ts.CallExpression): number | null => {
      const c = call.expression;
      if (ts.isIdentifier(c)) return wrappers.get(c.text)?.pos ?? null;
      if (pollGate && ts.isPropertyAccessExpression(c) && c.name.text === "watch") return 0;
      return null;
    };
    /** The kind a wrapper call (one `wrapperPos` resolves) puts on the ledger. A gate's `watch` is a
     *  read (`createPollGate` tracks its raw as one). */
    const callKind = (call: ts.CallExpression): Kind => {
      const c = call.expression;
      if (ts.isIdentifier(c)) return wrappers.get(c.text)?.kind(call) ?? "unknown";
      return "read";
    };
    /** The LIVE wrapper call inside `scope` that takes `v` (an identifier) at its tracked position. */
    const consumedIn = (scope: ts.Node, v: string): ts.CallExpression | null => {
      let hit: ts.CallExpression | null = null;
      eachNode(scope, (n) => {
        if (hit !== null || !ts.isCallExpression(n) || isDead(n)) return;
        const pos = wrapperPos(n);
        const arg = pos === null ? undefined : n.arguments[pos];
        if (arg !== undefined && ts.isIdentifier(unwrapArg(arg)) && unwrapArg(arg).getText() === v)
          hit = n;
      });
      return hit;
    };
    const unwrapArg = (a: ts.Expression): ts.Expression => {
      let e = a;
      while (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e))
        e = e.expression;
      return e;
    };

    // Local wrappers to a fixpoint: a function declaration that hands parameter i to a wrapper.
    for (let grew = true; grew; ) {
      grew = false;
      eachNode(sf, (n) => {
        if (!ts.isFunctionDeclaration(n) || n.name === undefined || n.body === undefined) return;
        if (wrappers.has(n.name.text)) return;
        n.parameters.forEach((p, i) => {
          if (wrappers.has(n.name!.text) || !ts.isIdentifier(p.name)) return;
          const inner = consumedIn(n.body!, p.name.text);
          if (inner !== null) {
            // A local wrapper puts on the ledger whatever ITS inner wrapper call does.
            const kind = callKind(inner);
            wrappers.set(n.name!.text, { pos: i, kind: () => kind });
            grew = true;
          }
        });
      });
    }

    // Calls to check: the actions, then any named function that returns an action's raw.
    const callees = new Set(actions);
    // `delegated`: the raw is RETURNED, so its kind is decided at the returning function's own calls.
    const verdicts = new Map<ts.CallExpression, { ok: boolean; kind: Kind | "delegated" }>();
    for (let grew = true; grew; ) {
      grew = false;
      eachNode(sf, (n) => {
        if (!ts.isCallExpression(n) || !ts.isIdentifier(n.expression)) return;
        if (!callees.has(n.expression.text) || verdicts.has(n)) return;
        let e = unwrap(n);
        while (
          e.parent !== undefined &&
          ts.isConditionalExpression(e.parent) &&
          e !== e.parent.condition
        )
          e = unwrap(e.parent);
        const p = e.parent;
        let ok = false;
        let kind: Kind | "delegated" = "unknown";
        if (p !== undefined && ts.isCallExpression(p)) {
          const pos = wrapperPos(p);
          ok = pos !== null && p.arguments[pos] === e;
          if (ok) kind = callKind(p);
        } else if (
          p !== undefined &&
          ts.isVariableDeclaration(p) &&
          p.initializer === e &&
          ts.isIdentifier(p.name)
        ) {
          const v = p.name.text;
          const fn = enclosingFunction(p);
          const scope = fn?.body ?? sf;
          const consumer = consumedIn(scope, v);
          if (consumer !== null) {
            ok = true;
            kind = callKind(consumer);
          } else if (fn !== null && ts.isFunctionDeclaration(fn) && fn.name !== undefined) {
            let returned = false;
            eachNode(scope, (r) => {
              if (
                ts.isReturnStatement(r) &&
                r.expression !== undefined &&
                ts.isIdentifier(r.expression) &&
                r.expression.text === v &&
                enclosingFunction(r) === fn &&
                !isDead(r)
              )
                returned = true;
            });
            if (returned) {
              ok = true;
              kind = "delegated";
              if (!callees.has(fn.name.text)) {
                callees.add(fn.name.text);
                actionOf.set(fn.name.text, actionOf.get(n.expression.text) ?? n.expression.text);
                grew = true;
              }
            }
          }
        }
        verdicts.set(n, { ok, kind });
      });
    }
    for (const [n, { ok, kind }] of verdicts) {
      const callee = (n.expression as ts.Identifier).text;
      const line = sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
      checked.push(`${rel}:${callee}`);
      if (!ok) untracked.push({ file: rel, line, callee });
      else if (kind !== "write" && kind !== "delegated") {
        const action = actionOf.get(callee) ?? callee;
        if (kind === "read") reads.push(`${rel}:${action}`);
        if (!readsAllowed.has(action)) misread.push({ file: rel, line, callee: action });
      }
    }
  }
  return { untracked, checked, misread, reads, refusedImports };
}

function serverModulesOnDisk(): Set<string> {
  const out = new Set<string>();
  for (const f of readdirSync(path.join(QR, "lib"), { recursive: true }).map(String)) {
    if (!f.endsWith(".ts") || /\.test\.ts$/.test(f)) continue;
    if (isUseServer(readFileSync(path.join(QR, "lib", f), "utf8")))
      out.add(`lib/${f.replace(/\.ts$/, "").split(path.sep).join("/")}`);
  }
  return out;
}

function staffFiles(): { rel: string; text: string }[] {
  return readdirSync(STAFF, { recursive: true })
    .map(String)
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
    .map((f) => {
      const rel = `components/staff/${f.split(path.sep).join("/")}`;
      return { rel, text: readFileSync(path.join(QR, rel), "utf8") };
    });
}

describe("every Server Action a staff component calls reaches the stall ledger", () => {
  it("the live tree: no raw call", () => {
    const { untracked, checked, misread, reads, refusedImports } = untrackedActionCalls(
      staffFiles(),
      serverModulesOnDisk(),
    );
    expect(untracked).toEqual([]);
    // Blind review (money M3 · M4): every READ is on the allowlist, and nothing hides behind a
    // namespace import.
    expect(misread).toEqual([]);
    expect(refusedImports).toEqual([]);
    // Not vacuous, and the allowlist carries no dead entry: every listed action IS read somewhere.
    expect(new Set(reads.map((r) => r.split(":")[1]))).toEqual(READS);
    // The reader's status poll moves the settlement freeze and can cancel a payment: a WRITE.
    expect(reads.some((r) => r.endsWith(":terminalStatus"))).toBe(false);
    expect(checked).toContain("components/staff/ReaderCollectProvider.tsx:terminalStatus");
    // Not vacuous: the resolver sees the calls the reload contract depends on (S0 critic F1).
    for (const seen of [
      "components/staff/MenuPriceEditor.tsx:setMenuPrice",
      "components/staff/MenuPriceEditor.tsx:setItemSoldOut",
      "components/staff/StaffDoors.tsx:setStaffDoor",
      "components/staff/TeamManager.tsx:provisionStaff",
      "components/staff/TeamManager.tsx:setStaffRole",
      "components/staff/TeamManager.tsx:setStaffActive",
      "components/staff/SignedInCard.tsx:setPin",
      "components/staff/SignedInCard.tsx:removePin",
      "components/staff/HelpButton.tsx:listMyStaffReports",
      "components/staff/MergeTableButton.tsx:candidateRead",
      "components/staff/KdsBoard.tsx:bumpTicket",
    ])
      expect(checked).toContain(seen);
  });
});

describe("the matcher, falsified on fixtures", () => {
  const SERVER = new Set(["lib/acts"]);
  const run = (body: string, imports = "") =>
    untrackedActionCalls(
      [
        {
          rel: "components/staff/X.tsx",
          text: `import { act } from "@/lib/acts";\n${imports}\n${body}`,
        },
      ],
      SERVER,
    ).untracked.map((u) => u.callee);
  const BW = `import { track, boundWrite } from "@/lib/bounded-write";\nimport { raceTimeout } from "@/lib/staff-outage";`;

  it("a raw await, a .then and a void are untracked", () => {
    expect(run(`async function f() { await act(); }`, BW)).toEqual(["act"]);
    expect(run(`function f() { void act().then(() => 1); }`, BW)).toEqual(["act"]);
  });

  it("a wrapper only in a comment does not count", () => {
    expect(run(`async function f() { await act(); // track(act())\n }`, BW)).toEqual(["act"]);
  });

  it("a wrapped call elsewhere never excuses a raw one", () => {
    expect(run(`async function f() { await track(act()); await act(); }`, BW)).toEqual(["act"]);
  });

  it("a local function that merely shares the name is not the ledger", () => {
    expect(
      run(`function track<T>(p: T) { return p; }\nasync function f() { await track(act()); }`),
    ).toEqual(["act"]);
  });

  it("the raw's const handed to a wrapper only in a dead branch does not count", () => {
    expect(
      run(`async function f() { const raw = act(); if (false) track(raw); await raw; }`, BW),
    ).toEqual(["act"]);
    expect(
      run(`async function f() { const raw = act(); false && track(raw); await raw; }`, BW),
    ).toEqual(["act"]);
    expect(
      run(`async function f() { const raw = act(); true ? 0 : track(raw); await raw; }`, BW),
    ).toEqual(["act"]);
  });

  it("a .watch without a poll gate import is not the ledger", () => {
    expect(run(`function f(g: { watch(p: unknown): void }) { g.watch(act()); }`)).toEqual(["act"]);
  });

  it("the tracked shapes pass: direct, aliased, raced, const, conditional, returned, local wrapper, gate", () => {
    expect(run(`async function f() { await track(act()); await boundWrite(act()); }`, BW)).toEqual(
      [],
    );
    expect(
      run(
        `async function f() { await t(act(), "read"); }`,
        `import { track as t } from "@/lib/bounded-write";`,
      ),
    ).toEqual([]);
    expect(run(`async function f() { await raceTimeout(act(), "write"); }`, BW)).toEqual([]);
    expect(run(`async function f() { const raw = act(); await boundWrite(raw); }`, BW)).toEqual([]);
    expect(
      run(
        `async function f(c: boolean) { const r = c ? act() : null; if (r) await raceTimeout(r, "read"); }`,
        BW,
      ),
    ).toEqual([]);
    expect(
      run(
        `function g() { const raw = act(); return raw; }\nasync function f() { await boundWrite(g()); }`,
        BW,
      ),
    ).toEqual([]);
    expect(
      run(
        `async function w<T>(raw: Promise<T>) { await boundWrite(raw); }\nasync function f() { await w(act()); }`,
        BW,
      ),
    ).toEqual([]);
    expect(
      run(
        `function f(gate: { watch(p: unknown): void }) { gate.watch(act()); }`,
        `import { createPollGate } from "@/lib/poll-gate";`,
      ),
    ).toEqual([]);
  });

  it("a function returning the raw passes ONLY if its own calls are tracked", () => {
    expect(
      run(`function g() { const raw = act(); return raw; }\nasync function f() { await g(); }`, BW),
    ).toEqual(["g"]);
  });

  it("a type-only import is not an action", () => {
    expect(
      untrackedActionCalls(
        [{ rel: "components/staff/X.tsx", text: `import type { act } from "@/lib/acts";\nact();` }],
        SERVER,
      ).untracked,
    ).toEqual([]);
  });

  describe("blind review (money M3) — a READ may only wrap an action on the READS allowlist", () => {
    const misread = (body: string, imports = BW, allowed: string[] = []) =>
      untrackedActionCalls(
        [
          {
            rel: "components/staff/X.tsx",
            text: `import { act } from "@/lib/acts";\n${imports}\n${body}`,
          },
        ],
        SERVER,
        new Set(allowed),
      ).misread.map((u) => u.callee);
    const BR = `${BW}\nimport { boundRead } from "@/lib/bounded-write";`;

    it("each way of labelling a write a read is caught", () => {
      expect(misread(`async function f() { await track(act(), "read"); }`)).toEqual(["act"]);
      expect(misread(`async function f() { await boundRead(act()); }`, BR)).toEqual(["act"]);
      expect(misread(`async function f() { await raceTimeout(act(), "read"); }`)).toEqual(["act"]);
      expect(misread(`async function f() { await raceTimeout(act(), "read", 5000); }`)).toEqual([
        "act",
      ]);
      // A const handed to a read.
      expect(
        misread(`async function f() { const raw = act(); await boundRead(raw); }`, BR),
      ).toEqual(["act"]);
      // A local wrapper whose inner wrapper is a read.
      expect(
        misread(
          `async function w<T>(raw: Promise<T>) { await track(raw, "read"); }\nasync function f() { await w(act()); }`,
        ),
      ).toEqual(["act"]);
      // A poll gate's watch tracks its raw as a read.
      expect(
        misread(
          `function f(gate: { watch(p: unknown): void }) { gate.watch(act()); }`,
          `import { createPollGate } from "@/lib/poll-gate";`,
        ),
      ).toEqual(["act"]);
      // A function returning the raw, whose own call is read.
      expect(
        misread(
          `function g() { const raw = act(); return raw; }\nasync function f() { await boundRead(g()); }`,
          BR,
        ),
      ).toEqual(["act"]);
      // An aliased wrapper, and a kind no parse can read (a variable).
      expect(
        misread(
          `async function f() { await t(act(), "read"); }`,
          `import { track as t } from "@/lib/bounded-write";`,
        ),
      ).toEqual(["act"]);
      expect(misread(`async function f(k: "read" | "write") { await track(act(), k); }`)).toEqual([
        "act",
      ]);
      expect(misread(`async function f() { await raceTimeout(act()); }`)).toEqual(["act"]);
    });

    it("a write passes, and an allowlisted read passes — by its EXPORTED name, through an alias", () => {
      expect(
        misread(`async function f() { await track(act()); await track(act(), "write"); }`),
      ).toEqual([]);
      expect(misread(`async function f() { await boundWrite(act()); }`)).toEqual([]);
      expect(misread(`async function f() { await raceTimeout(act(), "write"); }`)).toEqual([]);
      expect(misread(`async function f() { await track(act(), "read"); }`, BW, ["act"])).toEqual(
        [],
      );
      expect(
        untrackedActionCalls(
          [
            {
              rel: "components/staff/X.tsx",
              text: `import { act as other } from "@/lib/acts";\n${BW}\nasync function f() { await track(other(), "read"); }`,
            },
          ],
          SERVER,
          new Set(["act"]),
        ).misread,
      ).toEqual([]);
    });
  });

  it("blind review (money M4) — a namespace or default import of a server module is refused", () => {
    const refused = (imp: string) =>
      untrackedActionCalls(
        [{ rel: "components/staff/X.tsx", text: `${imp}\nasync function f() {}` }],
        SERVER,
      ).refusedImports;
    expect(refused(`import * as acts from "@/lib/acts";`)).toEqual([
      "components/staff/X.tsx:@/lib/acts",
    ]);
    expect(refused(`import acts from "@/lib/acts";`)).toEqual([
      "components/staff/X.tsx:@/lib/acts",
    ]);
    expect(refused(`import acts, { act } from "@/lib/acts";`)).toEqual([
      "components/staff/X.tsx:@/lib/acts",
    ]);
    expect(refused(`import { act } from "@/lib/acts";`)).toEqual([]);
    expect(refused(`import type * as acts from "@/lib/acts";`)).toEqual([]);
    expect(refused(`import * as other from "@/lib/not-server";`)).toEqual([]);
  });

  it("detects a 'use server' module by its directive, not by a comment", () => {
    expect(isUseServer(`"use server";\nexport async function a() {}`)).toBe(true);
    expect(isUseServer(`// "use server";\nexport async function a() {}`)).toBe(false);
    expect(isUseServer(`import "x";\n"use server";`)).toBe(false);
  });
});
