# MMS QR — Design Language (distilled M1 → W21)

The QR app's accumulated design doctrine — what fourteen build/review arcs (M1…M4, W13…W21) proved
out, written down so the next surface starts from it instead of rediscovering it. Sibling to the
research context (`docs/context/DESIGN-RESEARCH.md`, the v7.2 prototype, `RUBRIC.md` ≥4.3); this
file is the **as-built** language. The delivery repo's `docs/hero-design-language.md` is the
cousin standard — M5's thesis is that QR _learns from_ delivery, and W22 proposes the next borrow.

## 1 · Aesthetic — warm editorial paper

Cream card surfaces on a softly graded ground; **gold is the color of selection and favor**, the
accent (crimson→pink in dark "Night") is the color of action. Display serif for hero figures (the
Bill total, headings), UI sans for controls, **Padauk** for Burmese — always. Light = editorial
daylight; dark = Night. Tokens only (`@mms/ui/tokens.css`) — a hardcoded color is a bug, and
`contrast-audit`-style checks treat token changes as API changes.

**Depth (W22a·depth, as-built):** every `.card` is gently-lifted warm paper — inset `--sheen` lip
over the two-tier `--sh-paper` (tight ambient + negative-spread wide diffuse; a zero-spread wide
layer reads as a hard square frame). Diner mains sit on the `PaperAmbient` — a gradient-masked
hairline grid + gold bloom + grain, fixed at z:-1 behind an `isolation:isolate` main (never
full-bleed uniform; the fade means opaque sticky chrome never hard-cuts it). Pages carry LINES,
cards carry DOTS (`.card-textured`) — the two textures never read identical. Surface tiers:
`.surface-vellum` (the warm wash) marks moments of consideration (ConfirmSwap); glass frost is
md:+ only, on the sticky chrome. Mobile stays opaque and blur-free — the GPU budget is a hard
limit.

## 2 · The selection vocabulary — one language, every surface

A selected thing wears the **lit gold cap**: gradient fill + `--oa` ink + inner sheen + a soft
`--glow-gold` halo (`.checkout-pill-on`, `.checkout-tip-on`, `.slot-time-on`, `.taste-chip-on`,
`.slot-day-on`, the `#1` rank seal). Idle candidates are **vellum ghosts** — warm translucent
fill, gold hairline. Two hard rules learned the expensive way:

- **Self-contained active state.** Background and label live on ONE element — never a separately
  measured/positioned indicator supplying the contrast behind selected text (the recurring
  dark-on-dark active-tab bug, root-caused in the delivery repo and honored here).
- **The mode pills, tip chips, day cards, taste chips and rank seals may never drift apart.**
  New selectable surfaces adopt the existing classes or extend them in `globals.css` beside them.

## 3 · Motion idioms — small, meaningful, always escorted

| Idiom                     | Meaning                             | Where                                |
| ------------------------- | ----------------------------------- | ------------------------------------ |
| `.mms-pop`                | a VALUE changed under you           | tip previews, cart count capsule     |
| `.mms-rise`               | something ARRIVED                   | tip reactions, notices, scanned rows |
| `.mms-stagger`            | a once-per-session premiere         | arrival beat, Start-here band        |
| press glow + sheen sweep  | you COMMITTED                       | Pay CTA, ConfirmSwap proceed         |
| `--tip-heat` ladder       | encouragement as gradient, not nag  | tip chips warm 15%→30%               |
| NumberFlow rolls          | money settles like an odometer      | Bill hero total                      |
| `MarqueeRail` drift       | an ambient conveyor, never a hijack | Start-here twin rows (W22)           |
| thermal print reveal      | the moment becomes an ARTIFACT      | /track paid slip (W22a·depth)        |
| `.mms-send-beat` + settle | the order visibly LEAVES the table  | send-to-kitchen success              |

Rules: transform/opacity only (60 fps); **every** new animation/transition joins a
`prefers-reduced-motion` block the moment it's written; entrance effects premiere once per session
(SurfaceMemory) — arrival is a moment, not a loop; the haptic weights the **gesture**, not the
network (buzz on tap, never after the round trip). Ambient AUTO-motion (the W22 drift) adds three
more: it rides the native scroller (manual input always wins and pauses it), it ships a visible
pause control (WCAG 2.2.2 — hover luck is not a stop mechanism), and reduced-motion gets the
static surface exactly, duplicate DOM included (no loop set at all).

## 4 · The optimistic doctrine (W20–W21) — instant, serialized, honest

The owner's standing directive: _"make optimistic and instant feedback, instead of checking with
server database first."_ The doctrine that survived two adversarial reviews and two Codex rounds:

1. **Flip the UI the instant of the tap.** The write runs in the background.
2. **Serialize the writes** (a promise chain): commit order = issue order, so the last ok write IS
   the server's state. Two independent serverless fetches otherwise commit in arbitrary order.
3. **Token-gate the OUTCOME, not the record.** Only the latest write's outcome may touch the UI —
   but EVERY successful write updates the locally-held **confirmed value**.
4. **Revert to CONFIRMED, re-read as belt.** On refusal: snap to the last value the server is
   known to hold (works with a dead radio), then fire the authoritative re-read. Never restore a
   captured `prev` — mid-burst, `prev` is the previous _guess_.
5. **Drain before charging.** Anything that mints money awaits the pending chains first
   (`settled()` before navigating to /cart; `writesRef` before create-intent) — a lock acquired
   under an in-flight write silently refuses it and charges the stale state.
6. **Amounts are never optimistic.** Counts, pills, chips flip instantly; a dollar figure waits
   for the server. A wrong-for-a-moment subtotal on a money surface is worse than a beat's latency.

## 5 · Honesty — the claim must be data-backed, the promise must be kept

- **Rank seals only when real paid-order counts curated the rail**, tie-aware
  (`competitionRanks` — tied dishes share a numeral; a sold-out #2 never promotes #3).
- **Recommendation cards SAY the literal rule they matched** ("🍛 Rich curries"), and chip names
  state their rules ("Salads & veggies", not "Fresh & light" over a fritter). `vegan-optional` is
  NOT plant-based — the fail-safe dietary rule owns that call everywhere.
- **Surprise picks are framed as "How about this?"** — never as a data-backed match.
- No fabricated ETAs, counts, averages, or per-head splits; a value that cannot be attributed is
  reported as unattributable (`/staff/tips`' shared bucket).
- **Copy promises only what the code keeps**: "we'll call your name" only where a caller exists;
  the pickup phone was not _required_ until a staff surface could read it; "Sales tax (10.5%)"
  is computed from `taxRate()`, never typed.
- Empty states answer honestly and point somewhere useful ("try **different** cravings" — the
  matching is OR; "fewer" could only shrink the answer).

## 6 · Bilingual — one surface, two tongues

EN is the primary voice, Burmese the Padauk accent **on the same surface** — no toggle, no locale
state. `lang="my"` on every MY span (SR pronunciation); ≥13px floor for stacked diacritics; the
gap between tongues is a **margin, never a whitespace text node** (flex containers drop
whitespace-only children — the "Sales tax(10.5%)" bug, twice). Guest-facing register is spoken
and warm (တယ်/မယ်/နော်); kitchen is **မီးဖိုချောင်** (owner-corrected, W21). Every Claude-authored MY
string joins the K15 native-check ledger the day it ships.

## 7 · a11y — the floor, not the ceiling

≥44px touch targets; **one live region per view** (new features route through it, never mount a
second); focus moves on remove/route/step change — and lands on **the user's own selection**, not
the app's default (the slot sheet focuses _your_ chip, not Soonest); toggles are `aria-pressed`;
decorative seals/emoji are `aria-hidden` with an sr-only twin saying it in words; controls stay
rendered-and-disabled with a reason, never vanish.

## 8 · Money surfaces — receipt language

Server-authoritative always (the client sends ids and rates, never amounts). Name a money value
**once** and derive every reader from it. The Bill speaks receipt: dotted leaders, destination
groups ("At your table / To-go / Grocery" — headings only when the basket spans 2+), the tax rate
named beside its amount, the hero total in display serif rolling on NumberFlow. The pay step is
never totals-only — the diner itemizes what the card is about to buy, bound to the **locked**
cart's lines.

## 9 · Voice — a warm host, never a nag

Declining is never met with a reaction ("None" sits last and quiet; no guilt line). Generosity is
met warmly and proportionally (`tipReaction` climbs the ladder). Encouragement is a gradient
(`--tip-heat`), not a modal. Exits are named and honest ("Back to the start keeps your table ·
Leave this table lets this phone go — the table stays open for everyone else"). Every mode has a
door out; leaving is a navigation, never a server mutation.
