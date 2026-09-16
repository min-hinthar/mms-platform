import type { serviceClient } from "@mms/db/server";

/**
 * M219 — the refund ledger since the service-day floor, READ COMPLETELY.
 *
 * `mms_refunds` is asked the same question by two screens, and both were answering from whatever
 * PostgREST felt like returning: the settled list ranked today's refunded orders by their latest
 * ledger row, and the register's drawer needs the cash rows to net what the till paid out. PostgREST
 * caps a response at its max-rows (1000 by default) with `error` still null — so an unpaged read is
 * a SILENT subset, and a ranking or a sum over a subset is wrong without saying so.
 *
 * So the read lives here once, paged, and both callers use it. The paging is `getDayCashSummary`'s,
 * deliberately: ordered by `created_at` AND `id`, because `created_at` alone orders tied rows
 * differently across page boundaries, which duplicates or drops money rows (W21d). A short page ends
 * it.
 *
 * ⚠️ NOT a place to be clever about filtering by tender. The settled list needs every row (a card
 * refund still means the order's money moved today) and the drawer needs only the cash ones; doing
 * the split HERE would mean two reads of one table, which is how the two screens disagreed about the
 * same day in the first place. One read, both answers.
 */
export type LedgerRow = {
  orderId: string;
  orderItemId: string | null;
  amountCents: number;
  /** M218 — how the money went BACK: 'cash' left the drawer, 'card' never touched it. */
  tender: string;
  createdAt: string;
};

const PAGE = 1000;

type Db = ReturnType<typeof serviceClient>;

/** Every ledger row since `sinceIso`, or `null` when the read failed — never a partial answer. */
export async function readLedgerSince(db: Db, sinceIso: string): Promise<LedgerRow[] | null> {
  const rows: LedgerRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("mms_refunds")
      .select("order_id,order_item_id,amount_cents,tender,created_at")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return null;
    const page = (data ?? []) as {
      order_id: string;
      order_item_id: string | null;
      amount_cents: number;
      tender: string | null;
      created_at: string;
    }[];
    for (const r of page)
      rows.push({
        orderId: r.order_id,
        orderItemId: r.order_item_id,
        amountCents: r.amount_cents,
        // The column is `not null default 'card'`, so this coalesce is belt: a row read through an
        // older generated type would otherwise net a cash refund into nothing.
        tender: r.tender ?? "card",
        createdAt: r.created_at,
      });
    if (page.length < PAGE) break;
  }
  return rows;
}

/**
 * The LATEST refund instant per order, from rows already read. Pure, so the ranking the settled list
 * depends on can be falsified by a value instead of a database.
 */
export function latestRefundByOrder(rows: LedgerRow[]): Map<string, string> {
  const latest = new Map<string, string>();
  for (const r of rows) {
    const prev = latest.get(r.orderId);
    if (prev === undefined || Date.parse(r.createdAt) > Date.parse(prev))
      latest.set(r.orderId, r.createdAt);
  }
  return latest;
}

/**
 * M218 — what the DRAWER paid out today: the sum of the CASH rows only.
 *
 * A card refund goes back through the processor and never touches the till, so folding it in here
 * would under-report the drawer by exactly the card refunds — a manager counting cash against this
 * figure would come up long and have no way to see why.
 */
export function cashRefundedCents(rows: LedgerRow[]): number {
  return rows.reduce((a, r) => (r.tender === "cash" ? a + r.amountCents : a), 0);
}
