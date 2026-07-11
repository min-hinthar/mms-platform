# Journey Track (J0–J6) — paths over screens

**The gap this plan closes:** three initiatives deep (M5 hardening → Richness R1–R9 → the World-Class UX
slices), every *screen* now clears the ≥4.3 rubric bar — and the app still feels **assembled, not
choreographed**. That's because all prior plans score and build *surfaces*: tokens, textures, per-screen
signature moments. None designs the **path**: what a diner feels *between* screens, across the arc of a
meal, and across visits. This track is that layer. It does not re-plan any surface — it choreographs the
ones we have.

Companion docs: `RICHNESS_PLAN.md` (surface richness, shipped) · `WORLD_CLASS_UX_PLAN.md` (craft+identity,
shipped) · `docs/context/RUBRIC.md` (screen rubric — J0 extends it) · `QR_FROM_DELIVERY.md` (M5 primitives).

## Why it still doesn't feel world-class (five named gaps)

1. **Hard cuts.** Every route change is a cold cut: tap an item → a sheet appears; pay → `/track` is a new
   world; receipt → `/account` re-introduces itself. No shared-element continuity, no directional grammar
   (forward vs back look identical), staggers replay as if you'd never been there. World-class apps shoot
   the whole flow as **one camera move**; we cut between sets.
2. **Undesigned arrival.** Scanning the table sticker — the single most branded moment of the night — lands
   on a utility menu. No place-setting beat ("you're at Table 7, we know it's you four"), no guided start.
   Peak-*start* is missing (peak-end rule: people remember peaks and ends; we designed neither end of
   dine-in).
3. **Undesigned wait.** Anticipation is the core restaurant emotion, and we have the REAL data to feed it —
   line states `fired → in_progress → served` (S2) — but mid-meal they render as chips on cart lines, not
   as a story ("first round is with the kitchen · Mohinga is on the stove"). Nothing invites the second
   round or dessert at the *right moment* (the one upsell that's hospitality, not a nag — and a direct
   revenue path).
4. **Deciding is a catalog, not a guided path.** R6 shipped *finding* tools (search · scroll-spy · dietary
   filters · badges) — great for diners who know what they want. First-timers face a wall of items with no
   curated "start here," no social proof from real order data, no party-aware guidance.
5. **No memory.** Every visit is the first visit. No "welcome back," no favorites, no "your usual" reorder
   (deferred in M4 follow-ups); Rewards is a ledger, not a relationship. Recognition is the heart of
   hospitality and we have none of it.

**Root cause:** `RUBRIC.md` scores screens, so we built great screens. You get what you measure. J0 fixes
the measuring stick first.

## The frame — design six moments, not twelve screens

| Moment | Dine-in | Pickup | Grocery |
| --- | --- | --- | --- |
| **Arrive** | scan → place-set + party | intent → slot clarity | walk in → scanner up |
| **Decide** | guided start · social proof | reorder/usual first | n/a (list in hand) |
| **Commit** | order together · send rounds | order → "we've started" | scan tempo, instant adds |
| **Wait** | table timeline · second round | countdown → "come up" | none — that's the point |
| **Settle** | split → everyone-paid beat → goodbye | handoff + thanks | one-thumb pay-and-go |
| **Return** | welcome back · usual · tier | same | same |

Every J-phase below designs one row of this table end-to-end, with real data only (never a fabricated
"on the stove" — `in_progress` comes from the KDS).

## J0 — Measure the path (rubric + funnels + baseline) `docs + analytics, small PR`

- Add **journey axes** to `RUBRIC.md`, scored per *path* (scan→paid per mode), same ≥4.3 bar:
  **Continuity** (does anything persist/move across the cut?) · **Progress clarity** (do I always know
  where I am + what's next?) · **Effort** (taps/decisions per step vs the theoretical floor) ·
  **Emotional arc** (designed peak-start and peak-end?) · **Dead-time** (is waiting designed?) ·
  **Recognition** (does visit N ≠ visit 1?) · **Recovery** (no dead ends — extends QA §D).
- **PostHog funnels** per mode from events we already fire (`item_added_to_cart`, `send_to_kitchen`,
  `promo_applied`, pay success): scan→first-add→send→paid. **Headline metric: time-to-first-add** (scan →
  first add, median — the restaurant version of time-to-value; a great menu path gets a first item into
  the cart inside 90 seconds). Hospitality metrics: **second-round rate** (J3's target) and
  **return-visit rate** (J5's). Baseline before J1 so every phase PR ships a before/after.
- **Walkthrough baseline:** scripted Playwright pass on the Vercel preview (mobile viewport), one
  screenshot per journey step per mode, committed to the PR description — the "before" reel.

## J1 — Continuity engine (the global "feel" lever) `apps/qr, one PR`

The single highest-leverage fix for "assembled → choreographed."

- **Route transitions with a directional grammar:** forward = content slides in from the right; back =
  reverse; the wayfinding chrome (AppHeader) never re-animates. Menu→cart→checkout→track reads as one
  push; account/track→menu reads as return.
- **Shared-element continuity** at the three highest-traffic cuts: menu item photo → item-sheet hero;
  CartBar total → checkout hero-total; checkout receipt → `/track` receipt panel.
- **Vendor decision (evidence-checked against the installed stack):** Next 16.2.9 *has* the
  `experimental.viewTransition` flag, but it rides React's experimental `<ViewTransition>` — and our
  stable React 19.2.7 doesn't export it (verified) — so the native path would mean a React canary in a
  money app: **disqualified**. Primary: **`next-view-transitions`** (~2KB, works on stable React by
  wrapping `document.startViewTransition` around App Router nav; shared elements via plain CSS
  `view-transition-name`, a browser feature needing no React API; degrades to an instant cut in
  non-supporting browsers). Fallback: framer `template.tsx` crossfade (already in-bundle, but no shared
  elements). Revisit native when React stabilizes ViewTransition. Reduced-motion gate on all; the plain
  cut remains the RM experience.
- **Timebox:** J1 is ONE PR — the directional grammar + exactly the three named cuts. Continuity is an
  enabler for J2–J4, not a rabbit hole; anything past those three cuts ships with the phase that needs it.
- Kill the stagger-replay: entrance staggers (`.mms-stagger`) fire once per *session* per surface, not per
  mount (sessionStorage flag) — returning to the menu mid-meal should feel like turning back to your
  table, not a re-premiere.

## J2 — Arrival + guided start `apps/qr, one PR`

- **Place-setting beat (dine-in):** once per session after the table session mints, a ~900ms non-blocking
  band settles into the menu header: "Mingalaba ✦ Table 7" + live party avatars (presence already exists).
  Not a splash — it condenses into the persistent table chip. RM-gated; skippable by scroll.
- **"Start here" band** at the top of the menu: 4–6 curated items (chef's picks now — extends R6b's
  hardcoded upsell pairs; upgraded to real "most-loved this month" once J0's aggregate lands). Social
  proof = **upgrade the existing honest `popular` catalog-tag badge** (`lib/menu/badges.ts` — which
  rightly refuses to fabricate a "most-loved") into a **server-derived, cached, counts-only** signal
  (no uid ever leaves the server; service-role aggregate, revalidated hourly) — the counts make the
  claim *real*, which is exactly the badge rule's spirit.
- **Party-aware copy** for groups ("feeding four? the lahpet + two mains spreads well") — copy per v7.2
  voice, honest (no fabricated counts).
- **Bilingual voice rule for every new journey moment:** menu items already render `name_my`
  (MenuBrowser/ItemSheet) — the *journey* copy must match: the arrival greeting, wait narration, and
  goodbye each carry their Burmese line (Mingalaba ✦ / Kyay-zu tin ba de), Padauk-safe, not decoration.
- Pickup arrival = slot-first clarity (exists) + the same start-here band.

## J3 — The wait, designed `apps/qr, one PR`

- **Table timeline** (dine-in, mid-meal): a slim strip on the menu + cart (where diners actually sit
  after sending) narrating REAL line states: "First round is with the kitchen" (fired) → "Mohinga's being
  made" (in_progress) → "Tea leaf salad — served ✓". **Verified real data:** the KDS drives these — the
  kitchen taps Start (`fired→in_progress`) and Ready (`in_progress→served`) in `KdsBoard.tsx`, so the
  narration is the kitchen's own taps, never a guess. Realtime via the existing cart subscription; one
  live region; never a fabricated ETA. **Poor-wifi reality:** restaurant interiors drop realtime — the
  strip degrades to refetch-on-focus/visibility (never narrates from a stale snapshot; a disconnected
  strip says "reconnecting", not yesterday's state).
- **Right-moment prompts:** when the last main flips `served`, one quiet dessert/tea invitation (a band,
  not a modal). When the table's been idle post-serve ~20min, surface "ready to settle up?" — the check
  that arrives before you have to ask for it.
- **Pickup wait:** slot countdown → "we've started your order" (first line fires) → "it's ready — come to
  the counter" + an *I'm here* button that pings the staff board (rides the existing floor realtime
  channel — `lib/useFloorRealtime.ts`).

## J4 — Settle & goodbye (peak-end completion) `apps/qr, one PR`

R7a designed the success *spike* (checkmark · confetti · +N Stars); this designs the *exit arc* after it —
the part the peak-end rule says diners actually carry home.

- Post-celebration on `/track`: the receipt visibly **tucks into your account** (shared-element into the
  account icon; J1 makes this cheap), Stars earned roll into the tier ring live, then a quiet
  "Kyay-zu tin ba de — see you next time."
- **Group settle moment:** when a split fully settles, the whole table sees "everyone's paid 🎉" (realtime
  broadcast exists via cart lock/settle state) — the shared end-beat for the shared meal.
- **Timed, ungated review ask** (compliance: reviews ungated): one ask, after the goodbye beat, never
  before food is served.

## J5 — Recognition (return visits) `apps/qr + 1 small migration, one PR`

- **Welcome back** at arrival: name if upgraded ("Mingalaba, Min ✦"), else "third visit this month ✦" from
  the uid's own order history (RLS-scoped; no migration).
- **Reorder "your usual"** — the deferred M4 item, done right: `reorderOrder(orderId)` server action that
  re-derives every line via `priceItem` at TODAY's prices/availability (never copies stored amounts —
  pricing stays server-authoritative), skips discontinued items with an honest note, lands as draft lines.
  Surfaces on `/account` order rows + the menu welcome-back band.
- **Favorites:** heart on menu items → uid-scoped `qr_favorites` table (RLS: own rows only; the one
  migration in this track) → "your favorites" rail at the top of the menu on return.

## J6 — Mode tempo tuning `apps/qr, one PR`

- **Grocery = speed-run:** scan → instant add (optimistic count exists), giant running total, one-thumb
  pay-and-go, exit pass moment. Cut every tap that isn't scan/pay.
- **Pickup:** step-count audit scan→slot→paid; target ≤ the theoretical floor + 1.
- **Dine-in:** round-based framing (drinks first, mains second) if J3's timeline shows tables naturally
  order in waves.

## Sequencing + how we work it

**J0 → J1 → J2 → J3 → J4 → J5 → J6.** J0 is the measuring stick (small, fast). J1 is the *enabler* —
timeboxed, because continuity is what every later phase composes with (J4's receipt-tuck is a
view-transition) — but **J2/J3 are the substance**: arrival and the wait are where "hospitality, not
e-commerce" is actually won. Honest sequencing note: if the feel-test that matters most is *your own*
repeated visits, **J5 (recognition) moves that needle hardest** — it's safe to pull forward after J1
since only the favorites rail depends on nothing else. J5 needs J0's aggregate + the one migration.
Each phase: one PR on the standard gate (build · lint · typecheck · migrations-check · require-docs),
pre-PR sweep + fresh-context adversarial review pre-PR and pre-merge (both lenses now include the
**journey axes**), before/after journey-rubric score + funnel snapshot in the PR body, preview
walkthrough before merge-go.

**Guardrails (unchanged, non-negotiable):** server-authoritative pricing everywhere (J5's reorder
re-derives; J2's aggregates are counts-only, server-cached); RLS on the favorites table + any new read;
reduced-motion off-switch on every J1–J4 animation; mobile GPU budget (no backdrop-filter/large blur);
one live region per view (J3's timeline replaces, not adds); tokens only; honest microcopy — a state we
can't derive from real data does not get narrated.
