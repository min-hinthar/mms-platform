import { Skeleton } from "@mms/ui";

/** Instant skeleton for /account (rewards hub) — title → Stars ring → tier row → history rows.
 *  Mirrors the hub geometry so the swap doesn't shift layout; decorative + one sr-only cue. */
export default function AccountLoading() {
  return (
    <main style={{ padding: "24px 20px 40px", maxWidth: 440, margin: "0 auto" }}>
      <span className="sr-only">Loading your rewards…</span>
      <div aria-hidden>
        <Skeleton width={190} height={30} radius={8} style={{ margin: "0 0 20px" }} />
        <div
          className="card"
          style={{ padding: 18, display: "grid", placeItems: "center", gap: 12 }}
        >
          <Skeleton circle height={148} />
          <Skeleton width={140} height={14} />
        </div>
        <div style={{ display: "flex", gap: 8, margin: "14px 0" }}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={54} radius={12} style={{ flex: 1 }} />
          ))}
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
            <Skeleton width={40} height={40} radius={12} />
            <div style={{ flex: 1 }}>
              <Skeleton width="55%" height={14} style={{ marginBottom: 7 }} />
              <Skeleton width="35%" height={11} />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
