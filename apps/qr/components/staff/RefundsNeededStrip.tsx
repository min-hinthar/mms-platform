"use client";
import { type CSSProperties } from "react";
import { resolveRefundNeeded, type RefundNeeded } from "@/lib/approvals";
import type { StaffLang } from "@/lib/staff-lang";
import { al, sx } from "@/lib/staff-labels";
import { ts } from "@/lib/i18n/staff";
import { plural } from "@/lib/i18n/fill";
import { Chrome } from "./Chrome";

/**
 * A4·3 — the refunds-needed strip (W11 / M43), moved from `/staff/approvals` onto the counter's one
 * screen as the first of the manager rails. Every row is a charge (or a hold we knowingly
 * abandoned) that no order accounts for; the manager refunds it in the processor's dashboard and
 * marks it done here. Renders nothing when the ledger is empty; an UNREADABLE ledger says so —
 * an empty strip must MEAN empty. A client component since Codex round 2 on #283: its rows ride
 * the approvals poll (`ApprovalsBoard`), because a server-rendered strip never re-read the ledger
 * and a tablet left on the one screen hid a stranded charge the webhook wrote after load. The
 * resolve is the exported server action; the row leaves the strip only once the server confirmed.
 */
export function RefundsNeededStrip({
  lang,
  refunds,
  stale = false,
  onResolved,
}: {
  lang: StaffLang;
  /** null — the ledger could not be read (the page's read rejected, and no poll has since). */
  refunds: RefundNeeded[] | null;
  /** The ledger loaded once but the latest poll could not read it: the rows below are the last
   *  good ones and new stranded charges may be missing — said, never an all-clear (Codex round 3
   *  on #283). */
  stale?: boolean;
  /** The server confirmed the row resolved: drop it and re-poll. */
  onResolved?: (id: string) => void;
}) {
  if (refunds === null)
    return (
      <p style={outageText}>
        <Chrome lang={lang} k="table.appr.refunds.outage" echo="stack" />
      </p>
    );
  const staleLine = stale ? (
    <p style={outageText}>
      <Chrome lang={lang} k="table.appr.refunds.stale" echo="stack" />
    </p>
  ) : null;
  if (refunds.length === 0) return staleLine;
  return (
    <section aria-label={sx(lang, "table.appr.a11y.refunds")} style={refundsStrip}>
      {staleLine}
      <p style={refundsHead}>
        <strong>
          <Chrome
            lang={lang}
            k={plural(refunds.length, "table.appr.refunds.one", "table.appr.refunds.many")}
            vars={{ n: refunds.length }}
            echo="inline"
          />
        </strong>{" "}
        <Chrome
          lang={lang}
          k="table.appr.refundsHint"
          vars={{ x: ts(lang, "table.appr.stripe") }}
          echo="stack"
        />
      </p>
      <ul role="list" aria-label={sx(lang, "table.appr.a11y.refundsList")} style={refundsList}>
        {refunds.map((r) => (
          <li key={r.id} style={refundsRow}>
            <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
              {r.amountCents != null ? (
                `$${(r.amountCents / 100).toFixed(2)}`
              ) : (
                <Chrome lang={lang} k="table.appr.amountUnknown" />
              )}
            </span>{" "}
            {/* ⚠️ `r.reason` is the RAW `qr_refunds_needed.reason` column with its underscores
                swapped for spaces — a database status key printed to a manager, which is the
                OPEN-ITEMS P2g shape (a raw key where a label belongs). It is NOT localized here
                on purpose: guessing a Burmese word per undeclared code would invent a label,
                and the fix is a `what.*`-style key map over the column's real domain. Filed. */}
            · {r.reason.replaceAll("_", " ")} ·{" "}
            <code style={{ fontSize: "var(--fs-xs)", overflowWrap: "anywhere" }}>
              {r.paymentIntent}
            </code>
            <form
              action={async () => {
                // The server action throws on an unreadable table — the row then stays, honestly.
                await resolveRefundNeeded(r.id);
                onResolved?.(r.id);
              }}
              style={{ display: "inline-block", marginLeft: 8 }}
            >
              {/* Every row shows the same two words, so the visible label alone names nothing —
                  the name carries the payment intent, which is what the manager matches against
                  the processor. `al()` takes the same `echo` this button renders and composes
                  through `chromeVisible()`, so under `my` the name contains both visible strings
                  (WCAG 2.5.3); rule 3c compares the two echoes. */}
              <button
                type="submit"
                style={resolveBtn}
                aria-label={
                  al(lang, {
                    kind: "verb",
                    echo: "stack",
                    verb: "table.appr.verb.markRefunded",
                    subject: r.paymentIntent,
                  }).aria
                }
              >
                <Chrome lang={lang} k="table.appr.verb.markRefunded" echo="stack" />
              </button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}

const refundsStrip: CSSProperties = {
  // The staff boards' existing warn pair — theme-aware, per the tokens-never-hex rule.
  border: "1px solid var(--warn)",
  borderRadius: 12,
  padding: "var(--s3) var(--s4)",
  marginTop: "var(--s6)",
  background: "var(--warnb)",
};
const outageText: CSSProperties = {
  margin: "var(--s6) 0 0",
  fontSize: "var(--fs-sm)",
  color: "var(--warn)",
};
const resolveBtn: CSSProperties = {
  minHeight: 44,
  padding: "0 var(--s3)",
  borderRadius: 10,
  border: "1px solid var(--warn)",
  background: "transparent",
  color: "var(--warn)",
  fontWeight: 700,
  cursor: "pointer",
};
const refundsHead: CSSProperties = { margin: 0, marginBottom: 8 };
const refundsList: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: 6,
};
const refundsRow: CSSProperties = { fontSize: "var(--fs-sm)" };
