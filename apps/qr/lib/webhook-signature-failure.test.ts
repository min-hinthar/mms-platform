import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { describeUnverifiedEvent, signatureTimestamp } from "./webhook-signature-failure";

/**
 * M160(a). Two subjects, and the second is the one that matters:
 *
 *  1. the pure log-shaping halves, falsified by value;
 *  2. that the route's signature-failure branch ACTUALLY logs — the regression that produced C18.
 *
 * (2) is parsed, never grepped: a substring search for "console.error" in a 1000-line route is
 * satisfied by any of its twenty other call sites, by a comment, or by a dead branch. The assertion
 * has to be "the catch that wraps constructEvent contains a live console.error call", which is a
 * question about the AST. Falsified red-first by deleting the call from the catch and watching only
 * this test go red.
 */

describe("describeUnverifiedEvent", () => {
  it("reads the id and type a well-formed payload declares", () => {
    const body = JSON.stringify({ id: "evt_123", type: "payment_intent.succeeded", data: {} });
    expect(describeUnverifiedEvent(body)).toEqual({
      unverifiedId: "evt_123",
      unverifiedType: "payment_intent.succeeded",
    });
  });

  it("answers nulls for a body that is not JSON at all, instead of throwing", () => {
    // The rejected body is attacker-controlled: a parse error here would lose the whole log line,
    // which is precisely the outcome this module exists to prevent.
    expect(() => describeUnverifiedEvent("<html>nope")).not.toThrow();
    expect(describeUnverifiedEvent("<html>nope")).toEqual({
      unverifiedId: null,
      unverifiedType: null,
    });
    expect(describeUnverifiedEvent("")).toEqual({ unverifiedId: null, unverifiedType: null });
  });

  it("refuses JSON that is not a plain object — null and arrays both parse fine", () => {
    // `typeof null === "object"` and an array indexes numerically, so both would slip past a bare
    // typeof check and then throw or read undefined on property access.
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
    // A coerced `{}` would log "[object Object]"; a coerced array would log its joined members.
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
    // Computed from the module's own cap, never transcribed: the echo is the cap plus one ellipsis.
    const long = "x".repeat(500);
    const { unverifiedId } = describeUnverifiedEvent(JSON.stringify({ id: long }));
    expect(unverifiedId).not.toBeNull();
    const echoed = unverifiedId as string;
    expect(echoed.endsWith("…")).toBe(true);
    expect(echoed.length).toBeLessThan(long.length);
    // And the kept prefix is a real prefix of the input, not a summary of it.
    expect(long.startsWith(echoed.slice(0, -1))).toBe(true);
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
    // The anchoring case. A digest is hex in practice, but the header is attacker-supplied on the
    // path this module serves, so an unanchored /t=(\d+)/ scan is a live confusion: it would report
    // a digest's interior as the delivery's issued-at and send a reader hunting the wrong window.
    expect(signatureTimestamp("v1=deadbeeft=99999999,t=1788771785")).toBe("1788771785");
    expect(signatureTimestamp("v1=deadbeeft=99999999")).toBeNull();
  });

  it("refuses a non-numeric t= rather than echoing it", () => {
    expect(signatureTimestamp("t=not-a-time,v1=abc")).toBeNull();
    expect(signatureTimestamp("t=,v1=abc")).toBeNull();
  });

  it("never returns a v1 digest, whatever the term order", () => {
    // The secret-adjacent value must not reach a log through this function under any input.
    const digest = "5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8bd";
    for (const header of [`t=1788771785,v1=${digest}`, `v1=${digest},t=1788771785`])
      expect(signatureTimestamp(header)).not.toContain(digest);
  });
});

describe("the webhook route's signature-failure branch", () => {
  const routePath = path.join(__dirname, "..", "app", "api", "stripe", "webhook", "route.ts");
  const source = ts.createSourceFile(
    routePath,
    readFileSync(routePath, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );

  /** The catch clause of the try whose block calls `constructEvent` — located, not guessed. */
  const signatureCatch = (() => {
    let found: ts.CatchClause | undefined;
    const visit = (node: ts.Node) => {
      if (ts.isTryStatement(node) && node.catchClause) {
        let callsConstructEvent = false;
        const scanTry = (inner: ts.Node) => {
          if (
            ts.isCallExpression(inner) &&
            ts.isPropertyAccessExpression(inner.expression) &&
            inner.expression.name.text === "constructEvent"
          )
            callsConstructEvent = true;
          ts.forEachChild(inner, (c) => {
            scanTry(c);
          });
        };
        scanTry(node.tryBlock);
        if (callsConstructEvent) found = node.catchClause;
      }
      ts.forEachChild(node, (c) => {
        visit(c);
      });
    };
    visit(source);
    return found;
  })();

  it("exists — the route still verifies the signature inside a try/catch", () => {
    expect(signatureCatch).toBeDefined();
  });

  it("logs the rejection with console.error", () => {
    // The C18 regression in one assertion. Comments and the route's twenty other console.error
    // calls are invisible here: this walks the catch BLOCK's own AST for a live call expression.
    const calls: string[] = [];
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === "console"
      )
        calls.push(node.expression.name.text);
      ts.forEachChild(node, (c) => {
        visit(c);
      });
    };
    visit(signatureCatch!.block);
    expect(calls).toContain("error");
  });

  it("never logs the raw body or the whole signature header", () => {
    // Two credentials-adjacent values sit in scope at that point. `body` is the unverified payload
    // (PII, and the plaintext half of the HMAC); `sig` carries the v1 digests. Either one passed
    // whole to the logger is a finding, so the identifiers may appear only inside a call — the
    // permitted uses are `body.length` and `signatureTimestamp(sig)`.
    const offenders: string[] = [];
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === "console"
      )
        for (const arg of node.arguments) {
          const bare = (n: ts.Node) => {
            if (ts.isIdentifier(n) && (n.text === "body" || n.text === "sig"))
              offenders.push(n.text);
            // A property access (body.length) or a call argument is fine; only the bare binding
            // reaching the logger is the defect, so do not descend into those shapes.
            if (ts.isPropertyAccessExpression(n) || ts.isCallExpression(n)) return;
            ts.forEachChild(n, (c) => {
              bare(c);
            });
          };
          bare(arg);
        }
      ts.forEachChild(node, (c) => {
        visit(c);
      });
    };
    visit(signatureCatch!.block);
    expect(offenders).toEqual([]);
  });
});
