/**
 * W22r — the tracked-order shape, ONCE. `useOrderStatus` (the live browser read) and
 * `getMyOrderFallback`'s two server reads (lib/orders.ts) deliberately render the SAME field set
 * so the tracker treats a fallback snapshot identically to a live row — pre-W22r that contract
 * was three hand-copied select strings + three hand-copied mappers, which is exactly how shapes
 * drift. One select, one mapper, three call sites.
 *
 * Pure module: no "use client", no server-only — both sides import it.
 *
 * Money discipline: every cent field is the fulfillment-time snapshot carried VERBATIM (the
 * tracker renders them through lib/receipt-view's builders; nothing recomputes). Lines sum to
 * subtotal_cents — tax/tip/discount ride the order-level columns (M7: ONE tax row, never
 * per-line).
 */
import type { ReceiptBreakdownish } from "./receipt-view";
import { summarizeRefund, type RefundSummary } from "./refund-view";

/** The embedded-items select shared by all three reads. Items are immutable post-fulfillment,
 *  so the realtime-triggered re-fetch stays coherent. ONE string literal on purpose — a
 *  runtime-concatenated select defeats PostgREST's static type parser (GenericStringError). */
export const TRACK_ORDER_SELECT =
  "id,status,total_cents,refunded_cents,subtotal_cents,discount_cents,service_charge_cents,tax_cents,tip_cents,tender,created_at,table_number,pickup_slot,customer_name,togo_status,arrived_at,togo_ready_at,togo_picked_up_at,qr_order_items(id,name,qty,unit_price_cents,modifiers,fulfillment,notes,refunded_cents)";

export type TrackedLine = {
  name: string;
  qty: number;
  unitPriceCents: number;
  /** Option labels (string[] snapshot); malformed rows degrade to [] (the receipt-entry guard). */
  mods: string[];
  fulfillment: string;
  /** The line's kitchen note (≤160), or null. */
  notes: string | null;
  /** W23b — cents refunded against THIS line (0 for the overwhelming majority). Stripe knows the
   *  charge, not the line, so this attribution exists only because `mms_record_refund` wrote it. */
  refundedCents: number;
};

export type TrackedOrder = {
  id: string;
  status: string; // payment status (paid | refunded | …); kitchen lifecycle is S2
  totalCents: number;
  itemCount: number;
  pickupSlot: string | null; // set for pickup orders → /track echoes it as the honest ETA
  /** S4.3a takeaway fulfillment: null (no bag — pure dine-in) | 'preparing' | 'ready' | 'picked_up'.
   *  The expo sets it; /track lights the pickup/scango step rail from it. */
  togoStatus: string | null;
  /** J4: does the order carry to-go FOOD (a `togo` line the kitchen makes + expo bags)? */
  hasTogoFood: boolean;
  /** W9a: does the order carry DINE-IN lines? The line-fulfillment snapshot is the only mode
   *  signal that survives table-session closure — drives the mode label + back-links. */
  hasDineInFood: boolean;
  /** J5: the diner's "I'm here" stamp (null until they announce). */
  arrivedAt: string | null;
  /** J6: grocery lines present? (With hasTogoFood: identifies a PURE grocery basket.) */
  hasGrocery: boolean;
  /** K2: the registered table (1–10), or null (pickup/scango/unregistered). */
  tableNumber: number | null;
  // ── W22r detail (all snapshots, rendered verbatim) ──
  /** The itemized lines — the tracker's receipt slip shows WHAT was paid for, not just a count. */
  lines: TrackedLine[];
  /** The full money breakdown (subtotal/discount/service/tax/tip) for the slip's receipt rows. */
  breakdown: ReceiptBreakdownish;
  /** W23b — the refund state, derived ONCE here rather than in each surface that renders it. A
   *  PARTIAL refund leaves `status` at 'paid', so this is the only thing standing between a
   *  part-returned order and a slip that says "Paid in full". */
  refund: RefundSummary;
  /** How it settled ('card' | 'cash' | 'terminal') → receipt-view's tenderLabel. */
  tender: string;
  /** Fulfillment time — the slip's date line + the "Order placed" step's real timestamp. */
  createdAt: string;
  /** The pickup contact name (W21's required field), or null (dine-in/legacy). */
  customerName: string | null;
  /** Expo timestamps — REAL step times for the rail (never a fabricated ETA): when the bag was
   *  marked ready / picked up, or null while not yet. */
  togoReadyAt: string | null;
  togoPickedUpAt: string | null;
};

/** The raw row shape the shared select returns (embedded items untyped-ish from PostgREST). */
type TrackedOrderRow = {
  id: string;
  status: string;
  total_cents: number;
  refunded_cents: number | null;
  subtotal_cents: number | null;
  discount_cents: number | null;
  service_charge_cents: number | null;
  tax_cents: number | null;
  tip_cents: number | null;
  tender: string | null;
  created_at: string;
  table_number: number | null;
  pickup_slot: string | null;
  customer_name: string | null;
  togo_status: string | null;
  arrived_at: string | null;
  togo_ready_at: string | null;
  togo_picked_up_at: string | null;
  qr_order_items:
    | {
        id: string;
        name: string;
        qty: number;
        unit_price_cents: number | null;
        modifiers: unknown;
        fulfillment: string | null;
        notes: string | null;
        refunded_cents: number | null;
      }[]
    | null;
};

export function shapeTrackedOrder(data: TrackedOrderRow): TrackedOrder {
  // Deterministic line order (Codex P2 on #196): PostgREST gives an embedded relation NO defined
  // order, while getReceiptEntry sorts by id — the tracker must list the SAME receipt in the SAME
  // order as the durable page/email, and must not reshuffle on a status-triggered refetch. Sorted
  // here (not in the select) so all three call sites inherit it with the shared string. Lowercase
  // uuid text compares in the same order Postgres sorts the uuid column.
  const items = [...(data.qr_order_items ?? [])].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  const lines: TrackedLine[] = items.map((it) => {
    const raw = it.modifiers;
    const mods = Array.isArray(raw) ? raw.filter((m): m is string => typeof m === "string") : [];
    return {
      name: it.name,
      qty: it.qty,
      unitPriceCents: it.unit_price_cents ?? 0,
      mods,
      fulfillment: it.fulfillment ?? "dinein",
      notes: typeof it.notes === "string" && it.notes.trim() !== "" ? it.notes : null,
      refundedCents: it.refunded_cents ?? 0,
    };
  });
  return {
    id: data.id,
    status: data.status,
    totalCents: data.total_cents,
    itemCount: lines.reduce((a, l) => a + l.qty, 0),
    pickupSlot: data.pickup_slot ?? null,
    togoStatus: data.togo_status ?? null,
    hasTogoFood: lines.some((l) => l.fulfillment === "togo"),
    hasDineInFood: lines.some((l) => l.fulfillment === "dinein"),
    arrivedAt: data.arrived_at ?? null,
    hasGrocery: lines.some((l) => l.fulfillment === "grocery"),
    tableNumber: data.table_number ?? null,
    lines,
    breakdown: {
      subtotalCents: data.subtotal_cents ?? 0,
      discountCents: data.discount_cents ?? 0,
      serviceChargeCents: data.service_charge_cents ?? 0,
      taxCents: data.tax_cents ?? 0,
      tipCents: data.tip_cents ?? 0,
    },
    refund: summarizeRefund(data.total_cents, data.refunded_cents ?? 0, data.status),
    tender: data.tender ?? "card",
    createdAt: data.created_at,
    customerName: data.customer_name ?? null,
    togoReadyAt: data.togo_ready_at ?? null,
    togoPickedUpAt: data.togo_picked_up_at ?? null,
  };
}
