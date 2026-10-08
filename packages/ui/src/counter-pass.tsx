import { useId, type CSSProperties, type ReactNode } from "react";

/**
 * CounterPass — the ONE PASS (PATH_DESIGN 2026-10-07, round 3). Every pass the family reads is this
 * primitive RENDERED, never redrawn: the guest's "Show a server" card and the counter ask (m1, m2),
 * the pickup claim ticket (m3), the walk-up seal's #CODE stub (m6), the TV's table pass (m9), the
 * live Bill and the Paid slip (m10), and the guides' inert pictures (m11, m12). Styled by
 * `@mms/ui/pass.css` (`.ui-pass*`); `useId` only, so it renders in Server Components.
 *
 * Anatomy: a HEAD (the status row the host passes, then ONE identity figure under the two-tongue
 * label "စားပွဲ · Table", plus a side STUB of small fields in portrait), a dotted SEAM with 12px
 * notches, a BODY (the host's rows), and an optional torn FOOT. Landscape puts the whole head on
 * the left as the stub (the TV, the seal), behind a vertical perforation.
 *
 * Material: constant paper in both themes — every colour is a `--pass-*` token; the notches show
 * the HOST's ground through `--pass-hole` (tokens.css defaults it to `--pg`; a host on another
 * surface sets it). Never a theme token on the pass.
 *
 * The figure prints ONCE. Three tiers, never a fourth: `holder` (the 40px `.exit-pass-code` face,
 * read by the person holding the phone), `counter` (`--fs-pass`, held up across the counter), `tv`
 * (the table figure pinned at `--fs-pass`; a code at the board's 54px row). A `table` figure is
 * Fraunces 600 tabular; a `code` (or a time) is the Hanken 800 code face. A three-digit table steps
 * down to `--fs-display` with no wrap (m2 appendix C).
 *
 * ✓ is drawn ONLY at a terminal state — `terminal="paid"` stamps the stub of a dine-in pass,
 * `terminal="ready"` marks the head of a pickup ticket — and never otherwise; the TV passes none.
 *
 * a11y: the pass is a `<section>` (or `article` / `li`; a `div` takes `role="group"`) named by its
 * heading, and that name is the lead tongue's label + the figure ONCE ("Table 7" / "စားပွဲ 7"): the
 * visible two-tongue label is decorative, so a screen reader never hears the table twice in two
 * tongues. A code may pass `figureSpoken` (e.g. "7 C 2 E 9 A") so it is spelt, not read as a word.
 * Notches, seam, tear and the stamp are `aria-hidden`; the host's status word carries the state.
 * `inert` is a guide picture: `aria-hidden` + the `inert` attribute, no ids, no heading, no pointer —
 * the host scales it with one uniform transform.
 *
 * Motion lives in the host's hands as hooks, each playing once when the host sets it (keyed on the
 * stage so a revisit or a first read never replays): `turning="head"` plays the TURN on the head
 * (X axis: a stage completes, m9/m10), `turning="figure"` on the figure (Y axis: m3's time → code);
 * `stamping` plays STAMP on the ✓ then PRINT on the tail (Paid only). One thing moves at a time: a
 * host never sets both. Reduced motion gets the final frame (pass.css).
 */
export type PassTier = "holder" | "counter" | "tv";
export type PassOrientation = "portrait" | "landscape";
export type PassFigureKind = "table" | "code";
export type PassLang = "en" | "my";
export type PassTerminal = "paid" | "ready";
export type PassSeam = "2px" | "4px";
export type PassTurn = "head" | "figure";
export type PassLabel = { en: string; my: string };

export type CounterPassProps = {
  tier: PassTier;
  /** `landscape` = the stub on the LEFT (the TV, the seal). Default portrait. */
  orientation?: PassOrientation;
  /** The ONE identity figure, printed once: a table number, a code, a time. Latin digits. */
  figure: string;
  figureKind: PassFigureKind;
  /** The two-tongue label over the figure ("စားပွဲ" / "Table"); the order flips with `lang`. */
  label: PassLabel;
  /** The lead tongue: it prints first and names the pass. */
  lang: PassLang;
  /** What a screen reader hears for the figure, when the figure itself should not be read as a word
   *  (a code, spelt: "7 C 2 E 9 A"). Defaults to the figure. */
  figureSpoken?: string;
  /** The status slot: a stage glyph + word, passed in (a KitchenTrack at the glyph size). Never
   *  derived here. */
  head?: ReactNode;
  /** The stub's small fields (a `<dl>`: Host · Sent; For · Code). */
  stub?: ReactNode;
  /** The body: the itinerary, the dish rows, the money rows. */
  children?: ReactNode;
  /** The perforation's weight. Defaults by tier: 4px on the TV, 2px elsewhere. */
  seam?: PassSeam;
  /** The ONLY ✓: Paid on a dine-in pass (the stub is stamped), Ready on a pickup ticket (the head). */
  terminal?: PassTerminal;
  /** The torn foot: a slip torn off the roll. */
  tear?: boolean;
  /** A guide picture: inert, hidden from assistive tech, scaled by the host. */
  inert?: boolean;
  /** Plays the TURN once on the head (X) or the figure (Y). */
  turning?: PassTurn;
  /** Plays STAMP on the ✓, then PRINT on the tail (Paid only). */
  stamping?: boolean;
  /** The host element. A `div` takes `role="group"` so its name is permitted. */
  as?: "section" | "article" | "li" | "div";
  /** The identity heading's level under the page's own headings. Default h2. */
  headingLevel?: 2 | 3 | 4;
  /** The heading id (also the pass's `aria-labelledby`). Defaults to a React id. */
  id?: string;
  className?: string;
  style?: CSSProperties;
};

const HEADING = { 2: "h2", 3: "h3", 4: "h4" } as const;

export function CounterPass({
  tier,
  orientation = "portrait",
  figure,
  figureKind,
  label,
  lang,
  figureSpoken,
  head,
  stub,
  children,
  seam,
  terminal,
  tear = false,
  inert = false,
  turning,
  stamping = false,
  as: Tag = "section",
  headingLevel = 2,
  id: givenId,
  className,
  style,
}: CounterPassProps) {
  const reactId = useId();
  const id = inert ? undefined : (givenId ?? `pass-${reactId}`);
  const seamW: PassSeam = seam ?? (tier === "tv" ? "4px" : "2px");
  const landscape = orientation === "landscape";
  const leadLabel = lang === "my" ? label.my : label.en;
  const tongues: ReadonlyArray<PassLang> = lang === "my" ? ["my", "en"] : ["en", "my"];
  // A three-digit TABLE steps down at the --fs-pass tiers; the holder's 40px has the room, and a
  // code's host sizes its own stub.
  const figureLong = figureKind === "table" && tier !== "holder" && figure.trim().length >= 3;
  const hasBody = children != null && children !== false;
  const hasStub = stub != null || terminal === "paid";
  const Heading = inert ? "p" : HEADING[headingLevel];
  const spoken = figureSpoken ?? figure;
  const figureClass = `ui-pass-figure ui-pass-figure-${figureKind}`;
  return (
    <Tag
      className={["ui-pass", className].filter(Boolean).join(" ")}
      style={style}
      role={Tag === "div" && !inert ? "group" : undefined}
      aria-labelledby={id}
      aria-hidden={inert || undefined}
      inert={inert || undefined}
      data-tier={tier}
      data-orientation={orientation}
      data-seam={seamW}
      data-figure={figureKind}
      data-figure-long={figureLong ? "" : undefined}
      data-terminal={terminal}
      data-tear={tear ? "" : undefined}
      data-inert={inert ? "" : undefined}
      data-turning={turning}
      data-stamping={stamping ? "" : undefined}
      data-lang={lang}
    >
      <div className="ui-pass-paper">
        <div className="ui-pass-head">
          <div className="ui-pass-main">
            {head != null || terminal === "ready" ? (
              <div className="ui-pass-status">
                {terminal === "ready" ? <PassStamp /> : null}
                {head}
              </div>
            ) : null}
            <Heading className="ui-pass-identity" id={id}>
              <span className="ui-pass-label" aria-hidden="true">
                <span className={`ui-pass-label-${tongues[0]}`} lang={tongues[0]}>
                  {label[tongues[0]!]}
                </span>
                <span className="ui-pass-label-dot"> · </span>
                <span className={`ui-pass-label-${tongues[1]}`} lang={tongues[1]}>
                  {label[tongues[1]!]}
                </span>
              </span>
              <span className="ui-pass-sr" lang={lang}>
                {leadLabel}{" "}
              </span>
              {spoken === figure ? (
                <span className={figureClass}>{figure}</span>
              ) : (
                <>
                  <span className={figureClass} aria-hidden="true">
                    {figure}
                  </span>
                  <span className="ui-pass-sr">{spoken}</span>
                </>
              )}
            </Heading>
          </div>
          {hasStub ? (
            <div className="ui-pass-stub">
              {landscape ? null : (
                <span className="ui-pass-notch ui-pass-notch-top" aria-hidden="true" />
              )}
              {terminal === "paid" ? <PassStamp /> : null}
              {stub}
            </div>
          ) : null}
        </div>
        {hasBody ? (
          <div className="ui-pass-tail">
            <div className="ui-pass-seam" aria-hidden="true">
              <span className="ui-pass-seam-rule" />
              {landscape ? (
                <>
                  <span className="ui-pass-notch ui-pass-notch-top" />
                  <span className="ui-pass-notch ui-pass-notch-bottom" />
                </>
              ) : (
                <>
                  <span className="ui-pass-notch ui-pass-notch-start" />
                  <span className="ui-pass-notch ui-pass-notch-end" />
                </>
              )}
            </div>
            <div className="ui-pass-body">{children}</div>
          </div>
        ) : null}
      </div>
      {tear ? <div className="ui-pass-tear" aria-hidden="true" /> : null}
    </Tag>
  );
}

/** The stamp: a paper disc ringed in ok with the check drawn through it (PaySuccess's mark, scaled
 *  to 44). Decorative — the host's word says Paid or Ready. */
function PassStamp() {
  return (
    <svg className="ui-pass-stamp" viewBox="0 0 44 44" aria-hidden="true" focusable="false">
      <circle className="ui-pass-stamp-ring" cx="22" cy="22" r="20" />
      <path className="ui-pass-stamp-mark" d="M14 23 l6 6 L31 16" />
    </svg>
  );
}
