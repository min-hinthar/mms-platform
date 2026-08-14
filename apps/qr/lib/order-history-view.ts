import { modeFromOrder } from "./menu-href";

/**
 * W14 — the order-history card's decision logic, extracted from the `.tsx` (M46: no `.test.tsx`
 * runner exists, so any rule living inline in a component is unguarded by construction — this
 * module is where the month grouping, fulfillment precedence, lead-photo pick, and the reorder
 * destination become pinnable).
 *
 * Structural input types (not the rewards read-model) so the suite needs no server import and the
 * rules stay reusable for any order-shaped row.
 */

export type HistoryLineish = {
  qty: number;
  name: string;
  fulfillment: string;
  imageUrl?: string | null;
};

// The Covina teahouse's local time — month grouping reflects the RESTAURANT's day regardless of
// the server's timezone (Vercel runs UTC), so an evening order never drifts into the next month.
const TZ = "America/Los_Angeles";
const fmtMonth = new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "long", year: "numeric" });

/** Group already-newest-first entries into contiguous month sections, keeping each entry's global
 *  index (the entrance-stagger delay key). */
export function groupByMonth<T extends { createdAt: string }>(
  entries: T[],
): { label: string; orders: { e: T; gIndex: number }[] }[] {
  const groups: { label: string; orders: { e: T; gIndex: number }[] }[] = [];
  entries.forEach((e, gIndex) => {
    const label = fmtMonth.format(new Date(e.createdAt));
    const last = groups[groups.length - 1];
    if (!last || last.label !== label) groups.push({ label, orders: [{ e, gIndex }] });
    else last.orders.push({ e, gIndex });
  });
  return groups;
}

/** The chip-row's fulfillment kind: grocery wins (the basket defines the trip), then to-go; plain
 *  dine-in renders no chip. (The precedence the component always used, now pinned.) */
export function fulfillKind(lines: readonly HistoryLineish[]): "grocery" | "togo" | null {
  if (lines.some((l) => l.fulfillment === "grocery")) return "grocery";
  if (lines.some((l) => l.fulfillment === "togo")) return "togo";
  return null;
}

/** Total units across the order's lines. */
export function itemCount(lines: readonly HistoryLineish[]): number {
  return lines.reduce((a, l) => a + l.qty, 0);
}

/** The collapsed row's one-line summary ("2× Mohinga · 1× Milk tea"), or an em-dash when the
 *  items read failed (never an empty string — the row keeps its shape). */
export function lineSummary(lines: readonly HistoryLineish[]): string {
  return lines.map((l) => `${l.qty}× ${l.name}`).join(" · ") || "—";
}

/** W14 — the summary row's lead photo: the first line that HAS one (photos are sparse until W2a's
 *  real-photography pass; "first line strictly" would waste the slot on a photo-less lead), else
 *  null → the designed PhotoPlaceholder. */
export function leadImage(lines: readonly HistoryLineish[]): string | null {
  for (const l of lines) if (l.imageUrl) return l.imageUrl;
  return null;
}

export type ReorderLink = { kind: "reorder"; href: string } | { kind: "market"; href: "/grocery" };

/**
 * W14 (closes OPEN-ITEMS J19's mode half) — the "Order this again" destination, derived from the
 * order's OWN line snapshot via `modeFromOrder` instead of a bare guess:
 *
 * - **Pure grocery** → the market itself. `reorderOrder` deliberately skips grocery lines (a
 *   scanned basket can't be rebuilt from home), so the old `/menu?reorder=` link re-ran a reorder
 *   that returned nothing — a promise the code never kept.
 * - **Everything else** → the pickup door (`mode=pickup`), the one always-safe food entry (W5f).
 *   A historical DINE-IN order is deliberately DEMOTED to pickup: this link can't know whether
 *   the device still holds that table's session, and `mode=dinein` with no live code would mint a
 *   phantom host table — paid food firing to a table nobody sits at. A diner who IS at the table
 *   reorders from the menu they're already on.
 */
export function reorderLink(o: {
  id: string;
  pickupSlot: string | null;
  tableNumber: number | null;
  lines: readonly HistoryLineish[];
}): ReorderLink {
  // PURE grocery wins outright (review LOW-4): a table-stamped grocery-only order would read as
  // dine-in through modeFromOrder's tableNumber signal, but reorderOrder skips every grocery
  // line — the market is the only destination that doesn't re-run an empty reorder.
  if (o.lines.length > 0 && o.lines.every((l) => l.fulfillment === "grocery"))
    return { kind: "market", href: "/grocery" };
  const mode = modeFromOrder({
    pickupSlot: o.pickupSlot,
    tableNumber: o.tableNumber,
    hasDineInFood: o.lines.some((l) => l.fulfillment === "dinein"),
    hasGrocery: o.lines.some((l) => l.fulfillment === "grocery"),
    hasTogoFood: o.lines.some((l) => l.fulfillment === "togo"),
  });
  if (mode === "scango") return { kind: "market", href: "/grocery" };
  return { kind: "reorder", href: `/menu?reorder=${encodeURIComponent(o.id)}&mode=pickup` };
}
