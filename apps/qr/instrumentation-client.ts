// PostHog — App Router client instrumentation. Runs once on the client.
// Privacy (QA checklist P2): no PII in event props; identified_only; first-party via /ingest.
import posthog from "posthog-js";

// `capture_pageview` records `$current_url`/`$referrer`, which carry URL params we don't want in
// analytics: the dine-in join key `?t=`/`?j=` (a LIVE session credential) and the Stripe
// `?payment_intent=…`/`redirect_status` on /track (an order-correlatable id — not a credential, but
// "opaque ids only" per QA §C P2). Strip them before send. (The server onRequestError path is already
// clean — it logs only the templated route, never the query string.)
const REDACT_PARAMS = [
  "t",
  "j",
  "payment_intent",
  "payment_intent_client_secret",
  "redirect_status",
];
function scrubUrlParams(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    const url = new URL(value);
    if (!REDACT_PARAMS.some((p) => url.searchParams.has(p))) return value;
    for (const p of REDACT_PARAMS) url.searchParams.delete(p);
    return url.toString();
  } catch {
    return value; // not a URL-shaped string → leave it
  }
}

posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
  api_host: "/ingest",
  ui_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  defaults: "2026-01-30",
  person_profiles: "identified_only",
  capture_pageview: "history_change",
  capture_exceptions: true,
  // A Stripe Payment Element iframe lives on the pay screen — assert replay OFF in code (not just
  // dashboard config) so an accidental project-side enable can't start recording around the card form.
  disable_session_recording: true,
  persistence: "memory", // cookieless until consent
  before_send: (event) => {
    if (event?.properties) {
      for (const key of ["$current_url", "$referrer"] as const) {
        if (event.properties[key]) event.properties[key] = scrubUrlParams(event.properties[key]);
      }
    }
    return event;
  },
});

// Event taxonomy: qr_scanned → mode_selected → menu_viewed → item_viewed → add_to_cart
// → cart_viewed → checkout_started → payment_succeeded | payment_failed (+ promo_applied,
// split_changed, member_joined, order_ready, feedback_submitted). Props: opaque ids only.
export { posthog };
