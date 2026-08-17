# Real-Build QA Checklist — QR Ordering

**The acceptance gate. Canonical in-repo copy** (derived from the v7.1 red-team, June 16 2026). This is the gate every milestone exits against, cross-checked by the in-session fresh-context adversarial subagent (pre-PR _and_ pre-merge) and the two Codex rounds — CI runs no Claude review. `docs/REVIEW.md` tracks which items the open milestone has closed.

Grouped by lens; each item is testable. **P0 = blocks launch · P1 = before public traffic · P2 = fast-follow.** Boxes are unchecked on purpose — this is the working gate, not a trophy.

> **Already handled in the v7.2 prototype** ([`../prototype/v7.2.html`](../prototype/v7.2.html)): the two crash paths (out-of-range split index + `reorderFull` stale state), the presence liability (now dine-in only), full host-lock enforcement, the single deterministic focus-trap, dialog naming, Burmese `lang`, the live-region cleanup, the cartbar Space key, the disabled-`+` under lock, and the sold-out `bump` guard. The items below are the ones that are **genuinely real-build work** — image/Core-Web-Vitals performance, server-authoritative cart + table-session auth, SRI/CSP, and the parity gates.
>
> **Build state (W22):** the card path is LIVE (wallets registered, live mode). Server-authoritative cart (`apps/qr/lib/cart.ts`), category-aware tax (`lib/tax.ts` ↔ SQL `mms_line_tax`), integer cents end-to-end, group cart + split tender, KDS/expo + staff floor/register, the durable receipt artifact + receipt email, grocery scan-and-go — all shipped. So the rows below are read against a **running** app: what stays open is named in `docs/OPEN-ITEMS.md` (the single registry) and the per-arc record in `docs/REVIEW.md`, not by the absence of a build.

---

## A · Accessibility (WCAG 2.2 AA)

P0

- [ ] **One** focus mechanism per modal (Radix Dialog _or_ one trap) — focus lands on the same element every open, announced once (test NVDA + VoiceOver, 10×). _(fixes dual-trap race)_
- [ ] Every sheet/dialog has an accessible name via `aria-labelledby` → its heading (no generic "Details"). Each sheet has a visible, labelled ✕ close (not Esc/scrim only).
- [ ] Burmese semantics: `lang="my"` on the MY subtree; keep `lang="en"` on interleaved English (phone, "Covina," promo codes). Verify with a Burmese TTS voice. **Email templates count** — a bilingual receipt/auth email needs the same subtree marking as a page, even though some clients strip `lang`.
- [ ] All interactive targets ≥ **44×44 px** hit area (steppers, +/−, ✕ remove, assignment avatars, diet chips) — visual size may stay smaller via padding.
- [ ] Contrast ≥ 4.5:1 for all text including tinted fills (`.chip.acc`, `.tip.on` were ~4.0–4.3) — darken accent or deepen tint; re-verify in-browser (oklab).

P1

- [ ] Exactly **one** polite live region for transactional messages; the rolling total and the menu container are **not** `aria-live`; announce final values once; debounce presence + toast + cart so one action isn't read 3×.
- [ ] Auto-moving content (the Start-here drift rails) carries a **visible stop control** (WCAG 2.2.2 — not hover luck), pauses on hover/touch/focus-inside/offscreen/hidden-tab and for a grace period after any scroll it didn't write, and under `prefers-reduced-motion` renders the exact static rail (no drift, no duplicate DOM, no dead switch). Loop-duplicate cards stay out of the tab order and the AT tree yet remain tappable, routing focus to their real twin so a sheet's focus-restore target is never `aria-hidden`.
- [ ] Modifier groups are `role="radiogroup"` with a name; cartbar is a real `<button>` (Enter **and** Space).
- [ ] Keyboard-only walkthrough of the full happy path (scan→order→customize→cart→split→pay→track) with zero mouse.
- [ ] Offline/connection-loss is announced.

## B · Performance (Core Web Vitals — mobile p75, 4G/mid Android)

| Metric                      | Target      | Ceiling |
| --------------------------- | ----------- | ------- |
| LCP                         | ≤ 2.0 s     | 2.5 s   |
| CLS                         | ≤ 0.02      | 0.10    |
| INP                         | ≤ 150 ms    | 200 ms  |
| TTFB                        | ≤ 0.6 s     | 0.8 s   |
| First-load JS (order route) | ≤ 120 KB gz | 130 KB  |

P0

- [ ] Hero image `priority` (eager + high fetchpriority), served self-hosted as AVIF/WebP at ~440w — never lazy above the fold.
- [ ] All images via `next/image` with explicit dimensions + `sizes` (`88px` thumbs, `120px` upsell) → kills CLS and oversized-decode bytes.
- [ ] Self-host every dish photo (TheMealDB/Unsplash are placeholders + licensing + 2 extra origins) — replace with real MMS photography.
- [ ] Cart mutations as **React state with keyed reconciliation** (no full `innerHTML` rebuild) → tip/split/assign/promo touch only changed nodes; focus + scroll preserved.

P1

- [ ] `canvas-confetti` and `focus-trap` **lazy-imported** (dynamic `import()` on first pay / first sheet), or dropped for Radix Dialog's built-in trap. Neither in the initial bundle.
- [ ] Merge identical line items (same id + same modifiers) so cart size stays bounded.
- [ ] `next/font` (no runtime Google Fonts); `preconnect` only origins that survive.
- [ ] **Mobile GPU budget** — no `backdrop-filter` and no large `blur()` layer below `md:` (stacked buffers OOM-crash the iOS WebKit tab; the delivery repo shipped that incident). Mobile surfaces stay opaque, glows are `radial-gradient` falloffs not `blur()`, heavy decorative layers are `md:`-gated, and animation COUNT is budgeted for the FIRST composite — the menu ambient and hero are in view on load, so offscreen-pause doesn't cut peak.

## C · Security & Privacy

P0 (before any real card/PII)

- [ ] **Server-authoritative pricing**: server recomputes subtotal/tax/service/promo from menu-ID + validated modifiers; client total is display-only. Stripe **PaymentIntent created server-side** for the server amount.
- [ ] **Promo codes server-validated** (Supabase RPC / Stripe Coupons) with usage caps + redemption rate-limit; no code list in client source.
- [ ] **Group-cart auth**: server-issued, short-lived, QR-bound table session (not guessable); server-authoritative cart; per-action authz (host-only lock/unlock/remove); **Supabase RLS** on all order tables; **private** realtime channels with server-verified membership (not `channel("table-N")` keyed by client-asserted id).
- [ ] **PCI scope = SAQ-A/A-EP**: card data only in Stripe Elements/Checkout iframe — never in DOM/state/logs/analytics.

P1

- [ ] **No external scripts without SRI**; prefer self-host/bundle (Radix Dialog removes the focus-trap CDN; bundle confetti). `next/font` for fonts.
- [ ] **Security headers** via middleware: CSP (script/connect/frame-src allow-listed to self + Stripe + chosen PostHog host), `frame-ancestors 'none'`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, HSTS.
- [ ] **Escape all user strings** (friend names, etc.) — rely on JSX, never `innerHTML` untrusted data; length-cap + allow-list names. Drop any debug telemetry panel from prod.
- [ ] **Self-host menu images**; `referrerpolicy="no-referrer"` on any remaining external image (stop leaking diner IP/UA/Referer).

P2

- [ ] **PostHog PII rules**: no names/emails/phone/card in event props (opaque seat IDs, not `{by: name}`); `person_profiles:'identified_only'`; choose EU vs US cloud deliberately; cookieless + consent.
- [ ] **CCPA/CPRA**: privacy notice at contact capture, "Do Not Sell/Share," DSAR path, retention limits, RLS-protected contact storage. Keep the public review prompt open to all (no rating gate).
- [ ] External "Rate on Google" link: `rel="noopener noreferrer"` + `referrerpolicy`.

## D · Edge-case test matrix (must pass before launch)

- [ ] **Reorder → split**: reorder a 1-person history while a 3-person party is active → no crash, party resets to You, no stale lock/presence timers.
- [ ] **Presence honesty**: Pickup/Scan & Go never auto-add items from "remote friends"; no phantom charge to the host.
- [ ] **Lock enforcement**: under host lock, NO path adds, removes, reassigns, or decrements — menu, cart steppers, ✕, avatar reassign, upsell, friend-presence all blocked.
- [ ] **Cross-owner delete**: removing another guest's item asks for confirmation (or is host-only).
- [ ] **Customized-variant stepper**: menu `−` on a dish with >1 modifier variant does not silently delete the customized line — it routes to the cart or disables.
- [ ] **Mode change mid-order**: switching dine-in→pickup drops party/lock/presence (or warns), no nonsense "locked party-of-3 to-go bag."
- [ ] **Sold-out**: an 86'd item already in the cart can't be incremented; menu shows a disabled control, not a missing one.
- [ ] **Split math**: per-person shares include promo + tax + service and reconcile to the exact total to the cent; rows note "incl. tax, service, promo."
- [ ] **Empty cart in a group**: removing all items offers to end the group and cancels presence timers (no phantom re-add).
- [ ] **Payment decline → retry** keeps the cart and re-opens cleanly.

## E · Parity gates (close before public launch)

- [ ] **Native Apple Pay / Google Pay** via Payment Request API → Stripe Payment Element (highest-leverage gap).
- [ ] **Real receipt** — email ✅ (consent-first capture in `ReceiptActions`; the durable `?r=` artifact + the branded email both carry the identity foot and the SB-1524 disclosure). **SMS still unbuilt.**
- [ ] **The printed receipt is the same document** — `@media print` re-pins the light tokens (a dark-mode diner must not print near-white ink on forced-white paper), hides chrome AND the fixed page ambient (a fixed layer repeats on every printed page), and keeps the identity foot + the SB-1524 disclosure on paper. Verify from both themes.
- [ ] **Group-ordering decision shipped** — either true multi-device (invite token + Realtime) or dine-in-only split + post-pay receipt-split.
- [ ] **Honest scheduled pickup** — slot capacity + server fire-time; ETA echoes the chosen slot.
- [ ] **Live 86 / KDS status** from the POS instead of cosmetic timers (can be v2 if POS exposes it).

---

> Keep the moat through all of it: bilingual Burmese on functional surfaces, SB-1524 transparency, focus-managed accessibility, editorial craft. Source: the four parallel specialist reviews in [`RED-TEAM.md`](RED-TEAM.md).
