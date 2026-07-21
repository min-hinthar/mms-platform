// W5c·r2 — modifier-option glyphs (owner feedback: "use icons/emojis for polished UI/UX").
// Emoji-as-CONTENT (a dish's own glyph), never chrome — per the W2b icon rule; always rendered
// aria-hidden with the option's text carrying the meaning. Keyed by the option's stable slug so a
// display-name edit (or the pending native-check pass on Burmese labels) never orphans a glyph.
// No entry = no glyph (options render text-only, exactly as before) — e.g. sweetness has no honest icon.
const OPTION_GLYPHS: Record<string, string> = {
  // Spice level — the universal chili scale.
  spice_level__mild: "🌶",
  spice_level__medium: "🌶🌶",
  spice_level__burmese_hot: "🌶🌶🌶",
  // Drink temperature.
  drink_temp__hot: "☕",
  drink_temp__iced: "🧊",
  // The add-ons pantry (owner's real add-on menu).
  addons__steamed_white_rice: "🍚",
  addons__coconut_rice: "🥥",
  addons__boiled_egg: "🥚",
  addons__sunny_egg: "🍳",
  addons__mohinga_soup: "🍜",
  addons__ohn_noh_soup: "🥣",
  addons__balachaung: "🦐",
  addons__veggie_fritters: "🧆",
};

export function optionGlyph(slug: string): string | null {
  return OPTION_GLYPHS[slug] ?? null;
}
