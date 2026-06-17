<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of the `@mms/qr` Next.js App Router application. PostHog is now initialized client-side via `instrumentation-client.ts` (Next.js 15.3+ pattern) with a first-party reverse proxy through `/ingest`. A server-side singleton (`lib/posthog-server.ts`) using `posthog-node` covers all API routes and server actions. Ten events are instrumented across the full QR ordering funnel — from mode selection through payment confirmation — with both client and server dimensions tracked.

| Event | Description | File |
|---|---|---|
| `mode_selected` | User selects an order mode (dine-in, scan & go, pickup, grocery) | `apps/qr/app/page.tsx` via `ModeCard` component |
| `grocery_item_scanned` | Grocery barcode scanned successfully, item added to cart | `apps/qr/app/grocery/page.tsx` |
| `grocery_checkout_clicked` | User taps checkout on the grocery scan & go page | `apps/qr/app/grocery/page.tsx` |
| `session_created` | New table session created on first QR scan | `apps/qr/app/api/session/route.ts` |
| `session_joined` | User joins an existing active table session | `apps/qr/app/api/session/route.ts` |
| `item_added_to_cart` | Menu item added via server-authoritative cart action | `apps/qr/lib/cart.ts` |
| `promo_applied` | Promo code successfully applied to a cart | `apps/qr/lib/cart.ts` |
| `payment_intent_created` | Stripe PaymentIntent created; cart locked for checkout | `apps/qr/app/api/stripe/create-intent/route.ts` |
| `payment_succeeded` | Payment confirmed via Stripe webhook — order fulfilled | `apps/qr/app/api/stripe/webhook/route.ts` |
| `payment_failed` | Payment failed or declined via Stripe webhook | `apps/qr/app/api/stripe/webhook/route.ts` |

## Next steps

We've built a dashboard and five insights to monitor the QR ordering funnel:

- [Analytics basics (wizard) — Dashboard](https://us.posthog.com/project/474467/dashboard/1724941)
- [Order Conversion Funnel](https://us.posthog.com/project/474467/insights/AGrtRr4u) — 4-step funnel: mode selected → item added → checkout → payment succeeded
- [Completed Orders Over Time](https://us.posthog.com/project/474467/insights/ImWB1IxR) — Daily `payment_succeeded` count
- [Order Mode Distribution](https://us.posthog.com/project/474467/insights/ExdQVFHI) — Pie chart of mode selections (dine-in / scan & go / pickup / grocery)
- [Grocery Scan Activity](https://us.posthog.com/project/474467/insights/JGHg6W07) — Daily items scanned vs checkout clicks for grocery flow
- [Payment Success Rate](https://us.posthog.com/project/474467/insights/J5pVgVAf) — `payment_succeeded / payment_intent_created × 100` to track checkout drop-off

## Verify before merging

- [ ] Run a full production build (`pnpm build --filter @mms/qr`) and fix any lint or type errors introduced by the generated code.
- [ ] Run the test suite — call sites that were rewritten or instrumented may need updated mocks or fixtures.
- [ ] Add `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` to `.env.example` and any monorepo bootstrap scripts so collaborators know what to set.
- [ ] Wire source-map upload (`posthog-cli sourcemap` or your bundler's upload step) into CI so production stack traces de-minify.
- [ ] Confirm the returning-visitor path also calls `identify` — currently there is no user auth in the QR app so sessions are anonymous; if auth is added later, wire `posthog.identify()` on the client at login time.

### Agent skill

We've left an agent skill folder in your project at `.claude/skills/integration-nextjs-app-router/`. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
