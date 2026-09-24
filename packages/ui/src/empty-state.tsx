import type { ReactNode } from "react";
import { Card } from "./card";

/**
 * EmptyState — the "nothing here yet" card (P5.4), and since Phase 0 the "nothing here" PAGE.
 * Pure presentational (no hooks → Server-Component safe). Styling lives in `primitives.css`
 * (`.ui-empty*`) on the shared `<Card>` surface.
 *
 * Two layouts, one grammar (icon → one heading → one sentence → one way forward):
 *  · `card` (default) sits INSIDE a region a heading already names (a staff board): body-font
 *    title, left-aligned, `titleAs="p"`.
 *  · `page` IS the page's content (an empty /cart, a /track visit with no order): centred slip, the
 *    icon in a medallion, a display-face `h1`. Before Phase 0 those two pages had two different
 *    designs and /cart's copy promised the menu while its button went to the door picker.
 *
 * a11y: the icon is decorative (`aria-hidden`); the title carries the meaning. For content that
 * *becomes* empty dynamically, pair with the view's live region (the staff boards already own a
 * polite `role="status"` that announces "All clear").
 */
export function EmptyState({
  title,
  subtitle,
  icon,
  action,
  titleAs,
  tone = "empty",
  layout = "card",
  titleId,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Decorative glyph — rendered `aria-hidden` (in a medallion on the `page` layout). */
  icon?: ReactNode;
  /** Optional CTA (e.g. a retry button) rendered below the copy. */
  action?: ReactNode;
  /** Title element. Defaults to `p` for a card (inside an already-named region), `h1` for a page. */
  titleAs?: "p" | "h1" | "h2" | "h3";
  /** W10a — "nothing here" vs "we couldn't LOOK": `error` marks a FAILED read (warn hairline; pair
   *  with a RetryButton in `action`), so read-failure states stop being dressed as empties — the
   *  outage audit found four surfaces rendering an outage as "all done"/"catalog is empty". */
  tone?: "empty" | "error";
  layout?: "card" | "page";
  /** Phase 1c — an `id` for the title, which also makes it programmatically focusable
   *  (`tabIndex={-1}`): a panel that REPLACES a control the user just pressed moves focus to its own
   *  visible heading. Additive — omitted, the title renders exactly as before. */
  titleId?: string;
}) {
  const TitleTag = titleAs ?? (layout === "page" ? "h1" : "p");
  return (
    <Card className="ui-empty" textured={layout === "page"} data-layout={layout} data-tone={tone}>
      {icon ? (
        <div aria-hidden className="ui-empty-icon">
          {icon}
        </div>
      ) : null}
      <TitleTag className="ui-empty-title" {...(titleId ? { id: titleId, tabIndex: -1 } : null)}>
        {title}
      </TitleTag>
      {subtitle ? <p className="ui-empty-sub">{subtitle}</p> : null}
      {action ? <div className="ui-empty-action">{action}</div> : null}
    </Card>
  );
}
