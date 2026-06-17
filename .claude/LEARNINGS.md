# Learnings

Durable, hard-won rules. Append when you hit a sharp edge (the SessionEnd hook nudges you). Keep each a one-liner with the _why_.

- **Pricing is server-authoritative.** Never compute/trust a total client-side; the Stripe amount comes from `getCartTotals`, not the request body. (Red-team C1/C2.)
- **Tax on the discounted _taxable_ base**, not a pro-rata scale of the rounded aggregate — otherwise a flat promo over mixed taxable/exempt lines misstates CA tax.
- **`is_host()` reads a custom `app_role` claim** — Supabase reserves the top-level `role` claim for the Postgres role.
- **Realtime presence seat must be stable** (from the session JWT), not a fresh `crypto.randomUUID()` per subscribe, or presence shows ghosts.
- **Stripe `create-intent` needs an idempotency key** (`pi_{cart}_{amount}`) or a double-submit mints two intents.
- **Keep `apps/qr/lib/tax.ts` in sync with the SQL `mms_line_tax`** — they're two mirrors of one rule.
- **Server Actions are public POST endpoints** — authz every one (session membership + lock) before mutating; they're IDOR by default.
- **No card path runs until the M1 gate** in `docs/REVIEW.md` is clear (sign the table-session JWT, Payment Element, action authz, webhook reconcile).
- **QR `0001` collides with the live delivery schema** — `carts`/`orders`/`order_items`/`menu_items` already exist there, so `create table if not exists` silently no-ops. Reconcile (namespace `qr_*`, read the real `menu_items` in cents, source `tax_category`) before any M1 pay-path query. See `docs/DATA_RECONCILIATION.md`.
- **pnpm 10+ moved `overrides` to `pnpm-workspace.yaml`** (the `pnpm` field in package.json is ignored) and gates dependency install scripts via an **`allowBuilds`** map — approve `sharp`/`unrs-resolver`, skip funding-only postinstalls like `core-js`.
- **pnpm 11 enforces a `minimumReleaseAge` supply-chain guard** — delete the lockfile and re-resolve so it auto-picks the newest version _older_ than the cutoff; a committed lockfile with too-new entries fails verification (not `--frozen` installs).
- **TS auto-inclusion of `@types` doesn't traverse pnpm's symlinked store** — declare `@types/node` on server-only packages and set `types: ["node"]`, or `process`/`server-only` go missing.
- **Derive Stripe's `apiVersion` type from `ConstructorParameters<typeof Stripe>[1]`** — the SDK renamed/removed `Stripe.LatestApiVersion` across majors; pin the literal the SDK ships (e.g. `2026-05-27.dahlia`).
- **ESLint 10 breaks `eslint-plugin-react` 7.x / `eslint-config-next`** (`contextOrFilename.getFilename` removed) — stay on latest ESLint 9 to keep `next/core-web-vitals` (a11y/perf) lint working.
- **Turbopack's `next/font/google` fetcher ignores the system CA store** — set `NEXT_TURBOPACK_EXPERIMENTAL_USE_SYSTEM_TLS_CERTS=1` (done in `next.config.ts`) when building behind a TLS-intercepting proxy.
