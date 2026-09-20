import { Skeleton } from "@mms/ui";
import type { WhatKey } from "@/lib/staff-outage";
import { LoadingLine } from "./LoadingLine";

/**
 * signin-1 — the front door's skeleton, ONE component for the two routes that wear it
 * (`/staff/login` and `/staff/lock`) with the card drawn in EACH route's own first shape. Both
 * fell back to `app/staff/loading.tsx`, the counter's 1080 three-zone geometry, so a tap on
 * Sign-in or a lock landed the bar and a 440 card on top of a different layout. This mirrors the
 * pages: the bar (a static circle, the title block, the switch's pair of circles in the tail), then
 * `.staff-col.entry-col` with the one textured card —
 *
 *   · `login`: the brand line, the heading, the sub-line, the Google pill, the divider word, one
 *     labelled field (the email step is the first the form shows), the primary pill;
 *   · `lock`:  the heading, the sub-line, one labelled field (the PIN), the primary pill, the
 *     forgot-PIN link.
 *
 * A first cut drew one shape for both (two fields, a brand line on the lock) and so replaced a
 * card of a materially different height when either route resolved — the exact shift a route's
 * own boundary exists to prevent (Codex round 2, P2). `EntrySkeleton.test.tsx` renders the two
 * live forms and holds each variant to the live form's field count, pill count and brand line.
 *
 * Every gap is the class the live page wears or a `--s*` token; the root says `aria-busy`, and the
 * one line it offers assistive tech (sr-only, no live semantics — a fallback that mounts already
 * holding its text is not an announcement, and the page's own h1 is what the route announcer reads
 * once the navigation lands) is the dictionary's, in the console's tongue (`LoadingLine` reads the
 * layout's provider, so the fallback stays synchronous — never an async `loading.tsx`, which would
 * defeat the instant paint).
 */
export function EntrySkeleton({ what, form }: { what: WhatKey; form: "login" | "lock" }) {
  return (
    <main className="staff-main" aria-busy>
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
          <div className="card card-textured entry-card" data-form={form}>
            {form === "login" && (
              <Skeleton width={140} height={12} radius={6} style={{ margin: "0 0 var(--s3)" }} />
            )}
            <Skeleton width="60%" height={26} radius={8} style={{ margin: "0 0 4px" }} />
            <Skeleton width="85%" height={14} radius={6} style={{ margin: "0 0 var(--s5)" }} />
            {form === "login" && (
              <>
                <Skeleton height={52} radius="var(--r-full)" style={{ margin: "0 0 var(--s4)" }} />
                <Skeleton
                  width={120}
                  height={12}
                  radius={6}
                  style={{ margin: "0 auto var(--s4)" }}
                />
              </>
            )}
            <Skeleton width={90} height={13} radius={6} style={{ margin: "0 0 6px" }} />
            <Skeleton height={52} radius="var(--r-sm)" style={{ margin: "0 0 var(--s4)" }} />
            <Skeleton height={52} radius="var(--r-full)" />
            {form === "lock" && (
              <Skeleton width={160} height={44} radius={8} style={{ margin: "4px auto 0" }} />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
