import { Skeleton } from "@mms/ui";

/** Instant skeleton for the KDS — full-bleed Night board: header strip then the ticket grid (matches
 *  the W3 kds-root geometry so the swap to live tickets doesn't jump). */
export default function ConsoleLoading() {
  return (
    <main>
      <div className="kds-root dark">
        <span className="sr-only">Loading the kitchen queue…</span>
        <div aria-hidden>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              paddingBottom: 8,
              borderBottom: "1px solid var(--bd)",
              marginBottom: 12,
            }}
          >
            <Skeleton width={110} height={26} radius={8} />
            <Skeleton width={220} height={40} radius={10} />
            <span style={{ marginLeft: "auto", display: "inline-flex", gap: 8 }}>
              <Skeleton width={64} height={44} radius={999} />
              <Skeleton width={64} height={44} radius={999} />
              <Skeleton width={120} height={44} radius={999} />
            </span>
          </div>
          <div
            style={{
              display: "grid",
              gap: 12,
              gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))",
            }}
          >
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height={240} radius={12} />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
