import { AmbientMotion } from "./AmbientMotion";

/**
 * The page atmosphere. M126 rebuilt it as three planes (globals.css § THE ROOM): a far wall out of
 * focus, a lit middle distance in focus, and film on the lens. W22a's single masked div is gone,
 * and with it two shipped defects — a `position: fixed` mask that faded in VIEWPORT coordinates
 * (the bottom third of every screen had no ambient at any scroll position) and a grain layer that
 * lived inside that mask and died with it.
 *
 * The host must NOT isolate (Codex P2 on #195): the page ground lives on <html> only (the canvas
 * paints below negative-z content), so this fixed z:-1 layer is visible with NO stacking context on
 * the page — an `isolation: isolate` host would trap its own fixed overlays (tier-up scrim, grocery
 * toast, confetti) below the app header instead. The `isolation: isolate` INSIDE `.paper-ambient`
 * is a different thing: it is the boundary the grain's blend needs, on a div that `z-index: -1`
 * had already made a stacking context.
 *
 * Still a server component: the planes are static DOM. `AmbientMotion` is a client SIBLING, not a
 * child, because the pause control it renders cannot live inside a z:-1 layer — it would paint
 * behind every pixel of content and take no clicks.
 */
export function PaperAmbient() {
  return (
    <>
      <div className="paper-ambient" aria-hidden>
        <div className="pa-far" />
        <div className="pa-mid" />
        <div className="pa-grain" />
      </div>
      <AmbientMotion />
    </>
  );
}
