// PostHog — App Router client instrumentation. Runs once on the client.
// Privacy (QA checklist P2): no PII in event props; identified_only; first-party via /ingest.
import posthog from "posthog-js";

posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
  api_host: "/ingest",
  ui_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  person_profiles: "identified_only",
  capture_pageview: "history_change",
  persistence: "memory", // cookieless until consent
});

// Event taxonomy: qr_scanned → mode_selected → menu_viewed → item_viewed → add_to_cart
// → cart_viewed → checkout_started → payment_succeeded | payment_failed (+ promo_applied,
// split_changed, member_joined, order_ready, feedback_submitted). Props: opaque ids only.
export { posthog };
