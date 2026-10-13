"use client";
import { useEffect, useRef, useState } from "react";
import { Sheet } from "@mms/ui";
import { DietPills, FreeFromDisclaimer } from "./DietPills";
import { hasFreeFrom, type Diet } from "@/lib/menu/dietary";

/**
 * M137 (owner: "dietary filters take too much space") — the five dietary pills, their caption and
 * their bilingual sub-line collapsed into ONE 44px chip in the sticky toolbar, with the rail itself
 * moved into a sheet.
 *
 * The toolbar was carrying, permanently: a search field, a category nav, a two-line caption and a
 * five-pill rail. On a phone that is most of the screen before a single dish appears — and the
 * toolbar is `position: sticky`, so it was that tall at every scroll position, not just at the top.
 *
 * WHAT THE CHIP KEEPS THAT THE RAIL HAD. Reachability: it is on the sticky bar, so the filter is
 * one tap away at any scroll position, which is the whole reason M135 moved these out of the taste
 * band. Lit state: the count rides the chip, so an active filter is visible without opening
 * anything — a filter that silently empties categories deep in the scroll must never be invisible.
 * And the accessible name carries the count too, so it is not a colour-only signal.
 *
 * ⚠️ THE FREE-FROM DISCLAIMER DOES NOT MOVE INTO THE SHEET. The standing rule is that an active
 * free-from filter is never on screen without its warning (Codex P1 on #194 caught the search state
 * dropping it). A sheet the diner has closed is not on screen, so the disclaimer would be gone
 * exactly when it matters. It renders in BOTH places: inside the sheet beside the pills, and in the
 * toolbar whenever such a filter is lit — one line, and only then.
 */
export function DietFilterButton({
  diets,
  matches,
  query,
  onToggle,
  onClear,
  announce,
}: {
  diets: Diet[];
  /** How many dishes the diner will SEE when this sheet closes — the menu's own visible count, which
   *  is the diets AND any active search. The sheet shows the consequence of each toggle because the
   *  list it filters is COVERED by the sheet while the diner is toggling, so the number has to be
   *  the one they land on, not a hypothetical. */
  matches: number;
  /** The active search text, or "" — it must appear in the sentence whenever it is narrowing the
   *  count, or the number gets blamed on the filters alone. */
  query: string;
  onToggle: (d: Diet) => void;
  onClear: () => void;
  /** F31 — /menu's ONE live region (the cart provider's Toast, `announce` as a QUIET claim: the
   *  sentence is already drawn inside this sheet). This component mints no region of its own. */
  announce: (sentence: string, still: () => boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const n = diets.length;
  // The consequence of the filters, said in one sentence — drawn in the sheet, and SPOKEN through
  // the page's one region when a toggle changes it. Null with no filter lit (the count is the menu).
  const matchSentence =
    n === 0
      ? null
      : query
        ? matches === 0
          ? `Nothing matches “${query}” with these filters — ease one, or clear the search.`
          : `${matches} ${matches === 1 ? "dish matches" : "dishes match"} “${query}” with these filters.`
        : matches === 0
          ? "Nothing on the menu fits these filters — ease one."
          : `${matches} ${matches === 1 ? "dish fits" : "dishes fit"}.`;
  // F31 — speak a CHANGE, never the arrival: what the sheet holds when it opens is read with the
  // dialog, so only a sentence that differs from the last one heard goes to the region. Closing
  // forgets it, so a re-open starts quiet again. `""` stands for "no sentence" (no filter lit).
  const heard = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      heard.current = null;
      return;
    }
    const now = matchSentence ?? "";
    const before = heard.current;
    heard.current = now;
    // `still`: a count that waits behind a visible toast is said only while it is still the sheet's
    // sentence — a later toggle, or Clear, or closing the sheet, makes it false (Codex on #355).
    if (before !== null && now !== "" && now !== before) announce(now, () => heard.current === now);
  }, [open, matchSentence, announce]);

  return (
    <>
      <button
        type="button"
        className={`menu-diet-btn${n > 0 ? " menu-diet-btn-on" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        // The count is IN the name, not only in the badge: "2 active" has to survive for anyone who
        // cannot see the chip light up.
        aria-label={n > 0 ? `Dietary needs, ${n} active` : "Dietary needs"}
        onClick={() => setOpen(true)}
      >
        {/* The leaf is the dietary pills' own opening glyph (🌱 Vegetarian) — the chip borrows the
            vocabulary it stands for rather than inventing a filter icon the icon set doesn't have. */}
        <span aria-hidden className="taste-emoji">
          🌱
        </span>
        <span aria-hidden>Dietary</span>
        {n > 0 && (
          <span aria-hidden className="menu-diet-count">
            {n}
          </span>
        )}
      </button>

      {/* The disclaimer's toolbar home — see the ⚠️ above. One line, only while a free-from filter
          is actually lit.

          WRAPPED, and the wrapper is load-bearing: this component returns a FRAGMENT, so without it
          the disclaimer's `<p>` becomes a direct flex item of `.menu-search-row` beside the search
          field and the chip. Its own `flex: 0 1 auto` then eats the row's width and `.menu-search`
          (`flex: 1; min-width: 0`) is the item that collapses — the search box shrinks toward
          nothing on a phone, exactly when an allergy filter is lit. `.menu-diet-note` takes a full
          basis so it wraps onto its own line under the row instead. */}
      {hasFreeFrom(diets) && (
        <div className="menu-diet-note">
          {/* Compact: this copy is PINNED (the toolbar is sticky), and the full sentence costs a
              second line at phone widths — 27% of a 390px viewport was chrome with one filter lit.
              The claim is identical, only shorter; the full sentence stays in the sheet, where the
              filter is chosen. The presence rule (an active free-from filter is never on screen
              without its warning) is untouched. */}
          <FreeFromDisclaimer compact />
        </div>
      )}

      <Sheet open={open} onOpenChange={setOpen} title="Dietary needs">
        <div className="menu-diet-sheet">
          <p id="taste-diet-cap" className="taste-caption">
            <span className="taste-caption-note">Filters the whole menu</span>
            {/* K15 — Claude-authored MY accent, pending the native check like every batch. */}
            <span lang="my" className="taste-caption-my">
              မီနူးတစ်ခုလုံး စစ်ထုတ်ပေးမယ်
            </span>
          </p>
          <DietPills diets={diets} onToggle={onToggle} labelledBy="taste-diet-cap" />
          {/* The consequence of each toggle, drawn INSIDE the dialog (adversarial pass on #239): the
              filtered list is covered by this sheet. F31 — it is plain text now, not a second
              `role="status"`: the sentence is SPOKEN through /menu's one region (the effect above;
              the provider's Toast carries `aria-live`, which Radix's modal sweep exempts, so it is
              heard while this sheet is open). Rendered only while a filter is lit — with none, the
              count is just the menu. */}
          {matchSentence && <p className="menu-diet-matches">{matchSentence}</p>}
          {hasFreeFrom(diets) && <FreeFromDisclaimer />}
          {/* ALWAYS rendered, `aria-disabled` when there is nothing to clear — never conditionally
              unmounted and never natively `disabled`. Both would destroy the place of anyone who
              had just focused it (clearing the last filter is exactly when that happens), which is
              the WCAG 2.4.3 rule DESIGN-LANGUAGE §16 states for the sheet's own ✕. The guard is the
              handler, since `aria-disabled` does not stop Enter or Space. */}
          <button
            type="button"
            className="menu-diet-clear"
            aria-disabled={n === 0 || undefined}
            aria-label={n === 0 ? "Clear all — no filters active" : `Clear all ${n} filters`}
            onClick={() => {
              if (n > 0) onClear();
            }}
          >
            Clear all
          </button>
        </div>
      </Sheet>
    </>
  );
}
