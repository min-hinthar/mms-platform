import "server-only";
import Stripe from "stripe";

// Derive the apiVersion literal type straight from the SDK constructor so a Stripe bump can't
// silently drift the pin (the SDK renamed `Stripe.LatestApiVersion` between majors). Default to
// the version this SDK is built against; `STRIPE_API_VERSION` can override per environment.
type StripeApiVersion = NonNullable<ConstructorParameters<typeof Stripe>[1]>["apiVersion"];
const DEFAULT_API_VERSION = "2026-05-27.dahlia" satisfies StripeApiVersion;

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  _stripe = new Stripe(key, {
    apiVersion: (process.env.STRIPE_API_VERSION as StripeApiVersion) ?? DEFAULT_API_VERSION,
    typescript: true,
  });
  return _stripe;
}
