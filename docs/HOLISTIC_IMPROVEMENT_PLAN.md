# Holistic Improvement Plan — QR + Delivery (2026-07-02)

Cross-repo plan spanning **security**, **UI/UX**, and **brand**, grounded in a multi-agent adversarial audit
of both live codebases (not docs). Companion copy lives in the delivery repo at
`docs/holistic-improvement-plan.md`. This is the QR-side plan-of-record + the shared brand core.

**Method.** Eight parallel domain auditors read the actual code in both repos (QR money/auth · QR platform
surface · delivery money/auth · delivery platform surface · QR UX/a11y · delivery UX/a11y · brand systems ·
tracked-debt register), each high/critical finding then passed to an independent adversarial verifier told to
_refute_ it. Findings below are the survivors; each is tagged with a status:
**🔧 fixing now** (this session's PRs) · **📋 follow-up** (dedicated PR, needs its own verification) ·
**🎨 polish** (UX/brand slice).

Severity: **critical** = exploitable money/auth/data-leak · **high** = real security weakness or user-facing
breakage · **medium** = correctness/a11y gap with a plausible trigger · **low** = hardening/polish.

---

## 1. Security — QR (`mms-platform`)

The money/auth core is broadly sound: server-authoritative pricing, layered authz (`assertCartMember` +
status-atomic RPCs + RLS), signature-verified idempotent webhook, and the S1/S2/S4 audit remediations are all
verifiably present. The findings are a rebased-away regression and a set of race/hardening gaps.

| #   | Sev      | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Fix                                                                                                                                                                                       | Status                            |
| --- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Q1  | **high** | **`mms_merge_table_orders` regressed its void/comp fold guards.** `20260622070000`+`20260622090000` added `state <> 'voided' and not comped` on both scans + S5 approvals-supersede + S6 same-state match + both-sessions-active. `20260623030000` restated the body and dropped all of them; `20260629120000` (R5c) rebased on the weakened body. Live effect: merging a table folds a **voided/comped** source line's qty into an active target → diners re-charged for a $0'd line; symmetric giveaway + kitchen-state erasure. Doc-claims-fixed / code-lacks. | New migration restating the fn as the **union** of every prior guard + the R5c `by_seat is null` fold. Signature unchanged → no types drift.                                              | 🔧 `20260702000000`               |
| Q2  | **high** | **`create-share-intent` capture race double-charges a split payer.** The share-row update used `.eq("id")` only — no status/PI predicate. A concurrent `amount_capturable_updated`→capture webhook between the status read and the write gets reverted to `pending` pointing at a new PI → orphan captured charge (no ledger) + the seat pays twice.                                                                                                                                                                                                              | Guard the update with `.in("status",[pending,failed,canceled])` + optimistic PI-id match; `.select("id")` to detect 0 rows → cancel the new PI + 409.                                     | 🔧 `create-share-intent/route.ts` |
| Q3  | **high** | **S4-audit P1-2 fire-at-checkout backstop never covers card/split.** `mms_reconcile_settled_fulfillment` scans `where cart_id is not null`, but only the cash fulfill stamps `cart_id`; card + split insert it NULL. So the pg_cron backstop for the webhook-`after()` cold-stop case (card/split) scans zero rows — a card/split dine-in cart with draft food never fires, togo never inits, EBT never snapshots.                                                                                                                                                | Stamp `cart_id` in the card + split `qr_orders` inserts (partial-unique is cash-scoped; card is PI-idempotent, so exactly one insert).                                                    | 🔧 `20260702000100`               |
| Q4  | med      | **Split freeze never refreshed** — `settle_at` is stamped once at `openSettlement` (10-min TTL); a split that runs past minute 10 can never capture and dead-ends (holds sit authorized ~7 days).                                                                                                                                                                                                                                                                                                                                                                 | Refresh `settle_at` in `create-share-intent`/`onShareAuthorized` while the table pays, and/or let `captureAllIfReady` proceed when **every** share is authorized regardless of freshness. | 📋                                |
| Q5  | med      | **Split fulfill reconciles only Σ(shares)** (circular) — a line added in the `openSettlement` race window ships unpaid (cooked + snapshot into the order, `total ≠ Σ prices`).                                                                                                                                                                                                                                                                                                                                                                                    | Re-derive the cart's chargeable base in `mms_fulfill_split_order` and raise on disagreement, or refuse line mutations when `settle_at` is fresh.                                          | 📋                                |
| Q6  | med      | **Seven mutations skip the P3.4 rate limiter** (`applyReward`, `clearReward`, `releasePayLock`, `openTab`, `abortSettlement`, `submitFeedback`, `ensureProfile`) — a verified diner can flood these with zero throttle; only the fail-open global caps remain.                                                                                                                                                                                                                                                                                                    | Add `assertMutationRate(uid)` after the authz call in each, matching the sibling mutations.                                                                                               | 📋                                |
| Q7  | low      | **Staff PIN step-up DoS** — client-supplied `approverStaffId` in `voidLine`/`resolveApproval` is PIN-checked before any role/self check, so any `server`-role account can serially wrong-PIN every manager/owner and keep all manager PINs in 15-min lockout (disables refunds/voids floor-wide).                                                                                                                                                                                                                                                                 | Pre-check `approverStaffId` is an active manager/owner + a per-caller rate bucket on failed step-ups.                                                                                     | 📋                                |
| Q8  | low      | `mms_cart_item_insert_if_open` (text overload) revoke omits `public` (LEARNINGS #58) — implicit PUBLIC EXECUTE survives (latent; RLS denies today).                                                                                                                                                                                                                                                                                                                                                                                                               | One-line `revoke all … from public`.                                                                                                                                                      | 🔧 `20260702000200`               |
| Q9  | low      | `create-intent` idempotency key omits payer uid → a 2nd payer can inherit the 1st's PI + Stars/feedback attribution (money identical).                                                                                                                                                                                                                                                                                                                                                                                                                            | Add `_${uid}` to the key.                                                                                                                                                                 | 📋                                |
| Q10 | low      | Line-merge dup key uses modifier **labels** not option ids + ignores `unit_price_cents` → same-name options with different price deltas fold to the wrong price (menu-data-dependent).                                                                                                                                                                                                                                                                                                                                                                            | Add `unit_price_cents` (and ideally option-id set) to the dup-match predicate.                                                                                                            | 📋                                |
| Q11 | low      | Prefetch-header documents get **no CSP** (the Next.js `missing:` matcher); `img/connect-src` allow any `*.supabase.co`; `getFeedbackState` leaks whether an arbitrary order id has feedback; no shared `/staff` gate (per-page today, copy-paste-dependent).                                                                                                                                                                                                                                                                                                      | Strip inbound `x-nonce` on all paths + static fallback CSP; pin Supabase host; scope the feedback probe to earner; add a `requireStaffPage()` helper + proxy pre-check.                   | 📋                                |

---

## 2. Security — Delivery (`mandalay-morning-star-delivery-app`)

Platform hardening is mostly solid (real CSP + headers, middleware + per-route self-auth, `isSafeRedirect`
allowlist, `pull_request` not `_target`). The gaps: a stored-XSS sink, two genuine money-loss refund paths
whose deferral is unsafe, and a broken customer feature.

| #   | Sev      | Finding                                                                                                                                                                                                                                                                                                                                                                                       | Fix                                                                                                                       | Status                            |
| --- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| D1  | **high** | **Stored XSS → admin-session compromise.** `ManualEmailDialog` interpolates a customer-controlled `orderSummary` (built from raw `order.address.street/city`) unescaped into `footerHtml` rendered via `dangerouslySetInnerHTML`. A saved address of `<img src=x onerror=…>` runs script in the admin's session on Preview; the CSP's `script-src 'unsafe-inline'` doesn't block it.          | Render the footer as escaped React text (or sanitize with DOMPurify before concatenating).                                | 🔧                                |
| D2  | **high** | **`retry-payment` under-collects tax + tip.** The "Complete Payment" retry rebuilds Stripe line items as items+delivery only — no tax/tip line — yet marks the order `confirmed` against the full `total_cents` with no amount check. Every failed-then-retried order under-collects CA sales tax + the whole tip.                                                                            | Reuse `createStripeLineItems` (or add explicit tax/tip lines + re-apply discount) so the session amount == `total_cents`. | 🔧                                |
| D3  | med      | **Customer share-token generation silently broken by the orders RLS lockdown.** `share-token/route.ts` updates `orders.share_token` on the user client, but `orders_update_customer_cancel` only permits status→cancelled → 0-row no-op (or 500). The token never persists; `/orders/[token]/share` + tracking `?token` never resolve.                                                        | Persist via the service-role client (ownership already verified) + `.select('id')` row-count check.                       | 🔧                                |
| D4  | **high** | **Item refund over-refunds discounted orders.** `apply_item_refunds` refunds the item's **pre-discount** line total, never subtracting its share of `discount_cents`. On any discounted order a partial refund returns more than the customer paid (the tracked "discount-proportional refund" follow-up — deferral is **unsafe**: welcome/referral discounts + partial refunds are routine). | Scale each item's refund by the order's effective discount ratio (+ proportional tax).                                    | 📋 (money — dedicated PR + tests) |
| D5  | med      | **Shipping refund counted twice** across separate partial refunds (no once-per-order guard). Card: capped at charge (returns tax/tip that shouldn't be); COD: uncapped cash over-payment.                                                                                                                                                                                                     | Track `refunded_shipping_cents`; refund ≤ `delivery_fee_cents` once.                                                      | 📋                                |
| D6  | med      | **First-order discount stacking** — the eligibility gate counts COMPLETED orders only and the coupon has no per-customer `max_redemptions`; a new customer can open several unpaid checkouts, each sees 0 completed, each gets the welcome/referee discount.                                                                                                                                  | Count pending orders too, or record a per-user first-order-used flag atomically at order creation.                        | 📋                                |
| D7  | med      | **SW caches authenticated HTML** (`/admin`, `/driver`, `/account`) into per-origin Cache Storage (NetworkFirst, no `CacheableResponsePlugin`) → last admin's rendered PII persists after logout on shared devices + widens XSS blast radius.                                                                                                                                                  | Denylist authed prefixes in the NavigationRoute (and/or gate on `Cache-Control: private`).                                | 📋                                |
| D8  | med      | **Unauthenticated feedback endpoint emails arbitrary addresses** via the brand's verified domain (harassment/phishing/reputation).                                                                                                                                                                                                                                                            | Only send the confirmation to authenticated users' own account email; tighten the anon limit.                             | 📋                                |
| D9  | med      | **CSP `script-src 'unsafe-inline' 'unsafe-eval'`** negates XSS defense-in-depth (what makes D1 land).                                                                                                                                                                                                                                                                                         | Move to nonce/hash script-src; re-evaluate `unsafe-eval` (Maps JS generally doesn't need it).                             | 📋                                |
| D10 | low      | Sentry `sendDefaultPii: true` + fetch/URL breadcrumbs capture IP + tokenized tracking URLs.                                                                                                                                                                                                                                                                                                   | `sendDefaultPii: false` + scrub `token`/PII query params in `beforeBreadcrumb`.                                           | 📋                                |

---

## 3. UI/UX polish

### QR — the R1–R9 richness track is unusually disciplined (reduced-motion off-switches everywhere, loops

`useInView`-gated, device-tier gating, no mobile backdrop-filter/blur, mostly one-live-region-per-view). No
critical/high survived. Remaining is polish:

- **U-Q1 (med)** Item-sheet upsell swap keeps the previous item's scroll + drops focus — scroll `.mms-sheet`
  to top + focus the heading on `item.id` remount.
- **U-Q2 (med)** Sticky `.menu-toolbar` safe-area padding is always-on → a ~55px dead gap under the Menu
  heading on notched iPhones — cancel the at-rest inset with a negative `margin-top` (keep the pinned padding).
- **U-Q3 (med)** Grocery scanner `flash()` toast timers race (no clear-prior) → a rapid second scan's
  error notice blanks after ~100ms — mirror `TableCartProvider`'s single-timer-ref fix.
- **U-Q4 (med)** **Grocery Scan & Go missed the richness pass** — flat `.card` lines, static total, `<a>`
  checkout bar next to fully-enriched siblings — give it the R5 pass (`card-textured`, `NumberFlow` total,
  `<button>` CTA matching `CartBar`).
- **U-Q5 (low)** `themeColor` (`#fffaf2`/`#0f1115`) ≠ actual `--pg` (`#faf9f5`/`#171221`) — visible dark
  status-bar seam. **U-Q6 (low)** Scrim system incoherent — add a `--scrim` token (`.mms-scrim` hardcodes,
  `RefundActionSheet` references an undefined `--scrim`, `.tier-up` inverts to a light wash in Night).
  **U-Q7 (low)** Checkout settling-flip doesn't move focus. **U-Q8 (low)** Checkout/SplitSection hand-roll
  the seat avatar (hardcoded `#fff`) instead of `@mms/ui` `Avatar`. **U-Q9 (low)** R1 `.tex-*`/`.surface-*`
  utilities shipped with zero consumers; `.home-bg` re-implements the dot grid. **U-Q10 (low)** ~18 components
  double `aria-live="polite"` onto `role="status"` against the repo's own rule — one mechanical sweep.

### Delivery — the After Dark back-port (#150–#171) is complete; a fresh UX audit was re-queued (the first run

hit a session cap). Known-suspect carry-forwards to verify: `Tabs.tsx` + `CommandPalette/SearchCategoryTabs.tsx`
measured-indicator dark-on-dark risk; `text-secondary` yellow-on-light melds; `--sheet-max-h` vs `vh`; 16px
input font; **driver + admin surfaces that missed the After Dark pass** and now read off-brand. _(Populated
from the re-run in the delivery-side plan.)_

---

## 4. Brand — the Morning Star shared core

**Type is already converged:** both apps run **Fraunces** (display) + **Hanken Grotesk** (body) + **Padauk**
(Burmese). The brand reads as _two dialects of one identity_ that contradict in a few concrete places. The
delivery **email theme** (`src/emails/components/theme.ts`) is already a distilled brand core — bless it as
canonical and mirror it as a short shared spec, each app mapping anchors into its own token names (do **not**
fork tokens; QR_FROM_DELIVERY.md forbids it).

**Shared anchors (both apps):**

| Anchor                | Hex                        | Role                                                                     |
| --------------------- | -------------------------- | ------------------------------------------------------------------------ |
| Paper cream           | `#faf9f5`                  | daylight canvas (already shared: QR `--pg`, delivery `--hero-card-bg`)   |
| Ink                   | `#141413`                  | primary text (QR `#1b1714` is a near-twin — align or document in-family) |
| **Star crimson**      | `#a41034` (dark `#c41844`) | **the star mark / wordmark ONLY — never a UI accent**                    |
| Gold                  | `#eaa92f`                  | the Stars / loyalty / celebration hue — one gold, both apps              |
| Deep-clay accent-text | `#9a3412` / `#7c2d12`      | accent words on cream                                                    |

**Protected per-app lineage (do not flatten):** QR keeps **saffron** `--ac` interactive + **Night purple**
dark; delivery keeps the **sunset gradient**, **espresso After Dark**, the **triad** (blue `#6a9bcc` / sage
`#788c5d`), and Pepper crimson/pink interactive semantics.

**Star motif — one mark, three registers:** (a) brand mark = the deep-red star `#a41034` (logo/favicons/og/
email masthead), never tinted, never a control color; (b) loyalty star = the four-point **✦** in gold — QR's
existing glyph becomes the family standard; (c) ratings = five-point **★** amber (distinct by shape _and_ hue).

**Bilingual voice (shared):** EN/MY as equals; casual-warm diaspora register (တယ်/မယ်/နော်); buttons are
verbs ("Add to order / အမှာထဲ ထည့်"); errors say what to do + preserve the cart; honest microcopy;
`lang="my"` on every Burmese run. Shared glossary: **Stars** (loyalty currency, ✦); tier ladder ids stable
(`new/jade/ruby/gold`) displayed with native-script Burmese names + one emoji set.

**Contradictions to resolve:** ① QR has **no `public/` at all** — no logo, favicon, og-image, or manifest
(its mark is an emoji ☕ + text wordmark); ② three golds for one semantic (`#e8a83c`/`#eaa92f`/`text-amber-500`);
③ star iconography split (✦ vs lucide `<Star>`; delivery spends crimson `--hero-star` as a checkout
selected-border); ④ tier display diverges (native script vs romanized; ruby ❤️ vs ♦️); ⑤ stale `themeColor`
in **both** layouts (neither matches its tokens); ⑥ delivery still ships **legacy fonts** (Nunito + Playfair +
Inter `@import`/localFont loads) alongside the real stack.

### Brand mapping — QR (all additive, editorial/Night lineage untouched)

1. `tokens.css`: add `--star` (`#a41034`/`#c41844`, "brand mark only" comment); shift `--gold #e8a83c → #eaa92f`;
   optionally align `--tx → #141413`. (The contrast test parses `tokens.css` live → re-audited automatically.)
2. **Create `apps/qr/public/`** from the delivery kit: `logo.png`, `icons/icon-192+512.png`, og-image, manifest;
   wire `icons`/`openGraph`/`manifest` into `layout.tsx` metadata.
3. Fix `layout.tsx` `themeColor` → `#faf9f5` / `#171221`.
4. Freeze `rewards-tiers.ts` as the glossary source (native-script names; settle the ruby emoji with delivery).

### Brand mapping — Delivery (small; hygiene + iconography)

1. `tokens.css`: no core hex changes — add a "MMS brand core anchor" comment block marking
   `--hero-gold/--hero-star/--hero-ink/--hero-card-bg/--hero-accent` canonical.
2. Swap loyalty lucide `<Star>` → four-point ✦ in `--hero-gold`; tokenize rating `text-amber-500` →
   `--color-rating-star`.
3. Tier display via the safe display-rename path (change `name/english/emoji` only; sync the **two** accent
   maps + refresh `TierBadge.test`/`loyalty-reward.test`).
4. **Font hygiene:** delete Nunito + Playfair/Inter `@import`s; repoint `--font-mono` off `--font-inter`; drop
   the Inter/Playfair localFont loads; optionally migrate to `next/font` (explicit `myanmar` subset).
5. Fix `layout.tsx` `themeColor` `#8B1A1A` → media-pair.

**Brand risks:** both apps' contrast tests must be re-baselined on token edits (delivery hardcodes fixtures —
refresh them; QR parses live — fix the `-strong` variant, never loosen the matrix). Tier-rename foot-guns are
documented. Do **not** unify delivery's legacy `--color-primary #a41034` derivatives into the star semantic
(scope creep in a 955-line file). Icon/manifest changes touch the Serwist precache (new SW build).

---

## 5. Sequenced PR backlog

**This session (🔧):**

- **QR-SEC** — Q1 merge-guard restore · Q2 share-intent race · Q3 fulfill `cart_id` stamp · Q8 revoke-public.
  _Migrations need live-apply + advisor check + a money-path smoke before merge._
- **DL-SEC-1** — D1 XSS sanitize · D2 retry-payment tax/tip · D3 share-token service-role.

**Next (📋, ranked):**

1. **DL money** — D4 discount-proportional refund + D5 shipping double-refund (one PR, unit-tested).
2. **QR money** — Q4 split-freeze refresh + Q5 split-fulfill re-derive (split-tender robustness).
3. **DL platform** — D6 first-order stacking · D7 SW authed-cache · D8 unauth email · D9 CSP nonce.
4. **QR hardening** — Q6 rate-limiter coverage · Q7 PIN-DoS · Q9/Q10/Q11.
5. **Brand core** — QR token+assets PR · Delivery font-hygiene+iconography PR (parallel, per-app).
6. **UX polish** — QR U-Q1..U-Q4 (grocery richness + sheet focus + toolbar gap) · Delivery UX batch from the
   re-run audit.

**Gate for every slice:** the repo's own loop — local verify (lint · typecheck · build; delivery adds
lint:css · test) → pre-PR + pre-merge adversarial subagent → migrations applied to live + advisor-clean →
`CHANGELOG` + `ROADMAP`/`open-prs.md` updated.
