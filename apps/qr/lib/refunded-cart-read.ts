import "server-only";
import type { serviceClient } from "@mms/db/server";
import { chunkIds } from "./kitchen-stop-read";
import { queueEmptiness } from "./queue-window";
import type { LineRefunds, RefundOrderRow } from "./refunded-cart";

/**
 * #360 (the blind pass, CRITICAL 1) — the LINE LEDGER the three staff readers (the KDS, the floor
 * card, the table page's paid round) tag a refunded cart by: `foodRefundedInFull`'s arm (b), "every
 * line of the order has a line refund". Server-only, and NOT a `"use server"` module; each reader
 * calls it behind its own staff gate, with the service-role client.
 *
 * ONE batched read per reader, never per order: each order's `qr_order_items` ids and the ledger's
 * line rows (`mms_refunds`), by `order_id`, in IN-lists of at most `REFUND_ID_CHUNK` run in parallel
 * (an IN-list of 200 uuids is ~7.8 KB of URL, against a gateway limit nobody has measured).
 *
 * Only for an order that can need it: `paid`, with money back (`refunded_cents > 0`). A `refunded`
 * order is decided by its status (arm a), and an order with nothing refunded has no ledger row —
 * every ledger insert raises `refunded_cents` in the same transaction (`foodRefundedInFull`'s
 * docblock) — so a night with no refund reads nothing more than it did.
 *
 * It fails OPEN, like the boards' other advisory reads: a failed or thrown leg, or a chunk that
 * comes back AT `LINE_REFUND_ROW_CAP` (PostgREST's `max_rows` truncates silently, and a missing line
 * would make "every line refunded" true of the lines that came back), answers `null` and logs. The
 * tag is then decided by the order row alone (arms a and c) — never a partial ledger read as whole.
 */
type Db = ReturnType<typeof serviceClient>;

/** The order ids ONE request asks for. */
export const REFUND_ID_CHUNK = 50;
/** The rows ONE chunk's request takes: PostgREST's `max_rows` (`supabase/config.toml`). A chunk that
 *  comes back at it cannot say it is whole. */
export const LINE_REFUND_ROW_CAP = 1000;

export async function readLineRefunds(
  db: Db,
  orders: readonly RefundOrderRow[],
  tag: string,
): Promise<LineRefunds | null> {
  const ids = [
    ...new Set(
      orders.filter((o) => o.status === "paid" && (o.refunded_cents ?? 0) > 0).map((o) => o.id),
    ),
  ];
  if (ids.length === 0) return { itemsByOrder: new Map(), refundedLines: new Set() };
  try {
    const chunks = chunkIds(ids, REFUND_ID_CHUNK);
    const [itemReads, ledgerReads] = await Promise.all([
      Promise.all(
        chunks.map((chunk) =>
          db
            .from("qr_order_items")
            .select("id,order_id,fulfillment")
            .in("order_id", chunk)
            .limit(LINE_REFUND_ROW_CAP),
        ),
      ),
      Promise.all(
        chunks.map((chunk) =>
          db
            .from("mms_refunds")
            .select("order_id,order_item_id")
            .in("order_id", chunk)
            .limit(LINE_REFUND_ROW_CAP),
        ),
      ),
    ]);
    const failed = [...itemReads, ...ledgerReads].find((r) => r.error)?.error;
    if (failed) {
      console.error(`[${tag}] line-refund read failed — a refund is tagged by the order alone`, {
        message: failed.message,
      });
      return null;
    }
    const reads = [...itemReads, ...ledgerReads];
    if (
      reads.some((r) => queueEmptiness((r.data ?? []).length, LINE_REFUND_ROW_CAP) === "cannot-say")
    ) {
      console.error(`[${tag}] line-refund read saturated — a refund is tagged by the order alone`, {
        cap: LINE_REFUND_ROW_CAP,
      });
      return null;
    }
    const itemsByOrder = new Map<string, string[]>();
    for (const i of itemReads.flatMap((r) => r.data ?? [])) {
      // #360 (Codex P2) — the DISHES only: the kitchen's question is "was every dish refunded?", and a
      // grocery line is goods handed over, never cooked. Kept in, a mixed order with every dish
      // refunded and its grocery kept read "not every line" here, while the amount arm (below the
      // read, `foodRefundedInFull`) cannot help: the grocery's value is in the goods pool. A
      // grocery-only order holds no dish, so it has no entry and the line arm has nothing to say.
      if (i.fulfillment === "grocery") continue;
      const arr = itemsByOrder.get(i.order_id) ?? [];
      arr.push(i.id);
      itemsByOrder.set(i.order_id, arr);
    }
    const refundedLines = new Set<string>();
    for (const r of ledgerReads.flatMap((x) => x.data ?? []))
      if (r.order_item_id) refundedLines.add(r.order_item_id);
    return { itemsByOrder, refundedLines };
  } catch (e) {
    console.error(`[${tag}] line-refund read threw — a refund is tagged by the order alone`, {
      message: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}
