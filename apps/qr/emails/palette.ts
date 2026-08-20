/**
 * M83 — the email palette, named ONCE.
 *
 * Every colour in `apps/qr/emails/*` came through here, and nowhere else. Before this the five
 * templates carried **48 hand-copied hex literals** spread across their style objects, and nothing
 * in the repo read a single one of them: `contrast-audit.test.ts` parses `tokens.css` (which the
 * emails cannot import), and `check-theme-parity.mjs` covered five other var()-less surfaces but not
 * this one — the largest uncovered contrast surface in the app, on the artifact a diner is most
 * likely to open on an unknown client in unknown light.
 *
 * ⚠️ **These are LITERALS on purpose, and that is the whole problem this file exists to contain.**
 * Email clients load no external CSS and resolve no custom properties, so `var(--tx)` is simply
 * blank; the values must be baked. What was missing was not the literals but the *link back*: each
 * key below names the token it mirrors, `scripts/check-theme-parity.mjs` (surface 6) asserts every
 * one against `packages/ui/src/tokens.css`, and the same guard refuses a raw hex anywhere under
 * `apps/qr/emails/` so a new template cannot reintroduce the drift. A token edit — which is exactly
 * what W22d proper will be — now reddens CI instead of silently splitting the emails from the app.
 *
 * ── Light only, and declared as such ────────────────────────────────────────────────────────────
 * There is no dark variant. `MmsEmailLayout` declares `color-scheme: light`, so the clients that
 * honour it (Apple Mail, iOS Mail, Outlook) skip their automatic dark transform and render the
 * palette as authored, with the pairs that were actually measured. It is a mitigation and not a
 * guarantee — Gmail's Android app inverts regardless of what a message declares — which is a reason
 * to keep the pairs comfortably above the floor rather than a reason to skip the declaration.
 */

/**
 * ⚠️ Each value is pinned to the light token named in its comment; the guard parses these comments.
 * Do not add a key without a `= --token` marker, and never write a colour into a template directly.
 */
export const EMAIL = {
  /** = --pg · the page behind the card */
  pg: "#faf9f5",
  /** = --cd · the card, and the receipt slip inside it (the on-screen slip is `var(--cd)` too) */
  cd: "#fffdf8",
  /** = --tx · body copy */
  tx: "#1b1714",
  /** = --t2 · secondary copy: the kicker, meta, footer lines */
  t2: "#6e6358",
  /** = --t3 · the quietest copy: slip labels and the honest "why you got this" line */
  t3: "#726859",
  /** = --ac · the eyebrow, the code, the primary button fill */
  ac: "#a65f10",
  /** = --oa · text ON a solid accent or ink fill */
  oa: "#fffdf8",
  /** = --ink · the CONSTANT deep ink — the triad bar's third cell and the CTA fill */
  ink: "#1b1714",
  /** = --gold · the triad bar's first cell (decorative, never text) */
  gold: "#e8a83c",
  /** = --warn · a refunded line on the receipt slip */
  warn: "#a44b34",
  /**
   * = --bd over --cd · the one value that is DERIVED rather than copied.
   *
   * `--bd` is `rgba(58, 35, 23, 0.1)`, and Outlook's Word rendering engine drops an rgba border
   * outright — so the email needs the composite, flattened. Three different invented greys shipped
   * before this: `#e8e2d9` (three times; it is not the composite over any surface in the palette)
   * and a lone `rgba(58,35,23,0.12)` in the auth email, a different alpha for no stated reason. The
   * guard recomputes this from `--bd` and `--cd` rather than comparing it to a stored string, so it
   * tracks a token change in either half.
   */
  bd: "#ebe7e2",
} as const;
