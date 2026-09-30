"use client";
import { usePathname } from "next/navigation";
import { Skeleton } from "@mms/ui";
import { LoadingLine } from "@/components/staff/LoadingLine";
import { PadSkeleton } from "@/components/staff/PadSkeleton";
import { TableDetailSkeleton } from "@/components/staff/TableDetailSkeleton";

/**
 * Instant skeleton for the table drill-down — the floor→table tap previously froze on the old view
 * while 5 fetches ran. Mirrors `FloorDetailLive` under P7·1b in its OWN geometry (manager-8): the
 * staff bar (a circle, the title, the trailing controls) → the header's chip row and sub-line → the
 * party card (its heading, ~30px guest chips) → the order card (its heading, three line rows of a
 * name and its meta beside a 44px note pill and the 44px stepper pair), on the 640 column the live
 * view uses, every gap a `--s*` token. The one announced line is the dictionary's (`<LoadingLine>`).
 */
export default function TableDetailLoading() {
  // Phase 2c · pad — a CLIENT boundary on purpose. A register mint pushes to a NEW `[id]/add`, and
  // the boundary Next shows for a new `[id]` is THIS one (the nearest loading.tsx above the segment
  // that changed), so without the path check every walk-up and phone order opened on the table
  // drill-down's skeleton. `usePathname()` already names the target during the fallback; the pad's
  // own geometry is drawn when it ends in `/add`. (Browser-verify on a register mint — the fallback
  // plan is a `(detail)` route group; see docs/p2c-notes/pad.md.)
  const path = usePathname();
  if (path?.endsWith("/add"))
    return (
      <main className="staff-main pad-main">
        <PadSkeleton />
      </main>
    );
  return (
    <main className="staff-main">
      <LoadingLine what="what.table" />
      <div aria-hidden>
        <div className="staff-bar">
          <Skeleton width={44} height={44} radius={999} />
          <Skeleton width={180} height={30} radius={8} />
          {/* P2e — the tail is Lock alone: no in-service bar carries the language pill. */}
          <div className="staff-bar-tail">
            <Skeleton width={44} height={44} radius={999} />
          </div>
        </div>
        <div className="staff-col" style={{ maxWidth: 640, margin: "0 auto" }}>
          {/* Phase 2d · split — the body is drawn once, shared with the counter's pane. */}
          <TableDetailSkeleton />
        </div>
      </div>
    </main>
  );
}
