import { Skeleton } from "@mms/ui";

/** Instant skeleton for the staff floor — header row then table-card grid (mirrors FloorBoard). */
export default function StaffLoading() {
  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "24px 20px 60px" }}>
      <span className="sr-only">Loading the floor…</span>
      <div aria-hidden>
        <Skeleton width={150} height={26} radius={8} style={{ margin: "0 0 18px" }} />
        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 260px), 1fr))",
          }}
        >
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} height={118} radius={20} />
          ))}
        </div>
      </div>
    </main>
  );
}
