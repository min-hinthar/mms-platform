import { Fragment } from "react";
import { Icon } from "@mms/ui";
import { kitchenSegments, type KitchenSegment } from "@/lib/floor-kitchen";
import type { FloorKitchen } from "@/lib/floor-types";
import type { KdsThresholds } from "@/lib/kitchen-types";
import type { StaffLang } from "@/lib/staff-lang";
import { Chrome } from "./Chrome";
import { FloorWait } from "./FloorWait";

/**
 * Phase 2f review — the key a segment SAYS on a given card. A table serves a dish ("ready to
 * serve", the wall's words); a counter order's bag is bagged and handed over, so its ready segment
 * says "ready to bag". Every other segment is the same on both. The one mapping the row and the
 * counter card's NAME (`CounterOrderCard.subjectOf`) both read, so the two cannot word it apart.
 */
export function kitchenSegKey(k: KitchenSegment["k"], pickup: boolean) {
  return pickup && k === "floor.kitchen.up" ? ("floor.kitchen.up.pickup" as const) : k;
}

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
  frozen,
  wait = true,
  pickup = false,
}: {
  kitchen: FloorKitchen;
  serverNow: string;
  thresholds: KdsThresholds;
  lang: StaffLang;
  /** Phase 2d · review — the floor is not updating: the wait pill holds (`FloorWait`). */
  frozen: boolean;
  /** Phase 2f — false on a counter order's card: the wait pill reads the DINE-IN thresholds
   *  (`floorWait`), which would misjudge a pickup bag (a pickup-threshold pill is filed, D7). */
  wait?: boolean;
  /** Phase 2f review — a counter order's card: its ready segment says "ready to bag"
   *  (`kitchenSegKey`). */
  pickup?: boolean;
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
                <Chrome lang={lang} k={kitchenSegKey(s.k, pickup)} vars={{ n: s.n }} />
              )}
            </span>
          </Fragment>
        ))}
      </span>
      {wait && (
        <FloorWait
          kitchen={kitchen}
          serverNow={serverNow}
          thresholds={thresholds}
          lang={lang}
          frozen={frozen}
        />
      )}
    </div>
  );
}
