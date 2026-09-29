import { Fragment } from "react";
import { Icon } from "@mms/ui";
import { kitchenSegments } from "@/lib/floor-kitchen";
import type { FloorKitchen } from "@/lib/floor-types";
import type { KdsThresholds } from "@/lib/kitchen-types";
import type { StaffLang } from "@/lib/staff-lang";
import { Chrome } from "./Chrome";
import { FloorWait } from "./FloorWait";

/**
 * Phase 2d · floor — the table card's KITCHEN ROW: "2 not sent · 3 in kitchen · 1 ready to serve",
 * or "Kitchen done" alone, then the wait pill at the right. Every word is `kitchenSegments`'s, every
 * count the server's fold (`foldFloorKitchen`) — this renders, it never decides.
 *
 * Segments are ELEMENTS with the middot drawn between the survivors (the board's count-line
 * pattern), each through <Chrome> so the Burmese arrives marked; no echo — a card row is a glance.
 * One colour dimension per segment, and never colour alone: the words carry the state.
 */
export function FloorKitchenLine({
  kitchen,
  serverNow,
  thresholds,
  lang,
}: {
  kitchen: FloorKitchen;
  serverNow: string;
  thresholds: KdsThresholds;
  lang: StaffLang;
}) {
  const segs = kitchenSegments(kitchen);
  return (
    <div className="floor-kitchen">
      <span className="floor-kitchen-segs">
        <Icon name="flame" size={16} strokeWidth={2} className="floor-kitchen-glyph" />
        {segs.map((s, i) => (
          <Fragment key={s.k}>
            {i > 0 ? <span aria-hidden> · </span> : null}
            <span className="floor-kitchen-seg" data-seg={s.k}>
              {s.k === "expo.kitchenDone" ? (
                <Chrome lang={lang} k={s.k} />
              ) : (
                <Chrome lang={lang} k={s.k} vars={{ n: s.n }} />
              )}
            </span>
          </Fragment>
        ))}
      </span>
      <FloorWait kitchen={kitchen} serverNow={serverNow} thresholds={thresholds} lang={lang} />
    </div>
  );
}
