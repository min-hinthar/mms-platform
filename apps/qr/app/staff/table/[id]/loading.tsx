import { Skeleton } from "@mms/ui";
import { LoadingLine } from "@/components/staff/LoadingLine";

/**
 * Instant skeleton for the table drill-down — the floor→table tap previously froze on the old view
 * while 5 fetches ran. Mirrors `FloorDetailLive` under P7·1b in its OWN geometry (manager-8): the
 * staff bar (a circle, the title, the trailing controls) → the header's chip row and sub-line → the
 * party card (its heading, ~30px guest chips) → the order card (its heading, three line rows of a
 * name and its meta beside a 44px note pill and the 44px stepper pair), on the 640 column the live
 * view uses, every gap a `--s*` token. The one announced line is the dictionary's (`<LoadingLine>`).
 */
export default function TableDetailLoading() {
  return (
    <main className="staff-main">
      <LoadingLine what="what.table" />
      <div aria-hidden>
        <div className="staff-bar">
          <Skeleton width={44} height={44} radius={999} />
          <Skeleton width={180} height={30} radius={8} />
          <div className="staff-bar-tail">
            <Skeleton width={152} height={44} radius={999} />
            <Skeleton width={44} height={44} radius={999} />
          </div>
        </div>
        <div className="staff-col" style={{ maxWidth: 640, margin: "0 auto" }}>
          <div style={{ marginBottom: "var(--s5)" }}>
            <div style={{ display: "flex", gap: "var(--s3)", flexWrap: "wrap" }}>
              <Skeleton width={96} height={24} radius="var(--r-full)" />
              <Skeleton width={120} height={24} radius="var(--r-full)" />
            </div>
            <Skeleton width={220} height={14} radius={6} style={{ marginTop: "var(--s2)" }} />
          </div>
          <div className="card" style={sectionCard}>
            <Skeleton width={70} height={14} radius={6} style={{ marginBottom: "var(--s3)" }} />
            <div style={{ display: "flex", gap: "var(--s3)", flexWrap: "wrap" }}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} width={80} height={30} radius="var(--r-full)" />
              ))}
            </div>
          </div>
          <div className="card" style={sectionCard}>
            <Skeleton width={110} height={14} radius={6} style={{ marginBottom: "var(--s3)" }} />
            {[0, 1, 2].map((i) => (
              <div key={i} style={lineRow}>
                <div style={{ flex: 1 }}>
                  <Skeleton width="60%" height={14} radius={6} style={{ marginBottom: 6 }} />
                  <Skeleton width="30%" height={11} radius={6} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--s3)" }}>
                  <Skeleton width={90} height={44} radius="var(--r-full)" />
                  <Skeleton width={44} height={44} radius={999} />
                  <Skeleton width={44} height={44} radius={999} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

const sectionCard = { padding: "var(--s5)", marginBottom: "var(--s4)" } as const;
const lineRow = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--s4)",
  padding: "8px 0",
} as const;
