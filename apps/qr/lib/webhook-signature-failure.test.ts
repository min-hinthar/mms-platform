import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  classifyRejection,
  describeUnverifiedEvent,
  signatureTimestamp,
} from "./webhook-signature-failure";

/**
 * M160(a). Two subjects, and the second is the one that matters:
 *
 *  1. the pure log-shaping halves, falsified by value;
 *  2. that BOTH of the route's reject-before-trust branches actually log and count.
 *
 * (2) is parsed, never grepped: a substring search for "console.error" in this route is satisfied by
 * any of its other call sites (measured, not guessed — see the count assertion below), by a comment,
 * or by a dead branch.
 *
 * ⚠️ The first draft of this file was REJECTED by a blind audit for four reasons, all of which are
 * now assertions rather than intentions, because each was text that satisfied the matcher without
 * shipping the behaviour:
 *   - the no-leak walk returned on any CallExpression, so `String(sig)` and `JSON.stringify(body)`
 *     sailed through the very check the changelog cited as proof the invariant held;
 *   - the catch was located by POSITION (last `constructEvent` try wins), so a decoy try/catch added
 *     later would rebind every assertion onto it and leave the real branch unguarded;
 *   - nothing bound the log to its CONTENT, so deleting four of the five fields and the whole
 *     counter kept the suite green while the prose describing them became false;
 *   - `expect(offenders).toEqual([])` passed vacuously when there was no logger at all.
 * Every one of those evasions is now its own red-first induction.
 */

const ROUTE = path.join(__dirname, "..", "app", "api", "stripe", "webhook", "route.ts");
const source = ts.createSourceFile(
  ROUTE,
  readFileSync(ROUTE, "utf8"),
  ts.ScriptTarget.Latest,
  true,
);

/** Walk every descendant. `forEachChild` aborts on a truthy return, so the visitor returns void. */
function walk(node: ts.Node, visit: (n: ts.Node) => void) {
  visit(node);
  ts.forEachChild(node, (c) => {
    walk(c, visit);
  });
}

/** Is `node` a call to `console.<method>`? */
function consoleCall(node: ts.Node, method?: string): node is ts.CallExpression {
  if (!ts.isCallExpression(node)) return false;
  const fn = node.expression;
  if (!ts.isPropertyAccessExpression(fn)) return false;
  if (!ts.isIdentifier(fn.expression) || fn.expression.text !== "console") return false;
  return method === undefined || fn.name.text === method;
}

/** Is `node` a call to the bare function `name`? */
function namedCall(node: ts.Node, name: string): node is ts.CallExpression {
  return (
    ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name
  );
}

/**
 * Statements written DIRECTLY in `block` — never nested inside an `if`, a function, a nested
 * try/catch or an `after()` callback.
 *
 * This is the liveness rule, and it is deliberately structural rather than a reachability proof:
 * `if (process.env.NEVER === "1") console.error(…)` and a logger parked inside the analytics
 * flush's own `catch {}` both satisfy "there is a console.error in this block" while logging
 * nothing on the path that actually fires. Requiring the call to be a top-level statement of the
 * rejecting block excludes the whole family at once.
 */
function topLevelCalls(block: ts.Block): ts.CallExpression[] {
  const out: ts.CallExpression[] = [];
  for (const st of block.statements)
    if (ts.isExpressionStatement(st) && ts.isCallExpression(st.expression)) out.push(st.expression);
  return out;
}

/** The property names of the first object-literal argument of `call`. */
function objectArgKeys(call: ts.CallExpression): string[] {
  for (const arg of call.arguments)
    if (ts.isObjectLiteralExpression(arg))
      return arg.properties
        .map((p) => (p.name && ts.isIdentifier(p.name) ? p.name.text : ""))
        .filter(Boolean);
  return [];
}

/**
 * Identifiers named `body` or `sig` reaching a logger, INCLUDING through any call wrapper.
 *
 * Two audited defects, both the same shape — an exemption wider than the fact it encodes:
 *   1. the first version returned on ANY `CallExpression`, so a wrapper hid the leak;
 *   2. the second returned on ANY `PropertyAccessExpression`, which reads as "`body.length` is a
 *      number" but actually exempts `body.slice(0, 100)` — a member read that IS the payload. The
 *      evasion was watched green before this narrowing and red after.
 * So the only exempt member is `length` itself; every other member read descends into its object.
 */
function leakedIdentifiers(call: ts.CallExpression): string[] {
  const found: string[] = [];
  const scan = (n: ts.Node) => {
    if (ts.isIdentifier(n) && (n.text === "body" || n.text === "sig")) {
      found.push(n.text);
      return;
    }
    // `.length` is the ONE member read that cannot carry the payload: it is a number. Every other
    // member read can — `body.slice(0, 100)` is the exact evasion an exemption on the whole node
    // class admits — so descend into the object side rather than skipping the subtree. Element
    // access (`body[0]`) is not a PropertyAccessExpression and is descended into by the walk below.
    if (ts.isPropertyAccessExpression(n)) {
      if (n.name.text === "length") return;
      scan(n.expression);
      return;
    }
    // Passing the raw value INTO a sanitizer is the whole point of having one, so these three are
    // not descended into. The allowlist is deliberately closed and deliberately small: every member
    // is defined in this module and pinned by the value tests above — `signatureTimestamp` is
    // asserted never to return a `v1=` digest under any term order, `describeUnverifiedEvent` is
    // asserted to emit only capped scalars, and `Buffer.byteLength` yields a number. Anything else
    // wrapping `body` or `sig` — `String(sig)`, `JSON.stringify(body)`, a template literal — is
    // descended into and caught, which is the defect this rewrite exists to close.
    if (ts.isCallExpression(n)) {
      const fn = n.expression;
      const name = ts.isIdentifier(fn)
        ? fn.text
        : ts.isPropertyAccessExpression(fn)
          ? fn.name.text
          : "";
      if (
        name === "signatureTimestamp" ||
        name === "describeUnverifiedEvent" ||
        name === "byteLength"
      )
        return;
    }
    ts.forEachChild(n, (c) => {
      scan(c);
    });
  };
  for (const arg of call.arguments) scan(arg);
  return found;
}

/** Every try statement whose try block calls `constructEvent`. */
const signatureTries = (() => {
  const out: ts.TryStatement[] = [];
  walk(source, (node) => {
    if (!ts.isTryStatement(node) || !node.catchClause) return;
    let calls = false;
    walk(node.tryBlock, (inner) => {
      if (
        ts.isCallExpression(inner) &&
        ts.isPropertyAccessExpression(inner.expression) &&
        inner.expression.name.text === "constructEvent"
      )
        calls = true;
    });
    if (calls) out.push(node);
  });
  return out;
})();

/** The `if (!sig) { … }` block that rejects a delivery carrying no signature header. */
const missingHeaderBlock = (() => {
  let found: ts.Block | undefined;
  walk(source, (node) => {
    if (!ts.isIfStatement(node)) return;
    const t = node.expression;
    if (!ts.isPrefixUnaryExpression(t) || t.operator !== ts.SyntaxKind.ExclamationToken) return;
    if (!ts.isIdentifier(t.operand) || t.operand.text !== "sig") return;
    if (ts.isBlock(node.thenStatement)) found = node.thenStatement;
  });
  return found;
})();

describe("describeUnverifiedEvent", () => {
  it("reads the id and type a well-formed payload declares", () => {
    const body = JSON.stringify({ id: "evt_123", type: "payment_intent.succeeded", data: {} });
    expect(describeUnverifiedEvent(body)).toEqual({
      unverifiedId: "evt_123",
      unverifiedType: "payment_intent.succeeded",
    });
  });

  it("answers nulls for a body that is not JSON at all, instead of throwing", () => {
    expect(() => describeUnverifiedEvent("<html>nope")).not.toThrow();
    expect(describeUnverifiedEvent("<html>nope")).toEqual({
      unverifiedId: null,
      unverifiedType: null,
    });
    expect(describeUnverifiedEvent("")).toEqual({ unverifiedId: null, unverifiedType: null });
  });

  it("refuses JSON that is not a plain object — null and arrays both parse fine", () => {
    expect(describeUnverifiedEvent("null")).toEqual({ unverifiedId: null, unverifiedType: null });
    expect(describeUnverifiedEvent('["evt_1"]')).toEqual({
      unverifiedId: null,
      unverifiedType: null,
    });
    expect(describeUnverifiedEvent('"evt_1"')).toEqual({
      unverifiedId: null,
      unverifiedType: null,
    });
    expect(describeUnverifiedEvent("42")).toEqual({ unverifiedId: null, unverifiedType: null });
  });

  it("refuses a non-string id or type rather than coercing it into the log", () => {
    const body = JSON.stringify({ id: { nested: true }, type: ["a", "b"] });
    expect(describeUnverifiedEvent(body)).toEqual({ unverifiedId: null, unverifiedType: null });
    expect(describeUnverifiedEvent(JSON.stringify({ id: 7, type: false }))).toEqual({
      unverifiedId: null,
      unverifiedType: null,
    });
  });

  it("treats a blank or whitespace-only value as absent", () => {
    expect(describeUnverifiedEvent(JSON.stringify({ id: "   ", type: "" }))).toEqual({
      unverifiedId: null,
      unverifiedType: null,
    });
  });

  it("caps an oversized value so one rejected delivery cannot flood the log", () => {
    const long = "x".repeat(500);
    const { unverifiedId } = describeUnverifiedEvent(JSON.stringify({ id: long }));
    expect(unverifiedId).not.toBeNull();
    const echoed = unverifiedId as string;
    expect(echoed.endsWith("…")).toBe(true);
    expect(echoed.length).toBeLessThan(long.length);
    expect(long.startsWith(echoed.slice(0, -1))).toBe(true);
  });

  it("refuses to PARSE an oversized body at all — the log field is not worth the allocation", () => {
    // The route is public and unauthenticated, so a megabyte of nested JSON would otherwise buy a
    // full parse per request to fill a field capped at 80 characters. Falsified by size, from the
    // module's own behaviour: a payload that WOULD have parsed stops being read once it is big.
    const small = JSON.stringify({ id: "evt_1", type: "t" });
    expect(describeUnverifiedEvent(small).unverifiedId).toBe("evt_1");
    const padded = JSON.stringify({ id: "evt_1", type: "t", pad: "x".repeat(200_000) });
    expect(describeUnverifiedEvent(padded)).toEqual({ unverifiedId: null, unverifiedType: null });
  });
});

describe("signatureTimestamp", () => {
  it("takes the t= term from a real Stripe-Signature header", () => {
    expect(signatureTimestamp("t=1788771785,v1=abc123,v0=def456")).toBe("1788771785");
  });

  it("answers null when there is no header or no t= term", () => {
    expect(signatureTimestamp(null)).toBeNull();
    expect(signatureTimestamp("")).toBeNull();
    expect(signatureTimestamp("v1=abc123")).toBeNull();
  });

  it("never mistakes a v1 digest that CONTAINS 't=' for the timestamp", () => {
    expect(signatureTimestamp("v1=deadbeeft=99999999,t=1788771785")).toBe("1788771785");
    expect(signatureTimestamp("v1=deadbeeft=99999999")).toBeNull();
  });

  it("refuses a non-numeric t= rather than echoing it", () => {
    expect(signatureTimestamp("t=not-a-time,v1=abc")).toBeNull();
    expect(signatureTimestamp("t=,v1=abc")).toBeNull();
  });

  it("never returns a v1 digest, whatever the term order", () => {
    const digest = "5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8bd";
    for (const header of [`t=1788771785,v1=${digest}`, `v1=${digest},t=1788771785`])
      expect(signatureTimestamp(header)).not.toContain(digest);
  });

  it("refuses a t= term longer than a timestamp, however numeric", () => {
    // `/^\d+$/` alone accepts any length, and this value is both logged per-request and shipped to
    // a third-party analytics sink — so an unauthenticated caller could pick the size of a log
    // field. A real Unix second-timestamp is ten digits; twelve is the bound.
    expect(signatureTimestamp(`t=${"9".repeat(12)},v1=abc`)).toBe("9".repeat(12));
    expect(signatureTimestamp(`t=${"9".repeat(13)},v1=abc`)).toBeNull();
    expect(signatureTimestamp(`t=${"1".repeat(100_000)}`)).toBeNull();
  });
});

describe("classifyRejection", () => {
  it("maps the SDK's real messages to stable tokens", () => {
    // The strings are the SDK's own, read from stripe/cjs/Webhooks.js validateComputedSignature.
    expect(
      classifyRejection(
        "No signatures found matching the expected signature for payload. Are you passing the raw request body you received from Stripe?",
      ),
    ).toBe("no_signature_match");
    expect(classifyRejection("Timestamp outside the tolerance zone")).toBe(
      "timestamp_outside_tolerance",
    );
    expect(classifyRejection("No signatures found with expected scheme")).toBe("no_scheme_match");
  });

  it("NEVER passes the raw message through — the whitespace note is a fact about our own secret", () => {
    // The SDK appends this when the CONFIGURED secret has stray characters. It must reach our log
    // and stop there; a classifier that falls back to the input would carry it to a third party.
    const withNote =
      "No signatures found matching the expected signature for payload.\n\nNote: The provided signing secret contains whitespace. This often indicates an extra newline or space is in the value";
    const token = classifyRejection(withNote);
    expect(token).toBe("no_signature_match");
    expect(token).not.toContain("whitespace");
    expect(token).not.toContain("signing secret");
    // And an unrecognised message collapses rather than leaking.
    const unknown = "Some future SDK message naming the signing secret verbatim";
    expect(classifyRejection(unknown)).toBe("other");
    expect(classifyRejection(unknown)).not.toContain("signing secret");
  });
});

describe("the route's reject-before-trust branches", () => {
  it("there is EXACTLY ONE try/catch around constructEvent — ambiguity is refused, not resolved", () => {
    // Uniqueness, not position. The audited defect was `found = node.catchClause` with no check:
    // a decoy `try { x.constructEvent(a,b,c) } catch { console.error("noop") }` added anywhere below
    // would capture every assertion in this file and leave the real branch free to log body and sig.
    expect(signatureTries).toHaveLength(1);
  });

  it("the signature catch logs with console.error as a TOP-LEVEL statement", () => {
    const block = signatureTries[0]!.catchClause!.block;
    const errors = topLevelCalls(block).filter((c) => consoleCall(c, "error"));
    // Non-vacuous by construction: this fails when the call is absent AND when it has been parked
    // inside an `if`, a nested catch, or the analytics flush's own callback.
    expect(errors).toHaveLength(1);
  });

  it("the signature log carries every field the docs claim it does", () => {
    // Binds the assertion to CONTENT. Without this, deleting four of the five fields keeps the
    // suite green while the changelog describing them becomes false.
    const block = signatureTries[0]!.catchClause!.block;
    const call = topLevelCalls(block).find((c) => consoleCall(c, "error"))!;
    expect(objectArgKeys(call).sort()).toEqual(
      [
        "bodyBytes",
        "reason",
        "signatureTimestamp",
        "stage",
        "unverifiedEventId",
        "unverifiedEventType",
      ].sort(),
    );
  });

  it("the signature catch also COUNTS the rejection, at the top level", () => {
    const block = signatureTries[0]!.catchClause!.block;
    expect(topLevelCalls(block).filter((c) => namedCall(c, "recordRejection"))).toHaveLength(1);
  });

  it("the missing-header branch logs and counts too — it rejects on the same path", () => {
    // Blind-pass CRITICAL 2: this branch answers 400 identically and was silent, while the prose
    // claimed the signature catch was the only such branch.
    expect(missingHeaderBlock).toBeDefined();
    const calls = topLevelCalls(missingHeaderBlock!);
    expect(calls.filter((c) => consoleCall(c, "error"))).toHaveLength(1);
    expect(calls.filter((c) => namedCall(c, "recordRejection"))).toHaveLength(1);
  });

  it("no logger anywhere in the route receives the raw body or the whole signature header", () => {
    // Now descends THROUGH call wrappers: `String(sig)`, `JSON.stringify(body)` and
    // `` `${body}` `` are all caught, which the audited version was not.
    const offenders: string[] = [];
    walk(source, (node) => {
      if (consoleCall(node)) offenders.push(...leakedIdentifiers(node));
      if (namedCall(node, "recordRejection")) offenders.push(...leakedIdentifiers(node));
    });
    expect(offenders).toEqual([]);
  });

  it("the byte count is BYTES, not UTF-16 code units", () => {
    // `.length` under-reports a Burmese payload by up to ~3× on a bilingual app, and an operator
    // diffing that against Stripe's payload size would read the gap as a body rewritten in transit.
    const block = signatureTries[0]!.catchClause!.block;
    let usesByteLength = false;
    walk(block, (n) => {
      if (
        ts.isCallExpression(n) &&
        ts.isPropertyAccessExpression(n.expression) &&
        n.expression.name.text === "byteLength"
      )
        usesByteLength = true;
    });
    expect(usesByteLength).toBe(true);
  });

  it("the 400 response body does not echo the SDK message to an anonymous caller", () => {
    // The message can carry the note about OUR signing secret containing whitespace, and this route
    // is public. The full reason stays in the log; Stripe only ever reads the status code.
    const block = signatureTries[0]!.catchClause!.block;
    let echoesReason = false;
    for (const st of block.statements) {
      if (!ts.isReturnStatement(st) || !st.expression) continue;
      walk(st.expression, (n) => {
        if (ts.isIdentifier(n) && n.text === "reason") echoesReason = true;
      });
    }
    expect(echoesReason).toBe(false);
  });
});

/**
 * The matcher gets the red-first treatment too. `leakedIdentifiers` is the only thing standing
 * between an attacker-controlled payload and a log line, and it has now been widened-by-accident
 * twice — once on `CallExpression`, once on `PropertyAccessExpression`. Both times the route's own
 * suite stayed green, because the route does not contain the evasion; only a synthetic source can
 * ask the question. So each known evasion is pinned here against text the matcher must reject, and
 * each legitimate sanitizer against text it must accept.
 */
describe("leakedIdentifiers — the matcher's own falsification", () => {
  const scanSnippet = (code: string): string[] => {
    const file = ts.createSourceFile("snippet.ts", code, ts.ScriptTarget.Latest, true);
    const out: string[] = [];
    walk(file, (n) => {
      if (consoleCall(n)) out.push(...leakedIdentifiers(n));
    });
    return out;
  };

  it.each([
    // The evasion Codex found on this PR: the same key set as the shipped log, so the field-set
    // assertion cannot see it, and a member read the old blanket exemption waved through.
    ["body.slice", 'console.error("x", { bodyBytes: body.slice(0, 100) });'],
    ["sig.substring", 'console.error("x", { t: sig.substring(0, 40) });'],
    ["sig.split", 'console.error("x", { t: sig.split(",")[0] });'],
    // Element access is not a property access; it must not fall through either.
    ["body[0]", 'console.error("x", { first: body[0] });'],
    // The CallExpression evasions from the earlier round, kept so a revert cannot pass.
    ["JSON.stringify(body)", 'console.error("x", { b: JSON.stringify(body) });'],
    ["String(sig)", 'console.error("x", { s: String(sig) });'],
    ["a template literal", "console.error(`x ${body}`);"],
    // A sanitizer in the same call must not launder a different argument.
    [
      "a sanitizer beside a leak",
      'console.error("x", { t: signatureTimestamp(sig), leak: body });',
    ],
  ])("rejects %s", (_label, code) => {
    expect(scanSnippet(code).length).toBeGreaterThan(0);
  });

  it.each([
    ["signatureTimestamp(sig)", 'console.error("x", { t: signatureTimestamp(sig) });'],
    ["describeUnverifiedEvent(body)", 'console.error("x", { e: describeUnverifiedEvent(body) });'],
    ["Buffer.byteLength(body)", 'console.error("x", { n: Buffer.byteLength(body, "utf8") });'],
    // `.length` is a number, and is the ONE member read the narrowed exemption keeps.
    ["body.length", 'console.error("x", { n: body.length });'],
  ])("accepts %s", (_label, code) => {
    expect(scanSnippet(code)).toEqual([]);
  });
});
