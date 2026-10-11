"use client";
import type { MouseEvent, ReactNode } from "react";

/**
 * PD12 · PD11 — the ONE pager of dots every step guide draws: the staff guides (`StepGuide`) and the
 * diner's first-visit guide (`DinerGuide`). A row of real buttons (44×44 each), one per step, named
 * by sr-only text ("Step 2 of 5"), the current one `aria-current="step"` and told apart by SHAPE — a
 * `--tx` capsule beside round `--t3` dots — never by colour alone (DESIGN-LANGUAGE §36: accent is spent
 * on the one primary only). The group is named ("Steps"). Nothing animates between them.
 *
 * Every dot's tap goes through the host's arm (`onPick` receives the click, so the host can read
 * `detail` and refuse a press that began before its controls armed); where focus lands after a page
 * change is the host's rule, so this draws only.
 */
export function GuideDots({
  total,
  current,
  label,
  name,
  onPick,
}: {
  total: number;
  /** 1-based. */
  current: number;
  /** The group's accessible name. */
  label: string;
  /** Each dot's accessible name (sr-only DOM text, so a host can hand a bilingual node). */
  name: (n: number) => ReactNode;
  onPick: (n: number, e: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <div className="guide-dots" role="group" aria-label={label}>
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1;
        return (
          <button
            key={n}
            type="button"
            className="guide-dot"
            aria-current={n === current ? "step" : undefined}
            onClick={(e) => onPick(n, e)}
          >
            <span className="guide-dot-mark" aria-hidden />
            <span className="sr-only">{name(n)}</span>
          </button>
        );
      })}
    </div>
  );
}
