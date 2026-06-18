# Red-team — standards & known traps

Distilled from four parallel specialist reviews (Accessibility · Performance · Security/Privacy · Product-UX + parity) of the v7.1 prototype, each grep-verifying every claim against line numbers. The point-in-time findings were fixed in v7.2; what's durable — the **standards** and the **traps that keep recurring** — is captured here as rules. Acceptance criteria for each live in [`QA-CHECKLIST.md`](QA-CHECKLIST.md).

## The one-line lesson

v7.1 scored ≈ 4.2 and _slipped under the bar because its marquee feature — split + presence + lock in all three modes — outran its guardrails._ The design, voice, a11y bones, and the bilingual/SB-1524 moat were intact; the work was **making the plumbing as honest as the design.** That's the standing mandate: don't ship a feature whose interaction promises more than the data model honestly delivers.

## Durable standards (these don't expire)

1. **Server is the source of truth for money.** Price, tax, promo, service charge → recomputed server-side from menu-ID + validated modifiers; the client total is display-only; the Stripe PaymentIntent is created server-side for the server amount. (Red-team C1/C2 — the #1 finding and the #1 review weight.)
2. **Every mutation authorizes itself.** One `canMutate()` / membership-+-lock guard called by _every_ path that adds, removes, decrements, or reassigns. Server Actions are public POST endpoints — IDOR by default. A "lock" that only blocks increments is not a lock.
3. **Don't simulate humans doing billable things.** Presence/group features are honest only where the people are actually co-present (dine-in). Never let a fake/remote actor add a line that charges someone. Pickup/Scan-&-Go split is **post-pay receipt-split**, not live presence.
4. **Trust boundaries are real even in a prototype.** No client-held promo lists; signed, short-lived, QR-bound table sessions (not `channel("table-N")` keyed by a client-asserted id); Supabase RLS on every order table; **private** Realtime channels with server-verified membership.
5. **PCI = SAQ-A.** Card data only ever inside Stripe's iframe — never our DOM, state, logs, or analytics props.
6. **Accessibility is gating, not polish.** One focus mechanism per modal (Radix Dialog); every dialog named by its heading (not "Details"); `lang="my"` on Burmese subtrees; 44px targets; one polite live region; reduced-motion = `animation:none`.
7. **Performance is an image-and-reconciliation story.** Hero is `priority` (never lazy + LCP); all images `next/image` with `sizes`; self-host photography; cart mutates via **keyed React state**, never an `innerHTML` rebuild (saves INP + preserves focus/scroll).

## Known traps (specific bugs that recurred — keep them dead)

- **Out-of-range split index.** Reading `party[by]` with no bounds check throws; clamp `by` everywhere, and on **reorder reset** `party→[You]`, `locked=false`, `presence=false`, clear timers (a reorder mid-group desyncs indices otherwise).
- **Customized-variant stepper.** A menu `−` on a dish with >1 modifier variant must not silently delete the customized line (last-index bug) — route to cart or disable.
- **Mode change mid-order** must drop party/lock/presence (or warn) — no "locked party-of-3 to-go bag."
- **Sold-out increment.** An 86'd line already in the cart can't be incremented; show a disabled control, not a missing one.
- **XSS via names.** Once friend names are user-controlled, `innerHTML` is an injection sink — JSX-escape, length-cap, allow-list.
- **Live-region floods.** The rolling total + menu container must **not** be `aria-live`; debounce presence/toast/cart so one action isn't announced three times.

## Parity gaps to close before public launch

Ranked by leverage: (1) **native Apple/Google Pay** (Payment Request API → Stripe Payment Element) — the biggest gap vs. Square/Toast/Uber/Sunday; (2) **real receipt** (email/SMS) + the contact capture behind it; (3) the **group-ordering decision shipped** — true multi-device _or_ dine-in-only split + post-pay receipt-split; (4) **honest scheduled pickup** (slot capacity + server fire-time); (5) **live 86 / KDS status** instead of cosmetic timers.

## The moat (protect it through every change)

Bilingual Burmese (Padauk, real MY copy on _functional_ surfaces, not just dish names) · **SB-1524 service-charge transparency** · WCAG-grade focus management + `aria-live` · editorial craft (Fraunces / number-roll / spring) that reads as a teahouse. No competitor has this combination — don't trade it away for feature breadth.
