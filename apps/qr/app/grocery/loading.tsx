import { Skeleton } from "@mms/ui";

/**
 * Instant loading skeleton for /grocery (W2c; Phase 1c geometry). It mirrors the DEFAULT door —
 * Browse, the market home — so the swap does not jump: the eyebrow and the one-line title (the §21
 * masthead), the Browse|Scan pill, the search field, the EBT line, four aisle-rail pills and one
 * shelf (its heading + 2.4 cards on a phone). Radii from the tokens. Decorative (`aria-hidden`); one
 * `sr-only` cue.
 */
export default function GroceryLoading() {
  return (
    <main className="page-col" style={{ padding: 20, paddingBottom: 120 }}>
      <span className="sr-only">Loading your basket…</span>
      <div aria-hidden>
        {/* masthead: eyebrow + --fs-h1 title */}
        <Skeleton width={96} height={11} radius="var(--r-full)" style={{ marginBottom: 8 }} />
        <Skeleton width="58%" height={26} style={{ marginBottom: 12 }} />
        {/* toolbar: the Browse|Scan pill + the search field */}
        <Skeleton width="100%" height={54} radius="var(--r-full)" style={{ marginBottom: 10 }} />
        <Skeleton width="100%" height={48} radius="var(--r-full)" style={{ marginBottom: 12 }} />
        {/* the EBT line */}
        <Skeleton width="76%" height={12} radius="var(--r-full)" style={{ marginBottom: 14 }} />
        {/* the aisle rail */}
        <div style={{ display: "flex", gap: 8, overflow: "hidden", marginBottom: 20 }}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} width={i === 0 ? 112 : 132} height={44} radius="var(--r-full)" />
          ))}
        </div>
        {/* one shelf: heading + 2.4 cards */}
        <Skeleton width="48%" height={18} style={{ marginBottom: 12 }} />
        <div
          style={{
            display: "grid",
            gridAutoFlow: "column",
            gridAutoColumns: "calc((100% - 2 * var(--s2)) / 2.4)",
            gap: "var(--s2)",
            overflow: "hidden",
          }}
        >
          {[0, 1, 2].map((i) => (
            <div key={i} className="card" style={{ padding: 8 }}>
              <Skeleton
                width="100%"
                height={132}
                radius="var(--r-sm)"
                style={{ marginBottom: 8 }}
              />
              <Skeleton width="85%" height={14} style={{ marginBottom: 6 }} />
              <Skeleton width="55%" height={12} />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
