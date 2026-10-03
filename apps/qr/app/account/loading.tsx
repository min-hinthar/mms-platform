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
 * Instant skeleton for /account (Phase 3a · the hub): masthead → the three tabs → the Orders panel's
 * history card — the page's own order on the common cold visit (no `?tab=`, nothing live).
 *
 * ⚠️ The match holds only for that visit. A live order adds "Your live orders" ABOVE the history, a
 * guest adds the one-line save door, and `?tab=rewards` / `?tab=you` open a different panel — a
 * placeholder for any of those here would move the far more common visit instead (§14: a skeleton
 * that guesses at data it does not have is a guess wearing recognition’s clothes). The optional
 * recognition line ("Mingalaba, …") likewise adds a line the skeleton cannot know about.
 *
 * The masthead is modelled line for line (kicker, title, Burmese line, the two-line lede at phone
 * width, the gold rule) because the old single 30px bar under-stood a ~180px block and the whole page
 * jumped on the swap; the tab row is three 44px pills in the hub's own grid (`.account-tabs`); the
 * history card is the W14 row shape. The heights are DERIVED from the type/spacing tokens, not
 * measured on a device — the preview measurement (390×844 · 375×667 · 320) is an open item.
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
        {/* Phase 3a — the hub's tab row: three pills, the hub's own grid and gap. */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: "var(--s2)",
            margin: "0 0 var(--s5)",
          }}
        >
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={44} radius={999} />
          ))}
        </div>
        {/* The Orders panel's history card: its uppercase heading, then the rows. */}
        <div className="card" style={{ padding: "var(--s5)", marginBottom: "var(--s4)" }}>
          <Skeleton width={110} height={11} style={{ marginBottom: 12 }} />
          {/* History rows — the W14 shape: 44px lead thumb + two text lines. */}
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{ display: "flex", gap: 11, alignItems: "center", marginBottom: 12 }}
            >
              <Skeleton width={44} height={44} radius={10} />
              <div style={{ flex: 1 }}>
                <Skeleton width="55%" height={14} style={{ marginBottom: 7 }} />
                <Skeleton width="35%" height={11} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
