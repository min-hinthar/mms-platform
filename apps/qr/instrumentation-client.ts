// PostHog — App Router client instrumentation. Runs once on the client.
// Privacy (QA checklist P2): no PII in event props; identified_only; first-party via /ingest.
import posthog from "posthog-js";

// The dine-in join key rides in the URL as `?t=` (sticker) / `?j=` (invite) — a LIVE, still-active
// session credential. `capture_pageview` records `$current_url`/`$referrer`, so without this scrub the
// code would land verbatim in analytics. Redact those params from any URL prop before send. (The server
// onRequestError path was already scrubbed; this closes the client pageview path.)
function scrubJoinCode(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    const url = new URL(value);
    if (!url.searchParams.has("t") && !url.searchParams.has("j")) return value;
    url.searchParams.delete("t");
    url.searchParams.delete("j");
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
  persistence: "memory", // cookieless until consent
  before_send: (event) => {
    if (event?.properties) {
      for (const key of ["$current_url", "$referrer"] as const) {
        if (event.properties[key]) event.properties[key] = scrubJoinCode(event.properties[key]);
      }
    }
    return event;
  },
});

// Event taxonomy: qr_scanned → mode_selected → menu_viewed → item_viewed → add_to_cart
// → cart_viewed → checkout_started → payment_succeeded | payment_failed (+ promo_applied,
// split_changed, member_joined, order_ready, feedback_submitted). Props: opaque ids only.
export { posthog };
