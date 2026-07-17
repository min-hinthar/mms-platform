import { Skeleton } from "@mms/ui";

/**
 * Instant loading skeleton for the menu (W2c). /menu is cookie-dynamic (the session mode + table ride the
 * request), so a cold navigation Server-renders on demand — without this the diner stares at a blank frame
 * while `getMenu` resolves (rubric #1 perceived performance; the perennial laggard). Geometry mirrors
 * `MenuBrowser`: header (eyebrow + title) → sticky toolbar (search pill + category rail) → grouped item
 * rows (88px thumb + two text bars + price). Decorative (`aria-hidden`); one `sr-only` cue, no live region.
 */
export default function MenuLoading() {
  return (
    <main style={{ maxWidth: 440, margin: "0 auto", paddingBottom: 96 }}>
      <span className="sr-only">Loading the menu…</span>
      <div aria-hidden>
        <header style={{ padding: "44px 20px 4px" }}>
          <Skeleton width={90} height={12} radius={6} style={{ marginBottom: 12 }} />
          <Skeleton width="62%" height={34} radius={10} />
        </header>
        <div style={{ padding: "12px 20px 4px" }}>
          <Skeleton width="100%" height={44} radius={999} style={{ marginBottom: 14 }} />
          <div style={{ display: "flex", gap: 8 }}>
            {[64, 52, 72, 58].map((w, i) => (
              <Skeleton key={i} width={w} height={34} radius={999} />
            ))}
          </div>
        </div>
        <div style={{ padding: "18px 20px 0" }}>
          <Skeleton width={120} height={18} radius={6} style={{ margin: "6px 0 14px" }} />
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 18 }}
            >
              <Skeleton width={88} height={88} radius={14} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <Skeleton width="66%" height={16} style={{ marginBottom: 9 }} />
                <Skeleton width="44%" height={12} style={{ marginBottom: 12 }} />
                <Skeleton width={52} height={14} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
