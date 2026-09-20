import { Skeleton } from "@mms/ui";
import type { WhatKey } from "@/lib/staff-outage";
import { LoadingLine } from "./LoadingLine";

/**
 * signin-1 — the front door's skeleton, ONE shape for the two routes that wear it (`/staff/login`
 * and `/staff/lock`). Both fell back to `app/staff/loading.tsx`, the counter's 1080 three-zone
 * geometry, so a tap on Sign-in or a lock landed the bar and a 440 card on top of a different
 * layout. This mirrors the pages: the bar (a static circle, the title block, the switch's pair of
 * circles in the tail), then `.staff-col.entry-col` with the one textured card — its brand line,
 * the heading, two 52px fields, the primary pill. Every gap is the class the live page wears or a
 * `--s*` token; the one announced line is the dictionary's, in the console's tongue (`LoadingLine`
 * reads the layout's provider, so the fallback stays synchronous — never an async `loading.tsx`,
 * which would defeat the instant paint the boundary exists for).
 */
export function EntrySkeleton({ what }: { what: WhatKey }) {
  return (
    <main className="staff-main">
      <LoadingLine what={what} />
      <div aria-hidden>
        <div className="staff-bar">
          <Skeleton width={44} height={44} radius={999} />
          <Skeleton width={180} height={30} radius={8} />
          <div className="staff-bar-tail">
            <Skeleton width={44} height={44} radius={999} />
            <Skeleton width={44} height={44} radius={999} />
          </div>
        </div>
        <div className="staff-col entry-col">
          <div className="card card-textured entry-card">
            <Skeleton width={140} height={12} radius={6} style={{ margin: "0 0 var(--s3)" }} />
            <Skeleton width="60%" height={26} radius={8} style={{ margin: "0 0 var(--s5)" }} />
            <Skeleton width={90} height={13} radius={6} style={{ margin: "0 0 var(--s2)" }} />
            <Skeleton height={52} radius="var(--r-sm)" style={{ margin: "0 0 var(--s4)" }} />
            <Skeleton width={90} height={13} radius={6} style={{ margin: "0 0 var(--s2)" }} />
            <Skeleton height={52} radius="var(--r-sm)" style={{ margin: "0 0 var(--s5)" }} />
            <Skeleton height={52} radius="var(--r-full)" />
          </div>
        </div>
      </div>
    </main>
  );
}
