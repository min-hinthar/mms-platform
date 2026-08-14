import { Skeleton } from "@mms/ui";

/** Instant skeleton for /account — title → identity card → Stars ring → tier row → history rows.
 *  Mirrors the page geometry (W14: incl. the identity card + 44px history thumbs) so the swap
 *  doesn't shift layout for signed-in returners. Decorative + one sr-only cue. */
export default function AccountLoading() {
  return (
    <main style={{ padding: 24, maxWidth: 480, margin: "0 auto" }}>
      <span className="sr-only">Loading your rewards…</span>
      <div aria-hidden>
        <Skeleton width={190} height={30} radius={8} style={{ margin: "0 0 20px" }} />
        {/* W14 — the identity card (avatar + name/tenure lines + action row). */}
        <div className="card" style={{ padding: 18, marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
            <Skeleton circle height={48} />
            <div style={{ flex: 1 }}>
              <Skeleton width="45%" height={16} style={{ marginBottom: 7 }} />
              <Skeleton width="60%" height={11} />
            </div>
          </div>
          <Skeleton width="70%" height={26} radius={999} />
        </div>
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
        {/* History rows — the W14 shape: 44px lead thumb + two text lines. */}
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ display: "flex", gap: 11, alignItems: "center", marginBottom: 12 }}>
            <Skeleton width={44} height={44} radius={10} />
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
