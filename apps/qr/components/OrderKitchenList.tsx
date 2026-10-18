import { useId, type CSSProperties } from "react";
import { KitchenTrack } from "@mms/ui";
import { DINER_STAGE_WORD } from "@/lib/line-state-copy";
import type { KitchenRow } from "@/lib/order-kitchen";

/**
 * Lifecycle audit (2026-10-13), A — the paid dine-in table's dishes on /track, each on the ONE
 * KITCHEN TRACK with its word (`DINER_STAGE_WORD`: "Sent to kitchen · ပို့ပြီး", "Cooking ·
 * ချက်နေဆဲ", "Served · ထုတ်ပြီး" — the family's console words, what Mom's board and the TV wall say
 * about the same dish). The rows come from `kitchenRows` (lib/order-kitchen.ts); this only draws them.
 *
 * Themed, not a pass: it sits inside the settled card on the page's own surface (`surface="theme"`,
 * TableTimeline's detail idiom), so it takes the theme inks in both themes. a11y: not a live region —
 * kitchen progress is ambient (the view keeps its one `role="status"`); the visible word carries each
 * row's state and the segments are decorative; the list is named by its heading. Rows stay in cart
 * order, never re-sorted under a thumb, and nothing animates (a stage change is a static redraw).
 */
export function OrderKitchenList({ rows }: { rows: KitchenRow[] }) {
  const headingId = useId();
  if (rows.length === 0) return null;
  return (
    <div style={wrap}>
      <p id={headingId} className="eyebrow" style={{ margin: 0 }}>
        From the kitchen
      </p>
      <ul role="list" aria-labelledby={headingId} style={list}>
        {rows.map((r) => (
          <li key={r.id} style={row}>
            <span style={name}>
              {r.qty > 1 && <span style={{ fontVariantNumeric: "tabular-nums" }}>{r.qty} × </span>}
              {r.name}
            </span>
            <KitchenTrack
              stage={r.stage}
              size="glyph"
              surface="theme"
              word={DINER_STAGE_WORD[r.stage]}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

const wrap: CSSProperties = {
  marginTop: 12,
  paddingTop: 10,
  borderTop: "1px solid var(--bd)",
};
const list: CSSProperties = {
  listStyle: "none",
  margin: "6px 0 0",
  padding: 0,
  display: "grid",
  gap: 8,
};
const row: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
  columnGap: 12,
  rowGap: 2,
  fontSize: "var(--fs-sm)",
};
const name: CSSProperties = { color: "var(--tx)", minWidth: 0 };
