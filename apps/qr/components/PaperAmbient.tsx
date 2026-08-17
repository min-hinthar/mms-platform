/**
 * W22a — the warm-paper page ambient: a fixed, gradient-masked hairline grid under a soft gold
 * bloom with grain (globals.css `.paper-ambient`). Pure decoration: aria-hidden, pointer-events
 * none (in the CSS), zero motion, no blur (mobile GPU budget).
 *
 * The host must NOT isolate (Codex P2 on #195): the page ground lives on <html> only (the canvas
 * paints below negative-z content), so this fixed z:-1 layer is visible with NO stacking context
 * — an `isolation:isolate` host would trap its own fixed overlays (tier-up scrim, grocery toast,
 * confetti) below the app header instead.
 *
 * A server component on purpose — no state, no effects, renders one div.
 */
export function PaperAmbient() {
  return <div className="paper-ambient" aria-hidden />;
}
