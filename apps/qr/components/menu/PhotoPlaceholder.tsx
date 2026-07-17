import { Icon, categoryIconName } from "@mms/ui";

/**
 * Designed missing-photo state (W2a). ~31/60 dishes have no real photo yet (they point at a
 * `fallback.jpg` or NULL); before this, `BlurUpImage` returned null and the caller's bare gradient tile
 * read as broken/still-loading. This fills that tile with an INTENTIONAL brand surface: the dish's
 * category glyph + the ✦ wordmark mark over the same gradient — so a photoless dish reads "photo coming"
 * rather than "broken image". Decorative only (`aria-hidden`); the row/sheet already names the dish, so
 * the placeholder carries no text. Purely presentational → Server-Component safe.
 *
 * `variant` scales the glyph to the slot: `thumb` for the menu-row/suggestion thumbnails, `hero` for the
 * full-width ItemSheet band.
 */
export function PhotoPlaceholder({
  category,
  variant = "thumb",
}: {
  category?: string | null;
  variant?: "thumb" | "hero";
}) {
  return (
    <div className="photo-ph" aria-hidden>
      <Icon
        name={category ? categoryIconName(category) : "cat-dish"}
        size={variant === "hero" ? 46 : 26}
        strokeWidth={1.5}
        className="photo-ph-glyph"
      />
      <span className="photo-ph-mark">✦</span>
    </div>
  );
}
