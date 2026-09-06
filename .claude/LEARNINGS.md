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
- **QR `0001` collides with the live delivery schema** — `carts`/`orders`/`order_items`/`menu_items` already exist there, so `create table if not exists` silently no-ops. **Reconciled (M1·P1.0):** session tables are namespaced `qr_*`; the menu is delivery-owned (read `menu_items` in cents + normalized `modifier_options`); `tax_category` is QR-owned via `mms_menu_tax_category`. See `docs/DATA_RECONCILIATION.md`.
- **Money is integer cents end-to-end** (delivery parity) — `CartTotals`/`CartItem`, `lib/tax.ts`, the migrations, Stripe `create-intent`. The old QR `numeric` dollars are gone; format `/100` only at the UI edge.
- **`loyalty_rewards.user_id` is `NOT NULL`** — anonymous QR diners can't earn gems until an account link (M4); don't wire gem awards into `mms_fulfill_order` before then.
- **supabase-js infers PostgREST embeds as arrays without generated Database types** — a to-one FK embed (e.g. `menu_items(... menu_categories(...))`) returns a single object at runtime; cast through `unknown` to the object shape.
- **Validate modifier choices server-side by intersection** — `modifier_options` and `item_modifier_groups` are siblings joined through `modifier_groups` (no direct FK), so fetch the item's allowed `group_id`s and filter, or a client can price a foreign/cheaper option.
- **Supabase branching needs the Pro plan** — on the free org you can't spin a branch to test a migration; validate data-dependent SQL read-only and apply on a branch post-upgrade. Never DDL prod directly (locks `realtime.messages` etc.). We use a dedicated **staging project** instead.
- **Anonymous Auth on a SHARED project grants every diner the `authenticated` role** — so the _other_ app's `authenticated` RLS (`to authenticated using (true)`) becomes reachable by anon diners. Audit those policies on staging (add `(select (auth.jwt()->>'is_anonymous'))::boolean is not true`) before enabling anon sign-ins on prod. See `docs/BACKEND_ARCHITECTURE.md §1`.
- **`SECURITY DEFINER` functions are exposed via `/rest/v1/rpc` to anon/authenticated by default** — `revoke execute` (or make them `SECURITY INVOKER`) for any not meant to be client-callable (advisors 0028/0029). And **pin `search_path`** on every function (schema-qualify the body when set to `''`).
- **Wrap `auth.<fn>()` as `(select auth.fn())` in RLS** policies/functions, or it re-evaluates per row (advisor 0003 auth_rls_initplan). One permissive policy per role/action (advisor 0006).
- **Index every foreign key** (covering index) — Supabase advisor 0001; the hot RLS lookup path (`session_members.seat_id = auth.uid()`) needs its own index too.
- **The delivery app uses CLI-style timestamped migrations** (`<utc>_name.sql`); converge the QR migrations to `supabase/migrations/` so both apps share one ordered history (`supabase db push`).
- **A "new" Supabase project can ship pre-seeded with template tables/triggers** — `list_tables` + inspect before applying anything. A leftover `handle_new_user` trigger on `auth.users` breaks anonymous sign-ins once its target table is dropped (drop the function `cascade`). QR runs on its OWN project now (`fasnpdhtvqtzjlvruqcu`, own org) — catalog owned here, `tax_category` a column, no shared-project blast radius.
- **Postgres grants `EXECUTE` to `PUBLIC` on new functions**, and Supabase grants `anon`/`authenticated` `SELECT` on new public tables — to lock a `SECURITY DEFINER` fn you must `revoke ... from public` (not just anon/authenticated), then `grant` back to `service_role`/`authenticated` as needed. Init-migration revokes that targeted only anon/authenticated left `mms_fulfill_order` callable (advisor 0028/0029).
- **pg_graphql lists every table a role can `SELECT`** in the GraphQL schema (advisors 0026/0027) — RLS gates rows, not schema discoverability; `revoke select ... from anon` on session-scoped tables (QR diners are `authenticated` via anon-auth, so they keep RLS-gated SELECT).
- **The Supabase MCP is scoped per `project_ref`** — repoint the hosted connector URL (`?project_ref=...`, or drop it for org-wide) to reach a newly created project; pull any cross-project seed data BEFORE switching scope (you lose access to the old ref).
- **The sandbox injects `NEXT_PUBLIC_SUPABASE_*` + `SUPABASE_SERVICE_ROLE_KEY` pointing at the DELIVERY project** (`ukuzkhuppqwtrdkjqrkv`), and Next.js lets real shell env override `.env.local` — so local `pnpm dev`/build here hits delivery unless you inline-override (`NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_ANON_KEY=… pnpm --filter @mms/qr dev`). Vercel runtime env is separate (set in the dashboard). The QR app's project is `fasnpdhtvqtzjlvruqcu`.
- **Public catalog reads use `publicClient()` (anon/publishable key), not service-role** — public-read RLS covers `menu_*`/`grocery_items`; never hand the service-role key to a public render path. Accept either `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `…_PUBLISHABLE_KEY` (new Supabase key naming).
- **React splits static `$` from a dynamic `{price}`** with an invisible text-node marker, so rendered HTML reads `$<!-- -->18.00` — grep the number (`18.00`), not `\$18.00`, when smoke-testing prices.
- **`claude-code-action@v1` skips on a `pull_request` unless the workflow file is byte-identical to the copy on `main`** (anti-tampering guard) — so a PR that edits `.github/workflows/claude-*.yml` gets **no auto-review of itself**: the `review`/`security` jobs exit in ~2s posting nothing, yet report "success." Don't mistake the fast-green checks for a passing review. Real reviews resume on the _next_ PR after the workflow change merges to `main`. The GH-side auto-fixer (`claude-fix-pr-comments.yml`) only fires on `pull_request_review`/review-comment events, so it's dormant until reviews actually post. (Also keep its `pnpm/action-setup` version == `packageManager` in package.json, or `--frozen-lockfile` breaks.)
- **pnpm 10+ moved `overrides` to `pnpm-workspace.yaml`** (the `pnpm` field in package.json is ignored) and gates dependency install scripts via an **`allowBuilds`** map — approve `sharp`/`unrs-resolver`, skip funding-only postinstalls like `core-js`.
- **pnpm 11 enforces a `minimumReleaseAge` supply-chain guard** — delete the lockfile and re-resolve so it auto-picks the newest version _older_ than the cutoff; a committed lockfile with too-new entries fails verification (not `--frozen` installs).
- **TS auto-inclusion of `@types` doesn't traverse pnpm's symlinked store** — declare `@types/node` on server-only packages and set `types: ["node"]`, or `process`/`server-only` go missing.
- **Derive Stripe's `apiVersion` type from `ConstructorParameters<typeof Stripe>[1]`** — the SDK renamed/removed `Stripe.LatestApiVersion` across majors; pin the literal the SDK ships (e.g. `2026-05-27.dahlia`).
- **ESLint 10 breaks `eslint-plugin-react` 7.x / `eslint-config-next`** (`contextOrFilename.getFilename` removed) — stay on latest ESLint 9 to keep `next/core-web-vitals` (a11y/perf) lint working.
- **Turbopack's `next/font/google` fetcher ignores the system CA store** — set `NEXT_TURBOPACK_EXPERIMENTAL_USE_SYSTEM_TLS_CERTS=1` (done in `next.config.ts`) when building behind a TLS-intercepting proxy.
- **`getCartTotals` must stay an internal (non-`"use server"`) fn**, not a Server Action — the signature-verified Stripe **webhook** calls it server-to-server with no diner cookie, so member-authz can't live inside it. It moved to `lib/totals.ts`; authz lives at the client-facing callers (`create-intent`, cart page). A `"use server"` export is also a public POST → authz'ing it there would still leave an IDOR-read for the webhook path. One membership guard (`lib/authz.ts`) is called by every mutation (RED-TEAM #2).
- **Verify a Bearer token with `getUser(token)`, not `getUser()`** — passing the JWT does a network verify against the auth server; the no-arg form reads the local session, which a fresh non-persisting `sessionClient(token)` doesn't have. `seat_id`/`by_seat` come from that verified `auth.uid()`, never a client-asserted value.
- **`supabase gen types --local` ≠ the remote `--project-id` gen** — it omits the hand-added header + the `__InternalSupabase`/`PostgrestVersion` block and (without `--schema public`) adds `graphql_public`. For a stable `types-fresh` CI: commit the **raw** `gen --local --schema public` output, **prettier-ignore** `database.types.ts`, and **pin the CLI version** in CI so the diff is byte-identical. `pnpm db:types` regenerates it the same way.
- **`supabase start` in this sandbox needs `-x edge-runtime`** (the edge-runtime container fails on an rlimit + a TLS-intercept reaching npmjs; we have no edge functions). Start the Docker daemon first (`sudo dockerd &`). Migrations + seed apply regardless — enough to validate `migrations-check` and regenerate types. (No `minimumReleaseAge` is actually configured here — adding a normal pinned dep like `zod` just works; don't nuke the lockfile.)
- **Never `echo "$big" | grep -q PATTERN` under `set -o pipefail`** — `grep -q` exits on the first match and closes the pipe, so `echo` dies with EPIPE (141); pipefail then makes the pipeline status 141, and a **matched** pattern reads as a FAILURE. This silently broke the `adversarial-pr` gate (a real `ADVERSARIAL_VERDICT: PASS` in a multi-MB exec log read as "no verdict"). Match with pure-bash `case "$big" in *"PATTERN"*)` (no subprocess/pipe → no EPIPE), and capture `gh`/command output into a var first. Verified by replaying a 4.8 MB input locally.
- **GitHub's add-labels endpoint creates labels that don't exist** — applying a new label name to an issue/PR (`issue_write` `labels:[...]`) creates it repo-wide (there's no `create_label` in the GitHub MCP, but apply-to-create works; removing it from the issue later leaves the label in place). Verify auth/config state by probing the live endpoint (e.g. anonymous `POST /auth/v1/signup` → 200 + `is_anonymous` means anon sign-ins are on) instead of asking the user.
- **Front-load money/auth hardening in the FIRST commit — don't let the adversarial gate tease it out round by round.** P1.2 took 5 fix passes because the initial build shipped a "happy-path" cart and the reviews discovered the hardening incrementally. On any money/auth/DB-write feature, do these up front, not reactively: (a) **status-atomicity on EVERY mutation path** — carry the guard (`status='open'`) into the SQL statement, not just one path (insert/increment/setQty/delete/promo were fixed one-at-a-time); (b) **bound inputs at the DB too** — Zod `.max()` + a column `CHECK`, not just the client; (c) **EXECUTE lockdown** — `revoke … from public` + `grant … to service_role` (the anon/authenticated-only revoke is a no-op; see the PUBLIC-grant rule above); (d) **wrap every swallowed error** on a write/read used for UX (a swallowed insert error → a silently-broken session; a swallowed `refresh()` 403 → a false "couldn't add"); (e) **a11y consistency** in one go (`aria-atomic` on live regions, `<span>` not `<output>` for non-announced values, `aria-describedby` not `title`). A 10-minute self-adversarial-pass before opening the PR beats 5 CI rounds. **Now codified as the _Pre-PR self-review sweep_ in `CLAUDE.md` — run it on the diff.**
- **Server Action errors are REDACTED in production** (generic message + digest), so the client CANNOT branch on `e.message`/custom props across the action boundary (`msg.includes("Invalid")` and a typed `code` both fail in prod). For per-reason client UX, RETURN a result discriminant from the action; don't throw-and-inspect. Throwing is fine for "fail the mutation," not for "tell the user which reason."
- **Don't run the adversarial pass (or full auto-review) on every push** — it's token-metered and re-surfaces the same findings each round. Wire **adversarial-pr as a pre-merge gate** (`labeled: adversarial` only) and **review/security on `opened`/`ready_for_review` + an on-demand `review` label**, no-op'ing to success on plain `synchronize` so required-check gating still reports green on the head SHA. (`.github/workflows/{adversarial-pr,claude-review}.yml`.)
- **Stripe appends `payment_intent` + `payment_intent_client_secret` + `redirect_status` to the Payment Element `return_url`** on redirect — so `/track` keys the order lookup off `payment_intent` (matches `qr_orders.stripe_payment_intent_id`) with no extra plumbing. The order row is written **async** by the webhook, so it may not exist at redirect time: subscribe first, then fetch, and keep a bounded fallback re-fetch for the redirect→insert race / cold socket.
- **Realtime Postgres Changes are authorized by the table's RLS** when the client subscribes with the anon-auth token (`supa.realtime.setAuth(accessToken)`) — no broadcast/`realtime.messages` policy needed (that's for Broadcast/Presence). Add the table to the `supabase_realtime` publication (guarded/idempotent `do $$ … alter publication …`); it's not a schema change so `types-fresh` won't drift. `/track` filters by `stripe_payment_intent_id=eq.…` and `qr_order_read` (`is_member`) ensures a guessed id leaks nothing.
- **Build UI to the prototype + research in the FIRST commit — don't let review tease out the craft.** Same failure mode as the money-path one, for UX: P1.2 shipped functional UI and review surfaced the craft/a11y ("86'd"→"Sold out", `aria-atomic`, focus-on-remove, `title`→`aria-describedby`). Before writing a screen, read **`docs/prototype/v7.2.html`** (the graded ≈4.3 visual/interaction reference), **`docs/context/DESIGN-RESEARCH.md`** (component/motion/voice bar — and the FTC review-gating trap to NOT copy), **`docs/context/RUBRIC.md`** (the ≥4.3 bar), and **`docs/context/QA-CHECKLIST.md` §A** (a11y). Match it up front: tokens from `@mms/ui/tokens.css` (never hardcoded colors; light = editorial, dark = Night), motion timing + spacing + contrast, real semantics (button vs link, 44px targets, ONE polite live region, focus management on remove/route), brand-voice microcopy. **Self-check the built screen against v7.2 before opening the PR.** The review + adversarial prompts now cross-check this, so drift fails the gate — but catching it pre-PR is cheaper. **Now codified as the _Pre-PR self-review sweep_ in `CLAUDE.md`.**
- **The adversarial-escape pattern across M1·P1.3→P1.5 is NOT the core — it's three categories I keep deferring to the gate:** (1) **per-element a11y completeness** (44px targets, an accessible name on every control/list/region, `role="list"` under `list-style:none`, exactly ONE live region, `prefers-reduced-motion`), (2) **error/recovery states** (a swallowed `{ error }`, a missing `timedOut`/failure UI that strands the user, an un-drained serverless side-effect → `after()`), (3) **verbatim v7.2 copy + no false promises**. First commits were clean on money/auth/RLS/tokens; the gate still took 2–3 rounds purely on these. **Run the `CLAUDE.md` Pre-PR self-review sweep on the diff before opening** — author the completeness, let the gate be the backstop. _Corollary:_ not every Low is a real miss — the gate keeps surfacing new marginal nitpicks (fractional px, `aria-live` redundancy); once it's zero-Critical/High with only acceptable Lows, **merge rather than loop** (each round is a metered pass + churn).
- **Reviews run IN-SESSION, not in CI (decided M1, June 2026).** The Claude review/security/adversarial GitHub Actions were token-metered and drove a reactive loop (P1.5: 6 adversarial rounds, each a metered Action run + a disable-auto-merge / fix / remove-and-re-add-label / re-arm dance). New model: CI keeps only **zero-token, always-green stub checks** (`review`/`security`/`adversarial-pr`) so branch-protection required checks still pass; the **real review is a fresh-context adversarial subagent run in-session at pre-PR + pre-merge** (the `CLAUDE.md` Pre-PR sweep) that **posts its verdict to the PR** for the audit trail. Fresh subagent context = independent eyes; fix before opening/merging; **don't reintroduce a per-push metered Action**. **Update (W22-docs, 2026-08-17):** the stubs themselves are now **gone** too — the stub workflows were deleted and dropped from branch protection, so `ls .github/workflows` is exactly `ci.yml`, `require-docs-update.yml`, `ensure-preview.yml`. Don't hunt for a `review`/`security`/`adversarial-pr` status; there is none to be green. The in-session pass + **two Codex rounds** are the whole review.
- **Always capture regressions + wasted-loops in LEARNINGS the SAME session** — the SessionEnd hook only nudges (it can't author), so the durable channel is you writing it down now (LEARNINGS loads at SessionStart). Concrete trap from P1.5: reactively narrowing a conditional per review-finding (`processing && !arrived` → `!processing && arrived`) introduced a round-6 regression; the real fix was the **canonical invariant** (`arrived ? 0 : -1`) that satisfied every prior round at once. **When the gate flags the same area twice, stop patching per-finding — find the one invariant.**
- **Next 16 renamed the `middleware` convention to `proxy`** — use `apps/qr/proxy.ts` exporting `export function proxy(req)` (same Edge runtime + `config.matcher` API). `middleware.ts` still works but warns "deprecated"; shipping **both** files throws build error E900. Authoritative in the SDK: `dist/build/templates/middleware.js` → `const isProxy = page==='/proxy'; const handler = (isProxy ? mod.proxy : mod.middleware) || mod.default`.
- **Nonce CSP needs `force-dynamic`, or static pages break.** Next reads the nonce from the **request** `content-security-policy` header (`get-script-nonce-from-header`, `app-render.js`) and stamps it onto its `<script>` tags — but only during a **per-request render**. A statically prerendered shell bakes its scripts at build time with no nonce, so `'strict-dynamic'` (which ignores host/`'self'` allow-lists) blocks them → no hydration. Set `export const dynamic = "force-dynamic"` in the root layout so the proxy's per-request nonce reaches every route. Verify: the response CSP nonce must equal the nonce on every rendered `<script>`, and rotate per request.
- **`'strict-dynamic'` is what lets you drop `script-src 'unsafe-inline'`** — it trusts the nonced bootstrap + whatever it loads at runtime (Stripe.js via `loadStripe`, PostHog via the same-origin `/ingest` proxy), so you don't have to allow-list their hosts (kept only as a CSP2 fallback). CSP **must** live in the proxy (per-request nonce), not `next.config` `headers()`; keep the nonce-free headers (Referrer-Policy/nosniff/Permissions-Policy/HSTS) in `next.config` so they still cover the API/static responses the proxy matcher skips.
- **`Permissions-Policy: camera=()` blocks first-party camera too** (empty allow-list = no origin, including self) — a `getUserMedia` feature (the grocery Scan & Go viewfinder) needs `camera=(self)`. Keep mic/geo `=()` (unused). Latent since P0.6; caught in the P1.6 security-header sweep.
- **Fail-fast env over `process.env.X!`** — the non-null assertion hands `undefined` straight to `createClient`/`constructEvent`, which resurfaces as a cryptic auth/network/"Bad signature" error layers down (and once masked the delivery-vs-QR project mix-up). A `requireEnv(name)` that throws `Missing required env var: …` (read at call time, not import — so a misconfig fails the request, not the build) names the problem at the boundary. Server secrets only; the browser client keeps literal `process.env.NEXT_PUBLIC_*` reads so Next can inline them.
- **`revoke … from public` ALONE does NOT lock a new public-schema function from anon/authenticated** — Supabase _also_ explicitly grants EXECUTE to `anon` AND `authenticated` on new functions, on top of the PUBLIC default. So a SECURITY DEFINER fn needs `revoke all … from public, anon, authenticated` (the existing locked fns got anon/authenticated in the init + public in lockdown — together). Verified live: revoke-from-public-only left `mms_promo_consume` anon-callable via `/rest/v1/rpc` → a diner could call it directly to burn redemptions and exhaust a code's `max_uses`. **Always `get_advisors` (security) after a function migration AND verify `has_function_privilege('anon', fn, 'execute') = false`** — the advisor (0028/0029) catches this; the adversarial subagent reasoned the documented `from public` pattern was enough and missed it.
- **CI green ≠ migration applied to the live project.** CI only boots a _local_ stack; nothing auto-applies migrations to the hosted project. Discovered the live QR project was missing P1.5's `track_realtime` (qr_orders wasn't in the realtime publication → `/track` live updates silently broken on prod, even though P1.5 merged). After a migration merges, **apply it to live** (MCP `apply_migration` / `supabase db push`) and verify the actual object state — don't assume.
- **Regenerate types locally without a preinstalled CLI:** download the _pinned_ version (CI uses 2.107.0) from GitHub releases (`supabase_linux_amd64.tar.gz`), `sudo dockerd &`, `supabase start -x edge-runtime,studio,imgproxy,logflare,vector,mailpit`, then `gen types --local --schema public`. The `@supabase/pg-delta` / edge-runtime npm-fetch TLS error at boot is benign — the DB migrations still apply, which is all `gen types` + a SQL smoke test need.
- **Capacity-limited slots must count in-progress HOLDS, not just committed rows.** Pickup capacity counted only `qr_orders.status='paid'` — but a paid row exists only AFTER the webhook fulfills, so during the whole order→pay window a slot looked emptier than it was and N diners could all book the last seat (the adversarial pass caught this; my paid-only smoke test missed it). Fix: `booked = paid orders + open carts holding the slot` (session active, `updated_at` within a `hold_minutes` TTL so abandoned holds free up), a **per-slot advisory lock** (`pg_advisory_xact_lock(hashtext(slot::text))`) so the check-then-set can't overbook, and a `p_exclude_cart` arg so a diner sees their OWN slot's true availability (re-pick works; the create-intent re-check must exclude self too, or it rejects the diner's own in-progress order). Chose holds+lock over a hard cap in `mms_fulfill_order` because raising there → a charged diner with no order (the P1.4 failure).
- **TZ-aware slot generation:** `(local_date + open_time::time) at time zone cfg.tz` converts a wall-clock time to the correct absolute instant (DST included); `generate_series(open, close, interval)` then yields slot boundaries. Store slots as `timestamptz`, render in the shop's tz (`toLocaleTimeString({ timeZone })`) — never the device's. "Today only" after close → the series filters empty → the UI honestly says "no times left."
- **"Today only" slot scheduling strands after-hours browsers.** Pickup slots generated only for the current day → a 9pm visitor (shop closed at 6:30pm) sees "no times left" with no way to pre-order — the user hit this on the first preview click. Fix: generate across today + `horizon_days` (a tz-aware day loop: `generate_series(0, horizon) × lateral generate_series(greatest(day_open, now+lead), day_close, interval)`), group the UI by day (Today/Tomorrow/weekday), and prefix the day on the chip/ETA when it isn't today. Always sanity-check time-windowed features against the CURRENT wall-clock in the target tz before declaring done — mine passed a widened-hours smoke test but showed empty live because it was evening in LA.
- **Anchor slot grids at a STABLE wall-clock open, then FILTER by `now+lead` — never anchor `generate_series` AT `now+lead`.** The "today only" fix above (0200) wrote the day loop as `generate_series(greatest(day_open, now+lead), day_close, interval)` — putting `now+lead` in the series LOWER BOUND. For today that anchors the grid on a non-aligned instant that drifts every second: slots rendered off-grid (11:18, 11:33, …) AND — because BOTH `mms_set_pickup_slot` and the create-intent pay-boundary check **regenerate** the grid to re-validate the stored slot — a validly-picked same-day slot matched nothing on the freshly-anchored grid → set returned `unavailable` / checkout **409'd "that pickup time just filled"**, false-rejecting _every_ same-day pickup across the whole operating window (any time `now+lead > open`). Fix (0300): `generate_series(day_open, day_close, interval)` (anchored at the aligned open) **+ `where slot >= now+lead`** (the filter, not the anchor, drops past/too-soon slots). **Invariant: the instant a diner picks must be reproducible second-for-second at re-validation, so the series anchor must NOT depend on `now` — only the WHERE filter may.** The after-hours manual test only exercised the next-day path (anchored at _tomorrow's_ open = already aligned) and missed it; the **pre-merge adversarial subagent** caught it. (Sharpens #62/#63: tz slot-gen is necessary but not sufficient — anchor stability is the other half.)
- **Group-cart multi-device join is "one code → one session," schema-light.** A 2nd phone joins the same dine-in cart because `/api/session` find-or-joins by `qr_code` — so make the `qr_code` double as the join key: a scanned **sticker token** (`?t=`) or a **server-minted** unguessable 8-char code (`?j=`) the host shares. No `join_code` column needed; the only DB change is a **partial unique index** `on table_sessions(qr_code) where status='active'` so two phones racing the same code collide (23505) → re-read → converge on ONE session (mirrors `qr_carts_one_open_per_session`; without it you get split-brain, each diner in a different cart). **Indexes + CHECK constraints don't appear in the generated `database.types.ts`, so neither drifts `types-fresh`** — you can harden the DB without the Docker types-regen dance. **Distinguish join intent:** an invite code (`?j=`) must be **join-ONLY** (404 if no active match) — else a fat-fingered code silently mints a phantom table with the typer as host; a sticker (`?t=`) may provision (first scanner = host).
- **Sanitize CLIENT-ASSERTED Realtime presence on INGEST — the Zod/DB caps don't cover it.** The presence guest list renders each peer's `channel.track({ seat, name })` payload, which never passes the `/api/session` Zod cap or the `session_members` column CHECK (those bound only the _durable_ `display_name`). A hostile co-member can `track()` a 40 KB / zero-width / RTL-override name and garble everyone's list (JSX escaping stops script-injection, not layout-break). Clamp on receive: strip `\p{Cc}\p{Cf}`, collapse whitespace, slice. Also key the presence map by the **presence KEY** (the `presence.key` seat), not the payload's `seat` field (a peer can spoof the payload). The adversarial subagent caught the unbounded-name vector; the durable-side caps had lulled me.
- **Presence key MUST be the stable seat, set via `presence: { key: seat }` — and never write the name-tracking ref during render.** Keying by `sessionId` collapses all diners into one key; a fresh id per subscribe makes ghosts (#4). To re-track a changed name without churning the channel (resubscribe = presence flicker), keep the latest name in a ref updated in an **effect** (`useEffect(() => { nameRef.current = name }, [name])`) and `track()` it on (re)subscribe — the React Compiler lint (`react-hooks/refs`) **errors on `nameRef.current = name` during render**. Same family as the React-Compiler rules that bite this repo: `react-hooks/set-state-in-effect` (defer an external-store read like `localStorage` into a `Promise.resolve().then(setState)` callback, never a synchronous effect body) and `preserve-manual-memoization` (a `useCallback` dep array must match the compiler's inference — depend on `session`, not `session?.sessionId`).
- **Live group-cart sync = Postgres Changes (not channel broadcast) → re-fetch the server-authoritative view.** Mirror the `/track` pattern (`lib/useOrderStatus`): a `cart:{cartId}` channel (NON-private — RLS is the gate, not the channel name) with `postgres_changes` on `qr_cart_items` (+ `qr_carts`) filtered to the cart; on any event the consumer re-fetches `getCartView` (keyed React state, never client math). Chose pg-changes over the P0.5 broadcast stub because it's **door-agnostic** (a future staff-POS DB write propagates too) and truly server-sourced. Gotchas: (1) **a line removal is a DELETE; the default replica identity ships only the PK, so a `cart_id=eq.X` filter can't match it → the removal silently won't sync. Set `replica identity full` on `qr_cart_items`** (publication membership + replica identity are both invisible to the generated types → no `types-fresh` drift). (2) **Announce a peer's ADD only on INSERT** (`by_seat` = the verified adder, a reliable "who"); a qty-bump is an UPDATE carrying the _original_ adder's `by_seat`, and a remove is a DELETE — so attributing those would lie. Refresh silently on UPDATE/DELETE; announce only INSERTs where `by_seat !== my seat`. (3) **Add a `.subscribe(status => …)` callback** — on `SUBSCRIBED` re-fetch to self-heal changes missed while the socket was down (and the gap between the initial SSR render and the subscription); on `CHANNEL_ERROR`/`TIMED_OUT` log, don't swallow (the adversarial subagent caught the missing handler — silent sync-death is the "stuck screen" trap). (4) `browserClient()` (@supabase/ssr) is **memoized** — presence + cart-sync hooks share ONE socket; `setAuth(token)` is idempotent with the same anon token.
- **Route ALL transient toasts through one `flash(msg, ms)` helper with a SINGLE clear-timer ref** (cancel the prior timeout before setting the next). Independent `setNotice(...) + setTimeout(...)` calls per event (join, peer-add, your-add) race: an earlier event's orphan timer blanks a later event's fresh notice early. One timer = deterministic last-writer-wins in the single polite live region. (Pre-PR-sweep nit from the P3.2 adversarial pass.)
- **CI green ≠ live migration-history complete (corollary to #59).** Discovered via `list_migrations` on the live QR project that `pickup_slots_align_fix` (0300) was never recorded as a row — yet `pg_get_functiondef('mms_pickup_slots')` showed the FIXED (day-open-anchored) body, so live behavior was correct; only the history row was missing (it self-heals on the next `db push`). Lesson: when applying a post-merge migration, `list_migrations` + spot-check the actual OBJECT (function body / index / constraint via `pg_get_*` / `pg_constraint`), not just the migration list — the two can disagree in both directions. Note: this project applies live migrations via the MCP `apply_migration` (apply-time version timestamps that DIFFER from the file prefixes), separate from CI's file-based `migrations-check`/`types-fresh` — the two tracks coexist.
- **Cart-lock-at-pay = one atomic conditional UPDATE + a TTL, no SQL function, no extra round-trips.** The deferral reason (P1.3) was "a naïve lock strands an abandoned pay-screen" — solved with `locked_at` (a 5-min TTL: effective-lock = `locked AND locked_at > now()-TTL`, so a hard tab-close auto-frees the cart) + `locked_by` (so the SAME payer re-acquires after a refresh instead of being blocked by their own lock, and release is scoped to the locker). Acquire is race-safe as a single UPDATE: `set locked=true,locked_at=now(),locked_by=uid where id=$ and status='open' and (locked=false or locked_by=$uid or locked_at<=cutoff)` — Postgres re-evaluates the WHERE under the row lock, so two simultaneous create-intents can't both win (the loser sees the winner's fresh `locked_by` → 0 rows → "held*by_other"); a fresh foreign lock can't be stolen (none of the three OR-clauses match). Keep ONE clock basis: set `locked_at` to the APP clock (`new Date().toISOString()`) and compare to `Date.now()-TTL` everywhere (acquire cutoff + the effective-lock check in assertCartMember) — never mix DB `now()`, or skew shifts the boundary. Release on EVERY exit: decline (webhook, unconditional by cart), "Edit order" (scoped to `locked_by`), every create-intent failure path (explicit + the outer catch), and the TTL backstop. The guard is free: `assertCartMember` returns the \_effective* lock, so every existing mutation path already rejects. **No types-regen for the columns if Docker's down** — hand-edit `database.types.ts` (2 nullable columns → `string | null` in Row, `?: string | null` in Insert/Update, alphabetical position, no Relationships since the uuid has no FK) and let CI `types-fresh` validate; a SQL _function_ WOULD change the Functions type block (avoid one — a conditional UPDATE in the route suffices).
- **Every cart-mutating path must go through the status-atomic insert/update RPC, not a plain `.from().insert()`.** `scanAdd` (grocery) was a plain insert — it carried the app-layer `locked`/member guard but NOT the in-SQL `status='open'` check `addItem` uses (`mms_cart_item_insert_if_open`), so a write racing a webhook flip to `paid` could slip a post-payment row (same TOCTOU class as the charged-no-order hole). The app-layer check-then-write always has a gap; the guard must be IN the write statement. The pre-merge adversarial subagent caught it as money-adjacent even though grocery is solo (near-unreachable) — fix the class, not just the reachable instance.
- **Split-the-bill share math: largest-remainder over integer cents, allocate the REAL grand total** (from getCartTotals), never re-derive per-person tax/service from scratch — that way Σ(shares) == total to the cent by construction (QA §D). even = equal weights; by-person = weight each seat by their assigned line subtotal. Hand the leftover penny(ies) to the largest fractional part (deterministic; ties → lower index). All-zero weights (unassigned by-person / $0 cart) → fall back to even. **Caveat for real split-TENDER (P3.3b):** weighting tax by gross subtotal over-charges a seat who owns only tax-EXEMPT lines — when money actually moves per-card, weight tax by each seat's _taxable_ base + service by _net_, not by subtotal pro-rata. (Industry UX research: Sunday/Square/Toast/Splitwise — one shared check, many phones, no app; even/by-item/custom; live "$X of $Y paid"; deterministic remainder; the recurring failure modes are last-person-stuck-with-remainder, rounding-that-doesn't-reconcile, and abandonment.)
- **Split-tender capture model (Stripe, confirmed from docs): you CANNOT split one PaymentIntent across cards — use N independent PaymentIntents, one per payer.** For an all-or-nothing table order (our pay-then-fulfill spine), Option A = `capture_method:manual` (authorize-only) on each share, **capture them all together when the last share authorizes** (then create the one order), and **cancel the auths on abandon/decline** so no one is charged for an incomplete order. Manual capture works with the Payment Element + Apple/Google Pay/Link (they tokenize to `card`); card auths hold ~7 days and auto-release on expiry (irrelevant same-session). Only non-card methods (ACH/SEPA/redirects) can't authorize-only. The industry norm (Toast/Square/Sunday) is capture-each-immediately + host-covers-remainder, but that fits their fire-first/pre-auth-tab model, NOT our pay-then-fulfill one.
- **`canMutate(line_state, actor_role, isOwner)` is the ONE generalized mutation gate — make it isomorphic** (a pure `lib/permissions.ts`, no `server-only`) so the server enforces it in the cart actions AND the client imports the SAME rule to disable/hide controls it would reject (never render an action the server forbids → no silent-fail buttons). M3: host edits any line, guest own-only (cross-owner-delete guard); the `line_state` param ('draft' today) is the seam S2's post-fire staff-only locks extend rather than refactor. When you add a NEW line-mutating action (e.g. assignLine), it must carry the SAME guards the siblings do — member-authz + canMutate + the lock check + a `status='open'` re-check (the status-atomic invariant); an adversarial pass will catch a new write that skips one.
- **Session-expiry semantics MUST match across mint, authz, AND RLS — or an in-use table strands the diner.** The dine-in session TTL is a hard 4h (`table_sessions.expires_at default now()+interval '4 hours'`), but the `/api/session` mint found a session by `status='active'` ONLY, while `assertCartMember` and the `is_member` RLS fn both reject `expires_at <= now()`. So an expired-but-still-`active` session got handed back as "live", then every cart write 403'd on it → the client showed the generic **"Couldn't add that — please try again"**, a retry that can NEVER succeed (the misleading-error trap). Three-part fix, schema-free (the columns exist): (1) **sliding renewal** — slide `expires_at` forward on any authorized touch (`assertCartMember`, throttled to the back-half of the window so a read-heavy realtime→getCartView path doesn't write each call) and on every rejoin, so an in-use table never expires mid-meal; (2) **expiry-consistent mint + sweep** — `findActive` also requires `expires_at > now()`, and a stale expired session squatting on the `where status='active'` partial unique index is swept to `'closed'` before minting fresh (the sweep that index's own comment anticipated — there's no background sweeper); (3) **client recovery** — a failed cart op re-mints (`useTableSession.revalidate`) instead of stranding, with honest copy that diffs the returned cartId to distinguish a _renewed_ session ("Reconnected — try again") from a _timed-out_ one ("we started a fresh order"). Diagnosed from the **Supabase API logs**: the repeating `auth/user → qr_carts → table_sessions` pattern that STOPPED before `session_members` was assertCartMember bailing at the expiry check — a Server Action's thrown error is redacted in prod, so the live logs (not the client) name the real failure. (Observability corollary: Sentry/PostHog wouldn't AUTO-flag this — it's a deliberate, caught 403 — but they'd speed the same diagnosis.)
- **Supabase CLI v2.107 is a Bun-compiled binary that fails in the remote sandbox** (`BadResource: FileSystem.access (/tmp/supabase/config.json)`, `/$bunfs/root/supabase`) — so the LEARNINGS #61 "download the pinned CLI + dockerd + supabase start + gen types" recipe for regenerating `database.types.ts` does NOT work here. A new TABLE drifts `types-fresh` (tables DO appear in the generated types, unlike indexes/constraints/publication/RLS). Options when the stack won't boot: (a) hand-edit `database.types.ts` to mirror the generator EXACTLY (risky for a whole table — key order, `Relationships: []`, the `Functions` block all must match), or (b) push the migration as WIP and let CI's `migrations-check + types-fresh` (which boots its own local stack) be the regen oracle, then copy its expected output. For a money-path phase, prefer landing the migration + regen in the same PR so the branch is never merged type-stale.
- **Split-tender capture vs abort is a money-critical race — gate capture on a LIVE settlement, defer abort to an in-flight capture, and verify each capture actually took money.** Option A captures N manual-capture PIs together when the last share authorizes; a host "cancel" tapped at that instant (or a single-payer takeover of a stale settlement) can otherwise leave money captured with no order. Three guards (adversarial pass #1/#2): (1) `captureAllIfReady` reads `qr_carts.status='open'` AND a FRESH `settle_at` before capturing — a lifted/expired/taken-over freeze means don't capture; (2) `abortSettlement` lifts the freeze FIRST (so a not-yet-started capture bails), then if any share is already `captured` it re-freezes + bails (money committing → let fulfillment finish), and its delete is conditional (`.neq('status','captured')`) so a raced capture is never deleted; (3) on a swallowed `payment_intent_unexpected_state`, RE-FETCH the PI — `succeeded` (incl. already-captured redelivery) → mark `captured`, anything else (abort canceled it) → mark `canceled`, so a canceled PI is never mismarked captured and inflates the order. Residual sub-millisecond interleaving collapses to a FAIL-LOUD state (mms_fulfill_split_order's S2 raise → 500, never silent loss); the full fix is an atomic cart-level capture claim (a `capturing_at` column with a TTL, mutually exclusive with abort) — tracked hardening, not v1. The promise is "never charged-with-no-order"; design every split path to fail loud, never silent.
- **Rate-limit per VERIFIED SEAT (device), not per session — a per-session cap is a co-diner DoS.** P3.4's mutation limiter keys on the verified `auth.uid()` (one device), not `session_id`: a per-session budget lets one hostile member exhaust it and lock out their whole table's shared cart. Per-seat bounds the bad actor to themselves and never false-trips a big legit party. The generic `mms_rate_limit(bucket, key, max, window)` is the ONE invariant (don't re-implement per call site) reusing the `mms_promo_attempt` window (count-first / self-GC / reject-without-record); the per-key self-GC only cleans keys actively queried, so the **pg_cron sweeper** is the bounded backstop for abandoned keys. Make limiters **FAIL-OPEN** (a limiter RPC glitch returns "allowed") — never strand a paying diner on an abuse guard; the DB caps + lock + server-authoritative money stay the hard invariants. New-seat churn (clear storage → fresh anon uid) is bounded a layer DOWN by GoTrue's anon sign-up rate limit (`config.toml`), not the app.
- **Trigger functions (`returns trigger`) are EXCLUDED from `supabase gen types` — a count-cap trigger drifts NOTHING in `database.types.ts`.** P3.4's party-size cap is an advisory-locked `BEFORE INSERT` trigger (`mms_enforce_party_size`): the trigger fn isn't emitted to the Functions block (only RPC-callable fns are), so unlike a new TABLE or a new scalar fn it needs no types edit. Confirmed by diffing the MCP `generate_typescript_types` output. Use a trigger (not a route-only check) for a count cap so EVERY insert path is covered, and take a `pg_advisory_xact_lock(hashtext('ns:'||key))` inside it so concurrent inserts can't overshoot the cap (count-then-insert TOCTOU) — the same per-key advisory-lock pattern as the pickup-slot capacity gate.
- **Resolve types-fresh drift for a new table/fn WITHOUT the (sandbox-broken) CLI via the MCP `generate_typescript_types` as the shape oracle.** The pinned-CLI `supabase start` recipe fails in this sandbox (#77, Bun binary), but after applying an additive migration to LIVE, `mcp__Supabase__generate_typescript_types` gives the authoritative Row/Insert/Update + Args/Returns shapes and the **alphabetical ordering** (Tables and Functions are both sorted). The MCP output differs from the committed `gen --local --schema public` only in the header/PostgrestVersion (#40), so don't replace the file — surgically INSERT the new entries at the right alphabetical slots in the existing format, and let CI `types-fresh` be the final byte-check. A no-arg fn is `{ Args: never; Returns: … }` in this generator version.
- **`pg_cron` is installed on the live QR project (1.6.4); schedule background jobs with a GUARD so the local CI stack (no pg_cron) still applies the migration.** P3.4's `mms_sweep_expired_sessions()` is scheduled via `cron.schedule('name','*/15 * * * *', 'select …')` (upserts by jobname → idempotent) inside `do $$ if exists (select 1 from pg_extension where extname='pg_cron') then … end if; exception when others then raise notice … $$` — so `migrations-check` (a local stack that may lack pg_cron) applies cleanly, and the function works whether or not it's scheduled (callable manually / by a fallback). Verified on live: `cron.job` has the row with the right schedule. The sweeper is the BACKGROUND backstop the `table_sessions_active_qr_uniq` index comment anticipated; renewal-on-write + the mint-time sweep already cover the in-use path, and the sweep only closes `status='active' AND expires_at<=now()` (a renewed in-use session is never touched).
- **The hosted project's implicit `authenticated` SELECT grant on public tables is NOT reproduced on a fresh local stack — make session-table grants EXPLICIT or RLS-as-`authenticated` tests/reads hit a bare "permission denied."** P3.4's RLS test passed live (via the MCP) but FAILED in CI's local stack: `ERROR: permission denied for table table_sessions` under `set local role authenticated`. The init/lockdown migrations only `revoke select … from anon` and RELIED on Supabase's default privileges granting `authenticated` SELECT on new public tables — which the hosted project has (confirmed `has_table_privilege('authenticated', …, 'select')=true`, and the `pg_graphql_authenticated_table_exposed` advisor) but a fresh `supabase start` stack does not apply the same way. RLS gates ROWS, not the table privilege — the role still needs base SELECT for a `to authenticated using(is_member(...))` policy to even evaluate. Fix: `grant select on <session tables> to authenticated` explicitly in a migration (idempotent on live; `anon` stays revoked). **Grants don't change `gen types` output**, so this is a no-op for types-fresh. Lesson: don't lean on platform default-privilege behavior for a grant the app depends on — state it in SQL so local/CI/fresh-env match live.
- **RLS membership tests run as plain-SQL asserts under role impersonation — no pgTAP, no JS test infra.** `supabase/tests/rls_membership_test.sql` proves a non-member can't read another table's cart/shares/order: insert fixtures as the privileged role, then `set local role authenticated; set local request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}'` so `auth.uid()` (→ `is_member`) evaluates the REAL policies, `do $$ assert (select count(*) …) = 0 $$`, and ALWAYS include a POSITIVE control (a real member reads 1) so a silently-broken claims setup can't pass the negatives for the wrong reason. Wrap in `begin; … rollback;` (side-effect-free, repeatable) and run via `psql -v ON_ERROR_STOP=1 -f` (a failed assert → non-zero exit → red CI). Runnable in CI against the local stack at `postgresql://postgres:postgres@127.0.0.1:54322/postgres` (psql is preinstalled on ubuntu-latest); also runnable live via the MCP `execute_sql` (the explicit `begin…rollback` works there too — verified PASS + left no rows).
- **The preview deployment shares the LIVE Supabase project, so a migration-requiring branch is BROKEN on its preview until the migration is applied to live.** Inverse of #59 ("CI green ≠ migration applied"): here the preview CODE ran ahead of the live SCHEMA. P3.3b's `assertCartMember` selects `settle_at,settle_by`; the live DB lacked them (migration unmerged) → the supabase-js select errored → `data` null → AuthzError 404 → EVERY cart add failed → the P3.3a client-recovery looped "reconnected… try again" forever (the same-cartId branch, since the session was fine). Fix: apply the migration to live BEFORE testing the preview. Safe to apply an unmerged migration to live when it's purely ADDITIVE (new nullable columns + new table + new fn) and the current prod code doesn't reference it yet — zero impact on prod, and it's needed post-merge regardless. **After applying, run `get_advisors(security)` + verify grants:** a NEW public table gets a default `anon` SELECT grant → it shows in the anon GraphQL schema (advisor 0026) unlike its lockdown'd siblings; `revoke select … from anon` to match (RLS already denies rows, but revoke removes discoverability). Add the revoke to the migration FILE too so a fresh apply (CI/new env) matches live.
- **A split-tender order has NO `stripe_payment_intent_id` (the N share PIs live on `qr_cart_shares`), so /track can't key it off `payment_intent` like single-pay — key it by ORDER ID, resolved via a share's stamped `order_id`, and authorize the post-pay lookup on SESSION membership (not `assertCartMember`, which 403s a `paid` cart).** M3's SettlementBoard redirected all payers to `/track?cart=…` with no Stripe `redirect_status`/`payment_intent`, so /track fell through to the "…once you've placed an order" stub — a post-payment strand (the worst kind, the milestone red-team's only Critical). Fix: redirect with `&paid=1`; `getSplitOrderId` (`lib/order.ts`, a server-only read NOT a "use server" action) gates on `assertSessionMember(cart.session_id)` and returns `qr_cart_shares.order_id`; `useOrderStatus`/`OrderTracker` generalized to filter `qr_orders` by `id` (uuid) as well as `stripe_payment_intent_id`. An un-stamped order (brief post-capture race) shows an honest "finalizing", never a dead end. **Single-pay /track has the same session-window constraint** (its `qr_order_read` RLS is `is_member`), so this is parity, not a new limit.
- **PostHog `capture_pageview` records `$current_url`/`$referrer` — any credential in the URL query string (the dine-in `?t=`/`?j=` join key) leaks to analytics. Scrub it in `before_send` AND strip it from the address bar after consumption.** The server `onRequestError` path was scrubbed in #30, but the CLIENT pageview path was a separate, still-open leak the milestone red-team caught. `before_send` redacts `t`/`j` from URL props; `useTableSession` `history.replaceState`s them away once captured (localStorage still rejoins on reload, so the strip is safe). Lesson: a server-side PII/credential scrub does NOT cover client-side autocapture — audit both.
- **`window.location.assign(...)` does not synchronously unmount React, so a polling `setInterval` keeps firing (against a now-changed/forbidden resource) during the navigation window.** M3's SettlementBoard kept polling `getSettlement` on a paid cart (swallowed 403s) after the all-captured redirect. Guard the poll/load with a `redirected` ref (`if (redirected.current) return;`) — or prefer a router push so unmount is deterministic. (Same family as "clean up timers"; navigation is not unmount.)
- **Run a MILESTONE-level multi-lens adversarial pass before the NEXT milestone builds on the surface — it catches edges the per-PR passes miss.** Each M3 phase passed its own pre-PR/pre-merge adversarial review, yet a four-lens (money · auth/RLS · realtime/UX · a11y/perf) sweep over the WHOLE merged surface still found a Critical (post-payment strand) + a High privacy leak + a11y gaps that only emerge across phases (e.g. the menu list lost `role="list"` when the P3.1 header work landed; accent-on-tint contrast across the split UI). The spine (money/auth/RLS) held — the escapes were integration edges. Cheap insurance before the next layer depends on it.
- **`next/font/google` only emits @font-face for the `subsets` you request — a non-Latin face MUST list its script subset or every glyph silently falls back to the system font.** Padauk (the Burmese face) was loaded `subsets: ["latin"]`, so `next/font` never fetched the Myanmar unicode-range and every `name_my` string rendered in the platform sans — the bilingual moat was cosmetically dead while the font "looked bundled." Fix: `subsets: ["latin","myanmar"]`. Verify the RENDERED glyph (and the woff2 unicode-range in the network tab), not just that the font variable is wired. (next/font validates subset names at build, so an invalid name fails the build — a passing build with the script subset is the proof it's requested.)
- **Don't trust a "WCAG AA verified" comment — re-measure the token×surface matrix when changing a text/surface token.** The tokens.css header claimed AA-verified, but dark `--t3` was 4.40:1 on `--sf` / 4.10:1 on `--cd` (< 4.5 AA). Compute contrast with the actual sRGB-relative-luminance formula (a 10-line script), pick the value that clears 4.5 on the BINDING (lightest) surface, and keep the hierarchy (t3 dimmer than t2). Latent ≠ absent: the failure was dark-only and no theme toggle ships until M5, but foundation tokens get fixed before the toggle lands. Codify the verified matrix in the comment + QA-CHECKLIST so it doesn't re-rot.
- **A milestone-level red-team is worth running on ALREADY-SHIPPED milestones, not just the current one.** Re-auditing M0/M1/M2 (each previously gate-passed) with fresh lenses, scoped to each milestone's DISTINCT surface (skip the spine prior passes cleared), still found a High (Burmese font subset — user-facing, silently broken since M0) and a Med (dark-mode contrast) that per-phase reviews missed because they're foundation/integration issues, not feature logic. Cheap insurance before a new milestone builds on the foundation.
- **Supabase default privileges grant EXECUTE on every new function to `anon` AND `authenticated` BY NAME — so `revoke … from public` does NOT lock out anon; revoke from `anon` explicitly.** S1.1a's `is_staff()`/`is_staff_at_least()` were created with `revoke all … from public` + `grant … to authenticated` (mirroring the lockdown migration's _visible_ lines), yet `get_advisors(security)` flagged 0028 (anon can execute) and `has_function_privilege('anon', …)` confirmed `true`. The init migration's `revoke … from anon` on `is_member`/`is_host` exists for exactly this reason — `public` is a pseudo-role that doesn't cover an explicit per-role grant. Fix: `revoke all on function … from public, anon;` then `grant execute … to authenticated;`. Always verify with `get_advisors` + `has_function_privilege` after creating a SECURITY DEFINER fn — the `revoke from public` line alone is a false sense of security.
- **A real (non-anonymous) auth session must never back the diner surface — `AnonAuthGate`'s "session exists → skip" is wrong once staff accounts exist.** S1.1a added staff as real accounts in the SAME Supabase project as anon diners. If a staff member (logged in at `/staff`) opens a diner route on the same browser, `getSession()` returns the _staff_ session, so the original gate skipped `signInAnonymously()` → the diner surface ran under a staff `auth.uid()` → `is_staff()` true → that uid could read EVERY table session, and any cart write keyed to `auth.uid()` was attributed to the staff user, not an anon seat. Fix: on diner routes, if the existing session's `user.is_anonymous === false`, `signOut()` + `signInAnonymously()` so the two identities stay isolated even on a shared browser profile. Lesson: an "is there a session?" gate is too coarse the moment two session _kinds_ share a project — gate on the session's KIND (`is_anonymous`).
- **MCP `generate_typescript_types` adds an `__InternalSupabase.PostgrestVersion` block that the CLI `supabase gen types --local --schema public` (what CI's types-fresh runs) does NOT — pasting MCP output verbatim fails the types-fresh diff.** S1.1a regenerated types via the Supabase MCP, but the committed `database.types.ts` is CLI-shaped (no `__InternalSupabase` header). Splice the new table/function blocks into the committed file by hand in its exact CLI format (alphabetical table order; `Args: never` for no-arg fns) instead of overwriting with MCP output. Verify the committed types match what `git diff` would produce from `gen types --local`, not from the MCP tool.
- **Test additive RLS behaviorally before trusting it — simulate the JWT in a rolled-back transaction.** S1.1a's `or public.is_staff()` change is _provably_ additive (can't reduce diner access), but "proof by reasoning" isn't a test. Pattern: in one `DO $$ … $$` block, seed throwaway `auth.users` (+ staff/session rows), `set local role authenticated` + `perform set_config('request.jwt.claims', json_build_object('sub', <uid>, 'role','authenticated')::text, true)`, query, then `raise exception 'RESULTS …'` to BOTH surface the counts (execute_sql swallows `raise notice` but returns the error text) AND force a rollback so nothing persists. S1.1a got staff_sees=1 / stranger=0 / member_diner=1 this way. (auth.users FK on `staff.user_id` means you can't test a staff row without a real-ish auth user — the transaction-rollback keeps it clean.)
- **A "Too many code requests" loop is GoTrue's `over_email_send_rate_limit` (its email rate limit), which fires BEFORE the Send-Email Hook — pull the auth logs and check durations before blaming the hook.** I'd hypothesized the Send-Email Hook was hanging (→ GoTrue retry storm), but `get_logs(auth)` showed GoTrue's `/otp` durations were all sub-second (max 0.93s) — the hook responds fast; the 429s are `error_code:"over_email_send_rate_limit"`, GoTrue's own per-address-cooldown + hourly email cap, unrelated to Resend's quota. The CLIENT enabler: `StaffLogin`'s 60s resend cooldown was reset on EVERY keystroke (`onChange` → `setCooldown(0)`), so editing the email one char wiped the gate → instant re-tap → trip the limit. Fix: scope the cooldown to the address it was sent to (`rateLimited = cooldown>0 && norm(email)===sentTo`; clearing-and-retyping the same address can't wipe it, a different address sends freely) and make a 429 steer to Google (no email, never rate-limited) with honest copy (the cap is hourly, so don't promise "wait a minute"). The REAL unblock is config: raise Supabase → Auth → Rate Limits → "Rate limit for sending emails". Lesson: read the logs (durations + error_code) before re-architecting; a stale hypothesis from a prior session is not evidence.
- **Store a per-person low-entropy secret (a PIN) in its OWN service-role-only table, NOT a column on a client-readable row — and do the brute-force defense as an ATOMIC, advisory-locked SQL lockout.** S1.1b's staff PIN: `staff` is RLS-readable by self/owner and `authenticated` holds table SELECT, so a `pin_hash` COLUMN would be reachable by a client `select pin_hash`. A separate `staff_pins` table (RLS-on, zero policies = default-deny, `revoke all from anon, authenticated`) keeps the hash + lockout counters off every client read surface entirely (the `rate_events`/`promo_attempts` pattern). Hash with bcrypt via pgcrypto (`extensions.crypt(p, extensions.gen_salt('bf',10))`, qualified because `search_path=''`) — a deliberately slow hash so a leaked table can't be brute-forced offline at PIN entropy. Verify in ONE SECURITY DEFINER fn that takes `pg_advisory_xact_lock(hashtext('ns:'||id))` FIRST so concurrent attempts can't race the counter past the cap (5 → 15-min lock); check an active lock BEFORE comparing the hash (no timing leak on a locked acct); a LAPSED lock must grant a fresh budget (`v_base = case when locked_until is not null then 0 else failed_attempts end`) or it re-locks on the first new miss. App wrapper is **fail-CLOSED** (an RPC error reads as `error`, never a pass) since it guards a privileged step-up — the inverse of the diner rate limiter's fail-OPEN.
- **Key a staff-row-scoped secret/credential on the RESOLVED row PK, not the session `auth.uid()`.** `getStaffAuth` resolves a staff member by uid OR the verified-email allowlist, so a Google/magic-link session can carry a uid that DIFFERS from the `user_id` stamped on the provisioned `staff` row. Anything keyed on the row itself (the PIN) must use the row PK — I added `StaffCaller.staffId` (the resolved `staff.user_id`) distinct from `caller.uid` (the session uid) for exactly this. Keying the PIN on `uid` would silently orphan every email-matched account.
- **A "lock the shared tablet" cookie is an ATTRIBUTION/privacy affordance, not a security boundary — say so in the code and don't gate anything load-bearing on it.** S1.1b's `/staff/lock` redirect is driven by an httpOnly, path-scoped cookie the shell pages check; a legitimately signed-in staff member could clear it via devtools (on a kiosk-locked floor tablet that's not exposed). The REAL boundary stays the Supabase session + the `getStaffAuth` staff-row gate; the PIN's actual teeth (server-verified, lockout) are in `mms_staff_verify_pin`, which S2's manager step-up reuses as a genuine server-side gate. Documenting the threat model honestly (vs. implying the lock is hard auth) is the standard — and it pre-empts the adversarial "lock is bypassable → theater" finding.
- **The in-session auto-mode classifier blocks direct writes/queries to a cloud Supabase project the user didn't name THIS session — even when the repo's workflow says to apply additive migrations to live ahead of merge.** S1.1b's migration is verified on the local CI stack (docker + pinned `supabase start` + the functional lockout test + `gen types --local` byte-match), but the live apply to `fasnpdhtvqtzjlvruqcu` was denied by the classifier. Don't work around it — surface it in HANDOFF + the PR as a pending step (the PR preview shares the live DB, so `/staff/profile`+`/staff/lock` 500 on preview until applied), and let Min apply it (or grant the permission). Local-stack verification (boot the pinned CLI, apply, run the function with a seeded staff row through correct→5×wrong→lock→lapsed-reset, then `gen types`) is the substitute proof when the live path is gated.
- **`revoke all on function … from public` does NOT drop hosted Supabase's NAMED `anon`/`authenticated` EXECUTE grants — revoke `from public, anon, authenticated` explicitly (verify on LIVE, not just local).** S1.3's `mms_fulfill_cash_order` looked locked on the local stack (grants = `postgres,service_role`) because local Postgres only grants EXECUTE to the PUBLIC pseudo-role. **Hosted** Supabase ALSO grants `anon`+`authenticated` BY NAME via default privileges, so a `from public` revoke left both — a diner could `POST /rest/v1/rpc/mms_fulfill_cash_order` and fake a cash settle (mark a cart paid with no payment) on a SECURITY DEFINER fn. The proven pattern was already in front of me (init `mms_fulfill_order` + the `staff_pin` fns all `revoke … from public, anon, authenticated`); I copied only half. Fix: revoke all three names; verify on the live project two ways — `role_routine_grants` shows `anon/authenticated` count = 0, AND the fn is ABSENT from `get_advisors(security)`'s `authenticated_security_definer_function_executable` list. Local-stack grant checks are necessary but NOT sufficient for SECURITY DEFINER lockdown — confirm on the hosted project. (`CREATE OR REPLACE FUNCTION` preserves the existing ACL, so restating an already-locked fn like `mms_fulfill_order` keeps its revoke — verified card_anon_auth=0 after the replace.)
- **The S2 line lifecycle lives on `qr_cart_items` (PRE-settlement), not `qr_orders` — and `canMutateLine` must gain STAFF as a first-class actor before S2.** `/track` is a post-pay view on `qr_orders` (keyed by the Stripe PI), but dine-in fires food BEFORE payment (the deferred-settlement spine), so the `draft→fired→in_progress→served` state machine belongs on the open cart's lines. And `apps/qr/lib/permissions.ts` `canMutateLine` is diner-only today (`ActorRole="host"|"guest"`) with a post-draft PLACEHOLDER that returns `actorRole==="host"` — a diner host is NOT staff, so shipping S2 on that placeholder would hand a diner edit rights over fired food. Make staff a real actor in the gate (server enforces, client imports the same rule). Full pre-build red-team: `docs/S2_DESIGN.md`. (Captured at S2 design time so the build's first commit gets it right — not round 3.)
- **Model an "undo a fired ticket" grace as `fire_at = now()+grace` with the KDS only pulling `fire_at ≤ now` — never an indefinite client-held delete window.** The line is `fired` immediately (honest/visible), but the kitchen query skips it until the grace passes, so an undo within the window is a clean atomic `fired→draft` the kitchen never saw; after, removal must route through a (possibly manager-gated) void, not a free delete. Grace is server-clocked + single-use. This kills the three undo races (undo-after-cook-started, double-undo, diner extends the window) without a second timer — it reuses the existing `fire_at` column (S2_DESIGN §S2.2).
- **Under Supabase "email confirmations OFF", `email_confirmed_at` is AUTO-set at signup — so it's worthless as a verification gate; an RLS email-allowlist must additionally require a provider-verified OAuth identity (`provider <> 'email'`), and the BINDING control is the auth config, not SQL.** S1-audit B1: `is_staff()` matched a staff allowlist on the raw JWT `email` claim, and RLS/Realtime evaluate it directly (bypassing the app's `getStaffAuth` confirmed-email check) → a session asserting a provisioned staff email read every table's diner data + the roster. The "obvious" fix (gate on `email_confirmed_at`) does NOT close it when confirmations are off, because GoTrue auto-confirms email/password signups → `email_confirmed_at` is set for the attacker too. Real fix (`20260622000000`): a SECURITY DEFINER helper reads `auth.users` for the current `auth.uid()` and requires confirmed AND `coalesce(raw_app_meta_data->>'provider','email') <> 'email'` (a public email/password signup can never satisfy the email branch; provisioned/OTP staff match by `user_id` instead, OAuth staff by their provider-verified email). The durable backstop is still CONFIG: disable public email signup or confirmations ON + restrict the OAuth provider domain. Lesson: when an RLS gate trusts a JWT claim, ask "can the user set this claim without proving it?" — for `email`/`email_verified` under autoconfirm, yes.
- **`create or replace function` is a FULL-body replace — redefining a money RPC to add one guard silently DROPS every other behavior the prior version accreted. Diff against the live body before replacing.** S1.3 redefined `mms_fulfill_order` to add the cross-tender `status='open'` guard and, in doing so, dropped the `pickup_slot`/`fire_at` copy AND the `mms_promo_consume(redemption)` call that the M2.2 pickup migration had added — so since S1.3, card orders silently stopped carrying the pickup ETA / KDS fire seam and stopped recording promo redemptions (per-session/global caps under-counted). No adversarial agent caught it (they reviewed the guard, not the column/call set); it surfaced only when B2 went to redefine the function again and pulled the live body via `pg_get_functiondef` first. Rule: before `create or replace` on an RPC that's been redefined across migrations, fetch the CURRENT definition (`pg_get_functiondef(p.oid)`) and re-add EVERY clause, not just the one you came for — a migration filename tells you nothing about what accreted in between.
- **Make a cash/card settlement mutually exclusive with an ATOMIC freeze on BOTH sides, not a read-then-act check.** `settleCash` checked `paymentInFlightReason` (a read) then derived totals then settled — but set no marker, so a diner could `acquireCartLock` + create + capture a card PI in the `getCartTotals→RPC` window, and the late webhook orphaned that charge (the pay-guard mutex was one-directional). Fix: `settleCash` calls `acquireSettlement` (the existing split-freeze primitive — one conditional UPDATE that flips `settle_at` only when `status='open' and locked=false`) BEFORE deriving totals, and `acquireCartLock` already excludes a fresh `settle_at` — so the two tenders can't both proceed. Release the freeze on every exit. The read-check is fine as a fast friendly message; the atomic claim is what closes the race.
- **A background sweeper that closes a session without cancelling its cart leaves an `open` cart outliving its session — gate staff fulfillment on the SESSION status in the RPC, not on caller ordering.** S2: `mms_fulfill_cash_order`/`mms_merge_table_orders` only checked `cart.status='open'`; `clearTable` cancels the cart before closing the session, but `mms_sweep_expired_sessions` closes the session and leaves the cart open → a cash settle/merge could record against a closed table. Fold `exists(table_sessions where id=session_id and status<>'closed')` into the atomic claim. NB: the CARD path (`mms_fulfill_order`) is deliberately NOT session-gated — a captured Stripe charge must fulfill regardless of session lifecycle (refusing strands money); its guard is the cart-status claim.
- **`revoke`/`grant on function` needs the EXACT argument-type signature — Postgres resolves the overload by types, and a mismatch errors `function … does not exist` even though `create or replace` just succeeded.** The S2 migration's `create or replace function mms_fulfill_cash_order(... p_settled_by uuid ...)` worked, but the trailing `revoke … (uuid, integer, integer, …)` failed because the 2nd arg is `uuid`, not `integer`. The create uses NAMED params (forgiving); the revoke/grant use POSITIONAL TYPES (exact). Copy the type list straight from the signature. `supabase db reset` caught it; a bare apply might not have.
- **`now()` / `transaction_timestamp()` is STABLE within a transaction — so "one batch per RPC call" works in prod (each `rpc()` is its own txn) but is INVISIBLE in a single `BEGIN…ROLLBACK` test (every statement sees the same `now()`).** S2.2's `mms_undo_fire` scopes the undo to the latest fire batch via `fire_at = max(in-grace fire_at)`, relying on each `mms_fire_cart` call stamping a distinct statement-stable `now()+grace`. The first behavioral test wrapped two `mms_fire_cart` calls in one transaction → identical `fire_at` → the batch-scoping looked broken (undo reversed all). It wasn't: in production the two sends are separate server round-trips = separate txns = distinct `now()`. Lesson: to test per-transaction-timestamp logic, run each step in its OWN transaction (separate psql invocations, or set distinct `fire_at` explicitly to isolate the RPC's selection logic from `now()`'s semantics) — never assume `clock_timestamp()`-like behavior from `now()`.
- **Model an "undo grace" as `fire_at = now()+grace` + a consumer that filters `fire_at <= now()`, NOT a delayed write.** S2.2: a just-sent kitchen line is `fired` IMMEDIATELY (honest/visible to the diner, stepper → "Ask a server" chip) but the KDS query already excludes `fire_at > now()`, so the kitchen never sees it until grace elapses; undo within grace is a clean `fired→draft` that needs no scheduler/cron and no compensating delete. Scope the undo to the LATEST batch (`fire_at = max(in-grace)`) so the "Undo (Ns)" countdown and the rows it reverses are the same set — otherwise a rapid double-send lets one Undo silently claw back the earlier batch. The grace is server-clocked (the RPC re-checks `fire_at > now()`); the client countdown is advisory only, so a drifted/lying client clock can't extend the window.
- **Every cart RPC must gate on `table_sessions.status <> 'closed'`, _not just money ones._** The sweeper closes a session but leaves its cart `open`; a non-money marker RPC like `mms_open_tab` is just as exposed, and the **staff** path skips `assertCartMember` (which is the only place the diner path re-checks session status) — so the gate must live in the SQL. (S3.1 adversarial review.)
- **iOS Safari auto-zooms (and never un-zooms) on focusing any form control with font-size <16px — fix it with ONE mobile base rule, not per-input, because an ad-hoc per-input sweep WILL miss some.** M5·P5.2: QR had set `fontSize: 16` on a few inputs by hand (StaffLogin/FeedbackPrompt/JoinTable, each with a "≥16px → no iOS zoom" comment) but silently missed others (grocery search, InviteSheet, RefundActionSheet, all at 15px). One `@media (max-width: 639.98px){ input,textarea,select{ font-size:16px !important } }` in `globals.css` closes the whole class at once and covers every future input — `!important` overrides inline `style={{fontSize}}` (author-important beats inline-normal in the cascade), and the `<640px` scope means the desktop design's smaller sizes resume at `sm:` untouched (mobile-only, not a desktop redesign). No QR input is intentionally >16px, so a flat 16px is a safe floor.
- **Bottom sheets must size with `--sheet-max-h` (dvh), never `vh`; pin fixed CTAs to the home-bar with `env(safe-area-inset-*)` in POSITION, not padding.** M5·P5.2 (ported from delivery): iOS `vh` is the LARGE viewport behind the toolbar/notch, so a `90vh`/`95vh` sheet's top — and its close button — hide under the status bar. Token `--sheet-max-h: calc(100dvh - env(safe-area-inset-top) - 1rem)` in `@mms/ui/tokens.css`; the shared `.mms-sheet` uses it + adds `env(safe-area-inset-bottom)` to its bottom padding (one fix covers every `@mms/ui` Sheet caller). For fixed edge-pinned bars (CartBar, grocery checkout CTA, top recovery alert), add the inset to the `bottom`/`top` VALUE (`calc(16px + env(safe-area-inset-bottom))`) — padding would shift the element's internal layout (off-center icon), position just moves it clear. Mid-floating toasts already sitting well above the bar (bottom 84/90) don't need it. **Verify the CSS emits** (grep the built `.next/static/chunks/*.css` for `--sheet-max-h`/`safe-area-inset`/the media query) — Tailwind v4 silently no-ops unknown utilities, though plain authored CSS like this always emits.
- **Don't port a sibling's heavy hook wholesale — match it to THIS app's actual surface, and don't add primitives with no consumer.** M5·P5.3: delivery's `useAnimationPreference` is ~200 lines (localStorage override store, `data-motion` attribute, framer spring/duration utils). QR has **no framer-motion** and no motion-settings UI — porting it verbatim would be dead apparatus. The lean QR version is ~15 lines (`{ shouldAnimate }` off the OS `matchMedia`, reactive, SSR-safe). Same discipline applied to the slice scope: shipped the 3 generic foundation primitives (`useAnimationPreference`/`useInView`/`useDeviceTier`) because the discipline doc prescribes them AND `useInView`+`useAnimationPreference` got a real consumer (the `/track` pulse), but **deferred `useRipple`/`useTilt` to P5.4** — they need a component + pointer wiring to mean anything, so adding them now is the churn-without-enablement the project keeps avoiding (cf. P5.0's deferred type-rename).
- **Offscreen-pause an `infinite` loop by putting the `useInView` ref on a STABLE wrapper, then gating the animating class — never the moving target.** M5·P5.3: the `/track` active-step pulse moves between dots as the order progresses, so the ref goes on the stable `<ul>` and the class is `state==="now" && shouldAnimate && inView ? "mms-track-now" : undefined`. A ref on the conditionally-classed dot would re-attach as the active step moves and the observer would track the wrong/stale node (LEARNINGS: "useRef on conditional render targets breaks observers"). Also: gating a CSS-driven loop with the JS `shouldAnimate` is belt-and-suspenders (the CSS `@media` already stops it) — the genuinely-new win is the offscreen-pause; don't retrofit JS gates onto CSS that's already correct unless you're also adding the pause.
- **`useDeviceTier()`'s `high`/`mid`/`low` are ALL mobile — gate the heaviest GPU on `=== "desktop"`, not `>= "high"`.** A high-core iPhone reports `"high"` but a high core count does NOT lift WebKit's per-tab memory ceiling (the prod iOS-OOM-crash trap). SSR-safe `"low"` first paint so a tier swap can't cause a hydration mismatch; put the heavy loader in a conditionally-RENDERED child so its SDK never loads on mobile (a parent that always mounts loads it regardless). See `docs/MOTION_AND_PERF.md`.
- **After `git reset --hard origin/main` (the post-merge reset this milestone uses), a STALE `apps/qr/.next` makes `tsc` fail with `.next/types/validator.ts: Cannot find module './routes.js'` — it's not your code.** Next 16 typed-routes generates `.next/types/**` (which `tsconfig` `include`s), and a reset leaves it inconsistent with the new tree. Fix: `rm -rf apps/qr/.next .turbo` then re-run the gate (CI never sees this — it starts with no `.next`). Don't chase the error into your diff.
- **A shared chip/badge primitive should encode the contrast-safety rule as semantic `tone` PRESETS, not push raw colors to every call site.** M5·P5.4a deep review (API lens): a `Badge` that only takes explicit `color`/`background`/`dot` makes every adopter re-derive "use the `-strong` text token on a ≥14% tint or it fails AA" — a rule that otherwise lives only in prose comments and WILL escape across 13+ future call sites (a sub-AA gold-on-tint badge). Fix: `tone` presets (`gold`/`jade`/`accent`/`ok`/`warn`/`neutral`) own the AA-correct `{color:-strong, background:tint, dot:vivid}` triple once; keep explicit-color as an override for genuinely bespoke palettes (e.g. FloorStatusChip's flat-on-`--cd` states). Do this at the FOUNDATION slice (2 consumers) — retrofitting after adopters multiply is 13 diffs + 13 re-audits. Also give a presentational chip an `aria-label` + `decorative`(→`aria-hidden`) passthrough so a future icon-only/decorative chip can still be named or silenced.
- **Unifying a primitive's geometry can widen a delta against a NON-migrated sibling that co-renders with it — check adjacency, not just the migrated component in isolation.** M5·P5.4a: unifying the Badge dot to 7px + adding letter-spacing was sub-perceptual on its own, but `FloorStatusChip` (migrated) sits beside `tabChip` (the open-tab pill, NOT migrated) on every TableCard/FloorDetailLive — so the deep review flagged the pair reading inconsistently. Here the pills already differed substantially pre-change (so it's a pre-existing inconsistency, deferred), but the lesson stands: when a dedup primitive changes geometry, grep for OTHER inline chips/cards that appear on the SAME screen and decide migrate-now vs accept-divergence deliberately.
- **Before extracting a primitive, GREP for every consumer yourself — don't trust the stated count (and the second copy will have DRIFTED, which is the actual reason to extract).** M5·P5.4b-2: the handoff said `Stepper` had "only one consumer" (`StaffLineEditor`), which nearly led to deferring it as too-thin. A context sweep for `qty±1`/`increment`/remove-glyph pairs found a SECOND, near-identical stepper — a local `function Stepper` inside `Checkout.tsx` (the customer cart) — that had drifted from the first (`✕`+warn vs `🗑`, center-count present/absent, sold-out dims vs not). Two drifted copies of an a11y-load-bearing control (remove-at-1 label swap, the `qty>=max`/soldOut gate, the "count must be a `<span>` not `<output>`" rule) is the textbook earns-its-keep case. The "only consumer" belief is an artifact of whoever wrote the note only knowing one site — verify with a repo-wide sweep, not the doc.
- **A primitive that needs a `@keyframes` must put the keyframe in the APP's `globals.css` and reference it by className — `@mms/ui` ships NO component CSS (only `tokens.css`), and inline `style={}` can't define an at-rule.** M5·P5.4b-2 `Skeleton`: the shimmer is a `@keyframes mmsShimmer` + `.mms-skeleton` class in `apps/qr/app/globals.css` (beside `fade`/`up`/`mmsPulse`), and the `<Skeleton>` in the package just sets `className="mms-skeleton"` + inline width/height. An inline `animation: shimmer …` would reference a keyframe that exists in no loaded stylesheet → a silent no-op (`animation-name` resolves to nothing). This is the established package↔app split (`Sheet` references `.mms-sheet`, skinned in app globals). An `infinite` loop with a hardcoded duration also needs its OWN `@media (prefers-reduced-motion: reduce){ animation:none }` — the `tokens.css` duration-token collapse can't reach a hardcoded `1.4s`.
- **Color emoji glyphs (🗑) ignore CSS `color`; text glyphs (✕) take it — so a "red trash" remove button can't be done by tinting an emoji.** M5·P5.4b-2: the staff stepper's red ✕ recolors via `color: var(--warn)` because ✕ is a text glyph; the customer cart's 🗑 renders as a platform color-emoji that ignores `color`. That's why the shared `Stepper` keeps `removeGlyph` + `removeTone` as SEPARATE props and each consumer keeps its own glyph (preserve, don't force-converge) — converging both to 🗑 would silently drop the destructive-red affordance. When picking a glyph for a tintable state, prefer a text glyph (✕/−/▲) over an emoji.
- **A planned "primitive with variants" can be a phantom — verify the variant taxonomy against THIS app's actual code before building; the plan often describes the sibling app, not yours.** M5·P5.4c: the roadmap/M5*DESIGN/QR_FROM_DELIVERY all asserted a `Card` with `elevated/outlined/filled` variants. A pre-build sweep found that taxonomy was **delivery's**, not QR's: all 25 `className="card"` QR sites are surface-uniform (every override is just padding) — a `variant` prop would have had ZERO consumers. The only real fork (shadow vs none) was **accidental drift** in 10 hand-rolled inline copies that re-typed the `.card` recipe and silently dropped `box-shadow`. So the earns-its-keep win was \_unifying the drift* (a no-variant `<Card>` that applies the one `.card` class), NOT parameterizing an accident into an API. Lesson: an "obvious" variant API in the plan docs is a hypothesis — grep the real call sites and let the actual variation (or lack of it) decide; surface a plan-overturning finding to the owner (recommendation-led `AskUserQuestion`) rather than building the doc's aspiration.
- **A primitive that wraps a GLOBAL CSS class (not a re-inlined recipe) keeps one source of truth and is the lower-risk migration.** M5·P5.4c `Card` renders `className="card"` (the single `.card` def in `globals.css`) rather than re-declaring bg/border/radius/shadow inline — so it can never drift from the existing class sites (the exact failure mode it's retiring: 10 inline copies that diverged). Same package↔app split as `Sheet`→`.mms-sheet` / `Skeleton`→`.mms-skeleton`. Migrating 25 `className="card"` sites to a `<Card>` component was explicitly NOT done — high churn, zero gain (they already source the class); only the _inline re-implementations_ are worth converting.
- **React 19 ref-as-prop lets a POLYMORPHIC function-component primitive forward a ref with no `forwardRef`.** M5·P5.4c `Card<T extends ElementType>` types props as `{ as?: T } & Omit<ComponentPropsWithRef<T>, …>` and spreads `...rest` (which carries `ref`) onto the resolved `Tag` — so `<Card ref={confirmRef}>` reaches the host `<div>`/`<Link>` for focus management. `ComponentPropsWithRef` (not `…WithoutRef`) is the key: it includes `ref` in the prop type so a ref consumer type-checks AND the ref actually attaches. Verified with the cash-settle / merge-table focus panels (`tabIndex={-1}` + `.focus()`).
- **A "tracked nit" with a cited number can be a PHANTOM — recompute before you act on it.** M5·P5.5: P5.4b-1 left a tracked follow-up that "the two lightest seat avatar hues sit just under AA (~3.6/~4.4:1) behind the white initial" and the `avatar.tsx` comment + QR_FROM_DELIVERY both repeated it. The contrast-audit recomputed against the REAL `PCOL` values: all five hues clear 4.5:1 (lightest `#A65F10` = **4.92**) — the cited figures never reproduced (likely measured a pre-darkening palette or an off-white bg). The whole point of the audit was to TURN the prose AA claim into a computed assertion; doing so dissolved a phantom bug. Lesson: a contrast number written in a comment/doc without the computation behind it is a hypothesis — assert it in a test, don't carry it as fact (or "fix" a non-bug by darkening a fine palette).
- **A contrast-audit should PARSE `tokens.css` at test time, not mirror its hex in fixtures.** M5·P5.5: delivery's audit hardcoded token hex (its own learning: "fixtures hardcode hex → the suite stays green while a token regresses; the dark lift silently dropped 4 combos below AA"). The QR port reads `tokens.css`, regex-parses the `:root`/`.dark` blocks, resolves `var()` aliases (dark `--ac-strong: var(--ac)`), and flattens the `color-mix(in srgb, <hue> N%, transparent)` badge tints over `--cd` via alpha-compositing — so a token edit is checked automatically with nothing to refresh. **Negative fixtures matter too:** assert the vivid hues STAY <4.5 as text (plain `--ac` 4.04 / `--gold` 1.83 on their light tints) so the `-strong` variants can't be silently reverted — but scope those to LIGHT only (in dark the `-strong` tokens deliberately alias the bright base hue, which is legible on dark surfaces, so the "stay below" guard is inapplicable).
- **When regex-parsing CSS, STRIP `/* … */` comments first — a multi-line comment between declarations breaks the parse of the token right after it.** M5·P5.5: the token-parser's declaration scan (`/(--[\w-]+):\s*([^;]+);/g`) silently failed to capture `--ac-strong`/`--gold-strong` (each sits immediately after a multi-line explanatory comment containing `:`/`;`/`%`), → `NaN` ratios; `--jade-strong` (no preceding comment) parsed fine. Fix: `body.replace(/\/\*[\s\S]*?\*\//g, "")` before scanning. The tell was "every token preceded by a block comment is the one that NaNs."
- **pnpm 10/11 HARD-ERRORS on an un-approved dependency build script (`ERR_PNPM_IGNORED_BUILDS`, exit 1) — and turbo runs `pnpm install` as a pre-task dep check, so the whole `turbo` run fails until you approve it.** M5·P5.5: adding `vitest` pulled `esbuild`, whose postinstall was blocked. This repo's approval mechanism is the **`allowBuilds:` map in `pnpm-workspace.yaml`** (`sharp: true`, `unrs-resolver: true`, …) — the file even pre-staged `esbuild: set this to true or false`. Flip it to `true`; `pnpm install` then runs esbuild's postinstall. (Not the documented `onlyBuiltDependencies` list — this repo uses `allowBuilds`, and it works.)
- **Under pnpm's isolated `node_modules`, TS auto-include of `@types/node` can miss even when it's a linked dep — set `types:["node",…]` explicitly in the package tsconfig that uses node builtins.** M5·P5.5: `packages/ui`'s `tsc --noEmit` errored `Cannot find name 'node:fs'` on the fs-based token parse despite `@types/node` being in `packages/ui/node_modules/@types/node`. Adding `compilerOptions.types: ["node", "react"]` to `packages/ui/tsconfig.json` fixed it (keep `"react"` so the ambient JSX namespace stays — restricting `types` drops auto-included @types/react otherwise). Test files ARE typechecked here (tsconfig includes `src/**/*`), so they must pass `noUncheckedIndexedAccess` — guard `match[1]`/`arr[0]` as `string | undefined`.
- **A `.dark`-CLASS token theme with no activation path renders LIGHT-ONLY at runtime — a class-based dark palette needs something to ADD `.dark` to `<html>`; `prefers-color-scheme` only matters if a `@media` query (or a script reading it) actually applies the values.** M5 audit: QR's `tokens.css` ships a full `.dark { … }` Night palette, the contrast-audit asserts it, and `stripe-client.ts`/`SharePay.tsx` read `classList.contains("dark")` — but NOTHING ever toggles the class and there's no `@media (prefers-color-scheme: dark)` mapping, so dark mode was **dead** (the docs even falsely claimed "pure prefers-color-scheme"). `layout.tsx`'s `themeColor` media entries only theme the address bar, not the DOM. The fix (tracked Richness-track R2): a `prefers-color-scheme` inline script that toggles `.dark` (carry the nonce — strict-dynamic CSP) OR next-themes. Lesson: if tokens are class-scoped (`.dark`/`.theme-x`), grep for the code that SETS the class before believing the theme works; a green contrast-audit on `.dark` tokens proves the _values_, not that they ever render.
- **"One live region per view" breaks at the SEAMS, not inside components — per-slice review can't catch it; audit per-VIEW.** M5 audit: every co-rendered pair of polite regions (Checkout-review = the page region + RewardField + SecureTabButton; /track = OrderTracker + FeedbackPrompt; ApprovalsBoard = board + one per card → N+1) was a _composition_ failure — each component is individually correct (and several carry a code comment asserting "the only live region here" that's provably false once mounted together). The rule is enforced rigorously WITHIN components and missed at their junctions. Fix pattern: route child status/error UP to the view's single region via an `onStatus` callback (the `SplitSection` pattern), or scope inactive instances to `aria-live="off"` — do NOT naively strip `role=status`/`aria-live` (that silences real SR text, e.g. a feedback-submit error). Add a per-view live-region check to the QA sweep.
- **A "fix" the audit labels mechanical may actually be a VISUAL change — verify byte-identity before silently shipping it.** M5 audit recommended migrating status chips (followChip etc.) to `<Badge tone>` as "mechanical," but `Badge tone="warn"` adds a `--warnb` fill + a dot vs the chip's outlined-no-fill look — a real visual delta. Byte-identical migrations (EmptyState→Card, SettlementBoard avatar→Avatar md) are safe to ship in an audit-fix; anything that changes the rendered pixels (chips→Badge, opacity-dim→bg-dim) is a deliberate visual change → defer to a flagged slice with preview review, never fold silently into a "cleanup" PR (the owner's #1 frustration is regressions).
- **`useAnimationPreference()` seeds `shouldAnimate=true` until its media-query effect resolves — so any MOUNT-TIME animation or side-effect gated on it leaks ONE frame/fire for reduced-motion users. Gate mount-time motion with CSS `@media (prefers-reduced-motion)` or a synchronous `matchMedia` read, NOT the hook.** R7a: the pay-success haptic (`navigator.vibrate`) and the framer checkmark draw (`m.path` `pathLength`, which framer's `reducedMotion` does NOT disable — it only covers transform/layout) both fired once for RM users because the effect/initial ran on the first render before the hook's effect flipped `shouldAnimate` to false (Codex flagged both, two rounds). Fixes: haptic → read `window.matchMedia("(prefers-reduced-motion: reduce)").matches` synchronously in the effect; checkmark → drop framer entirely and do the ring scale-in + stroke draw as pure CSS `@keyframes` with `@media (prefers-reduced-motion: reduce){ animation:none; stroke-dashoffset:0 }` (race-free, SSR-safe, no hydration concern, and lighter). The hook is fine for RENDER-DERIVED gates that re-evaluate when it settles (R7a confetti: `celebrate = shouldAnimate && tier!=="low"` — `tier` also starts `"low"` so `celebrate` stays false until both resolve, and the confetti has a `@media reduce{display:none}` CSS backstop anyway). Rule of thumb: **mount-time motion → CSS `@media`/sync `matchMedia`; ongoing render-gated motion → the hook (with a CSS backstop).** Same R7b discipline applied proactively (tip/CTA press + the keyed checkout step-enter are all CSS `@media`-gated, no hook).
- **The paid order becomes VISIBLE (Realtime/poll) BEFORE its `earned_by` is stamped — a one-shot client read of rewards attribution races the webhook and can permanently under-credit a real earner.** R8: `mms_fulfill_order` inserts `qr_orders(status='paid', earned_by=NULL)` and commits (firing Realtime) FIRST; the webhook then stamps `earned_by` + runs `mms_reward_on_fulfill` in SEPARATE later awaited calls (single-pay + split), after an intervening `await enqueueQboSync`. So `/track`'s `getRewardsProgress(order.id)`, if fetched the instant `useOrderStatus` surfaces the order, reads `earned_by=NULL` → `earnedThisOrder=false` → NO "+N Star earned" pill/caption for the genuine earner — and a **one-shot ref guard never recovers** (the later `earned_by` UPDATE re-fires the effect, but the guard early-returns; `useOrderStatus`'s SELECT omits `earned_by` so the content is unchanged anyway). Fix = **poll-until-attributed**: retry `getRewardsProgress` on a bounded budget (5×/1.2s), keep the latest snapshot, stop once `earnedThisOrder` is true (or the cap), settling silently for genuine non-earners/no-session — this also self-heals a transient fetch error the one-shot would have made permanent. My pre-PR review's "arrived ⇒ earned_by stamped" assumption was WRONG (fulfillment isn't one transaction); Codex + the pre-merge deep review both caught it. Corollary bug the fix introduced: `const orderId = order?.id` **shadowed the destructured `orderId` prop** (TS2300) — the gate would've caught it, but name locals distinctly (`resolvedOrderId`). Related consistency win: in `getRewardsProgress`, read the order's `earned_by` **before** the summary RPC (both key off the same stamp) so a true `earnedThisOrder` guarantees the summary count already includes this order (no lagging "N to next reward" / missed "Reward unlocked").
- **A `{/* JSX comment */}` in EXPRESSION position (a ternary branch, `&&` RHS, a bare `( … )` return) is a syntax error, not a comment — it parses as a block/object.** R9a: `cond ? (<A/>) : ( {/* note */} <StaggerList/> )` failed with `TS1005 ')' expected`. JSX comments are only valid as element CHILDREN (`<ul>{/* ok */}...</ul>`). In expression position use a line comment ABOVE the branch (`// note`) instead. Quick tell: the error points at the `(` opening the branch, not at your real code.
- **`box-shadow: var(--token)` silently renders NOTHING when the token is a bare COLOR (no offset lengths) — a color-only `box-shadow` is invalid and the whole declaration is dropped; Lightning CSS can't detect it behind a `var()`, so "build green + class emits" does NOT mean the shadow paints.** R8: `.reward-rung-current { box-shadow: var(--glow-ac) }` where `--glow-ac` = `color-mix(in oklab, var(--ac) 38%, transparent)` (a radial-gradient STOP color, per its own token comment) → the current-tier "glow" never appeared. Use a real shadow token (`--sh-glow` = `0 6px 22px color-mix(…)`) or wrap the color with offsets (`0 0 0 3px var(--glow-ac)`). Same family as the "grep the BUILT CSS to confirm a class exists" trap, one level deeper: the class emitted, but its VALUE was invalid-at-computed-value-time. When a decorative glow "doesn't show," check the shadow value has lengths, not just that the rule shipped.
- **`supabase gen types --local` pulls `postgres-meta` from `public.ecr.aws` IGNORING `SUPABASE_INTERNAL_IMAGE_REGISTRY` (CLI 2.107.0) — and GitHub's shared runner IPs routinely trip ECR Public's anonymous pull rate limit (`docker: toomanyrequests`), failing `types-fresh` on a diff that touched no SQL.** `supabase start` respects the ghcr override (all stack images pulled fine both times); only the gen-types-spawned meta container hits ECR. An immediate `rerun_failed_jobs` re-hit the same limit (same window/IP pool) — this flake doesn't re-kick cleanly like most. Durable fix (ci.yml): pre-pull `ghcr.io/supabase/postgres-meta:<ver>` and `docker tag` it with the `public.ecr.aws/...` name so the gen step finds it locally and never contacts ECR; the tag tracks the pinned CLI (2.107.0 → v0.96.1 — bump both together). Distinguish from the delivery repo's "quota exhausted = ALL workflows fail at startup" pattern: here the sibling `build` job on the same push was green.
- **`pnpm format` (prettier --write) racing an immediately-chained `pnpm turbo typecheck` intermittently fails the gate with a phantom error — turbo hashes/reads inputs while prettier is still flushing writes, and the compile sees a half-written file.** Bit three times across J4–J6 (same shape every time: `Failed: @mms/qr#typecheck`, exit 2, NO error lines in the log; an immediate `--force` re-run is green with zero diff). Don't diagnose the diff — re-run `pnpm turbo typecheck lint build --force` on the settled tree first; if THAT is green twice, the failure was the race, not the code. Prevention: don't `&&`-chain format straight into turbo in one shell line — run format, let it exit, then gate (or skip format when nothing needs it). Distinguish from a REAL typecheck failure by the empty error output: a genuine break prints `error TS…` lines.
- **A "table registry" that maps a KNOWN number (1–10) to its sticker token turns the picker into an oracle — so the token's secrecy is gone, and the join-auth model has to be re-drawn, not just extended.** K2: today a remote dine-in join needs the host's unguessable code; a physical sticker scan (`?t=`) joins code-free because presence is the implicit auth. A number→token picker lets anyone pick "3" and get table 3's token, so an occupied-table pick would be a code-free remote join into a stranger's LIVE cart/order. The fix isn't cryptographic (the picker itself is the oracle) — it's a POLICY the owner must choose: seated-table picks require the party's code (open→claim, seated→`?j=`), the physical sticker stays the code-free path. Treated it as a consequential fork → `AskUserQuestion` before building (repo rule), not a default. **Belt-and-suspenders it server-side:** the picker is advisory, so the CLAIM path (`?table=N`) must 409 rather than converge when it finds the table already active OR loses the insert race — otherwise the race silently violates the policy the UI enforces. The plan's convergence rule (a companion sticker-scan joins, not twins) still holds — it's on the STICKER path (`tableNumber` null), which the claim guards don't touch. Also: strip `?table=` on mount or a reload re-sends it → the diner's own now-active session 409s their reload.
- **A registry token that doubles as the human-typed JOIN CODE must match the join-code CHARSET, or the typed-join fallback silently breaks.** K2 first seeded `qr_tables.qr_code` as `'t'||gen_random_uuid()` (33-char lowercase hex) — but the session's qr_code IS the joinCode shown in the invite sheet + typed into `JoinTable`, which `.toUpperCase()`s input before an EXACT `.eq("qr_code", code)` match. Lowercase-hex → uppercased on type → never matches; and a 33-char blob is untypable anyway. Fix = seed 8-char UPPERCASE tokens (`upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))`, `gen_random_uuid` is volatile so it's per-row-distinct), matching `generateJoinCode`'s format. When a new opaque id will ALSO be shown/typed by a human, check the existing input-normalization path (case-folding, allowed alphabet) before picking its format.
- **For a session-derived label to survive on ORDER surfaces, denormalize it onto the order — the live-session read expires.** K2: the table number lives on `table_sessions`, but `/track` (anon RLS embed of `table_sessions`) and the account receipt (session closed days later) both read through `is_member` = `status<>'closed' AND expires_at>now()`, so a live join goes NULL after the ~4h TTL. Session-backed surfaces (arrival/guest-list/settle/floor/KDS — read during the visit) read `table_sessions.table_number` live; order-backed surfaces (expo/track/receipt) read a denormalized `qr_orders.table_number` STAMPED at fulfillment (a scalar `select … into v_table` off the already-loaded `v_session`, one extra insert column in all three fulfill RPCs — additive, money math untouched). Same snapshot pattern the RPCs already use for `pickup_slot`/`fire_at`. A plain int (no FK) — a re-numbered/retired table must never cascade to or block a paid order.
- **Never use a REAL secret as a UI placeholder — especially in a `"use client"` component (it ships to every browser + git).** K2: the table-picker's party-code input had `placeholder="e.g. 800FA82B"` — which was, by careless copy from a query output, table 7's ACTUAL seeded `qr_tables.qr_code` (a live dine-in join token). A client-component string is compiled into the JS bundle AND committed to public git, so that one placeholder handed a stranger table 7's live join credential: `?j=800FA82B` → mint resolves table 7's active session and (because the code path carries `qrCode`, not `tableNumber`) BYPASSES the new picker-claim 409 guards → code-free join into the live party. Defeated the entire K2 threat model for one table via a "cosmetic" string. The adversarial pass caught it by cross-checking the placeholder against the live registry. Fixes: (1) synthetic placeholder, (2) ROTATE the leaked token (it's permanent in git history + shipped bundles). Bonus safe-placeholder property: seeded tokens are hex-derived (`upper(substr(uuid_hex,1,8))` → chars 0-9A-F only), so a placeholder containing G–Z (e.g. `WXYZ1234`) is PROVABLY never a real token. Rule: placeholders/fixtures/examples for a credential field must be drawn from a namespace that can't collide with the real values.
- **MCP `generate_typescript_types` (prod-gen) differs from `supabase gen types --local` (the CI byte-compare) in TWO spots, not one — strip BOTH or `types-fresh` fails on a green migration.** No local Docker → types are regenerated via the Supabase MCP after applying a migration to live. (1) Prod-gen emits the header `__InternalSupabase: { PostgrestVersion: "…" }` block (+ its two comment lines) that local-gen omits — strip it, but KEEP the later `type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">` helper (local-gen emits that). (2) Prod-gen ends the file at `} as const\n`; local-gen appends a **trailing blank line** (`} as const\n\n`). K2's `types-fresh` failed on exactly that one missing `+` line. Fix = `printf '\n' >> packages/db/src/database.types.ts`. The file is `.prettierignore`'d so the trailing line survives formatting. Verify after stripping: the committed file must end with `} as const` + a blank line, and contain no `__InternalSupabase: {` block. (`gen types --local` isn't runnable here; the CI diff is the only oracle — so match both known deltas up front rather than round-tripping through a red CI.)
- **`router.refresh()` re-renders SERVER components only — it does NOT remount client components or re-fire their effects — so any client-side session change (sign-out, sign-in, anon re-mint) must be established BEFORE the refresh, or the server re-render sees the stale/absent session.** K3a: a diner "sign out" did `await auth.signOut(); router.refresh()` expecting AnonAuthGate to re-mint a guest session. It doesn't — AnonAuthGate's effect deps are `[pathname, router]` (unchanged on refresh), so the app sat SESSIONLESS: `/account`'s `getRewardsState()` returned null → the scary "couldn't load your rewards" alert (the opposite of the promised clean guest state), and the header kept the now-former account's wallet chip (no `SIGNED_OUT` handler + no effect re-run). Fix = re-mint inline, mirroring AnonAuthGate's own pattern: `await supa.auth.signOut(); let {error}=await supa.auth.signInAnonymously(); if(error)({error}=await supa.auth.signInAnonymously()); startTransition(()=>router.refresh())` — now the server re-render has a session (anon) AND the `SIGNED_IN` event refetches auth-derived client state (badges). General rule: `router.refresh()` is a SERVER re-render trigger; pair every client auth mutation with the client-side session it should leave behind. (Related: reset any `busy` flag BEFORE the refresh — if the re-mint fails the component doesn't unmount, so a finally-less `setBusy(true)` sticks the button.)
- **A ledger merge whose mint-guard is `unique(user_id, milestone_index)` needs NO watermark column — the coupon ROWS ARE the watermark, IF you move them and re-index contiguously above the target's MAX.** K3b: `mms_rewards` mints one coupon per milestone via `insert … on conflict (user_id, milestone_index) do nothing`, keyed off `count(*) where earned_by = uid`. Merging an anon uid's paid orders onto a target re-counts orders that ALREADY minted (possibly redeemed) anon coupons → the same 5 paid orders could mint a SECOND $5 coupon on the target. Solution (no new column): move the anon coupons and set `milestone_index = MAX(target_index) + row_number() over (order by milestone_index, issued_at)`. Three load-bearing properties (do NOT "simplify" any): (1) offset = **MAX**, never `count` — a gap would let the offset collide; (2) re-index by **`row_number()`** (dense 1..n), never the original index — non-contiguous/orphaned indices would collide; (3) **REDEEMED coupons move too**, as index-occupiers — else their milestone re-mints a spent reward. Then MINT the single legitimate **boundary** milestone the combined orders justify (`floor(A)+floor(B) ≤ floor(A+B) ≤ +1`, exactly-once — it either no-ops on an occupied index or mints the one carry). The unique constraint + a fully-occupied index range IS the double-mint guard.
- **Prove a money-path DB function's invariants with a self-rolling-back `DO` block BEFORE shipping — no local Docker needed, nothing left on prod.** K3b: applied the migration to live via MCP, then ran ONE `execute_sql` `DO $$…$$` that (a) inserts synthetic `auth.users` (anon + target) + `qr_orders` + pre-existing `mms_rewards` chosen to cross exactly one boundary milestone AND carry a redeemed anon coupon, (b) calls the merge (twice, to assert idempotency), (c) asserts final coupon count == `floor(combined/step)`, `count(distinct milestone_index)` == count (no dup), the redeemed coupon survived, orders re-stamped, second call returns zeros, then (d) **`raise exception 'MERGE_TEST_OK …values…'`** to force a full rollback and surface the computed values as the error text. A `FAIL: …` raise on any failed assertion. Everything (incl. the `auth.users` inserts) rolls back because the DO block raised. This turns "the invariant is documented in a comment" into "the invariant is proven against the REAL function on the REAL schema." (Pick star counts so the fractional parts sum to exactly `step` — that's the boundary-carry case the naive count-offset would double-mint.)
- **Redeem a single-use bearer token MERGE-FIRST, mark-redeemed-AFTER — when the underlying operation is idempotent, claim-first atomic-burn is the WRONG default (it strands value on a burned token if the op then fails).** K3b: the obvious design is `.update({redeemed_at}).is(redeemed_at,null)…select()` to atomically claim, then run the merge. But if the merge RPC then fails (network/timeout), the token is burned yet the Stars never moved → permanently stranded, no retry. Because `mms_merge_anon_rewards` is idempotent via the `mms_identity_merges` PK (`insert … on conflict do nothing; if not found return zeros`), EXACTLY ONE caller ever gets counts>0 no matter how many times it runs — so the PK, not the token, is the real single-use authority. Redeem = read token → run merge (idempotent) → mark token redeemed (best-effort hygiene). A transient failure leaves the token live for the next `/account` load / `SIGNED_IN` to retry; the 24h TTL bounds it. Return contract split so the client knows: `null` = transient/not-yet (keep token, retry), a summary object = terminal (clear token; celebrate only if counts>0). Rule: atomic-claim-first is for NON-idempotent effects; for an idempotent one, do the effect first so a retry is always safe.
- **A merge token for the anon→existing-account flow must be minted BEFORE `signInWithOAuth`/`signInWithOtp({shouldCreateUser:false})` fires and stashed in `localStorage` — the Google path is a full-page PKCE redirect that destroys the JS heap.** K3b: the upgrade-in-place paths (`updateUser` email_change / `linkIdentity`) keep the same uid (no merge). Only the two SIGN-INTO-EXISTING recovery paths (email-taken OTP, `identity_already_exists` Google) switch uid and abandon the anon device's Stars. Mint the token in those two branches specifically, while still anonymous; persist to `localStorage` (survives the redirect); `/account`'s redeemer picks it up on mount AND on `SIGNED_IN` (email OTP fires SIGNED_IN in-place; the Google return re-mounts /account and resolves the session a beat after first paint, so the mount attempt is still anon → null → retried on the SIGNED_IN the PKCE exchange fires). Both attempts ref-guarded so it never double-merges/re-celebrates. Corollary copy fix: the pre-merge microcopy said "signing in won't transfer your Stars" — once the merge ships, that honest-then copy is a lie NOW; sweep it to "we'll move this device's Stars onto it."
- **`react-hooks/set-state-in-effect` flags an `async` helper called in the effect BODY even though its setState is post-`await` — defer the mount call with `requestAnimationFrame` (the lint can't see through the async boundary).** K3b `MergeRedeemer`: `useEffect(() => { void attempt() … })` where `attempt` awaits a server action THEN maybe setStates, still trips the rule (it statically sees "effect body → transitively setState"). Fix = `const raf = requestAnimationFrame(() => void attempt()); return () => cancelAnimationFrame(raf)` (matches `TierUpCelebration`'s rAF-deferred setState). The SAME `void attempt()` inside the `onAuthStateChange` callback is fine — a setState in an event/async callback registered by the effect is allowed; only the synchronous effect-body call is flagged.
- **A "live orders" read must filter the terminal status in JS, NOT PostgREST `.neq()` — `col <> 'x'` is NULL for a NULL column, so `.neq("togo_status","picked_up")` silently DROPS every dine-in order (togo_status null).** K4: `getMyLiveOrders` wanted "not picked up," but a dine-in order has `togo_status = null` (only to-go/pickup get a bagging status). PostgREST `.neq("togo_status","picked_up")` compiles to `togo_status <> 'picked_up'`, which evaluates NULL (not TRUE) for null rows → they're excluded. Fetch without the filter and drop `r.togo_status === "picked_up"` in JS (or use `.or("togo_status.is.null,togo_status.neq.picked_up")`). Same three-valued-logic trap as any `<>`/`!=` against a nullable column. Verified the terminal check keeps null-togo dine-in rows.
- **`qr_orders` has NO mode/fulfillment column — derive the display "kind" from the LINE fulfillments + `pickup_slot`.** K4: `ActiveOrder.mode` (`dinein|scango|pickup`) is a CLIENT/URL concept; the order row only knows per-line `qr_order_items.fulfillment` (`dinein|togo|grocery`) + `pickup_slot`/`table_number`. Kind precedence that reads right: a dine-in line ⇒ dine-in (even alongside a to-go box) → else a pickup slot ⇒ pickup → else to-go food ⇒ to-go → else a pure grocery basket. Embed `qr_order_items(fulfillment)` in the orders select to compute `hasTogoFood`/`hasGrocery`/`hasDinein`.
- **A dine-in qr_orders row exists only AFTER settle (payment), so "live dine-in order" is a short post-pay window — session-bound it or it lingers 12h.** K4: the kitchen "order" during a dine-in meal is the CART/session firing (`qr_cart_items` line states), not a `qr_orders` row; the row is minted by the payment webhook. So `getMyLiveOrders` (status='paid') shows dine-in only post-settle. A to-go/pickup order has a clean terminal signal (`togo_status='picked_up'`); a dine-in order never does (you eat there), so bound it by its SESSION (`table_sessions.expires_at > now()` + status<>'closed') — nothing in the diner settle flow closes a session, but staff-close and the 4h TTL sweep do, so "until the session closes" alone would show a finished dinner as live for hours. The mid-meal wayfinding is the cart/resume-your-table affordance (separate), not the order tray.
- **A multi-order header pill needs BOTH sources — the client store for instant/this-device, the server read for multi/cross-device — with clear precedence, not a merge.** K4: the collapsed single pill keeps its one realtime channel (`useActiveOrderStatus` over the client `ActiveOrder`) for the instant post-pay status word (earned_by is stamped a beat AFTER the order is visible, so a server-only pill would lag). The count/tray use `getMyLiveOrders` (earned_by, the authoritative multi-order truth incl. cross-device). Compose, don't merge: **≥2 → tray; ≤1 → client order if known, else the lone server order; 0 → nothing.** This surfaces a cross-device single order (client store never knew it) AND keeps the instant local one, with zero new realtime channels (the tray is a poll refetched on visibility/focus/new-order — the J3 rule). `pokeKey`=the client order key nudges a refetch when a new order lands so the badge catches up after the earned_by stamp.
- **Put the shared status vocabulary + deep-link builder in a PURE module a `"use server"` file can import — not in the server-action file (whose exports must all be async).** K4: `lib/live-order.ts` (no directive) holds `LiveOrder`, `liveOrderStatusWord`, `liveOrderTrackHref`, the glyph/label maps; `lib/orders.ts` (`"use server"`, exports only `getMyLiveOrders`) imports them, and the client tray/row/Today import them too. One source means the tray can never show a status word or a `/track` link the tracker itself wouldn't — the `/track` URL shape (single-pay `?payment_intent=…&redirect_status=succeeded&cart=…` vs split `?cart=…&paid=1`) lives in ONE place instead of being re-hand-rolled per surface.
- **A "your live orders" list read service-role (bypassing RLS) can surface orders /track (client, RLS-gated) can't READ — bound the list to what the deep-link target can actually open, not just to what's "not terminal."** K4 pre-PR review MED: `getMyLiveOrders` (serviceClient) saw every paid order for 12h, but `/track`'s realtime read is gated by `qr_order_read` = `is_member(session_id)`, which lapses when the ~4h session closes/expires. So a pickup/to-go/grocery order in the 4h–12h post-session window showed in the tray but tapping it mounted an OrderTracker whose RLS read returns nothing → an unresolving "finalizing…" spinner. Fix: gate EVERY kind on session-liveness (session_id ∈ open-sessions), not just dine-in — the tray then shows exactly the orders /track can open. General rule: when a service-role list feeds deep-links into an RLS-gated detail view, intersect the list with the detail view's read authority, or the affordance strands the user. (The plan's "session-bound dine-in only" was too narrow; the deeper constraint is /track readability, which is session-scoped for all modes.)
- **A "re-pin the funnels by a new dimension" close needs to VERIFY the dimension has non-null values in PostHog — an event carrying a property ≠ the property having data.** K6: `session_created` carries `door` (the K0 property is in the event's taxonomy), but `read-data-schema event_property_values session_created door` returned "does not exist in the taxonomy" — i.e. every ingested `door` is null (no diner has entered through a wired door in this env). So the door-split funnel comparison is PENDING traffic, not screenshottable. Don't fabricate a before/after; document "wired + captured, awaits real traffic" (the J0 honesty: "the funnels decide whether it's met in the room"). Also: a bare sticker scan with no `?door=` mints `door: null`, so the door dimension reads "unclaimed" for direct/legacy entries until every physical sticker carries a door param — a rollout task, not a code gap. Check `event_property_values` (not just `event_properties`) before claiming a breakdown is readable.
- **The written event catalogs drift from what's actually emitted — grep the real `capture(` sites, don't trust the taxonomy comment.** K6 recon: `instrumentation-client.ts`'s "Event taxonomy" comment and `posthog-setup-report.md` both list aspirational events (`qr_scanned`, `menu_viewed`, `item_viewed`, `cart_viewed`, `checkout_started`, `add_to_cart`) that are NOT emitted; the real funnel anchors are `session_created` (carries `mode`+`door`) → `item_added_to_cart` → `send_to_kitchen`/`pickup_slot_set` → `payment_intent_created` → `payment_succeeded`, with the client entry on `mode_selected`/`door_opened`/`menu_item_add_clicked`. When building/pinning a funnel, enumerate the events from the code's actual `posthog.capture(`/`getPostHogClient().capture(` calls, not from the taxonomy prose (which is a wish-list that outlived the wiring).
- **QA-CHECKLIST.md is "the working gate, not a trophy" — boxes are intentionally unchecked; record closures in `docs/REVIEW.md` (or the plan-doc close), don't flip `- [ ]`→`- [x]` in the checklist.** K6: the sweep close for the K-track went into `docs/REVIEW.md` (a dated "QA sweep close" section cross-referencing §A/§C + the per-PR adversarial verdicts) and the `JOURNEY2_PLAN.md` track-close section, leaving `QA-CHECKLIST.md` untouched. The J/K tracks had stopped logging in REVIEW.md (its progress log ended at S1.2) — the track close is the moment to restore that record, since CLAUDE.md names REVIEW.md as where per-milestone QA closure lives.
- **`supabase gen types` can leak its telemetry error into the redirected output file — regenerate with `DO_NOT_TRACK=1` and check the file's tail before committing.** W3: the local stack was reachable but PostHog wasn't, so the CLI appended `{"_tag":"Error"…"Timeout while shutting down PostHog…"}` to STDOUT — straight into `database.types.ts` via the `>` redirect. The file compiled-looking (`} as const` then the JSON line) and would have failed CI's byte-diff AND typecheck. `db:types` verify = `tail -3` must end `} as const` + blank line.
- **The LOCAL supabase stack's default table privileges differ from hosted — anon/authenticated/service_role can lack SELECT on tables that work fine in prod; `grant` locally for a smoke test, it is NOT a migration bug.** W3: `/api/board` 42501'd ("permission denied for table qr_orders") against the local stack even with the service key; hosted applies grants on table creation that the local image didn't. Diagnostic: `information_schema.role_table_grants` showed service_role missing SELECT on EVERY table (incl. menu_items, which anon reads in prod daily) → environment quirk, not a repo revoke. One local `grant all on all tables … to service_role` unblocks; never ship that as a migration.
- **A `drop function if exists` guard must list the NEW signature too, or the migration isn't re-runnable — and a mid-file abort silently skips every later section.** W3: `mms_cart_item_insert_if_open` grew a `p_notes` default param; the migration dropped only the OLD 8-arg signature, so a re-apply hit "already exists" at §9 — and because psql stops there, §10–12 (the merge notes-guard among them) never re-applied, which surfaced as a MYSTERY test failure two sections downstream. Idempotency check = apply the migration file TWICE against the local stack before calling it done.
- **Any guard written for the "open cart" flow needs re-checking the moment a row can legitimately act POST-settlement — `mms_line_transition` guarded `c.status='open'`, so every line fired AT checkout (paid cart) was unbumpable from the KDS.** W3 found this latent since S4.2: `mms_fire_pending_food` fires draft food on the just-PAID cart, the queue read deliberately includes paid carts ("lines on a paid cart still show until the cook bumps them served") — but the bump's own RPC refused paid carts, 0-rowing into the benign "already updated" toast forever. The three-layer lesson: when a state machine gains a post-settlement producer, sweep every CONSUMER edge's cart-status guard; a "benign" 0-row message can hide a dead affordance indefinitely.
- **Playwright + a hand-built `sb-<ref>-auth-token` cookie ("base64-" + base64url(session JSON), ref = first hostname label) signs a staff session into the local app without any UI auth flow — the fastest path to authed staff-surface screenshots.** W3: admin-create the user (GoTrue `/admin/users`, `email_confirm:true`), insert the staff row, password-grant for the session JSON, set the cookie for localhost — `requireStaffPage`'s `getUser()` verifies it against the local GoTrue happily. Chunk at ~3180 chars into `.0/.1` suffixes only if the payload exceeds one cookie.
- **Never `readFileSync(new URL("./asset", import.meta.url))` a bundled file in a route that feeds ROOT-LAYOUT metadata — the bundled `URL` fails Node fs/url's native `instanceof URL`, throwing `ERR_INVALID_ARG_TYPE`/`Invalid URL` at RUNTIME, and since the OG-image module is imported to emit every page's `og:image`, that 500s EVERY page (a prod homepage outage).** W7: `opengraph-image.tsx`'s font load read `readFileSync(new URL("./_og/*.woff", import.meta.url))`. It builds + prerenders fine and even serves 200 under local `next start` (degrades to the cached static body + a _logged-but-non-fatal_ error), so it passed the gate AND the pre-PR AND a 3-lens pre-merge adversarial pass AND a local `next start` smoke — the fault is fatal ONLY in the Vercel server bundle, where the OG module's runtime import (for the root-layout `og:image` tags) throws. `fileURLToPath(urlObject)` hits the SAME instanceof crash (pass a STRING like `.href`, not the object); `fetch(new URL(file://))` is unsupported on the Node BUILD runtime. Runtime-agnostic fix = **base64-embed the asset as a `Buffer` in a `.ts` module and import it** (no file/URL/tracing at build or runtime). General rule: a fault in ANY module transitively imported by root-layout `metadata`/`generateMetadata` 500s every page — treat asset loading there as load-bearing, and verify the DEPLOYED build, not just local `next start` (which masks bundle-only URL/fs faults).
- **Local-stack grant quirk, part 2 (W4):** anon/authenticated ALSO lack SELECT locally — public catalog reads (grocery/menu) and the session mint all fail, not just staff surfaces; restore the full baseline for a smoke test (`grant usage on schema public` + `grant all … to service_role` + `grant select … to anon, authenticated`), then RE-APPLY the repo's intended revokes (lockdown_grants) so the smoke doesn't run laxer than prod. And when GitHub-release downloads are blocked in a sandbox, `npm i supabase@<ver>` works — the pinned CLI ships as `node_modules/.bin/supabase` (dist shim) and its `gen types --local` output byte-matched CI's. (Read the W3 grants + telemetry bullets BEFORE booting the stack; this session re-diagnosed both.)
- **First `turbo typecheck` run right after a burst of file writes can fail while a direct `tsc --noEmit` passes — re-run before diagnosing (W5c: happened twice in one session; the immediate rerun was green both times).** Likely turbo's input hashing racing freshly-written files. Don't burn a cycle chasing phantom type errors: `pnpm --filter @mms/qr exec tsc --noEmit` is the truth check; if it's clean, just re-run the gate.
- **Headless Chromium in this sandbox can't reach EXTERNAL hosts (net::ERR_CONNECTION_RESET even with `proxy:{server:$HTTPS_PROXY}` + args) — run browser checks against `localhost` instead (it's on the proxy's noProxy list).** W5c·r3: boot `pnpm --filter @mms/qr dev` with the QR env override (publishable key via the Supabase MCP `get_publishable_keys`), then Playwright from the GLOBAL install (`import ... from '/opt/node22/lib/node_modules/playwright/index.mjs'` — ESM ignores NODE_PATH) with `executablePath:'/opt/pw-browsers/chromium'`. Also: locate menu rows by `aria-label*=` (names split across spans defeat `hasText`), and the first dev-server hit compiles for >30s — warm the route with curl before the browser run.
- **React dev-mode flags a hydration mismatch on the CSP-nonce'd theme script (`+ nonce="..."`) — benign and PRE-EXISTING (browsers strip `nonce` from the DOM, so the client diff can never match). Don't attribute it to your diff; it appears on every page in dev.**
- **`getCartTotals` (the CHARGE authority) reads each cart line's `tax_cents` only as a BOOLEAN taxable flag and taxes the FULL `unit_price_cents` — a per-line `tax_cents` is NOT a stored amount you can partially adjust.** W5c pre-merge: trying to fix a hot-add-on-on-cold-parent under-collection by writing a per-part `tax_cents` (base exempt + add-on taxed) at the line-insert layer BACKFIRED — it flips the line's boolean to taxable, so `getCartTotals` then taxes the whole salad+add-on line (OVER-charging the real Stripe amount), the opposite of the intended fix. Modifiers fold into `unit_price_cents` at insert (only labels persist in `modifiers` jsonb), and `mms_set_line_fulfillment` recomputes tax on a fulfillment toggle from `unit_price_cents` + the single category — so there is NO place a partial taxable base survives. A modifier's price delta MUST inherit its parent line's tax category until a real per-line-taxable-base engine exists (persist a `taxable_base_cents` recomputed at every tax-write site incl. the SQL toggle path, and have `getCartTotals` sum it instead of the boolean×full-unit-price). Corollary: any "fix" at the line-storage layer that doesn't also change `getCartTotals` + the webhook reconcile + split math is only lying to the boolean authority. (Caught by the Codex auto-review after the in-session pre-merge pass missed it — the data-integrity lens verified seed↔live but no lens traced the stored `tax_cents` all the way into `getCartTotals`. Add "trace the money field into the CHARGE authority, not just the write site" to money-path reviews.)
- **Removing/softening a gate silently drops EVERY invariant it was quietly enforcing — enumerate them before you delete it.** W5e made pickup "ASAP" a first-class default and, to do so, softened create-intent's "a pickup order must hold a slot" check to accept a null slot. But that slot gate was the ONLY thing enforcing the kitchen's **open-hours** block (after close, `mms_pickup_slots` returns empty → the old null-slot 400 blocked ordering) AND **per-slot capacity** (the capacity count keys on `pickup_slot = s`, so a null-slot order consumes none). Softening it created an uncapped ASAP lane that would take a paid order into a CLOSED kitchen and flood it past the per-slot cap — a real ops regression, caught by the pre-PR adversarial pass (product-UX lens), not the happy-path build. Fix pattern: don't make ASAP "no slot" — make it SNAP the earliest bookable slot (so it reuses the exact hours+capacity machinery `mms_pickup_slots` already encodes) while firing immediately (`fire_at = null`), and enforce it at the CHARGE boundary so a client can't dodge it. General rule: when you relax a validation, list what that validation was load-bearing for (hours, capacity, authz, rate, idempotency) and re-home each invariant somewhere explicit — a gate often guards more than its comment says.
- **Adding a route-segment `error.tsx` SILENTLY INHERITS NOTHING — it shadows the parent boundary and drops every recovery the parent was quietly doing.** W10b gave `/staff` its own staff-voiced boundary ("your sign-in is fine; run on paper") and, by existing, that file took over for every `/staff` route — silently dropping the root boundary's stale-deploy `ChunkLoadError` one-shot hard reload and its explicit `posthog.captureException` (React swallows the error before posthog's auto-capture sees it). The blast radius was the inverse of the intent: the KDS/expo tablets are the **longest-lived tabs in the building**, so they are the likeliest to be holding chunk URLs a deploy has already replaced — and `reset()` just re-requests the dead URL and loops. Caught by the pre-merge adversarial review (correctness lens), not by types, lint or CI: shadowing is invisible to all three. Fix pattern: extract the parent boundary's recovery into a shared module (`lib/error-recovery.ts`) the moment a SECOND boundary appears, so a future segment gets it by construction. General rule (the sibling of "softening a gate drops its invariants"): before adding a component that OVERRIDES a framework-level one — `error.tsx`, `not-found.tsx`, `loading.tsx`, a nested layout, a middleware matcher — read the thing you are shadowing and enumerate what it does BEYOND rendering, then re-home each behavior explicitly.
- **Never measure a DURATION by subtracting timestamps from two different clocks.** W10b's frozen-board banner escalates to "take new orders on paper" after 2 minutes, and computed that as `clientNow - Date.parse(snapshot.serverNow)` — a device clock minus a SERVER instant. On a tablet whose clock ran 10 minutes fast the board jumped straight to the paper-flow instruction after 5 seconds frozen; on one running 10 minutes slow it would never escalate at all. Skew, not elapsed time, was deciding the operational advice given to a kitchen. Confirmed independently by four verifiers in the same review. The distinction that fixes it: an INSTANT you only ever _display_ is safe to take from the server (`toLocaleTimeString` renders an absolute instant in the device's timezone — a wrong device _clock_ can't corrupt it), but any ELAPSED you compare against a threshold must have both endpoints in ONE domain — stamp the start in the same clock the tick advances (the KDS already had an offset-corrected server-space `nowMs`, so it stamps server-space; the other boards tick `Date.now()`, so they stamp `Date.now()`). Corollary for reviews: `someServerIso` and `Date.now()` appearing in the same subtraction is a grep-able smell.
- **A "preserve the existing state" fold silently freezes EVERY field in it — name the ones you mean to keep.** W10b's boards hold `degraded = {since, cause}` and wrote `setDegraded((d) => d ?? next)` so a repeated failure wouldn't restart `since` (the escalation must measure the whole degrade). Correct for `since` — and it accidentally froze `cause` too, which is the field that decides whether the copy is allowed to blame the platform. Both directions broke: `unknown` never upgraded when the server later returned a definitive `outage` verdict, and `outage` never downgraded once the platform recovered but the tablet lost its own AP — so a board kept asserting "we can't reach the ordering system" on no current evidence, **the exact bug the layer was written to remove**. The pre-merge review confirmed both directions independently (two HIGH verdicts pointing opposite ways at one line), which is itself the tell: when reviewers disagree about which way a bug points, the state machine is probably wrong in both. Fix = an explicit fold (`nextDegraded(prev, cause, now)`) that keeps `prev.since`, always adopts the newest `cause`, and returns `prev` unchanged when nothing moved (no wasted render). Two general rules: (a) `x ?? fresh` is a _whole-object_ decision — if the object mixes "sticky" and "latest-wins" fields, write the merge by hand; (b) a comment claiming behavior ("a later server-verdict outage upgrades it") is not behavior — this one shipped next to code that did the opposite, so treat prose-in-code as a claim to verify, not evidence.
- **Wiring a recovery into a NEW surface re-scopes its blast radius — re-ask whether its trigger is still safe there.** Sharing `tryChunkReload` with the /staff boundary fixed a real shadowing bug, but `CHUNK_RE` matches `Failed to fetch dynamically imported module`, which an ordinary network drop produces as readily as a stale deploy. On diner pages a spurious `window.location.reload()` is a blink; on the always-on KDS/expo tablets it destroys the very board the slice existed to preserve, and if the network is still down the reload lands on the browser's own error page instead of ours. Guard = `navigator.onLine === false` vetoes the reload (a genuine stale-deploy miss happens while ONLINE; `onLine === true` isn't proof of reachability, but the existing sessionStorage cooldown bounds a wrong guess to one reload). General rule: when you lift a behavior into a shared module, audit each NEW call site against its trigger's false-positive mode — the behavior didn't change, the cost of being wrong did.
- **Converting a silent failure into a throw RE-ROUTES it into every caller — and a bare `Error` lands outside whatever failure vocabulary each caller already speaks.** W10c made `getCartTotals` throw on an unreadable cart (M30), which was correct and immediately broke four callers in four different ways, none of them caught by types, lint, or CI: `settleCash` is a Server Action awaited with no try/catch, so the rejection skipped `setBusy(false)` and latched the staff cash button on "Settling…" mid-collection; `getTableDetail` is exhaustively hardened to _return_ `{kind:"outage"}` and the throw sailed past it into the Next error boundary, destroying the in-place outage shell W10b built; `getCartView` threw a bare `Error` while `/cart` discriminates on `AuthzError.code === "unavailable"`, so a PARTIAL degradation printed "This order isn't available on this device" — verbatim the copy W10a exists to delete — over an intact order; and `openSettlement` called it AFTER `acquireSettlement` had written `settle_at` and BEFORE all three of its `releaseSettlement` calls, stranding the whole table frozen for the 10-minute TTL. Fix pattern: when you make a swallowed failure loud, grep every call site and ask (a) does this caller catch at all, (b) does it already have a discriminated outage return this should use instead, and (c) has it taken a lock/freeze the throw would skip releasing. Throw the DOMAIN error (`AuthzError(…, 503, "unavailable")`), never a bare one, or the receiving surface can't recognise it.
- **A webhook status predicate that blocks a stale redelivery can erase a REAL transition, and widening it can revive a dead one — decide from the PROVIDER's current state, never from event ordering.** `onShareFailed`/`onShareAuthorized` were wrong three times in a row across three review rounds. (1) Unguarded: a 72h-late `payment_failed` downgraded a share that had since been authorized and CAPTURED → money taken, order unfulfillable, plus a double-collect route via `create-share-intent`'s claim predicate. (2) Scoped to `pending|failed`: made `authorized → failed` unrepresentable — but an issuer declining the CAPTURE fires `payment_failed` while the row still reads `authorized`, and that mark is what short-circuits `captureAllIfReady` and lets the payer re-pay; without it the table dead-ends. (3) Widening `onShareAuthorized` to accept `failed`: a redelivery of the ORIGINAL authorization event revived a share whose PI was now dead, the all-authorized gate passed again, and every OTHER payer was really captured — converting "nobody charged, clean abort" into "N−1 charged, permanent dead end." The only stable formulation is to `retrieve()` the PaymentIntent and act on what is true NOW (the same confirm-before-writing discipline `captureAllIfReady` already used after its capture), phrased as an ALLOW-list so a status Stripe adds later defaults to "leave the row alone and log", never to a destructive write. Two corollaries: **postgrest returns `{ error: null }` for a 0-row UPDATE**, so a predicate that matches nothing is indistinguishable from success — chain `.select()` and check the count, or an affirmative decision that wrote nothing 200-ACKs forever; and classify the provider error (`resource_missing` is permanent and must not 500 for 72h) rather than treating every Stripe failure as retryable.
- **A mock that answers the same regardless of the query pins NOTHING — assert the QUERY (predicate + read-back), not the answer you chose.** The test file added specifically to close the "a guard was written and never made to fail" class contained two instances of it, both found by review, not by me. (a) `.select()`: the mock resolved the same rows with or without it, so deleting `.select()` from the module under test survived — while real postgrest returns `data: null` for `return=minimal`, which would have degraded the 0-row check to constant noise, silently. (b) The IDENTITY predicate: `.eq("stripe_payment_intent_id", piId)` was RECORDED by the mock from the first version and asserted nowhere — removing it from both marks yields an implementation that rewrites **every share row in the database, across every cart and every table**, on each webhook event, and the suite stayed 16/16 green. Rules: model the driver's real contract (not a convenient uniform resolve), assert the scoping predicate explicitly on every mutation, and when a code comment says a clause "MUST" be there, that sentence is a TODO for a mutant — `verify:slice` can't reach I/O modules, so the suite is the only guard.
- **A child component cannot tell whose state change caused its re-render — if it needs to know, the parent must say so.** Restoring focus after a failed reward action needs to survive the branch swap that `onChanged()`'s re-read may cause, and two schemes failed in opposite directions: a COMMIT BUDGET can't distinguish "my re-read landed" from "a peer changed the shared cart" (both are just an `applied` flip), so it left a unit armed for the first peer flip to steal focus with — the exact invariant the existing `acted` guard protects; and tying the claim to the re-read's PROMISE disarms in a microtask while React flushes the swap _after_ it, i.e. disarmed precisely at the commit the re-home is needed. Settled on the claim being consumed by the first idle commit (never wrong in the focus-stealing direction) with the narrow residual documented as OPEN-ITEMS M41; the real fix is a monotonic `changeSeq` prop so the child can compare. Related: `react-hooks/purity` rejects `Date.now()` in a component body even with no React Compiler configured — the modern `eslint-plugin-react-hooks` ships those rules regardless.
- **A fix layer is HIGHER risk than the original build, not lower — delta-scope every re-review to the newest commit and treat "the reviewer asked for X, I did X" as the start of verification.** W10c took FIVE adversarial rounds, all BLOCK, and in all five the HIGH findings were in the newest fix layer rather than the original slice — three of them regressions introduced while fixing the previous round's finding, one of them (§2 above) a degenerate fixture committed inside the fix for degenerate fixtures. The mechanism is structural: a fix is written against a narrow finding, under momentum, without the whole state machine back in view — so it optimises one edge and moves the failure to the adjacent one. Practical consequences now baked in: point each review at `git show <newest-sha>` first and the full diff only as context; after applying review fixes, re-run the RED-FIRST drill on the new guard (both regressions here were re-applied and watched go red before being trusted); and when two reviewers disagree about which direction a bug points, treat that as evidence the state machine is wrong in both. The slice's mechanical gate grew 20 → 29 mutants and `split-settle.ts` went from zero executable coverage to 17 tests — nearly all of it produced by these rounds, which is the argument for buying the coverage BEFORE the review rounds rather than after.
- **Review rounds are capped at ONE per PR (owner directive, W10d) — mechanical gates first, hand-triage a stalled pass, never review-the-review with agents.** W10d ran three adversarial rounds (~7M subagent tokens, 60-90 min each) for nine HIGH; two of the nine reduced to "a changed money file isn't in MUTANTS" — a grep, now `scripts/check-money-coverage.mjs` running as `verify:slice`'s first step (~1s, proven red-first against the exact state that cost the rounds), and the doc-fidelity lens is now `pnpm check:docs` (GFM header/delimiter parity — prettier INTRODUCES those breaks, so format:check can never see them — plus counts measured via `vitest list`, never transcribed). When round 3 stalled, killing it and hand-triaging the 17 unverified findings in its journal found the 3 real ones in minutes — the verify-each-finding agent panels were the expensive part, and a human read of a partial pass replaces them. Cap: ≤3 lenses, ≤10 agents, ~15 min, delta-scoped; after fixes, mechanical gates + a hand-read of the fix diff only.
- **When a discipline is added to one arm of a symmetric pair, its sibling arm now contains a KNOWN bug — grep for the twin before the review does.** Every round-2 and round-3 W10d finding was one shape: the `captured`/`unknown` classification added to `abortSettlement` was missing from `openSettlement` (round 2), then present in openSettlement's FIRST release pass but not its SECOND (round 3), then the route's re-read handled the pointer but not the read-ERROR case (round 3). Also the asymmetry that is CORRECT and must not be "fixed": abort logs-and-proceeds on an unestablishable hold because it is the table's EXIT (refusing strands the table); a re-open fails closed because it is optional (proceeding deletes the only record of the hold). Same signal, opposite correct answers — the difference is whether the caller has an alternative.
- **Hand-editing `database.types.ts` must mimic the GENERATOR's formatting, not just its content — short function entries (single-key `Args` + scalar `Returns`) collapse to ONE line (`mms_fulfill_split_order: { Args: { p_cart_id: string }; Returns: string }`), and the byte-exact `types-fresh` drift check fails on semantically-identical multi-line formatting.** W11: the fn signature change (dropping `p_expected_total_cents`) was hand-edited in the surrounding entries' multi-line style; CI's real-stack `gen types` emitted the collapsed form and the diff failed the job. The file is prettier-ignored (generated — not ours to reformat), so nothing local ever normalizes it: the generator IS the formatter. When no local stack exists to regenerate, copy the exact emitted shape from a prior generator output (grep the file for another one-arg fn) — or read the collapsed form straight from the failed CI job's diff, which prints it.

## #48 — perl -pi with `\x{…}` escapes DOUBLE-ENCODES a UTF-8 file (W14, 2026-08-14)

A `perl -0pi` substitution whose replacement contained `\x{101e}`-style wide-char escapes upgraded
perl's internal string and re-encoded the WHOLE file's existing multi-byte bytes (em-dashes,
middle dots, Burmese, emoji) as Latin-1→UTF-8 mojibake — 21 corrupted sequences in
OrderHistory.tsx, only visible as `Â·`/`â` noise in later diffs. Recovery: `git checkout` the
tracked file + reapply edits (untracked files can't be restored — the same session earlier
"reverted" two new files with `git checkout` no-ops and had to hand-restore). Rules: (1) never
put non-ASCII or `\x{…}` in perl one-liners against UTF-8 sources — use the Edit tool or a
python3 heredoc with explicit `encoding="utf-8"`; (2) after ANY scripted rewrite of a file with
multi-byte content, `grep -c "â"` it before moving on.

- **`mcp__github__enable_pr_auto_merge` IGNORES its `merge_method` param — it enables plain MERGE.**
  PR #174 (W16a) requested SQUASH twice and the webhook confirmed `merge_method:"merge"` both
  times; the PR landed as a merge commit, breaking the repo's until-then clean squash-only main
  (#168–#173 were all squashes). The tool's success text ("method: MERGE") is the tell, not a
  display bug. Rule: for a squash landing, do NOT use the MCP auto-merge tool — wait for CI green
  and call `mcp__github__merge_pull_request` with `merge_method: "squash"` directly (or ask the
  owner to enable auto-merge from the UI). A merge commit on main is not worth a history rewrite —
  note it and move on.

## #49 — A sentence written for the TYPICAL instance of a state, applied to the whole state (W23d, 2026-08-19)

W23d exists to remove one false claim from `/track`: the give-up card told a diner whose hold had
been **cancelled** that their payment went through. Three review passes then found **twelve** real
defects in the first commit, and **eight were the same mistake** — copy asserting more than the code
had observed. Inside the slice built to remove exactly that.

Every one had the identical shape: a string written for the _common_ member of a state, then wired
to the state itself.

| Reason code     | Written for                   | Also fires when                                                                                                                           | The lie                                                                                                                     |
| --------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `cart_not_open` | a cart settled at the counter | staff `clearTable` cancelled it (routine, once the 5-min pay lock goes stale — Stripe's 5-min and 35-min backoff steps cross that window) | "it went through another way" → go ask about money nobody took                                                              |
| `superseded`    | a diner re-checking out       | the lock was released, or another payer took over and abandoned it                                                                        | "we kept the newer payment" → an order that may never have been placed                                                      |
| `nothing_left`  | every dish sold out           | a promo/reward clamped to the remaining subtotal zeroed the total, dishes still on it                                                     | "everything sold out" — and **twice**: the first fix gated on `dropped.count > 0`, which still lies when SOME lines dropped |

The tell is grammatical. **A reason code names a CAUSE the code observed; the copy kept naming a
CONSEQUENCE the code inferred.** `-1` observes "the cart is not open" and infers "so it was paid".
`-2` observes "the lock moved" and infers "so someone else paid". `<= 0` observes "the total is
zero" and infers "so the basket is empty".

The rule that falls out, and it is checkable by reading alone: **for each branch, write down what
the predicate literally tested, then delete every clause the copy adds beyond it.** If what remains
is too thin to be useful, the fix is a NEW predicate that observes the missing fact — not a
confident sentence over the old one. `nothing_left` ended up with no shortage claim at all, because
the snapshot carries only what was REMOVED and never how many lines the order started with, so
"everything" is unverifiable in every branch. The shortage is still told — by the dropped list's own
count heading, which states exactly what is known.

Two others from the same slice:

- **`verify:slice` restores its own snapshot over anything you edit while it runs.** It refuses to
  START on a dirty target file, but nothing stops you editing during the several minutes it runs —
  and the restore silently reverted a helper two files depended on, leaving a broken build with a
  clean `git status` for one module and a dirty one for the other. Never edit `apps/qr/lib/**` while
  it is running; wait for the notification.
- **A guard fed by a fixture proves the fixture.** The W23d SQL test asserted the per-attempt stamp
  from a hand-written `INSERT`, so `mms_settle_precheck_and_void` — the ONLY production writer of
  that column — was exercised by nothing in the repo. Deleting the column from its `INSERT` would
  have passed the vitest suites (they mock the DB), the drift guard (it compares schema to types)
  and the test itself. If a test asserts what a function writes, the test must CALL the function.

## #50 — Two confident reviewers, one wrong. Averaging them ships the bug. (W22e, 2026-08-20)

The W22e adversarial round ran two lenses over the same diff, and they **contradicted each other on
two verifiable facts**:

| Claim                                           | Lens A                                  | Lens B                                   | Truth (settled with `grep`, in seconds)                                                                                                    |
| ----------------------------------------------- | --------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `--r-md` exists in `tokens.css`                 | "exists nowhere"                        | "all tokens exist, clean"                | **Does not exist.** The scale is `--r-sm/-card/-sheet/-full`, so `border-radius: var(--r-md)` computed to `0` and the card shipped SQUARE. |
| `.order(…, referencedTable)` reaches the parent | "no-op — the cap truncates arbitrarily" | "correct, because the embed is `!inner`" | **Lens B.** postgrest applies it to the parent when the join is `!inner`.                                                                  |

Both cited file:line. Both sounded certain. **Believing either one wholesale, or splitting the
difference, gets one of them wrong in each direction** — a square card, or a working query ordering
deleted for a reason that was never true.

The rule this repo already applies to its own code applies to reviewers: **a guard that cannot fail
is decorative, and a reviewer you have not checked is a guard that cannot fail.** Verify the
load-bearing claim yourself before acting on it. It cost seconds each time here; it would have cost a
shipped defect either way.

Corollary, from the same round: an agent can be right about the DEFECT and wrong about the
MECHANISM. The first commit's comparator post-mortem claimed a non-zero return for equal entries
"falls through to Map insertion order". Measured on this V8: returning `0` **preserves** insertion
order (ES2019 stable sort) and returning `-1` **reverses** it. The defect was real; the explanation
was inverted — and it had already been promoted into `docs/DESIGN-LANGUAGE.md` as normative doctrine,
where the next reader would have cited it. **Measure the mechanism before you write it down as a
rule.**

Two more from the same slice, both about claims rather than code:

- **Count the unit the CLAIM is about.** "Your usual" is about visits, so it counts distinct DAYS —
  not rows (three of something in one sitting), not orders (this app mints a fresh cart after every
  payment, so a second round is a second order an hour later), and not UTC days (an 8pm dinner in
  Covina is already tomorrow in UTC, which splits one evening in two). The first version counted
  orders and would have crowned a dish after a single evening — the exact claim `ArrivalBeat`, one
  component above it, is careful to avoid: _"two orders in one sitting are two orders."_ **When a
  neighbouring surface has already solved your honesty problem, read it before inventing an answer.**
- **Attribution you do not have is not attribution you may assume — this is now the THIRD time.**
  `earned_by` is who PAID, and `qr_order_items` carries no seat, so a dine-in host covering a table
  owns every guest's dish in the data. Same shape as `qr_orders.settled_by` being null for a
  guest-paid share (`/staff/tips` reports a shared bucket rather than inventing a split) and as
  W23d's reason codes (a cause observed, never a consequence inferred). The answer is the same every
  time: **narrow to the history that IS attributable and say so, rather than averaging over the part
  that is not.** Here that meant counting to-go and pickup only — which costs the archetype (a solo
  dine-in regular is exactly who the card is for) and is still correct.

## #51 — A multi-case `plpgsql` ASSERT file can only ever prove its FIRST case (M100, 2026-08-21)

`ASSERT` aborts the whole `do $$` block on the first failure and `ON_ERROR_STOP=1` aborts the file.
So the red-first ritual on an eight-case SQL test — run it before the migration, watch it go red, run
it after, watch it go green — proves **case 1**. Cases 2 through 8 were never executed in the red
run, so nothing has established that any of them is capable of failing. Offering that as "the guard
is proven" is a claim about one case dressed as a claim about eight, which is the same shape as the
green test file this repo already has a mutation battery for.

The fix is the M102 pattern at a smaller scale: `scripts/verify-mode-authority.mjs` mutates the LIVE
function and requires **the case that names the rule** to be the one that reddens. "It went red" is
not enough — two mutants both credited to case 1 means one of them is testing nothing, and that is
exactly what happened: a guard mutation intended for case 4 was caught by case 1 instead, because the
in-write copy of the predicate degraded the verdict to `stale` before case 4 was ever reached. The
mutant was rewritten to be ADDITIVE (leave the real guard, add the over-tightening beside it) so it
lands on the case it claims.

Three more rules the same battery earned, each from a defect in its own first draft:

- **A guard that heals what the next check looks for is decorative.** The startup assertion — "this
  migration must still be the LAST definition of these functions, or `restore()` silently reverts to
  dead code" — hashed and restored one function at a time. `restore()` re-applies the whole migration,
  so the first iteration repaired the drift the second was hunting. Stubbing out `mms_fire_line` and
  re-running produced a clean pass. Hash every target BEFORE the first restore.
- **A survivor asserted as a survivor is a measurement; a survivor left unlisted is a hole.** The
  mode term inside the UPDATE cannot diverge from its pre-check while `table_sessions.mode` is
  immutable, and the migration header says so. That claim is checked in the same direction as every
  other mutant — expected to survive, and a KILL means the header has become false. Pair it with the
  complement (delete the pre-check, keep the term) to show the term still earns its place.
- **`pg_get_functiondef` has no trailing semicolon.** Piping it back to `psql` leaves an unterminated
  statement and relies on the client flushing its query buffer at EOF. It does. A battery whose
  RESTORE path rests on that is the thing it exists to prevent.

And the finding that started it, worth its own line: **a client render gate is advisory, and the
value it gates on must be re-derived in the write.** `Checkout.tsx` hid the For-here/To-go pills and
"Make it now" behind `isDineIn &&`; a Server Action is a public POST. Both RPCs behind those controls
had gone their whole lives without reading `table_sessions.mode`, while three sibling fire RPCs had
been joining that table inside their write since S4.2. When a rule exists correctly somewhere in the
schema, the question is not whether it is right — it is which call sites never adopted it.

## #52 — A contract tested through ONE caller says nothing about another (W-staff-auth, 2026-08-21)

`authorizeDevice` was written to accept an empty device token, because a kiosk or board signed in by
a staff account carries none — that is the entire point of the second credential. `device-auth.test.ts`
proved it, red-first, and the whole gate is correct.

The kiosk still could not open an order. `kioskOpenInput.k` was `z.string().min(1)`, and the parse
runs **before** the gate, so an iPad on the documented `/staff/login?next=/kiosk` flow answered
`reason:"error"` — "Something went wrong, please order at the counter" — on every tap, forever. The
feature, not an edge of it.

It hid because the tokenless case was proved against **board**, whose route calls `authorizeDevice`
directly with **no schema in front of it**. Two Codex rounds and my own review missed it; the
adversarial pass found it by walking the journey end to end instead of reading the module.

The rule: when a shared contract gains a new accepted input, enumerate **every** caller and check what
sits between the caller and the contract — a Zod schema, a route guard, a client-side early return. A
green test on the contract is evidence about the contract, not about the paths that reach it. This is
the same shape as the four round-1 P1s in the same PR, all of which were client consumers of server
contracts that had been changed without their callers being opened, so treat it as the dominant
failure mode of any "add a second credential / second mode" change.

## #53 — `body?.reason !== "unavailable"` inverts fail-safe on a null body (W-staff-auth, 2026-08-21)

The board's poll distinguishes a verdict about the DEVICE (401, `not_configured`) from the platform
being unreachable (`unavailable`), because telling a running TV it is de-authorized during a blip is
the W10b/M32 outage. The check was written:

```ts
const body = (await res.json().catch(() => null)) as { reason?: string } | null;
if (body?.reason !== "unavailable") {
  setState({ kind: "unlinked" });
  return;
}
```

Not every 401/503 comes from our route. A platform-level 503 — Vercel throttle, paused deployment,
any upstream gateway — answers with an HTML error page, so `res.json()` rejects and `body` is `null`.
Then `null?.reason` is `undefined`, and `undefined !== "unavailable"` is **TRUE**. The least
informative response we can possibly receive took the most authoritative branch: a live board was
destroyed mid-service and the house was told the screen had never been linked.

Optional chaining plus a negated equality is the trap — it reads as "unless it says unavailable" but
means "unless it definitely says unavailable, including when it says nothing at all".

**But testing the positive is not the fix either, and getting that wrong twice is the real lesson.**
The first correction was `if (body && body.reason !== "unavailable")`, which still treats every
parseable body except that one as an authoritative de-authorization. Codex caught it on the very PR
that was documenting the original bug: an upstream 503 emitting `{ error: "Service unavailable" }`
parses fine, carries no `reason`, and blanks the board exactly as before — and so would any transient
reason the API gains later, which is the shape MOST likely to be new.

A blacklist is the wrong polarity for a safety decision. **Whitelist the refusals you actually know —
as (status, reason) PAIRS.** `/api/board` emits exactly two, `(401, "denied")` and
`(503, "not_configured")`, so those two pairs are what "did this come from our route?" means.
Everything else — unparseable, unrecognised, a known reason on the wrong status, or new — is "we
can't tell", which keeps the board up. The failure mode of an unknown answer must be the safe one.

⚠️ The PAIR, not either field. This paragraph twice prescribed something looser, in a doc whose whole
purpose is to stop this bug. "A 401 is a verdict whatever its body" was one draft — and that is
exactly the unconditional-401 the table below shows an upstream HTML 401 walking straight through.
Checking status and reason INDEPENDENTLY was the next, and it accepts `(503,"denied")` and
`(401,"not_configured")`, combinations the route never sends.

The general form: when a predicate decides whether to take something away from a user, enumerate the
cases that JUSTIFY the removal, never the cases that excuse it.

**And fix every branch, not the one you were shown.** The correction above whitelisted the 503 and
left the 401 unconditional, so the next round found the identical hole on the other status — an
upstream 401 (Vercel's deployment protection answers one with HTML on a protected preview) still
unlinked a live board. FOUR rounds landed on this one predicate and each found the previous fix
insufficient in the SAME direction, too eager to treat an unrecognised answer as authoritative:

| round            | the rule                                         | what still slipped through                 |
| ---------------- | ------------------------------------------------ | ------------------------------------------ |
| adversarial pass | blacklist `unavailable`                          | a body that will not parse                 |
| Codex 1          | whitelist the 503                                | a parseable-but-unknown 503 body           |
| Codex 2          | whitelist the 503, trust the 401                 | any upstream 401                           |
| Codex 3          | either known reason, either status               | `(503,"denied")`, `(401,"not_configured")` |
| final            | the exact (status, reason) pairs the route sends | —                                          |

The fix that finally held was not a better heuristic but a better contract: `/api/board` names a
`reason` on every refusal it issues, so "is this OUR refusal?" stops being a guess about status codes
and body shapes. When you catch yourself sniffing a response to work out who sent it, add the marker
at the source instead.

A further round then caught THIS ENTRY still prescribing an earlier version — a normative doc teaching
a fix its own table refutes. Which is the last lesson: when you write down the rule a fix taught you,
write down the fix you SHIPPED, not the one you had in mind when you started typing.

## #54 — Decision logic in a component this repo cannot test is unguardable, outside money too (W-staff-auth, 2026-08-21)

`apps/qr` runs vitest with `environment: "node"` and `include: ["**/*.test.ts"]`, and no DOM test
environment is configured. That is a missing SETUP, not an impossibility — `include` restricts test
filenames, not what they import, and `emails/palette.test.ts` already renders components from a
`.test.ts` via `createElement`; the config comment even says "add jsdom + @vitejs/plugin-react here
when the first React component test lands." (The first draft of this entry said components "cannot"
be tested. Codex refuted it on the PR that added it, correctly: a categorical false premise in a
rules doc steers the next person away from standing up the environment, which is the actual fix.)

What is true is enough: nobody stands up a test harness in the middle of a fix, so a rule written
inside a component stays unguarded in practice. `ReadyBoard.tsx` held **three** live defects simultaneously
— #53's bodyless verdict, a board that booted into an outage and said "Connecting…" forever above a
column promising "Ready orders light up here", and a hardcoded "open the board with its device link"
rendered to installs that have no device link — with the entire suite green and `verify:slice` clean.

The W17 rule ("decision logic belongs in `lib/`, not a component") was written about money paths and
`Checkout.tsx`. It is not a money rule. Any component holding a rule about **what is true** — an
authorization verdict, an outage state, what a screen is allowed to assert — is equally unguardable,
and the failure is quieter because no number is wrong. Moving the two decisions to `lib/board-poll.ts`
turned each defect into one assertion and let two mutants pin them.

Heuristic: if you can phrase the code as a sentence with "must" or "never" in it, it belongs in a
module, whatever layer it currently lives in.

## #55 — A reviewer that shares your context confirms your frame (review protocol, 2026-08-22)

Across #221–#223 the Codex rounds consistently out-performed the in-session adversarial pass on the
same diffs. That is not a model-quality result. Codex's structural advantage is that it never hears
the author's argument.

The decisive case: a Stripe rotation plan asserted "`mms_fulfill_order` is idempotent on the PI id, so
no double-fulfillment." True — and it answers the wrong question. It covers `payment_intent.succeeded`
and says nothing about `payment_intent.payment_failed`, whose single-pay branch performs UNSCOPED
`releaseCartLock(cartId, null)` + `releaseSettlement(cartId)`. The handler is deliberately wrapped so
it always returns 200 **because its own comment says those releases must never be redelivered**; an
un-rotated second endpoint answers 400, and a non-2xx is precisely the retry the 200 exists to
prevent. Every in-context reviewer accepted the idempotency frame, because the frame arrived with the
diff. A blind reader asked "safe against _what_?" and had it in one pass.

So the isolation is the mechanism, and "don't pass the conversational history" is not enforceable as a
rule — the author IS the history, and summarising the change in your own words leaks the frame in the
first sentence. `scripts/review-bundle.mjs` makes it structural: raw diff, full text of changed files, heuristic
blast radius and a prompt with no narrative, handed over as the reviewer's entire world.
`.claude/agents/adversarial-auditor.md` supplies the stance (zero agreeableness, defect-biased,
CRITICAL forces REJECT).

The counterweight, learned the same week: an aggressive prior manufactures confident fiction. Two of
the three Codex rounds on #223 reached correct conclusions through mechanisms that do not exist (a
`%2B`-to-space corruption that never happens; an "infinite redirect loop" that terminates in three
hops). Conclusions right, reasoning invented — and the reasoning is what the next reader trusts and
propagates. Hence the four-part evidence standard: `file:line` + exact trigger + observable
consequence + **a disproof condition**. If you cannot say what would make the finding wrong, you have
a suspicion, not a defect. And per #50, verify each finding against source before acting: two
confident reviewers, one wrong, averaged, still ships the bug.

---

## #56 — A second read of a fact you already hold fails in whichever direction the call site defaults (M108 · M113, 2026-08-23)

`table_sessions.mode` has eleven readers. `assertCartMember` reads it to prove the session is active
and throws 503 when the read fails — correct. Three callers then read it AGAIN, and every one of them
discarded the `{ error }`:

- `addItem` and `reorderOrder`: `sess?.mode === "dinein"` → `false` on a failed read → a dine-in
  table's line tagged `togo` at the to-go tax. Under-collection.
- `api/board/route.ts`: `modeBySession.get(id) !== "dinein"` → `true` on a failed read → a dine-in
  diner's staff-entered call-out name published to a public TV. Over-exposure.

Same column, same swallow, opposite harms — because the harm is not chosen by the bug, it is chosen
by whatever the surrounding expression treats as its default. That is the part worth carrying: you
cannot reason about a discarded error's blast radius from the read; you have to look at what the
value is compared against three lines down.

The fix at all three sites was the same, and it was not error handling. **Delete the read.** The
mode rides out on `CartAuthz` from the one read that already fails closed, and a round-trip leaves
every add. Handling the error at each site would have produced three correct answers to a question
nobody needed to ask twice — the "name it ONCE" rule (W17), applied to a READ rather than to a
computed amount.

**M113 exists only because the twin-audit was run.** M108's registry row named two files; nothing had
filed the board. After fixing the two named rows, every remaining read of that column was classified
rather than assumed, and the third defect was in the fourth one. When a defect is defined by a SHAPE
rather than by a location, grep the shape before closing the row — the row's author found the
instances they happened to be looking at.

**Two rounds got the board predicate wrong in the same direction, and the second one called itself
"positive".** `!== "dinein"` on an empty map publishes everything. The first fix,
`mode !== undefined && mode !== "dinein"`, closed only the absent-row half — it is still a
one-string blacklist, so the day `table_sessions.mode`'s CHECK gains a fourth value meaning table
service, every such order publishes a name with nobody having decided that. Writing "POSITIVE" in
the comment did not make it one. A genuinely positive rule names the set it admits
(`BOARD_MODES = {pickup, scango}`); everything else is a blacklist wearing a `!== undefined` guard.
Test for a value the allowlist has never heard of, not just for a missing row.

**And the sharpest one, from the blind pass on the fix itself: deleting a fail-open read MOVES the
decision, and it can move it out of the guards' sight.** The mode now originates in `authz.ts` — a
file with no test (every suite mocks it wholesale), no mutant, and no marker `check-money-coverage`
could see, because it names no money column. So `mode: sess.mode` → `mode: "pickup"` left 205
mutants, 981 tests and CI green while every dine-in add rang the to-go tax: the exact defect just
closed, reproduced one file upstream of where its new guards point. The three mutants pinned the
_consumers_ of the decision and none pinned its _producer_. **When a fix consolidates a rule into one
place, that place is the new money path** — check that the coverage guard can see it before calling
the fix done. (`CartAuthz` is now a MONEY_MARKER; `lib/authz.test.ts` executes the real function.)

**And the round after that, on the guards themselves: a mock looser than the database cannot express
the bug it is there to catch.** Three chains accepted any arguments — `eq: () => chain`,
`in: () => Promise.resolve(rows)` — so the assertions proved the SHAPE of each answer and nothing
about its PREDICATE. A session read filtered on the uid instead of `cart.session_id`, or a board read
asking for order ids instead of session ids, kept every case green: one hands a cart another table's
tax treatment, the other empties the wall display in a way that reads exactly like "nothing is ready".
The fix is to key the fixture rows and apply the filter, then fixture a SECOND row with the opposite
value so a wrong predicate resolves to the wrong answer rather than to null — null can be mistaken
for a missing fixture; a wrong mode cannot.

**A count floor is not a coverage floor.** The orphan guard's self-check required ten enumerated test
files, which `apps/qr` alone (87) clears — so a listing accidentally scoped to one subtree passed
while `packages/*`, `scripts/` and the repo root went unlooked-at, and the guard printed "clean". A
self-check has to assert the SHAPE of what was enumerated (every configured suite root represented),
not its size. Same lesson as the degenerate-fixture rule, applied to a guard's own inputs.

Scope note, so the next reader is not misled by "read ONCE": the consolidation is the DINER path.
`staffAddItem` derives the same fork from `staff-open-cart`'s own read, because staff authorize
through a different guard entirely — that read fails closed, so it is a second derivation, not a
second chance to fail.

Also, mechanically: prettier turns a line-leading `+` in a wrapped markdown sentence into a list item
and silently corrupts the prose. `pnpm format` did it to #55 in this very file. Don't start a
continuation line with `+`.

---

## #57 — Assert on the CHARGE, not on the column (M17, 2026-08-23)

`mms_set_line_fulfillment` coalesced an unresolvable tax category to `'hot_prepared'`. That reads as
a defensive default and is really a decision: hot food is taxable BOTH ways, so the "safe" fallback
silently answered the one question the function exists to ask, in the over-collecting direction.

I fixed it by refusing when the category would not resolve, measured `tax_cents` before and after on
a real Postgres, watched it stop changing, and shipped that as proof. **Both reviewers rejected it
and both were right.** `getCartTotals` reads `tax_cents` only as a BOOLEAN — a line joins the taxable
base when `taxCents > 0` — so the stored number is not the charge. Re-measured against the boolean,
with the catalog row pruned:

|                 | correct | before  | refusing |
| --------------- | ------- | ------- | -------- |
| dine-in → to-go | exempt  | TAXABLE | TAXABLE  |
| to-go → dine-in | TAXABLE | TAXABLE | exempt   |

Refusing changed **nothing** the guest pays in the direction the defect was filed for, additionally
stranded the order (a refused flip leaves the line `dinein`, so `mms_init_togo_status` never stamps
and the counter never sees a bag), and turned a case the old code got RIGHT into an under-collection.
Strictly worse than the code it replaced, with a green test file over it.

The lesson is not "measure" — I did measure. It is **measure the quantity the user experiences**. A
money assertion has to be written against the thing that reaches the bill; the column it is stored in
may be a flag, a snapshot, or an input to something else. Every assertion in the shipped SQL test is
now `tax_cents = 0` / `> 0`, never an integer comparison.

**And the fix for a fact you keep losing is to stop losing it.** No rule over `(fulfillment,
tax_cents)` recovers the category: the CDTFA rule (cold to-go exempt, hot to-go taxable, dine-in all
taxable, except groceries) leaves two of four transitions ambiguous — `grocery_food` is exempt in
BOTH directions, which falsified my own "three are derivable" header, caught independently by both
reviewers. `qr_cart_items` already snapshots `name`, `modifiers`, `unit_price_cents`; `tax_category`
was the one field left as a live lookup, which is precisely why a pruned catalog row could revoke it.
Snapshot it at insert — where the item is certain to exist, because the caller just priced off that
row — and the entire class disappears. **Before writing a rule to reconstruct a lost value, ask why
it is being lost.**

Mechanically: derive the category INSIDE the insert RPC from the id it already receives, rather than
adding a parameter every caller must thread. Signature unchanged ⇒ no deploy-order window, no caller
edits, and the value cannot drift from the catalog because it IS the catalog's, read once.

**Addendum, caught by CI:** the first push failed with
`duplicate key value violates unique constraint "schema_migrations_pkey"`. A migration's VERSION is
its filename's leading timestamp and `schema_migrations` is keyed on that alone, so two files sharing
a prefix collided — after CI had pulled images, started a stack and replayed all 92 migrations. The
fact was visible in `ls`; my `grep` had filtered out the very file I collided with.
`scripts/check-migration-versions.mjs` now asserts one version per file plus the
`<timestamp>_name.sql` shape the CLI matches, inside `verify:slice`. Its own first cut filtered on
`.endsWith(".sql")` before checking the shape — removing exactly the malformed names it existed to
catch — and my red-first probe missed that because the probe's filename ended in `.sql`. **A probe
that only exercises the half that works proves the half that works.**

Also: `RAISE`'s placeholder is a bare `%`; `format()`'s is `%s`. `raise notice 'cold %s'` prints
`cold 147s` and reads as correct forever.

## #58 — Two review rounds overturned two of my own load-bearing arguments (M22)

The defects were fine. **The claims I built on top of them were not**, and both survived my own
pre-PR sweep because I never re-asked "true against WHAT?" of a sentence I had written myself.

**"The trade is free" was false, and only the consumption predicate could say so.** M22 reorders the
discount clamp so the reward goes first. I justified it: the totals are algebraically identical, and a
promo's budget is a redemption COUNT, so it costs the same one redemption either way. The first half
is true and I proved it with a sweep. The second half I asserted. `mms_fulfill_order` gated
consumption on `p_discount_cents > 0` — the **combined** discount, which is not a fact about the promo
at all — so a reward covering the basket clamped the promo to 0 while keeping that sum positive, and
the code was consumed having delivered nothing. **An equivalence proved on one axis says nothing about
the axes you did not measure.** Before claiming a change is free, find the code that SPENDS the thing
you say is unaffected, and read its predicate.

**My own comment argued against my own gate.** The shortfall disclosure was gated on the APPLIED
reward amount. I had written, in the same file, that `rewardFaceCents` states what the attached coupon
is worth "even when none of it applied … the worst case". Both are true; the gate contradicted the
comment. A basket voided away under an attached coupon drops the applied amount to 0, so the warning
went silent AND the row keyed on the same value took the Remove control with it — at the exact moment
the whole coupon was at risk. **When a comment and a predicate disagree, the comment is usually the
one that thought it through.**

**Exclusion buckets default every future case to the strongest claim on the screen.**
`MenuBrowser`'s `unavailable` was "everything that isn't `needs_choices` or `grocery`", so M119's new
`unreadable` reason would have landed silently in _"isn't available today"_ — the fabricated diagnosis
it existed to prevent. Name what belongs in a bucket; never define it by what doesn't.

**Fixing one read does not fix the read your own fix newly REACHES.** M119 round 2's sharpest finding
was in the round-1 fix: `priceItem` used `.single()`, which reports a 0-row result as an ERROR, so
`if (error || !item)` answered `gone` for both "delisted" and "we could not reach the catalog". That
line pre-dated the PR and was unreachable while `reorderOrder` refused outright — the fallback made it
reachable. `.maybeSingle()` is the separator (`{data: null, error: null}` for a genuine no-row).
Three times in one PR the answer was already written next door: `lock.ts` three lines up,
`create-share-intent` 200 lines down, and the analytics lesson one property above where it belonged.

**Check a filed repro against the SHIPPED CONFIG before you size the item.** M22 was filed with
subtotal $10 / promo $6 / reward $9. Prod is `reward_base_cents` 500 against
`reward_min_redeem_cents` 5000: a $9 coupon does not exist and a $10 basket is refused at apply. The
numbers came from a unit fixture and had never met the live config, so the row overstated itself for
months. One `select` against prod is cheaper than an hour of building to a phantom.

**`verify:slice` is one run per checkout, and both failure modes lie.** A run STALLED for ~5 hours
with an empty output file — the process was alive, making no progress. Separately, two overlapping
runs rewrote each other's money modules and the second reported
`✗ These suites fail BEFORE any mutation: lib/order-lines-availability.test.ts`, which reads exactly
like a real defect and is not. On any stall or surprising pre-flight failure: kill ALL runs,
`git checkout -- .`, confirm the tree clean, then start exactly ONE. And never report a gate result
whose run you did not watch finish — a lost output file is not a pass.

**Adding a parameter to a Postgres function does not replace it.** Functions are keyed by argument
types, so `create or replace` with a new arg list creates an OVERLOAD and leaves the old body live.
Drop the old signature explicitly — which also drops its grants, so re-grant. Making the new arg LAST
and DEFAULTED, with the predicate coalescing to the old value, is what lets the migration land ahead
of the app deploy instead of in lockstep; assert that fallback in the SQL test, or nothing proves it.

**A generated file edited by hand is a guess, and the cheapest check for it is not the one CI runs.**
`packages/db/src/database.types.ts` is `pnpm db:types` output, and `db:types` needs a local Supabase
stack. A cloud session has no Docker, so a new RPC's entry gets typed by hand — and the first thing
that checks it is CI's `migrations-check + types-fresh`: six image pulls and 120 replayed migrations
to reject one misplaced line. M70 burned TWO of those cycles on plain alphabetical slips
(`mms_pin_promo_grant` filed after `mms_promo_attempt`; `mms_release_promo_grant` after
`mms_request_approval` — `pin` < `promo`, `rele` < `requ`).

The expensive part was not the minutes. **`types-fresh` runs BEFORE that job's SQL tests**
(`ci.yml:109` vs `:122`), so a sort slip tears down the stack with every `supabase/tests/*.sql`
assertion still unrun. Twice, M70's migration — the entire point of the PR — reported "checked" when
nothing about it had executed, and the red check named a types file, which reads like a bookkeeping
nit rather than _your SQL is still unverified_. When a fast step gates a slow proof, a failure in the
fast step is not a small failure; look at what it stopped from running.

`scripts/check-generated-types-sorted.mjs` decides all of it from the file alone in milliseconds: the
generator emits `Tables` keys, `Functions` keys and each `Args` key list in plain ASCII order (46 ·
70 · 64 blocks, all already sorted when the guard was written), and the error names the exact pair to
swap. It deliberately does NOT guard the entry's SHAPE — the generator breaks at ~80 columns, so
`mms_reward_discount` stays inline while the seven-character-longer `mms_release_promo_grant` does
not, and reimplementing that is prettier's job. Position is the half that is cheap and the half that
was actually wrong both times. Both "parsed zero keys" cases fail loudly, because a guard that looked
at nothing prints the same word as a guard that found nothing wrong.

**Before re-deriving a decision from raw columns, check whether the system already computed it.** My
round-1 fix to M70's cancel clear was right about the defect (a cart-scoped clear can wipe a live
successor's grant) and wrong about the instrument. I wrote the era test myself —
`locked_at is not distinct from p_attempt` — and CI turned case 8 red. Two reasons, and the column
declares the first one itself: `qr_settlement_cancellations.attempt` is _"forensics only, never read
by the diner path"_, and `markCanceled` nulls an unparseable one on purpose because _"losing the era
is survivable, losing the verdict is not."_ A predicate cannot make a deliberately-lossy field
load-bearing. The second is plainer: the cart lock has a TTL that auto-releases an abandoned pay
screen and nulls `locked_at`, so an ordinary cancel naming a real era stops matching and the grant
leaks — the exact hole the clear exists to close.

The era test was already computed one layer up. `mms_settle_precheck_and_void` returns -2 exactly
when `v_locked_at is distinct from p_attempt` (null attempt included), and the caller maps -2 to the
single reason `superseded`. So the answer was `p_reason <> 'superseded'`, which is also the rule the
LOCK already follows — `if (prior.reason !== "superseded") await releaseOurLock(…)` — because the
grant and the lock have the same owner. **The "name it ONCE" rule is not only about money values; it
covers decisions.** Two derivations of "does this attempt own the cart" drift exactly like two
derivations of a total.

**And a guard tightened until the VALID case fails is not safer — it moves the defect.** Both my
first two drafts were wrong in opposite directions (too loose: wipes a successor's grant; too tight:
leaks on every TTL-expired pay screen), and each was written while thinking only about the failure
mode in front of me. Cases 11 and 12 now pull against each other in the same file on purpose, so
neither direction can be "fixed" alone again. When a review asks you to tighten a bound, write the
test for what the tightened bound does to the legitimate case, in the same commit.

**Changing a signature or a return shape silently disarms every guard that quotes it.** Two in one
commit. `verify:slice` reported `lock/unreadable-status-reads-as-closed` **STALE** — its `find`
pattern matched 0× because returning the stamped era turned `return "unavailable"` into
`return { result: "unavailable", era: null }`. A stale mutant is not a skip: the M119(b) fail-closed
could then have been deleted with every gate in the repo green. And CI reported
`function public.mms_release_promo_grant(uuid) does not exist` — I widened the RPC to two arguments,
updated the three new SQL cases, and never swept the one that already existed. **After changing any
signature or shape, grep for its name across tests, mutants and docs before running anything** — the
compiler covers the TypeScript callers and nothing covers the rest.

That second failure is also the `drop function` earning its place. Had the one-arg signature been
left behind as an overload, case 10 would have gone on passing **against the cart-wide body the
change existed to remove** — green, and measuring the defect.

**And a mutant anchor that SPANS A DECLARATION BOUNDARY goes stale with no signature change at all
— the third time in one arc (#249 r3, #250, #251).** On #251 the anchor for
`written/an-unconfirmed-write-may-be-announced` was `return r.state === "applied";` plus the blank
line and the NEXT function's docblock opening, because the bare return alone was not unique. Then a
Codex round asked for a new `unconfirmedWriteNotice`, I inserted it between those two declarations,
and the anchor matched 0×. Nothing about `mayClaimLanding` changed; the guard disarmed because its
anchor described its NEIGHBOUR.

The fix is a rule about what an anchor may quote: **bind it to the subject's own declaration** —
signature line through closing brace — never to whatever text follows. Uniqueness is not the test to
optimise for; a unique anchor reaching into a neighbour is exactly as fragile as a non-unique one,
and worse because it looks deliberate. When a body alone is ambiguous, widen UPWARD into the
`export function …` line, which is stable and belongs to the subject, not downward into the next
thing someone will insert before.

Two mechanical habits follow, both cheap:

- After ANY insertion into a mutated module — not just an edit to the mutated function — re-measure
  every anchor in that file: `src.split(find).length - 1` must be exactly 1.
- `verify:slice` reports STALE as a FAILURE and it is the only thing that catches this. A run that
  ends `1 mutant(s) STALE` is red; treating it as "281 of 282 caught" is how a disarmed guard ships.

**A discriminated union whose member carries a multi-literal discriminant never narrows.**
`{ result: "acquired"; era: string } | { result: Exclude<LockResult, "acquired">; era: null }` looks
right and typechecks, but `===` on a member whose discriminant is itself a union cannot ELIMINATE
that member — so callers never narrow to the acquired branch and `era` stays nullable at every use.
The fix is one member per literal. Worth knowing because the failure is quiet: nothing errors, the
type just silently stops doing its job, and the natural next move is to paper over it with a
non-null assertion — which is exactly the guarantee the union was supposed to provide for free.

**Prefer returning a value you just wrote over reading it back.** `create-intent` re-`SELECT`ed
`locked_at` a few statements after `acquireCartLock` wrote it. Same "name it ONCE" rule as a money
value, and the same failure mode: the gap between the write and the read is precisely where a
competing acquisition lands, so the row can answer with somebody else's era.

## #59 M126 · Night, deepened — eight ways a visual change hides a defect nobody can see

Two independent reviewers (the blind in-session pass, and two Codex rounds) plus my own sweep found
fourteen real defects in one CSS-and-tokens milestone. Every one of them is invisible to `tsc`, to
`verify:slice`, and to the contrast audit — which is the point. These are the durable ones.

**A guard model that EXCLUDES a layer on a reasoned-but-unverified premise is worse than no guard,
because it reports passing.** The new composite guard's light-theme model skipped the far-plane
blobs and the warm pool "because both lighten, which helps dark text". Every one of those sources is
DARKER than light `--pg`: `--sf` Y 0.86380, `--warnb` 0.83472, `--gold` 0.45487, `--jade` 0.12344,
`--ruby` 0.12598 against 0.94668. So the model omitted precisely what darkens, reported 4.6056, and
the real worst pixel was 4.4738 with motion and 4.3585 under reduced motion — two live AA failures,
with light's `--pa-far-op` and all four `--pa-blob-*` asserted by nothing in either direction. The
rule: when a model DROPS an input, that exclusion is a claim and needs the same measurement as an
included one. Write down the direction each layer moves the number, and check it.

**A multi-factor bound needs a multi-factor mutation.** Reverting any ONE of the five refitted light
values leaves the suite green; only the original combination breaches. Five surviving single-token
mutants look exactly like a degenerate fixture and are not one here — so the red-first mutation
restores all five at once, and the fact is stated rather than glossed, because the next reader will
otherwise try one at a time and conclude the guard is fake.

**An inline `style` fill outranks a class, so a token change aimed at a class can reach nothing.**
`--sunken` — "the recessed tone Night has never had" — never rendered on a single input: all three
`.checkout-promo-input` sites set `background: "var(--cd)"` inline and `.account-field` rides a
shared inline style. The class already carried a comment explaining that the BORDER lives there so
`:focus-visible` can recolor it; the background needed the same reasoning and nobody applied it.
**After changing a class-level paint, grep the call sites for an inline `background`/`color`.**

**An escape hatch with no writer is a claim, not a mechanism.** The `--fx-*` dial is the entire
justification for lifting a GPU budget that exists because of a production iOS OOM — and nothing in
the repo set `data-fx`. It was reachable only from a devtools console. If a mitigation is load-
bearing in an argument, ship the thing that operates it, and say plainly what it does NOT do (core
count is a poor proxy for a per-tab memory ceiling — a recent iPhone reports 6–8 cores with a tight
WebKit budget, so tier `high` is not evidence the maximal composition is safe).

**`blur(0px)` still allocates a backdrop buffer; `none` allocates nothing.** So a dial must re-point
a whole function list, never scale a radius toward zero. Corollary that cost a round: taking the
FILTER off a translucent pane is not the same as making it opaque — `data-fx="off"` and
`prefers-reduced-transparency` both left the chrome at 90% with crisp content behind it, and the
`@supports not (backdrop-filter)` fallback cannot rescue that, because the browser supports
backdrop-filter fine; the DIAL turned it off. A user who asks the OS for less transparency getting
more of it than the default user is an inverted accommodation.

**One token serving both themes will eventually paint a surface one theme has already ruled out.**
`--glass-chrome` tinted Night's chrome with `--sf` (rung 3, so chrome sits below cards) and dragged
light's header off `--pg` onto the same rung — putting bare `--ac` at 4.2843:1, the exact pair the
audit carries as a NEGATIVE guard (`plain ac on sf`, asserted UNDER 4.5) to force call sites onto
`--ac-strong`. The measurement in my own comment ("opaque restores 5.5546 / 4.6729") had been taken
against `--pg`, the surface the code no longer painted. Fix shape: name the per-theme concept
(`--glass-chrome-opaque`) and let every fallback read it, so it cannot drift from the pane it
replaces.

**`aria-pressed` plus a changing accessible name inverts the announcement.** The ambient's pause
control read "Play the background motion, **pressed**" once paused — a pressed "Play" states that
motion is playing, on the one control WCAG 2.2.2 requires to be comprehensible. Pick one mechanism:
a stable name plus the state attribute, or a name that changes with the action. Play/pause is the
canonical case for the latter.

**Two overlays that feel mutually exclusive may share a page — check the render sites, not your
intuition.** `.tier-up` and `.merge-beat` are both `position: fixed; inset: 0`, and both are
rendered by `app/account/page.tsx` (`MergeRedeemer` at :48, `RewardsHub` → `TierUpCelebration` at
:138) — with MergeRedeemer's own comment saying it refreshes the hub so merged Stars appear, i.e.
the path that awards a tier. Two full-viewport backdrop-filters is ~29 MB of backing store (one is
14.4 MB at 430×932 DPR3: 430*932*9\*4). `fullscreen-blur-contract.test.ts` caps it at one.

**`forced-colors: active` forces background-COLOR — not background-IMAGE, and not `filter`.** Every
gradient, groove, grain tile and `drop-shadow()` bloom this milestone adds would have survived and
painted over a palette the user asked the OS to control. Decorative layers should DISAPPEAR there,
not be re-tinted.

**A composite guard that does not round to 8 bits reads ~0.03 TIGHTER than hand arithmetic on hex.**
Neither is wrong (the framebuffer rounds; the guard doesn't), but they disagree, so name which one
is authoritative and make every comment quote that one. Writing the guard moved a shipped value:
light's grain passed at 4.5776 by hand and was inside the methods' own disagreement.

**Finally, three of the fourteen were comments that outlived their code** — a header carrying "NO
backdrop-filter — mobile GPU budget" three thousand lines above the rule that frosts it, two
pointers to `ambient-contrast.test.ts` (a file that does not exist), and a bevel figure that did not
reproduce. A milestone that spends a commit fixing that class will introduce more of it than it
thinks; grep your own diff for the claims it makes.

## #60 — Thirteen findings, eleven in the guards: a check that matches a NAME is not a guard (#241 · #242, 2026-08-29)

One session wrote roughly a dozen guards — the promo-pin ordering check, the fx-boot script test,
the composite-contrast band extraction, the codex-review gate, two CI orphan sweeps — and Codex
found **eleven real defects in them across four rounds, against zero in the product code the same
PRs changed**. Every one reduced to the same move: the guard verified a _name, substring, count,
position, or constant_, and the thing it claimed to guard was _behaviour_. The instances, because
the list is the lesson:

- `indexOf("mms_pin_promo_grant")` matched the RPC name **inside a comment** — commenting the pin
  out read as clean. The hand-rolled comment/string scanner that replaced it was beaten by a regex
  literal containing a quote (fabricated string state swallowed the rest of the file). Both are the
  same mistake at different resolutions: **approximating a JavaScript parser**. TypeScript is
  already a dependency; parse. Comments are not AST nodes, which turns "is this executable?" from
  textual to structural and closes the class, not the instance.
- Comparing `getStart()` positions proved the pin was **written above** the derivation —
  `await Promise.all([pin, totals])` satisfies that while running both concurrently. **Lexical
  order is not sequencing.** A sequencing rule asserts _awaited_, in a _statement that finishes
  before_ the dependent statement begins. Same statement = concurrency invisible to position.
- The fx-boot extraction took a first-textual match, then "exactly one candidate". **Uniqueness is
  not liveness**: a known-good copy parked in `{false && <script/>}` plus a regressed live script
  leaves the DEAD copy as the sole candidate, every assertion green against code that never ships.
  Bind the extraction to the live candidate and evaluate the shipped literal, refusing ambiguity —
  throw on two candidates rather than picking by position. And state the bound honestly: the guard
  excludes the _enumerated literal-dead shapes_ a person actually writes (`{false && …}`, `{0 && …}`,
  dead ternary arms) — it is NOT a reachability proof, and a good copy inside an uncalled helper
  component still counts as live. Full reachability needs the type checker and control-flow analysis
  the guard has no business carrying; the honest claim is "not fooled by parked dead copies", and the
  guard's own comment says exactly that.
- `opts.cores ?? 8` silently rewrote the explicitly-`undefined` case (the real browser case being
  asserted) to 8 cores; a test regex anchored on the post-fix shape made the suite **vanish**
  ("no tests") on regression instead of failing; a visitor written `(c) => walk(c)` returned the
  accumulator, and **`ts.forEachChild` is a SEARCH primitive** — it stops at the first truthy
  return, so the walk silently covered a sliver of the file.

The discipline that actually caught these, when it was applied: **falsify the specific evasion** —
comment the call out, park a dead copy, split the statement — watch red, restore. The red-first
rule already said this; what #60 adds is _where to aim it_: at the guard's own matching, not only at
the rule it encodes. When writing any guard, ask "what text would satisfy my matcher without
shipping the behaviour?" — and if the answer involves a comment, a dead branch, or a reordering,
and the subject is executable JS/TS, the matcher needs the compiler, not more regex. Where no
compiler exists for the subject — the composite-contrast band guard reads CSS — the honest shape is
a BOUNDED scan, and that is how that guard was actually hardened: comments stripped first, the
painting rule selected by what it _declares_ (a `background`) rather than by position, more than one
custom property refused. Parse where a parser exists; where none does, constrain the scan and aim
the same falsification at it.

## #61 — The gate built in the morning was walked past in the afternoon (#241, 2026-08-29)

#241 was marked ready at 19:50:52Z, `require-codex-review` went red on the head at 19:51:01Z, and
the PR was squash-merged at 19:51:12Z — **eleven seconds after the gate said stop**, by the same
session that had shipped the gate the previous PR. `8f2b11b`, a money-path guard rewrite, reached
`main` with no Codex review of it. Nothing malfunctioned: the check was red, correctly, and the
merge went through anyway because branch protection does not yet require it (C16) and the hands on
the merge button were mid-flow. The lesson is not "be more careful" — that was the regime the gate
was built to replace. Two durable changes:

- **Mark-ready and merge are never one motion.** The ritual, now in `docs/WORKFLOW.md`: final push →
  mark ready → `@codex review` → **WAIT** for the `codex-review` check to be green _with a summary
  that SAYS "Codex has reviewed" the merge head_ (green-plus-SHA is not enough — the draft
  stand-down is green and names the SHA while asserting the opposite; event-driven — subscribe to
  the PR; never sleep-poll) → fetch the round, fix-or-justify — _a pushed fix is a new head: loop
  back through the wait for it_ → merge, only ever a head whose own reviewed verdict is green.
  #242 ran exactly this: the gate held red for four minutes across
  three re-evaluations until Codex reported, and the merge followed the green, not the urge.
- **An advisory check is a ritual, not a gate.** #241 is the measured proof C16 needs: until
  `codex-review` is required by branch protection, the gate's whole value rests on the discipline it
  was built because discipline fails.

Same merge flow, same afternoon, same root shape: the conflict-resolution list handed to Codex for
verification was quoted from memory and was wrong twice (M148 was not a conflict; T5/T6 were
omitted). The resolution itself was right — proven only afterwards, as a **set operation**:
`closed(parent1)`, `closed(parent2)`, `closed(merge)`; assert _lost = ∅_ and _invented = ∅_; paste
the computed sets. "Never transcribe a number into an assertion" applies to lists: a merge
resolution is verified by deriving the sets, never by recalling them.

## #62 — "Safer" is a claim about a caller, not about a predicate (#245, 2026-09-01)

Two abandon paths in `create-intent` ran an era-scoped `mms_release_promo_grant` and then a uid-only
`releaseCartLock`. Fixing the lock's predicate (M153) was correct. Collapsing the pair into
`releasePayAttempt` — one statement, era-scoped, no half-apply — looked like the same fix done
better, and the commit argued it in those words: the tighter predicate "fails closed", which "is the
M70 invariant applied".

It was a regression, and Codex and a blind adversarial pass found it independently. The two
functions differ by one disjunct — `locked_at is null` — and that disjunct is correct for one caller
and wrong for the other, in opposite directions:

- **A client exit** (a `pagehide` beacon, "Edit order") cannot show the pin is its own. If a TTL or a
  cart-wide release nulled the era, an `is null` arm would let a stale token clear a pin a captured
  PaymentIntent still reconciles against. It must fail closed.
- **`create-intent`** holds the lock it pinned under. The pin is ITS OWN, seconds old, with no intent
  behind it. A predecessor's delayed `payment_failed` webhook calls `releaseCartLock(cartId, null)`
  — cart-wide, nulling `locked_at` — and if that lands between our pin and our abandon, the era-only
  predicate matches zero rows and strands our orphan pin on an unlocked cart. `acquireSettlement`
  gates on the raw `locked` column, so cash / Terminal / split then charge it. **The narrowing
  manufactured the exact defect it was meant to avoid (M123 a′).**

The failure wasn't the code, it was the reasoning: I checked the invariant ("the pin must outlive the
lock") against the case it was written for and never asked _whose pin_. **When two helpers differ by
a predicate term, the term is not a safety dial — it encodes which caller can prove what. Before
swapping one for the other, name the proof each caller holds.** Both are now guarded: `check-pay-attempt.mjs`
bans `releasePayAttempt` AND `releaseCartLock` inside that route, as parsed absence rules.

## #63 — A display basis is only safe once you enumerate every consumer that CHARGES

M123 (b): `getCartView` quotes `coalesce(pin, live)`, so a declined card leaves an orphan pin that
makes the review step promise a discount the card path won't honour. The fix looks obvious — quote
live. I verified it against `create-intent`, which releases the pin under its own era and re-derives,
and concluded "the quote and the charge agree."

That sentence was true of exactly one charge path. **Five others — cash (`staff-cart.ts:281`),
secure-tab close (`:528`), Terminal (`terminal.ts:136`), split (`split.ts:246`) and the floor settle
quote (`floor.ts:360`) — all derive on the authorized basis and charge the PIN.** Before the change
the review step agreed with them; after it, a guest reads one number on their phone and is charged
another at the till. Reachable with no concurrency at all, because nothing re-validates a promo code
on a line edit (`20260620000000_promo_validation.sql:93` says so in its own comment): apply at $60,
edit to $45, pay (pin 0), decline, edit back to $60 (live 1000), settle at the counter.

Reverted. The real finding is that **there is no correct display basis while an orphan pin can
outlive the attempt that made it** — quoting the pin lies about the phone, quoting live lies about
the counter, and the second is worse. (b) is refiled with (a′) as blocked on the cart→intent link.

Two transferable rules:

- **A "display-only" change to a shared derivation is not display-only.** `getCartTotals` has nine
  callers; `getCartView` alone feeds six consumers, including every mutation response. Enumerate
  them — `grep` the function, not the surface you have in mind — before deciding a default.
- **The blind pass earns its keep on exactly this.** In-context review agreed with my framing because
  I had written the framing. The auditor got the diff and nothing else, and asked the question I
  hadn't: agree with _which_ charge?

## #64 — A heading search that "finds the next section" will eat the sections in between

Rewriting a `CHANGELOG.md` entry in a Python one-liner: `i = s.index("### My entry")`, then
`j = s.index("\n## ", i)`, then `s[:i] + new + s[j+1:]`. `\n## ` does not match `\n### `, so `j`
skipped every `###` entry under `[Unreleased]` and landed on the next `##` version heading —
**deleting 8,190 lines of project history**, which `format`, `lint`, `typecheck`, `build`, `test`
and `check:docs` all pass cleanly over, because a shorter changelog is still valid markdown.

Caught only by reading `git diff --stat` and seeing `CHANGELOG.md | 8268 +-----`. Rules:

- **Prepend, never span.** To add an entry, `replace(anchor, anchor + entry, 1)` on the heading above
  it. Never compute an end offset you did not verify.
- **Read `--stat` before every commit that touches a doc by script.** A line count is the cheapest
  possible check and the only one that would have caught this.
- After a scripted doc edit, assert an invariant that survives it: entry count is exactly +1, section
  headings are preserved. I checked the other three files for the same shape and they were clean.

## #65 — A lesson taught to one matcher is not taught to the concept (#246, 2026-09-02)

> **Seven Codex rounds on #246 turned this into the file's dominant failure mode: FOUR separate
> matchers in `check-freeze-parity.mjs` each had to be re-bound after being written to match text.**
> The subject selector matched `*.locked` (caught a diagnostic read); `forcesRefusal` matched any
> `<anything>.locked`; the authz derivation matched the identifier TEXT `locked`; and each fix was
> applied to one matcher while the next one shipped with the same hole. When you write ANY predicate
> over a name, the question is not "does this string appear" but "is this the thing I mean" — bind
> it to the value it must come from, and then go grep the same file for every other predicate that
> is still spelling instead of binding.

`scripts/check-freeze-parity.mjs` had `firstPos` skip nested function bodies, with a comment saying
why: a callback's position says nothing about when it runs. Two rounds later Codex found
`thenBranchRefuses` walking straight into those same nested bodies, so

```ts
if (locked) {
  const report = () => {
    throw new Error("Order is locked while someone checks out");
  };
}
```

satisfied "this branch refuses" while the function refused nothing and wrote on a frozen cart. The
pre-fix matcher printed **clean** against a `cart.ts` where `undoFire` had no live refusal at all.

This is the SECOND time in two PRs, and the first one is in this file: #245's `isWrite` gained a
helper arm that `isWriteCall` did not, and the ordering rule silently kept its old direct-call-only
reach. Same shape, different file. The failing move is to treat a review finding as an edit to one
function rather than a rule about a concept.

So when a finding lands on a matcher, grep the file for **every other predicate over the same
subject** — every AST walk that asks a question about "this function's body", "this branch", "this
statement" — and ask whether the same evasion works there. Then falsify it there too. And when two
predicates express one concept, make them consult one helper (`WRITE_CALLS`/`WRITE_HELPERS`) rather
than trusting a comment that says "must stay in step with".

The companion finding on the same round is the same disease one level up: the subject selector only
visited `ts.isFunctionDeclaration`, so `export const nudgeLine = async (…) => {…}` — a new cart
mutation binding `locked` with no refusal at all — was invisible to a guard whose entire purpose is
to notice exactly that. A selector that names ONE spelling of a construct is a name-based matcher
wearing an AST costume.

## #66 — Two derivations of one set are an experiment; one derivation is an assertion (#247, 2026-09-03)

`check-freeze-parity.mjs` had been blind to `apps/qr/lib/pickup.ts` because its file set was two
constants (OPEN-ITEMS T13). The fix was obvious — derive the files instead of naming them — and I
wrote it, and it was still wrong: the file-level predicate looked only for a **destructured**
`locked`, while `apps/qr/lib/reorder.ts` keeps the whole authorization object
(`const authz = await assertCartMember(…); if (authz.locked) …`). The per-FUNCTION selector in the
same file had understood that shape for rounds, since `setKioskTip`. So the fix for
"defined by where you looked" was itself defined by where I looked, one level up, and it printed
clean.

Nothing in that guard could have caught it. It agreed with itself.

What caught it was that the new `check-child-freeze.mjs` derives the SAME set for its own reasons,
independently — and came back one larger: 14 against 13. A single number out of place, in a `--dim`
suffix nobody is obliged to read.

The rules that follow:

- **When you write a second view of an existing rule, cross-check the two sets and treat any
  mismatch as a defect in one of them.** Not as a definitional difference to be explained away —
  that was my first instinct here, and the "explanation" would have been a fourteenth unguarded
  money-path mutation.
- **A guard's own green is evidence about the guard, not about the code**, whenever the guard is the
  only thing that looked. Independent derivations are how you get evidence about the code.
- **Make every guard PRINT the size and shape of what it derived.** Both of these print their
  subject count; that is the entire reason the discrepancy was visible at all. A guard that prints
  only `clean` cannot be cross-checked by anything.
- And the corollary to #65: when you fix a matcher that was spelling instead of binding, **check
  whether the fix you just wrote spells too.** It usually does, in the same file, one scope out.

## #67 — A falsification you did not diff is not a falsification (#247, 2026-09-03)

Deleting `if (frozen) return;` from `RewardField.remove()` to prove the new rule 2 could fail
reported **green**, which would have meant a decorative guard. It did not. The `perl -0pi -e
's/    if \(frozen\) return;\n//'` never matched, because the shipped line carries a trailing
comment: `if (frozen) return; // the refusal lives HERE; …`. Nothing was deleted. The run proved
nothing and read exactly like a real defect.

This is the second time in two sessions (`#61`: a regex that missed a multi-line `const lockedFresh =`,
so the mutation never applied and the measurement was meaningless). The failure mode is identical and
it is silent in BOTH directions — a vacuous falsification can report green (guard looks broken, isn't)
or red (guard looks fine, hasn't been tested).

**So: diff the file after applying a mutation, before reading the guard's answer.** `diff bak file`
costs nothing; a no-op `perl -0pi` costs an hour chasing a hole that is not there, or ships one that
is. Prefer line-addressed edits (`sed -i '179d'`) over pattern edits when you know the line, and when
you must pattern-match, assert the substitution count.

## #68 — A guard's coverage is a claim, and it is the one claim the guard cannot check (#247, 2026-09-03)

`scripts/check-child-freeze.mjs` printed `clean` and named the number of mutations it derived. It was
opening **four of the eight components that fire them.** Two mundane reasons:

- `readdirSync(dir)` is not recursive, so `components/kiosk/*` and `components/menu/*` — three
  components firing four mutations — were never read;
- `ts.ImportSpecifier.name` is the **local** binding. `import { addItem as addItemAction }` gives
  `name = addItemAction` and `propertyName = addItem`, so matching on `.name` missed every aliased
  import, and `TableCartProvider` fell out before a single rule ran.

Neither is subtle. What made them dangerous is that **nothing in the system could contradict them.**
The guard's docblock, the `ci.yml` comment and the OPEN-ITEMS closure all said new components "join
automatically", and CI printed the same word it prints when the claim is true. A guard reports on the
code it opened; it never reports on the code it did not.

So, for any guard that walks a tree:

- **Print the size and the shape of what you actually opened** — the count of files audited, not just
  a verdict. A number that should be 8 and reads 4 is visible; `clean` is not.
- **Make every exclusion an entry that must FIRE.** An `EXEMPT` map with a dead-entry check converts
  "this file is out of scope" from an accident of `readdirSync` into a written decision that breaks
  when it stops being true. Four files are exempt here and each names the row it is filed under.
- **Enumerate with `{ recursive: true }` or an explicit walk, and resolve `propertyName ?? name`** —
  both of these are one-liners, and both were wrong.
- **A second, independent derivation is the only thing that can catch this.** Twice now the two
  freeze guards disagreed by exactly one, and both times the difference was a real defect (see #66).
  The second disagreement — 15 vs 14 — was `grocery.ts` binding its authz result by ASSIGNMENT
  (`let authz; try { authz = await assertCartMember(…) }`), a shape neither selector read, which had
  left a whole component audited by nothing.

The corollary for review: when a guard says it covers a category, **ask it to name the members.** Both
Codex and a blind adversarial pass found this within one round, independently, by doing exactly that —
listing the files that import a subject and comparing against what the guard could reach.

## #69 — Threading the parent's SENTENCE down is a drift trap, not a drift fix (#247, 2026-09-03)

Four child components were given `frozen` (the fact) **and** `frozenNote` (the parent's own
`freezeNotice` string), reasoned as: reuse the sentence verbatim so a refusal in the child cannot
drift from the explanation on screen. That is backwards, and it shipped two defects:

1. **The two props come from different freezes.** `frozen` is the RAW lock; `frozenNote` is the
   SUPPRESSED one (`visibleFreeze` blanks the notice during the viewer's own create-intent, because
   telling someone "another person is checking out" about themselves is a lie). So
   `frozen === true && frozenNote === null` is reachable — in exactly one state, the viewer's own
   in-flight payment — and every `frozenNote ?? "Someone's checking out…"` fallback fired precisely
   there. The fabricated diagnosis the parent file opens by refusing to commit, committed one
   component down, in the fix for it.
2. **Echoing a string into a live region that already holds it announces nothing.** React bails on
   the equal state, the text node does not change, and the tap has no observable effect at all.

The fix is the opposite of the instinct: **the child names its own control and claims nothing about
cause.** "Pickup timing is locked while a checkout finishes" is true under every freeze state, cannot
drift (there is nothing to drift from), and differs from the bar's sentence, so it announces.

The general rule: pass a child the FACT and let it speak for its own surface. A sentence composed by
the parent about the parent's situation is not reusable by a child asking a different question — and
two values that are derived differently must never be paired under a `??`, because the pairing is
only exercised in the state where they disagree.

## #70 — "It speaks" is not "it tells the truth", and a backlog row that checked the first has not checked the second (#248, 2026-09-03)

`docs/OPEN-ITEMS.md` **T14** recorded a considered judgement about /menu: _"Neither is a silent
no-op today: both catches re-sync and speak."_ That sentence is true and it hid a live defect for as
long as it stood, because it answered the wrong question. `TableCartProvider`'s `add` and
`setItemQty` did speak — they flashed **"Reconnecting to your table…"** and re-minted the table
session — for **every** throw out of `addItem`/`setQty`, including the lock the catch's own comment
listed among the causes. A diner whose tablemate was checking out was therefore told their connection
had dropped, watched a session re-mint they did not need, and could then be told the session was
restarted: two false statements about a session that was fine.

That is exactly the M116/M119 class four PRs were spent removing, sitting one screen over, and the
row that was supposed to be tracking it had already written it off. **J4's clause (b) is "silent
no-op"; the class is bigger than the clause.** A control that accepts a tap and says something FALSE
is worse than one that says nothing — silence leaves the diner's model of the system intact, a wrong
diagnosis replaces it. So when triaging a refusal path, the question is never "does it announce?" but
**"does the sentence name something this code established?"**

Two mechanics made it durable, both worth carrying:

- **The message could not be read, so the cause had to be re-derived.** Next redacts thrown Server
  Action messages in production, so the server's own `"Order is locked while someone checks out"`
  never reaches the browser. Every client catch over a Server Action is therefore structurally blind,
  and any cause it names is invented unless it re-establishes it. One re-read of `getCartView` — the
  same `assertCartMember` gate the write went through — separates all four states.
- **The re-mint was the tell.** A recovery action is a stronger claim than a sentence: it says "I know
  what is wrong and this fixes it." Grep for the RECOVERY, not the copy — an unconditional
  `revalidate()` in a catch is a diagnosis whether or not anything is printed.

## #71 — A row's stated blocker can be about a different code path than the one it names (#248, 2026-09-03)

**T10** sized itself as a slice rather than a fix on one sentence: widening the cart subscription
_"changes channel scope and the RLS path on `realtime.messages` (private channels, `is_member`) for
two modes that have never had it."_ Every clause there is true of `useGroupCart`. None of it is true
of `useCartRealtime`, which is the hook the row is about. They live in the same file, `lib/realtime.ts`,
and the reasoning slid from one to the other.

Measured instead of inferred, `useCartRealtime` opens a deliberately **non-private** channel carrying
no broadcast — its own docblock says so — so `realtime.messages` is not in its path at all; delivery
rides the ordinary SELECT RLS on `qr_carts` (`is_member(session_id) or is_staff()`, no mode term),
and both tables have been on the `supabase_realtime` publication for **every row** since
`20260620000600_cart_realtime.sql`. No migration, no policy, no new RLS. The "slice" was the deletion
of a parameter.

The general rule: **a blocker is a claim about a specific code path, so verify it against that path's
source before you accept the sizing it implies.** Two hooks in one file, two routes with one prefix,
two functions with one name — the reasoning travels between them silently, and it always travels
toward the more expensive answer, because that is the one nobody re-checks. Deriving the fix from the
source turned an owner-gated slice into a one-parameter deletion; deriving it from the row would have
deferred it again.

And when the fix IS a deletion, prefer it: the reason T10 could recur was a `boolean` knob two callers
each passed a mode predicate into. A parameter that does not exist cannot be re-narrowed, and
TypeScript makes re-adding it a deliberate act across every call site — the same argument T9 made for
required props, one layer down.

## #72 — A freeze the server expires by COMPUTATION cannot be cached by a client that also gates on it (#248, 2026-09-03)

Codex and a blind adversarial pass, running independently on the same diff, returned the same P1 —
which is the strongest signal this repo has produced for a single finding.

The diff added a pre-write gate: refuse a cart write against the freeze the client already holds,
"so a refusal costs no round trip". The docblock claimed it "can never block a cart the server would
have accepted". It could, and it could not recover:

```ts
// authz.ts — the lock is a COMPUTED predicate, not a column
const lockedFresh =
  cart.locked &&
  cart.locked_at !== null &&
  new Date(cart.locked_at).getTime() > Date.now() - CART_LOCK_TTL_MS;
```

A lock therefore expires **by the passage of time**. No row write, so no Postgres-Changes event, so
the cached copy is never corrected. And the gate removed the one thing that WOULD have corrected it:
the mutation whose returned view the provider folds in. A diner who left `/menu` open would go on
being refused, naming a lock that expired minutes ago, forever.

**The rule: never cache a state whose owner expires it by computation and then gate on the cache.**
Ask of any client-side gate, "what event tells me this stopped being true?" — if the answer is
"none, it just stops", the cache can only ever be an optimisation over a decision the server still
has to make, never the decision itself. The fix was deleting the gate: the write goes out, the
server decides, and a refusal is explained afterwards from a read. The round trip the gate saved is
the round trip the write was going to make anyway.

## #73 — A classification built from a LATER read may report observations, never causation (#248, 2026-09-03)

The same diff replaced a fabricated diagnosis ("Reconnecting to your table…" for every refused
write) with a re-read that established the cause. Round 1 found the replacement overclaiming in
three separate ways, all one shape:

- **A failed re-read was called `session`.** But `assertCartMember` throws `UNAVAILABLE()` for cart,
  session AND membership _query_ errors, and the Server Action can fail in transport. A failed read
  establishes that we cannot see the cart — nothing about a session. Renamed `unreachable`, and the
  re-mint is now offered as a recovery attempt rather than announced as a verdict.
- **A successful re-read was treated as the state at REFUSAL time.** It is the state at READ time: an
  add can fail on a stale modifier while a tablemate takes the lock before `getCartView` returns, and
  the classifier would then tell the diner checkout caused it. Every sentence now opens with an
  observation ("That didn't go through") and continues with current state — no causal claim, because
  one later read cannot support one.
- **A missing capability was read as evidence about the world.** `freezeNotice`'s `self` branch keys
  on `canRelease` = "this viewer holds an attempt token"; /menu never holds one, so passing `false`
  selected _"Another checkout on this device is holding this order"_ — asserting a second checkout
  from the mere absence of a token. A diner who walked back from `/cart` after a failed release is
  one tab. **"This surface can't do X" is not "someone else did X."**

The through-line with #70: it is not enough for a refusal to speak, and it is not enough for it to
be _derived_ — the derivation has to support the specific claim the sentence makes. Two independent
reviewers found this on code written specifically to remove the same class one layer up.

## #74 — `verify:slice` is DIRTY-tree protection only in one direction: never COMMIT while a run is live (#250, 2026-09-04)

The warning in `CLAUDE.md` says the run "ABORTS if a target file is DIRTY — commit or stash first."
That protects the run from your edits. Nothing protects your commit from the run.

`scripts/verify-slice.mjs` REWRITES each of the 63 money/authority modules in place, runs the owning
suite, and restores the file. So at any instant during a multi-minute run, exactly one tracked file
on disk is a deliberately-broken version of itself. A `git add -A` / `git commit -am` in that instant
snapshots the mutant into the commit — and pushes it.

That is what shipped `659a1af` on #250: the run died mid-flight (log truncated at 180/275 caught) with
`apps/qr/lib/split.ts` still carrying `split/abort-captured-ignores-the-payment-intent`'s successor —
`const outcome = await releaseHold(pi)` replaced by `const outcome = "released"`. The commit was a
DOCS-ONLY change (filing T27); the diff picked up a money-path module the slice had nothing to do with.

Why nothing else caught it:

- **The commit looked clean at review time** — I read the diff I intended, not the diff `git` staged.
- **CI caught it, but as a test failure in a file I had not touched** (`lib/split.test.ts:342`,
  "expected [ 'pi_old' ] to include 'pi_claimed_mid_abort'"), which reads exactly like the unrelated
  pre-existing breakage the drive-to-green rules tell you to rule out — the one shape that invites
  "not mine". It IS mine; the mutant is in the diff.
- **The mutant is a plausible line.** `const outcome = "released"` type-checks, lints, formats, and
  reads as a deliberate simplification. Only its own suite can tell.

Rules, in falling order of cheapness:

1. **Never run `git add -A` / `git commit -am` while a slice run may be live.** Check with
   `pgrep -f "[v]erify-slice"` first — bracket the first char, or the pattern self-matches your own
   shell and reports a run that isn't there.
2. **Commit by explicit path** when a run's state is uncertain. A docs commit should name the docs.
3. **After ANY killed or stalled run: `git checkout -- .` and confirm clean BEFORE the next command.**
   `CLAUDE.md` already says this for the _next run's_ benefit; it is equally the _commit's_.
4. **Diff what git staged, not what you meant.** `git diff --cached --stat` names files, and a file
   outside the slice's scope in a slice's commit is the whole tell — here, `split.ts` in a T27 docs
   commit.

The general form, and the reason it belongs beside #60: a tool that mutates the working tree makes
the working tree an unreliable narrator for as long as it runs. Every check that reads the tree —
including `git` itself — is reading a fixture, not the code.

## #75 — a guard with TWO mirrors is a guard at its LOOSEST mirror, and the loose one is usually the one that gates the merge (#252, 2026-09-04)

`.test.tsx` became runnable, which made a per-file `@vitest-environment jsdom` docblock load-bearing.
Vitest reads that pragma out of RAW FILE TEXT with an unanchored regex — no docblock-position
constraint — so a `.test.ts` that merely MENTIONS the phrase in a comment silently switches
environment: no count change, no timing change, no other symptom. This repo writes long explanatory
comments in test files, and the PR that introduced the rule was itself writing prose about the rule.

The guard was therefore written twice, as the orphan check already is: once in
`scripts/verify-slice.mjs` and once in `ci.yml`. Both "copied vitest's regex". They still disagreed:

- **JS `\s` spans newlines; `grep` is line-oriented.** A pragma whose environment word sits on the
  NEXT line is honoured by vitest, caught by `verify:slice`, and **missed by CI**.
- **`\b` diverged too.** On `jsdom-`, JS backtracks and captures `jsdom`; the shell captured `jsdom-`.

The direction matters more than the divergence. `verify:slice` is a local gate nobody is obliged to
run; `ci.yml` is what actually blocks a merge. **A two-mirror guard is only as strong as the mirror
that gates, and the gating mirror is the one written in the weaker language.** The fix was to stop
mirroring: `scripts/check-test-env.mjs` is ONE module, called by both, so the two cannot drift.

Corollary on the parse-don't-scan rule (#60): copying the RUNTIME's own regex is correct here and is
not an exception. The guarded fact IS text — vitest matches text — so a text matcher and the runtime
agree by construction, while a parser would ignore a pragma inside a string literal that vitest
honours. Parse when the subject is executable behaviour; mirror the matcher when the subject IS a
matcher. Either way, write it once.

## #76 — an assertion on a SINGLE-SLOT live region can be satisfied by a different effect, so it proves nothing about the code you think it pins (#252, 2026-09-04)

The first draft of the provider suite asserted that `setItemQty`'s refusal made the live region match
`/checking out/i`. It passed. It was worthless: **no producible refusal contains that phrase** — the
lock clause reads "while someone CHECKS out" — and what satisfied the regex was an unrelated effect.
The recovery re-read flips `locked` false→true, and the lock-transition announcement writes "Someone
is checking out — the order's locked" into the SAME single slot. Deleting
`if (result.state === "refused") publishRefusal(notice);` reddened nothing.

Two rules, both cheap:

1. **Assert on the value the code under test ALONE writes.** Here that is `lastRefusalNotice()` —
   written only by `publishRefusal`, and the value `YourUsual` actually carries. A shared output
   channel (one live region, one toast slot, one log) is a shared fixture: many writers, one reader,
   and a passing assertion cannot tell you which writer produced it.
2. **DERIVE expected copy by calling the producer; never transcribe a sentence.** The same suite
   invented `"Nour is checking out — your order is locked for a moment."`, a string
   `refusedWriteNotice` cannot emit. That is the "never transcribe a number into an assertion" rule
   applied to prose, and it has the same failure mode plus one: the invented string HID a live defect
   (the real sentence stutters — T32) for the length of a PR. Deriving it made the defect visible in
   the first run.

## #77 — a composed sentence needs its mutant at the BOUNDARY, not inside the consumer that mocks its context (#254, 2026-09-04)

T32's defect lived in two files at once: `cart-freeze.ts` produced a sentence, `YourUsual.tsx` appended
it inside a sentence of its own that already opened the same way, and the diner heard the verdict
twice. Neither file is wrong on its own — the notice reads correctly when the provider publishes it
alone, and the card's template is unremarkable. The defect is the JOIN.

That has a consequence for where the guard goes, and the obvious placement is the wrong one:

- **Not in the consumer's suite.** `YourUsual.test.tsx` mocks the whole cart context, so whatever it
  asserts about the appended string it asserts about a FIXTURE. It cannot see the producer changing
  its prefix; it would stay green through exactly the drift it was written to catch.
- **Not an import ban.** An AST or lint rule forbidding the consumer from importing the sentence
  producer is defeated four ways — an aliased import (the matcher reads the local binding, a bug this
  repo has already recorded), a namespace import, an indirection through a variable, and —
  undefeatably by _any_ matcher — hand-writing the producer's prefix into the template. That last one
  calls nothing banned and ships the exact defect.
- **At the boundary.** The mutant belongs where the two meet: the provider line that decides WHICH
  rendering crosses the seam. Both functions take the same argument, so latching the whole sentence
  instead of the fragment typechecks perfectly and restores the defect exactly — which is what makes
  it a real mutation rather than a syntax error. Beside it, one behavioural mutant reconstructs the
  producer's prefix by hand, so the un-matchable evasion is falsified by comparing the announced
  string against the producer's live output rather than by pattern.

The general rule: **when one value is rendered two ways for two callers, guard the choice of
rendering, not either rendering.** A test on the producer proves the strings; a test on the consumer
proves the template; only the boundary proves they compose.

## #78 — a "failing start" that mounts an empty fixture cannot fail in either direction (#254, 2026-09-04)

#252 pinned T31's no-cart exit and wrote, in the file, "Pinned here as it stands so the fix has a
failing start." The scout measured it: that fixture mounts with a null session, so the latch was never
written, and `expect(latch).toBeNull()` passes before the fix and after it. It was a shape check
wearing a red-first label — the most expensive kind of green test, because the label tells the next
reader not to look.

A failing start has to be a SEQUENCE when the defect is one: establish the state (refuse a write, so a
cause is latched), then perform the act that should clear it (a later write that succeeds), then
assert. That test was red at HEAD for the right reason — and the proof it was the right reason is that
it had to be run under the OLD symbol name first, because running it under the new one failed with
"not a function", which is red for the wrong reason and proves nothing.

Two habits fall out. Before trusting any assertion labelled red-first, **run it at HEAD and read the
failure text** — "expected X to be null" is a defect; "X is not a function" is a rename. And when a
test's own comment claims it will fail, that claim is itself a testable statement: check it, because a
false one is indistinguishable from a true one until someone tries.

## #79 — a mutant anchor chosen BEFORE `pnpm format` goes stale on the commit that adds it (#254, 2026-09-04)

`refusal/unknown-borrows-the-assertive-opener` was written, red-first probed (CAUGHT), and then went
**STALE on its own PR** — `pattern matched 0×`. Nothing about the rule changed. `pnpm format` ran
between the probe and the commit and wrapped the declaration the anchor named:

```ts
// what the anchor was written against
const opener = refusal.cause === "unknown" ? "We couldn’t confirm that" : "That didn’t go through";

// what prettier shipped
const opener = refusal.cause === "unknown" ? "We couldn’t confirm that" : "That didn’t go through";
```

Two things follow, and only the second is the real lesson:

1. **Order the pre-PR steps `format` → choose anchor → red-first probe.** A probe against unformatted
   text proves the mutant can fail against a file that is not the one being committed. Prefer an
   anchor prettier cannot reflow — here, the ternary line alone rather than the whole declaration.
2. **This is the same class as every other finding in this arc, one layer out.** A guard was proved
   against a version of its subject that did not ship. The red-first rule says "watch it fail"; it
   has to be _the shipped text_ that you watched it fail against. `verify:slice` caught this exactly
   as designed — a STALE mutant is a FAILURE, not a skip, and this is what that rule buys.

The near-miss is worth naming: had the anchor stayed loosely matched (a substring that survived the
wrap), the mutant would have gone green while testing nothing, and no gate would have said a word.

## #80 — a currency check and a SNAPSHOT look identical at the call site and answer different questions (#256, 2026-09-05)

Four review rounds on one slice — a blind adversarial pass and two Codex rounds — produced four
findings, and **every one was the same error at a lower altitude**: a check that was true, about the
wrong MOMENT.

T33 latches "which freeze a refusal just explained" so the generic banner does not overwrite the
specific sentence a microtask later. Each round moved the same question one hop:

1. **Blind pass, CRITICAL.** The latch was set from a recovery read that LOST the screen.
   `explainCaught` classifies from what its read observed even when `applyView` rejects the view —
   deliberately, because a refusal is a fact about the moment it LOOKED. A latch is a claim about
   what the diner can SEE. Two different questions about two different moments, and the code asked
   the first while the consumer needed the second.
2. **Codex round 1, P1.** The fix passed `applyView`'s return value down to `publishRefusal`. That
   is a **snapshot** — "did my read win when it landed" — and another mutation's view can apply
   between then and the caller resuming from `await`. The flag still reads `true`, the rendered cart
   is editable, and the latch claims a freeze nobody can see: the same silence, one microtask out.
3. **Codex round 2, P2.** The latch recorded the freeze AXIS, but the lock SENTENCE names a holder
   (`refusedWriteClause` renders `inertReason({ lockedByYou: refusal.freeze === "self" })`). `locked`
   never goes false across a handoff, so no release edge retires the latch — an ownership change left
   it silencing the banner for the OTHER holder while the region still named the first.

Three rules fall out, and they generalise past this file:

- **Ask currency where the CLAIM is made, from a source written by the thing that changed the
  screen.** Not from a value carried in across an `await`. `freezeRef`/`settlingRef` are written
  synchronously by `applyView` from the very view it applies, so reading them at publish time is the
  only honest answer to "what does the diner see now".
- **A boolean is not the fact when the sentence names an identity.** If copy forks on `X === "self"`,
  the latch must carry that fork and revalidate it — and must read it from the **same field** the
  copy reads (`refusal.freeze`), or you have the W17 drift shape: one fact computed twice.
- **Whatever gate you put at the write, ask it again at the READ** if the state can move in between.
  The entering edge here trusted a latch that publish time had checked and no release edge had
  retired. Both edges now run `explanationHolds`.

## #81 — the `verify:slice` hazard is ANY write to a target module, not just a commit (#256, 2026-09-05)

`CLAUDE.md` says never COMMIT while a run is live, because at every instant one tracked module on
disk is a deliberately-broken version of itself (LEARNINGS #74, where a mutant rode into a docs-only
commit). That framing is too narrow and it cost a run here: **`pnpm format` was run mid-run** to
format doc edits, and prettier reads and rewrites every matched file — including the mutated one.

The run was killed and `git status` showed the tell: `apps/qr/lib/view-seq.ts` dirty, with
`readReachedServer` returning `o === "applied"` instead of `o !== "failed"` — a live mutant parked on
disk. Restored, tree confirmed clean, exactly one run started and watched to completion.

- The dirty-tree abort protects the RUN from your edits. **Nothing protects the TREE from the run.**
- So the rule is: no formatter, no codegen, no editor-on-save, no commit — **no writes at all** to
  the tree — while a run is live. Do the doc pass and the `pnpm format` BEFORE you start it.
- `pgrep -f "[v]erify-slice"` before committing is necessary and not sufficient. **`git status` after
  every run**, and never report a number from a run whose tree you did not check afterwards.

## #82 — a cross-implementation hash is not a diff; validate the normalizer on bodies you KNOW are identical (pilot D0, 2026-09-05)

Comparing prod's 69 `mms_*` function bodies to the repo's latest definitions, the first
comment-stripped comparison said **68 of 69 differ**. The truth was **0 of 69**. The 68 was the
NORMALIZER disagreeing with itself across two runtimes: Postgres `btrim()` trims spaces only, so a
body's leading newline survived there and collapsed to a leading space, while Python `.strip()` ate
it. Every function got a different hash for a byte nobody wrote.

What made it catchable: an EARLIER raw-md5 pass had shown 39 bodies byte-identical. A normalizer
that then reports those same 39 as different cannot be measuring the code — it is measuring itself.
That is the check to run before trusting any drift count: **normalize on both sides with the same
regex chain in the same order (strip block comments → strip `--` comments → collapse `\s+` → trim
ends with a regex, never `btrim`), and confirm the known-identical set still matches.** Then, and
only then, read the count.

The wider lesson is the one this repo already has for guards: a measurement that can be satisfied
by something other than the fact (here, a trimming rule) needs to be falsified against a known
answer first. Three files were read by eye to confirm (`mms_taxable`, `mms_open_tab`,
`mms_pickup_slots`) — all identical modulo comments — before the 69/69 was believed.

## #83 — a guard that greps for a marker is satisfied by PROSE that mentions the marker (pilot P0, 2026-09-05)

`check-money-coverage` exempts a money-path file when it contains `verify:slice-exempt — <reason>`.
`live-intent.ts` — the pure verdict module built specifically SO IT COULD BE MUTATED — came back
`exempt=1` on the first coverage check. It carried no exemption. Its docblock said "`create-intent`
sits under a `verify:slice-exempt` line", and the regex does not know a docblock from a directive.

Nothing shipped: the count was read before the mutants were written, so the false exemption showed
up as a number that was wrong. But the shape is exactly LEARNINGS #60 — a matcher satisfied by text
that does not ship the behaviour — pointed at the coverage guard itself, and this time the evasion
was authored by the same hand that knew the rule, while EXPLAINING the rule. Two consequences:

- **Never name a directive inside prose in a file the directive's guard scans.** Say "carries a
  coverage exemption" and let the reader find the marker in the file that actually has it.
- **The coverage guard should parse, not scan**: an exemption is a line-leading comment whose
  first token is the marker, and a mention inside a `/** … */` block is not one. Filed as a
  follow-up rather than widened into P0 — but the next time this guard is touched, that is the fix.

## #84 — a LINK without its LOCK is a freeze the client cannot see (pilot P0 blind pass, 2026-09-05)

`qr_carts.live_payment_intent_id` made "a live intent still prices this cart" a fact the pin-clearers
could test. The decline webhook had been releasing the pay-window lock cart-wide since P3.2, on the
grounds that "the charge failed, so free the cart for everyone" — while the M70 paragraph two lines
below it explained that the same PaymentIntent stays confirmable from the mounted Element. Both
sentences were true; together they meant a cart the intent priced was editable. Before the link,
that was the M151 overlap through the decline door (edit, re-confirm, fulfilment's sum re-check
refuses a charged card). After the link, it was a NEW and visible shape: the link survived the
release, `applyPromo`'s `is null` gate refused every promo at the table as "locked", and
`cartFreeze` — which reads `locked` — showed an editable cart. The refusal word was false and
nothing but the next create-intent could clear it.

The fix was to stop releasing the lock on a decline, not to loosen the promo gate: the gate was
right, the lock was wrong. **When a new fact (the link) starts refusing on a surface the old fact
(the lock) still admits, the old fact is what needs to move.** Loosening the new predicate to match
the old surface would have reopened M151 exactly where the link was built to close it.

Two related findings from the same pass, same shape: `create-intent`'s `captured` refusal called
the shared `freeLock()` like every other refusal exit — and unlocked the cart under a charge whose
webhook was late; and `releaseByIntent`'s "release lock, pin and link in ONE statement" was a
statement about the LINK column's key that the LOCK column never shared, so the `canceled` webhook
could null a successor's lock in the window before its unlink. Every one of the three is "a release
written by analogy to the releases beside it". A lock release is not a default; each one needs to
name the fact that makes the cart safe to edit.

## #85 — a guard's REACH is a number, and a wrapper hop changes it silently (pilot P0, 2026-09-05)

`check-freeze-parity` derives its write helpers as "every function whose OWN body performs a
direct write" — one hop. `releasePayLock` called `releasePayAttempt` (a direct `.update`) and was a
subject through the authorizes-and-writes arm. M151 put `releasePayAttemptSafely` in between (cancel
the intent at Stripe, THEN release), and `releasePayLock` left the subject set with no symptom
except its exemption going dead — the dead-exemption rule is the ONLY reason CI went red. A
lock-bearing mutation that was not exempt would have stopped being checked with everything green.

The obvious fix, closing `WRITERS` under routing to a fixpoint, was applied and measured before it
was trusted — and it was wrong in two ways nobody would have predicted from the code: the authz
helper itself became a "writer" (`assertCartMember` → `maybeRenewSession` → an UPDATE), so
"authorizes and writes" collapsed into "authorizes" and four reads owed refusals; and the rate
limiter became one (`assertMutationRate` → `withinRate` → rpc), so the ordering rule placed the
"first write" on the rate-limit call every mutation makes BEFORE its lock refusal — all twelve
subjects red on a change with no behavioural content. The guard's notion of "write" (any
`.update/.insert/.upsert/.delete/.rpc`) is too coarse to close transitively; it needs to know WHICH
table. That is T44. The entry was deleted, with the arc written beside the exemption map.

Two rules from this. **Measure a guard change against the subject set before trusting it** — print
the set, diff it against the expected list, read every arrival. And **a dead-exemption rule is
load-bearing, not tidy**: it is the only mechanism here that turns "the selector stopped reaching a
function" into a failure instead of a silence.

## #86 — a name-check that stops at the dictionary call is checking the wrong half (pilot P2 PR B blind pass, 2026-09-05)

`check-staff-lang.mjs`'s rule 3 asks "is this accessible name built from the dictionary?" — and its
splice check returned the moment it reached a `ts`/`tf`/`al`/`sx` call, under a comment stating the
reason: _"its arguments are keys and values, not copy"_. Half of that sentence is false. A KEY is not
copy; a **slot VALUE is copy whenever a person hears a word in it**. So this passed, green:

```ts
const callOut = ticket.tableNumber != null ? `Table ${ticket.tableNumber}` : …;
aria-label={tf(lang, "expo.a11y.cardBag", { x: callOut })}   // → "Table 7 အတွက် ပါဆယ်ထုပ်"
```

An English word the console **already owns** (`floor.table` = `"စားပွဲ {id}"`) spoken inside a Burmese
sentence, at a call site the guard certified as converted. Three things generalize:

- **A guard that skips a subtree is making a claim about that subtree.** Write the claim down and then
  falsify it. This one was written down — and nobody re-asked _values of WHAT?_ (the #223 shape:
  "idempotent, therefore safe", safe against WHAT?).
- **Resolution must be TRANSITIVE or it is theatre.** The defect was two hops
  (`verifyWho` → `callOut` → `` `Table ${n}` ``). A one-hop walk would have reported clean and felt
  thorough.
- **A guard whose findings need hand-sorting teaches people to skim it.** The first cut followed every
  identifier and reported four literals nobody hears: `"comp"`, `"grocery"`, `"fired"` (discriminants
  in `===` tests) and `"kds.channel.dinein"` (a key reached through a key map). The fix is to follow
  only **string-shaped** expressions (`stringish()`: literal · template · `+`/`??`/`||` · ternary ·
  identifier-thereof — never a call, never a property read) and to skip key positions by **argument
  index**, not by shape. Precision is what makes the true positive believable.

## #87 — "the first match" and "somewhere in the subtree" are two different ways to guard nothing (pilot P2 PR B blind pass, 2026-09-05)

The same file's rule 3c mechanizes WCAG 2.5.3: a control named from a `verb` must RENDER that verb.
It did two things, each defensible alone and fatal together:

```js
if (v && found === null) found = v;   // keep the FIRST verb key
…
if (!rendersKey(el, found.key))       // search the WHOLE element subtree
```

On a four-branch button (`grocery × firstStage`), only branch one was ever checked — and because the
search was subtree-wide, a **crossed** pairing (announce `deactivate` while `row.active`, render
`reactivate` on that same branch) passed with both keys present. Measured, not reasoned: breaking
branch one's `<Chrome>` reddened; breaking any of the other three did not.

The rule now collects **every** verb key and compares BRANCH PATHS (`armPath` records the ternary arms
an expression sits under; `contradicts` refuses a render that disagrees on a shared condition). Two
things to keep:

- **`uniqueness ≠ liveness` has a sibling: `presence ≠ correspondence`.** "The key appears under this
  element" is not "this branch shows the word this branch announces". When a rule is about a PAIRING,
  the matcher has to name both halves and the condition that selects them.
- **State the limit in the code.** Conditions compare as normalized source text, so `firstStage` and
  `!firstStage` read as two conditions and a pairing crossed that way still passes. Writing that down
  is what stops the next reader from trusting it further than it goes — the failure mode that produced
  the paragraph in #86.

## #88 — three props localized out of four reads as finished at every review that looks at props (pilot P2 PR B blind pass, 2026-09-05)

`StaffOutageShell` passes `title`, `body` and `escalatedBody` through `<Chrome>`; `packages/ui`'s
`OutageState` widened all three to `ReactNode` precisely so it could. The screen still rendered a
Burmese heading over a button reading **"Try again"** — `RetryButton` hardcoded `label = "Try again"`
with no prop to pass, and the retry is the ONE control on the one screen that exists because
everything else is unreachable.

Nobody in-session saw it, twice: the props read as complete, and the diff read as complete. The blind
pass saw it because it read the **rendered card**, not the prop list. Two rules out of it:

- **Localization is finished per SCREEN, never per prop.** Enumerate what a person sees — heading,
  body, control, busy state, empty state, error — and tick the list.
- **When you widen a copy prop to ReactNode, add it to the guard's prop list IN THE SAME COMMIT.** Rule
  5's list said `["title", "subtitle"]` under a comment reading _"Only the two EmptyState slots exist
  today"_ — written in the very diff that created `body` and `escalatedBody`. A comment falsified by
  its own commit is the cheapest defect there is to prevent and the easiest to ship.
- **A name has to land on an element that can BEAR one.** `<div tabIndex={-1} aria-label=…>` is the
  `generic` role, which prohibits an author name — the browser discards it. Two live instances, one of
  them the panel a cashier's focus is deliberately moved to as the card reader takes the transaction.
  Now `rule 3d`, which is one attribute to fix and was invisible to every other check in the repo.

## #89 — a bilingual control shows TWO strings and the label module built the name from ONE (pilot P2 PR B, pre-merge blind pass, 2026-09-06)

The staff console renders a bilingual pair through one component: `<Chrome echo>` under `lang="my"`
emits the Burmese span **and** an English echo — `display: block`, no `aria-hidden`, i.e. text a
sighted person reads. `al()` built the control's `visible` from `ts(lang, key)`, one tongue. So:

```
button SHOWS    ခွင့်ပြု   Approve
button ANNOUNCES ခွင့်ပြု — Mohinga
```

WCAG 2.5.3 (Label in Name) fails: a speech-input user says the word they can see and hits nothing.
**15 controls across 6 files, in the language the pilot DEFAULTS to** — and under `lang="en"` there
is no defect at all, because Chrome returns a bare text node and both halves are the same string.

- **A default that only one locale exercises is a locale-shaped blind spot.** Every in-session pass,
  every mutant and the whole test suite ran green because the arms that can express the bug are
  exactly `my` + echo. A fixture set that omits the non-default locale is degenerate for anything
  bilingual — and "degenerate fixture" is the same diagnosis `verify:slice` gives for a surviving
  mutant.
- **`aria-hidden` is not the fix, and reaching for it is the tell.** 2.5.3 is about text presented
  VISUALLY. Hiding the echo from the a11y tree leaves it on screen and makes the mismatch invisible
  to tooling instead of absent — trading a detectable failure for an undetectable one.
- **When two modules must agree about what is on screen, one of them must not guess.** The fix is a
  single `chromeVisible(lang, key, echo, vars?)` that both the renderer's test and the label module
  read, pinned two-way: every rendered part appears in the derivation, and striking them out leaves
  only separators — so it can neither miss a visible word nor invent one.

## #90 — "unenforced" and "correct" are different claims, and the second one is the one to check (pilot P2 PR B, 2026-09-06)

The same review filed `al()`'s `subject` arm as a HIGH because the guard could not enforce it. True —
a subject is a runtime string, not a key, so no static rule can match it. But the interesting question
was never whether the rule covered the arm; it was whether the one shipped call site was RIGHT. It
was not: the register queue row renders two `echo="inline"` Chromes and built its subject from
un-echoed lookups, so the row showed `လမ်းလျှောက်လာ · Walk-up` and announced neither English half.

**An unenforced rule is a place to go LOOK, not a place to note.** The finding said "nothing checks
this"; five minutes of computing what that call site actually produces turned it into a second live
defect of the CRITICAL's exact shape. When a review tells you a rule has no teeth, the follow-up is
to hand-check every site the rule would have covered — there is usually exactly one, and it is
usually why the gap was never noticed.

## #91 — a guard whose red-first proofs are one-time hand probes is a guard with no test (pilot P2 PR B, 2026-09-06)

Eight rules, ~1300 lines, every falsification claim in the header written as fact — and each proved
exactly once, by inducing the violation, watching it go red, and reverting. Nothing re-ran them. A
refactor that quietly disarmed `verbKeyOf`, `rendersKey`, `contradicts` or `splicedText` would turn
all eight into a no-op with CI green: the precise failure the guard exists to prevent, in the guard.

The fix that fit: **fixture pairs INSIDE the guard, run on every invocation** — for each rule, a
source it MUST find plus a near-miss it must not. Not a separate suite, because `check:staff-lang`
already runs in CI's fast lane and a suite nobody points at this file is a suite that rots. Proved by
disarming three matchers in turn (1, 3 and 1 self-test failures).

Two things fell out immediately, which is the argument for writing them at all:

- **The near-miss half earns its keep first.** My "clean" rule-3 fixture tripped a _different_ rule-3
  clause (`sx()` on an element with visible text). A rule that fires on the correct shape teaches
  everyone to skim it, and only a near-miss catches that.
- **Making a rule testable exposes what it reads that it shouldn't.** `mountsSwitchHere` still did a
  `readFileSync` its parse no longer needed, so it returned `false` for any in-memory fixture —
  dead I/O that no on-disk run could reveal.

## #92 — `pgrep -f` matches the command line you are typing, so the pre-commit check cries wolf exactly when it matters (pilot P2 PR B, 2026-09-06)

CLAUDE.md prescribes `pgrep -f "[v]erify-slice"` before any commit, because committing during a
`verify:slice` run snapshots a deliberately-broken module (LEARNINGS #74, and #250 shipped it). The
bracketed first character stops the pattern from matching its own `pgrep`. It does **not** stop a
SECOND mention of the string in the same command line:

```
git add scripts/verify-slice.mjs && pgrep -f "[v]erify-slice" && …   → matches your own shell
```

Measured: it reported LIVE with **zero** runs going, because the bash process's `args` contained
`scripts/verify-slice.mjs` from the `git add`. And that is the single most likely command to run it
in — you edit a mutant, then stage the file that holds the mutants.

**Why it is worth more than a one-line fix:** a false positive here is not neutral. The correct
response to "LIVE" is to _not commit_, so a check that fires spuriously either blocks real work or,
worse, gets waved through — and once you have waved it through once, it no longer protects you on the
run that is genuinely live. A guard you have learned to overrule is weaker than no guard, because it
carries the feeling of having checked.

Match the PROCESS, not the string:

```
ps -eo pid,comm,args | awk '$2=="node" && /verify-slice\.mjs/'
```

`comm` is the executable, which your shell can never satisfy. Same shape as the repo's other
guard lessons: bind the assertion to what actually runs, not to text that mentions it.

## #93 — the `pgrep` bracket trick is defeated by your own message (pilot P3, 2026-09-05)

CLAUDE.md says to run `pgrep -f "[v]erify-slice"` before every commit, bracketing the first
character so the pattern cannot match the shell running it. It returned a PID on a checkout where
nothing was running, and the reason is the rest of the same command:
`pgrep -f "[v]erify-slice" || echo "no verify-slice running"`. The bracket protects the PATTERN; the
**echo message carried the literal string**, so the wrapper's command line matched it. The harness's
`eval '…'` re-quoting puts the whole line in one process's argv, which makes every mention count.

A false positive here is expensive in exactly the wrong direction: it says "a run is live" when none
is, and the correct response to that reading is to NOT commit. So the check is only trustworthy with
a second step — `ps -o pid,etime,cmd -p <pid>` on whatever it returns. A PID that no longer resolves
is the tell. Never put the guarded string anywhere else on the line.

> Merge note (#261 ← #260): **#92 above is the same defect found independently**, and it
> carries the stronger remedy — match the PROCESS (`ps -eo pid,comm,args | awk '$2=="node" &&
/verify-slice\.mjs/'`), which a shell can never satisfy, instead of policing what else is on
> the line. Use that form; this entry keeps the `eval`-requoting mechanism that explains WHY the
> bracket trick fails.

## #94 — a docs guard can PRINT a number it never checks (pilot P3, 2026-09-05)

`check:docs` measures five truths and enforces them through ten phrasings. Its clean message read, on the day
this was written, `clean (98 files, 1554+140 tests, 384 mutants)` — and **`98 files` is not one of
the five**. (Quoted as a point-in-time record on purpose: the test and mutant figures in it moved
within the same PR, and a war story that keeps refreshing its own numbers teaches the wrong lesson —
the guard's own message is where the live values live.) Nothing
asserts the tracked-markdown count, so `docs/HANDOFF.md` quoted `97 files` for a while: a number the
script emits, in a doc the script guards, that the script cannot see.

Two more on the same line were invisible for narrower reasons: `(1512 + 140 today)` needs the digits
adjacent to the words `qr tests` for the rule to fire, and `76 in all` needs the words
`money/authority` beside it. Both are LIVE-state claims wearing a shape no rule matches.

So: refreshing "what the guard names" is not the same as refreshing the line. When you edit a line
the guard reports on, read the WHOLE line and derive every number on it the way `measure()` does.
And the corollary for the guard itself: a value worth printing in the clean message is a value worth
asserting — printing it is a claim.

## #95 — a full Supabase-shaped Postgres is available here without Docker (pilot P3, 2026-09-05)

`supabase db start` needs Docker, which the agent environment does not have — and that has meant SQL
tests shipped unrun, with CI as their first execution. It does not have to. PostgreSQL 16's server
binaries are installed (`/usr/lib/postgresql/16/bin`), and the whole 98-file migration stack applies
in order against a hand-built prerequisite layer: the `auth` / `extensions` / `realtime` schemas,
`pgcrypto` + `pg_trgm` in `extensions`, the `anon` / `authenticated` / `service_role` roles, a stub
`auth.users` (id · email · **email_confirmed_at** · raw_app_meta_data · is_anonymous), `auth.uid()`
and `auth.jwt()` off `current_setting`, and `realtime.messages` + `realtime.topic()`.

Two traps. `initdb` refuses to run as root, so it must go through `su postgres` — and the session
scratchpad is `drwx-----x` under a `drwx------` parent, so the postgres user cannot traverse to it
no matter what `PGDATA` is chmod'd to. Put the cluster somewhere that user can reach and delete it
after. The payoff is the rule the repo cares most about: every assertion in a new
`supabase/tests/*.sql` can be **induced red and watched fail** before it ships, which is otherwise
impossible here.

## #96 — the promo QUOTE and the promo CHARGE diverge, but not for the reason the comment said

`mms_promo_check` (the apply-time quote) and `mms_promo_discount_live` (the pricing-time derivation)
look like they should differ on voided and comped lines. They do not, and have not since
`20260622060000_voids_comps.sql` gave BOTH the same
`where ci.cart_id = … and ci.state <> 'voided' and not ci.comped`. A comment asserting that
difference shipped in a first draft of `lib/staff-promo.ts` and was caught by re-reading the SQL.

The conclusion it supported survived on two OTHER mechanisms, both real: `mms_promo_discount` returns
`promo_granted_cents` **verbatim** whenever the pin is set (M70) and the quote never reads the pin;
and `computeTotals` clamps reward-first, `min(promoRaw, max(subtotal − reward, 0))` (M22), so a
reward covering the basket takes the delivered promo to 0 while the quote stays whole. Right answer,
wrong mechanism — and the mechanism is what the next reader acts on, which is why "verify every
finding against source" cuts both ways: toward the reviewer's claims AND your own.

## #97 — `git checkout --` is not an undo for a red-first probe (pilot P3, 2026-09-05)

The red-first rule says induce the violation, watch it fail, restore. The obvious restore is
`git checkout -- <file>` — and it restores the file to **HEAD**, not to what was on disk a moment
ago. On a file carrying uncommitted work that is not a restore, it is a delete: one probe loop
falsified two guards correctly and silently threw away every edit made to `apps/qr/lib/staff-promo.ts`
and `apps/qr/lib/i18n/staff.ts` in the preceding hour.

The damage was not the lost hour. It was that the FOUR probes after it kept "going red" — against
the HEAD version of the module, with the new suite, so every one of them was a failure of the
revert, not of the guard under test. Four green-for-the-wrong-reason results in a row, in the
mechanism whose entire job is to tell green from green-for-the-wrong-reason.

So: `cp <file> <backup>` before a probe loop and `cp <backup> <file>` after, and end the loop with
`git diff --stat <file>` plus a green run to prove the restore. And the general form, which is the
part worth carrying: **a probe that cannot prove it restored has not proved anything it measured
afterwards.** A red result is only evidence if the baseline it was measured against is the one you
think it is.

## #98 — closing a pre-existing window on ONE door can be a net regression (pilot P3, 2026-09-05)

A blind auditor found a real hole: a Stripe Terminal charge is invisible to every cart-level money
gate (`linkPaymentIntent` has one caller, `terminal.ts` writes no `qr_carts` column, no share row, no
single-pay lock). Its only guard is the settlement freeze, kept alive by a CLIENT-side poll. The fix
looked obvious and was applied: make the new staff promo doors `settle_at IS NULL` instead of the
TTL-aware disjunct every other writer uses.

The deep pass rejected it, from three independent triggers, and the reasoning generalises. `settle_at`
is nulled only by a CLEAN release, so the abandoned states are reachable and ordinary: a party that
taps "Split the bill" and then pays cash (`abortSettlement` has exactly ONE caller — the diner's own
host UI), or a terminal decline whose `releaseSettlementFor` write fails, which both call sites drop
deliberately because _"the TTLs above are the real backstop"_. In all of them the strict predicate
refuses both doors for the LIFE of the cart — while the component's `canWrite` stayed TTL-aware and
rendered the controls ENABLED, so the register taps forever against "Someone's paying" for a payment
that already died. It also re-opened the very item the slice existed to close: the merge refusal says
"remove it here first", and the remove was the thing refused.

And the window it closed was never this door's. `acquireSettlement` deliberately re-acquires on a
stale freeze (`lock.ts:128`), so `settleCash` already TAKES MONEY in exactly that state; `clearTable`
cancels the cart there; `applyPromo` writes there. Tightening the lowest-money door in a set of five
that share an exposure buys nothing measurable and costs a reachable dead end.

Three rules out of it:

1. **Before tightening one writer past its peers, enumerate the peers.** If the others stay open, the
   exposure is unchanged and the asymmetry is pure cost.
2. **A predicate with no TTL has no backstop.** Ask what nulls the column, and what happens when
   nothing does — every state that reaches "forever" is a dead end you are choosing to ship.
3. **Check the ENABLED state against the new refusal.** A control that renders enabled and always
   refuses is worse than one that renders disabled, because it teaches staff the console is broken.

The honest close is to make the terminal tender RECORD its PaymentIntent on the cart, which closes it
for every gate at once — filed as OPEN-ITEMS P3b (high) rather than half-done here.

## #99 — a component test that jsdom CAN answer is worth more than one it cannot (pilot P3, 2026-09-05)

`StaffLangSwitch`'s source carries a ⚠️ about a defect it shipped: disabling the button just tapped
drops focus to `<body>` in a real browser, and **jsdom does not reproduce that**, so its suite's
"keeps focus on the tapped button" assertion was green over a live keyboard bug.

The reflex when repeating that fix elsewhere is to write the same focus assertion again. Don't. Assert
the STRUCTURE that decides it — sweep the rendered container for `[disabled]` and expect zero — which
jsdom answers honestly, and which covers controls added later without editing the test.

Two things that only showed up on the falsification run, and both are the same mistake:

- The sweep must run **while the control is busy**. `disabled={false}` renders no attribute at all, so
  a resting sweep passes against a `disabled`-using component. Hold the action's promise open.
- The re-entry guard had to be falsified on the **Remove** button, not the apply. The apply is a
  `<form onSubmit>` whose handler already refuses re-entry, so mutating the ref guard there changed
  nothing — the test was green in both directions. The Remove button is a bare `onClick` beside
  `aria-disabled`, which does not block a click, and it is the only place the guard is load-bearing.

Same lesson as #97 from the other side: a guard is only evidence once you have seen the exact edit it
exists to catch turn it red.
