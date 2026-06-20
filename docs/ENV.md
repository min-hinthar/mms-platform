# Environment & secrets — wiring map (M1·P1.6)

How the app's env vars map onto Vercel environments. **Secrets live only in Vercel project settings
and GitHub Actions secrets — never in git** (`.gitignore` covers `.env*` except `.env.example`). To
run locally, copy [`.env.example`](../.env.example) → `apps/qr/.env.local` and fill in **test** values.

> ⚠️ **Sandbox caveat** (Claude Code remote / CI): this sandbox injects `NEXT_PUBLIC_SUPABASE_*` +
> `SUPABASE_SERVICE_ROLE_KEY` pointing at the **delivery** project, and Next lets real shell env
> override `.env.local` — so a local `pnpm dev`/build here hits delivery unless you inline-override
> (see `.env.example` / `docs/HANDOFF.md`). Vercel runtime env is separate.

## The variables

| Variable                                        | Scope         | Secret? | Used by                                                                |
| ----------------------------------------------- | ------------- | ------- | ---------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`                      | client+server | no      | every Supabase client (`@mms/db`)                                      |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`¹                | client+server | no      | public/anon reads (RLS-gated), anon auth                               |
| `SUPABASE_SERVICE_ROLE_KEY`                     | **server**    | **yes** | `serviceClient()` — authoritative writes, **bypasses RLS**             |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`            | client        | no      | `getStripePromise()` — mounts the Payment Element                      |
| `STRIPE_SECRET_KEY`                             | **server**    | **yes** | `getStripe()` — create-intent                                          |
| `STRIPE_WEBHOOK_SECRET`                         | **server**    | **yes** | `/api/stripe/webhook` signature verification                           |
| `STRIPE_API_VERSION`                            | server        | no      | optional override; defaults to the SDK's pinned version                |
| `NEXT_PUBLIC_POSTHOG_KEY`                       | client+server | no²     | analytics (client init + server capture)                               |
| `NEXT_PUBLIC_POSTHOG_HOST`                      | client+server | no      | PostHog UI host (events proxy first-party via `/ingest`)               |
| `QBO_SYNC_ENABLED`                              | **server**    | no      | `"true"` arms the QBO sync; unset/anything-else = no-op                |
| `QBO_ENV`                                       | **server**    | no      | `sandbox` (default) or `production` — picks the QBO API host           |
| `QBO_REALM_ID`                                  | **server**    | no      | the QBO company id                                                     |
| `QBO_CLIENT_ID` / `QBO_CLIENT_SECRET`           | **server**    | **yes** | Intuit app OAuth2 credentials                                          |
| `QBO_REFRESH_TOKEN`                             | **server**    | **yes** | OAuth2 refresh token → minted access tokens (rotates, see QBO_SYNC.md) |
| `QBO_CUSTOMER_REF` / `QBO_CLEARING_ACCOUNT_REF` | **server**    | no      | generic-diner customer + Stripe **clearing** account ids               |
| `QBO_ITEM_SALES_REF`                            | **server**    | no      | the product/service item paid-order lines map to                       |
| `QBO_ITEM_{SERVICE,TAX,TIP}_REF`                | **server**    | no      | item ids for the service-charge / sales-tax / tip lines (only if used) |

¹ Either `NEXT_PUBLIC_SUPABASE_ANON_KEY` **or** `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is accepted
(new Supabase key naming); set one. ² A PostHog **project** key is a publishable write-only key — not
a secret, but still set it per-environment.

The server reads are **fail-fast** (P1.6): a missing `NEXT_PUBLIC_SUPABASE_URL` /
`SUPABASE_SERVICE_ROLE_KEY` / publishable key throws `Missing required env var: …`
(`packages/db/src/server.ts`), and a missing `STRIPE_WEBHOOK_SECRET` returns a clear 500
("Webhook not configured") instead of `undefined` surfacing as a cryptic failure several layers down.

## Vercel environment matrix

One Vercel project (`apps/qr`). Set the same keys in each environment with the right values:

| Vercel env        | Supabase project                   | Stripe keys | Notes                                                                 |
| ----------------- | ---------------------------------- | ----------- | --------------------------------------------------------------------- |
| **Preview** (PRs) | QR project `fasnpdhtvqtzjlvruqcu`³ | **test**    | `pk_test_…`/`sk_test_…`; webhook → a test endpoint or `stripe listen` |
| **Production**    | QR prod project                    | **live**    | `pk_live_…`/`sk_live_…`; live webhook endpoint secret                 |

³ Today QR runs one Supabase project for dev+preview+prod. When QR gets live traffic, add a dedicated
**staging** project and point **Preview → staging, Production → prod** (BACKEND_ARCHITECTURE §7 P1.6).

### Wiring Preview (what unblocks the Payment Element on PR previews)

1. Vercel → Project → **Settings → Environment Variables**, scope **Preview**.
2. Add all rows above with **test** Stripe keys + the QR Supabase URL/keys.
3. **Stripe webhook:** create a test endpoint at `https://<preview-url>/api/stripe/webhook`
   (events `payment_intent.succeeded` + `payment_intent.payment_failed`) and paste its
   `whsec_…` as `STRIPE_WEBHOOK_SECRET`. For local dev: `stripe listen --forward-to
localhost:3000/api/stripe/webhook` prints a temporary one.
4. **Supabase:** anonymous sign-ins must be **on** for the project (Auth → Providers) — already
   enabled on `fasnpdhtvqtzjlvruqcu`.

> Preview URLs are per-deployment; a wildcard test webhook (or `stripe listen` during manual smoke
> tests) avoids re-registering an endpoint per PR.

### Wiring Production (the live-mode cutover)

Do this once, when QR goes live. **Live keys mean real charges** — keep them out of git and out of
Preview; they belong only in Vercel **Production** scope + the Stripe **live** dashboard. The
`whsec_…` and `sk_live_…` are per-environment _and_ per-mode — a preview/`stripe listen` secret will
**not** verify live events.

1. **Activate the Stripe account for live payments** (Stripe → Activate / complete the business
   profile). Live keys (`pk_live_…`/`sk_live_…`) don't exist until then.
2. Vercel → Project → **Settings → Environment Variables**, scope **Production** only:
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` = `pk_live_…`
   - `STRIPE_SECRET_KEY` = `sk_live_…`
   - the **prod** Supabase URL + anon/publishable key + `SUPABASE_SERVICE_ROLE_KEY`, and the PostHog
     keys. (Leave `STRIPE_WEBHOOK_SECRET` until step 4.)
3. **Create the LIVE webhook endpoint** — Stripe → Developers → **Webhooks** (toggle **live mode**) →
   Add endpoint:
   - URL `https://<prod-domain>/api/stripe/webhook`
   - Events: **`payment_intent.succeeded`** _and_ **`payment_intent.payment_failed`** — the only two
     the handler acts on (succeeded fulfills the order; failed is analytics-only).
4. Copy that endpoint's **Signing secret** (`whsec_…`) → Vercel Production `STRIPE_WEBHOOK_SECRET`.
5. **Redeploy Production** (env changes don't apply to an existing build).
6. **Smoke-test live**: a real card for a small amount, then refund — confirm a `qr_orders` row
   (`status='paid'`, `pickup_slot`/`fire_at` set) and a **200** on the delivery in Stripe → Webhooks.

> Failure modes (all self-heal — Stripe retries non-2xx for up to 72h and `mms_fulfill_order` is
> idempotent on the PI id, so fixing the secret drains the backlog): a **400 "Bad signature"** on
> every live event ⇒ Production `STRIPE_WEBHOOK_SECRET` is still the test/preview secret (per-endpoint
> AND per-mode); a **500 "Webhook not configured"** ⇒ it's unset in Production.

> When QR gets a dedicated **staging** project (BACKEND_ARCHITECTURE §7), point **Production → prod
> Supabase** and **Preview → staging** so a preview PR can never write the live ledger.

## CSP note (P1.6)

No env var configures the Content-Security-Policy — it's emitted per-request in `apps/qr/proxy.ts`
with a fresh nonce. If you add a new external origin (script/style/connect/frame/img), allow-list it
**there** (and in `next.config.ts` only for the non-CSP static headers). See `proxy.ts` for the
directive map.
