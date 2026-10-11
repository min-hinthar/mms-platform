"use client";
import type { TableDetail } from "@/lib/floor-types";
import { padReceiptRows } from "@/lib/order-pad";
import { dollars } from "@/lib/receipt-view";
import { receiptRowKey } from "@/lib/settled-view";
import { sx } from "@/lib/staff-labels";
import type { StaffLang } from "@/lib/staff-lang";
import { Chrome } from "./Chrome";

/**
 * Phase 3d · counter (§28) — the guest receipt's rows over the server's own breakdown (Subtotal ·
 * Discount · Tax · Total, `padReceiptRows` → `buildReceiptRows`); the Total IS `settleTotalCents`,
 * the figure Take cash names — never recomputed. No stack before a read priced the order; "—" on
 * every row while anything is pending (§23, the dock's own predicate). A list, not a region.
 *
 * PD6 (K44) — ONE component, read by the pad's ticket AND the table page / pane's order card, so the
 * table page's old pre-tax "subtotal so far" beside a tax-inclusive "Take cash · $X" (two bases on
 * one screen) is gone the same way the pad's went.
 */
export function ReceiptStack({
  lang,
  detail,
  amountsSettled,
  className,
}: {
  lang: StaffLang;
  detail: Pick<TableDetail, "settleBreakdown" | "settleTotalCents">;
  /** Nothing is pending: the amounts may be named. */
  amountsSettled: boolean;
  className?: string;
}) {
  const receipt = padReceiptRows(detail);
  if (!receipt) return null;
  return (
    <ul
      role="list"
      className={["pad-receipts", className].filter(Boolean).join(" ")}
      aria-label={sx(lang, "floor.settled.a11y.rows")}
    >
      {receipt.map((r) => {
        const k = receiptRowKey(r);
        return (
          <li
            key={r.key}
            className="pad-receipt"
            data-row={r.key}
            data-grand={r.grand ? "" : undefined}
          >
            {/* An unmapped row prints its own English label — never an invented word. */}
            <span>{k ? <Chrome lang={lang} k={k} echo="inline" /> : r.label}</span>
            <span className="pad-leader" aria-hidden="true" />
            <span className="pad-receipt-amt">
              {amountsSettled ? (r.negative ? "−" : "") + dollars(r.amountCents) : "—"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
