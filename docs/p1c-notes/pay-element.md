# Phase 1c · pay-element — build notes

Branch `p1c/pay-element` (base `0a1a5c6`). Integration merges the sections below into the named
files; nothing here is edited in `docs/DESIGN-LANGUAGE.md`, `docs/OPEN-ITEMS.md`, `CHANGELOG.md` or
`CLAUDE.md` on this branch.

## 1. DESIGN-LANGUAGE draft

## §XX The card form — one wait, one reveal, a way out that works

As built in `apps/qr/components/PaymentSection.tsx`, decided by `apps/qr/lib/pay-element.ts`.

- **Our skeleton owns the wait; Stripe's loader is off** (`loader: "never"`). From the first frame
  the stage (`.pay-stage`, `role="group"`, "Card details") draws v7.2's `.sk` grammar at the
  Element's geometry — three rows of `.pay-skel-field` (a label bar + an input box in the input's
  own chrome: `--cd` fill, the `--bd` hairline, `--r-sm`, `--s3 --s4` padding, 50px), so the box
  reads as the field it becomes even when reduced motion stops the bars. The stage reserves this
  device's last measured block at about this width (`mms.payElementH.v1`, ±40px), else
  `PAY_ELEMENT_FALLBACK_PX`. A wallet shape is drawn ONLY when this device measured one — a first
  visit never implies Apple Pay. No new motion: the bars are the kit's `.mms-skeleton`.
- **The live block loads underneath, invisible and inert.** `.pay-live[data-revealed="false"]` is
  absolute, `opacity: 0`, click-through and `inert`, so the iframes load at their true width and
  cannot take focus.
- **The reveal is gated on card + wallet, with a MEASURED grace.** It happens when the card is ready
  AND the wallet has settled — or `walletGraceMs` has passed since the card was ready (a measurement
  gate: 1000ms until preview measures the p90, capped at 2000). ONE commit: the skeleton unmounts,
  the reserve releases, `.pay-live` becomes static and takes `.mms-rise`, and the note swaps to
  "Your card goes straight to Stripe — never to us." (true by construction under SAQ-A). A wallet
  that settles later fills the warm slot in place (a hold bar swaps for the button in one commit)
  or, on a first visit, mounts with `.mms-rise`.
- **The Pay control keeps its sum, gets its reason as a description, and goes live only after the
  layout settles.** The label never swaps at go-live ("Pay $42.10" throughout). Refusal is
  `aria-disabled` (K35) with `aria-describedby` naming the note (loading/slow/offline) or the
  failure title; it dims 0.7 while loading, 0.55 on a failure, and un-dims over `--dur-base`. It
  lifts only at reveal + `settleMs` (300ms), and any post-reveal wallet change re-arms that window
  WITHOUT re-dimming. **Wallets are exempt from the settle window** (not from the reveal): their sheet
  (Face ID, a double-click) is the confirmation, and every refused wallet confirm calls
  `paymentFailed` so the sheet never spins. The settle timer is identical under reduced motion — it
  is meaning, not motion.
- **`payable` is named once.** `payElementView(s).payable` is the card-path charge gate; the CTA's
  attribute and `confirm()` both read it. `confirm()` also requires bound handles (the current
  attempt's `{stripe, elements}`, un-bound on unmount), `!hold`, and an in-flight REF read at call
  time. A rejecting `confirmPayment` is caught and clears every latch ("Payment couldn't start —
  try again."), so the CTA, Edit order, Back to review and the pagehide release can never latch.
- **A failure is an inline card whose one button is the way forward that can work** — the Phase 0
  grammar (icon → one `h2` → one sentence naming where the button goes → one secondary `Button`),
  `tone="error"`, rising in place of the skeleton; wallets are never shown beside it. Retry is
  offered ONLY after an actual error (Stripe.js rejected, or a network-shaped loaderror) and
  escalates to "Back to review" after two failed retries; a timeout, a bad key (config) or an ended
  intent go back to review — naming the counter door for dine-in. A timeout keeps the mount alive
  under the card, so a late form still reveals. A retry re-keys Elements on the SAME clientSecret
  (no new intent, no amount change, no lock write) and re-creates the Stripe.js loader only when
  Stripe.js itself failed. The ONE Button is the same DOM node across failure kinds, so focus
  survives its own tap ("Trying…", busy); whenever the card unmounts with focus inside, focus moves
  to the stage — never into the iframe.
- **Copy is honest about what we know.** "Nothing is lost" (the cart and lock persist; the mount
  charged nothing); `we-down` gets the NEUTRAL body (/api/health measures our database, not Stripe);
  the ended-intent body sends the diner to see where the order stands — never "start again", never
  "you were not charged" (it may have succeeded). The offline sentence's promise is a code path:
  the `online` event auto-retries a load that saw offline and never revealed.
- **One live region.** The existing `role="status"` line carries the decline/confirm error visibly,
  otherwise sr-only announcements: a failure's title + body, or "Card form ready." only after a wait
  the diner was told about. It is cleared during a diner retry so an identical failure re-announces.
  No `role="alert"`, and no `aria-busy` on the stage (it would hide the focused "Trying…" button).
- **The iframe is a token mirror pinned by `check-theme-parity`, and its font is first-party.**
  `lib/stripe-appearance.ts` maps the Field (§20): Hanken at the 16px `--fs-field` floor, label
  `--fs-label`/`--fw-bold`/`--field-gap`, `--s3 --s4` padding, the `--bd` hairline, and the Field's
  focus as a box-shadow ring (1px `--cd` gap + 2.5px `--ac`). The selected payment-method tab is §2's
  lit cap as its honest flat subset: `--gold` fill, `--ink` label, `--ac` edge (the 3:1 non-text
  edge flat gold cannot give in light). Apple/Google Pay buttons are white in Night, black in light.
  Stripe gets `disableAnimations` under reduced motion. The font is the byte-identical latin subset
  next/font ships, served from `/fonts/` with CORS `*` and an immutable cache; `--field-gap`,
  `--focus-w` and `--field-focus-offset` now name the Field's geometry once (Field, global ring,
  iframe). The §3 motion table is unchanged: no new idiom.

## 2. CHANGELOG

- **Phase 1c · pay-element (F17)** — the pay step's card form is one honest wait (our skeleton in
  the form's final footprint), one reveal, and an inline failure card whose one button can work
  (retry after an error; back to review — naming the counter for dine-in — after a timeout, a bad
  key or an ended intent). The Pay button is `aria-disabled` until the form it charges exists and
  the layout has settled, is ref-guarded against a double confirm, and can no longer latch on a
  rejecting `confirmPayment`; refused wallet confirms fail the sheet. Stripe's iframe mirrors our
  tokens (Field look, lit-cap tab, Night palette, white wallet buttons in Night) in a self-hosted
  Hanken face. 11 new mutants (7 lib + 4 component).

## 3. OPEN-ITEMS rows

| Sev | Item                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Why / where                                                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| —   | **Close F17** (Stripe Payment Element in the browser's default sans).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Closed by this change: `lib/stripe-appearance.ts` + `stripeFonts()` on every Element surface (PaymentSection, SharePay, SecureTabButton).                                                                |
| med | MEASURE `PAY_ELEMENT_TIMING.walletGraceMs` — record Express-ready minus Element-ready in preview on iOS Safari (Apple Pay), Android Chrome (Google Pay) and desktop Chrome (Link); set it to the p90, capped at 2000, and re-pin the literal in `lib/pay-element.test.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Shipped at the spec's starting value 1000 (`apps/qr/lib/pay-element.ts`); no Stripe keys / devices in the build environment.                                                                             |
| med | MEASURE `PAY_ELEMENT_FALLBACK_PX` in preview with the production dashboard's payment methods (tabs, Link) at 390px and paste the measured block height.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Shipped at 312 — the spec's own worked example of a card-only block at 390px, not a measurement (`apps/qr/lib/pay-element.ts`). Only shapes a FIRST visit; warm visits use the device's own measurement. |
| med | MEASURE the unverified Stripe behaviours in preview before claiming them: (a) `ready` fires for elements under `inert`/`opacity:0` with `loader:"never"`; (b) an rgba `inputColorBorder` is accepted (else flatten `--bd` over `--cd` in the builder and pin that composite, recomputed); (c) the 3.5px focus ring is not clipped at the iframe edge (else drop the 1px gap); (d) the CustomFontSource loads from our origin with the CORS header — measure on a deployment NOT behind Vercel Deployment Protection, or with a bypass (the iframe's credential-less fetch would get a 401 and mislead); (e) no CSP violation in the console; (f) the px-resolved 16px inputs cause no iOS zoom; (g) the input focus ring is visible; (h) `tabLogoColor`/`tabLogoSelectedColor` accept `light`/`dark`; (i) the Express-vs-Element ready deltas (walletGraceMs); (j) a succeeded or cancelled PI's loaderror carries `invalid_request_error`. | `apps/qr/lib/stripe-appearance.ts`, `apps/qr/components/PaymentSection.tsx`. If (a) fails the step would sit on the skeleton until the 20s timeout card — measure it FIRST.                              |
| med | The `.mms-skeleton` background-position sweep → a transform-only `::after` (§3 debt). 16 consumer files, including GroceryBrowse's raw class on `.gcard-photo` (already declares position/overflow). Requires screenshots of every `loading.tsx` route in both themes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Deliberately out of scope for Phase 1c (`apps/qr/app/globals.css` `.mms-skeleton`).                                                                                                                      |
| med | SharePay (split share) and SecureTabButton (card-on-file) adopt the pay element: our skeleton, the failure card, the ready/settle gate and confirm resilience. They still use `disabled={!stripe}` and pass the RAW Stripe.js promise, which leaves an unhandled rejection when Stripe.js fails to load.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `apps/qr/components/SharePay.tsx:435`, `apps/qr/components/SecureTabButton.tsx:96,160` (they only gained the `fonts` option here).                                                                       |
| low | Unify the page's Hanken on `next/font/local` over the committed `/fonts/hanken-grotesk-latin-wght-v1.woff2`, so the page and the iframe ship one copy (a Google revision would otherwise drift them; the pinned sha256 makes any change to OUR copy deliberate). Also removes the build-time Google fetch `next.config.ts:3-7` works around; latin-ext needs a second local family.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `apps/qr/app/layout.tsx`, `apps/qr/public/fonts/`.                                                                                                                                                       |
| low | Nice-to-do: a live theme flip without a remount. react-stripe-js forwards appearance changes through `elements.update`, so ThemeSync's "needs a remount" caveat can be lifted (its comment is inaccurate). Measure that card entry survives the update.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `apps/qr/components/ThemeSync.tsx:11-14`.                                                                                                                                                                |
| low | Burmese for the decline line (Stripe's messages), "Processing…", the Pay label, the "or pay with card" divider, "Edit order" and the top "Back to review" control.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | F6's cart→pay→track MY sweep.                                                                                                                                                                            |
| low | Mirror the Field's ink@6% inset shade inside the iframe — blocked: Stripe takes no `color-mix`, and a hand-converted copy would be a second source.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `apps/qr/lib/stripe-appearance.ts` (`inputBoxShadow: "none"`).                                                                                                                                           |
| low | Client analytics for pay-form load failures (a PostHog `pay_element_load_error` event carrying `error.type` only) to learn the real Stripe.js block rate.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `apps/qr/components/PaymentSection.tsx`.                                                                                                                                                                 |
| low | Migrate the pay step's Pay CTA onto `@mms/ui` `Button` (F19); this change only aligned its disabled semantics with K35.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `apps/qr/components/PaymentSection.tsx`.                                                                                                                                                                 |
| low | Express `buttonType` and `paymentMethodOrder` — product decisions for the owner.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `apps/qr/components/PaymentSection.tsx` (`ExpressCheckoutElement` options).                                                                                                                              |
| —   | **K15 gains "Phase 1c pay form — 21 cart.ts keys"** (`payFormLoading` … `payBackToReview`, all new Claude-authored Burmese).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `apps/qr/lib/i18n/cart.ts` (`// ── the pay form (Phase 1c) ──`).                                                                                                                                         |

## 4. Mutate-set / CLAUDE.md enumeration changes

- **New files in `verify-slice.mjs`'s mutate set** (2):
  - `apps/qr/lib/pay-element.ts` — bucket **lib** (116 → **117**).
  - `apps/qr/components/PaymentSection.tsx` — bucket **component** (twelve → **THIRTEEN**; add
    `PaymentSection.tsx` to CLAUDE.md's named list).
  - Measured after the edit with CLAUDE.md's own grep: `117 apps/qr/lib · 3 apps/qr/app/api ·
13 components · 1 packages/db` → **117+3+13+1=134** files (`sort -u | wc -l` = 134).
- **Mutants: 754 → 765** (`check:mutant-anchors`: "765 anchors, 134 files"). CLAUDE.md's "754
  mutations" (the `pnpm verify:slice` comment and the Pre-PR sweep bullet) → 765 (re-measure at
  integration; siblings add their own).
- **Mutants added** (one `// ── Phase 1c · pay-element ──` block at the end of `MUTANTS`):
  - owned by `lib/pay-element.test.ts`: `pay-element/reveal-ignores-wallet`,
    `pay-element/payable-skips-settle`, `pay-element/stale-attempt-accepted`,
    `pay-element/intent-classified-as-network`, `pay-element/config-retries`,
    `pay-element/escalation-keeps-retrying`, `pay-element/stall-ignores-late-ready`;
  - owned by `components/PaymentSection.test.tsx`: `pay-section/submit-ignores-payable`,
    `pay-section/double-submit`, `pay-section/throw-latches`, `pay-section/express-refusal-hangs`.
- **Mutants re-anchored:** none. The docblock edits to `lib/lock.ts` / `lib/pay-attempt.ts` and the
  one-prop edit to `components/Checkout.tsx` moved no `find` string (`check:mutant-anchors` clean).
- `scripts/check-money-coverage.mjs`: `MONEY_MARKERS` gains `/\bpayElementView\b/` (red-first: with
  the marker and without the pay-element mutants the guard names `apps/qr/lib/pay-element.ts`;
  without the marker it is invisible).

## 5. Owner-visible behaviour changes

- The pay step no longer shows Stripe's own spinner or a blank slot: a skeleton in the card form's
  shape holds the space, with "Loading the secure card form…" (EN + MY) under it; after 8s it says
  "Still loading — this can take a moment."; offline it says so and retries on its own when the
  connection returns.
- The card form appears in one rise; the note under it becomes "Your card goes straight to Stripe —
  never to us." The Pay button stays dimmed and refuses taps until then (+300ms), with its sum
  unchanged.
- If Stripe cannot load (blocker, captive portal, outage), an inline card says so with **Try again**;
  after two failed tries — or on a timeout (20s), a key problem or an intent that has ended — it
  offers **Back to review**, and at a dine-in table names paying at the counter.
- A payment that fails to START (a Stripe integration error) now returns the button with "Payment
  couldn't start — try again." instead of freezing on "Processing…".
- The card form is in Hanken and looks like our fields (same size, label, padding, hairline, focus
  ring); the selected payment-method tab is gold with a clay edge; in Night the whole form uses the
  Night palette and Apple/Google Pay buttons are white. The same font/appearance reaches the split
  share and card-on-file forms.
- The frozen review Pay CTA and SendToKitchenButton no longer flash their hover/press glow while
  `aria-disabled`, and their frozen↔live dim now fades over 240ms (instant under reduced motion).

## 6. Deviations from spec

1. **`stripePromise` is state, not `useMemo(…, [attempt])`.** It changes only when a retry resets
   the loader, in the same event as the `attempt` bump (so Elements' `key` and `stripe` change in
   one render). A memo keyed on an unused `attempt` is an "unnecessary dependency" to the hooks
   lint and the compiler. Same behaviour.
2. **The AUTO retry (online) also resets the loader when Stripe.js was what failed.** The spec's
   `onRetry` resets for the diner path only; without the reset an offline-at-mount load (Stripe.js
   rejected) would auto-retry against the SAME rejected promise and fail again instantly, making
   the offline sentence's promise false. One `restart(state, by)` serves both.
3. **The focus rule uses a layout-effect CLEANUP in the card's wrapper** (it runs before React
   removes the DOM, so `document.activeElement` is still inside), not onFocusCapture/onBlurCapture —
   removing a focused node fires no reliable blur, which would leave a capture-flag approach wrong.
   Same rule: any unmount of the card with focus inside moves focus to `.pay-stage`.
4. **Reducer additions beyond the spec's state list:** `walletLate` (the wallet settled after the
   reveal — drives the first-visit rise) and three guards: `card-error` after `ready` is ignored (a
   loaderror belongs to a load), `settled` before a reveal is ignored, `wallet-*` settles once per
   attempt, and going offline AFTER the reveal does not set `offlineSeen`/`waitAnnounced` (it would
   otherwise announce "Card form ready." for a form that never waited).
5. **`check-theme-parity.mjs` §4 parses `FALLBACK` with the TypeScript AST** instead of widening the
   regex capture ("any quoted value"): the entries carry `// = --token` comments and the file's prose
   names tokens, so a regex could be satisfied by a comment (LEARNINGS #60). It also checks both
   directions (unmapped keys, lost keys) and holds SHARED values under BOTH themes. Every spec'd
   red-first was run (dark.gold, light.bd rgba, shared.ink changed AND `--ink` re-declared under
   `.dark`, `--fs-body` → 17px, `clamp(` refused), plus an unmapped key and a commented-out entry,
   each restored md5-identical.
6. **contrast-audit:** `t3 on cd (Stripe placeholder)` was already asserted in both themes, so only
   `ink on gold`, `ac on cd (non-text, ≥3)` and `warn on cd` were added (the spec said "if absent").
7. **responsive-contract (4):** `.pay-success-check*` and `@keyframes paySuccess*` (/track's success
   mark) already exist with animation; they are excluded BY NAME so every other `.pay-` class stays
   in scope. The RM check requires EVERY RM `.checkout-cta` transition to be `none` (a later RM rule
   re-adding a fade would otherwise pass).
8. **CSS placement:** the new block is appended at the END of `globals.css` (the brief's shared-file
   rule) rather than beside `.checkout-pay-divider`. Three small classes beyond the spec's list:
   `.pay-note-en` (the lock icon + EN line as an inline-flex row, no whitespace node), `.pay-wallet`
   / `.pay-wallet-hold` (the warm wallet slot and its hold bar) and `.pay-status-my` (the MY line of
   "Payment couldn't start" inside the warn-coloured status line).
9. **The skeleton's wallet shape + divider sit OUTSIDE the `.pay-skel` grid**, so the divider's own
   14px margin is not added to the grid gap (the live block has no gap there).
10. **CLAUDE.md / DESIGN-LANGUAGE / OPEN-ITEMS / CHANGELOG** are not edited on this branch (brief);
    their content is in §1–§4 above.
11. **The font was first copied from turbo's cached build output for the base commit's input hash**
    (the first `pnpm turbo build --filter=@mms/qr` was a FULL TURBO cache hit restoring `.next/**`
    into this worktree). The build of THIS branch then ran for real in this worktree (cache miss
    `23736ca1bf546972`, triggered by `turbo typecheck`'s `dependsOn: ["build"]`) and re-emitted the
    latin face (`unicode-range:U+??,…`, `c47649aa31f9e140-s.p.*.woff2`, 34,664 B) with the SAME
    sha256 as the committed file (`1f21c6ea…bb59`).
12. **`walletGraceMs` = 1000 and `PAY_ELEMENT_FALLBACK_PX` = 312** are unmeasured starting values
    (§3 rows).
13. **The service worker's precache ignores `public/fonts/`** (`apps/qr/scripts/build-sw.mjs`
    `globIgnores`; not in the spec). Adding a woff2 under `public/` silently grew the precache from
    2 to 3 entries (+34KB) — bytes nothing reads: the fetch comes from Stripe's iframe on its own
    origin, which our worker does not control, and the page draws Hanken from next/font. Back to 2
    entries / 93.1KB, the base's budget.

## 7. LEARNINGS candidates

- **A layout-effect CLEANUP runs before React removes the host nodes of a deleted subtree**, so it is
  the one place a component can still ask "was focus inside me?" at unmount. A blur listener cannot:
  removing a focused node fires no reliable blur, and `document.activeElement` is `body` by the time
  any parent effect runs.
- **`act(async () => vi.advanceTimersByTimeAsync(a + b))` does not run an effect armed at `a`.**
  React flushes the render (and so arms the next timer) when the act scope ends, so a chained timer
  (grace → reveal → settle) needs one `advance` per link. The component was right; a single advance
  made the test say it was not.
- **Stripe.js resets its OWN cached loader on a failed script load**, so re-calling `loadStripe`
  after our singleton is cleared really re-injects — but only if OUR singleton is cleared. The reset
  must be explicit (SharePay/SecureTabButton call the accessor in render bodies).
