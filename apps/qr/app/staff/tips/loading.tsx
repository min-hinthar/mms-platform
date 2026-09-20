import { Skeleton } from "@mms/ui";
import { LoadingLine } from "@/components/staff/LoadingLine";

/**
 * menu-6 — the Tips screen's OWN skeleton (it fell back to the counter's). Mirrors `tips/page.tsx`:
 * the bar (a circle, the title, the Lock circle), the 640 column, the two-line lead, the total
 * card, a heading over three rows. The one announced line is the dictionary's.
 */
export default function TipsLoading() {
  return (
    <main className="staff-main">
      <LoadingLine what="what.tips" />
      <div aria-hidden>
        <div className="staff-bar">
          <Skeleton width={44} height={44} radius={999} />
          <Skeleton width={160} height={30} radius={8} />
          <div className="staff-bar-tail">
            <Skeleton width={44} height={44} radius={999} />
          </div>
        </div>
        <div className="staff-col" style={{ maxWidth: 640, margin: "0 auto" }}>
          <Skeleton width="88%" height={14} radius={6} style={{ marginBottom: 6 }} />
          <Skeleton width="60%" height={14} radius={6} style={{ marginBottom: "var(--s6)" }} />
          <Skeleton height={112} radius="var(--r-card)" style={{ marginBottom: "var(--s6)" }} />
          <Skeleton width={140} height={22} radius={6} style={{ marginBottom: "var(--s3)" }} />
          <div style={{ display: "grid", gap: "var(--s2)" }}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height={68} radius="var(--r-card)" />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
