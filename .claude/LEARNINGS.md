# Learnings

Durable, hard-won rules. Append when you hit a sharp edge (the SessionEnd hook nudges you). Keep each a one-liner with the *why*.

- **Pricing is server-authoritative.** Never compute/trust a total client-side; the Stripe amount comes from `getCartTotals`, not the request body. (Red-team C1/C2.)
- **Tax on the discounted *taxable* base**, not a pro-rata scale of the rounded aggregate — otherwise a flat promo over mixed taxable/exempt lines misstates CA tax.
- **`is_host()` reads a custom `app_role` claim** — Supabase reserves the top-level `role` claim for the Postgres role.
- **Realtime presence seat must be stable** (from the session JWT), not a fresh `crypto.randomUUID()` per subscribe, or presence shows ghosts.
- **Stripe `create-intent` needs an idempotency key** (`pi_{cart}_{amount}`) or a double-submit mints two intents.
- **Keep `apps/qr/lib/tax.ts` in sync with the SQL `mms_line_tax`** — they're two mirrors of one rule.
- **Server Actions are public POST endpoints** — authz every one (session membership + lock) before mutating; they're IDOR by default.
- **No card path runs until the M1 gate** in `docs/REVIEW.md` is clear (sign the table-session JWT, Payment Element, action authz, webhook reconcile).
