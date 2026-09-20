import { Skeleton } from "@mms/ui";
import { LoadingLine } from "@/components/staff/LoadingLine";

/**
 * menu-6 — the word-check sheet's OWN skeleton. Mirrors `glossary/page.tsx` after gloss-1: the bar
 * (the back pill, the title, the print and Lock circles), the 940 column, the head's lede and
 * count, then a table block. The one announced line is the dictionary's.
 */
export default function GlossaryLoading() {
  return (
    <main className="staff-main">
      <LoadingLine what="what.glossary" />
      <div aria-hidden>
        <div className="staff-bar">
          <Skeleton width={96} height={44} radius={999} />
          <Skeleton width={180} height={30} radius={8} />
          <div className="staff-bar-tail">
            <Skeleton width={44} height={44} radius={999} />
            <Skeleton width={44} height={44} radius={999} />
          </div>
        </div>
        <div className="staff-col" style={{ maxWidth: 940 }}>
          <Skeleton width="80%" height={16} radius={6} style={{ marginBottom: 8 }} />
          <Skeleton width={220} height={14} radius={6} style={{ marginBottom: "var(--s5)" }} />
          <Skeleton height={44} radius={6} style={{ marginBottom: "var(--s2)" }} />
          <div style={{ display: "grid", gap: 2 }}>
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <Skeleton key={i} height={40} radius={4} />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
