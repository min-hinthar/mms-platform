# W22d · Hue direction — DECISION NOTE (2026-08-20)

**Status (2026-08-27): PR A — the dark half — was BUILT (#235) and then REVERTED.** The owner looked
at the shipped aubergine ground and rejected it: _"I actually prefer the Night than the Aubergine"_.
All nine ground values are back to the pre-#235 originals; the dark half of this note is therefore a
**record of a rejected direction, not a description of the live palette**. Read §5's rotation tables as
history. What survives from PR A is `--jade-strong`'s lift off its alias (kept — its justification was
the width of the measurement noise, not the hue) and the guard coverage it added.

**The dark half is superseded by M126 — Night enriched, not re-hued.** The hue was never the problem:
the ladder's flatness lives on the lightness axis, and that rotation held OKLab L fixed on all four
ground values at once. **PRs B and C — the light/maroon half — are untouched by the revert and remain
blocked on Q1–Q3 below.**

_Original status, kept for the record: decided, build deferred, no code changed in that pass._

> ⚠️ **§5's trap table is HSL, and PR A did not ship an HSL rotation.** The table below rotates at
> constant HSL S/L, which raises luminance and costs the tightest combo up to 0.14 by +25°. PR A
> rotated in **OKLCH with L and C held fixed**, which keeps every ground token's relative luminance
> within a thousandth of where it was — so the trap fires far more gently than the table predicts
> (4.5012 at the shipped hue, not 4.384). It still fires — but the margin is smaller than the
> measurement's own precision, and that is the real reason to act. `mixOklab` quantizes the blended
> background to 8-bit before computing luminance; carrying floats moves this combo ~0.03 (larger than
> the rotation's own effect) and **reverses its sign** — 8-bit reads 4.5237 → 4.5012 (a cost), float
> reads 4.5112 → 4.5313 (a gain). What holds on both: the alias sits within ~0.03 of the 4.5 line.
> Registry **M122**. **Lever B was taken** — `--jade-strong` lifted off its alias to `#62b380`, which
> clears on both methods (4.6594 quantized, 4.6906 float).
>
> ⚠️ **The search target and the shipped token are different numbers, and only the second is a fact
> about the CSS.** The search held hue and chroma and moved OKLab L 0.6919 → **0.6999**; rounding to
> 8-bit sRGB lands the shipped `#62b380` at OKLCH **(0.7012, 0.1102, 154.73)** against `--jade`'s
> (0.6919, 0.1094, 155.14) — so hue and chroma are near-identical, not identical. Quote the shipped
> coordinates for any later palette work; this note previously gave the target as though it were the
> token, which is two incompatible premises for the next reader.
>
> The §5 table stands as measured for the parameterisation it names; it should not be read as the
> cost of any rotation.

Owner, 2026-08-20, verbatim:

> "I would prefer brand logo maroon hue theme for light mode and
> slightly-purple-aubergine-hue theme for dark mode? Keep notes and let's defer visual theme builds."

This **supersedes** the three options that were on the table (deepen the aubergine · rotate light to
espresso · show both first). **"Espresso" is retired** — it was one of the superseded options, not a
fallback, and should not be revived.

Every ratio below was computed in-shell against the shipped `packages/ui/src/tokens.css`, never
transcribed. **No maroon hex is proposed here** — §2 explains why that is an owner question, not a
gap in the research.

---

## 1. Two halves, two completely different jobs

|                    | where the theme's identity lives today                                                                 | what "re-hue" means                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| **Light → maroon** | the **accent** (`--ac` chain), inside a warm ink/border/shadow/cream system that shares its hue family | rotate ~45° across **308 call sites** in **69 files** |
| **Dark → purpler** | the **ground** (`--pg`/`--sf`/`--cd`/`--surface-elevated`); the accent sits across the wheel           | rotate +10–25° across **~10 tokens**                  |

Light is a palette project. Dark is a token edit with one numeric constraint. **Ship them as
separate PRs, dark first** — dark is small, self-contained, and proves the guard workflow before the
expensive half begins.

---

## 2. ⚠️ Is there a canonical brand maroon? Read this before picking anything

**There is a deep red in the brand assets. It exists in two forms that do not match, and neither
exists anywhere in the QR repo.** The words "maroon", "burgundy" and "oxblood" appear **zero times**
in either repository, so the owner's term inherits no existing definition.

### The two candidates

**1. `#a41034` — the DECLARED canon.** `hsl(345, 82%, 35%)`. Crimson, pink-leaning.

- `delivery/src/styles/tokens.css:124-136`, in a block titled **"MMS BRAND CORE ANCHORS — the five
  colors that ARE the brand"**: `star #a41034 (Mandalay deep red, the BRAND MARK only — the CANON value)`.
- Byte-matched in the email canon (`delivery/src/emails/components/theme.ts:90`), the delivery PWA's
  `theme_color` (`public/manifest.json:8`), and its light browser chrome (`src/app/layout.tsx:60-67`).
- A darker chain already exists: `--color-primary-hover #8a0d2b`, `--color-primary-active #6d0a22`,
  `--hero-gradient-mid #5c0a1e`, high-contrast `#8a0d2b/#6d0a22/#50071a`.

**2. `#a71b1d` — the logo artwork's MEASURED core.** `hsl(359, 72%, 38%)`. Scarlet, brick-leaning —
**~14° of hue away from the declared token.**

- Decoded from `apps/qr/public/email-logo.png` (400×250, md5 `f0b0ee96…`, byte-identical in both
  repos — there is exactly one piece of brand art). 58.9% of opaque pixels fall in the maroon window;
  the core-body centroid is `#a71b1d` at 41.4% of chromatic pixels.
- Tonal bands: shadow `#6e0605` · core `#a71b1d` · highlight `#d73b36`. Whole red family `#b32524`.
- The logo's only other colour is a pale gold `#efde76` — **not** the declared brand gold `#eaa92f`.

Both are legitimately "maroon". They are visibly different. **The choice must be made with swatches,
not from a description.**

### ⚠️ The declared canon's own rule forbids the use being proposed

Both repos state `#a41034` is **mark-only**:

- `delivery/src/styles/tokens.css:127` — "the **BRAND MARK only** — the CANON value"
- `mms-platform/docs/HOLISTIC_IMPROVEMENT_PLAN.md:109` — "**the star mark / wordmark ONLY — never a
  UI accent**"

Adopting it as the light accent **overrides two written rules**. That is entirely the owner's call —
it is their brand, and rules written for a previous direction are allowed to be retired — but it
should be an explicit decision, not something that slides through because nobody re-read the comment.

### What does NOT exist — stated plainly rather than guessed around

- **The QR repo contains no maroon at all.** `grep -rn "a41034"` over `apps packages supabase scripts`
  returns **empty**. The only hits are in `HOLISTIC_IMPROVEMENT_PLAN.md`, as a `--star` token that was
  **proposed and never added**.
- **There is no vector logo in either repo.** `apps/qr/public/icon.svg` is a base64 WebP wrapper
  around the same raster. The designer's intended spot colour is **unrecoverable from these repos** —
  every number above is either a declared token or a pixel measurement of a lossy raster.
- **A muted/dusty maroon does not exist anywhere.** Every candidate is high-saturation (HSL S 53–84%).
  If the owner means the brownish sense (~`hsl(350, 40%, 28%)`), that colour must be **authored new**.

---

## 3. ⚠️ THE FINDING THAT RESHAPES THE SLICE: a real maroon cannot be `--ac` as the guards stand

Contrast depends only on WCAG relative luminance. Two **existing** guards box `--ac` into a
hue-independent window (computed in-shell, not transcribed):

```
floor  (negative guard: plain ac on sf must STAY below 4.5)   Y >  0.153066
ceil   (pass guard:     ac on pg must CLEAR 4.5)              Y <= 0.171484
width                                                              0.018418
```

| candidate                 | Y           | verdict                          |
| ------------------------- | ----------- | -------------------------------- |
| today `#a65f10` (amber)   | **0.16329** | INSIDE the window                |
| `#a41034` declared canon  | 0.08511     | **outside — guards must change** |
| `#a71b1d` logo measured   | 0.09088     | **outside — guards must change** |
| `#b32524` logo red family | 0.11034     | **outside — guards must change** |
| `#d73b36` logo highlight  | 0.17841     | **outside — guards must change** |

**This inverts the usual AA intuition, and it inverts what I first told the owner.** I initially
warned that red would struggle to clear AA on cream. That is **wrong** and is corrected here: maroon
is far _more_ legible than today's amber (7.38 vs 4.67 on `--pg`). The limiting factor is the
opposite — a **negative** guard forbids the accent from being _too_ legible, because that guard is
what forces call sites to use `--ac-strong` for text.

The only colours satisfying every existing constraint at once are dusty brick-roses around OKLab
L 0.55–0.57 — **not maroons**. So:

> **A real maroon requires rewriting the accent guards. That is the decision, not a bug.**

### The four negative guards, and which flip

Light-only, prophylactic — "the vivid hue must STAY below 4.5 as text, which is why `-strong` exists".

| #   | guard                     | today                                  | under maroon | verdict                                           |
| --- | ------------------------- | -------------------------------------- | ------------ | ------------------------------------------------- |
| 1   | `plain ac on accent tint` | 4.040                                  | 5.1–5.9      | **flips** (both sides derive from `--ac`)         |
| 2   | `plain ac on sf`          | **4.284** (margin 0.216 — flips first) | 5.7–6.8      | **flips**                                         |
| 3   | `plain gold on gold tint` | 1.828                                  | unchanged    | **survives** — the only one not coupled to `--ac` |
| 4   | `plain ac2 on pg`         | 3.253                                  | 5.0–7.3      | **flips** if `--ac2` goes maroon                  |

**Do not delete these guards.** W22d-1 recorded that `plain ac on sf` "already declared impossible"
two live accent pills that shipped at 3.53 and 3.70 — the guard was right and two call sites were
violating it. If maroon makes a guard false, **replace it with the assertion that is then true**
(a positive "plain `--ac` clears 4.5 on every accent tint"), red-first. Never drop a guard because a
new palette made it inconvenient.

### `--ac-strong` loses its reason to exist in light

Under every maroon candidate, plain `--ac` already clears AA on **every** accent ground (min 4.53–5.24
across the lend-banner 16%, wb-method 12%, badge 14%, and chip 12%/18% recipes). The
`--ac` / `--ac-strong` split becomes decorative. Collapsing it — light aliasing dark's
`--ac-strong: var(--ac)` — is arguably the honest move, but it is **59 call sites** plus three
rewritten guards. A design decision, not a find-and-replace.

### `--ac2` is dead code

`var(--ac2)` has **zero** application references. It exists only in `tokens.css` and in one negative
assertion. Delete it rather than re-hue it.

---

## 4. Light → maroon: quantified scope

| what                                                        | count                                           |
| ----------------------------------------------------------- | ----------------------------------------------- |
| `var(--ac)` + `var(--ac-strong)` across `apps` + `packages` | **308** (249 + 59)                              |
| source files holding an accent var                          | **69**                                          |
| in `globals.css`                                            | 160 occurrences across **120 distinct rules**   |
| inline in TS/TSX                                            | 133 across 66 files — **53% in staff surfaces** |
| `color-mix` recipes involving the accent                    | **74**, at **23 distinct percentages**          |
| hardcoded `#a65f10` literals                                | **12 in 8 files**                               |

The 120 rules are spread thin — 87 of them appear exactly once. **There is no single "accent
component" to fix**; it is checkout, menu, header, grocery, KDS and kiosk.

**Four tokens auto-derive and will move for free — but wrong.** `--tex-dot` (16%), `--glow-ac` (38%),
`--sh-glow` (18%), `--sh-lift` (42%) all mix off `--ac`. Their alphas were tuned against an amber at
OKLab L 0.555; every maroon lands at L 0.46–0.50, so all four read markedly heavier without
re-tuning. `--tex-dot` alone silently repaints **38 DOM sites**.

**`--tex-line` does NOT follow** — it derives from `--bd`. Result: **pages keep warm-brown LINES while
cards get maroon DOTS**, two unrelated hues on one surface, breaking the W22a·depth paper layer.

**The whole light theme is currently one hue family** — ink H 59, borders H 48, shadows H 57, creams
H 88–95. A 45° accent rotation orphans all of it. Deciding how far that rotation propagates is the
real design question (see Q3).

**Semantic collision:** `--ruby` is `H 15.4` and `#a41034` is `H 16.5` — **1.1° apart**. And
`StarsRing.tsx:14-19` already paints the Ruby tier arc with `var(--ac)` because "Ruby has no own QR
token". Under maroon, the accent and the Ruby loyalty tier become the same colour.

---

## 5. Dark → "slightly purple aubergine": quantified scope

The owner's read is exactly right — **the ground hue is 260°**, spanning HSL 257–262.

"More purple" numerically: rotate HSL hue **+10 to +25** (→ 270–285), optionally **+4 to +8
saturation**. Beyond +30 it stops being _slight_ and reads violet.

**Moves (~10 values):** `--pg` `--sf` `--cd` `--surface-elevated` `--oa` `--grad` (2 stops)
`--surface-glass` `--surface-vellum`.

**Does not move:** dark `--ac`/`--gold`/`--jade`/`--ruby`/`--warn` (all across the wheel); the four
texture/glow tokens (they re-declare their own dark percentages and key off the accent); the dark
shadows (neutral black).

### ⚠️ The one trap — it fires at Δh = +5

Rotating purple-ward at constant S/L **raises** luminance, and `jade-strong on chip tint HOVER /cd`
is the **tightest combo in the file at 4.5237** — 0.0237 of headroom.

| Δh  | `--cd`    | jade-hover  |
| --- | --------- | ----------- |
| +0  | `#271f38` | 4.5237 ✓    |
| +5  | `#291f38` | **4.497 ✗** |
| +10 | `#2b1f38` | **4.470 ✗** |
| +25 | `#311f38` | **4.384 ✗** |

**Every purple-ward rotation must be paid for.** Two measured levers:

- **A — darken `--cd`** by 0.2–1.4 lightness points (prefer if the aubergine should read deeper).
- **B — lift `--jade-strong` off its alias**, exactly the way W22d-1 broke ruby's: OKLab L 0.6919 →
  0.694–0.700. Two to eight thousandths — visually invisible.

**Doing neither ships a red test and a live AA failure on the rewards screen** — the exact class
W22d-1 just fixed.

Remaining headroom is otherwise generous: only `--cd` is at its ceiling.

---

## 6. Red does not survive a dark ground — delivery already proved it

Measured: `#a41034` on delivery's dark ground = **2.28:1**. `#9a3412` = 2.42:1. `#c41844` = 3.00:1
(large text only).

**Delivery's answer is to abandon the red on dark, not to darken it** — its email accent flips
`#9a3412 → salmon #e7a181`, and its menu modal accent flips to amber `#f0b357`.

So **maroon is a LIGHT-only identity.** If it must appear in Night at all, it flips to a rose/salmon.
QR's dark accent staying gold is the path of least resistance and is already correct.

**And delivery has NO aubergine precedent** — every one of its dark surfaces is warm espresso at hue
18–22°. There is no purple ground token and no record of one being tried and rejected. **Every ratio
for QR's aubergine must be derived fresh; nothing transfers.**

---

## 7. What must move in lockstep — the 36 pinned values

`scripts/check-theme-parity.mjs` pins **36 values across five surfaces** that cannot read a CSS
variable. Any token change must update these in the same commit or CI goes red (by design).

| surface                                    | pins   | tokens tracked                                                                                                       |
| ------------------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------- |
| `sw/sw.ts` — offline shell                 | 4      | light+dark `--pg`, `--tx`                                                                                            |
| `app/layout.tsx` — `viewport.themeColor`   | 2      | light+dark `--pg`                                                                                                    |
| `globals.css` — `@media print`             | **15** | `--tx --t2 --t3 --bd --ac-strong --sf --cd --ok --okb --warn --warnb --ac --gold-strong --jade-strong --ruby-strong` |
| `lib/stripe-client.ts` — Payment Element   | 10     | `ac cd tx t2 warn` × light + dark                                                                                    |
| `app/opengraph-image.tsx` — Satori palette | 5      | `--pg --tx --gold --ac --t2` (light only)                                                                            |

Per-token cost: light `--ac` → 3 edits · light `--tx` → 4 · light `--pg` → 4.

**Two more pinned facts will go red on purpose:** `manifest.test.ts:51-52` asserts
`theme_color === background_color === --pg`; and the recipe percentages (`.lend-banner-back` 16%,
`.wb-method` 12%, chip 12%/18%, ruby 14%/16%) are **hardcoded in the audit** rather than parsed from
source — so a retheme that retunes a CSS percentage leaves the suite green while asserting a recipe
that no longer ships (registry **M84**).

---

## 8. Open questions for the owner

1. **Which maroon?** `#a41034` (declared canon, crimson) or `#a71b1d` (measured from the logo art,
   scarlet)? They are ~14° apart and visibly different. Swatches needed.
2. **Muted or saturated?** Every existing candidate is high-saturation. If "maroon" means the dusty
   brownish sense, that colour must be authored new — it is nowhere in the assets.
3. **Does the brand-mark reservation still hold?** Both repos say `#a41034` is "the star mark /
   wordmark ONLY — never a UI accent". Adopting it as the light accent retires that rule. Confirm.
4. **How far does the rotation propagate?** The light theme is currently one hue family (ink,
   borders, shadows, creams all in the warm 48–95° band). Does maroon take just the accent, or does
   the whole warm system rotate with it?
5. **Is a 7.4:1 accent too heavy?** Maroon lands near body-text contrast. That is an aesthetic call
   no test can make.

## 9. Suggested sequencing

1. ~~**PR A — dark only.**~~ **DONE (2026-08-26), then REVERTED (2026-08-27).** Nine values, OKLCH
   +14° (HSL 259° → 277°), lever B for the jade-hover trap. The owner rejected the shipped result
   and every ground value is back to the pre-#235 original; **the dark half is superseded by M126,
   which enriches Night rather than re-hueing it.** Lever B (`--jade-strong` off its alias) was
   KEPT — its justification was the width of the measurement noise, not the hue — and so was the
   guard below, which is the durable part of this entry: It proved the guard workflow and found a gap in it: the two translucent
   surfaces hand-copy `--cd`/`--sf`'s channels because `rgba(var(--cd), 0.9)` is not expressible, and
   nothing checked that. `check-theme-parity.mjs` surface 7 now does — a guard **PRs B and C
   inherit**, since the light ground moves under them too. ⚠️ **It covers 2 of the 9 values PR A
   moved**: `--surface-elevated`, `--oa` and both `--grad` stops are independent hand-authored values
   with nothing to pin them to, and **light `--surface-vellum` is the exempted pair** — so the light
   value most likely to be forgotten in PR C is precisely the one not asserted. Budget for that.

   ⚠️ **PR A also produced a false defect report, and PRs B and C inherit the lesson more than the
   guard.** It claimed a live 1.97:1 AA failure on the order-ready wall board and shipped a "fix"
   that was a byte-identical no-op, because that heading renders only inside a Night-forced wrapper
   where the real ratio is 11.70:1. **A contrast ratio is meaningless until you know which theme the
   surface renders in**, and this repo has theme-forced subtrees (`.orb-root dark`, `.kds-root dark`)
   that make the two grounds non-interchangeable. The light re-hue is where that bites hardest: a
   token moving in `:root` does _not_ reach anything under a `dark` ancestor. Registry **M120**.

2. **Owner picks the maroon** from real swatches (Q1–Q3).
3. **PR B — the light guard rewrite, BEFORE any token moves.** Replace the flipped negative guards
   with the assertions that are then true, red-first. Decide `--ac-strong`'s fate; delete `--ac2`.
4. **PR C — the light re-hue itself,** with the four derived alphas re-tuned and `--tex-line`
   reconciled so lines and dots share a hue.

Order matters for the same reason W22d-1 was split out: **land the palette first and the guards are
born green**, and nothing learns what broke.
