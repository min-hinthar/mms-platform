"use client";
import { Fragment } from "react";
import { burmeseAddsInfo, type AllDayRow } from "@/lib/ticket-names";

/**
 * P1 — the bilingual TEXT of a ticket line, in one place, so the render rule the data layer cannot
 * enforce has a suite of its own (`TicketText.test.tsx`, jsdom).
 *
 * The data rule (`lib/ticket-names.ts`) is that a Burmese slot with no `name_my` stays `null`. The
 * RENDER rule, which is the one the design panel on this slice got wrong twice, is what these
 * components own: **a null slot renders as its English label wrapped in `lang="en"`** — never as
 * bare text under the parent's `lang="my"`, where it would be typeset in Padauk and (wherever the
 * text IS the accessible name — the rail, the expo row) announced as Burmese. Inside the KDS bump
 * button the `aria-label` replaces the content for assistive tech, so there the `lang="en"` wrap is
 * about the FACE (the body font is restored in CSS), not the voice.
 *
 * The blind pass on this slice rejected the first draft precisely because `{my ?? en}` at any of
 * these three sites shipped the failure with every data-layer guard green. So each site is a
 * component here, rendered by the suite, and mutated by `verify:slice`.
 */

/** A Burmese modifier run with PER-SLOT English fallbacks. Rendered only when some slot HAS
 *  Burmese (callers check `burmeseAddsInfo`/`.some`), so an all-English line never mounts it. The
 *  separators are text nodes inside a block element, never children of a flex container
 *  (DESIGN-LANGUAGE §6's whitespace rule cannot bite). */
export function ModsMy({
  modifiers,
  modifiersMy,
}: {
  modifiers: string[];
  modifiersMy: readonly (string | null)[];
}) {
  return (
    <>
      {modifiers.map((en, i) => {
        const my = modifiersMy[i] ?? null;
        return (
          <Fragment key={i}>
            {i > 0 && " · "}
            {my !== null ? my : <span lang="en">{en}</span>}
          </Fragment>
        );
      })}
    </>
  );
}

/** The fields a ticket line's text needs — a `KitchenLine`, an `ExpoLine`, or a rail row. */
export type LineText = {
  name: string;
  nameMy: string | null;
  modifiers: string[];
  modifiersMy: readonly (string | null)[];
};

/**
 * The KDS line's text: the name pair, then the modifier pair. Burmese takes the primary slot ONLY
 * when the catalog has it; the English snapshot echoes beneath at the modifier size, full contrast
 * (Dad's line, and the one a K15 correction cannot retire). An English-only dish renders exactly
 * the two elements it rendered before P1 — `.kds-line-en` and the `lang="my"` modifier line are
 * emitted only in the Burmese branch, and the suite pins that branch, not just the CSS gating.
 */
export function TicketLineText({ line }: { line: LineText }) {
  return (
    <>
      {line.nameMy !== null ? (
        <>
          <p className="kds-line-name" lang="my">
            {line.nameMy}
          </p>
          <p className="kds-line-en">{line.name}</p>
        </>
      ) : (
        <p className="kds-line-name">{line.name}</p>
      )}
      {line.modifiers.length > 0 && (
        <>
          {line.modifiersMy.some((m) => m !== null) && (
            <p className="kds-line-mods" lang="my">
              <ModsMy modifiers={line.modifiers} modifiersMy={line.modifiersMy} />
            </p>
          )}
          <p className="kds-line-mods">{line.modifiers.join(" · ")}</p>
        </>
      )}
    </>
  );
}

/** The All-Day rail row's label: the Burmese row the cook counts by, with the English label beneath
 *  at the chrome size — or, when nothing Burmese is known for the key, the label alone, as before. */
export function RailRowText({ row }: { row: AllDayRow }) {
  if (!burmeseAddsInfo(row.nameMy, row.modifiersMy)) return <>{row.label}</>;
  return (
    <>
      <span className="kds-rail-my" lang="my">
        {row.nameMy !== null ? row.nameMy : <span lang="en">{row.name}</span>}
        {row.modifiers.length > 0 && (
          <>
            {" · "}
            <ModsMy modifiers={row.modifiers} modifiersMy={row.modifiersMy} />
          </>
        )}
      </span>
      <span className="kds-rail-en">{row.label}</span>
    </>
  );
}

/**
 * The expo bag line's Burmese half, above the English the counter already showed. Name and
 * modifiers fall back INDEPENDENTLY: a bag line with Burmese options but an English-only name still
 * shows its Burmese options. Mounts nothing at all when the line has no Burmese, so an all-English
 * bag line keeps its pre-P1 elements.
 */
export function ExpoLineMy({ line }: { line: LineText }) {
  if (!burmeseAddsInfo(line.nameMy, line.modifiersMy)) return null;
  return (
    <span className="expo-line-my" lang="my">
      {line.nameMy !== null ? line.nameMy : <span lang="en">{line.name}</span>}
      {line.modifiersMy.some((m) => m !== null) && (
        <span className="expo-line-my-mods">
          {" · "}
          <ModsMy modifiers={line.modifiers} modifiersMy={line.modifiersMy} />
        </span>
      )}
    </span>
  );
}
