import { Skeleton } from "@mms/ui";

/**
 * Instant loading skeleton for /grocery (W2c). The page resolves the scan-and-go cart before the scanner
 * mounts; a cold hit would otherwise flash blank (rubric #1). Geometry mirrors the scan surface: header →
 * scanner viewport → a couple of basket rows (56px thumb + name + stepper) → the giant running total.
 * Decorative (`aria-hidden`); one `sr-only` cue.
 */
export default function GroceryLoading() {
  return (
    <main style={{ maxWidth: 440, margin: "0 auto", padding: 20, paddingBottom: 120 }}>
      <span className="sr-only">Loading your basket…</span>
      <div aria-hidden>
        <Skeleton width={70} height={12} radius={6} style={{ marginBottom: 12 }} />
        <Skeleton width="66%" height={30} radius={10} style={{ marginBottom: 8 }} />
        <Skeleton width="90%" height={13} style={{ marginBottom: 18 }} />
        {/* scanner viewport */}
        <Skeleton width="100%" height={220} radius={18} style={{ marginBottom: 18 }} />
        {/* basket rows */}
        {[0, 1].map((i) => (
          <div
            key={i}
            className="card"
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              padding: 12,
              marginBottom: 12,
            }}
          >
            <Skeleton width={56} height={56} radius={12} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <Skeleton width="62%" height={15} style={{ marginBottom: 8 }} />
              <Skeleton width="38%" height={12} />
            </div>
            <Skeleton width={92} height={40} radius={999} />
          </div>
        ))}
        {/* running total */}
        <Skeleton width="100%" height={72} radius={16} style={{ marginTop: 8 }} />
      </div>
    </main>
  );
}
