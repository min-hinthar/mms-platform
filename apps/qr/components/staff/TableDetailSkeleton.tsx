import { Skeleton } from "@mms/ui";

/**
 * Phase 2d · split — the table drill-down's BODY skeleton, drawn once for two hosts: the full
 * page's loading boundary (`app/staff/table/[id]/loading.tsx`, inside its 640 column) and the
 * counter's pane while a table's first read is in the air. The header's chip row and sub-line → the
 * party card (its heading, ~30px guest chips) → the order card (its heading, three line rows of a
 * name and its meta beside a 44px note pill and the 44px stepper pair), every gap a `--s*` token.
 * Decorative: the host carries the one announced loading line.
 */
export function TableDetailSkeleton() {
  return (
    <>
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
    </>
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
