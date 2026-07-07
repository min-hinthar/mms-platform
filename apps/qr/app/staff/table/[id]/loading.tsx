import { Skeleton } from "@mms/ui";

/** Instant skeleton for the table drill-down — the floor→table tap previously froze on the old view
 *  while 5 fetches ran. Mirrors FloorDetailLive: back link → header → party card → order card. */
export default function TableDetailLoading() {
  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "24px 20px 60px" }}>
      <span className="sr-only">Loading the table…</span>
      <div aria-hidden>
        <Skeleton width={64} height={16} radius={6} style={{ margin: "0 0 14px" }} />
        <Skeleton width={200} height={28} radius={8} style={{ margin: "0 0 20px" }} />
        <div className="card" style={{ padding: 16, marginBottom: 14 }}>
          <Skeleton width={70} height={15} style={{ marginBottom: 12 }} />
          <div style={{ display: "flex", gap: 8 }}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} width={88} height={36} radius={999} />
            ))}
          </div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <Skeleton width={110} height={15} style={{ marginBottom: 14 }} />
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}
            >
              <div style={{ flex: 1 }}>
                <Skeleton width="60%" height={14} style={{ marginBottom: 7 }} />
                <Skeleton width="30%" height={11} />
              </div>
              <Skeleton width={110} height={38} radius={999} />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
