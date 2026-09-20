import { Skeleton } from "@mms/ui";
import { LoadingLine } from "@/components/staff/LoadingLine";

/**
 * menu-6 — the Menu screen's OWN skeleton. It fell back to `app/staff/loading.tsx`, the counter's
 * 1080 geometry with no bar, so every tap on the Menu door landed the bar and a 640 column on top
 * of a different layout. This mirrors `menu/page.tsx`: the bar (a circle, the title, the print and
 * Lock circles), the 640 column, the two-line lead, the search label and its 48px field, then six
 * 85px rows. The one announced line is the dictionary's, in the console's tongue.
 */
export default function MenuLoading() {
  return (
    <main className="staff-main">
      <LoadingLine what="what.menuPrices" />
      <div aria-hidden>
        <div className="staff-bar">
          <Skeleton width={44} height={44} radius={999} />
          <Skeleton width={180} height={30} radius={8} />
          <div className="staff-bar-tail">
            <Skeleton width={44} height={44} radius={999} />
            <Skeleton width={44} height={44} radius={999} />
          </div>
        </div>
        <div className="staff-col" style={{ maxWidth: 640, margin: "0 auto" }}>
          <Skeleton width="92%" height={14} radius={6} style={{ marginBottom: 6 }} />
          <Skeleton width="70%" height={14} radius={6} style={{ marginBottom: "var(--s6)" }} />
          <Skeleton width={90} height={14} radius={6} style={{ marginBottom: "var(--s2)" }} />
          <Skeleton height={48} radius="var(--r-sm)" style={{ marginBottom: "var(--s4)" }} />
          <div style={{ display: "grid", gap: "var(--s2)" }}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} height={85} radius="var(--r-card)" />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
