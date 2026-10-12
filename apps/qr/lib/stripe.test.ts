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
 *   - the network budget (M72c) — an explicit timeout and retry count reach the SDK, the worst case
 *     of one call is bounded under a minute, and every call that opts out of the SDK's retries
 *     carries its own idempotency key.
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

  it("bounds ONE call's worst case under a minute — never M72's 'minutes'", async () => {
    // Every attempt may run the full timeout; between attempts the SDK sleeps at most its
    // MAX_NETWORK_RETRY_DELAY_SEC. Even at zero retries a first-attempt connection reset earns one
    // more attempt, so a call makes at most max(retries, 1) + 1 attempts.
    const { mod, stripe } = await client();
    const attempts = Math.max(mod.STRIPE_MAX_NETWORK_RETRIES, 1) + 1;
    const maxSleepMs = (stripe.getConstant("MAX_NETWORK_RETRY_DELAY_SEC") as number) * 1000;
    const worstMs = attempts * mod.STRIPE_TIMEOUT_MS + (attempts - 1) * maxSleepMs;
    const aMinute = 60 * 1000;
    expect(worstMs).toBeLessThan(aMinute);
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

/** The object literal handed to `new Stripe(...)` — the client's own config, not a per-call one. */
function isClientConfig(obj: ts.ObjectLiteralExpression): boolean {
  const parent = obj.parent;
  return (
    ts.isNewExpression(parent) &&
    ts.isIdentifier(parent.expression) &&
    parent.expression.text === "Stripe"
  );
}

describe("a call that lowers the SDK's retries must carry its own idempotency key (M72c)", () => {
  it("every per-call `maxNetworkRetries` below one sits beside an `idempotencyKey`", () => {
    // The reason is the SDK fact above: below one retry it stops generating a key, yet still resends
    // a first-attempt connection reset. Parsed, so a comment or a string cannot satisfy it; a value
    // that is not a numeric literal is treated as possibly zero rather than guessed at.
    const overrides: string[] = [];
    const unkeyed: string[] = [];
    for (const file of sourceFiles()) {
      const src = ts.createSourceFile(
        file,
        readFileSync(file, "utf8"),
        ts.ScriptTarget.Latest,
        true,
      );
      walk(src, (n) => {
        if (!ts.isObjectLiteralExpression(n) || isClientConfig(n)) return;
        const retries = n.properties.find((p) => propName(p) === "maxNetworkRetries");
        if (!retries) return;
        const where = `${path.relative(APP, file)}:${src.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;
        overrides.push(where);
        const init = ts.isPropertyAssignment(retries) ? retries.initializer : null;
        const atLeastOne = !!init && ts.isNumericLiteral(init) && Number(init.text) >= 1;
        if (atLeastOne) return;
        if (!n.properties.some((p) => propName(p) === "idempotencyKey")) unkeyed.push(where);
      });
    }
    // Not vacuous: the pickup capture is the override this rule was written for.
    expect(overrides.some((w) => w.startsWith(path.join("lib", "manual-capture-run.ts")))).toBe(
      true,
    );
    expect(unkeyed).toEqual([]);
  });
});
