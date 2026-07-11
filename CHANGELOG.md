# Changelog

All notable changes to **MMS Platform**. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this repo tracks milestones (see [`ROADMAP.md`](ROADMAP.md)), not semver releases yet.

## [Unreleased]

### Added — J3: the wait, designed (2026-07-11)

- **Table timeline** (`TableTimeline` — `TimelineStrip` + `MenuTimeline`): a slim ambient strip on the menu header and the checkout review step narrating the kitchen's REAL taps — `fired → in_progress → served` are literally KdsBoard's Start/Ready buttons, so "Mohinga is being made" is the kitchen's own word, never a guess or a fabricated ETA. Plate-count line ("2 with the kitchen · 3 cooking · 3 served", qty-weighted), a dessert/tea invitation when everything's served, and a quiet "ready to settle up?" pointer once the table's been idle ~20 min post-serve (client-observed serve time — the schema stores no `served_at`; the copy stays "when you're ready", never presumptuous). The strip is deliberately **not** a live region: the one-live-region-per-view rule holds (kitchen flips are glanceable ambient state, the same discipline as the never-announced CartBar total).
- **Poor-wifi freshness backstop:** restaurant interiors drop realtime — both cart surfaces now refetch on `visibilitychange` (`TableCartProvider` for the menu mount, `Checkout` for the review-step mount, which also covers pickup carts that have no realtime at all), so a phone that slept through a websocket drop shows the kitchen's current state the moment it wakes (stronger than the planned "reconnecting" label: the strip is never staler than the last foreground).
- **Honest pickup countdown** on `/track`: the slot line gains "in ~N min" (30s tick, shown only within 90 min of the slot) and "any minute now" at the slot — derived purely from the diner's own chosen slot time, dropped entirely once the kitchen marks the order ready/picked-up (the kitchen's word outranks the clock; no fabricated prep ETA) and dropped again ~15 min past an un-actioned slot (an eternal "any minute now" is a claim the app can't keep).
- **Deferred (honest):** the pickup _I'm here_ ping — the "floor channel" is postgres_changes (read-only per-subscriber RLS), not a broadcast channel a diner may publish to; doing it right needs a `realtime.messages` staff policy or an orders column, i.e. J5's migration window (this track's one migration).
- **Adversarial review fixes (1 HIGH, 2 MED):** the settle nudge's "order" link now carries the server-issued `?cart=` id (a bare `/cart` renders the not-available placeholder — the nudge's one action was a dead end) and falls back to linkless copy when no id exists; the checkout dessert line's menu link now carries the session `mode` (a bare `/menu` defaults to scan-&-go and would strand a dine-in diner's dessert order in a phantom per-device cart); the `Checkout` visibility refetch above was itself a review finding (the strip's freshness claim only held for the menu mount). Also from review: invitations go quiet on a locked/settling cart (the menu can't accept an add and the bill is already in motion), and the checkout strip reads the optimistic view so a "Make it now" tap and the narration agree instantly.

### Added — J2: arrival beat + guided start (2026-07-11)

- **Arrival beat** (`ArrivalBeat`) — the first branded moment after the scan: a bilingual greeting (မင်္ဂလာပါ Mingalaba ✦, real `lang="my"` content in the Padauk face, not decoration) + one mode-aware place-setting line. Dine-in party copy comes from **live presence** ("3 of you at the table — order together, settle together") — never a fabricated table number (sessions carry no human table label). The once-per-session beat composes with J1's `SurfaceMemory` for free: it premieres on the session's first menu visit and lands settled on revisits.
- **"Start here" band** (`StartHereBand`) — the guided opening for first-timers: a horizontal rail of the top-6 dishes tables actually love, each card opening the same item sheet as a menu row. Hidden the moment the diner is _finding_ (search text or a diet filter active). Curation is real data first, honest fallback to `popular`-tagged items while order history is thin.
- **"Table favorite" badge — the `popular` tag goes data-backed.** `lib/menu/mostLoved.ts` is a counts-only, service-role aggregate over PAID orders (60-day window, ≥2 distinct orders so one party's bulk order can't crown a dish, uuid-only ids so grocery barcode lines are excluded, cached 1h, resolves `[]` on any failure so it can never take the menu down — and no uid/order-id/amount ever leaves the module). When real counts crown an item, "Table favorite" supersedes the hand-set `popular` tag — the truer claim wins, which is `badges.ts`'s founding never-fabricate rule. Menu row and item sheet stay in agreement.

### Added — J1: continuity engine — the route-change grammar (2026-07-11)

- **Route changes are choreographed, not cut.** Client navigation now rides the View Transitions API via `next-view-transitions` (~2KB; works on stable React — Next's native flag needs a React canary, disqualified for a money app; non-supporting browsers keep the instant cut). The grammar: **forward** (deeper into the journey — home→menu→cart→track by depth map) drifts the page in from the right (16px + fade, 240ms), **back** from the left (browser back too, via popstate), lateral cross-fades. The `AppHeader` carries its own `view-transition-name`, so the wayfinding chrome stays put while the page moves under it — one camera move.
- **Two shared-element cuts:** the CartBar subtotal **morphs into the checkout hero total** on menu→cart (the money you're watching never blinks out of existence), and the header order pill **morphs into `/track`'s status chip** (the status you tapped lands as the status you're watching). Names are provably unique per document (CartBar is menu-only; the pill hides on /track; only the review-step total carries the name).
- **Staggers premiere once per session per surface** (`SurfaceMemory` + sessionStorage): returning to the menu mid-meal is turning back to your table, not a re-premiere. Zeroed duration lands content settled — the reduced-motion presentation, nothing hidden.
- **Honest cut revisions:** the planned checkout→track receipt cut is a Stripe full-page redirect (no client transition exists) — replaced by the order-pill cut; the menu item→sheet morph is deferred to J2 because the sheet's existing framer slide-up/swipe-to-close would double-animate against a view transition. Reduced motion: a CSS-level off-switch snaps every transition group (the JS gates can't cover a library-started transition).
- Verified end-to-end: Playwright smoke over localhost (direction stamps `forward`/`back` correctly; stagger memory premiere→quiet across revisits; no new console errors) and the J1 keyframes/classes confirmed present in the **built** CSS.
- **Adversarial review fixes (3 MED):** the `/track` "Refresh" + `/cart` "Reload the split" self-refresh links now `replace` instead of push — a duplicate same-pathname history entry would hang the transition library's popstate handler ~4s on the next browser-back (a stranded recovery path); dynamic mid-session mounts (a newly-scanned grocery line, a guest joining) moved to a new **`.mms-rise`** class so `SurfaceMemory`'s once-per-session gate never kills a landing animation on a revisited surface; the grocery "Check out" push and `JoinTable`'s home→menu push now ride the journey grammar (they'd bypassed it — an asymmetric animated-back/instant-forward).

### Added — J0: journey measurement spine (rubric axes + funnels + baseline) (2026-07-11)

- **`docs/context/RUBRIC.md`** — seven **journey axes** (J-A continuity · J-B progress · J-C effort · J-D emotional arc · J-E dead-time · J-F recognition · J-G recovery), scored per _path_ at the same ≥4.3 bar, plus the honest baseline: dine-in **2.7**, pickup **2.9**, grocery **3.1** — recovery is already world-class (the hardening paid off), continuity/arc/dead-time/recognition are the gap, exactly what J1–J5 attack.
- **PostHog "J0 · Journey baseline" dashboard** (pinned) — four server-side, uid-joined funnels starting at the true scan moment (`session_created` carries `mode` + the diner uid): dine-in scan→add→send→paid, pickup and grocery scan→add→paid, and the headline **time-to-first-add** (median, time-to-convert). Every J-phase PR reports before/after against these. Known limit documented: client events (cookieless anon id) can't join server funnels; the `identify` bridge is a consent-posture decision deferred to J5.
- Visual walkthrough reel deferred: the cloud sandbox's Chromium has no browser egress to the preview — capture locally before J1 merges (noted in `JOURNEY_PLAN.md`).

### Added — Journey track plan (J0–J6): paths over screens (2026-07-10)

- **`docs/JOURNEY_PLAN.md`** — the layer above the (shipped) Richness/World-Class screen work: a diagnosis of why the app still feels assembled rather than choreographed (hard cuts between routes, undesigned arrival/wait/goodbye, catalog-not-guided deciding, no return-visit memory; root cause — the rubric scores screens, not paths), a six-moment journey frame per mode (arrive · decide · commit · wait · settle · return), and seven phased PRs: **J0** journey rubric + PostHog funnels + walkthrough baseline → **J1** continuity engine (directional route transitions + shared-element continuity) → **J2** arrival beat + guided start → **J3** the wait designed from real line states → **J4** settle & goodbye (peak-end) → **J5** recognition (welcome-back · server-re-priced reorder · favorites) → **J6** mode tempo. `ROADMAP.md` gains the 🧭 Journey track section.

### Fixed — Account sign-in recovery for an existing email + past-orders card overflow (2026-07-10)

- **"A user with this email address has already been registered" is no longer a dead end.** When the diner enters an email that already belongs to another Morning Star account, `updateUser` 422s `email_exists` — previously surfaced as a raw error with no way forward. `AccountUpgrade` now detects that (by error code, message fallback) and pivots to a **sign-in recovery** (mirroring the existing Google `identity_already_exists` path): the button becomes **"Send sign-in code"**, which `signInWithOtp({ shouldCreateUser: false })`s the existing account and verifies with OTP type `email` (vs the `email_change` upgrade). Copy stays honest — signing in switches to that account and won't transfer this device's unsaved Stars; editing the email clears the recovery to retry the normal upgrade. Announced through the card's single existing `role="status"` region (no second live region).
- **Past-orders receipt cards no longer overflow on mobile.** The month `<ul>` and the `.history-summary` used implicit `auto` grid columns, so a long nowrap order-summary line sized the receipt card to its max-content (~462px) and blew the account column past the viewport (~117px horizontal overflow at 390px). Both grids now use `grid-template-columns: minmax(0, 1fr)`, so the column shrinks and the summary ellipsizes as intended (verified via a rendered harness: overflow 117px → 0, card 462px → fits).

The menu Add/stepper still felt laggy vs the delivery app: a decrement showed no feedback until the write returned, the whole stepper went **disabled** mid-write (rapid taps blocked), and `setQty` cost **two** server round-trips. All fixed UI-side — pricing stays server-authoritative (the client never re-prices; only the display count is optimistic, never the money total).

- **One round-trip writes.** `setQty` now returns the fresh server-authoritative view (mirroring `addItem`), so `TableCartProvider.setItemQty` applies it directly instead of a second `getCartView` refresh — halving the decrement/remove latency.
- **Instant, race-safe stepper.** The `-`/`+` now update the digit the instant they're tapped (an optimistic delta on **both** directions, not just add) and no longer disable during the in-flight write, so rapid taps stay live. Writes serialize through a per-button queue that threads each op's returned view to the next, so serialized `-` taps each peel a real, still-present line (no stale-read snap-back). The hard freeze (`locked`/`settling`/no-session) still disables the control — only the transient `busy` freeze is gone.
- **Instant cart count both ways.** The provider's optimistic count went from add-only (`pendingAdds`) to a signed `pendingDelta`, so the `CartBar` count drops immediately on a remove too (clamped ≥ 0), reconciling to server truth as the view returns. The subtotal stays server-derived on purpose — a wrong-for-a-moment amount on a money surface is worse than a beat of latency.
- Checkout's own optimistic layer (`applyOptimistic`/`qtyChain`) is untouched; the `setQty` return value is additive, so its `await setQtyAction(...)` call is unaffected.

### Fixed / Added — Rewards reflects sign-in + world-class past orders (2026-07-09)

- **Rewards now updates on sign-in.** The header rewards badge fetched once on `[hidden, orderKey]` and never re-ran on an auth change — and `router.refresh()` re-runs only Server Components, not a client effect — so the "Save your Stars" nudge + Star count stayed stale after an anon→account upgrade until a full reload. The header now subscribes to `supabase.auth.onAuthStateChange` (`SIGNED_IN`/`USER_UPDATED`/`TOKEN_REFRESHED`) and refetches, and also refetches on route change (the webhook may stamp a Star after the diner leaves `/track`). Fixed the Google path's missing refresh too: `AccountUpgrade` now `router.refresh()`es once the OAuth PKCE exchange confirms a real account (`is_anonymous === false`), so `/account`'s RewardsHub isn't stale on the Google return either.
- **Past orders → expandable receipts.** Rewrote `OrderHistory` (still a server component — native `<details>` for free disclosure a11y): orders are grouped by month, each an expandable receipt showing per-line qty · name · modifiers · price and the full server-derived breakdown (subtotal / discount / service / tax / tip / total), plus a `#ref` from the order id and a To-go/Grocery chip. Widened `getOrderHistory`'s `SELECT` (**zero migration** — every column already existed) and added a real "No orders yet → Browse the menu" empty state (the section no longer hides for new diners). Dates/months render in the restaurant's timezone so an evening order never drifts to the next day. Totals are presentation-only (rendered verbatim, never recomputed).

### Added — Wayfinding follow-ups: cart-from-anywhere + live split-tender pill (2026-07-09)

Closes the two v1 boundaries noted when the wayfinding header shipped. Client-nav + a read-only resolver only — no money/auth/RLS/order logic touched.

- **Cart-from-anywhere** — a tiny `CartPublisher` mounted in the menu publishes `TableCartProvider`'s server-minted open-cart id to the wayfinding store (`publishCart`), so the header's off-menu "back to cart" link now works after _any_ menu session, not just after a `/cart` visit. The stored cart id is cleared once an order is captured (it became a placed order).
- **Live split-tender status** — a thin member-gated `resolveSplitOrderId` server action (wrapping the `server-only` `getSplitOrderId`) lets the header pill + homepage resume card resolve a split-tender order's id (which has no PaymentIntent) and show its **live** status ("Confirming → Preparing → Ready") instead of a generic label. Extracted a shared `useActiveOrderStatus` hook (store read + split resolve + `useOrderStatus` + terminal-state retire); its `track` gate also collapses the header/card/tracker to **one realtime channel per route** (retiring the earlier duplicate-subscription nit).

### Added — Persistent wayfinding header + active-order resume + cold-load session fix (2026-07-09)

QR screens were islands connected by ad-hoc links that nearly all pointed one way (→ menu): `/account` was reachable from a single place (the post-payment tracker), `/track` only via the Stripe redirect (close the tab and the order was gone), and there was no persistent chrome. Adds the diner's wayfinding spine. Client-nav + presentation only — no money/auth/RLS/order logic touched; tokens only, no blur/backdrop-filter (mobile GPU budget), ≥44px targets, one live region per view, reduced-motion-gated, light + Night.

- **`AppHeader`** — a slim sticky top bar in the root layout (self-hides on `/staff`): brand→home · a contextual **"Your order · [status]"** pill→`/track` · a **rewards** affordance (✦ Star count + an anon **"Save your rewards"** nudge)→`/account` · an off-menu **"back to cart"** link. Cart is a link, not a live counter (the menu's bottom `CartBar` stays the single source of truth there); the order pill is deliberately not a live region (no double-announce with `/track`).
- **`ActiveOrderProvider`** — a small root-layout client store (React Context) that observes the URL for `mode`/`cart` and captures the live order at the `/track` success landing, persisting to `localStorage`; a 4h TTL retires a resumable order (a pure dine-in order has no `picked_up` done-signal). Live status via `useOrderStatus`; split-tender resumes via `/track?cart=…&paid=1`.
- **`HomeResumeCard`** — the homepage leads with a way back to a live order's tracker.
- **`getRewardsBadge`** — a lean uid-scoped read (Stars + tier + `isUpgraded`) for the header, mirroring `getRewardsProgress`.
- **Cold-load session fix** — `AnonAuthGate` now `router.refresh()`es after a _fresh_ anonymous mint, so a deep-link straight to `/account` re-renders with the session instead of flashing the "couldn't load your rewards" fallback.
- **`--header-height` token** — the menu's sticky `.menu-toolbar` offsets below the header (no double-count of `env(safe-area-inset-top)`).

### Changed — Account, sign-in, order-status & past-orders world-class pass (2026-07-08)

Extends the checkout craft language (paper-sheen lip · accent lift · gold warmth · textured slips · quiet-nav vocabulary) to the account/rewards hub, the anon→account sign-in card, the `/track` order-status states, and post-order navigation — so the surfaces a diner reaches _after_ ordering match the checkout bar. Presentation only — auth/rewards/order logic untouched; token-pure (only the sanctioned Google brand mark uses literal color), no blur/backdrop-filter (mobile GPU budget), 60fps, every animation reduced-motion-gated.

- **Account masthead** — an editorial `✦ Mandalay Morning Star` kicker + "Rewards & account" display title + a gold hairline that fades to nothing, above the (already-rich) reward cards; a quiet "← Back to menu" nav-link closes the page.
- **Sign-in card** — primary buttons adopt the `.checkout-cta` gold-warmed clay gradient (+ sheen lip + one-sweep shine); a branded **Continue with Google** button carries the official Google "G" (matching `StaffLogin`); inputs become calm inset fields that bloom an accent focus border; a labeled fading-hairline divider separates the paths; the card is textured.
- **Past orders** — each order is now a lifted "receipt" slip (top-lit fill + sheen lip + hover deepen) with a tender **badge** pill (`✓ Paid · Card`), tabular totals.
- **Rewards wallet** — earned-reward coupons become **gold-wash tickets** with a punched notch on each edge; the lifetime-spend stat gains a sheen lip + faint gold warmth.
- **Order status (`/track`)** — the static confirmation states (payment received · processing · unsuccessful · direct-visit stub) are now elevated textured panels headed by an icon **medallion** (a warm caution medallion for the failure state), instead of naked text; the live tracker's footer + all "back / view rewards / refresh" links adopt the shared **quiet nav-link** vocabulary (accent, ≥44px, underline-wipe + arrow nudge).

### Fixed — Account upgrade: graceful `identity_already_exists` on Google link (2026-07-08)

When a diner tapped "Continue with Google" on `/account` and picked a Google account **already linked to a different Morning Star account**, `supa.auth.linkIdentity` bounced back to `/account?error_code=identity_already_exists…` with a `422` on `/auth/v1/user` — and nothing read that callback error, so the diner saw a raw error URL and a dead end. `AccountUpgrade` now reads the error from the query (via `useSearchParams`, derived — not a `setState`-in-effect), shows an honest message, cleans the URL (`replaceState`), and switches the Google button to a **sign-in recovery** (`signInWithOAuth`) so they reach their existing account and its saved rewards instead of re-attempting a link that would fail the same way.

### Changed — Checkout-surface cohesion: line cards, receipt, promo/reward, split board (2026-07-08)

Extends the #105 pill/sheen/lift/glow craft language across the rest of the checkout surface. Presentation only — money/lifecycle logic untouched; token-pure, no blur/backdrop-filter (mobile GPU budget), 60fps, reduced-motion-gated.

- **Line-item cards** — a soft shadow-_deepen_ on hover (no translate, so the stepper + destination pills never slide under the cursor); the per-line price now **rolls** (`NumberFlow`) as the optimistic qty changes.
- **Receipt slip** — a dotted **leader** runs from each breakdown label to its amount (the iconic receipt cue), drawn by a decorative flex spacer between `<dt>`/`<dd>`.
- **Promo + reward** — the promo input blooms an accent border on focus (keeps the global focus ring); **Apply** becomes an accent pill; the reward affordances gain hover-lift, and the **reward-applied** row is a warm gold-wash pill with a one-sweep shimmer.
- **Split** — the Evenly/By-person toggle reuses the `.checkout-pill` segmented language; "Split & pay separately" is an accent pill.
- **Settlement board** — a live **progress bar** (gold→clay) fills as shares are authorized (real `paid/total` values); settled share rows get a warm accent left-edge; the "Paid" badge gains a gold halo.

### Fixed — Checkout `create-intent` 409 (cart-lock acquire 42703 on PostgREST 14) (2026-07-08)

`POST /api/stripe/create-intent` returned **409 (Conflict)** on every attempt — checkout was fully broken
in production. Root cause: `acquireCartLock` / `acquireSettlement` (`apps/qr/lib/lock.ts`) built the atomic
conditional UPDATE with `.select("id")`, which sends `Prefer: return=representation`; under PostgREST 14
(Supabase's recent platform upgrade) a mutation with that header re-applies the top-level `or()` logic-tree
against the `RETURNING` projection, so `qr_carts.locked` fell out of scope and the UPDATE 400'd with `42703`
(undefined_column). Both functions swallowed the error, read 0 rows, and returned `held_by_other` /
`settling_other` → a spurious 409. Fixed by counting affected rows via `{ count: "exact" }` (no
representation) and surfacing the error (honest 500) instead of masquerading a query failure as a lock
conflict. Verified against live PostgREST. Pure code change — no schema migration.

### Changed — Checkout: organized pill actions + optimistic cart selections (2026-07-08)

- **Action hierarchy** — the four competing full-width buttons (Send to kitchen · Continue to payment · Keep tab open · Secure your tab) become **one hero pay CTA** with the tab options demoted into a labeled **“or settle later” pill tray** (Keep tab open · Secure your tab). Send-to-kitchen stays a distinct pre-pay action by the food. Clear primary-vs-secondary hierarchy.
- **Pill vocabulary** — a shared `.checkout-pill` system (full-radius, textured, press-settle, accent glow, reduced-motion-safe): per-line **For here / To go** is a segmented pill toggle, **Make it now** an accent-outline action pill, and the settle-later tray pills reuse the same language. `SecureTabButton` gains a `compact` tray-pill mode whose card form expands full-width below the row.
- **Optimistic cart selections** — qty stepper, For-here/To-go re-route, and Make-it-now now reflect **instantly** (React 19 `useOptimistic` overlay) instead of waiting on a server round-trip + `refresh()`; the server action reconciles underneath and corrects a refused edit. Money stays server-authoritative — only per-line qty/destination/state flip optimistically; the totals receipt reconciles on refresh.
- **World-class craft pass** — layered pill surfaces (paper sheen lip + top-lit fill), a lit lifted selected cap with a warm gold **halo** glow (fill stays clay so `--oa` cream text holds AA — no gold-under-text trap), hover-lift + press-settle micro-interactions, a **recessed tray** with a fading-hairline divider, and a premium primary CTA (`--ac`→`--ac-strong` depth gradient, a one-sweep diagonal shine, a nudging arrow) shared by both _Continue to payment_ and _Pay_. Transform/opacity/box-shadow/gradient only — no blur/backdrop-filter (mobile GPU budget) — 60fps, every animation reduced-motion-gated.

### Changed — World-class UX: the full craft pass (menu · cart · checkout · track · grocery · staff · rewards · split) (2026-07-02)

The whole app taken through the world-class bar (`docs/WORLD_CLASS_UX_PLAN.md`), each slice gated +
adversarially reviewed (verdicts on PR #104). Presentation-only throughout — money/lifecycle logic untouched.

- **Layering system** — a z-index **token scale** (`--z-toolbar < --z-scrim < --z-sheet < --z-toast <
--z-alert/confetti < --z-tierup`) replaces scattered hardcodes; sheets paint **above** the sticky menu
  toolbar (root-fixes drag-to-close being stolen); one `--scrim` token both themes (tier-up no longer a light
  wash on Night); sheets get an inset `--sheen` paper lip; toolbar gains a hairline + shadow.
- **Snappy** — optimistic add-to-cart (instant Add→stepper morph; staff add "Added ✓" likewise), `/cart`
  prefetched from CartBar + grocery, `loading.tsx` skeletons for cart / account / staff floor / table
  drill-down / all four consoles, bump/approve buttons hold their pending state through the refetch.
- **Flowing** — item-sheet upsell swap scrolls to the new item's hero + moves focus; `/track`'s rail fill
  flows down as the order advances; scanned grocery lines + settlement shares + order history + guest
  avatars rise in (`.mms-stagger`, keyed — no re-animation); active menu tab centers in its rail + lifts
  (`--sh-lift`, unclipped).
- **Textured layers everywhere** — checkout receipt + `/track` paid summary + drill-down/staff-add/KDS
  cards + settlement rows + rewards hero/tier + invite code card all on `.card-textured`.
- **Focus seams closed (WCAG 2.4.3)** — checkout view changes (incl. the realtime settling flip),
  reward apply/remove, account-upgrade steps, feedback submit, staff drill-down void/comp/approval swaps
  (edge-triggered catch-all), console bump-offs, refund success; feedback stars are honest `aria-pressed`
  toggles (were arrow-key-less fake radios); redundant `aria-live` on `role="status"` swept app-wide.
- **Pickup date picker** redesigned: day-selector cards + a responsive time grid (was a flat chip stack).
- **Reachability** — `/account` (the rewards hub) gains its first diner-facing link, on `/track`.

### Added — World-class UX: homepage proof + type-scale + wordmark identity (2026-07-02)

First slice of the world-class UX initiative (`docs/WORLD_CLASS_UX_PLAN.md`) — elevate the editorial/Night
language, starting with the flagship entry screen as a proof-of-direction.

- **Type-scale tokens** (`@mms/ui/tokens.css`, additive) — `--fs-display/-h1/-h2/-h3/-body/-sm/-xs`,
  `--lh-*`, `--track-*`, `--w-content`, `--s10/--s15`. Retires inline magic font-sizes. Contrast-audit
  (41 tests) unaffected — no color token changed.
- **Wordmark identity** — the homepage hero replaces the **☕ emoji** with the **✦ Morning Star mark**
  (brand gold, reframed inside the existing glow + draw-on ring + parallax) and renders **"Mandalay Morning
  Star"** as a real Fraunces **display wordmark** (was a tiny uppercase eyebrow). Strings verbatim.
- **First brand assets** — `apps/qr/public/icon.svg` (the ✦ mark) wired as the favicon + OG metadata
  (QR had no `public/` before).
- **Grid discipline** — homepage spacing now all `--s*` tokens (was `60/24/22/13/20/16/440` magic numbers);
  `text-wrap: balance` on the wordmark (no widows).
- **`themeColor` fix** — `#fffaf2/#0f1115` → the real `--pg` values `#faf9f5/#171221` (killed the Night
  status-bar seam; audit U-Q5).

### Fixed — Holistic audit: money/security remediation (2026-07-02)

Cross-repo adversarial audit (`docs/HOLISTIC_IMPROVEMENT_PLAN.md`). The QR-side confirmed fixes:

- **Merge re-charged voided/comped lines (HIGH regression).** `mms_merge_table_orders` lost its S2.3 void/comp
  fold guards when `20260623030000` restated the body (later rebased by R5c `20260629120000`) — a table merge
  folded a voided/comped source line's qty into an active target, re-charging diners for a $0'd line.
  `20260702000000` restates the fn as the **union** of every prior guard (source `state <> 'voided' and not
comped`, target same-state + void filter + `by_seat is null`, both-sessions-active, S5 approvals-supersede)
  - the S3 secure-tab refusal + trust carry-forward. Signature unchanged → no types drift.
- **Split-payer double-charge race (HIGH).** `create-share-intent` overwrote the share row with `.eq("id")`
  only, so a concurrent capture webhook between the status read and the write was reverted to `pending`
  (orphan capture + pay-twice). The update now guards `.in("status",[pending,failed,canceled])` + optimistic
  PI-id match, `.select("id")` to detect 0 rows → cancel the new PI + 409.
- **Fire-at-checkout backstop never covered card/split (HIGH).** `mms_reconcile_settled_fulfillment` scans
  `cart_id is not null`, but only the cash fulfill stamped it. `20260702000100` stamps `cart_id` in the card +
  split `qr_orders` inserts (partial-unique is cash-scoped; card is PI-idempotent → one insert) so the pg_cron
  backstop fires their draft food / inits togo / snapshots EBT.
- **Grocery insert PUBLIC EXECUTE (LOW, latent).** `20260702000200` adds the missing `revoke … from public`
  on `mms_cart_item_insert_if_open` (LEARNINGS #58; RLS denies today).

⚠️ The three migrations need live-apply + advisor check + a money-path smoke before merge.

### Added — Richness R9b: homepage hero (maximal) (2026-07-01)

The "morning coffee" signature moment behind the mode picker — the final Richness slice.

- **`HomeHero`** (new) — ☕ glyph over a radial-gradient glow (no blur), a draw-on SVG ring, rising
  `.mms-steam` wisps (`useInView`-paused offscreen), and **multi-layer pointer/gyro parallax**
  (`useHeroParallax`: glyph leads, glow/ring trail) — **device-tier-gated** (zeroed on `low`) + reduced-motion
  gated. Staggered header lines. All decorative layers `aria-hidden`; heading/copy stay the accessible content.
- **Homepage** (`app/page.tsx`) — a fixed masked dot-texture backdrop (`.home-bg`, no blur) behind the
  transparent `<main>`; the ModeCard stagger finished (grocery `index={4}`).
- **`globals.css`** — R9b `.home-hero*` / `.home-bg` + `homeHeroRingDraw`; radial-gradient/stroke/transform
  only, ring draw-on reduced-motion-gated.

### Added — Richness R9a: staff-board live-notice (2026-07-01)

Brings **full-but-informative** richness to the staff boards (owner overrode the plan's "restrained" for ops
surfaces; the perf/a11y/honesty guardrails still hold). The signature: a saturated server registers a change
**peripherally** — event-driven only, no idle loops behind live data.

- **`LiveMoney`** (new) — a running subtotal that ROLLS (NumberFlow) + FLASHES directionally on change
  (accent up / muted down); self-contained prev value; reduced-motion gated; real cents only (display-only).
- **`StaggerList`** (new) — shared `role="list"` with framer card-enter on arrival + exit on removal, keyed
  so only added/removed items animate; stagger capped at 500ms; reduced-motion → no enter/exit. Adds no live
  region.
- **Floor** — FloorBoard diffs table status → a one-shot ring pulse on a just-changed `TableCard`
  (`interactive`+`textured`, subtotal via `LiveMoney`); FloorDetailLive subtotal → `LiveMoney`.
- **KDS / Expo / Approvals / Orders** — routed through `StaggerList`; `card-textured` surfaces; primary
  actions get a `.staff-btn` press. Each board keeps its single existing live region.
- **`globals.css`** — `.floor-live*`, `.floor-card-pulse`, `.staff-btn` (+ keyframes), all transform/opacity/
  color + one-shot box-shadow, every one with a reduced-motion off-switch. No blur/backdrop-filter.

R9b (maximal homepage hero) follows.

### Added — Richness R8: real Stars on /track + the rewards hub (2026-06-30)

Retires R7a's placeholder `gems = round(total)` display rule for the **real loyalty Stars**
(`mms_rewards_summary`: 1 paid order = 1 Star), and brings the signature rewards flourishes to the two
honest-but-plain surfaces. All motion is CSS `@media (prefers-reduced-motion)`-gated (no `shouldAnimate`
first-render race); rewards are server-derived and the earn-claim is gated on real attribution.

- **/track** — the pay-success pill now shows **"✦ +N Star(s) earned"** (the real per-order earn) + an
  honest **"N order(s) to your next reward"** caption. New `getRewardsProgress(orderId?)` server action
  fetches the milestone summary race-correct (once the order has landed → the webhook counted it) and
  server-checks `earned_by === auth.uid()`, so a split-tender **non-host** share-payer (who earns nothing —
  only the host does) never sees a Star they didn't get; no session → no claim.
- **Stars ring** (`StarsRing`, new) — a 148px SVG `stroke-dashoffset` progress ring over the real milestone
  cycle, pure-CSS draw-on, `✦{stars}` rolling via `NumberFlow`, one composed `role="img"` label.
- **Tier-up celebration** (`TierUpCelebration`, new) — fires once on a genuine tier climb (`localStorage`
  last-seen-rank compare; first sight/revisit/downgrade stay silent), rAF-deferred reveal, reused confetti,
  `role="status"`, ≥44px dismiss.
- **RewardsHub** (`/account`) — flat bar → the Stars ring hero; `NumberFlow` on stars + lifetime spend; a
  CLS-safe tier-ladder entrance (no hover-lift — the rungs aren't interactive) with a soft glow on the
  current rung; an **honest "How it works"** panel (earn a Star / a reward every N Stars / climb the tiers)
  that replaces the prototype's fictional perk grid (free milk tea / snacks / birthday — not deliverable;
  `isEarlyAccess` has no consumers).
- **`globals.css`** — `.stars-ring*`, `.reward-rung*`, `.tier-up*` + keyframes, all transform/opacity/stroke
  with reduced-motion off-switches (built-CSS grep confirms emit).

### Added — Richness R7b: checkout review/pay polish (2026-06-30)

Brings the checkout review + pay surfaces up to the celebration's bar (R7a). All motion is CSS
`@media (prefers-reduced-motion)`-gated (not the `shouldAnimate` hook — applying the R7a reduced-motion-race
learning), and money stays presentation-only / server-authoritative.

- **Tip chips** — press settle + a smooth tint/preview transition when the rate changes.
- **CTAs** — Continue / Pay get an accent glow (`--sh-glow`) on hover + a press settle; Edit gets a quiet
  hover + press.
- **Cart lines** — `card-textured` (a richer layered surface; deliberately _not_ `card-interactive`, which
  would imply a clickable affordance the line doesn't have).
- **Order summary** — the grand total reads as the hero figure (hairline divider + display serif + larger).
- **Step transition** — the review ↔ pay change enter-slides via a keyed CSS-animated wrapper; the Stripe
  Payment Element mounts with the wrapper and the enter is a transform, so the card iframe never reloads
  (appearance is mount-time). The always-mounted `<h1>` stays the focus target.

### Added — Richness R7a: pay-success celebration + money-roll (2026-06-30)

The highest-impact single moment: a pay-success "thunk" on `/track` and rolling money. (R7b polishes the
checkout review/pay surfaces next.) The Payment Element hard-redirects to `/track?...&redirect_status=succeeded`,
so the celebration lives there (gated by a new `OrderTracker` `justPaid` prop; split-tender `paid=1` too).

- **Pay-success celebration** (`PaySuccess` + `Confetti`, new) — a draw-on SVG checkmark (`pathLength`) +
  **"Paid — thank you!"** + a **"✦ +N gems earned"** pill, with a one-shot confetti burst + success haptic
  (`[10,40,18]`). Confetti is bespoke (≤90 CSS-animated transform/opacity spans, token gold/jade/clay, no
  blur) and gated on `shouldAnimate && useDeviceTier()!=="low"`; reduced-motion drops the confetti + leaves the
  checkmark at rest. No new live region — the tracker's single `role="status"` carries the spoken confirmation.
- **Gems** = `round(total)` — a deterministic display rule (≈1/$) over the **real paid total**, shown once the
  order lands; not a fabricated/persisted balance.
- **NumberFlow money-roll** — the `CartBar` subtotal and the Checkout `Total`/`Estimated total` row now roll as
  the amount changes (currency format, snaps under reduced-motion). Static `aria-label` kept so the amount
  isn't re-announced per tap. **Money stays presentation-only / server-authoritative — totals math untouched.**

### Added — Richness R6b: item detail sheet — modifiers · live price · upsell · photo-hero (2026-06-30)

Tapping a menu row opens a detail bottom-sheet (the `@mms/ui` `Sheet`, R5b swipe-to-close + Radix focus
trap/restore) — the customize moment. Modifier groups are loaded **eagerly** with each item in the RSC (most
items have none), so the sheet renders + previews instantly with no client round-trip.

- **Modifier groups** — required single-selects (radio) render before optional multi-selects (checkbox),
  driven by `min_select`; native inputs (`accent-color` tokenized) in `fieldset`/`legend` groups; a
  `:has()`-driven selected tint; multi-selects disable past `max_select`. Logic in `lib/menu/modifiers.ts`.
- **Live price — client preview, server-final.** The sheet sums base + selected `price_delta_cents` for an
  instant **advisory** total; on add it calls `add(id, modifierIds)` → `addItem`→`priceItem`, which validates
  the option ids against the item's groups and **re-derives the charge**. The client never sends a price.
- **Required-modifier guard** — the inline quick-Add (which sends `[]`) is replaced by a **"Choose"** pill for
  any item with a required group, so a required choice (e.g. curry style) can't be bypassed (`priceItem`
  doesn't enforce `min_select`). Optional-only / no-modifier items keep one-tap Add.
- **"Goes well with"** — a hardcoded pairing-rules map (`lib/menu/upsell.ts`, no schema change) suggests up to
  3 **real**, in-stock items (category rules → popular → other-category fallback; never fabricated); a tap
  swaps the open item.
- **Photo-hero + honesty** — big blur-up hero (RM-gated), name/MY/description, real badges, and a fail-safe
  allergen note ("Contains …" when declared + the always-on "ask our staff" guide). Sticky Add-to-order CTA
  (disabled + perceivable when sold-out / cart-locked / required choice unmet).

### Added — Richness R6a: menu browse layer — search · category rail · dietary filters · blur-up · badges (2026-06-30)

The flat menu list becomes a browsable surface (R6a; the item detail sheet is R6b). The RSC page now fetches
the catalog (incl. `description_en`, `tags`, `allergens`) and hands it to a client `MenuBrowser` that owns the
search / category / dietary state — data stays server-fetched, only the interaction is client-side.

- **Search** — sticky pill input, live client-filter on EN/MY name + description; `text-base` (≥16px → no
  iOS focus-zoom); labelled "Search the menu"; 🔍 `aria-hidden`.
- **Category jump-rail** — a `<nav aria-label="Menu categories">` of chips (NOT `role="tablist"` — it's a
  scroll-spy jump nav, not switched panels): tap → smooth `scrollIntoView` (instant under reduced-motion);
  an `IntersectionObserver` sets `aria-current` on the in-view category; the rail tracks the filtered set.
  44px targets, lit active / ghost inactive.
- **Dietary filters** — toggle chips (Vegetarian/Vegan/Gluten-free/No nuts/No shellfish), `aria-pressed`,
  jade tint when on. **Fail-safe** logic in `lib/menu/dietary.ts`: a free-from chip excludes any dish that
  declares the allergen AND any dish with **no declared allergens unless `allergen-reviewed`** (unknown ≠
  safe); an inline disclaimer ("Allergen info is a guide — please tell our staff about any allergy.") shows
  only while a free-from chip is active.
- **Blur-up images** (`BlurUpImage`) — `next/image` fades + un-blurs on load over a gradient placeholder;
  `onError` drops the img; transform/opacity/filter only, reduced-motion-gated; no broken-image flash.
- **Badges** — `@mms/ui` Badge for the item's **real** tags only (Popular/Vegan/Vegetarian) — never a
  fabricated "Signature"; sold-out stays a dimmed, disabled row (not removed).
- **Empty state** — one live region (`role="status"`) "Nothing matches" + a "Clear filters" button.

### Added — Richness R5c: menu Add → quantity-stepper morph + per-seat group lines (completes R5) (2026-06-29)

The menu's per-item **Add** pill now morphs into an inline accent quantity stepper (− qty +) once the
viewer has the item in their cart line (the v7.2 prototype's `.add → .stp` morph) — quick re-order and
removal without leaving the menu, **in every mode including dine-in groups**.

- **Group-cart model → per-seat lines.** `insertOrIncLine` now scopes its merge by `by_seat`, so two
  diners ordering the same item get **separate lines** (each owns + manages their own qty) instead of
  folding into one shared line owned by the first adder. This makes the menu morph unambiguous for every
  diner (your Add/stepper always targets your own line, `canMutateLine` own-draft always passes) and the
  by-person split is pre-attributed by contributor. Application-level only — no schema change (no unique
  constraint existed). Solo carts (one seat) are unchanged; a staff "added-by-server" line (`by_seat=null`)
  stays separate + assignable via `assignLine`. Totals/tax are aggregate-identical (summed per line); the
  cart, KDS ticket, and split board show one row per contributor.
  - **Menu tolerates duplicate own lines (aggregate, don't enforce one).** A diner can legitimately hold more
    than one matching own draft line — a host `assignLine` onto an item they already have, a price-snapshot
    difference between two adds, or a concurrent first-add race — and there's deliberately no unique
    constraint. So the menu stepper **sums the viewer's matching lines** (exactly as the cart, split, and
    totals already do) and the `−` peels a line at a time, instead of forcing a one-line invariant via a
    fragile cross-path coalesce. The staff **table-merge** (`mms_merge_table_orders`) still folds only into an
    **unassigned** target line, so a source diner's units never inherit a target diner's `by_seat` (which
    would skew by-person shares). The menu `setItemQty` recovery path now `refresh()`es on failure too, so a
    rejected quick-remove snaps back to server truth instead of leaving a stale line.
- **`AddButton`** finds the viewer's OWN line by `insertOrIncLine`'s exact per-seat keys (item + no
  modifiers + **default fulfillment** + draft + own `by_seat`, not comped) and renders the
  `.mms-qty-stepper` when `qty > 0`. **+** reuses the server-authoritative `add`; **−** calls the new
  `setItemQty` (`qty<=0` removes → morphs back to the Add pill). The in-cart **+** gates on the **live**
  cart `line.soldOut` (fresher than the page-render menu prop).
- **`TableCartProvider`** — new `setItemQty` (`setQty`-backed; server re-derives every amount; authz'd
  `canMutateLine` own-draft-only) re-syncing from server truth with `add`'s session-recovery path; the
  provider now also exposes **`settling`** (split-tender freeze) so the menu controls disable during it.
- a11y: 44px tap targets; `aria-hidden` −/+ glyphs with woven names; an `.sr-only` real quantity (not a
  live region); decrement/removal **announced** via the one live region (WCAG 4.1.3); **focus moves to the
  Add pill on remove** (kept focusable via `aria-disabled` when sold-out, and the move waits for `busy` to
  clear so it lands on an enabled pill — WCAG 2.4.3). Pop/`:active` reduced-motion-gated.

### Added — Richness R5b: Sheet swipe-to-close (first domMax consumer) (2026-06-29)

The `@mms/ui` bottom `Sheet` (Radix Dialog) now drags down to dismiss — the iOS-native expectation,
symmetric with tap-scrim / Esc / the ✕.

- **`DomMaxProvider`** (`packages/ui`) — a nested `LazyMotion` with an async `domMax` loader (drag/layout),
  loaded only when a Sheet mounts (kept off the root chunk; the root stays `domAnimation`).
- **`Sheet`** wraps its Radix `Dialog.Content` in `DomMaxProvider` and renders it `asChild` as an `m.div`.
  Drag is **handle-initiated** (`useDragControls` + `dragListener={false}`) so the body's `overflow-y:auto`
  scroll is untouched — only the grab handle starts a drag; a downward drag ≥120px or a fast flick closes.
  The CSS `up` entrance + scrim/Esc/✕ + focus-trap are unchanged; the public API is identical, so all four
  consumers (PickupSlotSheet, LossActionSheet, InviteSheet, JoinTable) inherit swipe-to-close for free.

### Added — Richness R5a: primitive richness pass (2026-06-29)

Makes the shared primitives feel alive so screens inherit it — all CSS/`domAnimation`-level, opt-in,
reduced-motion-gated, transform/box-shadow only (no `blur()`, mobile-safe glows).

- **`Card`** (`packages/ui`) gains opt-in `textured` + `interactive` props (CSS-only → stays
  Server-Component safe; default off, the 12 existing Card sites unchanged). `.card-textured` =
  printed-matter `::before` (gradient-masked dot-grid, radius-clipped, `pointer-events:none`,
  AT-invisible — restrained on purpose so it doesn't repeat into a pattern down a dense list; the
  `--glow-ac` token is reserved for R7's hero/celebration surfaces); `.card-interactive` = hover
  shadow-lift + press settle (use only on clickable hosts). **Adopted `card-textured` on the menu item
  rows** (depth; not interactive — the row isn't clickable until R6's item sheet).
- **`Stepper`** — a count-bounce on quantity change (the aria-label stays on a stable outer span so AT
  never re-announces; only an `aria-hidden` inner digit replays `mms-pop`) + a press settle on both
  buttons. Both cart + staff-line-editor consumers inherit it.
- **`ModeCard`** (homepage) — `card-interactive` + a `--grad` gradient emoji tile + a staggered
  fade/rise entrance (per-card delay, RM-gated).

### Added — Richness R3+R4: framer-motion (lazy) + interaction hooks (2026-06-29)

The motion engine for the rest of the Richness track, adopted lazily + scoped, with the first consumer.

- **R3 — framer-motion** `^12.26.1` added (`packages/ui` + `apps/qr`); new `MotionProvider` wraps the app
  in `LazyMotion features={domAnimation} strict` (root layout). `domAnimation` async-loads after hydration
  (~18KB gz, never blocks first paint) and covers animations/variants/exit/press-hover-focus gestures;
  `strict` forbids the un-treeshakeable `motion.*` (only `m.*`). `domMax` (drag/`layout`) is **deferred to R5**
  (sheet swipe), loaded only where used. Vitest framer stub deferred — QR's tests are node-env/pure-logic
  (`*.test.ts`), so no jsdom suite imports framer yet; the first `*.test.tsx` adds the stub.
- **R4 — interaction hooks** ported to `packages/ui/src/interactions.ts`: `useTilt`, `useMagnetic`,
  `useHeroParallax`, `useRipple` (re-skinned to QR's `useAnimationPreference`; reduced-motion-gated,
  rAF-throttled, IntersectionObserver-detached offscreen). Carries the delivery caveats (no tilt on a
  CTA-bearing card; no scroll-coupled background parallax).
- **First consumer — `AddButton`** now answers a tap with a reduced-motion-gated `whileTap` spring press +
  a `useRipple` ripple (new `.mms-ripple` utility). Purely presentational; the server-authoritative add
  path is unchanged.

### Added — Richness R2: dark-mode activation (2026-06-29)

The full Night palette existed in `tokens.css` `.dark` but nothing ever set `.dark` on `<html>` — dark
was unreachable at runtime (caught by the M5 audit). R2 activates it, system-driven.

- **Activation** (`apps/qr/app/layout.tsx` + new `components/ThemeSync.tsx`): a **nonce-carrying blocking
  inline script**, first in `<body>`, sets `.dark` from `prefers-color-scheme` before first paint (no theme
  flash) — it carries the per-request CSP nonce (`proxy.ts` strict-dynamic) or it'd be blocked. `ThemeSync`
  keeps the class in sync on a live OS-theme flip. No `next-themes` (QR has no theme picker); the address-bar
  `themeColor` (also `prefers-color-scheme`-keyed) stays in lockstep.
- **Dark bug fixes** (from a verified per-surface audit — rewards & staff surfaces were already clean):
  6× undefined `var(--bg)` (resolved to transparent → card-on-card meld in Night) → `var(--sf)` recessed-field
  token (FeedbackPrompt, OrderHistory, RewardField, AccountUpgrade ×2, MergeTableButton); a hardcoded
  light-theme `boxShadow` on the cart error alert → `var(--sh-md)` (was invisible on the Night page);
  `SharePay` Stripe appearance consolidated to the shared `stripeAppearance()` helper (kills the inline drift).
- **Stripe note:** the Payment Element resolves its theme at **mount** (correct in both themes after
  activation); a mid-session OS flip is deliberately **not** re-keyed — remounting would wipe in-progress card
  entry, a worse regression than a cosmetic stale theme.

### Added — Richness R1: motion + depth token/texture foundation (2026-06-29)

First slice of the 🎨 Richness track ([`docs/RICHNESS_PLAN.md`](docs/RICHNESS_PLAN.md)) — the reusable depth
layer R2–R9 build on. **Additive only** (no existing token or component changed); built on QR's clean token
base, not a port of delivery's accreted `--hero-*` system.

- **Tokens** (`packages/ui/src/tokens.css`, both `:root` and `.dark`): motion (`--ease-in-out`, `--dur-fast`,
  `--dur-slow`), texture (`--tex-dot`/`--tex-line`/`--tex-grain-opacity`), mobile-safe glow stops
  (`--glow-ac`/`--glow-gold`), layered surfaces (`--surface-glass`/`--surface-vellum`/`--surface-elevated`,
  `--sheen`, `--sh-glow`). New durations collapse under `prefers-reduced-motion`.
- **Utilities** (`apps/qr/app/globals.css`): `.tex-dotgrid`/`.tex-linegrid` (gradient-**masked** so they fade to
  nothing at the edges, never uniform wallpaper), `.tex-grain` (inline SVG, zero network), `.surface-glass`/
  `-vellum`/`-paper` (opaque on mobile, `backdrop-filter` only `md:+` — the iOS WebKit OOM budget), and
  `pop`/`steam` keyframes (RM-gated). Confirmed emitting in built CSS.
- **Guardrail:** `--surface-elevated` (text-bearing chrome) locked in `contrast-audit.test.ts` for both themes
  (41 tests green).

### Added — Grocery Scan & Go: quantities + status-atomic upsert + scanner hardening (2026-06-29)

Scan & Go now treats repeat scans of the same barcode as a **quantity increment** (one line "3 × $X")
instead of stacking duplicate rows, and routes adds through the same hardened cart primitive as the
restaurant flow.

- **Server-atomic upsert** — `scanAdd` now calls the shared `insertOrIncLine` (+ `touchCart`) instead of a
  plain insert, so grocery adds finally get the **in-SQL `status='open'` guard** (retires the prior plain-insert
  TODO). Migration `20260624040000_grocery_status_atomic_insert.sql` widens `mms_cart_item_insert_if_open`'s
  `p_menu_item_id` to `text` so a barcode can use the same primitive (uuid & text both gen to `string` — no
  types drift). Totals stay server-authoritative; the client `qty × price` is display-only.
- **Scanner lifecycle hardened** — `BarcodeScanner` early-checks `getUserMedia`, tracks a `stopped` flag to
  prevent emit-after-teardown, and reliably tears down the camera stream + RAF on unmount.
- **Cleanups** — removed genuinely-unused `CSSProperties` imports (`SettlementBoard`, `Avatar`).

### Changed — M5 deep audit + fixes · Richness-track plan + handoff (2026-06-29)

Closed out M5 with a deep cross-slice adversarial audit (5 finder lenses × per-finding adversarial verification,
34 agents) and teed up the next initiative.

- **Audit verdict: sound** — zero findings touch money/auth/RLS/pricing/tax; 20 confirmed (1 Med + 11 Low + 8 Nit),
  8 rejected. Two systemic threads: a holistic a11y blind spot (live regions stack at component _seams_) and a
  primitive-migration tail (stragglers still hand-rolling what the new primitives cover).
- **Fixed (safe / byte-identical):** `EmptyState` composes `<Card>` (retires the last inlined `.card` recipe);
  `FloorBoard` empty state → `<EmptyState>` (harmonizes the 4th board); `SettlementBoard` seat avatar →
  `<Avatar size="md">` (completes the P5.4b wave). **Corrected the false dark-mode claim** in `M4_DESIGN.md` —
  `.dark` is never applied at runtime, so the app is light-only (dark activation tracked as Richness R2).
- **Deferred (flagged, not silently shipped):** dark-mode activation, the live-region-at-the-seams items, status
  chips→Badge (a visual change), split-pay avatar dim (cosmetic).
- **New: [`docs/RICHNESS_PLAN.md`](docs/RICHNESS_PLAN.md)** — the phased **Richness track (R1–R9)** to bring
  delivery's textures/surfaces/micro-interactions/motion to QR (built from a delivery-richness catalog + a QR
  gap audit + a feasibility study). Decisive calls: adopt framer-motion lazily (`domAnimation` root, `domMax`
  scoped), dark via a nonce-carrying `prefers-color-scheme` inline script, `NumberFlow` over `RollingDigits`,
  rebuild textures on QR tokens. ROADMAP + HANDOFF + LEARNINGS updated.

### Added — M5 · P5.5: Vitest + contrast-audit (QR's first test infra) (2026-06-29)

QR's **first automated tests** — locking in the WCAG-AA claim the design system makes. Vitest 4 wired into
`packages/ui` + `apps/qr` (node-env, pure-logic — sidesteps `server-only`/Tailwind-CSS), and the turbo `test`
gate is now live in CI (`.github/workflows/ci.yml`).

- **`packages/ui/src/__tests__/contrast-audit.test.ts`** — ported from delivery, improved: it **parses
  `tokens.css` at test time** (resolves `var()` aliases like dark `--ac-strong: var(--ac)`; flattens the
  `color-mix(... N%, transparent)` badge tints over `--cd`) rather than mirroring hardcoded hex — so a token
  edit is checked automatically (delivery's hardcoded fixtures could silently pass on a regressed token).
  Asserts the full text×surface matrix in **both themes** (tightest: light `t3`/`sf` 4.76, dark `jade-strong`
  4.61) **plus light-theme negative guards** (plain `--ac`/`--gold` as text must STAY <4.5 — the reason the
  `-strong` variants exist; guards against a future revert to the vivid hue as text).
- **`apps/qr/lib/avatars.test.ts`** — seat-hue×`#fff` AA (drives the real `seatColor` hash, no hardcoded
  palette) + `seatColor` determinism + `seatInitial` logic. **Finding:** the P5.4b-1 "two lightest seat hues
  sit just under AA" worry was a **phantom** — all five `PCOL` hues clear 4.5:1 (lightest `#A65F10` = 4.92);
  the stale `avatar.tsx` comment is corrected.
- **Tooling:** `vitest@4.0.17` (matches delivery); `esbuild` added to `pnpm-workspace.yaml allowBuilds`;
  `packages/ui/tsconfig.json` gets `types: ["node","react"]` (node builtins for the fs-based token parse).
  37 tests green; full gate (`lint typecheck build test`) 8/8.
- **Deferred fast-follow:** pure money-math tests (`tax.ts`, `split-math.ts`); component tests (need jsdom +
  `@vitejs/plugin-react` + `@testing-library`, added when the first one lands — no speculative apparatus now).

### Added — M5 · P5.4c: Card primitive (no variants — drift unified) (QR ← delivery transfer) (2026-06-28)

A context sweep before building **overturned the planned `elevated/outlined/filled` variant taxonomy** — that
described the _delivery_ app, not QR. In QR all 25 `className="card"` sites are surface-uniform (every override
is just padding); the only real fork — shadow vs no-shadow — was **accidental drift** in 10 hand-rolled inline
copies that re-typed the surface and silently dropped `box-shadow`. So the win isn't adding variants; it's
retiring the drift.

- **`Card`** (`packages/ui/src/card.tsx`) — pure presentational (Server-Component safe), **no variants**.
  Applies the global **`.card`** class (the single source of truth in `globals.css`) so it can never drift from
  the 25 class sites. Polymorphic `as` (default `div`) so a clickable card is a real `<Link>`/`<a>`/`<button>`
  (native focus/semantics, not a `role="button"` div); `ref` forwards (React 19 ref-as-prop) for the focus-
  management panels; `style`/`className` passthrough for per-site layout.
- **Migrated the 10 inline re-implementations to `<Card>`** — `OrderHistory`, `AccountUpgrade`, `FeedbackPrompt`
  (×2), `RewardsHub`, `staff/CashSettleButton`, `staff/CloseSecureTabButton`, `staff/MergeTableButton` (×2 focus
  panels), `SecureTabButton`, `staff/feedback` rows, and `staff/TableCard` (the `<Link>` card). Their consts are
  trimmed to layout-only; the surface (incl. shadow) now comes from `.card`.
  - **Visual change to flag:** the 9 accidentally-flat surfaces (account/rewards/feedback + the staff cash/
    secure-tab/merge confirm panels) **gain the canonical subtle `--sh` ambient shadow** — the deliberate
    "unify drift" call. `TableCard` already had the shadow → unchanged. The 25 `className="card"` sites are
    untouched. Accent-pill `.card` abusers (`CartBar`, grocery CTA) untouched.
- **Out of scope (tracked):** the 4 tinted ok/warn status surfaces (OrderTracker + FloorDetailLive banners) are
  a future **`Callout`** primitive, not a Card variant. `EmptyState` keeps its own inline surface copy (predates
  Card; safe, optional future dedup via `<Card>`).
- Gate 6/6 green. Pre-PR + deep pre-merge adversarial passes.

### Added — M5 · P5.4b-2: Skeleton + Stepper primitives (QR ← delivery transfer) (2026-06-28)

The loading/qty cluster of P5.4b. Both built to QR tokens, each wired to **real existing consumers** — and a
context sweep **refuted the assumption that the stepper had only one consumer**: there are two, already drifted.

- **`Skeleton`** (`packages/ui/src/skeleton.tsx`) — pure presentational (Server-Component safe) shimmer
  placeholder; `width`/`height`/`radius`/`circle` + a `style` passthrough for layout. Always `aria-hidden`
  (a skeleton is never announced — both consumers keep "one live region per view", their error branch owns
  `role=alert`). The shimmer `@keyframes` + its reduced-motion off-switch live in `apps/qr/app/globals.css`
  (`.mms-skeleton`) — a keyframe can't be authored inline, so the primitive references the class (same
  package↔app split as `Sheet`→`.mms-sheet`); the highlight is a `color-mix` of `--sf`/`--cd` (no hardcoded
  colors). Adopted in **`PickupSlotSheet`** (day-grouped slot-chip mirror) + **`SettlementBoard`** (share-row
  mirror: avatar circle + name/amount bars + status pill). Fast-follow consumers noted: `SharePay`, `MergeTableButton`.
- **`Stepper`** (`packages/ui/src/stepper.tsx`) — interactive (client) qty −/+ control; **presentational only**
  (the parent keeps the optimistic update / `startTransition` / rollback — the qty _math_ is untouched). Encodes
  the load-bearing rules once: 44px targets, the **remove-at-min swap** (the "−" becomes a destructive Remove
  with a swapped glyph + accessible name), the **increment gate** (`disabled`/`qty>=max`/`soldOut`, each with the
  right name; sold-out "+" dims), and the non-live center count (`<span>`, never `<output>` — its implicit
  `role=status` would announce per tap). Adopted in **`StaffLineEditor`** (red ✕ remove, no count) + the
  customer cart **`Checkout`** (🗑 remove, center count, warm "Add another X" label via `incrementLabel`) —
  re-converging two copies that had drifted.
  - **Minor flagged deltas on the customer cart `Checkout` stepper** (presentation only — qty math + the
    warm "Add another X" microcopy unchanged): glyph font 20→18px (imperceptible); a sold-out "+" now dims
    (opacity 0.55, consistent with staff). Staff gains a "Maximum 99" aria cap label.
- A **4-lens deep pre-PR adversarial review** drove: the `incrementLabel` prop (keeps the cart's warm copy —
  it had flattened to the staff phrasing); the sold-out dim tuned 0.4→0.55 (0.4 read "broken"); the dark-mode
  shimmer highlight shifted toward `--cd` (was near-imperceptible); and an `sr-only` "Loading…" cue beside each
  `aria-hidden` skeleton (restores the SR text the old `<p>` carried, with no live region). Deferred (tracked):
  focus-restore on line-removal at qty 1 — **pre-existing** in both old steppers, its own a11y ticket.
- Gate 6/6 green.

### Added — M5 · P5.4b-1: Avatar primitive + tabChip→Badge (QR ← delivery transfer) (2026-06-28)

The floor/presence cluster of P5.4b. Built to QR tokens; each adopted at a real site. (Skeleton + Stepper —
the loading/qty cluster, thinner consumers — follow in P5.4b-2.)

- **`Avatar`** (`packages/ui/src/avatar.tsx`) — pure presentational (Server-Component safe) initial-in-a-circle;
  caller passes the resolved `initial`+`color` (QR's `seatColor`/`seatInitial` stay app-side). Sizes match the
  consumers exactly (`md` 30/12, `sm` 22/10), optional `ring` for overlap, `aria-label` else decorative.
  Adopted in **`GuestList`** (overlapping presence avatars) + **`SplitSection`** (2 static attribution avatars);
  the interactive 44px tap-target `aav` stays bespoke (it's a button, not a display circle).
- **`tabChip` → `Badge`** — the floor open-tab indicator now uses `Badge`, unifying it with the adjacent
  `FloorStatusChip` (deep-review carry-forward from P5.4a, unblocked by the new `decorative` prop), all chips now
  `bordered` (the shared outlined look) at the Badge's normalized 700 weight. **`TableCard`** (decorative — the
  card's `aria-label` already names the tab state; over-ceiling keeps a non-color `⚠` cue, never color-alone for
  color-blind staff) + **`FloorDetailLive`** (announced — its text is the only place the tab state is named;
  **secured = `jade`** affirmative tone vs **open = `accent`**, restoring the `✓`/`●` two-state read). **Visual
  change:** the `●`/`✓` glyph → a tone-colored dot + unified pill geometry (preview-flag for review).
- Gate 6/6 green. `Avatar`'s two consumers + the `tabChip` migration confirmed against the originals. Pre-merge
  deep adversarial pass (3 lenses) drove the `bordered`/`jade`/`⚠` refinements above; one tracked follow-up — the
  two lightest `seatColor` hues sit just under AA behind the white avatar initial (pre-existing; redundant cue).

### Added — M5 · P5.4a: `@mms/ui` lint + Badge + EmptyState primitives (QR ← delivery transfer) (2026-06-24)

First slice of the primitive library — built to QR tokens, each adopted at an **existing duplicated** site
(no dead code). No functional change; colors/AA (`-strong` tokens) byte-identical — the only render deltas are
a sub-pixel unification of the floor chip (dot 6→7px + hairline `letter-spacing`/`nowrap`).

- **`@mms/ui` is now linted** — added `packages/ui/eslint.config.mjs` (extends `@mms/config/eslint` +
  `eslint-plugin-react-hooks`) + a `lint` script, so `turbo lint` now covers the shared hooks/components
  (`motion.ts`/`sheet.tsx`/the new primitives) — previously typecheck-only (P5.3 review Low-2). 6/6 gate tasks.
- **`Badge`** (`packages/ui/src/badge.tsx`) — pure presentational (Server-Component safe) status/role chip with
  semantic **`tone` presets** (`gold`/`jade`/`accent`/`ok`/`warn`/`neutral`) that carry the AA-correct mapping
  (text `-strong` on a tint; vivid decorative dot) so that rule lives once in the primitive, not in every call
  site — plus explicit `color`/`background`/`dot`/`bordered` overrides for bespoke palettes, and
  `aria-label`/`decorative` (aria-hidden) passthroughs. `RoleBadge` (owner/manager/server) uses `tone`;
  `FloorStatusChip` (its flat-on-`--cd` states) uses the explicit path — both render byte-identical.
- **`EmptyState`** (`packages/ui/src/empty-state.tsx`) — the "nothing here" card (token surface = `.card`),
  title + optional subtitle/icon/action + `titleAs` (`p` default / `h2`/`h3` for standalone regions, a11y).
  `KdsBoard` + `ApprovalsBoard` + **`ExpoBoard`** (now unified across the staff board family) use it.
- **Deep pre-merge review (3 parallel lenses): all PASS** — the API-design lens prompted the `tone` presets +
  a11y passthroughs; the consistency lens prompted ExpoBoard's migration; build/lint/deps proved eslint efficacy
  - frozen-lockfile safety. Carry-forward: the `tabChip`↔`FloorStatusChip` floor adjacency is a **pre-existing**
    (sub-perceptual) inconsistency — a Badge-migration candidate for P5.4b (now unblocked by `decorative`).
- **Deferred:** `Avatar`/`Skeleton`/`Stepper` → P5.4b; `Card` variants → P5.4c (20+ sites); `Tooltip`/`Drawer`/
  tilt → no QR consumer.

### Added — M5 · P5.3: motion discipline + perf budget (QR ← delivery transfer) (2026-06-24)

Establishes QR's motion/perf foundation **before** richer motion lands (P5.4+), so it never reintroduces the
sibling app's prod iOS-WebKit-OOM crash. No behavior change to existing flows.

- **`@mms/ui` foundation primitives** (lean, SSR-safe, `"use client"`, exported from the package root):
  `useAnimationPreference()` (`{ shouldAnimate }` — the JS counterpart to the CSS reduced-motion query,
  reactive to OS changes), `useInView()` (IntersectionObserver offscreen-pause; falls back to in-view where
  IO is absent), `useDeviceTier()` (`low|mid|high|desktop`, SSR-safe `low` first paint — the gate for future
  heavy GPU FX). Ported lean from delivery (no in-app override store — QR has no motion-settings UI yet).
- **Canonical consumer:** the `/track` active-step pulse (`mms-track-now`, the app's one infinite loop) is now
  gated `shouldAnimate && inView` — JS reduced-motion + offscreen-pause — with the `useInView` ref on the
  stable `<ul>` (not the moving dot). Proves the primitives without retrofitting JS onto already-correct CSS.
- **`docs/MOTION_AND_PERF.md`** — the discipline doc: reduced-motion (CSS + JS), 60fps transform/opacity-only,
  offscreen-pause, the **mobile GPU/blur budget** (no stacked `backdrop-filter`/large `blur()` on mobile;
  radial-gradient glows; gate heavy FX behind `md:`/`useDeviceTier`; budget the initial composite), and
  `desktop`-only gating for the heaviest GPU (high cores ≠ lifted WebKit memory ceiling).
- **Deferred to P5.4:** `useRipple`/`useTilt` interaction hooks — meaningless without component consumers; they
  land with the primitive library that uses them (carry the "no tilt on a CTA card / disable on keyboard focus"
  caveats). Learnings captured in `.claude/LEARNINGS.md`.

### Added — M5 · P5.2: iOS / mobile hardening sweep (QR ← delivery transfer) (2026-06-24)

First transfer slice of the reshaped M5 — ports delivery's production-hardened mobile/iOS patterns into QR,
built to QR's own tokens. Pure mobile-robustness; no behavior/logic change to money/auth/data.

- **Bottom sheets size by `--sheet-max-h` (dvh), not `vh`** — new `--sheet-max-h: calc(100dvh -
env(safe-area-inset-top) - 1rem)` token in `@mms/ui/tokens.css`; the shared `.mms-sheet` (every
  `@mms/ui` Sheet — JoinTable/InviteSheet/PickupSlotSheet/LossActionSheet) now uses it + clears the home-bar
  inset in its bottom padding. iOS `vh` is the large viewport, so a `90vh` sheet's top/close button could hide
  under the status bar.
- **Safe-area insets via position, not padding**, on every edge-pinned element: `CartBar` + grocery
  `checkoutCta` (bottom), `TableCartProvider` recovery alert (top), `RefundActionSheet` overlay (bottom), the
  staff `table/[id]/add` sticky header **and** the diner `menu` sticky header (top — handheld tableside is the
  worst notched-portrait case). (Mid-floating toasts at bottom 84/90 already clear the inset — left as-is.)
  `.mms-sheet` carries a `90vh` fallback before the `dvh` value for iOS <15.4; `RefundActionSheet`'s inner
  sheet gained `--sheet-max-h` + scroll to match. (Deferred to **P5.6/PWA**: a top inset on ordinary page-flow
  content — cosmetic in browser-portrait where `safe-area-top≈0`, only relevant once a standalone PWA ships.)
- **16px form controls on mobile** — a single `@media (max-width: 639.98px)` base rule pins
  `input`/`textarea`/`select` to 16px (overrides inline sizing) so iOS never auto-zooms on focus; desktop sizes
  resume at `sm:`. QR had fixed _some_ inputs ad hoc (StaffLogin/FeedbackPrompt/JoinTable) but missed others
  (grocery search, InviteSheet, RefundActionSheet) — this closes the whole class in one rule.
- Audited clean (no change needed): nested-scroll wheel traps and breakpoint-coupled overlay anchors — QR uses
  centered inline-styled fixed elements, not Tailwind-breakpoint-anchored dropdowns.
- Verified the new CSS emits in the built bundle (`--sheet-max-h`, `safe-area-inset`, the mobile media query);
  gate green (`turbo lint typecheck build`). Backlog: `docs/QR_FROM_DELIVERY.md`.

### Changed — M5 · P5.1: reshaped from migration → "QR learns from delivery" (repos stay separate) (2026-06-24)

**M5 is no longer a repo migration.** On review with Min we changed direction: the two apps stay **separate
repos** (own deploys, own CI, own Supabase projects, the shared Stripe account) and the younger **QR** app
**learns from** the mature, live **delivery** PWA instead. Drivers: the shared-`@mms/ui` payoff is unrealized
while the apps run **different design lineages** (QR's `@mms/ui/tokens.css` is the tighter, WCAG-AA-verified
base — keep it, don't fork delivery's 34 KB accreted set); delivery's real value to QR is **craft + production
learnings** (a transfer, not a repo merge); and the migration's dep-dedup would **force-bump a live production
app** (next/react/eslint/TS — a regression surface, the owner's #1 frustration). Full-repo co-location is
**reconsidered at M6** if Terminal/kiosk need a shared runtime.

- **Docs reshaped:** `docs/M5_DESIGN.md` rewritten as the transfer design-of-record (with the superseded
  co-location plan kept for history); `ROADMAP.md` §M5, `docs/HANDOFF.md`, and `CLAUDE.md` ("What this is")
  updated; **new `docs/QR_FROM_DELIVERY.md`** — the prioritized transfer backlog synthesized from two grounded
  adversarial audits (delivery's app-agnostic wisdom · QR's posture/gaps).
- **New slice plan:** P5.0 (the `@mms/db` factory, #79) retained as a clean internal refactor → **P5.2** iOS/
  mobile hardening sweep → **P5.3** motion discipline + perf budget → **P5.4** primitive library in `@mms/ui`
  (built to QR tokens) → **P5.5** contrast-audit test + QR test infra → **P5.6** PWA/offline (deferred).
- **Key correction over the delivery catalog's instinct:** transfer _behavior + craft + primitives_, never the
  design tokens — QR keeps its own. **Audit fact recorded:** delivery uses file-based migrations.

### Changed — M5 · P5.0: `@mms/db` generic client factory (multi-app prep) (2026-06-24)

**(Superseded by the P5.1 reshape above — repos stay separate; retained as a clean internal refactor.)** The first M5 build slice: make `@mms/db` reusable by a second app without merging databases. New
`@mms/db/factory` exports `createServiceRoleClient<DB>` / `createPublicClient<DB>` / `createSessionClient<DB>`
/ `createSsrClient<DB>` / `createBrowserSupabaseClient<DB>` — the client construction + cookie/auth wiring,
**generic over the project's `Database` type and injected with `url`/`key`** (no `process.env` read). QR's
`serviceClient()`/`publicClient()`/`sessionClient()`/`serverClient()`/`browserClient()` keep **identical
signatures** and now delegate to the factory bound to QR env + QR types — so all ~20 QR call sites are
byte-unchanged (zero behavior change), the `server-only` service-role boundary stays on QR's wrapper, and
`apps/delivery` (P5.2) will bind the same factory to its own project + types. The per-app type-file rename
(`database.types.delivery.ts`) and Zod-schema namespacing are deferred to P5.2 (churn-without-enablement until
delivery lands; would needlessly risk the byte-exact `types-fresh` gate now). Plan: `docs/M5_DESIGN.md`.

### Added — M5 prep: design-of-record for the delivery-app migration (2026-06-24)

**(Superseded by the P5.1 reshape above — M5 is now a transfer, not a migration.)** Pre-build design for M5 (bring the live delivery PWA into the monorepo), grounded in a structural recon of
the packages. `docs/M5_DESIGN.md` + a HANDOFF refresh (S4 audit remediation shipped → M5 unblocked) +
`ROADMAP.md` M5 (a P5.0 prep slice + the design pointer).

- **Locked scope:** code co-location, **not** a database merge — apps share `@mms/ui`/`@mms/config`/tooling +
  the one Stripe account; each keeps its own Supabase project. `@mms/db` is the only QR-coupled package and
  the focus of the prep slice (a generic project-parameterized client factory + per-app generated types +
  namespacing the QR-only Zod schemas off the shared root, closing audit P2).
- **CI:** a per-app matrix (two stacks) replaces the single-Supabase `types-fresh`/migrations-check assumption.
- **Rewards unification is explicitly post-M5 ("M5a"):** with two databases, a unified wallet is a
  cross-project data problem, not a code move — M5 ships two ledgers + honest copy, not a false promise.

### Fixed — S4 audit remediation: refund correctness + fire-at-checkout durability (2026-06-24)

The money/kitchen defects the S4 audit (`docs/S4_AUDIT.md`) surfaced. Migration `20260624030000`.

- **P0-1 (money-out BLOCKER):** `mms_refund_authorize` under-refunded any qty>1 taxable line — `tax_cents`
  is stored **per-unit** but the refund added it once, not `×qty`. Now the line's tax is its pro-rata share
  of the order's tax (scales with qty). **P1-1:** the refund is also **discount-aware** (refunds the
  discounted goods + share of tax on the discounted base, mirroring `getCartTotals`, not the undiscounted
  list price) and carries an **order-level over-refund cap** (Σ refunds ≤ net + tax = total − service − tip),
  so cumulative line refunds can never exceed what was collected. `RefundActionSheet` now shows the
  server-derived `refundableCents` (a `lib/refunds.ts` mirror of the SQL) so the figure shown IS what refunds.
- **P1-2 (silent charge-with-no-fire):** the settlement `after()` drain (fire pending food · init togo ·
  snapshot EBT) had no backstop if `after()` cold-stopped after the 200 ack. Added a **pg_cron reconciler**
  (`mms_reconcile_settled_fulfillment`, every 5 min, the QBO-drain pattern) that re-runs the idempotent
  side-effects for recently-paid orders with un-done work, and **split the three RPCs into independent
  try/catch** in all three settlement paths (card webhook single + split; cash) so a throw on one can't
  starve the others.
- **P1-3 (wrong-batch undo):** `mms_undo_fire` keyed on `max(fire_at)`, so a host's grace-Undo could claw
  back a guest's S4.2 "make it now" line. It now takes a `fire_batch` (the send hands the client its batch
  id) and reverses **only that batch** — never another actor's line sharing the grace window.
- **P1-4 (>24h re-refund double-pay):** the `charge.refunded` ledger backstop **5xx**s on a list/record
  failure (was: logged + swallowed), so Stripe redelivers within its 72h window instead of permanently
  losing the row and risking a second real refund once the idempotency key expires.
- **P0-2 (M5 blocker, doc):** reconciled the project-topology contradiction — `ROADMAP.md` M5 +
  `BACKEND_ARCHITECTURE.md` now state the locked design: apps share **packages + the one Stripe account**,
  each on its **own** Supabase project (no DB merge). M5 is a code unification, not a database merge.

### Added — S4.3c: split-tender seam (EBT eligibility-at-sale; tender split = 2027) — **S4 COMPLETE** (2026-06-24)

The data-model seam so the **2027 EBT tender split** (one tender pays the eligible grocery subset, another
pays the rest) is a tender-time branch, not a rewrite. Design: `docs/S4_DESIGN.md` S4.3c (C1–C3). Migration
`20260624020000`. **No tender logic built** (EBT = 2027, gated on Forage/USDA-TPP + FNS authorization).

- **`qr_order_items.ebt_eligible`** (default false) — the **eligibility-at-sale** record + the 2027 partition
  key. `mms_snapshot_ebt_eligibility(order)` marks the order's grocery lines whose catalog item is
  `ebt_eligible`, called **best-effort in the settlement `after()` side-effects** (card · cash · split) — **off
  the money path**, no fulfill-RPC change. Idempotent; food/prepared lines stay false; a hiccup leaves false
  (the catalog stays derivable). A permanent audit record, immune to later catalog drift.
- **The line-categorization seam is otherwise already in place** — `qr_order_items.fulfillment` (S4.3a)
  identifies grocery lines; the per-payer PI ledger (`qr_cart_shares`) generalizes to per-tender. The
  payment↔line-subset **association shape** (a `qr_payment_lines` join vs `paid_by_intent`) is **deliberately
  deferred** to the 2027 Forage build (committing it now would guess the PI model and risk a money-table
  rewrite) — documented so 2027 is a branch, not a discovery. The S4.3b `split_unsupported` line-refund
  deferral resolves on this same seam.
- Function `SECURITY DEFINER`, `search_path=''`, revoked from public/anon/authenticated + service_role only.

**S4 (unified basket & fulfillment routing) is complete** — S4.1 per-line tag + mixed cart · S4.2 fire
routing + KDS subset · S4.3a to-go fulfillment loop · S4.3b line-level refunds · S4.3c EBT seam. The 2027 EBT
tender + split-order line refunds ride the documented seam.

### Added — S4.3b: line-level refunds (`charge.refunded` + manager-gated per-line refund) (2026-06-24)

Money-OUT: the captured-line counterpart to S2.3's open-cart void. Design: `docs/S4_DESIGN.md` S4.3b
(B1–B4). Migration `20260624010000`. Second of three S4.3 slices.

- **`/staff/orders`** (manager-gated) — recent paid orders, expand to lines, **Refund** a line. The
  RefundActionSheet collects a reason + the manager's **own PIN** (money-out re-auth at action time;
  lockout-counted). Split-tender orders flag "refund via dashboard" (per-payer-PI allocation deferred).
- **Server-derived, idempotent, audited** — `mms_refund_authorize` re-derives the amount
  (`unit_price_cents*qty + tax_cents` — goods + that line's tax; service/tip are order-level, not per-line)
  - the PaymentIntent and validates paid / single-PI / not-already-refunded / manager. The Stripe refund is
    **idempotency-keyed on the line** (a double-submit returns the same refund — no double money out);
    `mms_record_refund` writes the **`mms_refunds` ledger** (unique `stripe_refund_id` + unique-per-line) + a
    `mms_approvals` audit row (`kind='refund'`). Amount + PI are never client-supplied.
- **`charge.refunded` webhook** — Stripe-authoritative reconcile: flips `qr_orders.status='refunded'` once
  `amount_refunded >= total_cents` (idempotent; also catches **dashboard-issued** refunds). This is the
  state **M4 refund-recede** was blocked on — the rewards summary counts only `status='paid'`, so a full
  refund recedes the Star. A partial (single-line) refund leaves `status='paid'` (the ledger has the detail).
- **Hardening** — all three RPCs `SECURITY DEFINER`, `search_path=''`, revoked from public/anon/authenticated
  - service*role only; `mms_refunds` RLS-on (manager-read). A ledger-write failure \_after* a successful Stripe
    refund is logged, not surfaced — the webhook reconciles regardless (money moved correctly). Split-line
    refunds + coupon claw-back are documented deferrals.

### Added — S4.3a: to-go fulfillment loop (bagging/expo station + "to-go ready" signal) (2026-06-24)

Closes the unified-basket loop end-to-end: order → route → fire → cook → **bag → ready → hand off**, with a
diner signal so nobody pays and walks out without their bag. Design: `docs/S4_DESIGN.md` S4.3a (A1–A6).
Migration `20260624000000`. First of three S4.3 slices (then line refunds, then the split-tender seam).

- **`qr_orders.togo_status`** (`preparing`/`ready`/`picked_up`, nullable — null = pure dine-in, no bag) is the
  ready signal. `/track` already subscribes to `qr_orders`, so it rides that existing Realtime path — no new
  channel. Set to `preparing` at settlement (best-effort, off the money path).
- **Expo / bagging station** (`/staff/expo`) — the takeaway counterpart to the KDS. Lists paid orders with a
  takeaway portion + their **to-go/grocery lines only**, with a two-stage bump: **Bagged & ready**
  (`preparing→ready`, lights the diner's `/track`) then **Picked up** (`ready→picked_up`, drops off). Staff-
  gated (`requireStaff`), realtime + 5s poll backstop, mirrors the KDS.
- **Snapshot `qr_order_items.fulfillment`** — the order-item snapshot now carries the per-line fulfillment tag
  (additive column copy in all three fulfill RPCs; no money logic changed), so a paid order knows which lines
  are the bag. Slice C (split-tender seam) inherits this per-line categorization.
- **`/track` shows real progression** — `togo_status` lights the pickup/scango step rail
  (`preparing`→In the kitchen, `ready`→Ready for pickup, `picked_up`→Picked up) + a prominent **"your order's
  ready — grab it before you head out"** banner. Honest (server-signal only, no fabricated countdown); a
  dine-in order with no bag rests as before. One live region, SR-announced.
- **Hardening** — `mms_set_togo_status` re-asserts the legal edge (`preparing→ready→picked_up`) **in the SQL
  write** (`'stale'` on a raced/illegal edge); `mms_init_togo_status` is idempotent + takeaway-gated; both
  revoked from public/anon/authenticated + granted service_role. Init drained via `after()` (a hiccup can't
  roll back a payment). Advisors baseline-only.

### Added — S4.2: per-line fire routing + KDS subset + ready signal (2026-06-23)

The fulfillment tag now drives **when** a line fires. Design of record: `docs/S4_DESIGN.md` S4.2 (F1–F6).
Migration `20260623220000`. Scoped to the **dine-in unified basket**; pickup/scango keep their M2 scheduled
order-level fire (untouched).

- **Fire routing** — `mms_fire_cart` ("Send to kitchen") now fires **only `dinein`** draft lines (was: every
  draft line of a dine-in session). A `togo` line waits for checkout / "make it now"; a `grocery` line never
  fires. The KDS subset (`dinein` + fired `togo`) falls out for free — grocery never reaches `state='fired'`.
- **"Make it now"** — `makeItNow` + `mms_fire_line` fire a single `togo` food line early (draft→fired, +10s
  grace). Member + `canMutateLine` gated; the RPC re-derives open-cart + draft + `togo` **in SQL** (a `dinein`
  line uses the batch send, `grocery` refused). A per-line button in the cart's To-go group.
- **Fire-at-checkout (no charge-with-no-fire)** — at settlement, `mms_fire_pending_food` fires every still-draft
  **food** line (dinein+togo, never grocery) of the **paid** dine-in cart, so the kitchen makes everything the
  guest paid for. Called **best-effort after** the (untouched) money RPCs — card webhook, cash settle, and the
  split-tender close — drained via `after()` so a kitchen-fire hiccup can never roll back a captured payment or
  NACK a Stripe webhook. Idempotent; dine-in-gated.
- **KDS** — now reads kitchen lines on **open _or paid_** carts (a to-go line fired at checkout lives on the
  just-paid cart; the old open-only filter hid it). `cancelled` excluded; the line-state gate keeps served/
  voided off. Each ticket line shows a **"To-go" badge** (text + decorative glyph, `aria-hidden`) so the
  cook/expo bags it instead of running it to the table.
- **"Ready in ~X"** — the To-go group + the "Make it now" button surface an honest estimate from
  `pickup_config.prep_minutes` (a configured value, **not** a fabricated live countdown). The persistent diner
  "to-go ready" departure status + bagging/expo station remain **S4.3**.

### Added — S4.1: unified basket — per-line fulfillment tag + mixed-destination cart (2026-06-23)

One basket, one payment, lines that route to different destinations. Design of record:
`docs/S4_DESIGN.md` (threat model U1–U4 + the EBT split-tender seam). Migration `20260623100000`.

- **Per-line fulfillment tag drives per-line tax** — every cart line carries a `fulfillment`
  (`dinein`/`togo`/`grocery`) that **supersedes the session mode** for routing _and_ tax. Food
  defaults from context (dine-in→`dinein`, pickup/scan→`togo`); grocery auto-tags `grocery` and is
  never guest-flippable (routing + exemption are fixed). The tag flows into `mms_line_tax`, so a
  cold-food line taxed at the dine-in/to-go boundary recomputes correctly when its tag flips
  (cold_food/beverage_cold are taxable dine-in, exempt to-go). `tax_cents` is stored per line and is
  the taxable base `getCartTotals` already sums — no new total/charge path.
- **Cart grouped by destination** — `Checkout` renders the basket in `<section aria-label>` blocks
  (Here · To go · Grocery), headings shown only when 2+ destinations are present. Single-destination
  carts read exactly as before.
- **Food For-here/To-go toggle** — a per-line, draft-only, member-gated toggle
  (`mms_set_line_fulfillment`: open-cart + draft-state + not-grocery guard **in SQL**, server-recomputed
  tax). `role="group"`, `aria-pressed`, 44px targets. Grocery lines show no toggle.

Fire-routing / KDS subset / ready signal land in S4.2; bagging/expo + split-tender + line-level refunds in S4.3.

### Added — M4 P4.3: feedback + ungated review triage (2026-06-23) — M4 COMPLETE

Post-order feedback at peak goodwill, the **ungated** way (`docs/M4_DESIGN.md` R9/R10; `DESIGN-RESEARCH.md`
"review-gating is the trap"). Migration `20260623090000`.

- **Ask everyone, gate nothing** — a `FeedbackPrompt` on `/track` collects a 1–5 rating + optional comment;
  after **any** rating the public **Google review link is offered to all** (never routed by score — that
  would breach Google policy + the FTC). A low rating adds a "we'll make it right" recovery line **and
  still** shows the link.
- **Triage = internal routing, never suppression** — a low rating (≤3) pings staff (PostHog signal) and
  surfaces on a **manager-gated `/staff/feedback`** queue (owner-read RLS, low ratings highlighted) for
  recovery; it never changes what the diner can do.
- **Integrity** — one feedback per order (`unique(order_id)`), by the order's **earner** (`mms_submit_feedback`
  re-derives `earned_by` = the SSR uid + paid order; a non-earner is refused and never sees the prompt).
  Rating bounded 1–5 (Zod + `CHECK`), comment ≤1000 (Zod + `CHECK`). `mms_feedback` owner-read RLS, off
  realtime; `mms_feedback_config.google_review_url` owner-tunable (null → no link, graceful).

**M4 is complete** — rewards earn + account upgrade + hub (P4.1) · redemption · order history · split-earn
(P4.2) · feedback + ungated reviews (P4.3). Documented-blocker deferrals (reorder, settings, refund-recede)
remain noted in `docs/M4_DESIGN.md`.

### Added — M4 P4.2: split-tender earn attribution (2026-06-23)

A split-tender order now earns — previously the split fulfill stamped no earner, so a table that split the
bill earned nothing. The **host-of-record** (the cart's `session.host_seat`) earns the one Star (order-count
model: one order = one Star; net spend credited to the organizer, parity with the S3 host-of-record). The
webhook split-fulfill resolves the host uid, stamps `qr_orders.earned_by`, and awards via
`mms_reward_on_fulfill` — exactly-once (only on the open→paid transition), best-effort (never fails the
money ack). Per-share attribution is a noted future refinement (needs a per-payer earn ledger). No schema
change. This **finishes the buildable M4 P4.2 remainder**; reorder (lines store modifier labels not option
ids → can't faithfully re-price), settings (theme/lang — OS + bilingual menu already cover it; real lang =
i18n initiative), and refund-recede (blocked on S4.3 refund infra) stay deferred with documented blockers.

### Added — M4 P4.2: order history (2026-06-23)

The diner's own past orders on `/account` (read-only). `getOrderHistory` reads their PAID orders
(`earned_by` = the SSR-verified uid — anon or upgraded), newest first, with a short item summary; a
service-role read scoped to the uid, so a diner only sees their own. Cash/staff-closed orders (no earner)
don't appear — honest "orders you placed", not the whole table's. No new schema. Reorder + settings are
deferred to their own slices (see `docs/M4_DESIGN.md`): reorder needs an active table-bound cart; settings
(theme/lang) is blocked on a theme-override provider + an i18n layer (today the theme is pure
`prefers-color-scheme` and there's no diner i18n framework — shipping the toggles now would be hollow).

### Added — M4 P4.2: reward redemption at checkout (2026-06-23)

A diner redeems an earned Morning Star reward coupon on their order — completing the earn→see→**use** loop
(P4.1 issued + showed them; this spends them). Migration `20260623070000`.

- **Rides the existing discount rail** — a reward is held by `qr_carts.applied_reward_id` and surfaces via
  `mms_reward_discount` (parallel to `mms_promo_discount`), folded into `getCartTotals().discountCents`
  (new `rewardCents` sub-field for display). So the create-intent amount, the **webhook reconcile**, the
  cash subtotal-reconcile, and every order snapshot stay server-authoritative — no new money math.
- **Stable across the pay window** — expiry is gated at **apply** time (not totals time), so the discount
  can't shift between intent-create and the webhook and break the reconcile.
- **Single-use, atomic** — `mms_apply_reward` validates ownership (the reward's `user_id` = the caller's
  uid, so a guessed code is just "invalid" — no enumeration), unredeemed/unexpired, the redemption minimum,
  open+unlocked cart, and that it isn't held by another open cart. `mms_redeem_cart_reward` flips it to
  redeemed at fulfillment (conditional → idempotent on Stripe redelivery) across **card, cash, and split**.
  Refused mid-pay so a reward never changes a total a peer is settling.
- **UI** — `RewardField` on the cart ("Use a reward") lists the diner's coupons + applies/removes one; the
  breakdown shows a distinct "Reward −$X" line. Rewards-hub wallet copy is now truthful. Member-gated
  `applyReward`/`clearReward`/`getMyRewardCoupons`; honest per-reason copy.

### Added — M4 P4.1: Morning Star Rewards + account (QR-local) (2026-06-23)

Design of record: `docs/M4_DESIGN.md`. A diner earns rewards and can upgrade their anonymous session to a
durable account. **QR-local** ledger (unify with the delivery app at M5); earn rules **mirror** delivery
(Stars = paid-order count; tiers `new`/`jade`/`ruby`/`gold` by lifetime net spend; milestone-step reward
coupons) so M5 is a data merge, not a rename. Migration `20260623060000`.

- **Server-authoritative, derived rewards** — `mms_rewards_summary` derives Stars/spend/tier from the
  caller's **paid** `qr_orders` (never a client-held balance). `qr_orders.earned_by` is stamped at
  fulfillment from `create-intent`'s PI metadata; `mms_reward_on_fulfill` issues a reward coupon when Stars
  cross a milestone (idempotent per milestone index). Rewards are **best-effort** in the webhook — a hiccup
  never fails the money ack. Cash/staff closes earn nothing (no diner payer).
- **Account upgrade in place** — `updateUser({ email })` + `verifyOtp` (email OTP) or `linkIdentity`
  (Google), keeping the **same uid** so past orders + Stars carry over. The `mms_account` marker is set
  **while still anonymous** so `AnonAuthGate` (which previously signed out any non-anon session on a diner
  route — a P0 for upgraded accounts) keeps the upgraded session.
- **Rewards hub** at `/account` (was a stub; `/rewards` now redirects there) — tier ladder, Stars progress,
  earned-reward wallet. Bilingual gem names; tokens, 44px, `role`/`aria` on every control; honest copy
  (the wallet says rewards are _saved_, not yet redeemable in-app — redemption is P4.2).
- `mms_profiles` (owner-RLS account), `mms_rewards` (coupons), `mms_rewards_config`/`mms_reward_tiers`
  (tunable, seeded to delivery values) — all service-role-write, owner-read where a diner reads their own;
  off realtime. `config.toml`: manual linking on + the Google provider (disabled until creds wired).

### Added — S3.3: server-discretion gating (nudge · ceiling · audit log) — wraps the S3 tabs milestone (2026-06-23)

The discretion layer over the tab lifecycle, courtesy-framed and config-driven — never an auto-charge.
Migration `20260623040000`.

- **T13 — durable tab-action audit log** (`mms_tab_events`): append-only, **non-PII** (the staff uid only;
  never the anonymous diner's), service-role write, **owner-read RLS** (mirrors `mms_approvals`), off
  realtime. Logged on **open** (`logTabEvent` from `openTab`), **secure** (the `setup_intent.succeeded`
  webhook), and **close** (cash via `settleCash`; card/secure via the `payment_intent.succeeded` fulfill,
  attributed by PI metadata). This is the opener attribution S3.1-A3 deliberately pulled off the
  diner-readable cart row. `mms_open_tab` now returns `opened`/`exists` so a fresh open logs exactly once.
- **T11 — silent ceiling**: the floor flags a **trust** tab whose running subtotal crosses `ceiling_cents`
  ($400) — a "Tab at $X" banner + a warn-tinted floor-card chip. A flag only; never auto-converts or
  auto-charges (the conversion to secure stays the diner's choice on `/cart`).
- **T12 — courtesy nudge**: a config-driven hint to consider a secure tab — `party` (≥ `nudge_party_size`)
  or `age` (open past the new `nudge_tab_age_min`, 90 min). A system hint with scripting, not per-customer
  judgment; suppressed once secure.
- **T14 — host-of-record**: the secure-tab drill-down names the host whose card is on file.

### Added — S3.2: secure tab (SetupIntent → off-session close) (2026-06-23)

A diner saves a card (SetupIntent, `usage:'off_session'`) at open or mid-tab; the tab settles off-session
on the card at close. SAQ-A throughout — only Stripe tokens, never PAN. Migration `20260623020000`.

- **Tokens off the realtime row** — the Customer + PaymentMethod tokens live in a service-role-only
  `mms_tab_secure` sidecar (default-deny RLS, **not** on the realtime publication), since `qr_carts` fans
  its full row to anonymous table members. The cart signals only `tab_type='secure'`.
- **Card-save** — `/api/stripe/setup-intent` (member-gated) mints/reuses one ephemeral Customer per tab +
  a SetupIntent; the diner saves a card via a setup-mode Payment Element on `/cart` ("Secure your tab").
  The webhook `setup_intent.succeeded` → `mms_secure_tab` records the token + flips `tab_type='secure'`
  (server-authoritative — never reports "secured" the gateway didn't accept).
- **Off-session close** — `closeSecureTab` (staff) charges the card on file for the final total via an
  `off_session`+`confirm` PI that flows through the **existing** `payment_intent.succeeded` →
  reconcile → `mms_fulfill_order` path (no fourth fulfill path); holds the settle mutex; a decline /
  authentication_required surfaces an honest cash/fresh-card fallback and never strands the tab paid. **No
  tip is added off-session** (an off-session charge must not invent a tip the guest didn't authorize).
- **Staff** — "Tab secured · card on file" on the drill-down + a "Close tab · card on file" action (cash
  stays a fallback).

### Fixed — S3.1 trust-tab: post-merge deep-adversarial follow-ups (2026-06-23)

Two fresh-context deep reviewers (concurrency/data-integrity + UX/a11y) over the merged S3.1 diff.
Migration `20260623010000`.

- **A1 (data-integrity)** — `mms_merge_table_orders` ignored the tab columns, so folding a table with an
  open trust tab into another silently dropped the tab (floor stopped showing "Tab"; S3.3 ceiling/nudge
  wouldn't gate). The merge now carries the tab forward — inherit up, never downgrade a target secure tab,
  earliest open time.
- **A2 (concurrency)** — `openTab` now refuses while money's in flight (single-pay lock / split freeze /
  authorized share), reusing the canonical `paymentInFlightReason` mutex — the server backstop for the
  diner `/cart` path (the staff floor already hid Open-tab mid-payment).
- **B1 (UX)** — diner `/cart` now live-syncs a server-opened tab for **solo/duo** dine-in too (cart
  realtime was gated on `isGroup`), so the screen flips to "Tab open / Settle tab" without a manual reload.
- **B2 (a11y)** — focus moves to the order heading when the staff Open-tab control unmounts on open (was
  dropping to `<body>`, WCAG 2.4.3).
- **A3 (privacy)** — dropped `tab_opened_by` (it stored the opener's `auth.uid()` on the diner-readable
  `qr_carts` row, fanning a **staff** uid out to anonymous diners over realtime); `mms_open_tab` loses its
  `p_by` arg. Opener attribution returns in S3.3 via the service-role-only `mms_tab_events` audit log.

### Added — S3.1: trust tab (deferred settlement) (2026-06-23)

"Keep the tab open" — the table order accumulates across the night and settles once at close. A trust tab
is the existing `qr_carts` order with settlement deferred (not a new ledger), so close reuses the existing
tenders (cash settle; the diner's card via the Payment Element, which already carries tip-on-final-total) —
no fourth fulfill path. Migration `20260623000000`.

- **Spine (SQL)** — `qr_carts` tab columns (`tab_type`/`tab_opened_at`/`tab_opened_by`, CHECK-guarded);
  `mms_open_tab` (dine-in + open + session-not-closed guards, idempotent, never downgrades a secure tab,
  `SECURITY DEFINER`, service-role-only); `mms_tab_config` singleton ($400 ceiling · nudge ≥10, for S3.3),
  service-role-only RLS.
- **Open — dual authority (T3)** — a server opens a tab from the floor drill-down; a diner opens one from
  `/cart` ("Keep tab open · settle later", dine-in only). Both write the one table-owned cart, each gated in
  SQL (staff via `getStaffAuth`; diner via `assertCartMember`).
- **Floor legibility** — a "Tab" badge on the floor board card + the drill-down header, the "tab opened …"
  time, and the cash settle re-framed as "Close tab · cash" once a tab is open.
- **Diner** — a calm "Tab open — settle when you're ready" state and a "Settle tab" CTA on `/cart`.

### Changed — S2-polish: the deferred S2-audit sweep (2026-06-23)

The remaining `docs/S2_AUDIT.md` should-fixes, landed in one pass. Migration `20260622100000`.

- **S3 / S7 (SQL)** — `mms_now()` gives the KDS a DB-clock grace cutoff (no app/DB skew double-pull); a new
  `fire_batch uuid` makes "one Undo = one Send" **structural** — `mms_fire_cart` stamps one id per send and
  `mms_undo_fire` reverses exactly the latest in-grace batch (not a `max(fire_at)` tie). Comped lines stay
  excluded from undo.
- **gate-reason (SQL)** — `mms_void_line` / `mms_request_approval` snapshot why they gated
  (`comp`/`cooked`/`ceiling`/`solo`) into `mms_approvals.gate_reason`, so the audit ledger is reconstructable
  even if `mms_loss_config` later changes.
- **S9** — the polled staff boards (KDS, Approvals, table Detail) surface a "Reconnecting — showing the last
  known …" signal after 2 consecutive poll failures, so a frozen board can't masquerade as live.
- **S11 / S14 (LossActionSheet)** — with no manager signed in, "Request a manager's approval" becomes the
  primary action (the PIN path can't complete); a missing reason now shows an inline "Pick a reason to
  continue" validation instead of a silently-disabled CTA.
- **S12 / S13 (refactors)** — a shared `DINER_STATE_COPY`/`STAFF_STATE_COPY` line-state vocabulary, and a
  shared `<ManagerPinStepUp>` (manager select + PIN + lockout + PIN-failure copy) de-duplicating the
  LossActionSheet/ApprovalsBoard step-up.

### Added — S2.4: the approvals primitive (request → approve/deny → audit) (2026-06-22)

Generalizes S2.3's manager-present void/comp into a full **request → approve/deny → audit** flow with
**default-safe `pending` states** (D1–D4). Migration `20260622080000`. **Completes S2.**

- **`mms_request_approval`** — when no manager is at hand, a server requests a gated void/comp. Creates a
  **`pending`** `mms_approvals` row and **does not touch the line** (still charged, food not un-fired — the
  default-safe state, D2). Refuses if the action is server-solo (`no_approval_needed`) or the line is
  already voided/comped. A **partial unique index** (`line_id WHERE status='pending'`) blocks a second open
  request per line (`already_pending`, D4).
- **`mms_resolve_approval`** — a manager's decision: **approve** applies the recorded action (void→`voided`
  / comp→`comped`) + flips the row `approved`; **deny** flips `denied` and leaves the line live. Resolves a
  row **only once** (idempotent on `pending`, D4); the approver must be an **active `manager`/`owner` ≠ the
  requester** (D3, re-checked in SQL). Approve requires the line still on an open cart (a settled-line refund
  stays the S4.3 seam); an already-applied line is a benign idempotent close.
- **`/staff/approvals`** — a manager-gated live queue (`ApprovalsBoard`, **polled** every 5s since the audit
  table is owner-read RLS and off the realtime publication) with per-request Approve/Deny via the manager-PIN
  step-up. A manager+ nav link on the floor with a pending count.
- **`LossActionSheet`** gains a **"Request approval"** path for gated actions (no PIN — the deferred sibling
  of "approve now"). The staff drill-down shows **"Approval requested"** on a line with an open request, so a
  second request can't stack. Owner-remote/SMS stays deferred — the `pending` states make it a notify-add.
- **Merge ↔ pending guard** (caught in pre-PR review): a one-tap table merge now **supersedes** any pending
  request on the source cart in the same transaction — so a merged-away line can't have its void/comp later
  applied to the wrong (target) table with a misleading audit. A `superseded` terminal status keeps the
  ledger honest (it wasn't a manager's denial); the loss can be cleanly re-requested on the merged table.

### Added — S2.3: loss-gated voids/comps + the first durable audit ledger (2026-06-22)

Server-initiated **void** (cancel + remove) and **comp** (free, kitchen still makes it) on a fired line,
gated by loss, with a two-party audit. Migration `20260622060000`.

- **The loss gate is SERVER-derived** (never client-asserted): a void of a `fired`-but-uncooked line under
  the ceiling → **server-solo + reason** (~zero loss, no PIN — avoids PIN-fatigue). A **cooked** line
  (`in_progress`/`served`), any **comp** (a giveaway), or any value **over the ceiling** (`$20` absolute,
  tunable in `mms_loss_config`) → **manager-PIN step-up**. `cooked?`/`loss` come from the line's state +
  value in `mms_void_line`, never the request body.
- **Manager step-up reuses `mms_staff_verify_pin`** (lockout-counted): the server taps the manager's name →
  the manager enters their PIN. A `server`-role PIN is **rejected even when correct**, and the approver
  **can't be the initiator** (no self-approval) — both re-checked in SQL.
- **`mms_approvals`** — the first **durable, append-only** audit ledger (the S2.4 approvals primitive,
  void as consumer #1): initiating server + authorizing manager + line + reason + amount + cooked flag,
  written **in the same transaction** as the state flip (no audit ⇒ no void). RLS default-deny, owner-read.
- **A voided/comped line is charged $0 everywhere** — `getCartTotals`, both promo RPCs, the cash-settle
  reconcile, and all three order-snapshot copies exclude `state='voided' OR comped`, so a void can't be
  silently charged and a comp re-derives the total correctly. The diner cart shows a **"Removed"** /
  **"Comped"** chip with a struck price; split shares exclude them so no one pays a removed item's share.
- **Staff UI:** post-fire lines on the table drill-down swap the qty stepper for a **Void / Comp** action
  (`LossActionSheet` — reason picker + manager name-picker + PIN, reusing the S1.1b PIN pattern); refused
  mid-payment (shared mutex). Refunding an **already-captured** line is out of scope here — it rides S4.3.
- **a11y:** the sheet's action/reason are `role="group"` + `aria-pressed` toggles (the app's segmented
  convention), the manager is a labelled `<select>`, the PIN reuses the numeric pattern, ≥44px targets,
  one live region; voided/comped lines are struck + badged on the staff drill-down too.
- **Merge guard** (`20260622070000`): `mms_merge_table_orders` now skips voided/comped lines on both the
  source and target scans, so a one-tap table merge can't fold a voided line's qty into an active target
  (re-charge) or an active line into a comped/voided target (giveaway) — a gap S2.3 made reachable.

### Added — S2.2: post-fire "Ask server" + server-clocked undo grace (2026-06-22)

Thread the real line state into the diner cart and give the host a 10s undo on a send.

- **`mms_fire_cart` now stamps `fire_at = now() + 10s`** (the undo grace; Min's S2 decision, ORDER-MODEL
  default 5s). The KDS already reads only `fire_at <= now()` (S2.1b), so a just-sent line is visibly
  **`fired`** to the table but **invisible to the kitchen** until its grace elapses. Migration
  `20260622050000`.
- **`mms_undo_fire(cart)`** — atomic, grace-gated batch `fired→draft` (+ `fire_at=null`): reverses only the
  **latest in-grace batch** (`fire_at = max(in-grace fire_at)`, cart-`open` + dine-in guarded), so a rapid
  fire-A-then-fire-B never lets one Undo silently claw back batch A; a line whose grace already passed is
  left `fired` (the kitchen has it → removal routes to a void, S2.3). INVOKER + service-role-only.
- **`canMutateLine` now keys on the real `line.state` everywhere** — `getCartView` threads `state` +
  `fire_at` into `CartItem`; a `draft` line keeps its stepper, a fired/cooking/served line shows a state
  chip (**"Ask a server"**) in its place. Fixes the solo-dine-in gap where a fired line stayed editable in
  the UI. `LineState` is now canonical in `@mms/db` (cart + the isomorphic gate share one definition).
- **"Sent ✓ — Undo (Ns)"** window on the host's send button — counts down the **server-measured** grace
  (`undoUntil − serverNow`, from this client's receipt, so client-clock skew can't lengthen it); Undo
  re-checks the grace server-side (`expired` ⇒ honest "ask a server"), so a drifted client clock can't
  extend it either. Re-syncs the cart on send/undo (solo dine-in isn't on the realtime channel).
- **a11y:** state chip ≥44px with a visually-hidden "ask a server" hint (real text, not an `aria-label` on
  a bare span); the countdown lives in the button label, **not** the live region (no per-second SR flood);
  focus moves to the heading only when a replaced stepper actually drops focus to `<body>` (B4).

### Added — S2.1b: fire mechanism + KDS + bump (2026-06-22)

The kitchen loop on the S2.1a spine: send-to-kitchen → live fire queue → two-stage bump.

- **`qr_cart_items.fire_at`** — the ONE unified fire timer (S2_DESIGN spine #3). Dine-in stamps `now()`
  on send (immediate); pickup's scheduled per-line fire is the S4.2 seam. Partial KDS index on
  `(fire_at) where state in ('fired','in_progress')`. Migration `20260622040000`.
- **`mms_fire_cart(cart)`** — one atomic statement: `draft→fired` + `fire_at=now()` for the cart's draft
  batch, **only** while the parent cart is `open` **and** the session is **dine-in** — so a paid/cancelled
  cart fires 0 (A3), grocery `scango` never fires (A5, locks at payment), pickup's scheduled fire is
  excluded, and a re-send is a clean no-op (A2, no double-fire). INVOKER + service-role-only.
- **KDS console** at `/staff/kitchen` (`lib/kitchen.ts` · `KdsBoard`) — the live cross-table fire queue
  grouped into per-table tickets, oldest-first, on the proven S1.2 `postgres_changes` read path (no
  broadcast/privatization). Cook bumps **Start** (`fired→in_progress`) → **Ready** (`in_progress→served`,
  drops off) via the shipped `mms_line_transition`; a stale tap on an already-bumped line is a benign
  "already updated". Only lines past their `fire_at` show (so the S2.2 undo grace keeps a just-sent line
  off the line until it expires).
- **Diner "Send to kitchen"** (dine-in **host**, `cart.ts` `sendToKitchen` + `SendToKitchenButton`) and a
  staff **fire from the console** (`staffFireCart`) — both fire via `mms_fire_cart` (server re-enforces
  host/dine-in/cart-open). Honest confirmation, no fabricated ETA; the ~10s "Sent! — Undo" grace lands in
  S2.2.
- Diner post-fire edit rejection is now **honest** ("Ask a server to change an item that's already gone to
  the kitchen") — the full client-side disable + undo arrive in S2.2.
- Verified on the local stack (fire dine-in/grocery/pickup/non-open/re-send + the bump chain + grants +
  index); gate green; types regenerated. Migration **pending a live apply**.

### Added — S2.1a: line-state spine (2026-06-22)

The pre-settlement line lifecycle the kitchen-trust layer (S2) is built on — spine only, no UI/firing yet.

- **`qr_cart_items.state`** (`draft|fired|in_progress|served|voided`, default `draft`, DB `CHECK`) — the
  line's kitchen-life lives on the open cart (which _is_ the table order until settle), not `qr_orders`.
  Existing rows backfill to `draft` (nothing fired pre-S2). Migration `20260622030000`.
- **`mms_line_transition(line, to_state)`** — the legal-edge graph in SQL (`draft→fired→in_progress→served`,
  `fired→draft` undo, `→voided` from any non-settled state); a single atomic UPDATE that matches only a
  legal from-state **and** a parent cart `status='open'`, so an illegal jump / terminal-state mutation /
  non-open cart is a 0-row no-op (never a silent overwrite). INVOKER + service-role-only grant (the
  cart-RPC precedent; avoids advisor 0029).
- **`canMutateLine` v2** (`apps/qr/lib/permissions.ts`) — **staff are now a first-class actor**. A diner may
  edit only an OWN, still-`draft` line; post-fire editing is staff-only (fixes the M3 placeholder that let a
  diner "host" edit fired food). Threaded through the diner server path (`assertCartItemMember` now returns
  `lineState`; `cart.ts` passes the real state) so firing (S2.1b) can never outpace the gate.
- Verified on the local stack (all legal/illegal/terminal/non-open transitions + the backfill + grants);
  types regenerated; gate green. Migration **pending a live apply**.
- **S2 open decisions confirmed** (see `docs/S2_DESIGN.md`): manager taps-name→PIN · console-view KDS ·
  20%/$20 loss ceiling · 10s per-batch undo grace.

### Fixed — S1 audit S2 + S7: session-gated settlement + staff-provisioning hardening (2026-06-22) — audit closeout

Closes the last two audit SHOULD-FIX items.

- **S2 — session-gate cash settle + merge** (migration `20260622020000`): `mms_fulfill_cash_order` and
  `mms_merge_table_orders` only checked the cart was `open`, not that its `table_sessions` row was still
  open. The background sweeper (`mms_sweep_expired_sessions`) closes an idle session **without** cancelling
  its cart, so an `open` cart can outlive its session — letting a cash settle or a merge record against a
  closed table (the invariant previously lived in `clearTable`'s ordering, which the sweeper bypasses).
  Both RPCs now fold `exists(table_sessions … status <> 'closed')` into the atomic claim / open-count
  check. The **card** path (`mms_fulfill_order`) is intentionally left ungated — a captured Stripe charge
  must fulfill regardless of session state (its guard is the cart-status claim). Verified on the local
  stack: open-session settle succeeds; closed-session settle/merge refuse, cart left untouched.
- **S7 — staff-provisioning hardening** (`staff-actions.ts`): owner provisioning (a) leaked account
  existence ("that email already has an account") — now a **generic** "couldn't create" message (no
  existence oracle); (b) had **no rate limit** — now a coarse per-owner `mms_rate_limit` (20/hour, the
  existing generic limiter); (c) wrote **no audit trail** — now emits PostHog audit events
  (`staff_provisioned` / `staff_deactivated` / `staff_reactivated`), parity with clear/merge/settle.
- **S1 retrospective audit fully remediated** — both blockers (B1, B2) and all seven SHOULD-FIX (S1–S7)
  closed; see `docs/S1_AUDIT.md`.

### Fixed — S1 audit B3 + a11y batch: staff floor accessibility (2026-06-22)

No-migration accessibility/UX pass over the staff floor drill-down.

- **B3 — `RoleBadge` contrast** (`RoleBadge.tsx`, `tokens.css`): role-chip text used the vivid
  `--gold`/`--jade`/`--ac` on their own 14–16% tint — measured **1.83:1** (owner gold), 4.04 (server),
  4.73 (manager): two sub-AA. Text now uses the `-strong` token (added `--gold-strong`/`--jade-strong`
  alongside the existing `--ac-strong`); the vivid hue stays on the decorative (aria-hidden) dot for the
  color identity. Re-measured: **5.21 / 5.19 / 5.92** — all clear AA.
- **S4 — sold-out `+`** (`StaffLineEditor.tsx`, `floor.ts`, `floor-types.ts`): an 86'd line still showed a
  live increment. `TableLineView` now carries `soldOut` (resolved from `menu_items.is_sold_out` via the
  line's `menu_item_id`); the `+` is disabled with an honest accessible name ("… is sold out — can't add
  more") and a visible "· Sold out" tag. Decrease/remove stay available.
- **S5 — dual live regions** (`ClearTableButton.tsx`): its error was a second `aria-live="polite"` region
  on a view that already has one (the shared line-edit status). Switched to an assertive `role="alert"`
  rendered only on error — parity with its siblings (CashSettle/Merge), leaving exactly one polite region.
- **S6 — dropped focus** (`ClearTableButton.tsx`, `CashSettleButton.tsx`, `MergeTableButton.tsx`): focus
  fell to `<body>` when a confirm/step panel mounted/unmounted. Focus now moves into each panel as it
  opens and returns to the trigger on cancel/close (first-mount guarded) — WCAG 2.4.3, parity with
  `FloorDetailLive`'s line-remove focus move.

### Fixed — S1 audit B2/S1/S3: money atomicity + fulfillment completeness (2026-06-22)

Closes the audit's second blocker (the card-after-cash double-charge) plus the fulfill-claim TOCTOU and
the stranded-charge recovery gap — and restores two behaviors a prior redefinition had silently dropped.

- **B2 — card-after-cash double-charge** (`apps/qr/lib/staff-cart.ts`): `settleCash` now **atomically
  acquires the settlement freeze** (`acquireSettlement`) before deriving totals, releasing it on every
  exit. `acquireSettlement` flips `settle_at` only when the cart is open **and** `locked=false`, and
  `acquireCartLock` already requires `settle_at` null/stale — so cash and card are now mutually exclusive
  in **both** directions. Previously a diner could begin + capture a card payment during the
  `getCartTotals→RPC` window, and the late webhook would orphan that charge.
- **S1 — atomic fulfill claim** (`mms_fulfill_order`): replaced the non-atomic `exists(open)` check +
  separate trailing `update` with a single `update … set status='paid' where status='open' returning
session_id` claim (parity with the cash twin) — closing the TOCTOU where a concurrent cash settle
  between the two statements could double-record.
- **Regression fixes (introduced by S1.3's redefinition of `mms_fulfill_order`):** restored the cart's
  **`pickup_slot`/`fire_at` copy** onto the order (broke `/track`'s pickup ETA + the S2 KDS `fire_at`
  seam for card orders) and the **`mms_promo_consume` call** at fulfillment (promo redemptions weren't
  recorded → per-session/global caps under-counted). Added promo-consume to the **cash** twin too, for
  cap integrity on a cash-settled promo cart.
- **S3 — durable refund-needed ledger** (`qr_refunds_needed`, migration `20260622010000`): on the
  cross-tender branch the webhook now records the captured-but-orphaned PI (idempotent on the PI,
  best-effort) so an operator / S4.3 auto-refund has a recovery surface — telemetry alone stranded the
  charge. Service-role-only (default-deny RLS).
- Money path verified on the local stack (atomic claim · idempotent-on-PI · cross-tender raise → 1 order ·
  pickup_slot/fire_at copied · promo redemption recorded · ledger default-deny); types regenerated; gate
  green. **Needs a live migration apply** (additive/idempotent).

### Fixed — S1 audit B1: `is_staff()` unverified-email RLS escalation (2026-06-22)

The S1 retrospective audit ([`docs/S1_AUDIT.md`](docs/S1_AUDIT.md)) found the SQL `is_staff()` /
`is_staff_at_least()` email-allowlist branch trusted the **raw JWT `email` claim** with no verification —
and because RLS/Realtime evaluate it **directly** (bypassing the app's `getStaffAuth` `email_confirmed_at`
check), a session asserting a provisioned staff email could **read every active table's diner data + the
staff roster**. Writes were never exposed (mutations go through `requireStaff`).

- **Fix** (`20260622000000_is_staff_email_verified.sql`): the email branch now resolves through a
  `staff_session_email_match()` SECURITY DEFINER helper that reads `auth.users` for the current
  `auth.uid()` and requires the email be **confirmed** (`email_confirmed_at`) **and** from a
  provider-verified **OAuth** identity (`provider <> 'email'`) — never the spoofable claim. Provisioned +
  bootstrapped staff (and OTP sign-ins into their pre-created user) still match by `user_id = auth.uid()`,
  unaffected. Verified on the local stack across five identity scenarios; types regenerated; gate green.
- **⚠️ Binding backstop is live auth config (Min):** disable public email/password signup (staff are
  admin-provisioned; diners use anonymous sign-in) **or** turn email confirmations ON, and restrict the
  Google provider to the workspace domain with automatic cross-provider linking off. Under
  confirmations-OFF auto-confirm, the `provider <> 'email'` guard is what holds the RLS layer.

### Added — S1.4 soft convergence (one-tap table merge) (2026-06-21)

The recovery for a double-order (a guest scans **and** tells the server). The ORDER-MODEL convergence is
**soft/advisory** — phones, the staff POS, and the kiosk all write the same table session, the floor shows
table state, and the cleanup for the occasional parallel order is a **one-tap merge**, not a billing dispute.

- **One-tap merge** (`MergeTableButton` on `FloorDetailLive` → `mergeTables`): from a table's drill-down a
  server folds **this** table's open order into another, then this table closes. Pick a same-mode candidate
  from a legible list (label · item count · party), confirm, and the lines move. **Any active staff** may
  merge (a non-loss turnover cleanup, like clear-table — no manager-PIN; that step-up is reserved for S2's
  loss-gated voids/comps/refunds); logged non-PII (`staff_merge_tables`: role, units moved, both sessions).
- **Server-authoritative, atomic** (`mms_merge_table_orders`): re-parents **already-server-priced** lines
  (never recomputes or trusts a client price) — bumps an identical target line (same item + normalized,
  order-independent modifier set) when it stays within the 99-per-line cap, else re-parents it as its own
  line so **no units are ever dropped**; moved lines lose seat attribution (`by_seat = null`). Both carts are
  row-locked and must still be `open`, so a concurrent settle/clear loses the race cleanly. The action refuses
  a closed/paid table, a cross-mode merge (per-line tax basis is dine-in vs to-go), or either side mid-payment
  (shared `pay-guard` mutex). Source cart → `cancelled`, source session → `closed` (the diner-side guards
  already honor both, so a racing source-diner write lands on a closed door).
- **Honest scope:** the system can't auto-detect that two labels are one physical table (the sticker
  `qr_code` is the only identity and it's unique per active session), so convergence is an **explicit** staff
  tool over the floor's legibility (S1.2), not a fabricated divergence alarm. **Session expiry** is already
  covered (`mms_sweep_expired_sessions` on pg_cron + the `expires_at` floor filter + sliding renewal, P3.4).
- **DB:** migration `20260621160000_table_merge.sql` (one SECURITY DEFINER fn, `revoke … from public, anon,
authenticated` + `grant … to service_role`); types regenerated. Money path verified on the local stack
  (merge, identical-line bump across modifier order, 99-cap re-parent with no unit loss, non-open/same-cart
  raises, grant lockdown). **Completes S1 (staff & floor).**

### Added — S1.3 staff write + cash settle ("order for a guest" · "pay a human") (2026-06-21)

The door for humans (ORDER-MODEL): the cart belongs to the **table**, not the phone, so staff write the
**same** order ledger a diner does — and "pay a human" / cash is a deferred-settlement of that one order.

- **Staff order for a guest** (`/staff/table/[id]`, `FloorDetailLive` + `/staff/table/[id]/add`): from the
  drill-down a server can **add items** (the same public catalog as the diner menu, base item — no modifier
  tier, parity with `AddButton`), **bump qty / remove** lines (qty steppers; staff have authority over
  **any** line — no `canMutateLine` restriction, unlike a guest). Pricing stays **100% server-authoritative**
  — the client sends only item ids, never a price — via the shared `lib/order-lines.ts` (`priceItem` +
  `insertOrIncLine`, extracted from `cart.ts` so the diner and staff paths can't drift). Staff-added lines
  carry `by_seat = null` ("added by server", unassigned for the by-person split).
- **Settle in cash** (`CashSettleButton` → `settleCash`): records the table order as paid with `tender='cash'`,
  no Stripe. `getCartTotals` (the single tax engine) derives the authoritative total — `subtotal − discount
  - service + tax`, **`tip=0`** (a cash tip is in-hand/off-system) — and `mms_fulfill_cash_order`snapshots it:
**idempotent on`cart_id`** (partial-unique index), **atomic `open→paid` flip**, and a **subtotal reconcile**
    (re-derives Σ lines in SQL vs the passed breakdown) so a diner racing the settle raises instead of recording
    a stale total. The **SB-1524 5% service charge\*\* is applied + disclosed; the confirm shows the all-in amount.
- **Shared payment mutex** (`lib/pay-guard.ts`, `paymentInFlightReason`): clear-table (refactored onto it),
  staff write, and cash settle all refuse while a card payment / split settlement is in flight (fresh
  single-pay lock, open split freeze, or any authorized/captured share) — so cash can't double-charge a table
  and a write can't change a total a diner is paying. The card path (`acquireCartLock` requires `status='open'`)
  can't start after a cash settle; cash is refused while the lock is held → no card-vs-cash double-charge.
- **Logged, non-PII** (PostHog, decoupled via `after()`): `staff_added_item` / `staff_settle_cash` (role, not
  name; total + item count) for the turnover/audit trail. The durable two-party audit table arrives with S2.
- **Schema** (migration `20260621150000`, additive/guarded): `qr_orders.tender` (`card`|`cash`, default
  `card` backfills existing), `cart_id` (cash idempotency + traceability), `settled_by` (→ `staff.user_id`);
  the cash RPC is `revoke … from public` + `grant … to service_role`. RLS unchanged (diners read only their
  own session's orders, cash included). Verified on the local stack: happy path, idempotent retry,
  subtotal-mismatch raise, double-settle raise.

### Added — S1.2 staff floor view (live per-table state + read-only drill-down + clear-table) (2026-06-21)

The "legible table state" that makes soft multi-door convergence work (ORDER-MODEL): a server glances at
`/staff` and sees the whole room, live.

- **Live floor** (`/staff`, `FloorBoard`): every **active** table (status='active' AND not past its TTL —
  the same liveness `is_member` uses) as a card — label (`qr_code`), mode, **status** (seated / ordering /
  paying / splitting / paid), party + host, a **running pre-tax subtotal** (honest "so far" — NOT a charge;
  the authoritative total/tax is derived at checkout, so we don't re-run the tax engine per table on the
  hot path nor mirror the rule in SQL) or the authoritative `qr_orders.total_cents` once paid, and relative
  last-activity. Kept live by **Postgres-Changes** (`useFloorRealtime`) authorized by the **existing
  `is_staff()` SELECT RLS** S1.1a folded into the session/cart/order tables — Realtime enforces it
  per-subscriber, so a staff socket sees every table and a diner sees none. Non-private channel (reads are
  RLS-gated); a staff _broadcast_ push (S2 KDS→floor) is the only thing that would need a
  `realtime.messages` is_staff() policy. 400ms-debounced re-fetch of the server-authoritative snapshot + a
  5s poll backstop + subscribe-time self-heal (parity with the group-cart board).
- **Read-only drill-down** (`/staff/table/[id]`, `FloorDetailLive`): the party and the actual cart lines
  (with split attribution), kept live by watching the open cart's `qr_cart_items` by `cart_id` (nothing
  bumps `qr_carts.updated_at`, so last-activity + the live refresh key off the latest line, not that
  column).
- **Clear table** (`clearTable`): staff turnover — closes the session + cancels the open cart so a ghost
  cart never carries to the next party. Any active staff (routine turnover, **not** a loss action → no PIN,
  unlike an S2 void); two-step confirm; **refuses while a payment is in flight** (a fresh single-pay lock /
  split freeze) **and** if any split share is already `authorized`/`captured` (so a stale-but-committed
  split can't be cancelled out from under a capture → no charge-with-no-order). Logged non-PII via PostHog
  (`after()`-decoupled); the durable two-party audit table lands with S2's approvals primitive.
- All three reads + the write are `requireStaff()` + service-role (the cross-table floor is staff-only by
  design, so the gate is at the action, not RLS rows); inputs Zod/uuid-bounded. Migration
  `20260621140000_floor_realtime.sql` adds `table_sessions` + `session_members` to the realtime publication
  (publication membership only — no schema/type change). Adversarial subagent: PASS (F1 live-update
  correctness + F2 split-share clear guard + F3 id validation fixed pre-PR).

### Added — S1.1b staff PIN (shared-tablet fast-path + the S2 step-up primitive) (2026-06-21)

A per-person **PIN** for a shared floor tablet, built as "sudo on the existing role model" (ORDER-MODEL):
a staff member signs in for real (S1.1a magic-link / OAuth / OTP) once, then sets a PIN so they can
re-authorize on the shared device without another email round-trip. The verify-with-lockout function is
the **same primitive S2's manager step-up** (cooked-item void / refund) will reuse.

- **Secret isolation:** the bcrypt hash lives in its OWN service-role-only table `staff_pins` (RLS
  default-deny, `revoke … from anon, authenticated`), NOT a column on `staff` — `staff` is
  client-readable by self/owner, so a `pin_hash` column would be reachable; a separate table keeps it
  off every client read surface (the `rate_events`/`promo_attempts` pattern). Hash is bcrypt via
  pgcrypto (`extensions.crypt`/`gen_salt('bf',10)`).
- **Atomic verify + lockout** (`mms_staff_verify_pin`, SECURITY DEFINER, `search_path=''`): an advisory
  xact lock keyed by the staff id serializes concurrent attempts so the counter can't be raced; **5**
  consecutive misses → a **15-minute** lockout; a lapsed lockout grants a fresh budget; a correct PIN
  resets. Returns one of `ok | wrong | locked | no_pin` + remaining attempts / lock expiry. **Fail-CLOSED**
  in the app wrapper (an RPC error reads as `error`, never a pass — it guards a privileged step-up).
- **Keyed by the resolved staff-row PK** (`StaffCaller.staffId`), not the session uid — an email-matched
  Google/magic-link session whose uid differs from the provisioned row still lands on the right PIN.
- **Set / rotate / remove** self-service at `/staff/profile` (`PinManager`); 4–8 digits, trivial PINs
  (all-same / consecutive runs, any length) rejected; bounded by Zod **and** the SQL `pin_format` CHECK.
- **Shared-tablet lock** (`/staff/lock`): a "Lock" control sets an httpOnly, path-scoped cookie and the
  staff shell (`/staff`, `/staff/team`, `/staff/profile`) redirects there until the SAME member re-enters
  their PIN. Documented honestly as an **attribution / quick-privacy affordance, not a hard boundary**
  (the Supabase session + staff-row gate remain the real boundary). Escapes: "Forgot PIN? Sign out", and
  lock is refused unless a PIN is set (no stranding). Lockout shows a live countdown; one live region per
  view, 44px targets, decorative glyphs `aria-hidden`.
- All three fns locked down (`revoke … from public, anon, authenticated` + `grant … to service_role`).
  Migration `20260621130000_staff_pin.sql` (additive); types regenerated. Adversarial subagent **PASS**.

### Fixed — staff OTP resend loop (per-address cooldown; 429 steers to Google) (2026-06-21)

The "Too many code requests. Wait a minute…" loop on `/staff/login` was **not** a hanging Send-Email Hook
(auth logs show GoTrue's `/otp` durations are all sub-second) — it's GoTrue's own
**`over_email_send_rate_limit`** (429), the email rate limit that fires _before_ the hook (so unrelated to
Resend). The code enabler: `StaffLogin`'s 60s resend cooldown was reset on **every keystroke**, so editing
the email even one character wiped the gate → an instant re-tap → tripping the limit. The cooldown is now
**scoped to the address it was sent to** (clearing-and-retyping the same address can't wipe it; a genuinely
different address sends freely). The 60s "Resend in Ns" countdown now appears only after a **successful**
send (where ~60s is the honest per-address window); a **429 instead blocks the address and steers to
Google** (no email, never rate-limited) rather than arming a 60s countdown that would just re-enable into
the same hourly cap. A send error also returns focus to the email field (it was stranded on the disabled
button), and the status region is `aria-describedby`-linked so it's read on that focus. The real unblock is
a config change — raise Supabase → Auth → **Rate Limits → "Rate limit for sending emails"** (`docs/ENV.md`).

### Fixed — OTP code input accepts the token as-issued; magic link restored (2026-06-21)

The real cause of "code doesn't match" was the **input**, not the link: `StaffLogin` stripped non-digits
(`replace(/\D/g,"")`), capped at `maxLength={6}`, and required exactly 6 chars — so a token that's longer
or not purely numeric (Supabase's OTP length is configurable) could never equal the issued token. The
input now accepts the token as-issued (strips whitespace only, no digit-strip, no 6-cap, `length >= 6`).
The **magic link is restored** in the auth email (it wasn't the problem — #41's code-only build still
failed, which is what isolated this to the input). `tokenLen` is still logged for confirmation.

### Fixed — auth email is code-only (OTP `otp_expired`) (2026-06-21)

The OTP code kept failing "doesn't match" (`otp_expired` in the auth logs) while the magic link
sometimes worked: the 6-digit code and the magic link are **one single-use Supabase token**, and Gmail
**pre-fetches the link** (observed as a Google-IP `GET /verify` consuming the token) before the code can
be typed. The Send-Email Hook (`/api/auth/send-email`) now sends a **code-only** email — no magic link
to pre-consume — so the typed code stays valid. One-click sign-in remains via Google OAuth. (A
non-secret `tokenLen` is logged so any future mismatch is diagnosable.)

### Added — Polished auth emails via Supabase Send-Email Hook + React Email (2026-06-21)

Makes magic-link/OTP work reliably with polished templates (delivery-app stack), and removes the SMTP
pain entirely: auth emails now route through a **Supabase Send-Email Hook** to our app, which renders a
**React Email** template and sends via the **Resend API** — no SMTP to misconfigure (this is what was
causing the Gmail `534`/500) or rate-limit.

- **`/api/auth/send-email`** — the Send-Email Hook endpoint. Verifies the Standard-Webhooks (Svix)
  signature (`SEND_EMAIL_HOOK_SECRET`) + a ±5-min replay window via a shared `lib/standard-webhook.ts`,
  then renders + sends. The **6-digit code is the hero** (typed on `/staff/login`, immune to email
  link-prefetchers that consume a single-use magic link — the `otp_expired` we were hitting); the magic
  link is a secondary button. A send failure returns 500 so GoTrue surfaces it (the user is waiting).
- **React Email templates** (`apps/qr/emails/`, `@react-email/components` + `/render`, same as the
  delivery app) — a shared brand `MmsEmailLayout` + `AuthCodeEmail`, and the staff **invite/deactivation**
  emails migrated off inline HTML to React Email (`lib/email.ts` → `lib/email.tsx`). Brand-aligned
  (literal palette — email's sanctioned token exception).
- **Config** (you): enable the Send-Email Hook in Supabase + set `SEND_EMAIL_HOOK_SECRET` (`docs/ENV.md`
  "Email"). No SMTP needed.

### Added — Staff Google OAuth + email allowlist (2026-06-21)

Staff sign-in now supports **Google OAuth** alongside magic-link + OTP — and Google sidesteps the SMTP
issues entirely (the built-in Supabase sender was rate-limited, then misconfigured to Gmail → `534`/500).
All three methods resolve to the same **email allowlist**, so identity is robust across auth methods.

- **Migration `…120000_staff_oauth_email`** (additive, non-destructive) — `staff` gains an `email`
  column (unique on `lower(email)`); `is_staff()` / `is_staff_at_least()` / `staff_read_self` now match
  **`user_id` OR the verified email claim** (`auth.jwt()->>'email'`). So a Google/magic-link sign-in that
  mints a fresh uid still resolves to the provisioned row by email; `user_id` stays the PK (provisioning
  unchanged, OTP `shouldCreateUser:false` still works). Anon diners carry no email claim → no match.
  Applied to live + advisor-clean (anon still can't execute the helpers).
- **`StaffLogin`** — "Continue with Google" (`signInWithOAuth`) above the email path; `signInWithOtp` now
  sets `emailRedirectTo` so the magic **link** lands on the new **`/staff/auth/callback`** route (PKCE
  `exchangeCodeForSession` → `/staff`); the OTP **code** still verifies in-page (cross-device-safe).
- **Provisioning** — `provisionStaff` stores the (lower-cased) `email` on the row; `getStaffAuth` and the
  self-deactivation guard match by uid **or** email (a Google session uid can differ from the row's), and
  the deactivation notice now reads the row's stored email (no `getUserById`). Team view shows the email.
- **Config** (you): Google Cloud OAuth web client + Supabase Google provider + redirect URL — see
  `docs/ENV.md` "Staff sign-in" + the simplified owner bootstrap.

### Added — Resend email-events webhook (2026-06-21)

- **`/api/resend/webhook`** — a signed, public endpoint for Resend email events (delivered / bounced /
  complained / …). Verifies the **Svix** signature (`RESEND_SIGNING_SECRET`, via `node:crypto` — no new
  dep) + a ±5-min replay window before trusting anything, then **flags bounces/complaints** in server
  logs (the actionable "an invite didn't land" signal — masked recipient + opaque `email_id`, never the
  raw address) and captures **PII-free** deliverability events to PostHog. Idempotent + fail-safe (200
  after verify; a processing hiccup never triggers an endless retry); drains analytics via `after()`.
  Mirrors the Stripe-webhook conventions; the middleware matcher already skips `/api`.
- **Prod-domain fallback** — `siteUrl()` (email links) now falls back to `https://qr.mandalaymorningstar.com`
  (the real prod domain) when `NEXT_PUBLIC_SITE_URL`/`VERCEL_PROJECT_PRODUCTION_URL` are unset. Docs
  (`ENV.md`, `HANDOFF.md`) gain `RESEND_SIGNING_SECRET` + the webhook-setup step.

### Added — Staff email (Resend) + login hardening (2026-06-21)

Follow-up to S1.1a after owner sign-in hit Supabase's built-in email rate limit (429) and the magic-link
email shipped only a link, not the OTP code the UI expects.

- **Resend transactional email** (`apps/qr/lib/email.ts`, same `resend` SDK as the delivery app) — a
  fail-safe wrapper (never throws into the caller; unset keys = skipped + logged) sending two staff-
  lifecycle emails, both fired from `after()` so a Resend outage never fails the mutation: an **invite**
  on `provisionStaff` ("you've been added as {role}, sign in here") and a **deactivation notice** on
  `setStaffActive(false)`. Owner-entered name is HTML-escaped; links use `NEXT_PUBLIC_SITE_URL`
  (falls back to the Vercel URL). Email colors are literal brand values (clients can't use `@mms/ui`
  tokens — the one sanctioned exception).
- **Login hardening** (`StaffLogin`) — a **429 is now distinguished** from a bad address ("too many
  requests, wait a minute" vs "check it's your staff address"), and a **60-second resend cooldown**
  with a live countdown (`Resend in {n}s`) stops users re-tripping the rate limit.
- **Docs** — `docs/ENV.md` gains the Resend/SMTP env (`RESEND_API_KEY`/`RESEND_FROM`/`NEXT_PUBLIC_SITE_URL`)
  - an "Email" section: auth emails go via **Supabase Auth → SMTP pointed at Resend** (with the
    `{{ .Token }}` template fix + rate-limit raise), app email via the SDK. Added to the HANDOFF activation
    checklist (required for staff login to work at volume).

### Added — S1.1a Staff identity, roles & RLS (2026-06-21)

The foundation of the **service-model track** ([`docs/context/ORDER-MODEL.md`](docs/context/ORDER-MODEL.md)):
a staff console at `/staff`, distinct from anonymous diners. Staff are **real accounts** (magic-link /
email-OTP) with a role (**server < manager < owner**) and a stable `auth.uid()` — the per-person identity
the S2 two-party void audit will need. The order ledger stays shared: one table-owned cart that diners,
and now staff, both read. Migration applied to the QR project + advisor-checked; RLS verified behaviorally
(staff reads any table ✓, non-member diner blocked ✓, diner's own session unbroken ✓). Fresh-context
adversarial subagent run pre-PR (verdict: ship with fixes — all landed).

- **Migration `…100000_staff_identity`** — `staff` table (`user_id`→auth.users, role CHECK, name CHECK
  1..80, `active`); `is_staff()` / `is_staff_at_least(min_role)` SECURITY DEFINER helpers mirroring
  `is_member` (search_path pinned, `auth.uid()` wrapped, **revoked from public AND `anon` by name** —
  Supabase default privileges grant `anon`/`authenticated` EXECUTE explicitly, so `from public` alone
  leaves the anon grant; granted to `authenticated` for policy evaluation). RLS extended **additively** —
  `or public.is_staff()` folded into the six session-scoped SELECT policies via `ALTER POLICY` (one
  permissive policy per role/action; no advisor 0006). `staff` RLS = self-or-owner read; writes
  service-role only.
- **Auth surface** — `/staff/login` passwordless OTP (`signInWithOtp` `shouldCreateUser:false` → only
  provisioned accounts; `verifyOtp`); `AnonAuthGate` now **skips `/staff`** and, on diner routes, **swaps
  a stray non-anon (staff) session for a fresh anonymous one** so a staff uid can never back the diner
  surface on a shared browser. `/staff` distinguishes anon / not-staff / staff so a wrong account
  **recovers (sign out) instead of looping**.
- **Roles** — owner-only `/staff/team`: provision staff by email (service-role creates the OTP identity +
  staff row, rolls back the orphan auth user if the row insert fails), assign role, deactivate/reactivate
  (keeps the row for audit; guards self-deactivation). Every action re-checks `requireStaff('owner')`
  server-side — the client gating is cosmetic. a11y: per-member `aria-label`s, deliberate focus on step
  change, alert on the denied state.
- **Bootstrap** — there is deliberately **no self-serve first-owner path** (it would let any visitor seize
  ownership); the first owner is created out-of-band. See [`docs/HANDOFF.md`](docs/HANDOFF.md).

_Deferred to S1.1b: the shared-tablet **PIN** fast-path (the same PIN primitive S2's manager step-up reuses)._

### Fixed — M0/M1/M2 hardening (pre-S1 milestone red-team) (2026-06-21)

Five fresh-context adversarial lenses over M0 (foundations), M1 (single-pay spine + security/infra) and
M2 (promos · pickup · grocery · QBO). **The money/auth/RLS/secrets spine across all three is sound** —
tax on the discounted taxable base with TS↔SQL parity, reconcile-before-write + double idempotency,
server-authoritative amounts, promo enumeration/cap lockdown, pickup overbooking guards (holds + advisory
lock + anchor stability), QBO total-preserving + off-by-default + never-blocks-the-money-path + `server-only`
secrets, nonce CSP + SAQ-A card isolation + fail-fast env all verified. Edge/foundation fixes (no migration):

- **Burmese now actually renders (High).** Padauk was loaded with `subsets: ["latin"]` — but it's a
  Myanmar-script face, so `next/font` never fetched the Myanmar glyphs and every `name_my` string silently
  fell back to the system sans, defeating the bilingual moat. Now `["latin","myanmar"]` (`app/layout.tsx`).
- **Dark-mode token contrast to AA (Med).** `--t3` on Night surfaces was 4.40:1 (`--sf`) / 4.10:1 (`--cd`)
  — under AA; raised to `#9d95a8` (5.84 / 5.45), still dimmer than `--t2`. Latent today (no theme toggle
  until M5) but fixed before it ships. `tokens.css` header comment corrected (it overstated "AA verified")
  and now records the text×surface matrix + the `--ac-strong`-for-accent-on-tint rule.
- **`scanAdd` settling-guard parity (Med).** Grocery `scanAdd` now rejects edits during a split settlement
  like its restaurant siblings — unreachable in the solo grocery flow today, defense-in-depth per LEARNINGS
  #72 so a future multi-device grocery cart can't slip an edit mid-settle.
- **Analytics URL scrub widened + replay off (Low).** `before_send` now also strips Stripe
  `payment_intent`/`redirect_status` from `$current_url`/`$referrer` (order-correlatable ids — "opaque ids
  only", QA §C P2), and `disable_session_recording: true` asserts replay OFF in code (a Stripe iframe is on
  the pay screen). The scrub still covers the `?t=`/`?j=` join key.
- **Nits:** barcode comment aligned to the 8–14-digit regex; removed the unused `@mms/config/tsconfig`
  export + its orphan file (config drift).
- _Deferred (tracked):_ the M1-money sub-6¢ taxable-SKU inference (taxability read from `tax_cents>0`; no
  real SKU hits it; the clean fix needs a small data-model change) and the order-vs-line `tax_cents`
  snapshot granularity (charge is correct, receipt-sum cosmetic); QBO production-activation items
  (refresh-token rotation, drain advisory lock) — already on the activation checklist.

### Fixed — M3 hardening (pre-S1 milestone red-team) (2026-06-21)

A four-lens fresh-context adversarial pass over the whole M3 surface (group cart + split-tender + abuse
limits) before S1 builds on it found the money/auth/RLS spine sound; the escapes were at the edges. Fixed:

- **Split-tender completion no longer strands a paid diner (Critical).** The settlement board redirected
  every payer to `/track?cart=…`, which — having no Stripe `redirect_status`/`payment_intent` (each share
  has its own PI) — fell through to the "…once you've placed an order" stub. Now it redirects with
  `&paid=1`; `/track` resolves the split order via a member-gated `getSplitOrderId` (`lib/order.ts`,
  authorized on **session** membership since the cart is `paid`) and renders the live tracker — generalized
  `useOrderStatus`/`OrderTracker` to key by **order id** (split orders carry no PaymentIntent). An
  un-stamped order (brief post-capture race) shows an honest "payment received — finalizing", never a dead end.
- **Join code no longer leaks to analytics (High, privacy).** `instrumentation-client.ts` adds a
  `before_send` that scrubs `?t=`/`?j=` (the live session credential) from `$current_url`/`$referrer`, and
  `useTableSession` strips them from the address bar after consumption (localStorage still rejoins on
  reload). The server `onRequestError` path was already scrubbed; this closes the client pageview path.
- **Settlement board poll terminates (High).** `load()` short-circuits once the all-captured redirect
  fires, so the 5 s poll + realtime callbacks stop hitting a now-paid cart during navigation.
- **Cart can't increment a sold-out line (Med, QA §D).** `getCartView` resolves `menu_items.is_sold_out`
  (uuid-filtered so grocery barcodes are skipped) → `CartItem.soldOut`; the cart Stepper disables "+"
  (remove stays enabled).
- **A read-miss mid-split no longer drops a payer into an unwinnable plain checkout (Med).** `/cart` shows
  a retry when the cart is settling but `getSplitContext` returned null.
- **a11y (High/Med):** the sheet close ✕ is now a 44 px tap target (visible disc stays ~32 px via
  padding + `background-clip`); the menu list gets `role="list"`; a new `--ac-strong` token raises
  accent-text-on-tinted-fill to ≥4.5:1 (badges/chips/buttons across the split UI); the sheet/scrim honor
  `prefers-reduced-motion`.
- **Realtime broadcast guard (Med):** load-bearing comments on the non-private `cart:`/`shares:` channels
  — RLS-safe for postgres-changes today, but S2 must make them private + add a `realtime.messages` policy
  before adding any `.send()` broadcast.
- _Deferred (tracked):_ the split-fulfill amount reconcile is DB-sum-vs-DB-sum (tautological — becomes
  load-bearing at **S4.3** partial-capture); the P3.3a display vs P3.3b tender share-math divergence
  (label/align in a follow-up); cross-owner delete is host-only without a confirm (product sign-off).

### Added — M3·P3.4 abuse limits (2026-06-21)

- **Per-device rate limits** on the public POST surface. A generic SQL limiter (`rate_events` ledger +
  `mms_rate_limit(bucket, key, max, window)` — count-first / self-GC / reject-without-record, the proven
  `mms_promo_attempt` pattern) gates **join/mint** (`/api/session`, 30/min → 429) and **cart mutations**
  (addItem/setQty/assignLine/scanAdd/setDisplayName/openSettlement + both Stripe create-intent routes,
  120/min). Keyed by the **verified seat** (one device) — not per-session — so a hostile member can't DoS
  co-diners' shared cart. New-seat churn is bounded a layer down by GoTrue's anon sign-up limit.
  **Fail-open** (`apps/qr/lib/rate.ts`): a limiter glitch never strands a paying diner; the DB caps + lock
  - server-authoritative money remain the hard invariants.
- **Party-size cap (12)** on `session_members` via an **advisory-locked `BEFORE INSERT` trigger**
  (`mms_enforce_party_size`) — atomic under concurrent joins (count-then-insert can't overshoot). A
  friendly route pre-check returns a 409 on the common path; the trigger is the backstop and its
  `party_full` raise also maps to the 409. UI: cap-aware Invite (a "Table's full" note replaces the invite
  affordance at the cap) + honest copy, no retry on the terminal full case (`GuestList`/`InviteSheet`).
- **Background session sweeper** — `mms_sweep_expired_sessions()` on a **pg_cron** schedule (every 15 min)
  closes idle expired sessions so the `table_sessions_active_qr_uniq` slot stays clean (the backstop the
  index comment anticipated; renewal-on-write + the mint-time sweep already cover the in-use path). Also
  bounds the ephemeral ledgers. The schedule is **guarded** so a local CI stack without pg_cron applies
  the migration cleanly; the function works whether or not it's scheduled.
- **RLS membership negative tests** (`supabase/tests/rls_membership_test.sql`, wired into CI) — prove a
  non-member can't read another table's session/members/cart/items/shares/order under RLS (+ a positive
  control). Plain-SQL `assert`s in a rolled-back transaction; **verified PASS against the live project**.
- Migration `20260621000000_abuse_limits` (additive) applied to live + `get_advisors` clean (only the
  intentional `rate_events` default-deny INFO); all three new fns verified service-role-only. Adversarial
  subagent: **PASS** (zero Critical/High). _Deferred (Low, documented):_ a mutate-rate 429 in `add` shows
  the session-recovery copy (self-correcting; precise per-reason copy needs a result discriminant — the
  thrown message is redacted in prod).

### Added — M3·P3.3b split-tender (dine-in, Option A: authorize-all → capture-together) (2026-06-20)

- **Each diner pays their own card.** A host opens a split (`openSettlement`) → the cart freezes
  table-wide (`settle_at`) and the server derives a per-seat **base** breakdown
  (`deriveShareBreakdowns`): subtotal by assigned-line total, **tax on each seat's own taxable base**,
  service on net, discount pro-rata — every component largest-remainder so **Σ shares == the cart total
  to the cent**. Each payer authorizes their share on a `capture_method: manual` PaymentIntent
  (`create-share-intent`, server-derived amount + their own tip; the client never sends a price).
- **No money moves until the table is covered.** The webhook captures **all** shares together once the
  last authorizes, then `mms_fulfill_split_order` snapshots the **one** order (idempotent on the cart
  open→paid flip; reconciles Σ captured == the total) and lifts the freeze. **Abandon/decline cancels
  the holds** — no one is charged for an incomplete order.
- **Live settlement board** (`SettlementBoard` + `useSettlementRealtime` on `qr_cart_shares`): every
  phone sees shares flip pending → authorized → captured live, with an "$X of $Y authorized" progress;
  the viewer pays inline (`SharePay`), the host can cancel, and all-captured sends the table to the receipt.
- **Money-safety hardening** (two adversarial passes): capture is gated on a **live** settlement
  (cart open + fresh freeze) so a stale/aborted/taken-over settlement is never captured; abort claims
  first + defers to an in-flight capture + never deletes a captured share; each capture is **verified**
  (re-fetch on `unexpected_state`) so a canceled PI can't be mismarked captured. Residual sub-ms races
  fail **loud** (the fulfill fn raises), never silent — the "never charged-with-no-order" promise.
- **`qr_cart_shares` ledger** + `settle_at`/`settle_by` freeze; member-read RLS, realtime, service-role
  fulfill fn. Single-pay and split are mutually exclusive at the lock/freeze acquire boundary.

### Added — production error tracking (PostHog, client + server) (2026-06-20)

- **Server-side capture** (`apps/qr/instrumentation.ts` `onRequestError`): every uncaught error in a
  Server Component / Server Action / route handler now reports to PostHog via
  `captureExceptionImmediate` (captures **and** flushes — serverless-safe). This closes the gap that
  made the session-expiry bug hard to diagnose: a thrown Server Action error is **redacted in prod**,
  so it never reached the client or any tool — diagnosis meant reading Supabase logs. Personless,
  opaque non-PII context only (path / route / method — QA §C P2); Node-runtime-guarded so the Edge
  middleware bundle never pulls in the Node client.
- **Client-side** exception capture was already on (`posthog-js capture_exceptions: true`). Added
  **branded error boundaries** — `app/error.tsx` (segment-level, recovers in place with the layout +
  session mounted) and `app/global-error.tsx` (root crash) — that **explicitly** `captureException`
  (React boundaries swallow errors before posthog-js's window.onerror auto-capture sees them) and
  offer an accessible "Try again" reset instead of Next's default screen.
- **No Sentry:** PostHog now covers both client and server exceptions with zero new deps/secrets;
  a second vendor would be redundant here (+112 packages + client-bundle weight + secrets to provision).

### Fixed — dine-in session expiry stranded diners ("Couldn't add that") (2026-06-20)

- **Root cause:** the table session's TTL is a hard **4h** (`table_sessions.expires_at default now() +
interval '4 hours'`). The mint route found a session by `status='active'` **only**, while
  `assertCartMember` **and** the `is_member` RLS fn reject on `expires_at <= now()` — so an expired-but-
  still-`active` session was handed back as "live", then every cart write `403`'d on it. The client
  surfaced the generic **"Couldn't add that — please try again"**, a retry that could never succeed.
- **Sliding renewal (server):** any authorized touch (`assertCartMember`) and every rejoin
  (`/api/session`) now slides `expires_at` forward — throttled to the back half of the window so a
  read-heavy path doesn't write each call. A table that's actually in use no longer expires mid-meal.
- **Expiry-consistent mint + sweep (server):** `findActive` now also requires `expires_at > now()`
  (matching authz + RLS); a stale expired session squatting on the `status='active'` partial unique
  index is **swept to `closed`** before minting fresh (the sweep that index's comment anticipated).
- **Graceful recovery (client):** a failed cart op now **re-mints** (`useTableSession.revalidate`)
  instead of stranding — the diner recovers without a manual reload, with an honest message that
  distinguishes a **renewed** session ("Reconnected — try that again") from a **timed-out** one
  ("we started a fresh order"). Schema-free (no migration); `apps/qr/lib/session-ttl.ts` mirrors the DB TTL.

### Added — M3·P3.3a split-the-bill foundation (dine-in) (2026-06-20)

- **Split the bill on `/cart`** (dine-in group): Even / By-person toggle, per-line avatar **assignment**
  (by-person), and a **cent-reconciled per-seat share** breakdown. Shares are computed **client-side
  from the server-authoritative grand total + lines** via the isomorphic `lib/split-math` (instant — no
  round-trip, no layout shift) — `largest-remainder so Σ shares == the total to the cent` (deterministic
  leftover penny — QA §D). The server share-derivation lands with the tender in P3.3b (same math).
- **`canMutate(line_state, actor_role, isOwner)`** (`lib/permissions.ts`, isomorphic) — the generalized
  mutation gate the S-track extends. M3: the **host** may edit/remove **any** line, a **guest** only
  their **own** (the cross-owner-delete guard). Enforced server-side in `setQty` + `assignLine`, and the
  UI disables controls it would reject (a guest sees others' lines as read-only with the owner avatar,
  never a control that just fails).
- **Live across the table:** `assignLine` touches `updated_at` → the P3.2 realtime sub re-syncs every
  phone's cart + shares. `assignLine` is member + canMutate gated, the target must be a session member,
  and it re-checks `status='open'`.
- **Honest scope:** the shares are a **reference** breakdown — the order is still **paid in full at
  checkout** (per-card tender is **P3.3b**, Option A: authorize-all → capture-together). The pay button
  carries an honest "this pays the full order" note in a group; no future-promise copy. Schema-free.
- **Craft (deep pre-merge UI/UX pass → ≥4.3):** instant optimistic shares (no empty-then-pop layout
  shift); share/assign/mode changes **announced through the cart's single live region** (a11y); a
  reduced-motion-safe fade on the toggle + assignment avatars and a press "thunk" so the assign tap
  registers with weight (RUBRIC #2/#5). _Deferred to P3.3b (tracked):_ folding the assign row onto the
  cart line itself (v7.2 parity) and a lock banner on `/cart`. Reviewed by two fresh-context adversarial
  subagents (pre-PR: 2 must-fix + 3 should-fix; pre-merge UI/UX: 4 should-fix) — all addressed/tracked.

### Added — M3·P3.2-lock cart-lock-at-pay (2026-06-20)

- **Freezes the cart for the pay window** so a peer can't mutate it mid-checkout (which would drift the
  total from the fixed PaymentIntent amount → webhook reconcile 409 → **charged-but-no-order**). The
  hole P3.2's live multi-writer cart exposed; deferred from P1.3 on purpose because a naïve lock strands
  an abandoned pay-screen.
- **`qr_carts.locked_at` + `locked_by`** (+ existing `locked`). Effective lock = held AND fresh within a
  **5-min TTL** (`CART_LOCK_TTL`), so a hard tab-close auto-releases. `create-intent` acquires via ONE
  atomic conditional UPDATE (`status=open AND (unlocked OR locked_by=me OR stale)`) — race-safe (Postgres
  re-checks the WHERE under the row lock; a fresh lock by another can't be stolen), and the SAME payer
  re-acquires after a refresh instead of being told "someone's checking out." Released on decline
  (webhook), "Edit order" (scoped to the locker), the TTL, or any create-intent failure path.
- **One guard, everywhere:** `assertCartMember` returns the _effective_ lock, so every existing mutation
  path (addItem / setQty / applyPromo / scanAdd / setPickupSlot) rejects. **UI:** AddButton disabled +
  a v7.2 lockbar; the transition is announced through the provider's **single** live region (the lockbar
  is plain visual — no second region); "Edit order" releases. The aspirational "locks the cart" comments
  are now true; "the host locked it" copy → "someone's checking out" (the locker may be a guest).
- **Hardened in passing:** `scanAdd` (grocery) now routes through the status-atomic
  `mms_cart_item_insert_if_open` RPC like `addItem` (was a plain insert — same TOCTOU class as the hole
  above). Migration `20260620000700` (2 nullable columns; `database.types.ts` hand-edited, `types-fresh`
  validated). Reviewed by a fresh-context adversarial subagent **pre-PR + pre-merge** (0 blockers).

### Added — M3·P3.2 live group-cart sync (dine-in, multi-device) (2026-06-20)

- **A peer's cart change now appears live on every phone at the table.** `qr_carts` + `qr_cart_items`
  join the `supabase_realtime` publication (+ `replica identity full` on `qr_cart_items` so a line
  removal/DELETE matches the `cart_id` filter); a new `useCartRealtime` hook subscribes to **Postgres
  Changes** (door-agnostic, like `/track` — a future staff-POS write propagates too) and the consumer
  re-fetches the **server-authoritative** `getCartView` into keyed React state (never client math).
  Authorization is the existing member-gated SELECT RLS (`qr_cart_read`/`qr_citem_read`), enforced
  per-subscriber by Realtime — a guessed `cart:{id}` channel reveals nothing. Migration `20260620000600`
  (publication + replica identity only → no `types-fresh` drift).
- **Honest peer announcements.** When a guest adds an item, the others hear "[name] added [item]" through
  the **single** existing live region (the real, un-simulated version of the v7.2 friend-add toast);
  `by_seat` is the verified adder, so attribution is trustworthy. Your own add is filtered (never
  "you added your own item"); a peer's qty-change/remove just refreshes (the event doesn't carry the
  actor, so no false attribution). All notices now flow through one `flash` helper with a single
  clear-timer, so overlapping events replace deterministically. **Dine-in only** (solo modes have no
  peers → no subscription).
- **Degrades gracefully:** on `SUBSCRIBED` the hook re-fetches (self-heals changes missed while the
  socket was down or before the subscription); a `CHANNEL_ERROR`/`TIMED_OUT` is logged (not silently
  swallowed) and recovers on reconnect. Reviewed by a fresh-context adversarial subagent (0 blockers;
  1 should-fix — the missing channel-error handling — + 2 nits, all addressed). _Cart-lock-at-pay (the
  money-path race) is the next focused PR — it needs a schema change + its own review._

### Added — M3·P3.1 group cart join + presence (dine-in, multi-device) (2026-06-20)

- **A second phone joins the SAME dine-in cart**, two ways: a scanned **table sticker** deep-link
  (`/menu?mode=dinein&t=<token>`) or the host's **server-issued invite code** (an unguessable 8-char
  code, shared as a code/link or entered via the entry "Join a table" sheet, `&j=<code>`). The
  `qr_code` doubles as the join key, so `/api/session` find-or-join converges every phone on one
  session + cart. **Schema-light:** one partial unique index (`table_sessions_active_qr_uniq`) makes
  concurrent same-sticker joins race-safe (collide → re-read → converge, no split-brain) — indexes
  don't touch the generated types, so no `types-fresh` drift. The host-start session code is minted
  **server-side** (`apps/qr/lib/session-code.ts`); a wrong invite code is **join-only** (404, never
  mints a phantom host-table); a guessable sticker token still requires anon-auth membership on top.
- **Live presence guest list — dine-in ONLY** (RED-TEAM #3 honesty; solo Scan&Go/Pickup never show
  presence). `useGroupCart` wires the existing private `table:{sessionId}` channel (RLS-gated on
  `realtime.messages`); presence is keyed by the **stable seat** (no ghost-churn, LEARNINGS #4), the
  client-asserted name is **sanitized on ingest** (strip control/RTL chars + clamp), and a new guest
  joining is announced through the **single** existing live region. Avatars + "party of N" built to
  the v7.2 party aesthetic; a failed mint surfaces an inline retry, not a silently missing strip.
- **Name your own seat** (`setDisplayName`, `apps/qr/lib/members.ts`): member-authz'd, scoped to the
  caller's own seat, Zod-capped **+** a new column CHECK; never sent to PostHog (opaque seat only).
- Scope boundaries held: live cart-change sync is **P3.2**, split-the-bill / **split-tender** is
  **P3.3** (pulls the S4.3 seam forward per the milestone decision) — neither is over-promised in the
  P3.1 copy. Reviewed by a fresh-context adversarial subagent (0 blockers; 5 should-fix addressed).

### Added — M2·P2.4 QuickBooks Online sync of paid orders (2026-06-20)

- **Paid orders post to QBO as Sales Receipts, two-ledger clearing.** Each paid `qr_order` becomes a
  QuickBooks Sales Receipt **deposited to a Stripe _clearing_ account** (sales land in clearing on order;
  the Stripe payout later clears it to the bank). Tax is posted as an **explicit line** with
  `GlobalTaxCalculation:"NotApplicable"` so QBO's Automated Sales Tax can't recompute/override our
  category-aware figure — the receipt total reconciles to the cent against the Stripe charge.
- **Pure, self-checking mapper** (`apps/qr/lib/qbo/mapping.ts`): `buildSalesReceipt` **throws rather than
  posts** if the line items don't reconcile to the stored subtotal, the parts don't sum to the total, or a
  non-zero amount (service/tax/tip) has no configured item ref. Validated locally (balances to total;
  throws on imbalance + missing ref).
- **Fail-safe, idempotent, out-of-band client** (`apps/qr/lib/qbo/client.ts`): a no-op unless
  `QBO_SYNC_ENABLED=true` (records `skipped`); OAuth2 refresh-token → cached access token; one Sales
  Receipt per order guarded by the new `qbo_sync_queue` ledger (migration `20260620000400`, RLS
  default-deny, **service-role only** — verified `anon`/`authenticated` denied + `service_role` r/w on the
  live project, advisor-clean). The webhook enqueues on fulfillment then posts inside `after()`, so
  QuickBooks latency/outage **never** blocks the Stripe ack or fulfillment; `processPendingQboSyncs` drains
  stranded/errored rows on demand.
- **Off by default.** Ships dark; activation (sandbox QBO company + refs/creds, then the first post) is a
  documented step. See [`docs/QBO_SYNC.md`](docs/QBO_SYNC.md) + the QBO rows in `docs/ENV.md`. Deferred:
  refresh-token rotation persistence, a cron drain, and refund mapping.

### Added — M2·P2.3 grocery Scan & Go session/cart (2026-06-20)

- **Real server-issued Scan & Go session.** `/grocery` now mints its cart via `useTableSession("scango")`
  — the same anon-auth `table_sessions` / `session_members` / `qr_carts` + membership-authz the dine-in
  and pickup flows use — replacing the demo client-minted `crypto.randomUUID()` that the `assertCartMember`
  guard rightly rejected (a client-asserted session id was the very thing M1·P1.1 closes). So `scanAdd` is
  now authorized like every other mutation, prices/taxes stay server-derived, and the cart carries to
  `/cart` + Stripe checkout. The dishonest "Scan & Go opens with grocery sessions (M2)" placeholder is gone.
- **Name-search fallback for unknown barcodes.** When a barcode won't scan or isn't in the catalog, a
  debounced name search (`searchGroceryItems`, a public read of the public-RLS `grocery_items`, returning
  only available + non-weighed items, LIKE-metacharacters escaped, length-bounded input) lets the diner
  find the item by name; a tap adds it through the **same** authorized `scanAdd` (server re-derives price +
  category-aware tax). EBT-eligible hits are tagged.
- **Fixed in passing:** the barcode scanner tore down + restarted the camera on every render (a fresh
  `onScan` each time) — now memoized so it starts once; and `/grocery` had two live regions (the scanned-
  lines `aria-live` + the status toast) → collapsed to one (the toast announces each add).

- **Capacity-limited pickup slots + a server fire-time.** Migration `20260620000100_pickup_scheduling`
  adds a tunable single-row `pickup_config` (tz, hours, slot interval, **capacity per slot**, lead, prep,
  hold TTL — seeded 10:30am–6:30pm · 15-min · 6/slot for Covina), `pickup_slot` + `fire_at` columns on
  `qr_carts` → carried to `qr_orders`, and two service-role-only SECURITY DEFINER functions:
  - **`mms_pickup_slots(p_exclude_cart)`** — tz-aware, returns today's bookable slots from
    `max(open, now+lead)` to close with **remaining capacity = capacity − (paid orders + live holds)**.
    A "hold" is an open cart that picked the slot and is still active (session unexpired, touched within
    the hold TTL) — so **capacity is honest _during_ ordering, not only after payment** (without this,
    N diners all see the last seat free before any has a paid row → overbook). `p_exclude_cart` drops
    the caller's own hold so a diner sees their slot's true availability.
  - **`mms_set_pickup_slot`** — race-safe (a per-slot `pg_advisory_xact_lock` serializes concurrent
    picks of the same slot) + status-atomic; sets `pickup_slot` + `fire_at = slot − prep`.
- **Fire-time = the S2 seam.** `fire_at` is computed + stored now for S2's KDS to consume; M2 has no
  kitchen actor, so nothing fires yet — no second timer grown (per the roadmap touch-point).
- **`/track` echoes the chosen slot as the ETA** ("Ready ~11:45 AM") with the pickup step variant
  (`Order placed → In the kitchen → Ready for pickup → Picked up`) — **no fabricated countdown, no
  "we'll text you"** promise the code can't keep. create-intent re-validates the slot still has room at
  the pay boundary (excluding the cart's own hold) and requires a slot for pickup orders; the cart
  surfaces the reason ("Pick a pickup time first." / "That pickup time just filled — pick another.").
- **Snappier cart/slot interactions** (perceived latency): each Add was two sequential server
  round-trips (mutate, then a full `getCartView` re-fetch) with no feedback until both landed —
  `addItem` now **returns the fresh view** (one round-trip) and the cart count bumps **optimistically**
  on tap; picking a slot drops the redundant post-set refetch and the tapped chip shows an immediate
  "Setting…" state. (The SQL was never the bottleneck — `mms_pickup_slots` runs ~10ms; the cost was
  round-trips + cold serverless starts on preview.)
- **Next-day rollover** (migration `20260620000200`): slots span today + `horizon_days` (default 2), so
  an after-hours browser pre-orders for tomorrow instead of hitting an empty "today only" wall. The sheet
  groups by day (Today / Tomorrow / weekday); the chip + `/track` ETA prefix the day when it isn't today.
- **UI (v7.2):** the "Pick a pickup time" sheet (`PickupSlotSheet`, capacity-aware, auto-opens on first
  pickup load), a header chip showing/Changing the slot (`PickupSlotChip`), tz-correct time display.
- **Validated** on a local Postgres stack (slot generation, fire-offset, hold-based capacity, exclude-self
  re-pick, advisory-lock serialization, stale-hold freeing, fulfillment carry) and **applied to the live
  QR project** (grant lockdown verified `anon=false`; advisors clean apart from the intentional
  `pickup_config` default-deny). **Pre-PR adversarial subagent: FAIL → fixed → PASS** — it caught the
  capacity-overbooking race (paid-only count); the holds + advisory lock + exclude-self close it.
- _Deferred:_ an inline slot-picker on `/cart` (today a slot-less checkout shows a clear reason and the
  diner picks via the menu chip); a hold/abandoned-cart sweep (holds self-expire via the TTL).

### Fixed — M2·P2.2 same-day slot alignment (2026-06-20)

- **Same-day pickup slots rendered off-grid and were false-rejected at checkout** — a regression from the
  `20260620000200` multiday rewrite, which moved `now+lead` into today's `generate_series` lower bound,
  anchoring the grid at a non-aligned instant that drifts every second. Two breakages across the whole
  operating window (any time `now+lead > open`): (1) slots showed arbitrary times (e.g. 11:18, 11:33)
  instead of the aligned :00/:15/:30/:45; (2) the grid shifted between a diner's pick and the
  re-validation — and **both** `mms_set_pickup_slot` and the create-intent pay-boundary check re-call
  `mms_pickup_slots` — so a valid same-day slot matched nothing on the fresh grid → set returned
  `unavailable` and checkout 409'd "that pickup time just filled". Migration
  `20260620000300_pickup_slots_align_fix` restores `…0100`'s pattern: anchor each day's series at the
  day's **open** (aligned) and **filter** `slot ≥ now+lead`. Future days keep all slots; same-day drops
  only past/too-soon ones, and the grid is now stable across the selection→checkout window. Caught by the
  **pre-merge adversarial subagent** (the after-hours manual smoke test had only exercised the next-day
  path); verified old-vs-new on the live stack (`12:31,12:46,…` → `12:45,13:00,…`).

### Added — M2·P2.1 server-validated promo codes (2026-06-20)

- **Real promo enforcement, server-authoritative.** Migration `20260620000000_promo_validation` gives
  `promo_codes` real semantics (`valid_from`/`valid_until`, `min_subtotal_cents`, `per_session_limit`,
  plus `CHECK`s: `value ≥ 0`, pct `≤ 1`, etc.), adds two RLS-default-deny ledgers
  (`promo_redemptions` audit + per-session cap; `promo_attempts` rate-limit), and five service-role-only
  SECURITY DEFINER functions:
  - **`mms_promo_check`** — the single apply gate: active + window + `min_subtotal` + global `max_uses`
    - per-session cap → returns a stable `reason` enum + the computed discount.
  - **`mms_promo_discount`** — the single **pricing** source `getCartTotals` now calls (replacing the
    inline TS), so the displayed/charged discount can't drift. Caps are a redemption budget (apply +
    fulfillment), not a pricing gate, so the discount stays stable through checkout.
  - **`mms_promo_attempt`** — per-session **rate-limit** (anti-enumeration): 10 / 5-min window,
    count-first so a capped session is rejected without recording (the window can drain), self-GC'ing.
  - **`mms_promo_consume`** — redemption at **fulfillment**: soft global cap (the charge already
    reconciled the discount, so `used` may overrun by the count of concurrently-applied-but-unfulfilled
    carts — accepted) + a **hard per-session cap re-checked under a row lock** (a DB invariant, not just
    the app-layer apply gate). `mms_fulfill_order` now calls it (after its idempotency early-return, so
    consumption is exactly-once under Stripe's ≤72h retries).
- **`applyPromo` returns a discriminated result** (`{ok, discountCents} | {ok:false, reason}`) instead of
  throwing — Next redacts thrown Server Action errors in prod, so the cart now shows the _specific_
  reason (invalid / expired / min-not-met / exhausted / used-at-this-table / rate-limited …) via a
  `Record<PromoReason, string>` map. Seeded test codes: `WELCOME10` (10% off) and `TEAHOUSE5` ($5 off
  ≥ $20).
- **Validated end-to-end on a local Postgres stack** (discount math, min-subtotal gate, rate-limit
  10/window, consume + per-session backstop, global exhaustion) and **applied to the live QR project**;
  `get_advisors` clean apart from documented/intentional lints.
- **Pre-PR adversarial subagent: PASS** (zero Critical/High). Folded in its hardening (per-session cap as
  a DB invariant; rate-limit window-drain + bound; honest soft-cap comment). **Advisors then caught a
  real EXECUTE-grant gap the subagent missed:** `revoke … from public` alone left the promo functions
  callable by `anon`/`authenticated` (Supabase explicitly grants them too) — `mms_promo_consume` was
  directly callable to burn a code's budget. Fixed: `revoke … from public, anon, authenticated`
  (verified `has_function_privilege('anon', …) = false`), plus a covering index on
  `promo_redemptions.order_id` (advisor 0001).
- **Fixed in passing — the live QR project was missing P1.5's `track_realtime`** (CI only tests a local
  stack; nothing had applied it to prod), so `qr_orders` wasn't in the realtime publication and `/track`
  live updates were silently broken in production. Applied it.
- _Deferred:_ tell the diner the exact shortfall on `min_not_met` ("add $X more") — a UX assist, not a
  correctness gap; a `promo_attempts` global retention job (today it self-GCs per active session).

### Added — M1·P1.6 hardening: nonce CSP + fail-fast env (2026-06-20)

- **Nonce-based Content-Security-Policy.** New `apps/qr/proxy.ts` (Next 16's rename of the
  `middleware` convention) mints a **fresh nonce per request** and emits
  `script-src 'self' 'nonce-…' 'strict-dynamic' https://js.stripe.com` — so we finally **drop
  `script-src 'unsafe-inline'`**, the one directive that made the old static CSP toothless against an
  injected `<script>`. `'strict-dynamic'` trusts the nonced framework bootstrap and whatever it loads
  (Stripe.js via `loadStripe`; PostHog via the same-origin `/ingest` proxy), so the host allow-list is
  just a pre-CSP3 fallback. The CSP **moved out of `next.config.ts`** (a per-request nonce can't be a
  static header) into the proxy; the nonce-free headers (Referrer-Policy / `nosniff` /
  Permissions-Policy / HSTS) stay in `next.config.ts` so they still cover the API + static responses
  the proxy matcher skips. Also tightened: `object-src 'none'`, `form-action 'self'`,
  `worker-src 'self' blob:`.
- **`frame-src` includes `https://*.js.stripe.com`** (with `js.stripe.com` + `hooks.stripe.com`): the
  Payment Element mounts iframes on per-origin `*.js.stripe.com` shards, and `frame-src` is a plain
  host allow-list that `'strict-dynamic'` does **not** cover — without the wildcard the card field can
  fail to render. `'unsafe-eval'` is added to `script-src` **in development only**
  (`NODE_ENV === "development"`): React's dev runtime + Turbopack HMR evaluate via `eval()`, which a
  nonce can't authorize, so `pnpm dev` would otherwise be broken by its own CSP; production never ships
  `'unsafe-eval'`. (Both surfaced by the pre-PR adversarial subagent — production-mode smoke testing
  alone had masked them.)
- **All routes render dynamically** (`export const dynamic = "force-dynamic"` in the root layout):
  Next can only stamp the per-request nonce onto its `<script>` tags during a per-request render, so a
  statically prerendered shell would ship scripts with no nonce and `'strict-dynamic'` would block
  them. The app is anon-auth + DB-driven, so the four otherwise-static shells lose no meaningful
  optimization. Verified end-to-end in **both** modes: the response CSP nonce matches the nonce on
  **all 18** rendered `<script>` tags and rotates per request; `/api/*` correctly gets no CSP;
  `'unsafe-eval'` is present under `next dev` and absent under `next start`.
- **Fixed in passing — `Permissions-Policy: camera=(self)`.** The header was `camera=()`, an empty
  allow-list that blocks the camera for **all** origins including our own — which would silently break
  the grocery Scan & Go viewfinder (`getUserMedia`). Now first-party only; mic/geo stay fully off.
- **Fail-fast env reads (hardening).** `packages/db/src/server.ts` now reads
  `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / the publishable key through a
  `requireEnv` guard that throws `Missing required env var: …` instead of the old `process.env.X!`
  feeding `undefined` to `createClient` (which resurfaced as a cryptic auth/network failure deeper in
  the stack — and once masked the delivery-vs-QR project mix-up). The Stripe **webhook** now returns a
  clear `500 "Webhook not configured"` when `STRIPE_WEBHOOK_SECRET` is unset (so Stripe redelivers once
  it's wired) instead of feeding `undefined` to `constructEvent` and masquerading as a `400 "Bad
signature"`; a missing `stripe-signature` header is an explicit 400.
- **`docs/ENV.md`** — the variable inventory (client/server, secret/not) + the Vercel **preview→prod**
  matrix (test keys on Preview, live on Production; staging when QR gets traffic), and the steps to
  wire the Preview env that unblock the Payment Element on PR previews. _Remaining (infra, Min):_ set
  those Preview env vars in Vercel.
- **ESLint flat config + `packages/config`** (the third P1.6 line item) already landed in M0·P0.9 —
  `@mms/config/eslint` is the shared base and `apps/qr/eslint.config.mjs` extends it; verified, no
  change needed.

### Added — M1·P1.5 live order tracking via Realtime (2026-06-19)

- **`/track` is now live.** After the Payment Element redirect, `apps/qr/components/OrderTracker.tsx` subscribes (`apps/qr/lib/useOrderStatus.ts`) to **Realtime Postgres Changes** on the diner's own `qr_orders` row — keyed by the `payment_intent` Stripe appends to the `return_url` — so the order appears **the moment the async webhook fulfills, with no manual refresh** (closes the deferred processing-state polling). Authorization is the existing `qr_order_read` RLS (`is_member(session_id)`), enforced per-subscriber, so a guessed `payment_intent` reveals nothing. Migration `20260619000400_track_realtime` adds `qr_orders` to the `supabase_realtime` publication (guarded/idempotent; no schema/type change). A **bounded fallback re-fetch** (~30s) covers the redirect→insert race / a cold socket so the order reliably surfaces even if the live channel is slow.
- **Status timeline built to v7.2.** `Order placed → In the kitchen → Ready → Served` ported from the prototype's `.tk` rail (18px dots, 2.5px connector, accent **pulse** on the active step → `globals.css` `mmsPulse`, success-green when done) — tokens only, no hardcoded colors. a11y: an `<ol>` with `aria-current="step"`, a single polite live region announcing the phase change, decorative dots `aria-hidden`, `prefers-reduced-motion` disables the pulse. Honest microcopy — no fabricated ETA countdown (real ETA needs the KDS).
- **Forward-compatible by design.** M1 has no kitchen actor, so the active step rests at "Order placed"; **S2's kitchen-status updates flow through the same subscription** with no client change (the timeline reads the future status). Dine-in / pickup step variants arrive with the S-track / M2.2.
- **Folded in the P1.4 adversarial findings** (PR #12 verdict, all non-blocking): `payment_succeeded` PostHog `capture` moved **inside** the fulfilled branch so a duplicate Stripe redelivery no longer double-counts analytics; the full `fulfillErr` (code/details/hint) is logged, not just `.message`; `getCartTotals` is wrapped in try/catch for context-rich 500s; `.env.example` `NEXT_PUBLIC_SUPABASE_URL` reverted to a `YOUR_QR_PROJECT` placeholder so local dev can't silently target the live DB.

### Fixed — M1·P1.4 webhook fulfillment is retry-safe (2026-06-19)

- **No more silent charged-but-unfulfilled orders.** `apps/qr/app/api/stripe/webhook/route.ts` previously `await`ed `mms_fulfill_order` without checking its result — and supabase-js returns a Postgres error in `{ error }` (it does **not** throw), so a failed fulfillment still returned `200 { received: true }`. Stripe treats 2xx as handled and never retries → the diner is charged but no `qr_orders` row exists. Now a non-null `error` logs + returns **5xx**, so Stripe redelivers (up to 72h); fulfillment stays idempotent on the PaymentIntent id, so a later successful retry is safe.
- **Observability:** a `payment_intent.succeeded` whose intent metadata is missing `cartId` (anomalous — `create-intent` always sets it; can't fulfill and a retry won't help) is now `console.error`'d instead of vanishing.
- **Already in place (P1.0), unchanged:** signature verification, idempotency on the PI id, and the amount-reconcile (`getCartTotals` vs `intent.amount` → 409 on mismatch before fulfilling). _Gem awarding stays deferred → M4_ (anon diner ↔ `loyalty_rewards.user_id NOT NULL`).
- **Docs:** `.env.example` corrected — QR runs on its **own** Supabase project (`fasnpdhtvqtzjlvruqcu`), not the shared delivery one; added the webhook-endpoint + `stripe listen` guidance for `STRIPE_WEBHOOK_SECRET`.

### Added — M1·P1.3 Stripe Payment Element (test mode) (2026-06-19)

- **Two-step checkout** in `apps/qr/components/Checkout.tsx`: a **review** step (line steppers, promo, tip, server totals) → **"Continue to payment"** POSTs the member-gated `/api/stripe/create-intent` `{cartId, tipRate}` → a **pay** step that mounts `<Elements>` + `<PaymentElement>` (`apps/qr/components/PaymentSection.tsx`) on the returned `clientSecret`, with an **"← Edit order"** way back. The amount is server-authoritative throughout (review breakdown from `getCartView`; tip-inclusive grand total from `create-intent`); the tip-chip `<small>` is a labeled preview only.
- **Tip selector** faithful to the v7.2 prototype — `No extra / 15% / 18% / 20%` chips, `aria-pressed`, `<small>` preview on the **discounted** base; the exact tip is re-derived server-side (`getCartTotals`, capped 0–50% by Zod).
- **PCI/SAQ-A intact** — `getStripePromise()` (`apps/qr/lib/stripe-client.ts`) loads Stripe.js once; PAN lives only in the Payment Element iframe. The Element **appearance is derived from `@mms/ui` tokens at runtime** (light = editorial, `.dark` = Night). Apple/Google Pay surface via `automatic_payment_methods`. `confirmPayment` returns to **`/track`**, now a real confirmation driven by Stripe's `redirect_status` (succeeded / processing / failed); the live timeline stays P1.5.
- **Folded-in deferrals**: `sessionMintOutput` Zod-parses the `/api/session` response (`useTableSession`); the promo live region is `aria-atomic`; focus moves to the heading when a stepper removes the last unit of a line.
- **Adversarial-pass hardening (zero-critical verdict).** A11y: focus moves to the heading on every **review↔pay transition** (the trigger button unmounts while focused — WCAG 2.4.3), and decorative `←` glyphs (Edit order / back links) are `aria-hidden` so they aren't announced. UX/trust: the **review summary now previews the selected tip** as a "Tip" row + "Estimated total" (identical `Math.round(netCents·rate)` to the server, so it reconciles exactly with the pay-step total — no surprise jump); the `/track` **processing** state gets a reassurance copy + a way off the page, and `/track` sets a per-state tab title via `generateMetadata`. Security: `create-intent` 500s return a generic `"Payment service error"` (the raw SDK message is logged server-side only — no recon surface before live keys).
- _Deferred (documented in `docs/REVIEW.md`):_ **cart-lock-during-pay → the group-cart Realtime phase.** Locking at intent-create strands a cart if the diner abandons the pay screen (no auto-release), and a lock only matters under concurrent editing (not wired yet); the signature-verified webhook **already reconciles** the live total vs `intent.amount` before fulfilling (a mutated cart 409s, never mis-fulfills), which is the P1.3 guard. Test-mode only — no real cards.

### Added — M1·P1.2 cart-create + line-merge + the cart flow (2026-06-19)

- **Server-issued cart.** `POST /api/session` now **find-or-creates the session's open cart** and returns `cartId` (idempotent — reuses the active session's open cart, or starts a fresh one after a previous cart is paid). The client never invents a cart id.
- **`useTableSession(mode)`** (client) — waits for the anon session, then mints/joins the table session via the Bearer-verified `/api/session` and exposes the `cartId`. A stable per-device QR identity per mode (localStorage) reuses the same session/cart across navigations instead of minting a new one each load.
- **Menu ordering.** `TableCartProvider` establishes the session once and shares a live, server-authoritative cart view; each item gets an `AddButton` (sends an item id, never a price; disabled until the cart exists and when sold out — a disabled control, not a missing one) and a sticky `CartBar` (live count + subtotal → `/cart`).
- **Line-merge.** `addItem` merges identical lines — same `menu_item_id` + the **normalized (order-independent) modifier set** → bumps `qty` instead of inserting a duplicate row (QA §B; keeps the cart bounded). Unit-checked for order-independence + jsonb-null safety.
- **Cart + checkout page.** `getCartView` (member-gated, RED-TEAM #2 — not an IDOR read) returns lines + server totals; the cart page renders them with 44px quantity steppers (`setQty`, `0` removes), server-validated promo, and the SB-1524 disclosure — re-fetching totals after every mutation (never client math). One polite live region (promo result); the rolling total is not `aria-live`. The pay CTA is a placeholder until **P1.3** mounts the Stripe Payment Element here.
- **Concurrency + a11y hardening (from the adversarial review).** Migration `20260619000000_cart_concurrency` adds an **atomic `mms_cart_item_inc_qty`** RPC (line-merge now `qty = qty + 1` in-DB — no lost-update race under concurrent group adds) and a **partial unique index** `qr_carts(session_id) WHERE status='open'` (so the find-or-create can't leave two open carts — `/api/session` re-reads on the conflict). `assertCartMember` now rejects non-`open` carts (paid carts are immutable). A11y: `aria-busy` on AddButton; `CartBar` is a real `<button>` (Enter+Space, QA §A P1); Stepper qty is an `<output>`; one polite notice region surfaces add failures; promo status clears on resubmit.
- **Money-path + a11y hardening (second review/adversarial pass).** Migration `20260619000100_cart_item_qty_cap` makes the increment **bounded + status-atomic**: `mms_cart_item_inc_qty` now JOINs the parent cart and requires `status='open'` and `qty < 99` in one UPDATE (closes a group-cart qty-inflation vector — `qty × unit_price` is the future Stripe amount — and a webhook `status='paid'` flip racing the app-layer guard), with a column `CHECK (qty between 1 and 99)` backstop for every write path. Client: `Checkout.refresh()`/`changeQty` swallow the post-payment 403 (no uncaught rejection on a paid cart); the Stepper `+` disables at 99; `TableCartProvider` announces a brief **success** confirmation as well as failures (WCAG 4.1.3) without making the rolling total `aria-live`; `applyPromo`'s PostHog `distinctId` is the verified `uid` (joins the diner profile), not the cart id.
- **Status-atomic mutations + grant lockdown + a11y (third review/adversarial pass — gate PASS).** Migration `20260619000200_cart_mutations_status_atomic` adds `mms_cart_item_insert_if_open` and `mms_cart_item_set_qty_if_open` so **every** cart write (insert / increment / setQty / delete) carries the `status='open'` guard into one SQL statement — closing the post-payment TOCTOU on the insert + setQty paths, not just the increment. It also fixes the **EXECUTE-grant gap**: the earlier `revoke … from anon, authenticated` was a no-op (Postgres grants new functions to `PUBLIC`), so all three cart RPCs now `revoke … from public` + `grant execute … to service_role` (mirrors `20260618000100_lockdown_grants`). Client a11y/UX: `TableCartProvider.refresh()` + the initial-load effect swallow the paid-cart 403 (no false-negative "Couldn't add", no unhandled rejection); the Stepper count is a plain `<span>` (not `<output>` — its implicit `role="status"` is announced on every press by NVDA/VoiceOver); the disabled pay CTA uses a visible `aria-describedby` note instead of `title`; AddButton says "Sold out" (not "86'd"); `CartBar` `encodeURIComponent`s the cart id.
- **Final symmetry + UX (fourth review/adversarial pass — gate PASS).** Migration `20260619000300_inc_qty_signal_closed` makes `mms_cart_item_inc_qty` **raise** on a closed cart instead of silently no-op'ing (it was the one path whose 0-row result the caller couldn't see → a phantom "Added"); the 99-cap stays a deliberate silent no-op on an open cart (signature unchanged → no type drift). `applyPromo`'s `qr_carts` write is now status-atomic too (`.eq("status","open")` + check) — so **all four** mutation paths are symmetric. The provider's live region is explicitly `aria-atomic`.
- **Reliability + observability (fifth pass — gate PASS, "correct and complete").** `/api/session` now checks the `session_members` insert error and 500s on any non-`23505` failure (a swallowed error previously returned a `cartId` that every later `assertCartMember` would 403 on — a silently broken session). `qr_carts.updated_at` touch failures are logged (non-fatal). Promo error UX: since Next redacts Server Action errors in production, the client can't read the failure reason off the thrown error — replaced the brittle message-match with one honest retry-safe message (per-reason promo messaging via a result-based return → M2).
- _Deferred (documented in `docs/REVIEW.md`):_ promo redemption caps/rate-limit → **M2·P2.1** (consume-on-fulfillment; no codes seeded today); **lock-cart-at-`create-intent`** (the stuck-payment vector) → **P1.3** with the unlock-on-failure lifecycle + webhook reconcile; `setQty` last-write-wins + the first-add double-insert merge → the **group-cart realtime** phase (neither is a charge error; no realtime concurrency is wired yet); `modKey` by option **id** vs label → when the modifier sheet ships; **qrCode host-squatting** (HMAC-signed QR payloads) → **M3** QR provisioning; raw `cartId` in the URL / paid-cart distinct message / Stepper debounce → later (the auth gate, not the id, is the guard).

### Added — M1·P1.1 anonymous-auth session wiring + Zod input layer + DB-drift CI (2026-06-18)

- **Anonymous-auth wiring (P1.1).** Diner identity is now a real, verified `auth.uid()` end-to-end (Supabase Anonymous Auth, decision #2):
  - **`AnonAuthGate`** (mounted in the root layout) calls `signInAnonymously()` on first load; the session persists in cookies via `@supabase/ssr`. **`useAnonSession()`** surfaces `{ accessToken, seat }` to client code (Realtime `setAuth`, Bearer fetches).
  - **`@mms/db/server` `serverClient(cookies)`** — SSR cookie-backed client so Server Actions / routes can read + **verify** the caller's `auth.uid()` (kept Next-agnostic via a cookie adapter).
  - **`POST /api/session`** verifies the `Authorization: Bearer` anon token (`getUser(token)`), records `session_members.seat_id = uid` (idempotent on rejoin), sets `host_seat`, and creates the host's cart — no client-asserted identity, no custom JWT (replaced the placeholder `crypto.randomUUID()` seat).
- **Per-action authorization (RED-TEAM #2; closes REVIEW.md gate #3 + QA §C "group-cart auth").** One guard — **`apps/qr/lib/authz.ts`** (`getCallerUid` + `assertCartMember`/`assertCartItemMember`) — gates **every** mutation: `addItem` / `setQty` / `applyPromo` (`cart.ts`), `scanAdd` (`grocery.ts`), and `create-intent` (closes `TODO(C3)`). Membership + cart-lock are re-checked from the verified uid before any write; `by_seat` provenance comes from the uid, not the client. `getCartTotals` moved to an internal `lib/totals.ts` (not a Server Action ⇒ no IDOR-read; the signature-verified webhook still calls it server-to-server).
- **Zod input layer (P1.0a).** `@mms/db/schemas` validates every external input at the trust boundary — ids `uuid`, money/qty non-negative `int`, tip capped ≤ 50%, barcode `^\d{8,14}$`, names length-capped. Routes return 400 on bad shape; actions throw. Pricing stays server-authoritative (the client only asserts _shape_: an item id + modifier ids).
- **DB-drift CI (P1.0a) + `supabase/config.toml`.** New `ci.yml` **`migrations-check`** boots a local stack (`supabase start`) applying `supabase/migrations` + seed, and **`types-fresh`** regenerates `database.types.ts` (`--local`) and fails on any drift. `config.toml` enables anonymous sign-ins (rate-limited, short JWT) as code; `db:types` regenerates the committed types the same way. (Generated `database.types.ts` added to knip ignore.)
- **Notes:** the live project's anonymous sign-ins must be toggled on (dashboard / `supabase config push`) for preview runtime. Grocery Scan & Go's demo cart is now correctly rejected by the authz guard until its real server-issued session lands (M2·P2.3) — the page degrades gracefully.

### Added — In-repo research context for remote sessions (`docs/context/`) (2026-06-18)

- **Problem:** Claude Code remote sessions only have `main`, but the decision-grade research (prototypes, red-team, QA gate, rubric, $0 stack) lived only in Min's Cowork workspace — so remote sessions built blind, and `CLAUDE.md`/`README` pointed at `../POS & Self-Serve 2026/…` paths that don't exist in a clone.
- **`docs/context/`** — distilled, durable subset that travels with every clone: `INDEX.md` (the map), `RESEARCH-DIGEST.md` (business · product · design · compliance · pricing _why_), `QA-CHECKLIST.md` (the canonical in-repo launch gate), `RUBRIC.md` (the 10-dim ≥4.3 bar), `RED-TEAM.md` (standing security/UX standards + known traps), `FREE-KIT-MAP.md` ($0 stack). Principle: **conclusions in git, process in Cowork.**
- **`docs/prototype/v7.2.html`** — the canonical visual/interaction reference (graded ≈4.3), copied byte-for-byte from the Cowork prototype.
- **`DESIGN-RESEARCH.md`** — distilled UI/UX research: the job-to-be-done + conversion evidence, the Sunday north-star teardown (with the review-gating FTC trap called out so a session doesn't copy it), the **paid UI-kit buy-list** (HeroUI Pro · Motion+ · shadcnblocks · Mobbin · optional React Bits), and the component/motion/voice craft bar — paired with the free stack.
- **Wired in:** `CLAUDE.md` + `README` + `docs/HANDOFF.md` index `docs/context/`; the SessionStart hook (`learning-context.mjs`) points every session at it; the PR-review prompt cross-checks `QA-CHECKLIST.md` + `RUBRIC.md` + `RED-TEAM.md`. Fixed the two broken `../POS%20…` README links and corrected the stale "one Supabase project" model in **`CLAUDE.md` and `README`** (QR + delivery are separate Supabase projects; QR owns its catalog).
- **Review workflow:** professional **`claude/<type>/<slug>` branch convention** (`CLAUDE.md` + `docs/WORKFLOW.md`); the diff-scoped **`adversarial-pr` gate is now fail-closed** (no verdict ⇒ fail, not pass) and re-promptable before merge via the **`adversarial` label**, with an **`adversarial-signed-off`** escape hatch for workflow-editing PRs that skip their own review under the anti-tampering guard. New labels added to `setup.sh`.
- **Product decisions captured:** `docs/context/ORDER-MODEL.md` — the dine-in service model (table-owned order · edit-rights by **line-state × role** · loss-gated voids + manager-PIN + **owner remote-approve** on one approvals primitive · **trust/secure tabs** on server discretion · **soft** multi-door convergence + one-tap merge · unified basket with to-go **fire-at-checkout**). Sequenced into `ROADMAP.md` as the **S1–S4 service-model track** with dependency notes + a recommended interleave (`M1→M2→M3→S1→S2→S3→M4→S4→M5→M6`).

### Added — Dedicated Supabase project: clean schema applied + seeded (2026-06-18)

- **QR now has its own Supabase project** (`MMS QR Platform`, ref `fasnpdhtvqtzjlvruqcu`) — no longer bending around the live delivery DB. The project came pre-seeded with an unrelated app's template tables (10 tables + a `handle_new_user` trigger on `auth.users`); cleared them after confirming 0 rows (the trigger would have broken anonymous sign-ins).
- **Applied a clean init schema** (`supabase/migrations/20260618000000_qr_platform_init.sql`): the catalog is **owned here** (`menu_categories`/`menu_items`/`modifier_groups`/`modifier_options`/`item_modifier_groups`/`grocery_items`), `tax_category` is a **first-class column on `menu_items`** (the `mms_menu_tax*` side-tables + resolver are gone), session/cart/order tables (`qr_*`), the cents tax engine, anonymous-auth **membership RLS**, realtime private-channel policies, and `mms_fulfill_order`.
- **Seeded the real menu** from `supabase/seed.sql` — 8 categories · 60 items · 7 modifier groups · 14 options · 6 grocery SKUs, with CA CDTFA tax classification.
- **Hardened grants** (`..._lockdown_grants.sql`): revoke `EXECUTE` from `PUBLIC` (Postgres' default) so `mms_fulfill_order` is service-role-only and `is_member`/`is_host` are `authenticated`-only; revoke `anon` SELECT on session-scoped tables. `get_advisors` is clean apart from documented, intentional exceptions.
- **Generated types + wired them in** (`packages/db/src/database.types.ts` → `createClient<Database>` in `@mms/db`): dropped the `as unknown` menu-embed cast and refactored `cart.ts` to read `tax_category` from the column (removed the deleted RPC). Old `packages/db/migrations/000{1,2}` superseded by `supabase/migrations/`.

### Added — Backend & database architecture design + advisor hardening (2026-06-18)

- **`docs/BACKEND_ARCHITECTURE.md`** — design of record for the four locked decisions: free-tier + a dedicated **staging** Supabase project (promote to prod manually), **Supabase Anonymous Auth** for diners (RLS off `auth.uid()`), **service-role Server Actions** as the authoritative write path, and **generated Supabase types + Zod** input validation. Covers the env/migration workflow (converge on the CLI timestamped format the delivery app already uses), the membership-based RLS model, the full backend routing map, the `@mms/db` package shape, and a phased plan (P1.0a infra → P1.1 auth → P1.2–P1.6).
- **⚠️ Documented the anon-auth blast radius:** enabling anonymous sign-ins on the _shared_ project grants every QR diner the `authenticated` Postgres role, so the delivery app's `authenticated` RLS must be audited on staging before enabling on prod (mitigations in §1).
- **Migration hardening (grounded in live `get_advisors`):** every QR function now pins `search_path` (bodies schema-qualified) and **revokes `EXECUTE` from `anon`/`authenticated`** (advisors 0028/0029); added **covering indexes** on every QR foreign key (advisor 0001). `mms_fulfill_order` / `mms_menu_tax_category` / the tax helpers are service-role-only.
- **ROADMAP:** inserted **P1.0a** (staging project, CLI migrations, typegen + Zod, CI `migrations-check`/`types-fresh`) and rewrote **P1.1** to the Anonymous-Auth membership model (was: custom HS256 table-session JWT). Updated `/api/session` + `useGroupCart` comments to the new model.

### Changed — M1·P1.0 schema reconciliation (2026-06-18)

- **Namespaced the QR session tables** `qr_carts` / `qr_cart_items` / `qr_orders` / `qr_order_items` so they no longer silently collide with the live delivery `carts`/`orders`/`order_items` (whose `create table if not exists` was no-op'ing). Repointed every query: `lib/cart.ts`, `lib/grocery.ts`, `app/api/session/route.ts`, the Stripe webhook, and the cart page.
- **Reads the real, delivery-owned menu.** `priceItem` + the menu RSC now hit the live `menu_items` (`name_en`/`name_my`, `base_price_cents`, `category_id → menu_categories`); modifiers are derived from the normalized `item_modifier_groups → modifier_groups → modifier_options.price_delta_cents` and **intersected server-side** so a client can't price a foreign/cheaper option id. Dropped the placeholder `menu_items` table + seed from `0001`.
- **Money is integer cents end-to-end** (parity with the delivery schema): `CartTotals`/`CartItem`, `lib/tax.ts` (`mms_line_tax` now `amount_cents → tax_cents`), the migrations (`*_cents` columns, grocery `price_cents`), and `create-intent` (no more `×100`). Dollars are formatted only at the UI edge.
- **Tax category sourced QR-side** without touching the delivery menu: `mms_menu_category_tax` (per-category default, seeded for all 8 live categories) + `mms_menu_tax` (per-item override), resolved by `mms_menu_tax_category()`.
- **Fulfillment** rewritten: `mms_fulfill_order` writes `qr_orders`/`qr_order_items` in cents and **reconciles** the breakdown against the PaymentIntent amount (the webhook recomputes `getCartTotals` with the `tipRate` carried in intent metadata; the function re-checks the sum == the charge and is idempotent on the PI id). Closes the L2 amount-reconcile TODO. ⚠️ Gem awarding stays deferred — `loyalty_rewards.user_id` is `NOT NULL`, so anonymous QR diners need an account link (M4) first.
- Validated read-only against prod (seed covers every category; cents tax math matches `lib/tax.ts`). Migrations are **not** applied to prod; Supabase branching needs the Pro plan, so apply on a branch before merge. See [`docs/DATA_RECONCILIATION.md`](docs/DATA_RECONCILIATION.md). Gate green.

### Changed — Toolchain refresh to latest stable + M1 unblocking (2026-06-17)

- **Monorepo on latest stable:** pnpm 9.12→**11.7**, turbo 2.3→**2.9**, TypeScript 5.6→**6.0**, Next 16.1.2→**16.2.9**, React **19.2.7**, Stripe SDK 17→**22** (apiVersion pinned to the SDK's `2026-05-27.dahlia`, derived from the constructor type so future bumps can't drift it), `@supabase/supabase-js` **2.108**/`ssr` **0.12**, plus `@number-flow/react`, `@zxing/library`, `zustand`, Radix, Tailwind, prettier, knip. The supply-chain `minimumReleaseAge` guard auto-pinned PostHog to the latest release older than the cutoff.
- **pnpm 11 migration:** moved `overrides` from `package.json` to `pnpm-workspace.yaml`; added `allowBuilds` approval for `sharp`/`unrs-resolver` (and skipped `core-js`'s funding postinstall); bumped `pnpm/action-setup` + `setup.sh`.
- **Build fix:** `next/font/google` fetched via Turbopack's Rust fetcher failed behind a TLS-intercepting proxy; `next.config.ts` now opts Turbopack into the system trust store (no-op on Vercel) so the build is green in CI/remote sandboxes.
- **Lint upgrade:** re-enabled Next `core-web-vitals` (a11y/perf/react-hooks) — it ships a native flat config now — and fixed the warnings it surfaced (`react-hooks/exhaustive-deps` in `useGroupCart`, anonymous default exports). ESLint pinned to latest **9.x**: its bundled `eslint-plugin-react` still uses a context API removed in ESLint 10.
- **Types:** declared `@types/node` + `server-only` on `@mms/db` and set `types: ["node"]` (pnpm's symlinked store isn't picked up by TS auto-inclusion); dropped deprecated `baseUrl` (removed in TS 7); knip config modernized for v6.
- **⚠️ Data-migration blocker surfaced:** the live shared Supabase project already has `carts`/`orders`/`order_items`/`menu_items` with different shapes, so QR `0001`'s `create table if not exists` would silently no-op. Guarded the migration + documented the reconciliation plan in [`docs/DATA_RECONCILIATION.md`](docs/DATA_RECONCILIATION.md); added **M1·P1.0** to the roadmap. Nothing applied to prod.

### Added — Theme-color viewport (2026-06-17)

- `apps/qr/app/layout.tsx`: split `themeColor` out of `metadata` into a separate `viewport` export (Next 16 contract). Light/dark schemes set so the mobile address-bar matches Day and Night surfaces.

### Added — Claude config + CI (2026-06-16, learned from the delivery app)

- **Claude Code config:** root `CLAUDE.md` (monorepo guide + developer profile), `.claude/settings.json` with hooks — SessionStart **learning-context**, SessionEnd **retro**, and a PostToolUse **auto-format** (Prettier + ESLint --fix on edited files, an improvement over the delivery app) — plus `.claude/LEARNINGS.md` + `.claude/ERROR_HISTORY.md` memory, and `.mcp.json` (Supabase / GitHub / Sentry MCP).
- **Quality:** `@mms/config` shared preset (ESLint flat + Prettier) + root `eslint.config.mjs` / `prettier.config.mjs` / `.prettierignore` / `knip.json`; root scripts `lint`/`format`/`knip`.
- **Reviews/CI:** ported the delivery app's richer `claude-review.yml` (Vercel-preview-grounded, ultrathink/Opus, fork-safe, OAuth token) + `.github/claude-review-prompt.md` spec, and `ensure-preview.yml` (webhook-drop safety net).

### Planned (M1 — walking pay path)

- Sign the table-session JWT (`/api/session`); authz on every Server Action; Payment Element; webhook amount-reconcile; nonce CSP. See `ROADMAP.md`.

## [M0] — 2026-06-16 — Scaffold

### Added

- Turborepo + pnpm monorepo (`apps/qr`, `packages/{ui,db}`); `@mms/*` aliases; root config.
- `@mms/db`: Supabase browser/service/session clients, shared types, migrations.
  - `0001_qr_ordering.sql` — `table_sessions`, `session_members`, `carts`, `cart_items`, `orders`, `order_items`, `promo_codes`; RLS keyed to active-session membership (`is_member`/`is_host`); **private Realtime authorization**; **category-aware tax** (`mms_taxable`/`mms_line_tax`) replacing the flat 10.5%; menu seed; idempotent `mms_fulfill_order`.
  - `0002_grocery.sql` — UPC-keyed `grocery_items` (tax category + `ebt_eligible`) + seed.
- `@mms/ui`: editorial-forward + Night tokens, Radix-based accessible `Sheet`, NumberFlow.
- `apps/qr`: App Router shell, entry mode-picker, **menu RSC**, broad screen stubs (track/rewards/account/cart); **server-authoritative cart** actions; Stripe **create-intent** + **webhook** routes; **Realtime group-cart** hook; **grocery Scan & Go** (`BarcodeScanner` + `scanAdd` + `/grocery`); PostHog client; CSP/security headers; `next/image` policy.
- CI/reviews: `ci.yml` (turbo lint/typecheck/build), `claude-review.yml` (Claude PR + security review), `adversarial.yml` (weekly), `setup.sh` (public repo + Turbo link), `.github` templates + CODEOWNERS.
- Docs: `ARCHITECTURE.md`, `GROCERY_SCANGO.md`, `REVIEW.md`, `WORKFLOW.md`, `ROADMAP.md`.

### Fixed (post-scaffold red-team)

- Tax computed on the **discounted taxable base** (not a pro-rata of the rounded aggregate).
- Removed an over-broad host RLS `UPDATE` policy; all writes go through service-role Server Actions.
- `is_host()` reads a custom `app_role` claim (Supabase reserves top-level `role`).
- Realtime presence uses a **stable** seat from the JWT (no per-subscribe churn).
- Stripe `create-intent` passes an idempotency key.

### Lineage

Productionizes the **v7.2 prototype** (design ≈4.3/5 on a 10-dimension world-class rubric; hardened across four parallel red-teams). The decision-grade research is distilled in-repo at [`docs/context/`](docs/context/INDEX.md) with the v7.2 reference at `docs/prototype/v7.2.html`; the full iteration history + Design Hub stay in Min's Cowork workspace (`../POS & Self-Serve 2026/02-design/`), outside git.
