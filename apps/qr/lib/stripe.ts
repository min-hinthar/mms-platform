import "server-only";
import Stripe from "stripe";

// Pinned API version (QA checklist). Server-only — the secret key never reaches the client.
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: (process.env.STRIPE_API_VERSION as Stripe.LatestApiVersion) ?? "2026-01-28",
  typescript: true,
});
