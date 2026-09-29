"use client";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@mms/ui";
import { FLOOR_WAIT_RANK, floorWait } from "@/lib/floor-kitchen";
import type { FloorKitchen } from "@/lib/floor-types";
import type { KdsThresholds } from "@/lib/kitchen-types";
import type { StaffLang } from "@/lib/staff-lang";
import { Chrome } from "./Chrome";

/** The pill's own tick. Whole minutes, so a quarter-minute tick is fresh enough and never busy. */
export const FLOOR_WAIT_TICK_MS = 15_000;

/**
 * Phase 2d · floor — the WAIT PILL: how long the table's oldest dish has been in the kitchen, by the
 * kitchen's own clock and rule (`floorWait` → `kdsUrgency`, the KDS strip's thresholds).
 *
 * A LEAF with its own interval, `RelativeTime`'s pattern: the first paint is computed from
 * `serverNow` (a fixed prop, so the server and the client render the same thing), then the clock
 * skew is corrected once per `serverNow` and the leaf ticks from the device clock. The board and the
 * card re-render only on the poll; the minute moving re-renders this span alone.
 *
 * When the level RISES between ticks (ok → amber, amber → red) the pill replays the kit's one-shot
 * `.mms-pop` (a keyed remount; never on first sight). There is no loop: a pulsing red on a counter
 * screen through a whole rush would owe a WCAG 2.2.2 stop control. Decorative to assistive tech —
 * the card's accessible name carries the same minutes and the KDS's "Late".
 *
 * Phase 2d · review — FROZEN, the pill HOLDS. While the floor's poll is failing (`frozen`, the
 * board's `degraded`), the snapshot's `serverNow` is the last instant this card knows anything
 * about: the dish may have come out since. So the pill stops ticking and shows the minutes AS OF
 * that read — exactly what the card's accessible name says (it is built from the same instant) — and
 * a held clock can never rise, so nothing escalates and nothing pops over data the board cannot see.
 * The next good read hands it a new `serverNow` and the clock runs again.
 */
export function FloorWait({
  kitchen,
  serverNow,
  thresholds,
  lang,
  frozen,
}: {
  kitchen: FloorKitchen;
  serverNow: string;
  thresholds: KdsThresholds;
  lang: StaffLang;
  /** The floor is not updating (the board's freeze): hold at `serverNow`, never extrapolate. */
  frozen: boolean;
}) {
  const [nowMs, setNowMs] = useState(() => Date.parse(serverNow));
  const [pop, setPop] = useState(0);
  // The last level this leaf SHOWED (null: none yet, or no pill) — a rise is measured against it.
  const lastRank = useRef<number | null>(null);

  useEffect(() => {
    const skew = Date.now() - Date.parse(serverNow);
    const update = () => {
      // Held at the read's own instant while frozen (docblock) — the same minutes the name says.
      const now = frozen ? Date.parse(serverNow) : Date.now() - skew;
      setNowMs(now);
      const w = floorWait(kitchen, now, thresholds);
      const rank = w === null ? null : FLOOR_WAIT_RANK[w.level];
      if (rank !== null && lastRank.current !== null && rank > lastRank.current)
        setPop((p) => p + 1);
      lastRank.current = rank;
    };
    update();
    if (frozen) return; // no clock on a frozen floor
    const id = setInterval(update, FLOOR_WAIT_TICK_MS);
    return () => clearInterval(id);
  }, [serverNow, kitchen, thresholds, frozen]);

  const w = floorWait(kitchen, nowMs, thresholds);
  if (w === null) return null;
  return (
    <span
      key={pop}
      className={`floor-wait floor-wait-${w.level}${pop > 0 ? " mms-pop" : ""}`}
      aria-hidden
    >
      {w.level === "red" && <Icon name="alert" size={14} strokeWidth={2.25} />}
      <Chrome lang={lang} k="floor.kitchen.wait" vars={{ n: w.min }} />
    </span>
  );
}
