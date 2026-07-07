import { Skeleton } from "@mms/ui";

/** Instant skeleton for the expo console — heading row then ticket-card grid (the shared board shape). */
export default function ConsoleLoading() {
  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "24px 20px 60px" }}>
      <span className="sr-only">Loading the takeaway bags…</span>
      <div aria-hidden>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 16,
          }}
        >
          <Skeleton width={140} height={22} radius={8} />
          <Skeleton width={90} height={14} radius={6} />
        </div>
        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))",
          }}
        >
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={150} radius={20} />
          ))}
        </div>
      </div>
    </main>
  );
}
