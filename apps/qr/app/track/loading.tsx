import { Skeleton } from "@mms/ui";

/**
 * Instant loading skeleton for /track (W2c). The page resolves the order by PaymentIntent/order id before
 * the tracker mounts; without this the post-pay hand-off flashes blank (rubric #1 — the worst moment for a
 * void, right after the diner paid). Geometry mirrors `OrderTracker`: eyebrow + title + status chip, then
 * the 4-step timeline (dot + rail + two text bars). Decorative (`aria-hidden`); one `sr-only` cue.
 */
export default function TrackLoading() {
  return (
    <main style={{ padding: "24px 20px 40px", maxWidth: 440, margin: "0 auto" }}>
      <span className="sr-only">Loading your order…</span>
      <div aria-hidden>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <div>
            <Skeleton width={60} height={12} radius={6} style={{ marginBottom: 8 }} />
            <Skeleton width={150} height={30} radius={10} />
          </div>
          <Skeleton width={104} height={26} radius={999} />
        </div>
        <ul style={{ listStyle: "none", padding: "24px 4px 0", margin: 0 }}>
          {[0, 1, 2, 3].map((i) => (
            <li key={i} style={{ display: "flex", gap: 14 }}>
              <div
                style={{
                  width: 30,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                }}
              >
                <Skeleton width={18} height={18} circle />
                {i < 3 && (
                  <Skeleton width={2} height={34} radius={2} style={{ margin: "2px 0" }} />
                )}
              </div>
              <div style={{ paddingBottom: 18, flex: 1 }}>
                <Skeleton width="42%" height={15} style={{ marginBottom: 7 }} />
                <Skeleton width="28%" height={12} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
