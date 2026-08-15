# 🏭 Production Plan — the W-track ("the working house") — 2026-07-16

**The brief (Min):** _"App is improving but nowhere near production level polish / world-class design
thinking — UI/UX + user flow + kiosk/terminal for front house + kitchen + polished grocery menu items +
cart."_ This is the plan-of-record for closing that gap across all four fronts: the **flagship diner path**,
the **kitchen/expo**, the **grocery market**, and **front-of-house (register + kiosk)**.

**How it was made:** an 8-agent pass — four adversarial audits of the shipped code (diner path · grocery ·
staff/kitchen · foundation) + four world-class benchmark researches (sunday-class QR dine-in · restaurant
kiosks · commercial KDS · scan-and-go grocery: Sam's Club, Weee!, Toast, Square, Fresh, McDonald's, Bite,
Snackpass). Every code claim below was read from the repo, not from docs; the two ship-blockers were
re-verified by hand (`totals.ts:52`, `kitchen.ts:70`).

Companion docs: [`WORLD_CLASS_UX_PLAN.md`](WORLD_CLASS_UX_PLAN.md) (2026-07-02 — this plan resumes and
supersedes its sequencing), [`M6_DESIGN.md`](M6_DESIGN.md) (kiosk/Terminal/EBT — W6 pulls P6.1's shell
forward, hardware phases stay gated), [`GROCERY_SCANGO.md`](GROCERY_SCANGO.md),
[`HOLISTIC_IMPROVEMENT_PLAN.md`](HOLISTIC_IMPROVEMENT_PLAN.md) (the hardening tail W1 closes),
[`context/RUBRIC.md`](context/RUBRIC.md).

---

## 1 · Why the self-scores said ≈4.5 and the owner feels ~3 — the honest diagnosis

The J/K-track re-scores weren't dishonest; they measured the wrong denominator. Five structural reasons the
gap survived every gate:

1. **The rubric graded screens and paths — not the product.** Photography, catalog data, receipts,
   bilingual depth, and ops tooling are _product_ gaps invisible to a per-surface score. A menu whose rows
   are beautifully token-pure still reads "unfinished" when a dish has no real photo. **CORRECTED
   (W16d, 2026-08-15): that count is ~3, not 31.** The 28 rows pointing at a `fallback.jpg` in the
   delivery bucket are REAL per-dish photos — a probe of the live bucket showed distinct sizes and
   etags per id; a W13 filter had been hiding them behind the placeholder. Only the ~3 NULL rows
   (`seed.sql`) are genuinely photo-less (a missing/failed src makes `BlurUpImage.tsx:37` return
   `null` → the designed placeholder).
2. **v7.2 covers only the diner path.** `grep grocery docs/prototype/v7.2.html` → 0; there is no KDS, expo,
   kiosk, or grocery-browse prototype. The fidelity gate ("strings verbatim from v7.2") had _nothing to
   check_ on exactly the surfaces the owner named — so they were de-novo styled and never held to a bar.
3. **WORLD_CLASS_UX_PLAN shipped 1 of 6 slices, then the J/K tracks pivoted.** The proof homepage landed
   (#104: type-scale tokens, ✦ wordmark, favicon, themeColor) — but the rollout died: the `--fs-*` tokens
   are consumed in **3 CSS rules** while the flagship carries **~361 inline `fontSize:` magic numbers**;
   menu//track/ have **no `loading.tsx`**; the designed empty/error states never came. The craft debt is
   documented, diagnosed, and unpaid.
4. **~15 verified-open items are scattered across four docs with no registry** (HANDOFF "parked",
   HOLISTIC 📋 tail, M6 deferrals, QR_FROM_DELIVERY backlog) — some entries stale (HANDOFF still lists the
   P1.2 modifier sheet as open; it shipped as R6b). Scatter is how "all boxes checked" and "not production
   ready" were both true.
5. **Content is ~60% of the grocery gap.** The market runs on **6 seeded SKUs, zero photos, no category
   column** — the 198-SKU POS import has been "Next" since June. No amount of code polish fills an empty
   shelf.

**Calibration (what the audits confirmed shipped and good):** server-authoritative money, the S1–S4 staff
spine, R-track motion discipline, J/K journey choreography, the #103 security batch, contrast-audit infra.
The distance is **shell, content, ops tooling, and follow-through** — not re-architecture.

---

## 2 · Where each front actually stands (audit verdicts)

| Front                   | Felt score                | One-line verdict                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Flagship diner path** | craft ≈4.3 · product ≈3.2 | Engineering strong; the three things a diner sees first are the three weakest — missing photos, emoji-as-iconography, magic-number type. Plus: no custom tip, no order # on /track for food orders, no receipt artifact, EN-only money path.                                                                                                                          |
| **Kitchen / expo**      | ≈3.2                      | "A scaled-down consumer web page, not a hardware-grade ops tool." **A working kitchen would reject it in the first hour:** 15px items / 13px muted modifiers unreadable at arm's length, zero ticket aging, no sound on new tickets, no all-day counts, no recall — and **paid pickup/scango orders never reach it at all** (`kitchen.ts:70` `.eq("mode","dinein")`). |
| **Grocery**             | ≈2.8                      | "A scanner demo on a 6-SKU photo-less catalog, not a store app." No browse, zero Burmese (name_my sits unused in the DB), no scan feedback, held items silently re-add every 1.5s — and **two money blockers** (below).                                                                                                                                               |
| **Foundation / FOH**    | ≈3.2                      | "A beautifully-crafted interior with no production shell": public/ = one SVG, no manifest/SW/OG, no receipt email, no register (walk-up/phone orders **cannot be entered**), kiosk groundwork = one comment.                                                                                                                                                          |

**Ship-blockers found (fix before anything else):**

- 💸 **Grocery baskets pay the 5% restaurant service charge** — `getCartTotals` applies
  `serviceChargeCents` over all lines with no fulfillment filter (`apps/qr/lib/totals.ts:52`), and checkout
  discloses it as _"supports fair kitchen wages (CA SB-1524)"_ on a bag of rice. Wrong money **and** wrong
  legal disclosure. Tip presets are offered on pure-grocery baskets too (`Checkout.tsx:701`).
- 🍳 **The kitchen never sees pickup/scango food** — `getKitchenQueue` hard-filters `mode='dinein'`; a paid
  pickup order is cooked from… nowhere (expo is a bagging surface sorted by `created_at`, so a 6pm slot paid
  at noon heads the queue all afternoon).

---

## 3 · North stars per front (what "world-class" concretely means here)

Distilled from the benchmark pass — each is the _one sentence to build to_:

- **Diner:** _sunday's decomposition of "premium":_ each screen does ONE job, the amount is the hero,
  wallet-first pay in <10s (83% scan-to-pay), **every fee visible before the pay button** (their #1
  Trustpilot complaint is surprise fees — our SB-1524 line must sit _above_ the tip ask), and QR as a fast
  lane **beside** paper menus and human service, never a phone-gate (66% of diners resent forced QR).
  Photos are _explanatory_ for an unfamiliar Burmese menu, not decorative — and Snackpass's per-category
  Gallery/Classic/Text layouts mean launch never blocks on photographing everything.
- **Kitchen:** _one well-tuned screen; the **bump event** is the single source of truth_ — it drives the
  diner's /track, the order-ready TV, expo state, and (via `fired_at/bumped_at`) every kitchen metric for
  free. One color dimension = urgency (2 thresholds, header-strip only), one symbolic dimension = channel
  badge. Legibility contract: item lines ~28–40px at 1–2m (the signage rule), modifiers at 70–80% full
  contrast — they carry the allergy line.
- **Grocery:** _Amazon killed Just Walk Out because invisible magic loses to a **visible, itemized cart**_
  (Sam's Scan & Go is the model: continuous scan, haptic+chip confirm that never blocks the camera, pinned
  running total, QR exit pass verified in seconds, risk-based never-accusatory spot checks). Catalog cards
  to **Weee!'s anatomy** (the Asian-grocery gold standard): photo, bilingual name, unit price, pack spec,
  %-off badge, SNAP tag — with romanization-tolerant search (lahpet/laphet).
- **FOH / kiosk:** _the kiosk is a hardened large-touch **mode** of the same app, placed **beside** the
  counter_ (Sweetgreen: kiosks stall first-timers unless a host greets — the family at the counter IS the
  host). McDonald's economics come from unhurried judgment-free browsing (+15–20% checks), Bite's from
  **exactly one** well-placed upsell. EN/MY tiles are the first screen (near-zero US restaurants offer
  non-English ordering — a real moat). 30–60s idle → countdown modal → cart+session wipe.

---

## 4 · The W-track — phases

Same working rules as R/J/K: **one phase-slice = one PR**, pre-PR sweep + fresh-context adversarial review
pre-PR **and** pre-merge, preview link + **owner go** per merge, migrations applied-to-live before merge.
New rule this track (from §1): **every UI PR posts phone-frame screenshots of the changed surfaces in the
PR body** — the felt-quality gate that self-scores skipped.

### W0 — Truth & the bar (docs only, 1 PR)

The 20%-effort fix for the measurement failure that let the gap survive:

- **`docs/OPEN-ITEMS.md`** — the single severity-tagged registry. One sweep of HANDOFF "parked" +
  HOLISTIC 📋 + M6 deferrals + QR_FROM_DELIVERY leftovers + this plan's findings; retire stale entries
  (e.g. P1.2 modifier sheet = shipped R6b). Updating it joins the "Gate before done" checklist.
- **Extend `context/RUBRIC.md`:**
  - **O-axes (ops surfaces — the missing scorecard):** O-A legibility-at-distance (readable at 1–2m) ·
    O-B glanceable time/urgency · O-C attention without looking (sound/flash) · O-D rush behavior
    (20 tickets) · O-E fat-finger safety (bump/undo/recall) · O-F always-on resilience (wake lock, auth
    expiry, reconnect). Same ≥4.3 bar.
  - **Widen the existing grocery journey row** (scored 3.1 at J0) with the browse and exit stages it
    currently skips (browse → scan → basket → pay → exit).
- **Design sources for the unprototyped surfaces** — a `docs/prototype/` addendum (or per-surface spec
  docs): KDS ticket + board, order-ready TV, grocery browse/scan/exit-pass, kiosk attract/idle. Without
  this, W3–W6 repeat the "no bar to check against" failure.

### W1 — Stop the bleeding (money + trust, 3–4 PRs — CODEOWNERS-flagged, don't compress)

- **Grocery money (its own PR, first):** exclude `fulfillment='grocery'` lines from the service-charge base
  in `getCartTotals` — the 5% lives **only** there (`0.05` appears once in the codebase); verify the share
  proration (`create-share-intent`) and cash settle consume the new base rather than re-deriving; suppress
  the service-charge row + SB-1524 paragraph AND the tip group on pure-grocery carts; force `tipRate=0`
  server-side at create-intent for pure-grocery. _Blocker; ships first._
- **The verified-open hardening tail** (HOLISTIC 📋, all confirmed live in code): Q4 `settle_at` refresh
  (split >10min dead-ends with cards authorized ~7 days), Q6 seven unthrottled mutations, Q7 PIN-lockout
  DoS pre-check, Q9 uid in the intent idempotency key, Q11 CSP fallback + host pinning +
  `requireStaffPage()`. Split per HOLISTIC's own ranked batches — Q4 (split money) separate from the
  hardening sweep; Q11's staff-page refactor touches every staff route and shouldn't ride a money PR.
- **/track refund arm (its own PR)** — a refunded diner currently sees the tracker collapse with no
  explanation of where their money went (`OrderTracker.tsx:58,158`). Diner-facing money surface; belongs
  with W1, not polish.

### W2 — Finish the flagship (the WORLD_CLASS resumption + art direction, ~8 PRs; W2c can pair screens to compress)

The abandoned slices 2–6, plus the art-direction layer the plan never had:

- **W2a Photography + placeholder system.** Needs Min: one afternoon shooting the ~31 unphotographed dishes
  (§5). Code side: migrate the photo bucket into the QR project (`fasnpdhtvqtzjlvruqcu` — today every URL
  hotlinks the **delivery** project's storage and one bucket change over there silently blanks our menu;
  narrow `remotePatterns` accordingly) · a **designed placeholder** (✦ + category glyph over the gradient,
  or Snackpass-style per-category Text layout) so a missing photo never reads broken · collapse the empty
  200px `.item-hero` band when `image_url` is null.
- **W2b Icon system.** Replace ~30 functional emoji (🔍🗑🧾🪑♥💳🔥…) with a ~20-glyph SVG set at the brand's
  stroke weight (restyled Phosphor/Lucide subset; ✦ stays the one brand mark; emoji only ever content, never
  chrome). One PR, app-wide.
- **W2c Type-scale + skeleton sweep, one screen per PR:** menu → checkout → track → rewards/account onto
  `--fs-*/--lh-*/--s*` (kills the 361 magic numbers; add the lint ban on numeric `fontSize` so it can't
  regress) + geometry-matched `loading.tsx` for `(order)/menu`, `(order)/dine-in`, `/track` (the `@mms/ui`
  Skeleton + the cart/account pattern already exist). Restyle `error.tsx` onto tokens + chunk-reload guard.
  The `fontSize` lint ban is **directory-scoped and widened per sweep** (the ~360 magic numbers span staff
  surfaces too — a repo-wide ban after a diner-only sweep fails lint everywhere else); W3b's KDS scale lands
  on `--fs-*` tokens (or a dedicated KDS tier) so W3 adds no new violations.
- **W2d Checkout/pay craft:** **Stripe Express Checkout Element** (Apple/Google Pay) rendered _above_ the
  card element — wallet-first is the single highest-leverage benchmark finding · **Custom tip** chip
  (dollar input, server-confirmed like the presets) · fee lines itemized above the tip ask · elevate the
  group-cart "this pays the full order" caveat into the CTA label ("Pay the whole order · $84.20") ·
  designed empty-cart state.
- **W2e Post-pay artifacts:** short **order code on every /track receipt card** (today only grocery gets
  one — a dine-in diner has nothing to quote at the counter) + itemized lines on the receipt card ·
  **email receipt** ("Email me this receipt" → Resend `OrderReceiptEmail`; set `receipt_email` on the PI) ·
  `@media print` stylesheet. Sold-out treatment (desaturated photo + "Sold out today" badge + sink to
  category bottom) and the single-control "Customize · from $14" row ride along.

### W3 — The kitchen you can trust (KDS/expo, ~5 PRs)

- **W3a Route every channel (the ops blocker).** Fired pickup/scango food lines enter the KDS at their
  `fire_at` (the unified fire-timer already anticipates this); scheduled orders render as dimmed **HELD**
  cards with their slot time, auto-firing at `slot − prep` (Fresh's pattern — prevents a 5pm pickup aging
  red since noon). Expo sorts by `(arrived? 0:1, pickup_slot ?? created_at)` with "Here now" pinned.
- **W3b The ticket + the board.** Dedicated KDS type scale: table/order # 32px+, item lines ≥28px/800, qty
  as a large solid chip, modifiers ≥20px **full-contrast** (they carry the allergy line), notes on a red
  band. Full-bleed board (drop the 1100px cap + page chrome), **Night theme default** (glare + burn-in).
  Channel = a fixed header badge; urgency = header-strip color, **two thresholds per channel**
  (e.g. dine-in 8/12min; pickup ages from fire time) + mm:ss elapsed. New migration: **bounded
  `qr_cart_items.notes`** (Zod `.max` + column CHECK) + a notes field on ItemSheet and the staff line
  editor — today there is **no way to tell the kitchen "no peanuts"** (`ItemSheet` literally says "tell our
  staff about any allergy" and staff have nowhere to put it).
- **W3c Attention + rush.** Gesture-armed chime (one "enable sound" tap at shift start; loud, per-channel
  tones, volume slider, re-chime at 60–90s un-started) + "N new" pill + edge flash (reuse the FloorBoard
  pulse-nonce pattern) · fixed grid (2×4 on 15.6" landscape) + **paging with an unmissable "+N more"**
  (never shrink text) · **all-day rail** — "Mohinga ×4 · Shan noodles ×3" reduced client-side from the
  existing snapshot (the batch-cooking view a wok kitchen actually uses) · header shows oldest-age + late
  count.
- **W3d Bump, recall, resilience.** Ticket-level bump (full-width ~60px zone) + per-line check-off ·
  **Recall rail** (last 5 bumped, 2 min) + 6s undo — today a mis-tap on "Ready" is unrecoverable from the
  board · `navigator.wakeLock` + visibilitychange re-acquire · distinguish 401 from network in refresh()
  (an expired staff cookie currently wears "Reconnecting…" forever) · station **tags** (category chips +
  client-side filter — data station-aware, second screen stays config not schema).
- **W3e The order-ready board.** Read-only `/board` route on any smart-TV browser: Preparing | Ready two
  columns, **first name + short order #**, gold flash on the transition, auto-clear 10min after pickup.
  The bump is the only write that moves a card — but the TV **cannot** ride the existing realtime channels
  (they're private, RLS-gated on `realtime.messages`; an unauthenticated browser can't subscribe).
  **Recommend: a sanitized poll endpoint (first name + short code + status only, nothing else) behind a
  device token in the board URL, 5s interval** — matches the house 5s-poll-backstop pattern, zero
  `realtime.messages` policy change; a staff-authed TV login is the fallback. Requires capturing a
  **first name at pickup/scango checkout** (one optional field — which also fixes expo's "nothing to call
  out": today the bag label falls back to the session's raw `qr_code` label). Metrics ride free: `fired_at/started_at/bumped_at` →
  avg ticket time + late count in the board header; weekly owner rollup later.

### W4 — The market grows up (grocery, ~4 PRs + a data sprint)

- **W4a Catalog (the 60%).** Needs Min + data work (§5): import the **198 POS SKUs** with barcodes,
  **category**, size/unit, `name_my`, photos into `grocery_items` (schema adds `category`, `size_qty`,
  `size_unit`, `synonyms text[]`). Render **unit price** ($/lb, $/oz) and pack spec on every card; EBT
  badge stays; add the **EBT-eligible subtotal** line (undated, honest copy: "EBT-eligible — SNAP checkout
  coming; pay by card today" — FNS authorization is federally gated, never promise a date) — makes the
  2027 Forage landing trivial.
- **W4b Browse + scan, one catalog.** Two tabs over one surface — **Browse** (category grid, Weee!-anatomy
  cards, photos, bilingual names) and **Scan** (camera) — a scan deep-links to the same item card the
  browse path uses. Search over `name + name_my + synonyms` with `pg_trgm` fuzziness (lahpet/laphet/
  mohinga/mohingar as _data_). Grocery items stay one-tap add, never a modifier sheet.
- **W4c Scanner craft.** On emit: `vibrate(10)` + tone + 300ms green viewfinder flash with the item name
  overlaid (red double-pulse for unknown) · center reticle + dimmed surround · **torch toggle** where
  `getCapabilities().torch` · leave-frame dedupe (suppress the code until N frames absent — today holding a
  jar silently re-adds it every 1.5s) · throttle detection to ~150–200ms + migrate `@zxing/library` →
  `@zxing/browser` · pause/resume + auto-pause offscreen · permission-denied branches on
  `DOMException.name` (Settings guidance + Retry vs search fallback) · the **scan-failure ladder**: retry
  hint → search/manual barcode entry → "Ask us — we'll ring it up" (flags the order for counter assist).
  Never a dead end.
- **W4d Exit + trust.** Render the pass as a **QR** (order id → server lookup) + a **staff scan view**
  (line items, total, one-tap OK; 3-random-item spot check UI framed as "quick check", never "audit") ·
  persist the paid pass to localStorage so a radio blip at the concrete-walled door can't strand the
  shopper · screen-brightness/wake hint while showing · weighed items: parse **price-embedded type-2
  UPCs** (deli/produce label scales — the standard solve; a cheap label-printing scale at the counter is
  the hardware, §5), interim honest copy ("bring it to the counter — we'll add it there"). Per-line
  fulfillment tax is already correct; cart dead-ends route back to `/grocery`, not the restaurant menu.

### W5 — One tongue (bilingual system, ~2 PRs)

The moat, currently one field deep. **App-wide EN↔MY toggle** (persisted; sets `<html lang>` for real —
`layout.tsx:80`'s comment describes code that was never written) · localize the **money path's ~20 key
moments** (tip labels, pay CTA, order status, service-charge plain-voice line) — today cart→pay→track is
monolingual for the community the family actually serves · `name_my` on **modifier options** + category
names (migration) — the exact decision points where an elder needs it · grocery search already covered by
W4b. Kiosk (W6) and the board (W3e) consume this for free. Consider Spanish as a third language later
(LA; kiosk research shows near-zero US restaurants offer it — but only after MY is real).

### W6 — Front of house (register + kiosk shell, ~3 PRs)

- **W6a The register (before the kiosk — bigger daily unlock).** Staff-minted sessions: **"Start a
  table / phone order / walk-up"** from the floor (reuses the existing mint; today an order literally
  cannot exist without a diner scanning a sticker) · **search** + the modifier sheet (reuse ItemSheet) in
  the staff add screen — it's one long alphabetical scroll of base items today · repeat-last-order ·
  a minimal **end-of-day cash summary** (Z-report-lite off `qr_orders` tender=cash).
- **W6b Kiosk shell (M6·P6.1 pulled forward — buildable now, validated when hardware lands).** A `kiosk`
  **mode** of the same app: route-locked entry, **EN/MY tiles on the attract screen** + persistent toggle,
  three-way first screen (Dine-in → tent/table number · To-go → name capture · Grocery → scan), big-touch
  token tier (≥68px targets, 3-col grid), **idle countdown modal (30–60s) → cart clear + session revoke →
  attract loop** (the privacy reset — next customer must never see the previous cart), HID keydown buffer →
  the existing `scanAdd` (modifier-free SKUs only — exactly what grocery is), **exactly one** rule-based
  upsell between "View order" and pay (curry → tea-leaf salad; hot dish → milk tea; capped-6 rail),
  order-number handoff onto the W3e board. No rewards/upgrade UI in kiosk mode.
- **W6c Terminal (stays M6·P6.2, hardware-gated).** Server-driven Stripe Terminal per M6_DESIGN — the
  kiosk shell ends at a "pay at the counter" handoff until the reader exists. EBT stays 2027 (FNS critical
  path unchanged).

### W7 — The shell (brand assets + PWA, ~2 PRs — can interleave anytime after W1)

- **Brand kit PR:** og-image (wordmark lockup on paper cream) + `metadataBase` + apple-touch-icon +
  icon-192/512 PNGs + twitter card + manifest (name/icons/theme_color from `--pg`) · `--star` token +
  gold unification (the HOLISTIC brand-core items).
- **Resilience PR:** Serwist SW (port the delivery repo's hardened pattern — update heartbeat,
  controllerchange first-install guard, chunk-reload boundary) · online/offline banner · **grocery scan
  queue** (idempotent client-side queue + replay, keyed so re-sends can't double-add — the concrete-walled
  store case) · cached barcode→price map for instant local feedback.

---

## 5 · Needs Min (start these in parallel — they gate the code)

| #   | Item                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Gates              | Effort                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ | ---------------------------------------- |
| 1   | **Photograph the ~3 dishes without a real photo** (the NULL rows only — W16d proved the 28 `fallback.jpg` rows are real photos) — one afternoon with the kitchen; natural light, one angle, consistent plate                                                                                                                                                                                                                                                                                                                                                                                                                               | W2a                | ~half day                                |
| 2   | **198-SKU grocery data**: barcode, category, size/unit, EN+MY names, EBT flag — from the POS tax map; photos per SKU (shelf shots fine to start)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | W4a                | 1–2 days, can be incremental by category |
| 3   | **Lock the service-charge rate — recommend 5%**: it's what the code charges and the UI legally discloses today; 15% would be a live price change with its own disclosure work (the prototype has used both)                                                                                                                                                                                                                                                                                                                                                                                                                                | W1                 | decision                                 |
| 4   | **Hardware buy list** (all just browsers — no vendor lock): KDS = **recommend a 15.6" Android touchscreen on a VESA arm** at the pass, wipeable, off the wok line (~$300–500; iPad + rugged case is the fallback) · order-ready board = **the existing smart TV** ($0 — any browser) · kiosk = **recommend iPad + counter stand w/ reader mount** (~$400–700, the Square-style cheapest-credible path; a 21.5–24" portrait Elo countertop ~$1,000–1,500 only if volume earns it) · USB HID barcode scanner = any keyboard-wedge (~$40) · label-printing scale for weighed counter items (~$200–400) · Stripe S700 when Terminal lands (M6) | W3e/W6b validation | purchase                                 |
| 5   | **Resend from-address** for diner receipts (`RESEND_FROM` exists for staff mail; confirm the diner-facing identity)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | W2e                | config                                   |
| 6   | **Go/no-go on the paid UI kit stack** (DESIGN-RESEARCH §5, ~$790: HeroUI Pro + Motion+ + shadcnblocks + 1mo Mobbin) — recommended **yes** before W2/W6: it shortcuts the icon/large-touch/checkout component work materially                                                                                                                                                                                                                                                                                                                                                                                                               | W2/W6 velocity     | ~$790                                    |

---

## 6 · Build order (recommendation)

```
W0 (docs, now) → W1 (money/trust, now) → W3 (kitchen) → W2 (flagship craft)
→ W7 (shell) → W4 (grocery) → W5 (bilingual) → W6 (register + kiosk shell)
```

Rationale: W1 is regression-class (money on live paths). W3 before W2 because the kitchen is what makes
the restaurant _operate_ — every channel converges there, and the W3e board + first-name capture also lift
takeout UX immediately. W2's photography (Min-action #1) starts **now** in parallel so the code lands onto
real photos. W4 waits on the data sprint (#2) — start that now too. W5 before W6 so the kiosk is born
bilingual. Reorder by what's hurting most — deps are only: W3e needs W3a-d; W6b wants W5 + W4b; W4c/d want
W4a.

**Definition of done for the track:** every surface scores ≥4.3 on its applicable scorecard (10 dims +
J-axes + new O-axes) **scored against screenshots on real devices, with the owner's felt-quality go** — not
self-scored from code. The four fronts each get a closing re-score like J6/K6, plus the funnels (PostHog
J0/K6 boards) once real diner traffic reads.
