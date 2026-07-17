import { Skeleton } from "@mms/ui";

/**
 * Instant loading skeleton for the dine-in table picker (W2c). The page Server-fetches the table registry,
 * so a cold hit would otherwise flash blank (rubric #1). Geometry mirrors `TablePicker`: eyebrow → title →
 * a grid of table chips. Decorative (`aria-hidden`); one `sr-only` cue.
 */
export default function DineInLoading() {
  return (
    <main style={{ maxWidth: 440, margin: "0 auto", padding: "28px 20px 40px" }}>
      <span className="sr-only">Loading tables…</span>
      <div aria-hidden>
        <Skeleton width={70} height={12} radius={6} style={{ marginBottom: 12 }} />
        <Skeleton width="78%" height={30} radius={10} style={{ marginBottom: 24 }} />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 10,
          }}
        >
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} width="100%" height={84} radius={16} />
          ))}
        </div>
      </div>
    </main>
  );
}
