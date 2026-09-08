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
    // Fail-closed: the route answers 500 "not configured" naming both names. An outage beats
    // capturing money whose fulfilment can never be verified.
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
    let wrapped = false;
    walk(route, (n) => {
      if (!ts.isCallExpression(n)) return;
      if (!ts.isIdentifier(n.expression) || n.expression.text !== "webhookCandidatesForMode")
        return;
      // second argument must be the candidate list, first the resolved mode
      const [modeArg, listArg] = n.arguments;
      const isCall = (x: ts.Node | undefined, name: string) =>
        !!x &&
        ts.isCallExpression(x) &&
        ts.isIdentifier(x.expression) &&
        x.expression.text === name;
      if (isCall(modeArg, "resolvedStripeMode") && isCall(listArg, "webhookSecretCandidates"))
        wrapped = true;
    });
    expect(wrapped).toBe(true);
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
