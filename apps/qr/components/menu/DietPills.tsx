"use client";
import { Icon } from "@mms/ui";
import { DIETS, type Diet } from "@/lib/menu/dietary";
import { Rail } from "../Rail";

/**
 * W22 (Codex P1+P2 on #194) — the dietary pill rail, shared. The pills live in the taste band
 * ("Explore your Burmese taste buds"), but a diner who types a SEARCH first must still be able to
 * add a diet filter — and one who filtered free-from must keep seeing the safety disclaimer — so
 * the toolbar renders this same rail while a search is active (the one state that hides the band).
 * One component, one pill vocabulary, one source of truth for the markup.
 */
export function DietPills({
  diets,
  onToggle,
  labelledBy,
}: {
  diets: Diet[];
  onToggle: (d: Diet) => void;
  /** Caption id when a visible caption labels the group; falls back to a plain aria-label. */
  labelledBy?: string;
}) {
  return (
    <Rail
      role="group"
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : "Dietary filters"}
      className="taste-rail"
    >
      {DIETS.map((d) => {
        const on = diets.includes(d.id);
        return (
          <button
            key={d.id}
            type="button"
            aria-pressed={on}
            className={`taste-chip${on ? " taste-chip-on" : ""}`}
            onClick={() => onToggle(d.id)}
          >
            <span aria-hidden className="taste-emoji">
              {d.emoji}
            </span>
            {d.label}
            {/* K15 — Claude-authored MY accents, pending the native check like every batch. */}
            <span lang="my" className="taste-chip-my">
              {d.my}
            </span>
          </button>
        );
      })}
    </Rail>
  );
}

/**
 * The fail-safe free-from disclaimer — a guide, never a guarantee. Rendered by WHOEVER is showing
 * the pills (taste band while browsing, toolbar while searching), so an active free-from filter is
 * never on screen without its warning (the Codex P1: the search state dropped it).
 */
export function FreeFromDisclaimer() {
  return (
    <p
      role="note"
      style={{
        margin: "8px 2px 0",
        fontSize: "var(--fs-sm)",
        color: "var(--t2)",
        lineHeight: 1.4,
      }}
    >
      <Icon
        name="info"
        size={13}
        style={{ display: "inline", verticalAlign: "-2px", marginRight: 3 }}
      />
      Allergen info is a guide — please tell our staff about any allergy.
    </p>
  );
}
