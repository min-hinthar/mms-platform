import { Icon, categoryIconName, type IconName } from "@mms/ui";

/**
 * Designed missing-photo state (W2a). A dish with NO photography carries NULL; before this, `BlurUpImage` returned null and the caller's bare gradient tile
 * read as broken/still-loading. This fills that tile with an INTENTIONAL brand surface: the dish's
 * category glyph + the ✦ wordmark mark over the same gradient — so a photoless dish reads "photo coming"
 * rather than "broken image".
 *
 * ⚠️ W16d — this used to cover most of the menu because W13 nulled every photo whose FILENAME was
 * assumed to mean "no photography yet". It didn't (each is a distinct dish photo — see
 * lib/media-url.ts); measured against prod, 34 of 66 active dishes were hidden that way. The filter
 * is gone and this placeholder now covers only the 3 genuinely NULL rows + load
 * failures. Decorative only (`aria-hidden`); the row/sheet already names the dish, so
 * the placeholder carries no text. Purely presentational → Server-Component safe.
 *
 * `variant` scales the glyph to the slot: `thumb` for the menu-row/suggestion thumbnails, `hero` for the
 * full-width ItemSheet band.
 */
export function PhotoPlaceholder({
  category,
  icon,
  variant = "thumb",
}: {
  category?: string | null;
  /** Exact glyph override — the grocery aisles (W4b) carry their own icon mapping, which the
   *  menu-name heuristic `categoryIconName` can't infer from slugs like `tea-laphet`. */
  icon?: IconName;
  variant?: "thumb" | "hero";
}) {
  return (
    // A <span> (not a div) so the placeholder is valid PHRASING content when it renders inside a
    // button — the W5d grocery card wraps the photo in a `.gcard-open` button, and a flow <div> there
    // is an invalid content model. `.photo-ph` already sets `display: grid`, so the layout is unchanged.
    <span className="photo-ph" aria-hidden>
      <Icon
        name={icon ?? (category ? categoryIconName(category) : "cat-dish")}
        size={variant === "hero" ? 46 : 26}
        strokeWidth={1.5}
        className="photo-ph-glyph"
      />
      <span className="photo-ph-mark">✦</span>
    </span>
  );
}
