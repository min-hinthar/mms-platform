/**
 * W22a — the warm-paper page ambient: a fixed, gradient-masked hairline grid under a soft gold
 * bloom with grain (globals.css `.paper-ambient`). Pure decoration: aria-hidden, pointer-events
 * none (in the CSS), zero motion, no blur (mobile GPU budget). The HOST <main> must set
 * `isolation: "isolate"` or the fixed z:-1 layer escapes the stacking context and paints over
 * trailing siblings (the home-bg occlusion lesson, documented at the CSS).
 *
 * A server component on purpose — no state, no effects, renders one div.
 */
export function PaperAmbient() {
  return <div className="paper-ambient" aria-hidden />;
}
