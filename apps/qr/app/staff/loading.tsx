import { Skeleton } from "@mms/ui";
import { LoadingLine } from "@/components/staff/LoadingLine";

/**
 * Instant skeleton for the counter's one screen (A4·2) — the page's OWN geometry (counter-9), so
 * the hydrated screen lands where the skeleton stood instead of shifting under a thumb: the staff
 * bar (a circle, the title, the trailing circles), the column at the page's width, the greeting
 * line, then the three zones in the order the page lays them out — a heading with its sub-line
 * over the two Start controls, a heading over the table strip and the card grid, a heading over the
 * bag grid. Every gap is the
 * class the live page wears (`.staff-bar` · `.staff-col` · `.staff-zone`) or a `--s*` token. The
 * one announced line is `<LoadingLine>` — the dictionary's, in the console's tongue, read from the
 * layout's provider so the boundary stays synchronous.
 */
export default function StaffLoading() {
  return (
    <main className="staff-main">
      <LoadingLine what="what.floor" />
      <div aria-hidden>
        <div className="staff-bar">
          <Skeleton width={44} height={44} radius={999} />
          <Skeleton width={180} height={30} radius={8} />
          <div className="staff-bar-tail">
            <Skeleton width={44} height={44} radius={999} />
            <Skeleton width={44} height={44} radius={999} />
          </div>
        </div>
        <div className="staff-col" style={{ maxWidth: 1080 }}>
          <Skeleton width={220} height={22} radius={6} style={{ margin: "0 0 var(--s4)" }} />
          {/* 1 · START — heading, sub-line, then Walk-up and the Phone order arm in the zone's own
              grid (`.reg-start`: stacked on a phone, 2fr 1fr from 48em — the skeleton cannot drift
              from the zone). Phase 2d · floor: two, not three — a table starts from the strip. */}
          <div className="staff-zone">
            <Skeleton width={150} height={22} radius={6} />
            <Skeleton width={260} height={14} radius={6} />
            <div className="reg-start">
              <Skeleton height="var(--tap-bump)" radius="var(--r-sm)" />
              <Skeleton height="var(--tap-bump)" radius="var(--r-sm)" />
            </div>
          </div>
          {/* 2 · TABLES & COUNTER ORDERS — the heading, the strip (its label over ten tiles in the
              strip's own grid, 5×2 on a phone), then the card grid. */}
          <div className="staff-zone">
            <Skeleton width={230} height={22} radius={6} />
            <Skeleton width={240} height={14} radius={6} />
            <div className="floor-strip">
              {Array.from({ length: 10 }, (_, i) => (
                <Skeleton key={i} height="var(--tap-bump)" radius="var(--r-sm)" />
              ))}
            </div>
            <div style={cardGrid}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} height={118} radius="var(--r-card)" />
              ))}
            </div>
          </div>
          {/* 3 · TO-GO BAGS */}
          <div className="staff-zone">
            <Skeleton width={170} height={22} radius={6} />
            <div style={bagGrid}>
              {[0, 1].map((i) => (
                <Skeleton key={i} height={150} radius="var(--r-card)" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

const cardGrid = {
  display: "grid",
  gap: "var(--s3)",
  gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 18rem), 1fr))",
} as const;
const bagGrid = {
  display: "grid",
  gap: "var(--s3)",
  gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))",
} as const;
