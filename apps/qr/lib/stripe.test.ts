import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `lib/stripe.ts`, EXECUTED — the module every server-side Stripe call goes through.
 *
 * Until M164 this file had no suite of its own: it carries `import "server-only"` and constructs a
 * `Stripe` client, so its one mutant was caught by a STRUCTURAL read in `stripe-env.test.ts`, and
 * the COMPOSITION that decides the deployment's mode — `keyMode(pickEnv(secretKeyCandidates()))` —
 * had no test at all. Both halves are pinned in `stripe-env.test.ts`; nothing pinned that they are
 * wired together, in this order, to THIS list. Rewire `resolvedStripeMode` to a constant or to the
 * publishable key and `webhookCandidatesForMode` starts answering for the wrong mode with every
 * gate green (OPEN-ITEMS M164).
 *
 * So this suite runs the module for real: `server-only` is stubbed, each case sets the environment
 * it means and re-imports the module fresh (the client is memoised at module scope), and the
 * `Stripe` constructor is a pass-through spy around the REAL SDK class — so a case can read both
 * what `getStripe()` handed the SDK and what the SDK actually took from it. No request is made:
 * constructing a client opens no connection.
 *
 * What each block is for:
 *   - resolvedStripeMode — the composition (M164) and the secret key's candidate ORDER (M165): with
 *     both names set, `_TEST` wins, so the mode follows it.
 *   - getStripe — the key handed to the SDK follows the same order; the mode gate refuses BEFORE
 *     the constructor runs; a missing key names every place looked.
 *   - the network budget (M72c) — an explicit timeout and retry count reach the SDK; the worst case
 *     of one call, the SDK's Retry-After sleep included, is bounded under two minutes, and that of
 *     a zero-retry call (the pickup capture) under one; and every call that opts out of the SDK's
 *     retries carries its own idempotency key.
 */

vi.mock("server-only", () => ({}));

const ctor = vi.hoisted(() => ({ calls: [] as { key: string; opts: Record<string, unknown> }[] }));

vi.mock("stripe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("stripe")>();
  const Real = actual.default;
  // A plain function used with `new` and returning an object yields that object, so the module
  // under test receives a genuine SDK client while the call is recorded.
  function SpyStripe(key: string, opts: Record<string, unknown>) {
    ctor.calls.push({ key, opts });
    return new Real(key, opts as ConstructorParameters<typeof Real>[1]);
  }
  return { ...actual, default: SpyStripe };
});

/** Every variable `stripe.ts` or `stripe-env.ts` reads. Blank is "not set" to `pickEnv`. */
const STRIPE_ENV = [
  "STRIPE_SECRET_KEY_TEST",
  "STRIPE_SECRET_KEY",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_Production",
] as const;

function env(values: Partial<Record<(typeof STRIPE_ENV)[number], string>>) {
  for (const name of STRIPE_ENV) vi.stubEnv(name, values[name] ?? "");
}

/** A fresh copy of the module: `_stripe` is memoised, and each case means its own environment. */
async function load() {
  vi.resetModules();
  return import("./stripe");
}

beforeEach(() => {
  ctor.calls.length = 0;
  // The sandbox and a developer's shell both carry Stripe variables; every case starts from none.
  env({});
  vi.stubEnv("STRIPE_API_VERSION", undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolvedStripeMode — the composition the webhook's signing-secret filter reads (M164)", () => {
  it("reads a live secret key as live", async () => {
    env({ STRIPE_SECRET_KEY: "sk_live_m164" });
    expect((await load()).resolvedStripeMode()).toBe("live");
  });

  it("reads a test secret key as test", async () => {
    env({ STRIPE_SECRET_KEY_TEST: "sk_test_m164" });
    expect((await load()).resolvedStripeMode()).toBe("test");
  });

  it("answers unknown when no secret key resolves", async () => {
    expect((await load()).resolvedStripeMode()).toBe("unknown");
  });

  it("follows the SECRET key, never the publishable one", async () => {
    // The two keys disagree on purpose. The secret key is the credential that moves the money; a
    // mode read off the publishable key would hand the webhook filter the wrong answer exactly in
    // the half-done cutover where they differ.
    env({
      STRIPE_SECRET_KEY: "sk_test_m164",
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_m164",
    });
    expect((await load()).resolvedStripeMode()).toBe("test");
    env({
      STRIPE_SECRET_KEY: "sk_live_m164",
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_m164",
    });
    expect((await load()).resolvedStripeMode()).toBe("live");
  });

  it("with BOTH names set, the _TEST key decides the mode — the order is the behaviour (M165)", async () => {
    // A Production environment holding both is exactly the cutover-in-progress state. Reverse the
    // candidates and this deployment reports LIVE while the docs, the publishable key's order and
    // every operator believe it is on test cards.
    env({ STRIPE_SECRET_KEY_TEST: "sk_test_m165", STRIPE_SECRET_KEY: "sk_live_m165" });
    expect((await load()).resolvedStripeMode()).toBe("test");
  });

  it("skips a BLANK _TEST variable and reads the base name", async () => {
    // Through `pickEnv`'s blank rule: a Vercel variable created and left empty is not a key.
    env({ STRIPE_SECRET_KEY_TEST: "   ", STRIPE_SECRET_KEY: "sk_live_m164" });
    expect((await load()).resolvedStripeMode()).toBe("live");
  });
});

describe("getStripe — the one constructor every server-side Stripe call goes through", () => {
  it("hands the SDK the key that won, _TEST first (M165)", async () => {
    env({
      STRIPE_SECRET_KEY_TEST: "sk_test_m165",
      STRIPE_SECRET_KEY: "sk_live_m165",
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST: "pk_test_m165",
    });
    (await load()).getStripe();
    expect(ctor.calls.map((c) => c.key)).toEqual(["sk_test_m165"]);
  });

  it("refuses a mismatched pair BEFORE the constructor runs", async () => {
    // Behavioural twin of the structural pin in `stripe-env.test.ts`: a live secret beside a test
    // publishable key must never produce a client, because the first charge through it would be
    // real money whose fulfilment webhook cannot verify.
    env({ STRIPE_SECRET_KEY: "sk_live_m164", NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_m164" });
    const { getStripe } = await load();
    expect(() => getStripe()).toThrow(/mode mismatch/);
    expect(ctor.calls).toHaveLength(0);
  });

  it("names every place it looked when no secret key is set", async () => {
    const { getStripe } = await load();
    expect(() => getStripe()).toThrow(/STRIPE_SECRET_KEY_TEST, STRIPE_SECRET_KEY/);
    expect(ctor.calls).toHaveLength(0);
  });

  it("constructs once and reuses the client", async () => {
    env({ STRIPE_SECRET_KEY: "sk_test_m164" });
    const { getStripe } = await load();
    expect(getStripe()).toBe(getStripe());
    expect(ctor.calls).toHaveLength(1);
  });
});

/** The SDK's own between-attempt sleep, read off the client: `retryRequest` schedules the next
 *  attempt `_getSleepTimeInMS(retries so far, the response's Retry-After)` later. Jitter pinned at
 *  its top, so a probe answers the longest sleep the SDK can choose. */
function sleepProbe(stripe: unknown): (numRetries: number, retryAfter?: number) => number {
  const sender = (stripe as { _requestSender?: { _getSleepTimeInMS?: unknown } })._requestSender;
  const fn = sender?._getSleepTimeInMS;
  if (typeof fn !== "function")
    throw new Error("stripe SDK: `_getSleepTimeInMS` moved — re-derive the budget's sleep");
  return (numRetries, retryAfter) => {
    const spy = vi.spyOn(Math, "random").mockReturnValue(1);
    try {
      return (fn as (n: number, r?: number) => number).call(sender, numRetries, retryAfter);
    } finally {
      spy.mockRestore();
    }
  };
}

/** The SDK's own retry decision (`RequestSender._shouldRetry(res, retriesSoFar, maxRetries, error)`). */
function shouldRetryProbe(
  stripe: unknown,
): (res: unknown, numRetries: number, maxRetries: number, error?: { code: string }) => boolean {
  const sender = (stripe as { _requestSender?: { constructor?: { _shouldRetry?: unknown } } })
    ._requestSender;
  const fn = sender?.constructor?._shouldRetry;
  if (typeof fn !== "function")
    throw new Error("stripe SDK: `_shouldRetry` moved — re-derive which calls are resent");
  return (res, numRetries, maxRetries, error) =>
    (fn as (...a: unknown[]) => boolean)(res, numRetries, maxRetries, error);
}

describe("the network budget — explicit, bounded, and never a blind retry (M72c)", () => {
  async function client() {
    env({ STRIPE_SECRET_KEY: "sk_test_m72c" });
    const mod = await load();
    return { mod, stripe: mod.getStripe() };
  }

  it("hands the SDK an explicit timeout and retry count, and the SDK takes them", async () => {
    // Read back from the REAL client, not just the options object: an option the SDK does not
    // recognise is refused, and one it ignores would read back as its default.
    const { mod, stripe } = await client();
    expect(ctor.calls[0]!.opts).toMatchObject({
      timeout: mod.STRIPE_TIMEOUT_MS,
      maxNetworkRetries: mod.STRIPE_MAX_NETWORK_RETRIES,
    });
    expect(stripe.getApiField("timeout")).toBe(mod.STRIPE_TIMEOUT_MS);
    expect(stripe.getMaxNetworkRetries()).toBe(mod.STRIPE_MAX_NETWORK_RETRIES);
  });

  it("the per-attempt timeout is tighter than the SDK's own default", async () => {
    // stripe@22 waits its DEFAULT_TIMEOUT per attempt when none is passed — the "minutes" M72 priced.
    const { mod, stripe } = await client();
    expect(mod.STRIPE_TIMEOUT_MS).toBeLessThan(stripe.getConstant("DEFAULT_TIMEOUT") as number);
  });

  it("keeps at least one retry, so the SDK keys every POST this app sends unkeyed", async () => {
    // stripe@22 generates an Idempotency-Key for a POST only when retries are allowed — and it
    // retries a connection reset on the FIRST attempt even at zero. At zero, an unkeyed create
    // (`customers.create`, a cancel) could therefore be resent blind. One retry keeps every POST
    // keyed, whether or not its call site names a key.
    const { mod } = await client();
    expect(mod.STRIPE_MAX_NETWORK_RETRIES).toBeGreaterThanOrEqual(1);
  });

  it("bounds a default-budget call's worst case under TWO minutes, Retry-After included — never M72's 'minutes'", async () => {
    // Every attempt may run the full timeout. Between two attempts the SDK sleeps its backoff, or
    // longer when Stripe answers a retryable status (409, 5xx, `Stripe-Should-Retry: true`) with a
    // `Retry-After` the SDK honours — stripe@22 honours up to 60 s (the blind pass on #352: a bound
    // built from MAX_NETWORK_RETRY_DELAY_SEC alone said "under a minute" and could not see this). So
    // the longest sleep is probed off the client across every Retry-After a response could carry.
    const { mod, stripe } = await client();
    const attempts = Math.max(mod.STRIPE_MAX_NETWORK_RETRIES, 1) + 1;
    const sleep = sleepProbe(stripe);
    let maxSleepMs = 0;
    for (let retries = 0; retries < attempts - 1; retries++)
      for (let retryAfter = 0; retryAfter <= 3600; retryAfter++)
        maxSleepMs = Math.max(maxSleepMs, sleep(retries, retryAfter));
    const worstMs = attempts * mod.STRIPE_TIMEOUT_MS + (attempts - 1) * maxSleepMs;
    expect(worstMs).toBeLessThan(2 * 60 * 1000);
    // And far inside what the SDK's defaults allowed: three attempts of DEFAULT_TIMEOUT with the
    // same longest sleep between each pair.
    const defaultWorstMs = 3 * (stripe.getConstant("DEFAULT_TIMEOUT") as number) + 2 * maxSleepMs;
    expect(worstMs).toBeLessThan(defaultWorstMs / 2);
  });

  it("bounds a ZERO-retry call (the pickup capture, M72's window C) under a minute", async () => {
    // At zero retries the SDK resends only a first-attempt connection reset — no response, so no
    // Retry-After can stretch the sleep; a retryable STATUS is never resent. Both halves are read off
    // the SDK's own retry decision, then the bound is the two attempts plus that one backoff.
    const { mod, stripe } = await client();
    const decide = shouldRetryProbe(stripe);
    const status = (code: number, headers: Record<string, string> = {}) => ({
      getStatusCode: () => code,
      getHeaders: () => headers,
    });
    expect(decide(status(503), 0, 0)).toBe(false);
    expect(decide(status(409), 0, 0)).toBe(false);
    expect(decide(status(500, { "stripe-should-retry": "true" }), 0, 0)).toBe(false);
    expect(decide(null, 0, 0, { code: "ECONNRESET" })).toBe(true);
    expect(decide(null, 1, 0, { code: "ECONNRESET" })).toBe(false);
    const worstMs = 2 * mod.STRIPE_TIMEOUT_MS + sleepProbe(stripe)(0, undefined);
    expect(worstMs).toBeLessThan(60 * 1000);
  });
});

// ── The per-call override rule, parsed ──────────────────────────────────────────────────────────

const APP = path.join(__dirname, "..");

/** Every shipped .ts/.tsx under lib/ and app/ — never a test, never a dependency. */
function sourceFiles(): string[] {
  const out: string[] = [];
  const visit = (dir: string) => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === "node_modules" || ent.name === ".next") continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) visit(full);
      else if (/\.tsx?$/.test(ent.name) && !/\.test\.tsx?$/.test(ent.name)) out.push(full);
    }
  };
  visit(path.join(APP, "lib"));
  visit(path.join(APP, "app"));
  return out;
}

/** Walk every descendant. `forEachChild` aborts on a truthy return, so the visitor returns void. */
function walk(node: ts.Node, visit: (n: ts.Node) => void) {
  visit(node);
  ts.forEachChild(node, (c) => {
    walk(c, visit);
  });
}

const propName = (p: ts.ObjectLiteralElementLike) =>
  p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : null;

/** The ONE file allowed to construct a client — `getStripe()`'s home. */
const CLIENT_FILE = path.join("lib", "stripe.ts");

/** Every local name a source binds to the `stripe` package: `Stripe` itself (a bare global use),
 *  a default or named import under any alias, and a namespace import (`new ns.default(...)`). */
function stripeBindings(src: ts.SourceFile) {
  const direct = new Set(["Stripe"]);
  const namespaces = new Set<string>();
  for (const st of src.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    if (st.moduleSpecifier.text !== "stripe" || !st.importClause) continue;
    const clause = st.importClause;
    if (clause.name) direct.add(clause.name.text);
    const nb = clause.namedBindings;
    if (nb && ts.isNamespaceImport(nb)) namespaces.add(nb.name.text);
    if (nb && ts.isNamedImports(nb)) for (const el of nb.elements) direct.add(el.name.text);
  }
  return { direct, namespaces };
}

function isStripeConstruction(n: ts.Node, b: ReturnType<typeof stripeBindings>): boolean {
  if (!ts.isNewExpression(n)) return false;
  const e = n.expression;
  if (ts.isIdentifier(e)) return b.direct.has(e.text);
  return (
    ts.isPropertyAccessExpression(e) &&
    ts.isIdentifier(e.expression) &&
    b.namespaces.has(e.expression.text)
  );
}

/** Scan ONE source for per-call retry overrides and client constructions; `rel` is its path relative
 *  to the app root. Only `lib/stripe.ts`'s own constructor config is exempt as a client config — a
 *  client built anywhere else is listed in `constructions` and its config scanned like any call's. */
function scanRetryOverrides(rel: string, text: string) {
  const overrides: string[] = [];
  const unkeyed: string[] = [];
  const constructions: string[] = [];
  const src = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true);
  const bindings = stripeBindings(src);
  const at = (n: ts.Node) => `${rel}:${src.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;
  walk(src, (n) => {
    if (isStripeConstruction(n, bindings)) constructions.push(at(n));
    if (!ts.isObjectLiteralExpression(n)) return;
    if (rel === CLIENT_FILE && isStripeConstruction(n.parent, bindings)) return;
    const retries = n.properties.find((p) => propName(p) === "maxNetworkRetries");
    if (!retries) return;
    const where = at(n);
    overrides.push(where);
    const init = ts.isPropertyAssignment(retries) ? retries.initializer : null;
    const atLeastOne = !!init && ts.isNumericLiteral(init) && Number(init.text) >= 1;
    if (atLeastOne) return;
    if (!n.properties.some((p) => propName(p) === "idempotencyKey")) unkeyed.push(where);
  });
  return { overrides, unkeyed, constructions };
}

describe("a call that lowers the SDK's retries must carry its own idempotency key (M72c)", () => {
  it("every per-call `maxNetworkRetries` below one sits beside an `idempotencyKey`", () => {
    // The reason is the SDK fact above: below one retry it stops generating a key, yet still resends
    // a first-attempt connection reset. Parsed, so a comment or a string cannot satisfy it; a value
    // that is not a numeric literal is treated as possibly zero rather than guessed at.
    const overrides: string[] = [];
    const unkeyed: string[] = [];
    const constructions: string[] = [];
    for (const file of sourceFiles()) {
      const found = scanRetryOverrides(path.relative(APP, file), readFileSync(file, "utf8"));
      overrides.push(...found.overrides);
      unkeyed.push(...found.unkeyed);
      constructions.push(...found.constructions);
    }
    // Not vacuous: the pickup capture is the override this rule was written for.
    expect(overrides.some((w) => w.startsWith(path.join("lib", "manual-capture-run.ts")))).toBe(
      true,
    );
    expect(unkeyed).toEqual([]);
    // ONE client, built where the budget is: a second one would take the SDK's defaults (or any
    // budget of its own) with no rule above seeing it. Not vacuous: getStripe's own is found.
    expect(constructions.length).toBe(1);
    expect(constructions[0]!.startsWith(`${CLIENT_FILE}:`)).toBe(true);
  });

  it("a SECOND client built elsewhere at zero retries is caught, not exempted as a client config", () => {
    // The blind pass on #352: the client-config exemption matched `new Stripe(...)` in any file, so
    // `new Stripe(k, { maxNetworkRetries: 0 })` outside lib/stripe.ts — unkeyed POSTs resent blind —
    // passed this rule and the constant test both.
    const rel = path.join("lib", "billing.ts");
    const second =
      'import Stripe from "stripe";\nexport const s = new Stripe(k, { maxNetworkRetries: 0 });\n';
    const found = scanRetryOverrides(rel, second);
    expect(found.unkeyed).toEqual([`${rel}:2`]);
    expect(found.constructions).toEqual([`${rel}:2`]);
  });

  it("a construction under ANY binding of the `stripe` import is counted — an alias is not an exit", () => {
    const rel = path.join("app", "api", "x", "route.ts");
    const aliased = [
      'import Sdk, { Stripe as Named } from "stripe";',
      'import * as ns from "stripe";',
      "const a = new Sdk(k, {});",
      "const b = new Named(k, {});",
      "const c = new ns.default(k, {});",
      "// new Stripe(k, {}) in a comment is not a construction",
      "",
    ].join("\n");
    expect(scanRetryOverrides(rel, aliased).constructions).toEqual([
      `${rel}:3`,
      `${rel}:4`,
      `${rel}:5`,
    ]);
  });
});
