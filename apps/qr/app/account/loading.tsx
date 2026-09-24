import { Skeleton } from "@mms/ui";

/**
 * One text line of the masthead: a box exactly one LINE tall (font-size × line-height, from the SAME
 * tokens `.ui-masthead*` reads in primitives.css), with a bar the height of the glyphs centred in it.
 * Deriving the box from the tokens is what keeps this skeleton's geometry honest when the type scale
 * moves — a hand-picked pixel height is how the old 30px title bar came to stand in for a 180px block.
 */
function Line({ box, bar, width }: { box: string; bar: string; width: number | string }) {
  return (
    <div style={{ height: box, display: "flex", alignItems: "center" }}>
      <Skeleton width={width} height={bar} />
    </div>
  );
}

/**
 * Instant skeleton for /account (Phase 1c · account-star): masthead → identity card → Stars ring card →
 * history rows — the page's own order when NOTHING IS LIVE, which is the common case.
 *
 * ⚠️ The match holds only when nothing is live. A live order adds its "Your live orders" section ABOVE
 * the identity card, so that visit shifts by one section on the swap. A placeholder for it here would
 * move the far more common no-order visit instead — a skeleton that guesses at data it does not have
 * is a guess wearing recognition’s clothes (§14). The optional recognition line ("Mingalaba, …") likewise
 * adds a line the skeleton cannot know about.
 *
 * The masthead is modelled line for line (kicker, title, Burmese line, the two-line lede at phone
 * width, the gold rule) because the old single 30px bar under-stood a ~180px block and the whole page
 * jumped on the swap. The heights here are DERIVED from the type/spacing tokens, not measured on a
 * device — the preview measurement (390×844 · 375×667 · 320) is an open item. The tier row is gone:
 * the ladder now sits far below the fold (RewardsDetails), not under the ring.
 *
 * Decorative + one sr-only cue.
 */
export default function AccountLoading() {
  return (
    <main className="page-col page-col-narrow" style={{ padding: 24 }}>
      <span className="sr-only">Loading your rewards…</span>
      <div aria-hidden>
        {/* The masthead: `.ui-masthead` is a grid, gap --s2, margin-bottom --s6. */}
        <div style={{ display: "grid", gap: "var(--s2)", margin: "0 0 var(--s6)" }}>
          <Line box="calc(var(--fs-xs) * var(--lh-normal))" bar="var(--fs-xs)" width={170} />
          <Line box="calc(var(--fs-h1) * var(--lh-tight))" bar="var(--fs-h1)" width={215} />
          <Line box="calc(var(--fs-body) * var(--lh-my))" bar="var(--fs-body)" width={170} />
          {/* The lede wraps to two lines at phone width. */}
          <div>
            <Line box="calc(var(--fs-body) * var(--lh-normal))" bar="0.75em" width="100%" />
            <Line box="calc(var(--fs-body) * var(--lh-normal))" bar="0.75em" width="62%" />
          </div>
          {/* The gold rule: 1px, margin-top --s1 (`.account-masthead-rule`). */}
          <div style={{ height: 1, marginTop: "var(--s1)" }} />
        </div>
        {/* W14 — the identity card (avatar + name/tenure lines + action row). */}
        <div className="card" style={{ padding: "var(--s5)", marginBottom: "var(--s4)" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
            <Skeleton circle height={48} />
            <div style={{ flex: 1 }}>
              <Skeleton width="45%" height={16} style={{ marginBottom: 7 }} />
              <Skeleton width="60%" height={11} />
            </div>
          </div>
          <Skeleton width="70%" height={26} radius={999} />
        </div>
        {/* The Stars card: its heading, the 148px ring, the caption. */}
        <div
          className="card"
          style={{
            padding: "var(--s5)",
            marginBottom: "var(--s4)",
            display: "grid",
            placeItems: "center",
            gap: 12,
          }}
        >
          <Skeleton width={48} height={11} style={{ justifySelf: "start" }} />
          <Skeleton circle height={148} />
          <Skeleton width={140} height={14} />
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
