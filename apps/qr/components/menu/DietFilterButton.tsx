"use client";
import { useState } from "react";
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
  onToggle,
  onClear,
}: {
  diets: Diet[];
  onToggle: (d: Diet) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const n = diets.length;

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
          is actually lit. */}
      {hasFreeFrom(diets) && <FreeFromDisclaimer />}

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
