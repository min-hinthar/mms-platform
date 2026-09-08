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
 * "cannot tell", never as "test".
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
  });
  return _stripe;
}
