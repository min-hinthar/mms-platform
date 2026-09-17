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

/**
 * The ledger's columns, and the SAME LIST one column short.
 *
 * ⚠️ `tender` does not exist until M218's migration is applied, and this repo deploys the app FIRST
 * (merge ships Vercel; the migration is applied by hand afterwards, because the QR prod history is
 * divergent). PostgREST rejects the WHOLE query for one unknown column — 42703, HTTP 400, no rows —
 * so in that window an unconditional `tender` select does not degrade, it FAILS, and both callers
 * turn a failed read into `outage`: the settled list goes dark and the register's drawer with it.
 * The `cash_not_ready` verdict written for exactly that window would then be unreachable, because
 * nobody could see the Refund control to tap it (Codex round 2 on #286, P1).
 */
const LEDGER_COLS = "id,order_id,order_item_id,amount_cents,tender,created_at";
const LEDGER_COLS_PRE_M218 = "id,order_id,order_item_id,amount_cents,created_at";

/** Postgres SQLSTATE for an undefined column, which is what PostgREST hands back verbatim. */
const UNDEFINED_COLUMN = "42703";

type Db = ReturnType<typeof serviceClient>;

/**
 * Every ledger row since `sinceIso`, or `null` when the read failed — never a partial answer.
 *
 * ⚠️ KEYSET, NOT OFFSET (Codex round 1 on #286, P2). The first draft asked for `.range(from, to)`
 * pages. Each page is its own snapshot, so a refund committing between two of them — with a
 * `created_at` that sorts BEFORE the current offset, which happens because `now()` is the
 * transaction's START time and a transaction begun earlier can commit later — shifts every row one
 * place along: a row already read comes back on the next page (the drawer counts it twice) and the
 * row that took its place is never read at all (the day loses a refund). Seeking past the last row
 * actually SEEN removes the DOUBLE-COUNT outright, because the cursor is a position in the data
 * rather than in a result set, and a row can never be handed back twice.
 *
 * The seek is composite, `(created_at, id)`, because `created_at` is not unique — two refunds in
 * the same instant would straddle the boundary and one would be dropped.
 *
 * ⚠️ IT DOES NOT MAKE THE READ ATOMIC, and an earlier draft of this comment claimed it did
 * (corrected, Codex round 3 on #286, P2). The same late-commit still hides a row from the OTHER
 * direction: a transaction that began before page 1 and commits after it carries a `created_at` at
 * or below the cursor, and every later page filters on `> cursor`, so that row is never returned by
 * this read at all. Keyset changed WHICH failure survives, not that none does — it traded a
 * double-count for a silent omission, which is the better trade on a drawer total but is not the
 * complete-read guarantee the name suggests. Closing it needs the paging to happen inside ONE
 * database snapshot, i.e. a `SECURITY DEFINER` function that returns the day in a single statement —
 * a prod migration, filed as OPEN-ITEMS M222. Until then this read is complete as of its FIRST
 * page's snapshot, and a refund that commits late lands in the next render's read.
 */
export async function readLedgerSince(db: Db, sinceIso: string): Promise<LedgerRow[] | null> {
  const rows: LedgerRow[] = [];
  let after: { createdAt: string; id: string } | null = null;
  let cols: typeof LEDGER_COLS | typeof LEDGER_COLS_PRE_M218 = LEDGER_COLS;
  for (;;) {
    let q = db.from("mms_refunds").select(cols).gte("created_at", sinceIso);
    // Top-level filters AND together, so this NARROWS the window rather than widening it.
    if (after)
      q = q.or(
        `created_at.gt."${after.createdAt}",and(created_at.eq."${after.createdAt}",id.gt."${after.id}")`,
      );
    const { data, error } = await q
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(PAGE);
    if (error) {
      // The app-first window, and ONLY that: one undefined column, on the one ask that names the
      // new one. Drop `tender` and re-ask the SAME page — nothing is skipped, because `after` has
      // not moved. Reading the pre-migration ledger as card-only is not a guess: the column and
      // `mms_refund_cash_line` land in the same migration, so before it runs there is no way for a
      // cash refund to have been recorded, and every existing row IS a card refund.
      //
      // Narrow deliberately. A real outage must still answer null — degrading a broken read into a
      // plausible-looking subset is the defect this whole module exists to prevent.
      // ⚠️ FIRST PAGE ONLY (Codex round 3 on #286, P2). A 42703 on a LATER page means the schema
      // changed underneath a read already in flight — the migration landing mid-page. Downgrading
      // there would read the rest of the day one column short while `mms_refund_cash_line` has
      // already started writing cash rows, and every one of them would coerce to `card`: real
      // drawer payouts missing from the drawer's own total. `after === null` confines the downgrade
      // to the ask that could only ever have been pre-migration, and a crossing is an outage —
      // which the next read, probing the full shape again, resolves on its own.
      if (after === null && cols === LEDGER_COLS && error.code === UNDEFINED_COLUMN) {
        cols = LEDGER_COLS_PRE_M218;
        continue;
      }
      return null;
    }
    // `as unknown as` and not a plain cast: supabase-js infers the row shape by PARSING the select
    // string as a literal type, and `cols` is a variable (it has two possible values), so the
    // inferred type is a `ParserError`, not a row. The shape below is the assertion — the same one
    // the literal select would have produced, with `tender` optional for the pre-migration ask.
    const page = (data ?? []) as unknown as {
      id: string;
      order_id: string;
      order_item_id: string | null;
      amount_cents: number;
      /** Absent entirely on the pre-migration read above, hence the coalesce below. */
      tender?: string | null;
      created_at: string;
    }[];
    for (const r of page)
      rows.push({
        orderId: r.order_id,
        orderItemId: r.order_item_id,
        amountCents: r.amount_cents,
        // The column is `not null default 'card'`, so after the migration this coalesce is belt.
        // Before it, it is load-bearing: the pre-M218 select does not ask for `tender` at all, and
        // every row it returns is a card refund by construction.
        tender: r.tender ?? "card",
        createdAt: r.created_at,
      });
    if (page.length < PAGE) break;
    const last = page[page.length - 1]!;
    after = { createdAt: last.created_at, id: last.id };
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
