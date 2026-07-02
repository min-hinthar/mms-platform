import { Skeleton } from "@mms/ui";

/**
 * Instant loading skeleton streamed on navigation to /cart while the Server Component awaits
 * `getCartView` — so opening the cart shows its structure immediately instead of a blank, frozen
 * screen (rubric #1 perceived performance; pairs with the CartBar route prefetch). Geometry mirrors
 * the checkout: title → line rows (thumb + two bars + qty pill) → a summary card with a CTA.
 * Decorative (`aria-hidden` skeletons); a single `sr-only` string gives an SR load cue with no live region.
 */
export default function CartLoading() {
  return (
    <main style={{ padding: 24, maxWidth: 440, margin: "0 auto" }}>
      <span className="sr-only">Loading your order…</span>
      <div aria-hidden>
        <Skeleton width={150} height={30} radius={8} style={{ margin: "0 0 22px" }} />
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
            <Skeleton width={56} height={56} radius={14} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <Skeleton width="68%" height={15} style={{ marginBottom: 9 }} />
              <Skeleton width="40%" height={12} />
            </div>
            <Skeleton width={92} height={40} radius={999} />
          </div>
        ))}
        <div className="card" style={{ padding: 18, marginTop: 22 }}>
          <Skeleton width="100%" height={13} style={{ marginBottom: 13 }} />
          <Skeleton width="100%" height={13} style={{ marginBottom: 13 }} />
          <Skeleton width="55%" height={13} style={{ marginBottom: 20 }} />
          <Skeleton width="100%" height={48} radius={14} />
        </div>
      </div>
    </main>
  );
}
