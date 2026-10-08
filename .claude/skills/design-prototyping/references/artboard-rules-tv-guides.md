# Artboard rules — round 3 addendum (read RULES.md first; everything there still applies)

## A · New frame sizes

- **TV board** (`/board`, `components/ReadyBoard.tsx`, `.orb-root dark`): **1920×1080**, NIGHT-FORCED
  (ground #100c19, cards #2b213c, ink #f3ecdf, gold #e7a53a / #f4c879). It is read from across a dining
  room, by guests AND staff: big type (the shipped board uses viewport clamps — rows clamp(28px, 3.6vw,
  54px) weight 800, titles clamp(24px, 2.6vw, 40px); at 1920 wide that is 54px rows and 40px titles),
  Latin digits, never a guest's name, never a price, never a count of anything on a shared cart. Burmese
  dish names at ≥ the English size (Padauk 700). No interactive controls (it is a display): no buttons
  except what the brief names.
- Phone 390×844 and tablet 1366×1024 as before.

## B · Interactive, animated step guides (the format supports state, events and CSS animation)

A guide is ONE artboard whose steps live in `state`. Pattern (copy it):

```html
<div style="…root…">
  <sc-if value="{{ s1 }}" hint-placeholder-val="{{ true }}">
    … step 1 markup …
  </sc-if>
  <sc-if value="{{ s2 }}" hint-placeholder-val="{{ false }}">
    … step 2 markup …
  </sc-if>
  …
  <div style="display: flex; gap: 12px">
    <button type="button" onClick="{{ back }}" …>Back</button>
    <button type="button" onClick="{{ next }}" …>Next</button>
  </div>
</div>
…
<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":390,"height":844}}'>
class Component extends DCLogic {
  constructor(props) { super(props); this.state = { step: 1 }; }
  renderVals() {
    const n = 5, step = this.state.step;
    return {
      s1: step === 1, s2: step === 2, s3: step === 3, s4: step === 4, s5: step === 5,
      dots: [1,2,3,4,5].map((i) => ({ on: i === step, label: "Step " + i + " of " + n })),
      next: () => this.setState({ step: Math.min(n, step + 1) }),
      back: () => this.setState({ step: Math.max(1, step - 1) }),
      isFirst: step === 1, isLast: step === n,
    };
  }
}
</script>
```

- `{{ }}` holes are dotted lookups ONLY (no `!x`, no `a + b`): compute every flag in `renderVals()`.
- Events: `onClick="{{ handler }}"` where the handler is returned from `renderVals()`. Per-item handlers:
  attach them to each item in `renderVals()` and bind `onClick="{{ item.pick }}"` inside `<sc-for>`.
- Repeats: `<sc-for list="{{ dots }}" as="d" hint-placeholder-count="5">…{{ d.label }}…</sc-for>`.
  Conditional style in a loop: precompute it per item (e.g. `d.bg`), then `style="background: {{ d.bg }}"`.
- **Animation:** define `@keyframes` in the `<helmet><style>` block (inline styles cannot hold
  keyframes) and apply them with `animation: …` inline or via a small class in that block. Every
  animation is ESCORTED: add
  `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }`
  so reduced motion gets the static frame exactly. Use the product's motion idioms: rise (translateY 8px →
  0 + fade, ~240ms, ease-out), pop (scale .96 → 1, ~180ms), a progress fill (width/transform over 600–900ms),
  a gentle pulse only for "live" (opacity .55 ↔ 1, 1.6s) — never flashing, never more than one moving
  thing per step.
- A guide is skippable: a 44px "Skip" text button top-right on every step; the last step's primary is
  the real first action ("Start ordering", "Open the counter").
- Step dots: real `<button>`s with `aria-label="Step N of M"` and `aria-current="step"` on the lit one;
  the step heading is the region's name (`<section aria-labelledby>`). One live region per artboard.
- Mark the guide's canvas entry interactive (the orchestrator does this; you just make the controls work).

## C · Shared design language — read it, do not reinvent it

`/home/user/mms-platform/docs/PATH_DESIGN_2026-10-07.md` is the decided design record: the shared
vocabulary (one voice in two registers, the CounterPass / One Pass, one Undo form, the staff colours and
loudness ladder), the cross-spec reconciliations and the required corrections. Every new screen speaks
that language. The refined artboards already on the canvas are in
`/tmp/claude-0/-home-user-mms-platform/95879a2f-bc6c-50a6-8eeb-2caa7aaedb89/scratchpad/canvas/project/picked-m*.dc.html`
— read the relevant ones before drawing, so a new screen looks like the same product.
