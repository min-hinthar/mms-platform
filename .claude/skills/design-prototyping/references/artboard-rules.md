# Artboard rules — MMS path prototypes (read all of it before the first Write)

You are drawing static, hi-fi mockup ARTBOARDS of a real product (the Mandalay Morning Star QR app:
diner phones + staff tablets) for the owner to compare three design concepts per moment and pick.
Each artboard is ONE `.dc.html` file: a "Design Component" page rendered by a design-canvas editor.
Fidelity to the product's real visual system matters more than novelty — these are proposals for
THIS app, drawn in its own tokens, type and components.

## 1 · The file format (each rule fails SILENTLY if broken)

Exact skeleton — copy it, keep the `support.js` head line EXACTLY:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Two Words — menu</title>
    <script src="./support.js"></script>
  </head>
  <body>
    <x-dc>
      <helmet>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:wght@100..900&amp;family=Hanken+Grotesk:wght@100..900&amp;family=Padauk:wght@400;700&amp;display=swap"
        />
        <style>
          body {
            margin: 0;
          }
          * {
            box-sizing: border-box;
          }
          button,
          input {
            font: inherit;
            color: inherit;
          }
          [lang="my"] {
            font-family: "Padauk", sans-serif;
            line-height: 1.6;
            letter-spacing: normal;
            font-synthesis: none;
          }
          .tn {
            font-variant-numeric: tabular-nums;
          }
          a {
            color: #a65f10;
          }
          a:hover {
            color: #8f5009;
          }
        </style>
      </helmet>
      <div
        style="width: 390px; height: 844px; position: relative; overflow: hidden; background: #faf9f5; color: #1b1714; font-family: 'Hanken Grotesk', 'Padauk', system-ui, sans-serif; font-size: 16px; line-height: 1.5"
      >
        ... the screen ...
      </div>
    </x-dc>
    <script
      type="text/x-dc"
      data-dc-script
      data-props='{"$preview":{"width":390,"height":844}}'
    >
      class Component extends DCLogic {
      renderVals() {
      return {};
      }
      }
    </script>
  </body>
</html>
```

- Root is FIXED at the frame size: phone **390×844**, tablet **1366×1024** (set `$preview` to match).
- Close every non-void element; quote every attribute. No `<iframe>`, `<object>`, `<embed>`, no
  `innerHTML`/script-built UI, no imports, no network except the one Google Fonts `<link>` above.
- All copy is LITERAL markup text (never a `{{hole}}`, never a data-props entry). Keep `data-props`
  to just `$preview`. `renderVals()` returns `{}`.
- If you use `<sc-for>`/`<sc-if>` (you shouldn't need to), `{{ }}` holes are dotted lookups only.
- Styles: INLINE `style="…"` on elements (that is what the editor's properties panel edits). The
  `<helmet><style>` holds only the page basics shown above (you may add a few more BASIC rules
  such as a focus-ring class, but no layout).
- Use LITERAL hex/rgba values from the tokens below — not `var(--x)` (the editor paints inline
  values while streaming; vars would be undefined).
- Lay out sibling groups with flex or grid + `gap` (never whitespace text nodes or per-element
  margins to space siblings). Absolute positioning only for what the product itself fixes:
  the header, the tab bar / bottom dock, a sheet, a scrim, a toast.
- `lang="en"` on `<html>`; every Burmese run in a `<span lang="my">` (or a block with
  `lang="my"`): Padauk 400 or 700 ONLY (never 800), line-height 1.6, **≥13px**.

## 2 · Honesty + craft rules (owner-facing; break none)

- **No fake device chrome.** NEVER draw an iOS status bar (time · battery · wifi), a home
  indicator, or a keyboard. The brief's "0–47 status bar" rows: leave that strip as plain page
  ground (it is reserved safe-area space). If a brief screen assumes the keyboard is up, draw the
  moment just BEFORE it rises (field unfocused).
- **No emoji, ever.** Icons are small inline stroke `<svg>` (stroke = currentColor, 1.75–2px,
  round caps), `aria-hidden="true"` when decorative.
- **Real elements:** controls are `<button>` / `<a href="#">` / `<input>` with a `<label>`; never a
  div/span acting as a button. Icon-only buttons get `aria-label`. Every tap target ≥44px tall
  (and ≥44px wide for icon buttons). Lists styled `list-style:none` get `role="list"`.
- **Contrast** ≥4.5:1 for text (3:1 only at ≥24px). The tokens' --t3 already clears 4.5:1 on
  every light surface. Never put white text on --ac2/--gold; use the token pairs below.
- **Copy:** use the brief's COPY (English) and COPY (Burmese drafts) VERBATIM for the screen —
  strip the parenthetical source notes like "(REUSED: … line-state-copy.ts:13)" and never print
  file paths, ticket ids (K15, P2y, M182 …) or design notes on the artboard. If a visible string
  has no Burmese draft in the brief, show it in English only — NEVER invent or machine-translate
  Burmese. Accessible names / sr-only copy from the brief go into `aria-label`s, not visible text.
- **Digits stay Latin** everywhere (money, clocks, table numbers), with `class="tn"` on figures.
- **Example data:** use the brief's own example (Table 7, Mohinga, $31.50, names like Aye/Thiri…).
  Within ONE moment, keep the SAME example across all three concepts where the briefs differ only
  incidentally, so the owner compares like for like. Food photos: the product's own placeholder —
  a rounded box filled with `linear-gradient(135deg, #f1e7d6, #fbf4e8)` (light) or
  `linear-gradient(135deg, #513963, #241c35)` (Night). No stock images.
- **No rationale on the artboard** — no captions explaining the concept, no "NEW" badges, no
  annotations, no arrows. Draw the screen exactly as a guest or staff member would see it.
- Avoid gradient washes, left-border-accent cards and other AI-slop tropes; the product's own
  CTA gradient and paper textures are fine where the product uses them.

## 3 · The product's visual system (exact values; full detail in visual.json)

LIGHT (diner phones; the counter tablet and staff screens follow the OS — draw them LIGHT):

- ground --pg #faf9f5 · --sunken #efece2 · --sf #f2efe7 (chips at rest, strips) · --cd #fffdf8
  (cards, sheet body) · --cd-raised #ffffff
- ink --tx #1b1714 · --t2 #6e6358 · --t3 #726859
- accent --ac #a65f10 (action AND the selection cap) · --ac2 #c8772a · --ac-strong #8f5009 (accent
  text on tints) · on-accent --oa #fffdf8
- --gold #e8a83c · --gold-strong #8a5a00 (gold text) · --jade #1f6e63 · --ruby #b2364a
- --ok #346e47 on --okb #eaf2ec · --warn #a44b34 on --warnb #f6e9e4 (warn is also danger)
- line --bd rgba(58,35,23,0.1) · --sheen rgba(255,255,255,0.55) · --scrim-glass rgba(15,10,5,0.3)
- --ink #1b1714 / --on-ink #fffdf8 are CONSTANT (camera stage, ink pills) in both themes
- cards: radius 20, bg #fffdf8, border 1px rgba(58,35,23,0.1), shadow
  `0 1px 0 rgba(255,255,255,0.55) inset, 0 1px 2px rgba(35,24,16,0.06), 0 8px 24px -12px rgba(35,24,16,0.18)`
- primary CTA (`.ui-btn-primary`): pill (radius 999), min-height 52, bg
  `linear-gradient(180deg, #a65f10, #8f5009)`, text #fffdf8 15px weight 800 tracking -0.01em,
  shadow `inset 0 1px 0 rgba(255,255,255,0.55), 0 2px 8px -1px rgba(166,95,16,0.42)`.
  Secondary (`.ui-btn-secondary`, a paper card, never a second filled pill): pill, bg #fffdf8,
  1px border rgba(58,35,23,0.1), text #1b1714 15px 700, inset sheen. ONE primary per section.
- focus ring (draw on ONE focused control only if the brief says so): 2.5px solid #a65f10, offset 2px.

NIGHT (FORCED on the kitchen KDS `/staff/kitchen` and the TV board; anywhere the brief says Night):

- --pg #100c19 · --sunken #171422 · --sf #211a30 · --cd #2b213c · --cd-raised #362848 ·
  --surface-elevated #413053
- --tx #f3ecdf · --t2 #bcafc8 · --t3 #a69eb1
- --ac #e7a53a (gold; ink on it --oa #130d1e) · --gold #f4c879 · --jade #5fb07e · --ruby #e6788c
- --ok #5fb07e on --okb #1f2e26 · --warn #e0855f on --warnb #33231d
- --bd rgba(243,236,223,0.13) · --sheen rgba(255,255,255,0.11)
- chrome (staff bar) rgba(33,26,48,0.90)

TYPE (Google Fonts, already linked above):

- Display: `'Fraunces', 'Padauk', Georgia, serif` — h1/h2/h3 weight 600, letter-spacing -0.02em,
  line-height 1.08–1.22. Page masthead h1 26px; h2 21px; h3 17px; sheet titles 22px.
- Body: `'Hanken Grotesk', 'Padauk', system-ui, sans-serif` — body 16px/1.5; button label 15px;
  label 14px; small 13px (chips, Burmese secondary lines); caption 12px; eyebrow 11px weight 700
  letter-spacing 0.13em UPPERCASE in #a65f10.
- Burmese: `'Padauk', sans-serif`, 400/700 only, line-height 1.6, ≥13px.
- Weights: 600 headings · 700 labels/prices/controls · 800 primary CTAs, eyebrows, lead numerals.
- KDS tier S: table number 32px · item 28px weight 800 · Burmese item 30px Padauk 700 ·
  modifiers 21px · clock 24px · meta 15px · labels 13px.
- Radii: 12 (fields, KDS tickets, menu photo 88×88) · 20 (cards, staff tiles) · 26 (sheet top
  corners) · 999 (every pill: buttons, chips, tabs, toasts).
- Spacing: phone page gutter 20px; staff pages 20–24px; 8px rhythm with the brief's exact values.

DINER PHONE CHROME (as built):

- y 0–47: empty ground (safe area — draw nothing).
- y 47–103: AppHeader (`.app-header`), 56px, padding 0 14px, background #faf9f5, border-bottom
  1px rgba(58,35,23,0.1), flex row space-between. Left: the brand link (min-height 44, gap 6):
  the REAL logo `<img src="/_blob/e7e27a9553079ddb61cfec7bd9f82c9f" alt="" style="width: 51px; height: 34px; object-fit: contain">`
  then "Morning Star" in Fraunces 16px weight 800 letter-spacing -0.01em #1b1714. Right: whatever
  the brief says (often nothing). Use that exact `/_blob/…` src verbatim; it is the app's logo.
- Bottom: the diner tab bar (`.diner-tabs`), fixed, height 60px + 34px safe inset (y 750–844;
  the bottom 34px is empty), padding 0 8px 34px, background #faf9f5, border-top 1px
  rgba(58,35,23,0.1), box-shadow inset 0 1px 0 rgba(255,255,255,0.66); a 3-column grid. Each tab
  is an `<a href="#">`: flex column centered, gap 2px, min-height 44, radius 12, color #6e6358,
  12px weight 700 letter-spacing 0.02em, line-height 1; icon box 28×24 holding a 22px stroke
  svg. Labels: "Menu" · "Order" · "Account". The CURRENT tab: `aria-current="page"` and color
  #8f5009 (no cap, no fill). An order count is a capsule off the icon's corner (18px tall, radius
  999, bg #a65f10, text #fffdf8 12px 800) — but never on a SHARED (dine-in) cart. Some brief
  screens hide the bar (full-screen dialogs) — follow the brief.

STAFF TABLET CHROME (as built): StaffBar 68–88px at top (light: #faf9f5 with a 1px bottom line;
Night: rgba(33,26,48,0.90)); a pill back-link like "← ကောင်တာ / Counter"; the page title in
Fraunces; staff pages are Burmese-first with the English echo beneath or after (the device's
language mode "Both"), exactly as the brief's copy shows.

## 4 · Your sources, in order

1. Your moment brief (`brief-mN.md`): each ARTBOARD section names the file to write and gives the
   LAYOUT (pixel regions), COPY (English) and COPY (Burmese drafts). Follow its geometry closely.
2. `visual.json` (full tokens) — only if you need a value not listed here.
3. The real code, for fidelity, ONLY if the brief leaves a look unclear — e.g.
   `packages/ui/src/tokens.css`, `apps/qr/app/globals.css` (big — grep, never read whole),
   `apps/qr/components/…`, `docs/DESIGN-LANGUAGE.md`. Repo root: /home/user/mms-platform.
   Cap source reading at ~10 minutes total; the briefs already carry exact values.

## 5 · Process

- Write each artboard with the **Write tool** directly (never a script that generates files), at
  EXACTLY the path given, one file per Write. Do not write anything else anywhere; do not touch the
  repo; do not git anything; do not publish.
- NEVER render, screenshot, open a browser, install anything, or read your files back to check.
  Write each file once, carefully, and move on.
- When done, reply with ONE line per file: the path and a ≤12-word description of what it shows.
