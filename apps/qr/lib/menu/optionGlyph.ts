// W5c·r2/r3 — modifier-option glyphs (owner feedback: "use icons/emojis for polished UI/UX",
// "🌶 should be in color and inline"). Emoji-as-CONTENT (a dish's own glyph), never chrome — per the
// W2b icon rule; always rendered aria-hidden with the option's text carrying the meaning. Keyed by the
// option's stable slug so a display-name edit (or the pending native-check pass on Burmese labels)
// never orphans a glyph. Every emoji carries U+FE0F (variation selector-16) where it matters, forcing
// COLOR emoji presentation — bare U+1F336 etc. can fall back to a monochrome text glyph.
//
// `trail: true` renders the glyph AFTER the label (the 🌶/🍯 intensity scales read as a trailing
// meter); default renders it before (the add-ons pantry reads like a picture menu). "Burmese 🔥" has
// no entry on purpose — its 🔥 lives in the option NAME itself (owner's call), so a second glyph
// would double-mark the row.
type Glyph = { glyph: string; trail?: boolean };

const OPTION_GLYPHS: Record<string, Glyph> = {
  // Spice — a trailing chili meter; the top step is named "Burmese 🔥" (no extra glyph).
  spice_level__mild: { glyph: "🌶️", trail: true },
  spice_level__medium: { glyph: "🌶️🌶️", trail: true },
  // Sweetness — same trailing-meter idea, honey pots.
  sweetness__less_sweet: { glyph: "🍯", trail: true },
  sweetness__normal: { glyph: "🍯🍯", trail: true },
  sweetness__extra_sweet: { glyph: "🍯🍯🍯", trail: true },
  // Drink temperature.
  drink_temp__hot: { glyph: "☕" },
  drink_temp__iced: { glyph: "🧊" },
  // The add-ons pantry (owner's real add-on menu).
  addons__steamed_white_rice: { glyph: "🍚" },
  addons__coconut_rice: { glyph: "🥥" },
  addons__boiled_egg: { glyph: "🥚" },
  addons__sunny_egg: { glyph: "🍳" },
  addons__mohinga_soup: { glyph: "🍜" },
  addons__ohn_noh_soup: { glyph: "🥣" },
  addons__balachaung: { glyph: "🦐" },
  addons__veggie_fritters: { glyph: "🧆" },
};

export function optionGlyph(slug: string): Glyph | null {
  return OPTION_GLYPHS[slug] ?? null;
}
