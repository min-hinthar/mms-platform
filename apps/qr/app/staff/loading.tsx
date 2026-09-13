import { Skeleton } from "@mms/ui";

/**
 * Instant skeleton for the counter's one screen (A4·2) — the zones in the order the page lays them
 * out (a heading, the three start buttons, a heading over a card grid, a heading over a second grid)
 * so the hydrated page lands where the skeleton stood instead of shifting under a thumb.
 */
export default function StaffLoading() {
  return (
    <main style={{ maxWidth: 1080, margin: "0 auto", padding: "var(--s6)" }}>
      <span className="sr-only">Loading the floor…</span>
      <div aria-hidden style={{ display: "grid", gap: 18 }}>
        <Skeleton width={150} height={26} radius={8} />
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} width={132} height={48} radius={10} />
          ))}
        </div>
        <Skeleton width={230} height={26} radius={8} style={{ marginTop: 12 }} />
        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))",
          }}
        >
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={118} radius={20} />
          ))}
        </div>
        <Skeleton width={170} height={26} radius={8} style={{ marginTop: 12 }} />
        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))",
          }}
        >
          {[0, 1].map((i) => (
            <Skeleton key={i} height={150} radius={20} />
          ))}
        </div>
      </div>
    </main>
  );
}
