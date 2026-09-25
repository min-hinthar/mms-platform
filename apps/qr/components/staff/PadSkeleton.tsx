"use client";
import { Skeleton } from "@mms/ui";
import { LoadingLine } from "./LoadingLine";

/**
 * Phase 2c · pad — the ORDER PAD's instant skeleton, in the pad's own geometry: the bar, the tools
 * row (a search circle and 44px chip ghosts), the tile grid (8 ghosts at 2 columns, 12 at 3, 16 at
 * 4 — the extra ones are CSS-hidden per tier), and the ticket pane from the tablet tier up. Every
 * size is a `--s*` token or the pad's own class; the one announced line is the dictionary's.
 */
export function PadSkeleton() {
  return (
    <>
      <LoadingLine what="what.order" />
      <div aria-hidden>
        <div className="staff-bar">
          <Skeleton width={44} height={44} radius={999} />
          <Skeleton width={180} height={30} radius={8} />
          <div className="staff-bar-tail">
            <Skeleton width={44} height={44} radius={999} />
          </div>
        </div>
        <div className="pad-shell pad-skeleton" data-view="menu">
          <div className="pad-tools">
            <Skeleton width={44} height={44} radius={999} />
            <div className="pad-rail">
              {[72, 96, 88, 110, 80].map((w, i) => (
                <Skeleton key={i} width={w} height={44} radius="var(--r-full)" />
              ))}
            </div>
          </div>
          <div className="pad-tiles">
            <ul role="list" className="pad-grid">
              {Array.from({ length: 16 }, (_, i) => (
                <li key={i} className="pad-tile pad-skeleton-tile">
                  <Skeleton height="100%" radius="var(--r-sm)" />
                </li>
              ))}
            </ul>
          </div>
          <div className="pad-ticket card pad-skeleton-ticket">
            <Skeleton width={96} height={22} radius={6} />
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height={44} radius="var(--r-sm)" />
            ))}
          </div>
          <div className="pad-dock">
            <Skeleton height={48} radius="var(--r-sm)" />
            <Skeleton height={48} radius="var(--r-sm)" />
          </div>
        </div>
      </div>
    </>
  );
}
