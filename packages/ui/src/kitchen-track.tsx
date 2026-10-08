import { Fragment, type ReactNode } from "react";

/**
 * KitchenTrack — the ONE KITCHEN TRACK, three stamps (PATH_DESIGN 2026-10-07, round 3). Pure
 * presentational (no hooks → Server-Component safe); styled by `@mms/ui/pass.css` (`.ui-track*`).
 *
 * Three pill segments: LENGTH is progress and COLOUR is the stage — Sent lights 1/3 in ink-2,
 * Cooking 2/3 in ink, Served 3/3 in ok. Inside the Send's grace ("sending") the first segment is a
 * dashed outline; "unsent" is the hollow ring and never a track. The stage word — passed in by the
 * caller as `{ en, my }`, because this package holds no strings — takes its segments' ink. Gold and
 * accent are never a progress colour: the palette is fixed per `surface`, and nothing here reads
 * them. `lib/kitchen-track.ts` (kitchen-ops) derives the stage; this component only draws it.
 *
 * `surface` is an explicit prop rather than an inherited custom property on purpose: a themed host
 * dropping a track INSIDE a pass's subtree would otherwise inherit the pass inks silently, and a
 * prop renders as `data-surface`, which a static test can read — a variable scheme fails quietly.
 *
 * Motion: FILL plays on the segment that just landed when the caller passes `filling` (it observed
 * the stage advance; keyed per stage so it plays once, never on a first read). An un-fill is instant:
 * render the earlier stage without `filling`. Reduced motion gets the final frame (pass.css).
 *
 * a11y: never a live region. With `word`, the segments are decorative (`aria-hidden`) and the
 * visible word carries the state. With `aria-label` and no word, the whole track is one
 * `role="img"` named by it. With neither it is decorative — the caller's own words carry the
 * state (the TV key under its aria-hidden heading).
 */
export type KitchenStage = "unsent" | "sending" | "sent" | "cooking" | "served";
export type KitchenTrackSize = "glyph" | "row" | "tv" | "stub";
export type KitchenTrackSurface = "pass" | "theme";
export type KitchenTrackWord = { en: string; my: string };

export const KITCHEN_STAGES = ["unsent", "sending", "sent", "cooking", "served"] as const;
/** The track is three segments: Sent · Cooking · Served. Nothing records a plate arriving. */
export const TRACK_SEGMENTS = 3;

/** How many of the three segments a stage lights — the one place the rule lives. */
export function kitchenTrackLit(stage: KitchenStage): 0 | 1 | 2 | 3 {
  switch (stage) {
    case "sent":
      return 1;
    case "cooking":
      return 2;
    case "served":
      return 3;
    default:
      return 0;
  }
}

export type KitchenTrackProps = {
  stage: KitchenStage;
  size: KitchenTrackSize;
  /** The surface the track sits on: constant pass inks (default) or the theme's own. */
  surface?: KitchenTrackSurface;
  /** The stage word, both tongues, from the caller's dictionary (`table.line.state.*`). */
  word?: KitchenTrackWord;
  /** The lead tongue: it prints first. Default English. */
  lang?: "en" | "my";
  /** `false` prints the lead tongue only (the TV's rows: two scripts cannot stack in a chip). */
  echo?: boolean;
  /** The caller observed this stage LAND: the new segment FILLs once. Ignored for the ring and the
   *  dashed grace (nothing lands). */
  filling?: boolean;
  /** Accessible name for a track drawn with no word (`role="img"`). */
  "aria-label"?: string;
  className?: string;
};

export function KitchenTrack({
  stage,
  size,
  surface = "pass",
  word,
  lang = "en",
  echo = true,
  filling = false,
  "aria-label": ariaLabel,
  className,
}: KitchenTrackProps) {
  const lit = kitchenTrackLit(stage);
  const ring = stage === "unsent";
  const dashed = stage === "sending";
  const hasWord = word != null;
  const img = !hasWord && ariaLabel != null;
  const decorative = !hasWord && !img;
  const tongues: ReadonlyArray<"en" | "my"> = lang === "my" ? ["my", "en"] : ["en", "my"];
  const shown = echo ? tongues : tongues.slice(0, 1);
  return (
    <span
      className={["ui-track", className].filter(Boolean).join(" ")}
      data-stage={stage}
      data-size={size}
      data-surface={surface}
      data-filling={filling && lit > 0 ? "" : undefined}
      role={img ? "img" : undefined}
      aria-label={img ? ariaLabel : undefined}
      aria-hidden={decorative || undefined}
    >
      {ring ? (
        <span className="ui-track-ring" aria-hidden="true" />
      ) : (
        <span className="ui-track-segs" aria-hidden="true">
          {Array.from({ length: TRACK_SEGMENTS }, (_, i) => (
            <span
              key={i}
              className="ui-track-seg"
              data-lit={i < lit ? "" : undefined}
              data-dashed={dashed && i === 0 ? "" : undefined}
              data-landing={lit > 0 && i === lit - 1 ? "" : undefined}
            />
          ))}
        </span>
      )}
      {hasWord ? <TrackWord word={word} shown={shown} /> : null}
    </span>
  );
}

function TrackWord({ word, shown }: { word: KitchenTrackWord; shown: ReadonlyArray<"en" | "my"> }) {
  const parts: ReactNode[] = [];
  shown.forEach((t, i) => {
    parts.push(
      <Fragment key={t}>
        {i > 0 ? (
          <span className="ui-track-word-dot" aria-hidden="true">
            {" · "}
          </span>
        ) : null}
        <span className={`ui-track-word-${t}`} lang={t}>
          {word[t]}
        </span>
      </Fragment>,
    );
  });
  return <span className="ui-track-word">{parts}</span>;
}
