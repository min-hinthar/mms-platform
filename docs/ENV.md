# Environment & secrets — wiring map (M1·P1.6)

How the app's env vars map onto Vercel environments. **Secrets live only in Vercel project settings
and GitHub Actions secrets — never in git** (`.gitignore` covers `.env*` except `.env.example`). To
run locally, copy [`.env.example`](../.env.example) → `apps/qr/.env.local` and fill in **test** values.

> ⚠️ **Sandbox caveat** (Claude Code remote / CI): this sandbox injects `NEXT_PUBLIC_SUPABASE_*` +
> `SUPABASE_SERVICE_ROLE_KEY` pointing at the **delivery** project, and Next lets real shell env
> override `.env.local` — so a local `pnpm dev`/build here hits delivery unless you inline-override
> (see `.env.example` / `docs/HANDOFF.md`). Vercel runtime env is separate.

## The variables

| Variable                                        | Scope         | Secret? | Used by                                                                                                                                                                                                                                                          |
| ----------------------------------------------- | ------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`                      | client+server | no      | every Supabase client (`@mms/db`)                                                                                                                                                                                                                                |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`¹                | client+server | no      | public/anon reads (RLS-gated), anon auth                                                                                                                                                                                                                         |
| `SUPABASE_SERVICE_ROLE_KEY`                     | **server**    | **yes** | `serviceClient()` — authoritative writes, **bypasses RLS**                                                                                                                                                                                                       |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`            | client        | no      | `getStripePromise()` — mounts the Payment Element                                                                                                                                                                                                                |
| `STRIPE_SECRET_KEY`                             | **server**    | **yes** | `getStripe()` — create-intent                                                                                                                                                                                                                                    |
| `STRIPE_WEBHOOK_SECRET`                         | **server**    | **yes** | `/api/stripe/webhook` signature verification                                                                                                                                                                                                                     |
| `STRIPE_API_VERSION`                            | server        | no      | optional override; defaults to the SDK's pinned version                                                                                                                                                                                                          |
| `NEXT_PUBLIC_POSTHOG_KEY`                       | client+server | no²     | analytics (client init + server capture)                                                                                                                                                                                                                         |
| `NEXT_PUBLIC_POSTHOG_HOST`                      | client+server | no      | PostHog UI host (events proxy first-party via `/ingest`)                                                                                                                                                                                                         |
| `QBO_SYNC_ENABLED`                              | **server**    | no      | `"true"` arms the QBO sync; unset/anything-else = no-op                                                                                                                                                                                                          |
| `QBO_ENV`                                       | **server**    | no      | `sandbox` (default) or `production` — picks the QBO API host                                                                                                                                                                                                     |
| `QBO_REALM_ID`                                  | **server**    | no      | the QBO company id                                                                                                                                                                                                                                               |
| `QBO_CLIENT_ID` / `QBO_CLIENT_SECRET`           | **server**    | **yes** | Intuit app OAuth2 credentials                                                                                                                                                                                                                                    |
| `QBO_REFRESH_TOKEN`                             | **server**    | **yes** | OAuth2 refresh token → minted access tokens (rotates, see QBO_SYNC.md)                                                                                                                                                                                           |
| `QBO_CUSTOMER_REF` / `QBO_CLEARING_ACCOUNT_REF` | **server**    | no      | generic-diner customer + Stripe **clearing** account ids                                                                                                                                                                                                         |
| `QBO_ITEM_SALES_REF`                            | **server**    | no      | the product/service item paid-order lines map to                                                                                                                                                                                                                 |
| `QBO_ITEM_{SERVICE,TAX,TIP}_REF`                | **server**    | no      | item ids for the service-charge / sales-tax / tip lines (only if used)                                                                                                                                                                                           |
| `RESEND_API_KEY`                                | **server**    | **yes** | `lib/email.tsx` — staff email (auth code + invite/deactivation) via the Resend SDK                                                                                                                                                                               |
| `RESEND_FROM`                                   | **server**    | no      | verified sender, e.g. `Mandalay Morning Star <no-reply@mandalaymorningstar.com>`                                                                                                                                                                                 |
| `RESEND_SIGNING_SECRET`                         | **server**    | **yes** | `/api/resend/webhook` — Svix signing secret (`whsec_…`) to verify Resend events                                                                                                                                                                                  |
| `SEND_EMAIL_HOOK_SECRET`                        | **server**    | **yes** | `/api/auth/send-email` — Supabase Send-Email Hook secret (`v1,whsec_…`) to verify it                                                                                                                                                                             |
| `NEXT_PUBLIC_SITE_URL`                          | client+server | no      | canonical prod URL for email links — `https://qr.mandalaymorningstar.com`                                                                                                                                                                                        |
| `KIOSK_DEVICE_TOKEN`                           | **server**    | **yes** | W6b kiosk: the device token in the lobby kiosk's `/kiosk?k=…` bookmark, verified (constant-time) by the kiosk server actions (mint/reset). Long + random (`openssl rand -base64 32`); unset ⇒ the kiosk answers "not configured" (feature off). Rotate by changing the value + updating the bookmark. |
| `BOARD_DEVICE_TOKEN`                            | **server**    | **yes** | W3e order-ready board: the device token in the TV's `/board?k=…` URL, verified (constant-time) by `/api/board`. Long + random (`openssl rand -base64 32`); unset ⇒ the board answers 503 (feature off). Rotate by changing the value + updating the TV bookmark. |

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

## Staff sign-in — Google OAuth (primary) + magic-link + OTP

Staff (`/staff/login`) can sign in three ways; all resolve to the same **email allowlist** (`staff.email`

- the `is_staff` email/uid match), so a staff member is whoever an owner provisioned, regardless of method:

1. **Google OAuth (primary, no email needed).** Configure once:
   - **Google Cloud Console** → APIs & Services → Credentials → **OAuth 2.0 Client ID** (Web). Authorized
     redirect URI: `https://fasnpdhtvqtzjlvruqcu.supabase.co/auth/v1/callback`. Copy the Client ID + Secret.
   - **Supabase** → Authentication → **Providers → Google** → enable + paste ID/Secret.
   - **Supabase** → Authentication → **URL Configuration → Redirect URLs** → add
     `https://qr.mandalaymorningstar.com/staff/auth/callback` (+ preview/localhost URLs as needed).
   - Flow: `signInWithOAuth` → Google → `/staff/auth/callback` (exchanges the code) → `/staff`.
2. **Magic-link + OTP code (email fallback).** Requires the SMTP→Resend setup below. `signInWithOtp`
   sends an email carrying **both** a magic link (→ `/staff/auth/callback`) and the `{{ .Token }}` code
   (entered in-page). Either works; the code is the cross-device-safe path.
   - ⚠️ **Raise the Auth email rate limit.** Supabase → Authentication → **Rate Limits → "Rate limit for
     sending emails"** defaults low; once tripped, GoTrue returns `429 over_email_send_rate_limit` to
     **every** code request for the rest of the window — which surfaces as the "Too many code requests"
     loop on `/staff/login` no matter how long you wait the local 60s. This is GoTrue's own limit (it
     fires _before_ our Send-Email Hook, so it's unrelated to Resend's quota). Raise it for staff use, or
     just use **Google** (no email path, never rate-limited). The login screen now scopes its resend
     cooldown per-address and steers a 429 to Google so a frustrated re-tap can't keep feeding the limit.

> **Bootstrap the first owner:** sign in once with Google (mints the auth user; you'll be bounced as
> non-staff), copy your UID from Supabase → Auth → Users, then
> `insert into public.staff (user_id, email, role, display_name) values ('<uid>','you@…','owner','Min');`
> Refresh `/staff` → owner. (Or dashboard **Add user**, then the same insert.)

## Email — all on Resend + React Email (same stack as the delivery app)

1. **Staff sign-in (magic-link / OTP) — via the Supabase Send-Email Hook (preferred; NO SMTP).** GoTrue
   hands the email to our app, which renders a **React Email** template and sends it through Resend — so
   there's no SMTP to misconfigure (this is what fixed the Gmail `534`/500) or rate-limit. Setup:
   - Supabase → **Authentication → Hooks → Send Email Hook** → enable, type **HTTPS**, URL
     `https://qr.mandalaymorningstar.com/api/auth/send-email`. Copy the generated **secret** (`v1,whsec_…`)
     into `SEND_EMAIL_HOOK_SECRET` in Vercel.
   - Set `RESEND_API_KEY` + `RESEND_FROM` (the hook sends via Resend). The email leads with the **6-digit
     code** (typed on `/staff/login`, immune to link-prefetchers) + a secondary magic-link button.
   - The route (`/api/auth/send-email`) verifies the Standard-Webhooks signature + a ±5-min replay window
     before sending; a send failure returns 500 so GoTrue surfaces it (the user is waiting on the code).
   - _SMTP alternative (only if you skip the hook): Supabase → Auth → SMTP Settings → Resend
     (`smtp.resend.com`, user `resend`, pass = Resend API key) + a **code-only** Magic Link template
     (`{{ .Token }}`, drop `{{ .ConfirmationURL }}` so a scanner can't consume the shared token)._
2. **App transactional email** (staff invite + deactivation notice — `apps/qr/lib/email.tsx`, React Email)
   is sent by the app via the **Resend SDK** (`RESEND_API_KEY` + `RESEND_FROM`). Best-effort + fired from
   `after()` so a Resend outage never fails provisioning; unset keys ⇒ the send is skipped (logged) and
   the action still succeeds. No CSP change — the SDK runs server-side only (no browser `connect-src`).
3. **Email events webhook** (`/api/resend/webhook`) — in the Resend dashboard add a webhook pointing at
   `https://qr.mandalaymorningstar.com/api/resend/webhook`, and paste its **Svix signing secret**
   (`whsec_…`) as `RESEND_SIGNING_SECRET`. The route verifies the Svix signature + a ±5-min replay
   window, then flags bounces/complaints in logs (masked recipient + opaque `email_id` — no PII, no
   recipient to analytics) and captures PII-free deliverability events to PostHog. Like the Stripe
   webhook it's a signed public endpoint (the middleware matcher skips `/api`). _Note: a `RESEND_WEBHOOK`
   env was provisioned but isn't consumed by the code — the signing secret (`RESEND_SIGNING_SECRET`) is
   all the handler needs; the endpoint URL lives in the Resend dashboard._

## CSP note (P1.6)

No env var configures the Content-Security-Policy — it's emitted per-request in `apps/qr/proxy.ts`
with a fresh nonce. If you add a new external origin (script/style/connect/frame/img), allow-list it
**there** (and in `next.config.ts` only for the non-CSP static headers). See `proxy.ts` for the
directive map.
