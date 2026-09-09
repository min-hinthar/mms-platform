/**
 * A1 — the tenders the REGISTER records. `qr_orders.tender` is `'card' | 'cash' | 'terminal'`
 * (`mms_fulfill_cash_order` writes cash; the Terminal path writes terminal). Named once so the
 * member-gated order resolver and the receipt agree on which orders "settled at the counter".
 */
export const COUNTER_TENDERS = ["cash", "terminal"] as const;
export type CounterTender = (typeof COUNTER_TENDERS)[number];
