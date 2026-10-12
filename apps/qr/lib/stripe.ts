import "server-only";
import Stripe from "stripe";
import {
  keyMode,
  missingEnvMessage,
  modeDisagreement,
  pickEnv,
  resolvePublishableKey,
  type EnvCandidate,
  type StripeMode,
} from "./stripe-env";

// Derive the apiVersion literal type straight from the SDK constructor so a Stripe bump can't
// silently drift the pin (the SDK renamed `Stripe.LatestApiVersion` between majors). Default to
// the version this SDK is built against; `STRIPE_API_VERSION` can override per environment.
type StripeApiVersion = NonNullable<ConstructorParameters<typeof Stripe>[1]>["apiVersion"];
const DEFAULT_API_VERSION = "2026-05-27.dahlia" satisfies StripeApiVersion;

/**
 * M72c — the client's network budget, named ONCE and passed to the one constructor.
 *
 * Without these stripe@22 applies its own defaults: an 80 000 ms timeout per attempt and two
 * retries, retrying any connection error, 409 and 5xx. A flapping call could therefore hold a
 * request open for MINUTES — and on the pickup capture that is M72's window C, the gap in which an
 * 86 can land after the void and still be charged. One call now makes at most two attempts of
 * `STRIPE_TIMEOUT_MS` each, a worst case under a minute (`stripe.test.ts` derives the bound from the
 * SDK's own constants rather than restating them).
 *
 * ⚠️ `STRIPE_TIMEOUT_MS` is an UPPER BOUND chosen without a measurement, not a sized value. Owner
 * ruling #23 sizes it from the Stripe round trip measured from `pdx1`, and that measurement cannot
 * be taken from a build or an agent sandbox. It is chosen generously, on the expectation that a
 * healthy call finishes far inside it — the measurement is what confirms that or tightens it — and
 * a premature timeout costs time, never a second charge: every POST this app sends is idempotency-keyed —
 * explicitly at its call site, or by the SDK itself (see below) — so the retry or the caller's next
 * attempt replays the first request instead of repeating it.
 *
 * ⚠️ `STRIPE_MAX_NETWORK_RETRIES` must stay at least one, and the reason is an SDK fact, not a
 * preference: stripe@22 generates an `Idempotency-Key` for a POST only when retries are allowed,
 * yet it resends a connection reset on the FIRST attempt even when they are not. At zero, an unkeyed
 * create (`customers.create`, a cancel, a reader action) could be resent blind.
 *
 * WHICH CALLS RETRY. Every call takes this default — one retry, keyed — because its caller either
 * waits on it (a diner's checkout, a staff refund) or could not tell a slow success from a failure
 * without it. The ONE exception is the pickup capture (`manual-capture-run.ts`), which passes
 * `maxNetworkRetries: 0` beside its own key: its retry is Stripe's webhook REDELIVERY, which re-runs
 * void → re-derive → capture against the catalog as it is THEN, while an in-process retry would
 * capture a plan computed before the timeout and stretch window C by a whole attempt. A call that
 * lowers the retry count below one must carry an explicit `idempotencyKey`; `stripe.test.ts` parses
 * the app for every such override.
 */
export const STRIPE_TIMEOUT_MS = 20_000;
export const STRIPE_MAX_NETWORK_RETRIES = 1;

/**
 * Every name the secret key may live under, most specific first. `_TEST` wins — see
 * `publishableKeyCandidates`' docblock for why, and for what the live cutover has to do about it.
 *
 * Kept in this `server-only` module rather than in `stripe-env.ts`, which a client component may
 * import: no secret's variable name should appear in a module that can reach the browser bundle,
 * even though Next.js would resolve it to undefined there.
 */
function secretKeyCandidates(): readonly EnvCandidate[] {
  return [
    ["STRIPE_SECRET_KEY_TEST", process.env.STRIPE_SECRET_KEY_TEST],
    ["STRIPE_SECRET_KEY", process.env.STRIPE_SECRET_KEY],
  ];
}

/**
 * The Stripe MODE this deployment is running in, derived from the secret key it will actually use.
 *
 * The secret key is the right source: it is the credential that moves the money, it announces its
 * own mode in its prefix, and it is resolved by the same precedence every other Stripe call sees.
 * The webhook route reads this to decide which signing-secret names are legitimate — see
 * `webhookCandidatesForMode`, which exists because a `whsec_…` carries no marker of its own.
 *
 * `unknown` when no key resolves or the prefix is unrecognised; callers must treat that as
 * "cannot tell", never as "test" — and the webhook's filter treats it as live (M166).
 *
 * The COMPOSITION is pinned by executing it (`stripe.test.ts`, M164): which list is read, in which
 * order, and that the secret key — never the publishable one — is what decides.
 */
export function resolvedStripeMode(): StripeMode {
  return keyMode(pickEnv(secretKeyCandidates())?.value);
}

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const candidates = secretKeyCandidates();
  const resolved = pickEnv(candidates);
  if (!resolved) throw new Error(missingEnvMessage("Stripe secret key", candidates));
  const key = resolved.value;
  // The mode gate, on the one path every server-side Stripe call already goes through. Both keys are
  // readable here (a NEXT_PUBLIC_* var is an ordinary runtime read on the server), and refusing to
  // construct the client is the only place that can stop a LIVE charge whose fulfilment webhook is
  // signed by a TEST secret — the failure C18 was, with real money instead of test cards.
  const mismatch = modeDisagreement(key, resolvePublishableKey()?.value);
  if (mismatch) throw new Error(mismatch);
  _stripe = new Stripe(key, {
    apiVersion: (process.env.STRIPE_API_VERSION as StripeApiVersion) ?? DEFAULT_API_VERSION,
    typescript: true,
    timeout: STRIPE_TIMEOUT_MS,
    maxNetworkRetries: STRIPE_MAX_NETWORK_RETRIES,
  });
  return _stripe;
}
