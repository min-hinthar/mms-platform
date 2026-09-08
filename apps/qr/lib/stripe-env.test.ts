import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  keyMode,
  missingEnvMessage,
  modeDisagreement,
  pickEnv,
  publishableKeyCandidates,
  webhookCandidatesForMode,
  webhookSecretDiagnostic,
  type EnvCandidate,
} from "./stripe-env";

/**
 * Two subjects. The values are falsifiable directly; the LITERAL READS are not, because
 * `process.env.NEXT_PUBLIC_*` is substituted at build time and a test process cannot re-run that
 * substitution. So the second half parses the three call sites and asserts each still spells out
 * every candidate name — the failure mode being silent in exactly the environment that has the
 * variable under the dropped name.
 */

describe("pickEnv", () => {
  it("takes the first candidate that holds something", () => {
    const got = pickEnv([
      ["A", undefined],
      ["B", "second"],
      ["C", "third"],
    ]);
    expect(got).toEqual({ name: "B", value: "second" });
  });

  it("returns the NAME that won, not just the value", () => {
    // The whole point of the resolver: a diagnostic that says which variable was actually used.
    expect(pickEnv([["STRIPE_SECRET_KEY_TEST", "sk_test_x"]])?.name).toBe("STRIPE_SECRET_KEY_TEST");
  });

  it("skips empty and whitespace-only values rather than treating them as set", () => {
    // A Vercel variable created and left blank is 'present' to `process.env` and useless to Stripe.
    expect(
      pickEnv([
        ["A", ""],
        ["B", "   "],
        ["C", "\n\t"],
        ["D", "real"],
      ]),
    ).toEqual({ name: "D", value: "real" });
  });

  it("trims the winner — a pasted newline must not reject every webhook delivery", () => {
    // Stripe's SDK appends "the provided signing secret contains whitespace" to the verification
    // failure, which is a fact about OUR secret surfacing as a signature error on every event.
    expect(pickEnv([["STRIPE_WEBHOOK_SECRET", "  whsec_abc\n"]])).toEqual({
      name: "STRIPE_WEBHOOK_SECRET",
      value: "whsec_abc",
    });
  });

  it("answers null when nothing is set", () => {
    expect(
      pickEnv([
        ["A", undefined],
        ["B", ""],
      ]),
    ).toBeNull();
  });

  it("ignores a non-string value instead of coercing it", () => {
    expect(pickEnv([["A", 42 as unknown as string]])).toBeNull();
  });
});

describe("publishableKeyCandidates", () => {
  it("puts _TEST FIRST — the order decides which mode the deployment runs in", () => {
    // Not merely "all three names are read": WHICH one wins is the whole behaviour. With the order
    // reversed, a Production environment holding both a test and a live publishable key would mount
    // the live card form against a test secret key — caught by `modeDisagreement`, but only after
    // someone has already been shown a live Stripe form.
    expect(publishableKeyCandidates().map(([name]) => name)).toEqual([
      "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST",
      "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
      "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_Production",
    ]);
  });

  it("spells _Production with the capital P the dashboard uses", () => {
    // Env var names are case-sensitive; a helpfully-guessed _PRODUCTION resolves to nothing while
    // reading correctly to a human.
    const names = publishableKeyCandidates().map(([name]) => name);
    expect(names).toContain("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_Production");
    expect(names).not.toContain("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_PRODUCTION");
  });
});

describe("keyMode", () => {
  it.each([
    ["sk_test_51abc", "test"],
    ["pk_test_51abc", "test"],
    ["rk_test_51abc", "test"],
    ["sk_live_51abc", "live"],
    ["pk_live_51abc", "live"],
    ["  pk_live_51abc  ", "live"],
  ])("reads %s as %s", (key, mode) => {
    expect(keyMode(key)).toBe(mode);
  });

  it.each([[undefined], [null], [""], ["whsec_abc"], ["sk_"], ["nonsense"], ["sk_testing_x"]])(
    "answers unknown for %s",
    (key) => {
      expect(keyMode(key as string | null | undefined)).toBe("unknown");
    },
  );

  it("does not read a signing secret as either mode — it carries no marker", () => {
    // The reason the agreement check compares the two KEYS and never the webhook secret.
    expect(keyMode("whsec_test_abc")).toBe("unknown");
  });
});

describe("modeDisagreement", () => {
  it("refuses a LIVE secret beside a TEST publishable — C18 with real money", () => {
    const msg = modeDisagreement("sk_live_1", "pk_test_1");
    expect(msg).toBeTruthy();
    expect(msg).toContain("live");
    expect(msg).toContain("test");
  });

  it("refuses the reverse pairing too", () => {
    expect(modeDisagreement("sk_test_1", "pk_live_1")).toBeTruthy();
  });

  it.each([
    ["sk_test_1", "pk_test_1"],
    ["sk_live_1", "pk_live_1"],
  ])("permits a matched pair (%s, %s)", (secret, publishable) => {
    expect(modeDisagreement(secret, publishable)).toBeNull();
  });

  it("stays silent when either key carries no marker — absence of evidence", () => {
    // A future key format or a test mock must not take checkout down; the pairing this guards
    // against always has both markers.
    expect(modeDisagreement("sk_live_1", undefined)).toBeNull();
    expect(modeDisagreement("sk_live_1", "")).toBeNull();
    expect(modeDisagreement("mock-key", "pk_live_1")).toBeNull();
  });
});

describe("webhookCandidatesForMode", () => {
  // The exact shape of the P1: the live cutover removed the two `_TEST` KEY variables and left the
  // webhook's behind.
  const CUTOVER_LEFTOVER: EnvCandidate[] = [
    ["STRIPE_WEBHOOK_SECRET_TEST", "whsec_test_leftover"],
    ["STRIPE_WEBHOOK_SECRET", "whsec_live_real"],
  ];

  it("in LIVE mode ignores a leftover _TEST signing secret entirely", () => {
    // Without this the route picks whsec_test_leftover while getStripe() sees an agreeing live
    // pair and raises nothing: real cards captured, every delivery failing constructEvent, no
    // orders. `modeDisagreement` cannot see it — a whsec_ carries no mode marker.
    const picked = pickEnv(webhookCandidatesForMode("live", CUTOVER_LEFTOVER));
    expect(picked).toEqual({ name: "STRIPE_WEBHOOK_SECRET", value: "whsec_live_real" });
  });

  it("in LIVE mode with ONLY the _TEST name set, resolves nothing rather than using it", () => {
    // Fail-closed: the route answers 500 "not configured". An outage beats capturing money whose
    // fulfilment can never be verified. `webhookSecretDiagnostic` is what makes that 500 legible —
    // it names both names AND flags the ignored one as SET; see its own describe block.
    const onlyTest: EnvCandidate[] = [
      ["STRIPE_WEBHOOK_SECRET_TEST", "whsec_test_leftover"],
      ["STRIPE_WEBHOOK_SECRET", undefined],
    ];
    expect(pickEnv(webhookCandidatesForMode("live", onlyTest))).toBeNull();
  });

  it.each(["test", "unknown"] as const)("in %s mode keeps both, _TEST first", (mode) => {
    // The BASE name legitimately holds a test secret in local dev, in .env.example, and in every
    // deployment predating the rename. Dropping it would break working setups to guard a hazard
    // that does not exist outside live mode.
    expect(webhookCandidatesForMode(mode, CUTOVER_LEFTOVER).map(([n]) => n)).toEqual([
      "STRIPE_WEBHOOK_SECRET_TEST",
      "STRIPE_WEBHOOK_SECRET",
    ]);
  });

  it("filters by the _TEST SUFFIX, so a base name merely containing the word survives", () => {
    const odd: EnvCandidate[] = [
      ["STRIPE_WEBHOOK_SECRET_TESTING", "whsec_a"],
      ["STRIPE_WEBHOOK_SECRET", "whsec_b"],
    ];
    expect(webhookCandidatesForMode("live", odd).map(([n]) => n)).toEqual([
      "STRIPE_WEBHOOK_SECRET_TESTING",
      "STRIPE_WEBHOOK_SECRET",
    ]);
  });
});

describe("missingEnvMessage", () => {
  it("names every place it looked, not just the first", () => {
    // "STRIPE_SECRET_KEY is not set" sends an operator to check the one name they just moved away
    // from — the exact failure this whole module exists to stop repeating.
    const candidates: EnvCandidate[] = [
      ["STRIPE_SECRET_KEY_TEST", undefined],
      ["STRIPE_SECRET_KEY", undefined],
    ];
    const msg = missingEnvMessage("Stripe secret key", candidates);
    expect(msg).toContain("STRIPE_SECRET_KEY_TEST");
    expect(msg).toContain("STRIPE_SECRET_KEY");
    expect(msg).toContain("Stripe secret key");
  });
});

describe("webhookSecretDiagnostic", () => {
  // Exactly the live cutover: the `_TEST` API keys are gone, the `_TEST` signing secret was left
  // behind, and the base name was never populated.
  const LIVE_CUTOVER: EnvCandidate[] = [
    ["STRIPE_WEBHOOK_SECRET_TEST", "whsec_test_leftover"],
    ["STRIPE_WEBHOOK_SECRET", undefined],
  ];

  it("in LIVE mode names the ignored _TEST variable and reports that it is SET", () => {
    // The whole point. Diagnosing from the FILTERED list yields "Looked for: STRIPE_WEBHOOK_SECRET"
    // and never mentions the populated leftover — the operator hunts for a variable they already
    // set, under a name the filter deliberately refused, while the webhook stays down.
    const msg = webhookSecretDiagnostic("live", LIVE_CUTOVER);
    expect(msg).toContain("STRIPE_WEBHOOK_SECRET_TEST");
    expect(msg).toContain("STRIPE_WEBHOOK_SECRET");
    expect(msg).toMatch(/STRIPE_WEBHOOK_SECRET_TEST \(SET\)/);
  });

  it("never puts the secret VALUE in the message", () => {
    // This string goes to a log. Set-ness is the diagnostic; the secret itself is a credential.
    const msg = webhookSecretDiagnostic("live", LIVE_CUTOVER);
    expect(msg).not.toContain("whsec_test_leftover");
    expect(msg).not.toContain("whsec_");
  });

  it("reports a whitespace-only leftover as not set, matching pickEnv's trim rule", () => {
    // Two answers to "is it set?" would send the operator hunting for a variable selection already
    // considers empty.
    const msg = webhookSecretDiagnostic("live", [
      ["STRIPE_WEBHOOK_SECRET_TEST", "   "],
      ["STRIPE_WEBHOOK_SECRET", undefined],
    ]);
    expect(msg).toMatch(/STRIPE_WEBHOOK_SECRET_TEST \(not set\)/);
  });

  it.each(["test", "unknown"] as const)(
    "in %s mode nothing is dropped, so it stays the plain message",
    (mode) => {
      // No candidate was ignored, so there is nothing to explain — an "Ignored because" clause here
      // would describe a filter that did not run.
      const msg = webhookSecretDiagnostic(mode, LIVE_CUTOVER);
      expect(msg).toContain("STRIPE_WEBHOOK_SECRET_TEST");
      expect(msg).not.toContain("Ignored because");
    },
  );
});

/**
 * The route's POST body, so a guard cannot be satisfied by a call sitting in a comment-adjacent
 * helper or a future second function in the same file.
 */
function postFn(src: ts.SourceFile): ts.FunctionDeclaration {
  let fn: ts.FunctionDeclaration | undefined;
  walk(src, (n) => {
    if (ts.isFunctionDeclaration(n) && n.name?.text === "POST") fn = n;
  });
  if (!fn) throw new Error("POST not found in webhook route");
  return fn;
}

/**
 * The name of the function call an argument ultimately comes from, following ONE level of
 * `const x = f()` binding inside `fn`.
 *
 * Resolving the binding rather than demanding an inline call is the point: the route names its
 * intermediates (CLAUDE.md's "name it ONCE" rule — `stripeMode` is read twice, and re-deriving it
 * at the second call site is exactly the drift that rule exists to stop). A guard that accepted
 * only inline calls would force the route to re-derive, so it would be a scan wearing a dataflow
 * check's clothes.
 */
function originCall(fn: ts.Node, arg: ts.Node | undefined): string | null {
  if (!arg) return null;
  if (ts.isCallExpression(arg) && ts.isIdentifier(arg.expression)) return arg.expression.text;
  if (!ts.isIdentifier(arg)) return null;
  const name = arg.text;
  let found: string | null = null;
  let rebound = false;
  walk(fn, (n) => {
    // Codex round 3 on #274: an initializer is only evidence if the binding cannot change after it.
    // `let x = webhookCandidatesForMode(...); x = secretCandidates; pickEnv(x)` would otherwise
    // report `webhookCandidatesForMode` while the RAW list is what reaches the call — the guard
    // green and the P1 back. So: `const` only, and any write to the name anywhere in the function
    // invalidates the answer outright.
    if (
      ts.isBinaryExpression(n) &&
      n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      n.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
      ts.isIdentifier(n.left) &&
      n.left.text === name
    )
      rebound = true;
    if (!ts.isVariableDeclaration(n) || !ts.isIdentifier(n.name) || n.name.text !== name) return;
    if (!(ts.getCombinedNodeFlags(n) & ts.NodeFlags.Const)) return;
    const init = n.initializer;
    if (init && ts.isCallExpression(init) && ts.isIdentifier(init.expression))
      found = init.expression.text;
  });
  return rebound ? null : found;
}

/** Walk every descendant. `forEachChild` aborts on a truthy return, so the visitor returns void. */
function walk(node: ts.Node, visit: (n: ts.Node) => void) {
  visit(node);
  ts.forEachChild(node, (c) => {
    walk(c, visit);
  });
}

const parse = (rel: string) => {
  const abs = path.join(__dirname, "..", rel);
  return ts.createSourceFile(abs, readFileSync(abs, "utf8"), ts.ScriptTarget.Latest, true);
};

/**
 * Every `process.env.NAME` read in `file`, as the literal property names.
 *
 * PARSED, not grepped, and specifically as a PropertyAccessExpression whose object is `process.env`:
 * the property name of a live member access is the exact thing Next.js substitutes at build time, so
 * this asserts the shape that actually works. A name appearing only in a comment, a string literal,
 * or a computed `process.env[name]` lookup is correctly NOT counted — the computed form is the
 * plausible-looking rewrite that silently resolves to undefined in the browser.
 */
function envReads(file: ts.SourceFile): string[] {
  const names: string[] = [];
  walk(file, (n) => {
    if (!ts.isPropertyAccessExpression(n)) return;
    const obj = n.expression;
    if (!ts.isPropertyAccessExpression(obj)) return;
    if (!ts.isIdentifier(obj.expression) || obj.expression.text !== "process") return;
    if (obj.name.text !== "env") return;
    names.push(n.name.text);
  });
  return names;
}

describe("the three call sites still read every candidate name", () => {
  // Each of these is a real environment somebody's deployment uses. Dropping one is invisible
  // everywhere else and total in the environment that holds the variable under that name.
  it.each([
    [
      "lib/stripe-env.ts",
      [
        "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST",
        "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
        "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_Production",
      ],
    ],
    ["lib/stripe.ts", ["STRIPE_SECRET_KEY_TEST", "STRIPE_SECRET_KEY"]],
    ["app/api/stripe/webhook/route.ts", ["STRIPE_WEBHOOK_SECRET_TEST", "STRIPE_WEBHOOK_SECRET"]],
  ])("%s", (rel, expected) => {
    const reads = envReads(parse(rel));
    for (const name of expected) expect(reads).toContain(name);
  });

  it("no secret's variable name appears in the module a client component imports", () => {
    // `stripe-env.ts` is isomorphic — `stripe-client.ts` is "use client" and imports it. The
    // publishable key belongs in the browser; a secret's NAME does not belong in that bundle even
    // though Next.js would resolve it to undefined there.
    const reads = envReads(parse("lib/stripe-env.ts"));
    expect(reads.filter((n) => /SECRET/.test(n))).toEqual([]);
  });

  it("the publishable key is resolved through the shared resolver, not re-read in the client", () => {
    // Two readers of one credential drift. `stripe-client.ts` must go through `resolvePublishableKey`
    // so the browser mounts the key the server validated the mode of.
    const client = parse("lib/stripe-client.ts");
    expect(envReads(client)).toEqual([]);
    let callsResolver = false;
    walk(client, (n) => {
      if (
        ts.isCallExpression(n) &&
        ts.isIdentifier(n.expression) &&
        n.expression.text === "resolvePublishableKey"
      )
        callsResolver = true;
    });
    expect(callsResolver).toBe(true);
  });

  it("the webhook selects its signing secret THROUGH the mode filter", () => {
    // Structural: the P1 regresses by passing `webhookSecretCandidates()` straight to `pickEnv`,
    // which reads perfectly well and reinstates unconditional `_TEST` precedence. So assert the
    // filter wraps the list — a bare call to the raw candidates is what this rejects.
    const route = parse("app/api/stripe/webhook/route.ts");
    const post = postFn(route);
    let wrapped = false;
    walk(post, (n) => {
      if (!ts.isCallExpression(n)) return;
      if (!ts.isIdentifier(n.expression) || n.expression.text !== "webhookCandidatesForMode")
        return;
      // second argument must be the candidate list, first the resolved mode
      const [modeArg, listArg] = n.arguments;
      if (
        originCall(post, modeArg) === "resolvedStripeMode" &&
        originCall(post, listArg) === "webhookSecretCandidates"
      )
        wrapped = true;
    });
    expect(wrapped).toBe(true);
  });

  it("the webhook DIAGNOSES from the raw candidates, not the mode-filtered list", () => {
    // Codex round 2 on #274, and the regression is a single identifier: passing `eligibleSecrets`
    // where `secretCandidates` belongs. It reads perfectly well — the filtered list is the right
    // input three lines above — and it silently strips the `_TEST` name from the 500, which is the
    // only line telling the operator their leftover variable is set and was refused. Selection and
    // diagnosis want DIFFERENT lists, so the two call sites are pinned separately.
    const route = parse("app/api/stripe/webhook/route.ts");
    const post = postFn(route);
    let diagnosesRaw = false;
    walk(post, (n) => {
      if (!ts.isCallExpression(n)) return;
      if (!ts.isIdentifier(n.expression) || n.expression.text !== "webhookSecretDiagnostic") return;
      const [, listArg] = n.arguments;
      if (originCall(post, listArg) === "webhookSecretCandidates") diagnosesRaw = true;
    });
    expect(diagnosesRaw).toBe(true);
  });

  it("pickEnv CONSUMES the mode-filtered list — the call merely EXISTING is not enough", () => {
    // Both lenses of the blind pre-merge audit named the same evasion, independently: keep the
    // `webhookCandidatesForMode(...)` call so the guard above stays green, and hand `pickEnv` the
    // RAW list instead. Nothing type-checks differently, `secretCandidates` is still used by the
    // diagnostic so no "unused" error fires, the suite passes — and unconditional `_TEST`
    // precedence is back, which is the P1 this PR exists to close. Assert the value CONSUMED, not
    // the presence of a call.
    const route = parse("app/api/stripe/webhook/route.ts");
    const post = postFn(route);
    let consumesFiltered = false;
    walk(post, (n) => {
      if (!ts.isCallExpression(n)) return;
      if (!ts.isIdentifier(n.expression) || n.expression.text !== "pickEnv") return;
      if (originCall(post, n.arguments[0]) === "webhookCandidatesForMode") consumesFiltered = true;
    });
    expect(consumesFiltered).toBe(true);
  });

  it("getStripe() is evaluated OUTSIDE the constructEvent try", () => {
    // Blind pre-merge audit CRITICAL, reached independently by two lenses. `getStripe()` throws on
    // an unresolvable secret key AND on a mode disagreement (the throw this PR added); the catch
    // around `constructEvent` answers 400 "Bad signature" and files `stage: "bad_signature"`.
    // Evaluate `getStripe()` inside that try and a credential misconfiguration is reported as a
    // signature failure with `constructEvent` never called — and a 400 tells Stripe the delivery
    // can NEVER succeed, so the mode-mismatch window burns the retry budget while being metered as
    // an attack. Exactly the masquerade the missing-secret branch was written to end.
    const route = parse("app/api/stripe/webhook/route.ts");
    const post = postFn(route);
    let signatureTries = 0;
    let offending = 0;
    walk(post, (n) => {
      if (!ts.isTryStatement(n)) return;
      let constructs = false;
      let getsStripe = false;
      walk(n.tryBlock, (m) => {
        if (!ts.isCallExpression(m)) return;
        const e = m.expression;
        if (ts.isPropertyAccessExpression(e) && e.name.text === "constructEvent") constructs = true;
        if (ts.isIdentifier(e) && e.text === "getStripe") getsStripe = true;
      });
      if (!constructs) return;
      signatureTries += 1;
      if (getsStripe) offending += 1;
    });
    // Both halves matter: without the first, deleting the try would satisfy the second vacuously.
    expect(signatureTries).toBe(1);
    expect(offending).toBe(0);
  });

  it("the unresolvable-signing-secret 500 feeds the SAME rejection counter as the other config fault", () => {
    // Codex round 3 on #274. This branch answered 500 and returned without touching
    // `stripe_webhook_delivery_rejected`, while the `getStripe()` config failure a few lines below
    // records under `stage: "config_error"`. So the ONE outage the mode filter exists to produce —
    // live API keys with only a `_TEST` signing secret left behind — would leave the dashboard flat
    // while a different config fault was counted. A counter that stays quiet through the outage it
    // was built for is worse than no counter.
    //
    // Deliberately NARROW: this asserts the two CONFIG-REJECTION branches, not "every non-2xx".
    // Most 500s in this route are post-verification handler failures (order lookup, capture) on an
    // already-verified event; they are not rejected deliveries and must NOT feed this series.
    // A guard that swept them in would be over-blocking of exactly the kind this module argues
    // against elsewhere.
    const route = parse("app/api/stripe/webhook/route.ts");
    const post = postFn(route);
    const REJECTIONS = ["Webhook not configured", "Stripe not configured"];
    const recorded: string[] = [];
    walk(post, (n) => {
      if (!ts.isBlock(n)) return;
      let returnsRejection: string | null = null;
      let records = false;
      walk(n, (m) => {
        if (ts.isStringLiteral(m) && REJECTIONS.includes(m.text)) returnsRejection = m.text;
        if (
          ts.isCallExpression(m) &&
          ts.isIdentifier(m.expression) &&
          m.expression.text === "recordRejection"
        )
          records = true;
      });
      if (returnsRejection && records) recorded.push(returnsRejection);
    });
    // Both branches present and both recording. `toContain` on a de-duplicated set, because the
    // enclosing blocks nest and each inner block is visited again from its parent.
    expect([...new Set(recorded)].sort()).toEqual([...REJECTIONS].sort());
  });

  it("getStripe refuses on a mode mismatch before constructing the client", () => {
    // Structural, because the real Stripe constructor cannot be driven from here: the throw must sit
    // ahead of `new Stripe(` in the function body, or a live charge is created and only then judged.
    const src = parse("lib/stripe.ts");
    let fn: ts.FunctionDeclaration | undefined;
    walk(src, (n) => {
      if (ts.isFunctionDeclaration(n) && n.name?.text === "getStripe") fn = n;
    });
    expect(fn).toBeDefined();
    const text = fn!.getText();
    const guardAt = text.indexOf("modeDisagreement");
    const constructAt = text.indexOf("new Stripe(");
    expect(guardAt).toBeGreaterThan(-1);
    expect(constructAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(constructAt);
  });
});
